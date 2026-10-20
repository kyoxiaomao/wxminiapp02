import type { RelationType } from '@/types';

/**
 * 力导向布局引擎 —— 算法与全部参数 1:1 移植自 index.html demo（L480-L577），
 * 仅将绘制层换成 Canvas 2D；含代际分层力、硬性防重叠与边交叉避让。
 */

export interface ForceNodeInput {
  /** 图谱节点 id（GraphNode.id） */
  id: string;
  /** 显示名（节点昵称） */
  name: string;
  /** 称谓 / 角色 */
  role: string;
  /** 代际（家族图谱 1/2/3，其余类型缺省按 2 处理） */
  gen?: number;
  gender: 'm' | 'f';
  /** 关联名片是否有头像图片（无则圆圈内写名字） */
  hasAvatar: boolean;
  /** 关联名片头像图片地址（有值时圆圈内绘制照片） */
  avatar?: string;
  /** 持久化布局坐标（有值时优先恢复）：恢复后仍参与力学，不冻结 */
  x?: number;
  y?: number;
  /** 显式锁定标记（数据层保留；普通拖动只记坐标不置位） */
  pinned?: boolean;
  /** 显示层标记：资料未完善（节点下方红字提示），不参与力学 */
  incomplete?: boolean;
}

export interface ForceLinkInput {
  /** 关系边 id（Edge.id） */
  id: string;
  source: string;
  target: string;
  type: RelationType;
  label: string;
}

export interface ForceNode extends ForceNodeInput {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 拖拽 pin 中：不参与积分 */
  pinned: boolean;
}

export interface ForceLink extends ForceLinkInput {
  s: ForceNode;
  t: ForceNode;
}

/** 斥力强度 */
const REPULSION = 12000;
/** 弹簧自然长度：夫妻 96 / 亲子 158，其余类型 130 */
const LINK_LEN: Record<string, number> = { spouse: 96, parent: 158 };
const SPRING = 0.028;
const CENTER_PULL = 0.0022;
const GEN_PULL = 0.014;
const DAMPING = 0.72;
const MIN_DIST = 82;

/** 交叉避让：节点拉向亲属中心的强度 */
const BARY_AVOID = 0.06;
/** 存在交叉时维持的最小活动量 */
const CROSS_ALPHA_FLOOR = 0.12;
/** 避让最多持续帧数，防止无解时一直抖动（约 4 秒解缠窗口，解不开也必须沉降） */
const CROSS_MAX_TICKS = 240;

/** 活动量衰减与下限（保留极弱活动，拖动后仍微调） */
const ALPHA_DECAY = 0.9825;
const ALPHA_MIN = 0.004;

/** 代际目标纵坐标 */
const GEN_Y: Record<number, number> = { 1: -190, 2: 10, 3: 210 };

/** FNV-1a 字符串哈希（与 demo 一致，seed 布点与头像配色共用） */
export function fnvHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 线段严格相交判定辅助（共线、端点相接不算交叉） */
function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);
}

function segCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
): boolean {
  const d1 = ccw(cx, cy, dx, dy, ax, ay);
  const d2 = ccw(cx, cy, dx, dy, bx, by);
  const d3 = ccw(ax, ay, bx, by, cx, cy);
  const d4 = ccw(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export class ForceGraph {
  nodes: ForceNode[] = [];
  links: ForceLink[] = [];
  /** 活动量：1 全速解缠 → 衰减至 0.004 保留微调 */
  alpha = 1;
  /** 常态活动量（径向星图模式为弱微调，避免搅乱放射形状） */
  baseAlpha = 1;
  crossTicks = 0;

  private byId = new Map<string, ForceNode>();
  /** 亲属邻居表（夫妻 + 亲子 + 其他边），交叉避让时用于把节点拉向亲属中心 */
  private kinOf = new Map<string, string[]>();
  /** 径向模式（以「我」为中心的放射树）：关代际拉力、跳过交叉搅动 */
  private radialMode = false;

  /**
   * @param previous 旧引擎实例：同 id 节点继承位置/速度（增删节点后平滑重建）
   * @param options.egoId 以该节点为圆心做环形均匀分布（有「我」的家族图谱）
   */
  constructor(nodes: ForceNodeInput[], links: ForceLinkInput[], previous?: ForceGraph, options?: { egoId?: string }) {
    const prevById = previous ? previous.nodeByIdMap() : null;
    nodes.forEach(input => {
      const p = prevById ? prevById.get(input.id) : undefined;
      this.nodes.push({
        ...input,
        x: p ? p.x : input.x ?? 0,
        y: p ? p.y : input.y ?? 0,
        vx: p ? p.vx : 0,
        vy: p ? p.vy : 0,
        // pin：仅拖动中/长按的临时 pin 跨重建继承；持久化 pinned 字段不再冻结节点
        pinned: p ? p.pinned : false
      });
    });
    this.nodes.forEach(n => this.byId.set(n.id, n));

    // seed 布点：无旧实例 / 大半节点全新 → 全量 seed；否则继承旧位置、仅补位新节点
    const egoId = options?.egoId;
    const hasEgo = !!egoId && this.byId.has(egoId);
    if (hasEgo) this.radialMode = true;
    const freshCount = prevById
      ? this.nodes.filter(n => !prevById.has(n.id)).length
      : this.nodes.length;
    const fullSeed = !prevById || freshCount > this.nodes.length / 2;
    if (fullSeed) {
      if (hasEgo) this.seedRadial(egoId!, links);
      else this.seedGenerational();
    } else {
      // 增量：老节点保持原位，新节点放在 ego（或原点）周围一圈，交由力学归位
      const ego = hasEgo ? this.byId.get(egoId!) : undefined;
      this.nodes.forEach(n => {
        if (prevById!.has(n.id) || n.id === egoId) return;
        const ang = Math.random() * Math.PI * 2;
        n.x = (ego ? ego.x : 0) + Math.cos(ang) * 220;
        n.y = (ego ? ego.y : 0) + Math.sin(ang) * 220;
      });
    }
    this.baseAlpha = this.radialMode ? 0.08 : 1;
    this.alpha = this.baseAlpha;

    // 恢复持久化布局：seed 会重排全部坐标，这里把有保存坐标的节点复位
    // （只记位置不冻结：恢复后仍参与力学，邻居弹力正常；拖动中/长按的临时 pin 由交互层管理）
    nodes.forEach(input => {
      if (prevById && prevById.has(input.id)) return; // 旧引擎继承的坐标优先
      if (input.x == null || input.y == null) return;
      const n = this.byId.get(input.id);
      if (n) {
        n.x = input.x;
        n.y = input.y;
      }
    });

    links.forEach(input => {
      const s = this.byId.get(input.source);
      const t = this.byId.get(input.target);
      if (!s || !t) return; // 端点缺失（脏数据）直接跳过
      this.links.push({ ...input, s, t });
    });

    this.nodes.forEach(n => this.kinOf.set(n.id, []));
    this.links.forEach(l => {
      this.kinOf.get(l.s.id)!.push(l.t.id);
      this.kinOf.get(l.t.id)!.push(l.s.id);
    });
  }

  /** demo 原版 seed：同代横排（span 150 + hash 扰动），GEN_Y 分层 */
  private seedGenerational(): void {
    const groups = new Map<number, ForceNode[]>();
    this.nodes.forEach(n => {
      const g = n.gen ?? 2;
      const arr = groups.get(g) || [];
      arr.push(n);
      groups.set(g, arr);
    });
    groups.forEach(arr => {
      const span = 150;
      const startX = -(arr.length - 1) * span / 2;
      arr.forEach((n, i) => {
        n.x = startX + i * span + (fnvHash(n.id) % 40 - 20);
        n.y = (GEN_Y[n.gen ?? 2] ?? 10) + (fnvHash(n.id) % 60 - 30);
      });
    });
  }

  /** ego 放射树 seed：BFS 树 + 叶子等分角度，长辈朝上、晚辈朝下，连线沿扇区放射不压节点 */
  private seedRadial(egoId: string, typedLinks: ForceLinkInput[]): void {
    // 无向邻接（step 相对当前节点：parent=对方是长辈 / child=对方是晚辈 / spouse=配偶）
    type Step = 'parent' | 'child' | 'spouse';
    const adj = new Map<string, Array<{ other: string; step: Step }>>();
    const push = (id: string, other: string, step: Step) => {
      const arr = adj.get(id) || [];
      arr.push({ other, step });
      adj.set(id, arr);
    };
    this.nodes.forEach(n => adj.set(n.id, []));
    typedLinks.forEach(l => {
      if (!adj.has(l.source) || !adj.has(l.target)) return;
      if (l.type === 'spouse') {
        push(l.source, l.target, 'spouse');
        push(l.target, l.source, 'spouse');
      } else {
        // parent 语义：source 是 target 的长辈
        push(l.source, l.target, 'child');
        push(l.target, l.source, 'parent');
      }
    });

    // BFS 生成树（防环）：记录每节点的树父、入树步类型、层深、树孩子
    const stepOf = new Map<string, Step>();
    const depthOf = new Map<string, number>();
    const childrenOf = new Map<string, string[]>();
    const inTree = new Set<string>([egoId]);
    depthOf.set(egoId, 0);
    const queue: string[] = [egoId];
    while (queue.length) {
      const cur = queue.shift()!;
      (adj.get(cur) || []).forEach(({ other, step }) => {
        if (inTree.has(other)) return;
        inTree.add(other);
        stepOf.set(other, step);
        depthOf.set(other, (depthOf.get(cur) || 0) + 1);
        const arr = childrenOf.get(cur) || [];
        arr.push(other);
        childrenOf.set(cur, arr);
        queue.push(other);
      });
    }

    // 排序：长辈(parent 步)在前朝上、配偶居中、晚辈(child 步)在后朝下，同类按 hash 稳定
    const weight = (id: string) => {
      const s = stepOf.get(id);
      return s === 'parent' ? 0 : s === 'spouse' ? 1 : 2;
    };
    childrenOf.forEach(arr => {
      arr.sort((a, b) => weight(a) - weight(b) || fnvHash(a) - fnvHash(b));
    });

    // 叶子等分角度（径向 tidy tree）：每个叶子固定角宽，父节点取子树区间中点
    let leafCount = 0;
    this.nodes.forEach(n => {
      if (n.id !== egoId && inTree.has(n.id) && !(childrenOf.get(n.id) || []).length) leafCount++;
    });
    if (leafCount === 0) leafCount = 1;
    const leafWidth = (Math.PI * 2) / leafCount;
    let cursor = -Math.PI / 2; // 起始正上：第一层长辈排最前 → 朝上
    const span = new Map<string, { s: number; e: number }>();
    const assign = (id: string): { s: number; e: number } => {
      const kids = childrenOf.get(id) || [];
      let r: { s: number; e: number };
      if (!kids.length) {
        r = { s: cursor, e: cursor + leafWidth };
        cursor += leafWidth;
      } else {
        let s = Infinity;
        let e = -Infinity;
        kids.forEach(k => {
          const kr = assign(k);
          if (kr.s < s) s = kr.s;
          if (kr.e > e) e = kr.e;
        });
        r = { s, e };
      }
      span.set(id, r);
      return r;
    };
    (childrenOf.get(egoId) || []).forEach(k => assign(k));

    // 坐标：ego 居中原点，其余按（层深 × 层距）沿自身角度放置
    const R_STEP = 145;
    this.nodes.forEach(n => {
      if (n.id === egoId) {
        n.x = 0;
        n.y = 0;
        n.vx = 0;
        n.vy = 0;
        return;
      }
      const r = span.get(n.id);
      const ang = r ? (r.s + r.e) / 2 : Math.random() * Math.PI * 2;
      const rad = (depthOf.get(n.id) ?? 3) * R_STEP;
      n.x = Math.cos(ang) * rad;
      n.y = Math.sin(ang) * rad;
      n.vx = 0;
      n.vy = 0;
    });
  }

  nodeById(id: string): ForceNode | undefined {
    return this.byId.get(id);
  }

  nodeByIdMap(): Map<string, ForceNode> {
    return this.byId;
  }

  /** 提升活动量（拖拽 / 松手 / 重置后重升温） */
  wake(level: number): void {
    if (level > this.alpha) this.alpha = level;
  }

  /**
   * 是否已沉降：活动量衰减到下限（交叉避让在跑时会把 alpha 抬到 0.12，天然不算沉降）。
   * 渲染层据此停 tick/重绘，静止画面零耗。
   */
  settled(): boolean {
    return this.alpha <= ALPHA_MIN;
  }

  /** 邻居集合（含自身），选中高亮用 */
  neighborsOf(id: string): Set<string> {
    const set = new Set<string>([id]);
    (this.kinOf.get(id) || []).forEach(k => set.add(k));
    return set;
  }

  /** 推进一帧物理（与 demo tick 完全一致） */
  tick(): void {
    const { nodes, links } = this;
    const alpha = this.alpha;

    // 斥力（含硬性防重叠）
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        let f = (REPULSION * alpha) / d2;
        if (d < MIN_DIST) f += (MIN_DIST - d) * 0.55;
        const fx = (f * dx) / d;
        const fy = (f * dy) / d;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // 弹簧（连线）
    links.forEach(l => {
      const dx = l.t.x - l.s.x;
      const dy = l.t.y - l.s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const target = LINK_LEN[l.type] || 130;
      const f = (d - target) * SPRING * alpha;
      const fx = (f * dx) / d;
      const fy = (f * dy) / d;
      if (!l.s.pinned) {
        l.s.vx += fx;
        l.s.vy += fy;
      }
      if (!l.t.pinned) {
        l.t.vx -= fx;
        l.t.vy -= fy;
      }
    });

    // 边交叉避让（径向星图模式跳过：放射树本身不交叉，避免搅动破坏形状）：
    // 出现交叉时把节点在 x 方向拉向「亲属中心」，
    // 子女回到父母下方、配偶左右对齐，交叉自然解开；无交叉时不施加。
    if (this.radialMode) {
      this.crossTicks = 0;
    } else {
    let crossings = 0;
    for (let i = 0; i < links.length; i++) {
      const A = links[i];
      for (let j = i + 1; j < links.length; j++) {
        const B = links[j];
        if (A.s === B.s || A.s === B.t || A.t === B.s || A.t === B.t) continue;
        if (segCross(A.s.x, A.s.y, A.t.x, A.t.y, B.s.x, B.s.y, B.t.x, B.t.y)) crossings++;
      }
    }
    if (crossings > 0 && this.crossTicks < CROSS_MAX_TICKS) {
      nodes.forEach(n => {
        const nb = this.kinOf.get(n.id);
        if (!nb || !nb.length) return;
        let sx = 0;
        for (let k = 0; k < nb.length; k++) {
          const kin = this.byId.get(nb[k]);
          if (kin) sx += kin.x;
        }
        n.vx += ((sx / nb.length) - n.x) * BARY_AVOID * alpha;
      });
      // 只要还存在交叉，就维持一定活动量，让布局继续解缠
      if (this.alpha < CROSS_ALPHA_FLOOR) this.alpha = CROSS_ALPHA_FLOOR;
      this.crossTicks++;
    } else if (crossings === 0) {
      this.crossTicks = 0;
    }
    }

    // 向心力 + 代际分层力 + 积分（pinned 节点跳过）
    nodes.forEach(n => {
      if (n.pinned) {
        n.vx = 0;
        n.vy = 0;
        return;
      }
      n.vx += -n.x * CENTER_PULL * alpha;
      // 径向模式（以「我」为中心的放射树）关闭代际横排拉力，保持扇形分布
      if (!this.radialMode) {
        n.vy += ((GEN_Y[n.gen ?? 2] ?? 10) - n.y) * GEN_PULL * alpha;
      }
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      n.x += n.vx;
      n.y += n.vy;
    });

    this.alpha *= ALPHA_DECAY;
    if (this.alpha < ALPHA_MIN) this.alpha = ALPHA_MIN;
  }

  /** 内容包围盒（含头像与文字的呼吸空间，与 demo contentBounds 一致） */
  bounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    this.nodes.forEach(n => {
      minX = Math.min(minX, n.x - 56); // R_NODE 26 + 30
      maxX = Math.max(maxX, n.x + 56);
      minY = Math.min(minY, n.y - 60); // R_NODE 26 + 34
      maxY = Math.max(maxY, n.y + 82); // R_NODE 26 + 56
    });
    return { minX, minY, maxX, maxY };
  }
}
