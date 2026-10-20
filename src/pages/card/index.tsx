import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import type { ITouchEvent } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useStoreVersion } from '@/store/useStoreVersion';
import { store } from '@/store';
import { dbg } from '@/utils/graphDebug';
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
        {/* 活名片有更新且未点开：名片条右上角红点（微信未读红点风格） */}
        {card.source === 'shared' && (card.updatedVersion ?? 0) > (card.seenVersion ?? -1) ? (
          <View className={styles.dot} />
        ) : null}
        {linkMode ? (
          // 关联模式：每张名片带一个关联图标按钮
          <View
            className={styles.linkBtn}
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
  const [keyword, setKeyword] = useState('');
  // 关联模式：图谱页「关联名片」跳转过来时，store.linkPendingNodeId 有值
  const [linkNodeId, setLinkNodeId] = useState('');
  // 当前左滑展开的名片 id（同时只有一条展开）
  const [swipeId, setSwipeId] = useState('');
  // 关联防重入：toast+switchTab 动画期间列表仍可点，二次点击会以旧闭包的
  // linkNodeId 把另一张名片覆盖关联到同一节点（表现为「关联的不是我选的名片」）
  const linkGuardRef = useRef(false);
  // 全部名片排序方式：time=按添加时间（新的在前）/ name=按姓名首字母
  const [sortBy, setSortBy] = useState<'time' | 'name'>('time');

  useDidShow(() => {
    linkGuardRef.current = false;
    dbg('linkEnter', { nodeId: store.linkPendingNodeId });
    setLinkNodeId(store.linkPendingNodeId || '');
    // 活名片进列表前批量拉最新：列表名字等显示的是收下时的快照，刷新后与源头同步
    store
      .listCards()
      .filter(c => c.source === 'shared')
      .forEach(c => {
        store.refreshSharedCard(c.id).catch(err => console.error('[Card] 活名片列表刷新失败:', err));
      });
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
    dbg('linkApply', { nodeId: linkNodeId, cardId, cardName: card?.name });
    store.updateNode(linkNodeId, { cardId });
    store.linkPendingNodeId = null;
    setLinkNodeId('');
    Taro.showToast({ title: `已关联 ${card?.name || '名片'}`, icon: 'none' });
    Taro.switchTab({ url: '/pages/graph/index' });
  };

  /** 左滑删除名片 */
  const confirmDelete = (card: Card) => {
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
          <Text className={styles.count}>共 {total} 张</Text>
        </View>
        <SearchBar value={keyword} placeholder="搜索姓名 / 电话 / 公司" onInput={setKeyword} />
      </View>

      <View className={styles.body}>
        {/* 关联模式提示条 */}
        {linkNodeId ? (
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

        {!store.cardsReady ? (
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
            {cards.map(card => (
              <SwipeCardItem
                key={card.id}
                card={card}
                linkMode={!!linkNodeId}
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
    </View>
  );
};

export default CardPage;
