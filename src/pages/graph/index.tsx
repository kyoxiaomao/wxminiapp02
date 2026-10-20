import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Canvas, ScrollView, CoverView, CoverImage, Image, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import classnames from 'classnames';
import { useStoreVersion } from '@/store/useStoreVersion';
import { store } from '@/store';
import { GRAPH_PRESETS } from '@/mock/presets';
import { uploadFile } from '@/services/cloud';
import { GRAPH_TYPE_LABELS, DEFAULT_MY_CARD_NAME, type GraphType, type RelationType, type GraphNode, type Card } from '@/types';
import { ForceGraph, type ForceLink, type ForceNode } from '@/utils/forceGraph';
import { inferGender } from '@/utils/avatarPainter';
import { dbg } from '@/utils/graphDebug';
import Avatar from '@/components/Avatar';
import styles from './index.module.scss';

/** 节点头像半径（应用户要求比 demo 的 26 加大约 30%） */
const R_NODE = 34;

/** 姓名是否算「未填」：为空或还是首登占位名 */
const isNameBlank = (v?: string) => !v || !v.trim() || v === DEFAULT_MY_CARD_NAME;

/** 无名片姓名时圈内显示的占位名 */
const UNNAMED = '未命名';

/** 圈内显示名：有真实姓名显示姓名，空姓名/占位名/没关联名片都显示「未命名」 */
const nameText = (card?: Card) => (card && !isNameBlank(card.name) ? card.name.trim() : UNNAMED);

/** 节点显示名：显示关联名片的姓名（无独立昵称概念） */
const nameOfNode = (n: GraphNode) => nameText(store.getCardOfNode(n.id));

/** 节点是否「未完善」：我的节点 且 无姓名 且 无头像 */
const isNodeIncomplete = (n: GraphNode) => {
  if (!n.cardId || n.cardId !== store.getMyCard()?.id) return false;
  const card = store.getCard(n.cardId);
  return isNameBlank(card?.name) && !card?.avatar;
};
/** 触摸位移超过该值判定为拖动（非点击） */
const TAP_SLOP = 6;
/** 取景缩放下限：内容再多也不缩到全览，允许边缘节点留在屏幕外 */
const FIT_K_MIN = 0.62;
/** 长按触发时长 */
const LONG_PRESS_MS = 500;
/** 长按操作按钮半径（屏幕像素，世界坐标按缩放反算） */
const BTN_R = 13;

const TYPE_EMOJI: Record<GraphType, string> = {
  family: '👪',
  company: '🏢',
  customer: '🤝',
  cars: '🚗',
  fish: '🎣',
  custom: '🕸️'
};

/** 新建面板可选的图谱类型 */
const GRAPH_TYPES: GraphType[] = ['family', 'company', 'customer', 'cars', 'fish', 'custom'];

interface CanvasEnv {
  canvas: any;
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  dpr: number;
  /** canvas 相对视口的偏移（触摸坐标换算用） */
  left: number;
  top: number;
}

interface PinchState {
  d: number;
  k: number;
  mid: { x: number; y: number };
  center: { x: number; y: number };
}

interface TouchPoint {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

interface LinkMode {
  step: 1 | 2;
  first: string;
}

/** 亲子类关系标签 → parent 边类型 */
const PARENT_LABELS = ['父子', '母子', '父女', '母女', '兄弟', '姐妹', '兄妹', '姐弟', '儿子', '女儿'];
const COLLEAGUE_LABELS = ['上级', '下级', '同事', '合伙人', '客户对接', '负责人', '对接人', '合作伙伴', '转介绍'];
const FRIEND_LABELS = ['车友', '会长', '队友', '同行', '钓友', '领队', '同伴', '好友', '朋友', '相识', '同学', '邻居'];

function relationTypeOf(label: string): RelationType {
  if (label.includes('夫妻') || label.includes('配偶')) return 'spouse';
  if (PARENT_LABELS.some(k => label.includes(k))) return 'parent';
  if (COLLEAGUE_LABELS.some(k => label.includes(k))) return 'colleague';
  if (FRIEND_LABELS.some(k => label.includes(k))) return 'friend';
  return 'custom';
}

/** 称谓药丸宽度自适应：按字数估算（CJK 11px/字，西文约 6.5px），再加 20px 内边距余量 */
function tagInputWidth(text: string): string {
  const t = text || '填写称谓'; // 空值按 placeholder 撑开
  let w = 0;
  for (let i = 0; i < t.length; i++) w += t.charCodeAt(i) > 255 ? 11 : 6.5;
  return `${Math.ceil(w) + 20}px`;
}

/** 双端兼容取 Canvas 节点（微信走 selectorQuery node，H5 回退 DOM） */
function resolveCanvas(selector: string): Promise<{ canvas: any; width: number; height: number } | null> {
  return new Promise(resolve => {
    const query = Taro.createSelectorQuery();
    query.select(selector).fields({ node: true, size: true }).exec(res => {
      const r = res && res[0];
      if (r && r.node) {
        resolve({
          canvas: r.node,
          width: Number(r.width) || 300,
          height: Number(r.height) || 300
        });
        return;
      }
      if (process.env.TARO_ENV === 'h5') {
        const dom = document.getElementById(selector.replace(/^#/, '')) as HTMLCanvasElement | null;
        if (dom) resolve({ canvas: dom, width: dom.clientWidth || 300, height: dom.clientHeight || 300 });
        else resolve(null);
        return;
      }
      resolve(null);
    });
  });
}

function queryRect(selector: string): Promise<{ left: number; top: number }> {
  return new Promise(resolve => {
    const query = Taro.createSelectorQuery();
    query.select(selector).boundingClientRect().exec(res => {
      const r = res && res[0];
      if (r && typeof r.left === 'number' && typeof r.top === 'number') {
        resolve({ left: r.left, top: r.top });
      } else {
        resolve({ left: 0, top: 0 });
      }
    });
  });
}

function nowStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 图谱 Tab：进入即画布（S4 核心，index.html 交互移植）
 * 工具栏/面板/详情卡均为文档流区域（不与原生 Canvas 重叠，规避原生组件层级问题），
 * 下拉菜单位于顶部中间，展开时画布自动下让。
 */
const GraphPage: React.FC = () => {
  const version = useStoreVersion();
  const [graphId, setGraphId] = useState<string>(() => store.listGraphs()[0]?.id || '');

  const graph = store.getGraph(graphId);
  const isFamily = graph?.type === 'family';

  // ---------- React 状态（低频 UI） ----------
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, setLinkMode] = useState<LinkMode | null>(null);
  const [graphMenuOpen, setGraphMenuOpen] = useState(false);
  // 新建图谱面板：头像 / 名称 / 类型 一体化编辑
  const [createOpen, setCreateOpen] = useState(false);
  const [createAvatar, setCreateAvatar] = useState('');
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState<GraphType>('family');
  const [createTypeLabel, setCreateTypeLabel] = useState('');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);

  // ---------- 引擎 / 画布 / 手势（高频，走 ref） ----------
  const engineRef = useRef<ForceGraph | null>(null);
  const envRef = useRef<CanvasEnv | null>(null);
  const rafRef = useRef<{ id: number; cancel: (id: number) => void } | null>(null);
  const viewRef = useRef({ k: 0.62, center: { x: 0, y: 0 } });
  const framesRef = useRef(0);
  const touchesRef = useRef(new Map<number, TouchPoint>());
  const dragNodeRef = useRef<ForceNode | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const panStartRef = useRef<{ cx: number; cy: number; px: number; py: number } | null>(null);
  const movedRef = useRef(false);
  const downNodeIdRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const linkModeRef = useRef<LinkMode | null>(null);
  // 长按节点操作（＋ 添加 / － 删除）
  const actionTargetRef = useRef<string | null>(null);
  const actionBornRef = useRef(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActiveRef = useRef(false);
  // 新生成的空白节点落位锚点（版本同步重建后放置到锚点旁）
  const pendingSpawnRef = useRef<{ anchorId: string; nodeId: string } | null>(null);
  // 节点头像位图缓存：key=名片头像地址；加载中的地址先入 loading 集合防重复加载；
  // 加载失败的地址入 failed 集合，避免绘制循环里每帧重试刷爆日志
  const avatarImgsRef = useRef(new Map<string, HTMLImageElement>());
  const avatarLoadingRef = useRef(new Set<string>());
  const avatarFailedRef = useRef(new Set<string>());
  // cloud:// fileID → 临时 https 地址缓存（canvas Image 不识别 fileID，会当相对路径请求 500）
  const avatarUrlCacheRef = useRef(new Map<string, string>());
  // 重绘脏标记：物理沉降后空闲帧跳过 tick+draw，交互/状态变化时置脏重绘一帧
  const dirtyRef = useRef(true);
  // 背景渐变缓存：尺寸不变时复用，避免每帧 createRadialGradient
  const bgGradRef = useRef<{ grad: CanvasGradient; W: number; H: number } | null>(null);

  /** 头像地址预处理：cloud:// fileID 先换临时链接（Image/Canvas 仅原生 image 组件认识 fileID） */
  const resolveAvatarUrl = async (src: string): Promise<string | null> => {
    if (!src.startsWith('cloud://')) return src;
    const cached = avatarUrlCacheRef.current.get(src);
    if (cached) return cached;
    try {
      const res = await Taro.cloud.getTempFileURL({ fileList: [src] });
      const url = res.fileList?.[0]?.tempFileURL || '';
      if (!url) return null;
      avatarUrlCacheRef.current.set(src, url);
      return url;
    } catch (err) {
      console.error('[GraphCanvas] 头像临时链接换取失败:', err);
      return null;
    }
  };

  /** 确保节点头像位图已加载，加载完成后由渲染循环下一帧自动呈现 */
  const ensureAvatarImg = (src: string) => {
    if (avatarImgsRef.current.has(src) || avatarLoadingRef.current.has(src)) return;
    if (avatarFailedRef.current.has(src)) return;
    avatarLoadingRef.current.add(src);
    const finish = (img: HTMLImageElement | null) => {
      avatarLoadingRef.current.delete(src);
      if (img) {
        avatarImgsRef.current.set(src, img);
        dirtyRef.current = true; // 空闲停绘期间头像到位，置脏补一帧
        dbg('avatarOk', { src });
      } else {
        avatarFailedRef.current.add(src);
        dbg('avatarLoadFail', { src });
      }
    };
    void (async () => {
      const url = await resolveAvatarUrl(src);
      if (!url) {
        finish(null);
        return;
      }
      try {
        const canvas = envRef.current?.canvas;
        if (process.env.TARO_ENV !== 'h5' && canvas?.createImage) {
          // 微信 canvas 2d：createImage 返回的 Image 带 width/height
          const im = canvas.createImage();
          im.onload = () => finish(im as unknown as HTMLImageElement);
          im.onerror = () => finish(null);
          im.src = url;
        } else if (typeof document !== 'undefined') {
          const im = new Image();
          im.onload = () => finish(im);
          im.onerror = () => finish(null);
          im.src = url;
        } else {
          finish(null);
        }
      } catch (_) {
        finish(null);
      }
    })();
  };
  const statusBarH = useMemo(() => {
    try {
      return Taro.getSystemInfoSync().statusBarHeight || 20;
    } catch (_) {
      return 20;
    }
  }, []);

  const graphName = graph?.name || '图谱';

  // ---------- 以「我」为中心：ego 节点（布局中心用） ----------
  const egoNodeId = useMemo(() => {
    const myCardId = store.getMyCard()?.id;
    if (!myCardId) return '';
    return store.listNodes(graphId).find(n => n.cardId === myCardId)?.id || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphId, version]);
  const egoIdRef = useRef('');
  egoIdRef.current = egoNodeId;

  // ---------- 数据 → 引擎输入（gid 显式传入，避免切图谱时读到旧闭包值） ----------
  const buildInputs = (gid: string = graphId) => {
    return {
      nodes: store.listNodes(gid).map(n => {
        const card = store.getCardOfNode(n.id);
        return {
          id: n.id,
          // 圈内显示名：真实姓名或「未命名」
          name: nameText(card),
          role: n.role,
          gen: n.gen,
          gender: inferGender(n.role, n.id),
          hasAvatar: !!card?.avatar,
          avatar: card?.avatar || '',
          // 资料未完善：我的节点且没有姓名、也没有头像时，圈内名字下方红字提示
          incomplete: isNodeIncomplete(n),
          // 布局持久化（B 方案）：引擎构造时优先恢复保存的坐标/pin
          x: n.x,
          y: n.y,
          pinned: n.pinned
        };
      }),
      links: store.listEdges(gid).map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type,
        label: e.label
      }))
    };
  };

  // ---------- 视口换算 ----------
  const toWorld = (px: number, py: number) => {
    const env = envRef.current!;
    const view = viewRef.current;
    const vw = env.W / view.k;
    const vh = env.H / view.k;
    return {
      x: view.center.x - vw / 2 + (px - env.left) * (vw / env.W),
      y: view.center.y - vh / 2 + (py - env.top) * (vh / env.H)
    };
  };

  const hitTest = (px: number, py: number): ForceNode | null => {
    const env = envRef.current!;
    const engine = engineRef.current;
    if (!engine) return null;
    const r = R_NODE * viewRef.current.k + 10; // 屏幕空间容差
    let best: ForceNode | null = null;
    let bestD = r;
    engine.nodes.forEach(n => {
      const sx = (n.x - viewRef.current.center.x) * viewRef.current.k + env.W / 2;
      const sy = (n.y - viewRef.current.center.y) * viewRef.current.k + env.H / 2;
      const d = Math.hypot(sx - (px - env.left), sy - (py - env.top));
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    });
    return best;
  };

  // ---------- 长按操作（＋ 添加空白节点 / － 删除节点） ----------
  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  /** 长按目标节点的两个操作按钮（＋/－）中心坐标（画布内屏幕坐标） */
  const actionButtonsOf = (id: string): Array<{ key: 'add' | 'del'; x: number; y: number }> => {
    const env = envRef.current;
    const engine = engineRef.current;
    const n = engine?.nodeById(id);
    if (!env || !engine || !n) return [];
    const k = viewRef.current.k;
    const cx = (n.x - viewRef.current.center.x) * k + env.W / 2;
    const cy = (n.y - viewRef.current.center.y) * k + env.H / 2;
    const dist = R_NODE * k + BTN_R + 12;
    const d = dist * Math.SQRT1_2;
    return [
      { key: 'add', x: cx + d, y: cy - d },
      { key: 'del', x: cx + d, y: cy + d }
    ];
  };

  /** 命中长按操作按钮（tap 坐标为视口坐标） */
  const hitActionButton = (px: number, py: number): 'add' | 'del' | null => {
    const env = envRef.current;
    const id = actionTargetRef.current;
    if (!env || !id) return null;
    const x = px - env.left;
    const y = py - env.top;
    for (const b of actionButtonsOf(id)) {
      if (Math.hypot(b.x - x, b.y - y) <= BTN_R + 5) return b.key;
    }
    return null;
  };

  /** 收起长按按钮（长按期间临时钉住的节点解除临时 pin，继续参与力学） */
  const dismissActionButtons = () => {
    const id = actionTargetRef.current;
    actionTargetRef.current = null;
    dirtyRef.current = true; // 按钮消失立即重绘
    if (id) {
      const n = engineRef.current?.nodeById(id);
      if (n) n.pinned = false;
    }
  };

  /** 命中关系标签（以连线中点为圆心，屏幕半径 18px） */
  const hitEdgeLabel = (px: number, py: number): ForceLink | null => {
    const env = envRef.current;
    const engine = engineRef.current;
    if (!env || !engine) return null;
    const view = viewRef.current;
    const x = px - env.left;
    const y = py - env.top;
    let best: ForceLink | null = null;
    let bestD = 18;
    engine.links.forEach(l => {
      const mx = ((l.s.x + l.t.x) / 2 - view.center.x) * view.k + env.W / 2;
      const my = ((l.s.y + l.t.y) / 2 - view.center.y) * view.k + env.H / 2;
      const d = Math.hypot(mx - x, my - y);
      if (d < bestD) {
        best = l;
        bestD = d;
      }
    });
    return best;
  };

  /** 编辑关系：修改标签（长按生成的边默认「关系」，点击标签改写） */
  const editEdge = (link: ForceLink) => {
    void Taro.showModal({ title: '修改关系', editable: true, placeholderText: link.label }).then(m => {
      if (!m.confirm) return;
      const text = (m.content || '').trim();
      if (text && text !== link.label) {
        store.updateEdge(link.id, { label: text, type: relationTypeOf(text) });
        Taro.showToast({ title: '已修改', icon: 'none' });
      }
    });
  };

  /** 在锚点节点旁生成空白节点并连一条「关系」边（标签可点击编辑） */
  const addBlankNode = (anchorId: string) => {
    const node = store.createNode({ graphId, cardId: null, role: '成员' });
    store.createEdge({ graphId, source: anchorId, target: node.id, type: 'custom', label: '关系' });
    pendingSpawnRef.current = { anchorId, nodeId: node.id };
    Taro.vibrateShort({ type: 'light' });
  };

  /** 删除节点（含其全部关系），二次确认 */
  const confirmDeleteNode = (nodeId: string) => {
    const n = store.getNode(nodeId);
    if (!n) return;
    Taro.showModal({
      title: '删除成员',
      content: `删除「${nameOfNode(n)}」及其所有关系？`,
      confirmColor: '#f53f3f',
      success: res => {
        if (res.confirm) {
          store.deleteNode(nodeId);
          Taro.showToast({ title: '已删除', icon: 'none' });
        }
      }
    });
  };

  // ---------- 取景（以「我」为中心；无 ego 时全览，保底缩放允许节点出屏） ----------
  const fitView = () => {
    const env = envRef.current;
    const engine = engineRef.current;
    if (!env || !engine) return;
    let k: number;
    let cx: number;
    let cy: number;
    const ego = egoIdRef.current ? engine.nodeById(egoIdRef.current) : undefined;
    if (ego) {
      // 初始中心点 = 我的头像节点
      k = 0.8;
      cx = ego.x;
      cy = ego.y;
    } else {
      const b = engine.bounds();
      const padX = 40;
      const padTop = 20;
      const padBottom = 20;
      const bw = Math.max(60, b.maxX - b.minX) || 60;
      const bh = Math.max(60, b.maxY - b.minY) || 60;
      const kx = (env.W - padX * 2) / bw;
      const ky = (env.H - padTop - padBottom) / bh;
      k = Math.min(kx, ky);
      if (!(k > 0)) k = FIT_K_MIN;
      // 保底缩放：节点较多时不缩到全览，边缘节点留在屏幕外（拖动/缩放可看）
      k = Math.max(FIT_K_MIN, Math.min(1.3, k));
      cx = (b.minX + b.maxX) / 2 || 0;
      cy = (b.minY + b.maxY) / 2 || 0;
    }
    // 瞬时取景（用户拍板去掉收敛后二次取景动画：画面不再跳动/漂移）
    viewRef.current.k = k;
    viewRef.current.center.x = cx;
    viewRef.current.center.y = cy;
    dirtyRef.current = true;
  };

  // ---------- 画布尺寸同步（面板/卡片开合导致布局变化后调用） ----------
  // 注意：只更新位图尺寸与触摸偏移，绝不动视口（viewRef）——
  // 否则每次卡片开合都会把用户当前的平移/缩放状态重置回初始取景
  // 真机教训：切页动画期间 selectorQuery 拿不到画布节点（resizeSkip），
  // 若就此放弃，env 尺寸会滞留旧值 → 位图被拉伸 + hitTest 全部落空（表现为整页卡死）。
  const resizeRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeRetryCountRef = useRef(0);
  const resizeCanvas = () => {
    void (async () => {
      const env = envRef.current;
      if (!env) return;
      const res = await resolveCanvas('#graphCanvas');
      if (!res || res.width < 10 || res.height < 10) {
        dbg('resizeSkip', { w: res?.width ?? null, h: res?.height ?? null });
        // 页面隐藏/过渡中查询失败：退避重试（上限 3 次），回可见后必然拿到真实尺寸
        if (resizeRetryCountRef.current < 3) {
          resizeRetryCountRef.current += 1;
          if (resizeRetryRef.current) clearTimeout(resizeRetryRef.current);
          resizeRetryRef.current = setTimeout(resizeCanvas, 250);
        }
        return;
      }
      resizeRetryCountRef.current = 0;
      if (resizeRetryRef.current) {
        clearTimeout(resizeRetryRef.current);
        resizeRetryRef.current = null;
      }
      const dpr = Taro.getSystemInfoSync().pixelRatio || 2;
      env.canvas.width = res.width * dpr;
      env.canvas.height = res.height * dpr;
      env.W = res.width;
      env.H = res.height;
      const rect = await queryRect('#graphCanvas');
      env.left = rect.left;
      env.top = rect.top;
      dirtyRef.current = true; // 改位图尺寸会清空画布，必须置脏补一帧
      dbg('resize', { w: res.width, h: res.height, left: rect.left, top: rect.top });
    })();
  };

  // 详情卡 / 新建面板 开合后同步画布尺寸（药丸面板为悬浮层，不影响画布高度）。
  // 关键：容器 CSS 高度变化是即时的，位图若不同步会被拉伸（圆变椭圆）——
  // 因此在 50/150/400ms 各校准一次：首次尽快贴合新尺寸，后两次兜底布局稳定值。
  const layoutKey = `${selectedId ? 1 : 0}|${createOpen ? 1 : 0}`;
  useEffect(() => {
    if (!envRef.current) return; // 初始化前不处理
    const timers = [50, 150, 400].map(ms => setTimeout(resizeCanvas, ms));
    return () => timers.forEach(t => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // ---------- 绘制 ----------
  const draw = () => {
    const env = envRef.current;
    const engine = engineRef.current;
    if (!env || !engine) return;
    const { ctx, W, H, dpr } = env;
    const view = viewRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 背景径向渐变（缓存复用：每帧 createRadialGradient 是纯浪费，仅尺寸变化时重建）
    let bg = bgGradRef.current;
    if (!bg || bg.W !== W || bg.H !== H) {
      const grad = ctx.createRadialGradient(W * 0.5, H * 0.38, 0, W * 0.5, H * 0.38, Math.max(W, H) * 0.75);
      grad.addColorStop(0, '#e4d8e8');
      grad.addColorStop(0.62, '#d9c9dd');
      grad.addColorStop(1, '#cdb9d3');
      bg = { grad, W, H };
      bgGradRef.current = bg;
    }
    ctx.fillStyle = bg.grad;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(view.k, view.k);
    ctx.translate(-view.center.x, -view.center.y);

    const sel = selectedRef.current;
    const nb = sel ? engine.neighborsOf(sel) : null;

    // 连线
    ctx.lineCap = 'round';
    engine.links.forEach(l => {
      const on = !nb || l.source === sel || l.target === sel;
      ctx.globalAlpha = nb && !on ? 0.12 : 1;
      ctx.strokeStyle = '#8e44ad';
      ctx.lineWidth = l.type === 'spouse' ? 2.6 : 1.9;
      ctx.beginPath();
      ctx.moveTo(l.s.x, l.s.y);
      ctx.lineTo(l.t.x, l.t.y);
      ctx.stroke();
    });

    // 连线标签（白底圆角 rect + 随线角度翻转保持正读）
    ctx.font = '600 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    engine.links.forEach(l => {
      const on = !nb || l.source === sel || l.target === sel;
      ctx.globalAlpha = nb && !on ? 0.12 : 1;
      const mx = (l.s.x + l.t.x) / 2;
      const my = (l.s.y + l.t.y) / 2;
      let ang = (Math.atan2(l.t.y - l.s.y, l.t.x - l.s.x) * 180) / Math.PI;
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate((ang * Math.PI) / 180);
      const w = l.label.length * 11 + 12;
      const hh = 18;
      const rx = 6;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + rx, -hh / 2);
      ctx.arcTo(w / 2, -hh / 2, w / 2, hh / 2, rx);
      ctx.arcTo(w / 2, hh / 2, -w / 2, hh / 2, rx);
      ctx.arcTo(-w / 2, hh / 2, -w / 2, -hh / 2, rx);
      ctx.arcTo(-w / 2, -hh / 2, w / 2, -hh / 2, rx);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,.86)';
      ctx.fill();
      ctx.fillStyle = '#6d3b83';
      ctx.fillText(l.label, 0, 0.5);
      ctx.restore();
    });

    // 节点（halo → 头像照片/名字 → 描边 → 称谓）
    const drawNameCircle = (n: { x: number; y: number; name: string }) => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, R_NODE, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      const nm = n.name.length > 4 ? `${n.name.slice(0, 3)}…` : n.name;
      const fs = nm.length <= 2 ? 17 : nm.length === 3 ? 15 : 12;
      ctx.fillStyle = '#3b2a44';
      ctx.font = `700 ${fs}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nm, n.x, n.y + 1);
    };

    engine.nodes.forEach(n => {
      const isSel = n.id === sel;
      const on = !nb || nb.has(n.id);
      ctx.globalAlpha = on ? 1 : 0.22;
      if (isSel) {
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(n.x, n.y, R_NODE + 9, 0, Math.PI * 2);
        ctx.strokeStyle = '#7d3c98';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (n.hasAvatar && n.avatar) {
        // 同步名片头像：圆内绘制照片（居中裁剪铺满），位图未就绪先画名字
        ensureAvatarImg(n.avatar);
        const img = avatarImgsRef.current.get(n.avatar);
        if (img) {
          const iw = (img as unknown as { width: number }).width || 1;
          const ih = (img as unknown as { height: number }).height || 1;
          const s = (R_NODE * 2) / Math.min(iw, ih); // cover：短边贴满圆径，长边居中裁掉
          ctx.save();
          ctx.beginPath();
          ctx.arc(n.x, n.y, R_NODE, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(
            img as unknown as HTMLImageElement,
            n.x - (iw * s) / 2,
            n.y - (ih * s) / 2,
            iw * s,
            ih * s
          );
          ctx.restore();
        } else {
          drawNameCircle(n);
        }
      } else {
        // 无头像：白底圆圈内写名字
        drawNameCircle(n);
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, R_NODE, 0, Math.PI * 2);
      ctx.strokeStyle = '#7d3c98';
      ctx.lineWidth = isSel ? 5 : 3;
      ctx.stroke();
      // 资料未完善：圈内名字下方红字小提示
      if (n.incomplete) {
        ctx.fillStyle = '#f53f3f';
        ctx.font = '700 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('未完善', n.x, n.y + R_NODE * 0.5);
      }
      // 圈外只留称谓一行（以名片称谓为准，用户自行填充）
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#6d5a78';
      ctx.font = '400 11px sans-serif';
      ctx.fillText(n.role, n.x, n.y + R_NODE + 18);
    });

    // 长按节点操作按钮：＋ 添加 / － 删除（屏幕恒定尺寸，150ms 渐入）
    const atId = actionTargetRef.current;
    if (atId) {
      const target = engine.nodeById(atId);
      if (target) {
        const k = view.k;
        const age = Math.min(1, (Date.now() - actionBornRef.current) / 150);
        const off = R_NODE + 14 + BTN_R / k; // 按钮中心距节点中心（世界坐标）
        const br = BTN_R / k;
        const lw = 1.5 / k;
        const buttons = [
          { dx: Math.SQRT1_2, dy: -Math.SQRT1_2, ch: '＋', color: '#00b42a' },
          { dx: Math.SQRT1_2, dy: Math.SQRT1_2, ch: '－', color: '#f53f3f' }
        ];
        buttons.forEach(b => {
          const bx = target.x + b.dx * off;
          const by = target.y + b.dy * off;
          ctx.globalAlpha = age;
          // 连接线
          ctx.beginPath();
          ctx.moveTo(target.x + b.dx * (R_NODE + 3), target.y + b.dy * (R_NODE + 3));
          ctx.lineTo(bx - b.dx * br, by - b.dy * br);
          ctx.strokeStyle = '#b08fc4';
          ctx.lineWidth = lw;
          ctx.stroke();
          // 圆钮
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = b.color;
          ctx.lineWidth = lw;
          ctx.stroke();
          // 符号
          ctx.fillStyle = b.color;
          ctx.font = `700 ${13 / k}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(b.ch, bx, by + 0.5 / k);
          ctx.globalAlpha = 1;
        });
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  };

  // ---------- 主循环 ----------
  // 循环代数：切 tab 往返后（页面隐藏时 RAF 被节流/暂停，devtools 下可能不再恢复），
  // onShow 时用 startLoop 重启并让旧链自行失活，避免双循环叠加或循环停滞。
  const loopGenRef = useRef(0);
  const startLoop = (canvas: any) => {
    const gen = ++loopGenRef.current;
    const step = () => {
      if (gen !== loopGenRef.current) return; // 旧链已被新循环取代，停止续帧
      try {
        const engine = engineRef.current;
        if (!engine) return;
        // 沉降后停绘：物理到活动量下限且无避让在跑时不再 tick/重绘，
        // 交互/状态变化置 dirtyRef 才补一帧——静止画面零耗（发热/掉帧主因修复）
        if (!engine.settled()) {
          engine.tick();
          dirtyRef.current = true;
        } else if (actionTargetRef.current && Date.now() - actionBornRef.current < 220) {
          dirtyRef.current = true; // 长按按钮 150ms 渐入动画期间续绘
        }
        if (dirtyRef.current) {
          draw();
          dirtyRef.current = false;
          framesRef.current++;
          if (framesRef.current % 300 === 0) dbg('tick', { frames: framesRef.current }); // 心跳：日志停更=循环死亡
        }
        if (rafRef.current) rafRef.current.id = canvas.requestAnimationFrame(step);
      } catch (err) {
        dbg('loopCrash', { msg: String(err) });
      }
    };
    rafRef.current = {
      id: canvas.requestAnimationFrame(step),
      cancel: (id: number) => {
        if (typeof canvas.cancelAnimationFrame === 'function') canvas.cancelAnimationFrame(id);
        else if (typeof window !== 'undefined') window.cancelAnimationFrame(id);
      }
    };
  };

  const selectNode = (id: string) => {
    const node = store.getNode(id);
    if (!node) {
      dbg('selectFail', { id, reason: 'nodeMissing' });
      return;
    }
    // 资料未完善：单击直达名片详情补姓名（姓名输入框自动聚焦提示输入）
    if (isNodeIncomplete(node) && node.cardId) {
      dbg('selectIncomplete', { id, cardId: node.cardId });
      Taro.navigateTo({ url: `/pages/card/detail/index?id=${node.cardId}&focusName=1` });
      return;
    }
    dbg('select', { id, name: nameOfNode(node) });
    selectedRef.current = id;
    setSelectedId(id);
    dirtyRef.current = true; // 高亮/非邻接淡出立即重绘
  };

  const closeCard = () => {
    if (selectedRef.current) {
      selectedRef.current = null;
      setSelectedId(null);
      dirtyRef.current = true; // 取消高亮立即重绘
    }
  };

  // ---------- 连线模式 ----------
  const exitLinkMode = () => {
    linkModeRef.current = null;
    setLinkMode(null);
  };

  // ---------- 触摸手势（touches 数组自管理，替代 pointerId Map） ----------
  const handleTouchStart = (e: { touches: Array<{ identifier: number; clientX: number; clientY: number }> }) => {
    dbg('touchStart', { x: e.touches[0]?.clientX, y: e.touches[0]?.clientY, n: e.touches.length });
    // 僵尸触点清理：上次 touchEnd 丢失（如切页动画期间）会在 map 里留下残留 id，
    // 后续每次 tap 都会因 size===2 被误判成双指捏合（movedRef=true）→ 节点永远选不中。
    // 因此每次 touchStart 先丢弃不在本次 touches 里的旧点，并对复用 id 的点刷新起点坐标。
    const liveIds = new Set(e.touches.map(t => t.identifier));
    Array.from(touchesRef.current.keys()).forEach(id => {
      if (!liveIds.has(id)) {
        dbg('pruneStaleTouch', { id });
        touchesRef.current.delete(id);
      }
    });
    if (!envRef.current) {
      dbg('touchStartSkip', { reason: 'noEnv' });
      return;
    }
    // 点画布先收起下拉面板
    if (graphMenuOpen) {
      dbg('touchStartSkip', { reason: 'menuOpen' });
      setGraphMenuOpen(false);
      return;
    }
    e.touches.forEach(t => {
      const prev = touchesRef.current.get(t.identifier);
      if (prev) {
        if (prev.sx !== t.clientX || prev.sy !== t.clientY) {
          // 复用了未清理的旧触点（上次 touchEnd 丢失）——刷新陈旧起点
          dbg('staleTouch', { id: t.identifier, sx: prev.sx, sy: prev.sy });
        }
        touchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY });
      } else {
        touchesRef.current.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY });
      }
    });
    movedRef.current = false;
    const size = touchesRef.current.size;
    if (size === 1) {
      const t = e.touches[0];
      const hit = hitTest(t.clientX, t.clientY);
      downNodeIdRef.current = hit ? hit.id : null;
      const env = envRef.current;
      dbg('down', {
        hit: hit ? hit.id : null,
        k: viewRef.current.k,
        left: env.left,
        top: env.top,
        W: env.W,
        H: env.H
      });
      // 仅记录命中：按下不 pin、不升温——纯点击对布局零扰动（拖动时才在 move 中介入）
      dragNodeRef.current = hit;
      panStartRef.current = {
        cx: viewRef.current.center.x,
        cy: viewRef.current.center.y,
        px: t.clientX,
        py: t.clientY
      };
      // 长按节点：500ms 后弹出 ＋/－ 操作按钮
      if (hit) {
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          longPressActiveRef.current = true;
          actionTargetRef.current = hit.id;
          actionBornRef.current = Date.now();
          dirtyRef.current = true; // 按钮渐入动画起点（主循环 220ms 内续绘）
          dbg('longPress', { id: hit.id });
          hit.pinned = true; // 长按期间钉住，按钮稳定不漂
          Taro.vibrateShort({ type: 'light' });
        }, LONG_PRESS_MS);
      }
    } else if (size === 2) {
      // 双指：结束单指拖动，进入捏合
      if (dragNodeRef.current) {
        const dn = dragNodeRef.current;
        if (movedRef.current) {
          // 拖到一半改捏合：视同松手落定（只记坐标不冻结，方案 A）
          dn.pinned = false;
          store.saveNodeLayout(dn.id, dn.x, dn.y, false);
        } else {
          // 纯触碰未拖：解除临时 pin（拖动不产生持久冻结）
          dn.pinned = false;
        }
        dragNodeRef.current = null;
      }
      const pts = Array.from(touchesRef.current.values());
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchRef.current = {
        d,
        k: viewRef.current.k,
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        center: { ...viewRef.current.center }
      };
      movedRef.current = true; // 双指手势不触发节点选中
    }
  };

  const handleTouchMove = (e: { touches: Array<{ identifier: number; clientX: number; clientY: number }> }) => {
    if (!envRef.current) return;
    dirtyRef.current = true; // 拖动/平移/捏合都改变画面（平移缩放不升温，需显式置脏）
    e.touches.forEach(t => {
      const p = touchesRef.current.get(t.identifier);
      if (p) {
        p.x = t.clientX;
        p.y = t.clientY;
      }
    });
    const prevMoved = movedRef.current;
    touchesRef.current.forEach(p => {
      if (Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_SLOP) movedRef.current = true;
    });
    if (!prevMoved && movedRef.current) {
      dbg('firstMove', { drag: dragNodeRef.current?.id || null, size: touchesRef.current.size });
    }

    // 手指移动：取消长按判定；长按菜单已弹出则本次触摸不再拖动/平移
    if (movedRef.current && longPressTimerRef.current) clearLongPressTimer();
    if (longPressActiveRef.current) return;

    const size = touchesRef.current.size;
    if (size === 1 && dragNodeRef.current) {
      const drag = dragNodeRef.current;
      // 拖动分流：位移超过判定阈值才真正开始拖（对已持久 pin 的节点同样生效，纯点击零扰动）
      if (!movedRef.current) return;
      if (!drag.pinned) {
        drag.pinned = true;
        engineRef.current?.wake(0.5);
      }
      const t = e.touches[0];
      const w = toWorld(t.clientX, t.clientY);
      drag.x = w.x;
      drag.y = w.y;
      drag.vx = 0;
      drag.vy = 0;
      engineRef.current?.wake(0.35);
    } else if (size === 1 && panStartRef.current) {
      const t = e.touches[0];
      viewRef.current.center.x = panStartRef.current.cx - (t.clientX - panStartRef.current.px) / viewRef.current.k;
      viewRef.current.center.y = panStartRef.current.cy - (t.clientY - panStartRef.current.py) / viewRef.current.k;
    } else if (size === 2 && pinchRef.current) {
      const pts = Array.from(touchesRef.current.values()).slice(0, 2);
      const env = envRef.current;
      const pinch = pinchRef.current;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      let nk = pinch.k * (d / (pinch.d || 1));
      nk = Math.max(0.22, Math.min(3, nk));
      // 以按下瞬间双指中点对应的世界坐标为锚点，缩放后保持该点不漂移
      const vw0 = env.W / pinch.k;
      const vh0 = env.H / pinch.k;
      const wx = pinch.center.x - vw0 / 2 + (pinch.mid.x - env.left) * (vw0 / env.W);
      const wy = pinch.center.y - vh0 / 2 + (pinch.mid.y - env.top) * (vh0 / env.H);
      const vw1 = env.W / nk;
      const vh1 = env.H / nk;
      viewRef.current.center.x = wx - (midX - env.left) * (vw1 / env.W) + vw1 / 2;
      viewRef.current.center.y = wy - (midY - env.top) * (vh1 / env.H) + vh1 / 2;
      viewRef.current.k = nk;
    }
  };

  const handleTouchEnd = (e: { changedTouches: Array<{ identifier: number; clientX: number; clientY: number }> }) => {
    clearLongPressTimer();
    const wasLongPress = longPressActiveRef.current;
    longPressActiveRef.current = false;
    e.changedTouches.forEach(t => touchesRef.current.delete(t.identifier));
    const size = touchesRef.current.size;
    if (size === 0) {
      const drag = dragNodeRef.current;
      if (drag && movedRef.current && !wasLongPress) {
        // 拖动结束（方案 A）：只记坐标不冻结——解除临时 pin 后节点继续参与力学，
        // 邻居弹簧正常回弹；坐标防抖写云端保证重进后位置还原
        drag.pinned = false;
        engineRef.current?.wake(0.28);
        store.saveNodeLayout(drag.id, drag.x, drag.y, false);
      }
      // 点击判定：位移 < 6px 且非长按
      if (!movedRef.current && !wasLongPress) {
        const tap = e.changedTouches[0];
        // 1. 长按操作按钮（＋/－）
        const btn = hitActionButton(tap.clientX, tap.clientY);
        if (btn) {
          const targetId = actionTargetRef.current;
          dbg('tapBtn', { btn, target: targetId });
          dismissActionButtons();
          if (targetId) {
            if (btn === 'add') addBlankNode(targetId);
            else confirmDeleteNode(targetId);
          }
          return;
        }
        // 2. 已有操作按钮：点其他处收起
        if (actionTargetRef.current) {
          dbg('dismissOnly', { actionTarget: actionTargetRef.current });
          dismissActionButtons();
          return;
        }
        // 3. 关系标签：编辑/删除
        const link = hitEdgeLabel(tap.clientX, tap.clientY);
        if (link) {
          dbg('tapEdge', { id: link.id, label: link.label });
          editEdge(link);
          return;
        }
        // 4. 节点 / 空白
        const downId = downNodeIdRef.current;
        if (downId) {
          dbg('tapNode', { id: downId });
          selectNode(downId);
        } else {
          dbg('tapBlank');
          closeCard();
        }
      } else {
        dbg('endNoTap', { moved: movedRef.current, longPress: wasLongPress });
      }
      dragNodeRef.current = null;
      panStartRef.current = null;
      pinchRef.current = null;
      downNodeIdRef.current = null;
    } else if (size === 1) {
      // 双指 → 单指：结束捏合，以剩余手指重建平移基准
      pinchRef.current = null;
      const rest = Array.from(touchesRef.current.values())[0];
      panStartRef.current = {
        cx: viewRef.current.center.x,
        cy: viewRef.current.center.y,
        px: rest.x,
        py: rest.y
      };
    }
  };

  // ---------- 初始化画布（一次；graphId 切换走 rebuildEngine） ----------
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const res = await resolveCanvas('#graphCanvas');
      if (!res || disposed) {
        console.error('[GraphCanvas] Canvas 节点获取失败');
        return;
      }
      const dpr = Taro.getSystemInfoSync().pixelRatio || 2;
      res.canvas.width = res.width * dpr;
      res.canvas.height = res.height * dpr;
      const ctx = res.canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.scale(dpr, dpr);
      const rect = await queryRect('#graphCanvas');
      if (disposed) return;
      envRef.current = {
        canvas: res.canvas,
        ctx,
        W: res.width,
        H: res.height,
        dpr,
        left: rect.left,
        top: rect.top
      };
      const inputs = buildInputs();
      engineRef.current = new ForceGraph(inputs.nodes, inputs.links, undefined, { egoId: egoIdRef.current });
      console.info('[GraphCanvas] 启动：%s（节点 %d / 关系 %d）', graphName, inputs.nodes.length, inputs.links.length);
      fitView(); // 引擎建好立即取景：首屏一出画即到位，不再等 45 帧后跳位
      startLoop(res.canvas);
    })();
    return () => {
      disposed = true;
      clearLongPressTimer();
      if (resizeRetryRef.current) clearTimeout(resizeRetryRef.current);
      showResizeTimersRef.current.forEach(t => clearTimeout(t));
      if (rafRef.current) {
        rafRef.current.cancel(rafRef.current.id);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 重建引擎（切换图谱 / 拓扑变化共用）：继承旧位置、重升温；取景由调用方按需决定 */
  const rebuildEngine = (previous?: ForceGraph, forGraphId?: string) => {
    const gid = forGraphId ?? graphId;
    const inputs = buildInputs(gid);
    // ego 以目标图谱为准（切图谱时 state 尚未更新，不能用闭包里的旧 graphId）
    const myCardId = store.getMyCard()?.id;
    const egoId = myCardId ? store.listNodes(gid).find(n => n.cardId === myCardId)?.id || '' : '';
    engineRef.current = new ForceGraph(inputs.nodes, inputs.links, previous, { egoId });
    // 长按「＋」新生成的空白节点：落到锚点节点旁（而非 ego 周围）
    if (pendingSpawnRef.current) {
      const { anchorId, nodeId } = pendingSpawnRef.current;
      pendingSpawnRef.current = null;
      const anchor = engineRef.current.nodeById(anchorId);
      const fresh = engineRef.current.nodeById(nodeId);
      if (anchor && fresh) {
        // 按锚点已有关系数错开落位角度：连续「＋」出的节点不会叠在同一扇区（防点错节点）
        const deg = store.listEdges(gid).filter(e => e.source === anchorId || e.target === anchorId).length;
        const ang = Math.PI / 4 + (deg - 1) * 0.9 + (Math.random() * 0.3 - 0.15);
        fresh.x = anchor.x + Math.cos(ang) * 150;
        fresh.y = anchor.y + Math.sin(ang) * 150;
        fresh.vx = 0;
        fresh.vy = 0;
      }
    }
    if (selectedRef.current && !store.getNode(selectedRef.current)) closeCard();
  };

  // ---------- 图谱切换 ----------
  const switchGraph = (id: string) => {
    setGraphMenuOpen(false);
    if (id === graphId) return;
    closeCard();
    exitLinkMode();
    setGraphId(id);
    // 显式传入目标 id：setGraphId 是异步的，立即重建时闭包里还是旧 graphId
    if (engineRef.current) {
      rebuildEngine(engineRef.current, id);
      fitView(); // 切图谱：新视口一次到位
    }
    console.info('[GraphCanvas] 切换图谱 → %s', id);
  };

  // ---------- store 变化 → 同步引擎 ----------
  useEffect(() => {
    if (!engineRef.current || !rafRef.current) return; // 初始化前不处理
    if (!graphId) {
      // 空态：云端图谱数据异步到达后自动采用第一个（无图谱则继续待命）
      const first = store.listGraphs()[0];
      if (first) {
        setGraphId(first.id);
        rebuildEngine(engineRef.current, first.id);
        fitView(); // 数据载入完成：按首个图谱取景
        console.info('[GraphCanvas] 数据载入完成，采用图谱：%s', first.name);
      }
      return;
    }
    if (!store.getGraph(graphId)) {
      // 当前图谱被删除：切到第一个可用图谱
      const first = store.listGraphs()[0]?.id || '';
      if (first) {
        setGraphId(first);
        rebuildEngine(engineRef.current, first);
        fitView(); // 换图谱后重新取景
      }
      return;
    }
    const engine = engineRef.current;
    const inputs = buildInputs();
    const sameTopology =
      engine.nodes.length === inputs.nodes.length &&
      engine.links.length === inputs.links.length &&
      engine.nodes.every(n => inputs.nodes.some(x => x.id === n.id)) &&
      engine.links.every(l => inputs.links.some(x => x.id === l.id));
    dbg('storeSync', {
      same: sameTopology,
      nodes: inputs.nodes.length,
      links: inputs.links.length,
      withAvatar: inputs.nodes.filter(n => n.hasAvatar).length
    });
    if (sameTopology) {
      // 仅显示字段变化（改名 / 改称谓）：原地同步，布局不抖动
      inputs.nodes.forEach(input => {
        const target = engine.nodeById(input.id);
        if (target) {
          target.name = input.name;
          target.role = input.role;
          target.gen = input.gen;
          target.gender = input.gender;
          target.hasAvatar = input.hasAvatar;
          target.avatar = input.avatar;
          target.incomplete = input.incomplete;
        }
      });
      inputs.links.forEach(input => {
        const link = engine.links.find(l => l.id === input.id);
        if (link) link.label = input.label;
      });
      dirtyRef.current = true; // 静止停绘期间字段变了，置脏补一帧
    } else {
      // 拓扑变化：重建引擎（继承旧位置）+ 重升温。
      // 不重取景：用户当前视口不被拽动（切图谱/首载才取景）
      rebuildEngine(engine);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // ---------- 详情卡数据 ----------
  const selectedNode = selectedId ? store.getNode(selectedId) : undefined;
  const selectedCard = selectedNode?.cardId ? store.getCard(selectedNode.cardId) : undefined;
  const displayName = selectedNode ? nameOfNode(selectedNode) : selectedCard?.name || '';
  const birthday = selectedCard?.customFields?.find(f => f.key === 'birthday')?.value || '';

  // ---------- 详情卡操作 ----------
  /** 节点称谓：用户自行填充（称谓权威在图谱节点，每图谱各自独立，不再同步名片） */
  const patchNodeRole = (value: string) => {
    if (!selectedId) return;
    store.updateNode(selectedId, { role: value });
  };

  /** 编辑图标 → 进入名片编辑页（与名片列表点名片条进入的同一页面，直接编辑） */
  const editCardOf = () => {
    const c = selectedCard;
    if (!c) return;
    Taro.navigateTo({ url: `/pages/card/detail/index?id=${c.id}` });
  };

  /** 关联名片：暂存节点 id → 切到名片 Tab 选择（名片页每张名片带关联图标） */
  const openLinkCard = (nodeId: string) => {
    const n = store.getNode(nodeId);
    dbg('openLinkCard', { nodeId, name: n ? nameOfNode(n) : '' });
    store.linkPendingNodeId = nodeId;
    closeCard();
    Taro.switchTab({ url: '/pages/card/index' });
  };

  // 离开图谱页期间的画布尺寸变化兜底定时器（回页面校准用）
  const showResizeTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  // 回到图谱页：
  // 1) 重启渲染循环（页面隐藏期间 RAF 被节流/暂停，devtools 下可能不恢复，
  //    表现为画布冻结——节点头像已同步却不重画、点击看起来无响应）
  // 2) 立即校准画布尺寸：离开期间详情卡已闭合，但隐藏状态下三次校准全部
  //    resizeSkip（真机 queryRect 返回空），env.H 滞留在卡片展开时的旧值——
  //    位图被拉伸、hitTest 坐标整体错位，节点全部点不中（真机日志实锤的卡死根因）
  useDidShow(() => {
    dbg('graphDidShow', { engine: !!engineRef.current, raf: !!rafRef.current, frames: framesRef.current });
    // 从名片页返回但未完成关联：丢弃残留 pending，防止下次在名片页点 🔗 误关联到旧节点
    if (store.linkPendingNodeId) {
      dbg('linkPendingDiscard', { id: store.linkPendingNodeId });
      store.linkPendingNodeId = null;
    }
    const env = envRef.current;
    if (env) {
      dirtyRef.current = true; // 空闲停绘后回页面，立即补一帧
      startLoop(env.canvas);
      resizeCanvas();
      showResizeTimersRef.current = [setTimeout(resizeCanvas, 150), setTimeout(resizeCanvas, 400)];
    }
  });

  /** 点电话直接拨打 */
  const callCard = () => {
    const phone = (selectedCard?.phone || '').replace(/\s/g, '');
    if (!phone) {
      Taro.showToast({ title: '该名片没有电话', icon: 'none' });
      return;
    }
    Taro.makePhoneCall({ phoneNumber: phone }).catch(err => {
      console.error('[GraphCanvas] 拨打失败', err);
    });
  };

  /** 复制微信号 */
  const copyWechat = (wxId: string) => {
    Taro.setClipboardData({ data: wxId }).catch(err => {
      console.error('[GraphCanvas] 复制失败', err);
    });
  };

  // ---------- 新建图谱面板：头像 / 类型 / 名称 一体化编辑 ----------
  const openCreate = () => {
    setGraphMenuOpen(false);
    closeCard();
    setCreateAvatar('');
    setCreateName('');
    setCreateType('family');
    setCreateTypeLabel('');
    setTypeMenuOpen(false);
    setCreateOpen(true);
  };

  /** 类型显示名：自定义时用用户输入的类型名 */
  const createTypeDisplay = createTypeLabel.trim() || GRAPH_TYPE_LABELS[createType];

  /** 选头像（由头像区域点击直接触发，可跳过）：先上传云存储拿 fileID，失败提示不写入 */
  const pickCreateAvatar = () => {
    Taro.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async res => {
        const path = res.tempFiles[0]?.tempFilePath;
        if (!path) return;
        try {
          const fileID = await uploadFile(`graphs/${Date.now().toString(36)}.png`, path);
          setCreateAvatar(fileID);
        } catch (err) {
          console.error('[GraphCanvas] 图谱头像上传失败:', err);
          Taro.showToast({ title: '头像上传失败', icon: 'none' });
        }
      }
    });
  };

  const submitCreate = () => {
    const name = createName.trim() || `我的${createTypeDisplay}图谱`;
    const g = store.createGraph({
      name,
      type: createType,
      typeLabel: createType === 'custom' ? createTypeLabel.trim() : '',
      coverColor: '#d9c9dd',
      createdAt: nowStr(),
      avatar: createAvatar
    });
    // 新图谱默认以「我」为第一个节点
    const myCard = store.getMyCard();
    if (myCard) {
      store.createNode({ graphId: g.id, cardId: myCard.id, role: '我', gen: 1 });
    }
    closeCreate();
    console.info('[GraphCanvas] 创建并切换到图谱：%s（%s）', name, g.id);
    switchGraph(g.id);
  };

  /** 关闭新建面板 */
  const closeCreate = () => {
    setCreateOpen(false);
  };

  const graphs = store.listGraphs();

  return (
    <View className={styles.page}>
      {/* 画布区域：全屏（新建面板打开时保持可见，遮罩半透明覆盖） */}
      <View className={styles.canvasWrap}>
        <Canvas
          type="2d"
          id="graphCanvas"
          className={styles.canvas}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        />
      </View>

      {/* 悬浮药丸：CoverView 保证浮在原生 Canvas 之上（顶部中间、位置下移） */}
      {/* 子节点结构从头到尾恒定（原生 CoverView 已有节点的子树增删/替换不可靠），状态只换文案 */}
      <CoverView className={styles.pillWrap} style={{ top: statusBarH + 66 }}>
        <CoverView
          className={styles.pill}
          onClick={graph ? () => setGraphMenuOpen(v => !v) : openCreate}
        >
          <CoverView className={styles.pillEmoji}>{graph ? '📚' : '＋'}</CoverView>
          <CoverView className={styles.pillName}>{graph ? graphName : '创建新图谱'}</CoverView>
          <CoverView className={styles.pillArrow}>{graph ? (graphMenuOpen ? '▴' : '▾') : ''}</CoverView>
        </CoverView>
      </CoverView>

      {/* 药丸展开面板：已有图谱（类型/人数）+ 新建图谱 */}
      {graph && graphMenuOpen ? (
        <CoverView className={styles.menuWrap} style={{ top: statusBarH + 104 }}>
          <CoverView className={styles.menu}>
            {graphs.map(g => (
              <CoverView
                key={g.id}
                className={classnames(styles.menuItem, g.id === graphId && styles.menuItemActive)}
                onClick={() => switchGraph(g.id)}
              >
                {/* 图谱头像（创建时上传），无头像回退类型 emoji */}
                {g.avatar ? (
                  <CoverImage className={styles.menuAvatar} src={g.avatar} />
                ) : (
                  <CoverView className={styles.menuEmoji}>{TYPE_EMOJI[g.type]}</CoverView>
                )}
                {/* 一行：名称（最多 8 字）紧跟「类型·人数」，当前项以深底色标识 */}
                <CoverView className={styles.menuName}>
                  {g.name.length > 8 ? `${g.name.slice(0, 8)}…` : g.name}
                </CoverView>
                <CoverView className={styles.menuMeta}>
                  {`${g.typeLabel || GRAPH_TYPE_LABELS[g.type]}·${store.listNodes(g.id).length}人`}
                </CoverView>
                {/* 共享按钮：转发到微信群等多人协作（上线版暂隐藏，恢复时取消注释） */}
                {/* <CoverView
                  className={styles.menuShare}
                  onClick={e => {
                    e.stopPropagation();
                    Taro.showToast({ title: '共享功能即将上线', icon: 'none' });
                  }}
                >
                  共享
                </CoverView> */}
              </CoverView>
            ))}
            <CoverView className={styles.menuCreate} onClick={openCreate}>
              {`＋ 新建图谱`}
            </CoverView>
          </CoverView>
        </CoverView>
      ) : null}

      {/* 节点详情卡：名片信息（头像/姓名/电话/称谓/公司 + 编辑入口） */}
      {selectedNode ? (
        <View className={styles.card}>
          <View className={styles.grip} />
          <ScrollView scrollY className={styles.cardScroll}>
            <View className={styles.head}>
              <Avatar src={selectedCard?.avatar} name={displayName} size={120} />
              <View className={styles.who}>
                <View className={styles.nameRow}>
                  <Text className={styles.cardName}>{displayName}</Text>
                  {selectedCard ? (
                    // 活名片（无修改权限）显示「查看」，自己的名片显示「编辑」
                    <View className={styles.editBtn} onClick={editCardOf}>
                      <Text className={styles.editIcon}>{selectedCard.source === 'shared' ? '👁️' : '✏️'}</Text>
                      <Text className={styles.editText}>{selectedCard.source === 'shared' ? '查看' : '编辑'}</Text>
                    </View>
                  ) : (
                    // 未关联名片：名称旁的「关联名片」按钮 → 跳名片页选择
                    <View className={styles.editBtn} onClick={() => openLinkCard(selectedNode.id)}>
                      <Text className={styles.editIcon}>🔗</Text>
                      <Text className={styles.editText}>关联名片</Text>
                    </View>
                  )}
                </View>
                {/* 名字下方：称谓（可直接编辑，双向绑定名片称谓）+ 出生年月 */}
                <View className={styles.sub}>
                  <Input
                    className={styles.tagInput}
                    style={{ width: tagInputWidth(selectedNode.role) }}
                    value={selectedNode.role}
                    placeholder="填写称谓"
                    placeholderClass={styles.placeholder}
                    maxlength={6}
                    onInput={e => patchNodeRole(e.detail.value)}
                  />
                  {birthday ? <Text className={styles.birth}>{birthday}</Text> : null}
                </View>
              </View>
            </View>

            {selectedCard ? (
              <View className={styles.fields}>
                <View className={styles.fieldRow} onClick={callCard}>
                  <Text className={styles.fieldLabel}>电话</Text>
                  <Text className={styles.fieldValue}>{selectedCard.phone || '—'}</Text>
                  <Text className={styles.fieldMore}>📞</Text>
                </View>
                {isFamily
                  ? // 家族图谱成员：微信号等家族扩展字段（称谓在名字下方、生日跟在其后，均不重复展示）
                    // 微信号行：无前缀图标，值后跟复制图标，点击复制
                    (selectedCard.customFields || [])
                      .filter(f => f.value && f.key !== 'role' && f.key !== 'birthday')
                      .map(f =>
                        f.key === 'wechat' ? (
                          <View key={f.key} className={styles.fieldRow} onClick={() => copyWechat(f.value)}>
                            <Text className={styles.fieldLabel}>{f.label}</Text>
                            <Text className={styles.fieldValue}>{f.value}</Text>
                            <Text className={styles.fieldMore}>📋</Text>
                          </View>
                        ) : (
                          <View key={f.key} className={styles.fieldRow}>
                            <Text className={styles.fieldLabel}>{f.icon ? `${f.icon} ${f.label}` : f.label}</Text>
                            <Text className={styles.fieldValue}>{f.value}</Text>
                          </View>
                        )
                      )
                  : [
                      selectedCard.company ? (
                        <View key="company" className={styles.fieldRow}>
                          <Text className={styles.fieldLabel}>公司</Text>
                          <Text className={styles.fieldValue}>{selectedCard.company}</Text>
                        </View>
                      ) : null,
                      selectedCard.title ? (
                        <View key="title" className={styles.fieldRow}>
                          <Text className={styles.fieldLabel}>职位</Text>
                          <Text className={styles.fieldValue}>{selectedCard.title}</Text>
                        </View>
                      ) : null
                    ]}
              </View>
            ) : (
              <View className={styles.noCard}>
                <Text className={styles.noCardText}>该成员未关联名片 · 点上方「关联名片」选择</Text>
              </View>
            )}
          </ScrollView>
        </View>
      ) : null}

      {/* 新建图谱悬浮面板：头像 / 类型 / 名称 一体化（画布隐藏让层级，点面板外取消） */}
      {createOpen ? (
        <View className={styles.creatorMask} onClick={closeCreate}>
          <View className={styles.creator} onClick={e => e.stopPropagation()}>
            <Text className={styles.creatorTitle}>新建图谱</Text>
          <View className={styles.creatorBody}>
            {/* 头像：点击上传/更换 */}
            <View className={styles.creatorAvatarWrap} onClick={pickCreateAvatar}>
              {createAvatar ? (
                <Image className={styles.creatorAvatar} src={createAvatar} mode="aspectFill" />
              ) : (
                <View className={styles.creatorAvatarEmpty}>
                  <Text className={styles.creatorAvatarIcon}>🖼️</Text>
                </View>
              )}
              <Text className={styles.creatorAvatarTip}>{createAvatar ? '换头像' : '上传头像'}</Text>
            </View>
            <View className={styles.creatorForm}>
              <View className={styles.creatorField}>
                <Text className={styles.creatorLabel}>名称</Text>
                <Input
                  className={styles.creatorInput}
                  value={createName}
                  placeholder={`我的${createTypeDisplay}图谱`}
                  placeholderClass={styles.placeholder}
                  maxlength={16}
                  onInput={e => setCreateName(e.detail.value)}
                />
              </View>
              <View className={styles.creatorField}>
                <Text className={styles.creatorLabel}>类型</Text>
                {/* 类型下拉菜单（悬浮，不撑开面板；选项多时内部滚动） */}
                <View className={styles.typeSelectWrap}>
                  <View className={styles.typeSelect} onClick={() => setTypeMenuOpen(v => !v)}>
                    <Text className={styles.typeSelectText}>
                      {createType === 'custom' && createTypeLabel.trim()
                        ? `🕸️ ${createTypeLabel.trim()}`
                        : `${TYPE_EMOJI[createType]} ${GRAPH_TYPE_LABELS[createType]}`}
                    </Text>
                    <Text className={styles.typeSelectArrow}>{typeMenuOpen ? '▴' : '▾'}</Text>
                  </View>
                  {typeMenuOpen ? (
                    <View className={styles.typeMenu}>
                      <ScrollView scrollY className={styles.typeMenuScroll}>
                        {GRAPH_TYPES.map(t => (
                          <View
                            key={t}
                            className={classnames(styles.typeMenuItem, createType === t && styles.typeMenuItemActive)}
                            onClick={() => {
                              setCreateType(t);
                              if (t !== 'custom') setCreateTypeLabel('');
                              setTypeMenuOpen(false);
                            }}
                          >
                            <Text
                              className={classnames(
                                styles.typeMenuText,
                                createType === t && styles.typeMenuTextActive
                              )}
                            >
                              {`${TYPE_EMOJI[t]} ${GRAPH_TYPE_LABELS[t]}`}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
                {/* 自定义类型：输入类型名 */}
                {createType === 'custom' ? (
                  <Input
                    className={styles.typeCustomInput}
                    value={createTypeLabel}
                    placeholder="输入类型名，如：球友"
                    placeholderClass={styles.placeholder}
                    maxlength={8}
                    onInput={e => setCreateTypeLabel(e.detail.value)}
                  />
                ) : null}
              </View>
            </View>
          </View>
          <View className={styles.creatorSubmit} onClick={submitCreate}>
            <Text className={styles.creatorSubmitText}>创建图谱</Text>
          </View>
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default GraphPage;
