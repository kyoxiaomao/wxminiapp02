import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import type { ITouchEvent } from '@tarojs/components';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import classnames from 'classnames';
import { useStoreVersion } from '@/store/useStoreVersion';
import { store } from '@/store';
import { tutorialController, useTutorial, TUTORIAL_STEPS } from '@/tutorial/controller';
import TutorialOverlay, { type TutorialHole } from '@/components/TutorialOverlay';
import { getCardTemplate } from '@/mock/presets';
import SearchBar from '@/components/SearchBar';
import Empty from '@/components/Empty';
import Avatar from '@/components/Avatar';
import type { Card } from '@/types';
import styles from './index.module.scss';

/** 左滑删除区宽度（px，对应 128rpx） */
const SWIPE_W = 64;

interface SwipeCardProps {
  card: Card;
  /** 关联模式：显示关联按钮而非箭头 */
  linkMode: boolean;
  /** 新人指引选名片步骤：高亮关联按钮 */
  highlightLink?: boolean;
  /** 关联按钮的 DOM id（指引遮罩取矩形用） */
  linkDomId?: string;
  /** 本条是否处于左滑展开状态（全局同时只有一条） */
  open: boolean;
  onOpenChange: (id: string) => void;
  onNavigate: (id: string) => void;
  onLink: (id: string) => void;
  onDelete: (card: Card) => void;
}

/** 名片条：左滑露出「删除」（仿微信消息列表），点击进详情 */
const SwipeCardItem: React.FC<SwipeCardProps> = ({
  card,
  linkMode,
  highlightLink,
  linkDomId,
  open,
  onOpenChange,
  onNavigate,
  onLink,
  onDelete
}) => {
  const tpl = getCardTemplate(card.template);
  // 称谓权威在图谱节点（per-graph）：取第一个图谱的节点 role
  const graphs = store.listGraphsOfCard(card.id);
  const firstGraph = graphs[0];
  const role = firstGraph
    ? store.listNodes(firstGraph.id).find(n => n.cardId === card.id)?.role ?? ''
    : '';
  const graphName = firstGraph?.name ?? '';

  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(true);
  const touch = useRef({ startX: 0, startY: 0, base: 0, axis: '' as '' | 'x' | 'y' });
  // 拖动后紧随的合成点击不应触发跳转
  const moved = useRef(false);
  // 记录上一帧 open：仅在其他条展开导致本条被动收起时回弹（不能监听 dx，否则拖动每帧被重置）
  const prevOpen = useRef(open);

  useEffect(() => {
    if (prevOpen.current && !open) {
      setDx(0);
      setAnim(true);
    }
    prevOpen.current = open;
  }, [open]);

  const onTouchStart = (e: ITouchEvent) => {
    const t = e.touches[0];
    touch.current = { startX: t.clientX, startY: t.clientY, base: open ? -SWIPE_W : 0, axis: '' };
    moved.current = false;
    setAnim(false);
  };

  const onTouchMove = (e: ITouchEvent) => {
    const t = e.touches[0];
    const dX = t.clientX - touch.current.startX;
    const dY = t.clientY - touch.current.startY;
    // 首次明显位移时判定方向：水平位移只要不弱于纵向就按左滑处理，纵向明显占优才让位页面滚动
    if (!touch.current.axis) {
      if (Math.abs(dX) < 5 && Math.abs(dY) < 5) return;
      touch.current.axis = Math.abs(dX) >= Math.abs(dY) ? 'x' : 'y';
    }
    if (touch.current.axis !== 'x') return;
    moved.current = true;
    setDx(Math.max(-SWIPE_W, Math.min(0, touch.current.base + dX)));
  };

  const finishSwipe = () => {
    setAnim(true);
    if (dx < -SWIPE_W / 2) {
      setDx(-SWIPE_W);
      onOpenChange(card.id);
    } else {
      setDx(0);
      if (open) onOpenChange('');
    }
  };

  const handleTap = () => {
    // 拖动结束后的合成点击不触发跳转/收起
    if (moved.current) {
      moved.current = false;
      return;
    }
    // 有条目处于左滑状态时，点击先收起（仿微信）
    if (open) {
      onOpenChange('');
      return;
    }
    onNavigate(card.id);
  };

  return (
    <View className={styles.swipeWrap}>
      {/* 删除区常驻右侧底层，内容条左滑露出 */}
      <View className={styles.swipeDelete} onClick={() => onDelete(card)}>
        <Text className={styles.swipeDeleteText}>删除</Text>
      </View>
      <View
        className={`${styles.cardItem} ${anim ? styles.cardItemAnim : ''}`}
        style={{ transform: `translateX(${dx}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={finishSwipe}
        onTouchCancel={finishSwipe}
        onClick={handleTap}
      >
        {/* 模板色条：紫=家族 蓝=公司 绿=学校 橙=通用 */}
        <View className={styles.tplStripe} style={{ background: tpl.color }} />
        <Avatar src={card.avatar} name={card.name} size={56} />
        <View className={styles.info}>
          <Text className={styles.name}>{card.name || '未命名'}</Text>
          {/* 称谓 / 图谱 / 电话：为空则不显示 */}
          {role ? <Text className={styles.meta}>{` · ${role}`}</Text> : null}
          {graphName ? <Text className={styles.meta}>{` · ${graphName}`}</Text> : null}
          {card.phone ? <Text className={styles.phone}>{` · ${card.phone}`}</Text> : null}
        </View>
        {card.isMe ? <Text className={styles.meTag}>我</Text> : null}
        {/* 新人指引示例名片角标 */}
        {store.isTutorialCard(card.id) ? <Text className={styles.sampleTag}>示例</Text> : null}
        {/* 活名片有更新且未点开：名片条右上角红点（微信未读红点风格） */}
        {card.source === 'shared' && (card.updatedVersion ?? 0) !== (card.seenVersion ?? -1) ? (
          <View className={styles.dot} />
        ) : null}
        {linkMode ? (
          // 关联模式：每张名片带一个关联图标按钮
          <View
            id={linkMode ? linkDomId : undefined}
            className={classnames(styles.linkBtn, highlightLink && styles.linkBtnHint)}
            onClick={e => {
              e.stopPropagation();
              onLink(card.id);
            }}
          >
            <Text className={styles.linkBtnIcon}>🔗</Text>
          </View>
        ) : (
          <Text className={styles.itemChevron}>›</Text>
        )}
      </View>
    </View>
  );
};

/** 名片 Tab：我的名片入口 + 名片列表（搜索/新建/左滑删除/进入详情） */
const CardPage: React.FC = () => {
  const version = useStoreVersion();
  const tut = useTutorial();
  const [keyword, setKeyword] = useState('');
  // 关联模式：图谱页「关联名片」跳转过来时，store.linkPendingNodeId 有值。
  // 直接用 store 初始化，避免首帧没有 🔗 按钮、下一帧才出现造成的闪动
  const [linkNodeId, setLinkNodeId] = useState(store.linkPendingNodeId || '');
  // 当前左滑展开的名片 id（同时只有一条展开）
  const [swipeId, setSwipeId] = useState('');
  // 关联防重入：toast+switchTab 动画期间列表仍可点，二次点击会以旧闭包的
  // linkNodeId 把另一张名片覆盖关联到同一节点（表现为「关联的不是我选的名片」）
  const linkGuardRef = useRef(false);
  // 全部名片排序方式：time=按添加时间（新的在前）/ name=按姓名首字母
  const [sortBy, setSortBy] = useState<'time' | 'name'>('time');
  // 页面重新可见的计数（指引遮罩需要等页面真正显示后再量坐标）
  const [showTick, setShowTick] = useState(0);
  // 新人指引：第一张名片关联按钮的挖孔区域
  const [tutHole, setTutHole] = useState<TutorialHole | null>(null);
  // 坐标量不到时撤掉遮罩，避免全屏挡板困住用户
  const [tutMaskHidden, setTutMaskHidden] = useState(false);

  // 教程「选择名片」步骤：滚回顶部后量第一张名片 🔗 按钮的矩形，供遮罩挖孔
  useEffect(() => {
    if (!tut.active || tut.stepIndex !== 5 || !linkNodeId) {
      setTutHole(null);
      return;
    }
    // 页面一显示就先出遮罩+气泡（hole=null 为全屏），量到坐标后再挖孔，
    // 避免切页后出现「引导消失再出现」的空白闪烁
    setTutMaskHidden(false);
    let cancelled = false;
    let tries = 0;
    const measure = () => {
      if (cancelled) return;
      Taro.createSelectorQuery()
        .select('#tutLink-0')
        .boundingClientRect((rect: any) => {
          if (cancelled) return;
          if (rect && rect.width > 0) {
            const pad = 10;
            const hole = {
              x: Math.max(0, rect.left - pad),
              y: Math.max(0, rect.top - pad),
              w: rect.width + pad * 2,
              h: rect.height + pad * 2
            };
            setTutHole(hole);
            return;
          }
          // 页面首帧/渲染未完成时坐标可能为空，短暂重试；仍失败则撤掉遮罩（避免困住用户）
          if (tries < 3) {
            tries += 1;
            setTimeout(measure, 150);
          } else {
            setTutHole(null);
            setTutMaskHidden(true);
            console.warn('[Tutorial] 名片页关联按钮坐标获取失败，已撤掉遮罩');
          }
        })
        .exec();
    };
    Taro.pageScrollTo({ scrollTop: 0, duration: 0 });
    // useEffect 已在首帧提交后执行，直接量；量不到再短重试
    measure();
    return () => {
      cancelled = true;
    };
  }, [tut.active, tut.stepIndex, linkNodeId, showTick, version]);

  useDidShow(() => {
    linkGuardRef.current = false;
    setShowTick(v => v + 1);
    // 清掉上一次访问残留的挖孔/遮罩状态，避免进入步骤时先按旧坐标画一下再跳位（闪）
    setTutHole(null);
    setTutMaskHidden(false);
    setLinkNodeId(store.linkPendingNodeId || '');
    // 活名片进列表前批量拉最新：列表名字等显示的是收下时的快照，刷新后与源头同步。
    // 这里不做互换，互换只在打开详情时补跑
    store
      .listCards()
      .filter(c => c.source === 'shared')
      .forEach(c => {
        store.refreshSharedCard(c.id, { swap: false }).catch(err => console.error('[Card] 活名片列表刷新失败:', err));
      });
  });

  // 教程：在「选择名片」步骤离开名片页且未完成关联 → 视为中断（清空示例数据）
  useDidHide(() => {
    if (!store.tutorialActive) return;
    const st = tutorialController.getState();
    if (st.stepIndex === 5 && store.linkPendingNodeId) {
      tutorialController.interrupt();
      store.linkPendingNodeId = null;
      setLinkNodeId('');
    }
  });

  const myCard = store.getMyCard();
  // 全部名片列表不含我的名片（我的单独在顶部入口展示）
  const allCards = store.searchCards(keyword).filter(c => !c.isMe);
  const total = allCards.length;
  // 排序：时间（新的在前）/ 姓名（拼音/字母序）
  const cards = [...allCards].sort(
    sortBy === 'name'
      ? (a, b) => (a.name || '未命名').localeCompare(b.name || '未命名', 'zh-Hans-CN')
      : (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
  );

  const goDetail = (id: string) => {
    // 教程期间示例名片不可进入编辑/删除
    if (store.tutorialActive && store.isTutorialCard(id)) {
      Taro.showToast({ title: '示例名片，请用右侧 🔗 完成关联', icon: 'none' });
      return;
    }
    Taro.navigateTo({ url: `/pages/card/detail/index?id=${id}` });
  };

  /** FAB 新建名片：走表单页（编辑已有名片统一在详情页直接编辑） */
  const goCreate = () => {
    Taro.navigateTo({ url: '/pages/card/edit/index' });
  };

  /** 关联模式：把名片绑定到待关联的图谱节点，完成后切回图谱 */
  const linkCardToNode = (cardId: string) => {
    if (!linkNodeId) return;
    if (linkGuardRef.current) return; // 防切页动画期间二次点击覆盖关联
    linkGuardRef.current = true;
    const card = store.getCard(cardId);
    store.updateNode(linkNodeId, { cardId });
    store.linkPendingNodeId = null;
    setLinkNodeId('');
    // 教程：先推进到「修改关系」，再切回图谱（名片页 hide 时已不是选卡步骤，不中断）
    if (store.tutorialActive) tutorialController.notify('cardBound', { cardId });
    Taro.showToast({ title: `已关联 ${card?.name || '名片'}`, icon: 'none' });
    Taro.switchTab({ url: '/pages/graph/index' });
  };

  /** 左滑删除名片 */
  const confirmDelete = (card: Card) => {
    // 指引期间统一禁止删除：示例卡不可删，真实卡此刻云端写入被沙箱短路，删了会「重启又回来」
    if (store.tutorialActive) {
      setSwipeId('');
      Taro.showToast({
        title: store.isTutorialCard(card.id) ? '示例名片不可删除' : '指引结束后再管理名片',
        icon: 'none'
      });
      return;
    }
    Taro.showModal({
      title: '删除名片',
      content: `确定删除「${card.name}」吗？图谱中引用 TA 的节点将变为匿名节点。`,
      confirmColor: '#f53f3f',
      success: res => {
        if (!res.confirm) return;
        store.deleteCard(card.id);
        setSwipeId('');
        Taro.showToast({ title: '已删除', icon: 'success' });
      }
    });
  };

  return (
    <View className={styles.container}>
      <View className={styles.header}>
        <View className={styles.headerTop}>
          <Text className={styles.title}>名片</Text>
          <Text className={styles.count}>
            {store.tutorialActive ? `共 ${total} 张（含示例）` : `共 ${total} 张`}
          </Text>
        </View>
        <SearchBar value={keyword} placeholder="搜索姓名 / 电话 / 公司" onInput={setKeyword} />
      </View>

      <View className={styles.body}>
        {/* 关联模式提示条：指引期间由遮罩气泡承担，避免重复引导 */}
        {linkNodeId && !store.tutorialActive ? (
          <View className={styles.linkTip}>
            <Text className={styles.linkTipText}>请选择一张名片，关联到图谱节点</Text>
          </View>
        ) : null}

        {myCard && !keyword ? (
          <View className={styles.myEntry} onClick={() => goDetail(myCard.id)}>
            <Avatar src={myCard.avatar} name={myCard.name} size={72} />
            <View className={styles.myInfo}>
              <Text className={styles.myName}>{myCard.name || '未命名'}</Text>
              <Text className={styles.myLabel}>我的名片 · 点击查看与编辑</Text>
            </View>
            <Text className={styles.chevron}>›</Text>
          </View>
        ) : null}

        {!store.cardsReady && !store.tutorialActive ? (
          <Empty title="正在加载名片…" description="首次加载需连接云端" />
        ) : cards.length > 0 ? (
          <View className={styles.list}>
            {!keyword ? (
              <View className={styles.sectionRow}>
                <Text className={styles.sectionTitle}>全部名片</Text>
                <View className={styles.sortRow}>
                  <Text
                    className={`${styles.sortBtn} ${sortBy === 'time' ? styles.sortBtnActive : ''}`}
                    onClick={() => setSortBy('time')}
                  >
                    按时间
                  </Text>
                  <Text
                    className={`${styles.sortBtn} ${sortBy === 'name' ? styles.sortBtnActive : ''}`}
                    onClick={() => setSortBy('name')}
                  >
                    按姓名
                  </Text>
                </View>
              </View>
            ) : null}
            {cards.map((card, i) => (
              <SwipeCardItem
                key={card.id}
                card={card}
                linkMode={!!linkNodeId}
                highlightLink={store.tutorialActive && tut.stepIndex === 5}
                linkDomId={linkNodeId ? `tutLink-${i}` : undefined}
                open={swipeId === card.id}
                onOpenChange={setSwipeId}
                onNavigate={goDetail}
                onLink={linkCardToNode}
                onDelete={confirmDelete}
              />
            ))}
          </View>
        ) : (
          <Empty title="没有找到相关名片" description="换个关键词试试，或点右下角 + 新建名片" />
        )}
      </View>

      <View className={styles.fab} onClick={goCreate}>
        <Text className={styles.fabIcon}>＋</Text>
      </View>

      {/* 指引「选择名片」步骤：先出全屏遮罩+气泡，量到第一张名片 🔗 按钮坐标后再挖孔 */}
      {store.tutorialActive && tut.stepIndex === 5 && linkNodeId && !tutMaskHidden ? (
        <TutorialOverlay
          step={TUTORIAL_STEPS[5]}
          index={5}
          total={TUTORIAL_STEPS.length}
          hole={tutHole}
          waiting
          onNext={() => tutorialController.next()}
          onSkip={() => tutorialController.skip()}
          onExit={() => tutorialController.exit()}
        />
      ) : null}
    </View>
  );
};

export default CardPage;
