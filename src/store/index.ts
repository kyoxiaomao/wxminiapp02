import type {
  Card,
  CardInput,
  Edge,
  EdgeInput,
  Graph,
  GraphInput,
  GraphNode,
  GraphType,
  NodeInput
} from '@/types';
import { dbList, dbAdd, dbUpdate, dbRemove, callFunction } from '@/services/cloud';

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/**
 * 数据存储（卡片云化版）
 * - 名片 Card 走 CloudBase `cards` 集合：启动预加载进内存，写操作内存立即生效 + 云端穿透
 * - 图谱/节点/关系暂为本地内存 mock（后续上云），方法签名不变
 * - 所有页面/组件只依赖 store 的公开方法，不直接操作内部数组
 * - 变更后通过 subscribe 通知，页面经 useStoreVersion 感知
 */
class Store {
  private cards: Card[] = [];
  private graphs: Graph[] = [];
  private nodes: GraphNode[] = [];
  private edges: Edge[] = [];
  private listeners = new Set<() => void>();

  /**
   * 跨页暂存：待关联名片的图谱节点 id（非响应式，仅页面间传递）
   * 图谱详情卡「关联名片」→ switchTab 到名片页 → 名片页读取并进入关联模式
   */
  linkPendingNodeId: string | null = null;

  /**
   * 跨页暂存：首登引导完成后的落地页（非响应式，仅页面间传递）
   * 分享落地的新用户先走一键授权引导，完成后打开被分享的名片详情（而不是图谱首页）
   */
  onboardRedirect: string | null = null;

  /** 当前用户 openid（账号锚点，登录后写入；卡片归属/认领/持有关系以此为准） */
  userOpenId = '';

  /**
   * 演示模式：账号密码登录（平台审核用）后置 true
   * 数据读写走共享 demo_* 集合（不归属任何 openid，所有测试账号共用一份演示数据）
   */
  demoMode = false;

  /** 写入归属字段：演示模式的数据不归属任何 openid（共享一份），正常模式归属当前用户 */
  private docOwner(): { openId?: string } {
    return this.demoMode ? {} : { openId: this.userOpenId };
  }

  /** 卡片是否已从云端加载完成（首屏 loading 用） */
  cardsReady = false;

  /** 版本号：每次数据变更自增，供 useStoreVersion 触发重渲染 */
  version = 0;

  constructor() {
    // 卡片与图谱数据全部由云端载入（loadCardsFromCloud / loadGraphsFromCloud），初始为空
    console.info('[Store] 初始化：数据待云端载入（cards / graphs / nodes / edges）');
  }

  /** 云端载入卡片：首批并行拉 3 页先到先显示，剩余后台补拉（启动登录后调用一次；失败直接抛出暴露问题） */
  async loadCardsFromCloud(): Promise<void> {
    const PAGE = 20;
    // 首批 3 页并行拉取（覆盖前 50 张配额）：串行逐页 await 是首屏主要等待项
    const batches = await Promise.all([0, 1, 2].map(i => this.fetchCardsPage(i * PAGE, PAGE)));
    const first: Card[] = [];
    let skip = 0;
    let exhausted = false;
    for (const batch of batches) {
      first.push(...batch);
      skip += PAGE;
      if (batch.length < PAGE) {
        exhausted = true;
        break;
      }
    }
    this.cards = first;
    this.cardsReady = true;
    this.emit();
    console.info('[Store] 卡片已从云端载入：%d 张', this.cards.length);
    // 后台补拉剩余（不阻塞首屏），每批落进内存并通知页面刷新
    if (!exhausted) this.loadRemainingCards(skip);
  }

  private async fetchCardsPage(skip: number, limit: number): Promise<Card[]> {
    // 小程序端单次 get() 最多返回 20 条（limit 超出会被静默截断），必须 skip 分页
    return await dbList<Card>('cards', {}, { skip, limit });
  }

  /** 后台补拉首批之后的卡片 */
  private async loadRemainingCards(skip: number): Promise<void> {
    try {
      const PAGE = 20;
      for (let s = skip; ; s += PAGE) {
        const batch = await this.fetchCardsPage(s, PAGE);
        if (!batch.length) break;
        this.cards.push(...batch);
        this.emit();
        if (batch.length < PAGE) break;
        if (s >= 1000) break; // 安全阀，防异常时死循环
      }
      console.info('[Store] 卡片后台补全完成：共 %d 张', this.cards.length);
    } catch (err) {
      console.error('[Store] 卡片后台补拉失败:', err);
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    this.version += 1;
    this.listeners.forEach(fn => fn());
  }

  /** 登录成功后写入账号锚点（替换本地 mock 用户） */
  setUserOpenId(openId: string): void {
    this.userOpenId = openId;
    console.info('[Store] 账号锚点已更新：userOpenId = %s', openId);
    this.emit();
  }

  // ============ 名片 Card ============

  listCards(): Card[] {
    return this.cards;
  }

  getCard(id: string): Card | undefined {
    return this.cards.find(c => c.id === id);
  }

  getMyCard(): Card | undefined {
    return this.cards.find(c => c.isMe);
  }

  /** 按姓名 / 电话 / 公司模糊搜索 */
  searchCards(keyword: string): Card[] {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return this.cards;
    return this.cards.filter(c =>
      [c.name, c.phone, c.company, c.title].some(v => v.toLowerCase().includes(kw))
    );
  }

  /**
   * 新建名片：先落云端再进内存（保证「界面看到的=云端保存的」）
   * 云端失败直接抛出，不做假持久化（否则重启后凭空消失）
   */
  async createCard(input: CardInput): Promise<Card> {
    const card: Card = { ...input, id: uid('card') };
    await dbAdd('cards', { ...card, ...this.docOwner() });
    this.cards.push(card);
    this.emit();
    console.info('[Store] 创建名片：%s（%s）已持久化', card.name, card.id);
    return card;
  }

  updateCard(id: string, patch: Partial<CardInput>): void {
    const card = this.getCard(id);
    if (!card) {
      console.error('[Store] 更新名片失败：不存在 %s', id);
      return;
    }
    Object.assign(card, patch);
    this.emit();
    this.pushToCloud('更新', () =>
      dbUpdate('cards', { id }, patch)
    );
  }

  /** 删除名片：图谱中引用它的节点变为匿名节点（引用置空，不报错；云端节点同步清空 cardId） */
  deleteCard(id: string): void {
    this.cards = this.cards.filter(c => c.id !== id);
    let orphan = 0;
    this.nodes = this.nodes.map(n => {
      if (n.cardId === id) {
        orphan += 1;
        return { ...n, cardId: null };
      }
      return n;
    });
    this.emit();
    console.info('[Store] 删除名片：%s（%d 个图谱节点变为匿名）', id, orphan);
    this.pushToCloud('删除名片', async () => {
      await dbRemove('cards', { id });
      if (orphan > 0) {
        await dbUpdate('nodes', { cardId: id }, { cardId: null });
      }
    });
  }

  /** 写穿透：内存已先生效，云端异步落库；失败直接报出来（不静默吞掉） */
  private pushToCloud(action: string, fn: () => Promise<unknown>): void {
    fn().catch(err => {
      console.error('[Store] %s同步云端失败:', action, err);
    });
  }

  // ============ 活名片（收到的分享名片） ============

  /**
   * 收下分享的活名片：经 getCard 云函数拉源卡内容 → 在自己名下建引用条
   * - 引用条用自己的本地 id（cards.id 有全局唯一索引 idx_id，不能复用源卡 id），refCardId 指向源卡
   * - 内容是收下时刻的副本（列表显示用），之后每次打开经 refreshSharedCard 拉最新
   * - 已收过则只刷新副本，不重复建条
   */
  /** 收下的并发去重：同一源卡的收下请求共享一个进行中的 Promise */
  private pendingReceive = new Map<string, Promise<Card>>();

  async receiveSharedCard(refCardId: string): Promise<Card> {
    const inflight = this.pendingReceive.get(refCardId);
    if (inflight) {
      console.info('[Store] 收下进行中，复用同一请求：%s', refCardId);
      return inflight;
    }
    const task = this.doReceiveSharedCard(refCardId).finally(() => {
      this.pendingReceive.delete(refCardId);
    });
    this.pendingReceive.set(refCardId, task);
    return task;
  }

  private async doReceiveSharedCard(refCardId: string): Promise<Card> {
    const existing = this.cards.find(c => c.refCardId === refCardId || c.id === refCardId);
    let remote: Card & { _id?: string };
    try {
      // swap: 首次收下名片时顺带互换——把自己的名片回赠给源卡拥有者（对方列表出现我的名片）
      remote = await callFunction<Card & { _id?: string }>('getCard', { id: refCardId, swap: true });
    } catch (err) {
      throw new Error(`拉取源卡失败: ${(err as Error)?.message ?? err}`);
    }
    // 剥掉数据库主键防回传（否则插入引用条会撞源卡 _id 主键冲突）
    const { _id: _ignored, ...latest } = remote;
    const version = latest.contentVersion ?? 0;
    if (existing) {
      const before = this.getCard(existing.id);
      this.applySharedContent(existing.id, latest);
      // 内容有变化：更新最新版本号（红点判定用），seen 保留原值 = 未读
      if (version > (before?.updatedVersion ?? 0)) {
        this.updateCard(existing.id, { updatedVersion: version });
      }
      console.info('[Store] 活名片已存在，刷新副本：%s', refCardId);
      return this.getCard(existing.id)!;
    }
    // 权威去重：内存可能尚未载入（冷启动落地页先于卡片加载），以云端为准防重复收下
    try {
      const dup = (await dbList<Card>('cards', { refCardId }, { limit: 1 }))[0] as Card | undefined;
      if (dup) {
        if (!this.getCard(dup.id)) {
          this.cards.push(dup);
        }
        this.applySharedContent(dup.id, latest);
        if (version > (dup.updatedVersion ?? 0)) {
          this.updateCard(dup.id, { updatedVersion: version });
        }
        console.info('[Store] 云端已有该活名片，复用并刷新副本：%s', dup.id);
        return this.getCard(dup.id)!;
      }
    } catch (err) {
      console.error('[Store] 活名片去重查询失败（继续收下流程）:', err);
    }
    const card: Card = {
      ...latest,
      id: uid('card'),
      source: 'shared',
      refCardId,
      isMe: false,
      // 刚收下默认无未读红点，之后源卡更新才亮红点
      updatedVersion: version,
      seenVersion: version,
      createdAt: new Date().toISOString()
    };
    try {
      await dbAdd('cards', { ...card, ...this.docOwner() });
    } catch (err) {
      throw new Error(`写入名片列表失败: ${(err as Error)?.message ?? err}`);
    }
    this.cards.push(card);
    this.emit();
    console.info('[Store] 已收下活名片：%s（%s）', card.name, refCardId);
    return card;
  }

  /** 打开活名片时拉源卡最新内容并刷新本地副本（改源卡全端同步的核心） */
  async refreshSharedCard(localId: string): Promise<void> {
    const local = this.getCard(localId);
    if (!local?.refCardId) return;
    // swap: true —— 互换在每次打开时补跑（幂等）：
    // 新用户收名片可能发生在一键授权建名片之前，首次互换会因「尚无名片」被跳过，
    // 刷新时补跑可兜住该时序（云函数侧按 refCardId 去重，不会重复建条）
    const remote = await callFunction<Card & { _id?: string }>('getCard', { id: local.refCardId, swap: true });
    const { _id: _ignored, ...latest } = remote;
    const version = latest.contentVersion ?? 0;
    this.applySharedContent(localId, latest);
    // 内容版本推进 → 红点「有更新」（seenVersion 保留，点开详情才标记已读）
    if (version > (local.updatedVersion ?? 0)) {
      this.updateCard(localId, { updatedVersion: version });
    }
    console.info('[Store] 活名片已同步最新：%s', local.refCardId);
  }

  /** 标记活名片已看（点开详情时调用）：清掉列表「有更新」红点 */
  markCardSeen(localId: string): void {
    const local = this.getCard(localId);
    if (!local?.refCardId) return;
    const seen = local.updatedVersion ?? 0;
    if ((local.seenVersion ?? -1) === seen) return;
    this.updateCard(localId, { seenVersion: seen });
    console.info('[Store] 活名片已标为已读：%s（v%d）', localId, seen);
  }

  /** 把源卡最新内容写进本地引用条（归属/引用字段不动） */
  private applySharedContent(localId: string, latest: Card): void {
    this.updateCard(localId, {
      name: latest.name,
      avatar: latest.avatar,
      phone: latest.phone,
      company: latest.company,
      title: latest.title,
      photos: latest.photos,
      note: latest.note,
      template: latest.template,
      customFields: latest.customFields
    });
  }

  // ============ 图谱数据云端载入（graphs / nodes / edges） ============

  /** 启动登录后调用一次：分页拉全三个集合（单次 get 上限 20 条） */
  async loadGraphsFromCloud(): Promise<void> {
    const [graphs, nodes, edges] = await Promise.all([
      this.fetchAll<Graph>('graphs'),
      this.fetchAll<GraphNode>('nodes'),
      this.fetchAll<Edge>('edges')
    ]);
    this.graphs = graphs;
    this.nodes = nodes;
    this.edges = edges;
    this.emit();
    console.info('[Store] 图谱数据已从云端载入：图谱 %d / 节点 %d / 关系 %d', graphs.length, nodes.length, edges.length);
  }

  private async fetchAll<T>(collection: string): Promise<T[]> {
    const PAGE = 20;
    const all: T[] = [];
    for (let skip = 0; ; skip += PAGE) {
      const batch = await dbList<T>(collection, {}, { skip, limit: PAGE });
      all.push(...batch);
      if (batch.length < PAGE) break;
      if (skip >= 1000) break; // 安全阀，防异常时死循环
    }
    return all;
  }

  // ============ 图谱 Graph ============

  listGraphs(): Graph[] {
    return this.graphs;
  }

  getGraph(id: string): Graph | undefined {
    return this.graphs.find(g => g.id === id);
  }

  createGraph(input: GraphInput): Graph {
    const graph: Graph = { ...input, id: uid('graph') };
    this.graphs.push(graph);
    this.emit();
    console.info('[Store] 创建图谱：%s（%s）', graph.name, graph.id);
    this.pushToCloud('创建图谱', () =>
      dbAdd('graphs', { ...graph, ...this.docOwner() })
    );
    return graph;
  }

  updateGraph(id: string, patch: Partial<GraphInput>): void {
    const graph = this.getGraph(id);
    if (!graph) {
      console.error('[Store] 更新图谱失败：不存在 %s', id);
      return;
    }
    Object.assign(graph, patch);
    this.emit();
    this.pushToCloud('更新图谱', () =>
      dbUpdate('graphs', { id }, patch)
    );
  }

  /** 删除图谱：级联删除其全部节点与关系（云端一并清理，不留孤儿数据） */
  deleteGraph(id: string): void {
    this.graphs = this.graphs.filter(g => g.id !== id);
    const removedNodes = this.nodes.filter(n => n.graphId === id);
    this.nodes = this.nodes.filter(n => n.graphId !== id);
    this.edges = this.edges.filter(e => e.graphId !== id);
    this.emit();
    console.info('[Store] 删除图谱：%s（节点 %d 个 / 关系若干）', id, removedNodes.length);
    this.pushToCloud('删除图谱', async () => {
      await dbRemove('graphs', { id });
      await dbRemove('nodes', { graphId: id });
      await dbRemove('edges', { graphId: id });
    });
  }

  // ============ 节点 Node ============

  listNodes(graphId?: string): GraphNode[] {
    return graphId ? this.nodes.filter(n => n.graphId === graphId) : this.nodes;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.find(n => n.id === id);
  }

  createNode(input: NodeInput): GraphNode {
    const node: GraphNode = { ...input, id: uid('node') };
    this.nodes.push(node);
    this.emit();
    this.pushToCloud('创建节点', () =>
      dbAdd('nodes', { ...node, ...this.docOwner() })
    );
    return node;
  }

  updateNode(id: string, patch: Partial<NodeInput>): void {
    const node = this.getNode(id);
    if (!node) {
      console.error('[Store] 更新节点失败：不存在 %s', id);
      return;
    }
    Object.assign(node, patch);
    this.emit();
    this.pushToCloud('更新节点', () =>
      dbUpdate('nodes', { id }, patch)
    );
  }

  // ---- 布局坐标持久化（B 方案）：拖动结束调用，防抖合并写云端 ----

  private layoutDirty = new Map<string, { x: number; y: number; pinned?: boolean }>();
  private layoutTimer: ReturnType<typeof setTimeout> | null = null;

  /** 保存节点布局坐标（内存立即生效，云端防抖 400ms 合并写入） */
  saveNodeLayout(id: string, x: number, y: number, pinned: boolean): void {
    this.layoutDirty.set(id, { x, y, pinned });
    const node = this.getNode(id);
    if (node) Object.assign(node, { x, y, pinned });
    if (this.layoutTimer) clearTimeout(this.layoutTimer);
    this.layoutTimer = setTimeout(() => this.flushNodeLayout(), 400);
  }

  private flushNodeLayout(): void {
    this.layoutTimer = null;
    const entries = Array.from(this.layoutDirty.entries());
    if (!entries.length) return;
    this.layoutDirty.clear();
    entries.forEach(([id, pos]) => {
      this.pushToCloud('保存节点布局', () =>
        dbUpdate('nodes', { id }, pos)
      );
    });
    console.info('[Store] 节点布局已保存：%d 个', entries.length);
  }

  /** 删除节点：同步删除其所有关系（云端一并清理） */
  deleteNode(id: string): void {
    this.nodes = this.nodes.filter(n => n.id !== id);
    const removedEdgeIds = this.edges.filter(e => e.source === id || e.target === id).map(e => e.id);
    this.edges = this.edges.filter(e => e.source !== id && e.target !== id);
    this.emit();
    this.pushToCloud('删除节点', async () => {
      await dbRemove('nodes', { id });
      // 级联删关系：分次按 id 删（小程序端 where().remove() 单次条件表达力有限）
      for (const edgeId of removedEdgeIds) {
        await dbRemove('edges', { id: edgeId });
      }
    });
  }

  // ============ 关系 Edge ============

  listEdges(graphId?: string): Edge[] {
    return graphId ? this.edges.filter(e => e.graphId === graphId) : this.edges;
  }

  getEdge(id: string): Edge | undefined {
    return this.edges.find(e => e.id === id);
  }

  createEdge(input: EdgeInput): Edge {
    const edge: Edge = { ...input, id: uid('edge') };
    this.edges.push(edge);
    this.emit();
    this.pushToCloud('创建关系', () =>
      dbAdd('edges', { ...edge, ...this.docOwner() })
    );
    return edge;
  }

  updateEdge(id: string, patch: Partial<EdgeInput>): void {
    const edge = this.getEdge(id);
    if (!edge) {
      console.error('[Store] 更新关系失败：不存在 %s', id);
      return;
    }
    Object.assign(edge, patch);
    this.emit();
    this.pushToCloud('更新关系', () =>
      dbUpdate('edges', { id }, patch)
    );
  }

  deleteEdge(id: string): void {
    this.edges = this.edges.filter(e => e.id !== id);
    this.emit();
    this.pushToCloud('删除关系', () =>
      dbRemove('edges', { id })
    );
  }

  // ============ 派生查询 ============

  /** 节点对应的名片（匿名节点返回 undefined） */
  getCardOfNode(nodeId: string): Card | undefined {
    const node = this.getNode(nodeId);
    return node?.cardId ? this.getCard(node.cardId) : undefined;
  }

  /** 名片出现在哪些图谱里（详情页"所属图谱"展示） */
  listGraphsOfCard(cardId: string): Graph[] {
    const graphIds = new Set(this.nodes.filter(n => n.cardId === cardId).map(n => n.graphId));
    return this.graphs.filter(g => graphIds.has(g.id));
  }

  /** 图谱类型默认布局用的关系标签集合由 mock/presets 提供，这里按类型取图谱 */
  listGraphsByType(type: GraphType): Graph[] {
    return this.graphs.filter(g => g.type === type);
  }
}

export const store = new Store();
