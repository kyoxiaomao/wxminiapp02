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
import { buildTutorialDataset, type TutorialDataset } from '@/tutorial/loader';
import { perfMark } from '@/utils/perf';

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

  /** 首登建名片是否刚完成：图谱页消费一次后自动进入新人指引（本次会话有效） */
  pendingFirstLoginTutorial = false;

  /** 本次会话是否处于首登（未授权）流程：点「未完善」节点先走一键授权 */
  firstLoginFlow = false;

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

  // ============ 新人指引沙箱（只进内存，绝不写云端） ============
  /** 教程进行中：所有写操作只改沙箱数组，pushToCloud 整体短路 */
  tutorialActive = false;
  /** 当前教程批次 id（示例实体 id 前缀 tut-<batch>-） */
  tutorialBatchId = '';
  /** 教程图谱 id */
  tutorialGraphId = '';
  /** 教程「我」节点 id（guide 里 g1 节点） */
  tutorialEgoNodeId = '';
  private tutorialCards: Card[] = [];
  private tutorialNodes: GraphNode[] = [];
  private tutorialEdges: Edge[] = [];
  private tutorialGraphs: Graph[] = [];
  private tutorialDataset: TutorialDataset | null = null;

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
    perfMark('卡片首批载入完成', { count: this.cards.length });
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
      perfMark('卡片后台补全完成', { count: this.cards.length });
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

  /** 首登建名片完成：标记图谱页自动进入新人指引（emit 让已挂载的图谱页立即感知） */
  markFirstLoginTutorialPending(): void {
    this.pendingFirstLoginTutorial = true;
    this.emit();
  }

  /**
   * 首登播种：确保有「我的名片」+ 一张图谱 + 图谱里的「我」节点
   * - 名片必须先写云端（节点要引用名片 id）
   * - 图谱/节点沿用既有「内存 + 云端穿透」写路径
   * - 幂等：已有我的名片 / 已有图谱时不会重复创建
   */
  async seedFirstLoginAccount(): Promise<void> {
    let my = this.getMyCard();
    if (!my) {
      my = await this.createCard({
        name: '',
        template: 'custom',
        customFields: [],
        phone: '',
        company: '',
        title: '',
        avatar: '',
        photos: [],
        note: '',
        isMe: true,
        createdAt: new Date().toISOString()
      });
      console.info('[Store] 首登播种：已创建我的名片 %s', my.id);
      perfMark('我的名片创建完成');
    }
    if (this.listGraphs().length === 0) {
      const graph = this.createGraph({
        name: '我的图谱',
        type: 'custom',
        typeLabel: '',
        coverColor: '#d9c9dd',
        createdAt: new Date().toISOString(),
        avatar: ''
      });
      this.createNode({ graphId: graph.id, cardId: my.id, role: '我', gen: 1 });
      console.info('[Store] 首登播种：已创建图谱 %s 与「我」节点', graph.id);
      perfMark('默认图谱与节点创建完成');
    }
  }

  /** 登录成功后写入账号锚点（替换本地 mock 用户） */
  setUserOpenId(openId: string): void {
    this.userOpenId = openId;
    console.info('[Store] 账号锚点已更新：userOpenId = %s', openId);
    this.emit();
  }

  // ============ 名片 Card ============

  listCards(): Card[] {
    return this.tutorialActive ? this.cards.concat(this.tutorialCards) : this.cards;
  }

  getCard(id: string): Card | undefined {
    return this.cards.find(c => c.id === id) || this.tutorialCards.find(c => c.id === id);
  }

  /** 我的名片只看真实数据：教程示例卡（isMe 已置 false）永不顶掉用户名片 */
  getMyCard(): Card | undefined {
    return this.cards.find(c => c.isMe);
  }

  /** 按姓名 / 电话 / 公司模糊搜索 */
  searchCards(keyword: string): Card[] {
    const all = this.listCards();
    const kw = keyword.trim().toLowerCase();
    if (!kw) return all;
    return all.filter(c =>
      [c.name, c.phone, c.company, c.title].some(v => v.toLowerCase().includes(kw))
    );
  }

  /**
   * 新建名片：先落云端再进内存（保证「界面看到的=云端保存的」）
   * 云端失败直接抛出，不做假持久化（否则重启后凭空消失）
   */
  async createCard(input: CardInput): Promise<Card> {
    const card: Card = { ...input, id: uid('card') };
    if (this.tutorialActive) {
      // 教程期间只进沙箱，不写云端
      this.tutorialCards.push(card);
      this.emit();
      return card;
    }
    await dbAdd('cards', { ...card, ...this.docOwner() });
    this.cards.push(card);
    this.emit();
    console.info('[Store] 创建名片：%s（%s）已持久化', card.name, card.id);
    return card;
  }

  updateCard(id: string, patch: Partial<CardInput>): void {
    const tut = this.tutorialCards.find(c => c.id === id);
    if (tut) {
      Object.assign(tut, patch);
      this.emit();
      return;
    }
    const card = this.cards.find(c => c.id === id);
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
    if (this.tutorialCards.some(c => c.id === id)) {
      this.tutorialCards = this.tutorialCards.filter(c => c.id !== id);
      this.tutorialNodes = this.tutorialNodes.map(n => (n.cardId === id ? { ...n, cardId: null } : n));
      this.emit();
      return;
    }
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
    // 教程模式：沙箱数据绝不写云端
    if (this.tutorialActive) return;
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
    perfMark('图谱数据载入完成', { graphs: graphs.length, nodes: nodes.length, edges: edges.length });
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
    return this.tutorialActive ? this.graphs.concat(this.tutorialGraphs) : this.graphs;
  }

  getGraph(id: string): Graph | undefined {
    return this.graphs.find(g => g.id === id) || this.tutorialGraphs.find(g => g.id === id);
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
    const all = this.tutorialActive ? this.nodes.concat(this.tutorialNodes) : this.nodes;
    return graphId ? all.filter(n => n.graphId === graphId) : all;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.find(n => n.id === id) || this.tutorialNodes.find(n => n.id === id);
  }

  createNode(input: NodeInput): GraphNode {
    const node: GraphNode = { ...input, id: uid('node') };
    if (this.tutorialActive && input.graphId === this.tutorialGraphId) {
      this.tutorialNodes.push(node);
      this.emit();
      return node;
    }
    this.nodes.push(node);
    this.emit();
    this.pushToCloud('创建节点', () =>
      dbAdd('nodes', { ...node, ...this.docOwner() })
    );
    return node;
  }

  updateNode(id: string, patch: Partial<NodeInput>): void {
    const tut = this.tutorialNodes.find(n => n.id === id);
    if (tut) {
      Object.assign(tut, patch);
      this.emit();
      return;
    }
    const node = this.nodes.find(n => n.id === id);
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
    if (this.tutorialNodes.some(n => n.id === id)) {
      this.tutorialNodes = this.tutorialNodes.filter(n => n.id !== id);
      this.tutorialEdges = this.tutorialEdges.filter(e => e.source !== id && e.target !== id);
      this.emit();
      return;
    }
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
    const all = this.tutorialActive ? this.edges.concat(this.tutorialEdges) : this.edges;
    return graphId ? all.filter(e => e.graphId === graphId) : all;
  }

  getEdge(id: string): Edge | undefined {
    return this.edges.find(e => e.id === id) || this.tutorialEdges.find(e => e.id === id);
  }

  createEdge(input: EdgeInput): Edge {
    const edge: Edge = { ...input, id: uid('edge') };
    if (this.tutorialActive && input.graphId === this.tutorialGraphId) {
      this.tutorialEdges.push(edge);
      this.emit();
      return edge;
    }
    this.edges.push(edge);
    this.emit();
    this.pushToCloud('创建关系', () =>
      dbAdd('edges', { ...edge, ...this.docOwner() })
    );
    return edge;
  }

  updateEdge(id: string, patch: Partial<EdgeInput>): void {
    const tut = this.tutorialEdges.find(e => e.id === id);
    if (tut) {
      Object.assign(tut, patch);
      this.emit();
      return;
    }
    const edge = this.edges.find(e => e.id === id);
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
    if (this.tutorialEdges.some(e => e.id === id)) {
      this.tutorialEdges = this.tutorialEdges.filter(e => e.id !== id);
      this.emit();
      return;
    }
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
    const graphIds = new Set(this.listNodes().filter(n => n.cardId === cardId).map(n => n.graphId));
    return this.listGraphs().filter(g => graphIds.has(g.id));
  }

  /** 图谱类型默认布局用的关系标签集合由 mock/presets 提供，这里按类型取图谱 */
  listGraphsByType(type: GraphType): Graph[] {
    return this.listGraphs().filter(g => g.type === type);
  }

  // ============ 新人指引沙箱 ============

  /** 教程节点 code（p1/g1…）→ 当前批次实体 id */
  tutorialNodeIdOf(code: string): string {
    return this.tutorialDataset?.codeToNodeId.get(code) || '';
  }

  tutorialCardIdOf(code: string): string {
    return this.tutorialDataset?.codeToCardId.get(code) || '';
  }

  /** 判断某名片是否示例数据（页面角标 / 禁止删除用） */
  isTutorialCard(id: string): boolean {
    return this.tutorialCards.some(c => c.id === id);
  }

  isTutorialNode(id: string): boolean {
    return this.tutorialNodes.some(n => n.id === id);
  }

  /**
   * 载入家族示例数据到沙箱（只取 family，不含公司图谱）
   * @param batchId 续播时传入快照里的批次 id，保证实体 id 与上次一致
   */
  loadTutorialFamily(batchId?: string): void {
    this.resetTutorial();
    const ds = buildTutorialDataset(batchId);
    this.tutorialDataset = ds;
    this.tutorialGraphs = [ds.graph];
    this.tutorialCards = ds.cards;
    this.tutorialNodes = ds.nodes;
    this.tutorialEdges = ds.edges;
    this.tutorialBatchId = ds.batchId;
    this.tutorialGraphId = ds.graph.id;
    this.tutorialEgoNodeId = ds.codeToNodeId.get('g1') || '';
    this.tutorialActive = true;
    this.emit();
    console.info(
      '[Store] 教程沙箱已载入：批次 %s（图谱 1 / 节点 %d / 关系 %d / 名片 %d）',
      ds.batchId,
      ds.nodes.length,
      ds.edges.length,
      ds.cards.length
    );
  }

  /** 续播重建：把练习节点/关系按快照恢复进沙箱 */
  restoreTutorialPractice(
    nodeId: string,
    edgeId: string,
    sourceNodeId: string,
    cardId: string | null
  ): void {
    if (!this.tutorialActive || !nodeId) return;
    if (!this.tutorialNodes.some(n => n.id === nodeId)) {
      this.tutorialNodes.push({
        id: nodeId,
        graphId: this.tutorialGraphId,
        cardId,
        role: '成员',
        gen: 3
      });
    }
    if (edgeId && !this.tutorialEdges.some(e => e.id === edgeId)) {
      this.tutorialEdges.push({
        id: edgeId,
        graphId: this.tutorialGraphId,
        source: sourceNodeId,
        target: nodeId,
        type: 'custom',
        label: '关系'
      });
    }
    this.emit();
  }

  /** 清空沙箱（不写云端、不删真实数据） */
  clearTutorialData(): void {
    if (!this.tutorialActive) return;
    this.resetTutorial();
    this.emit();
    console.info('[Store] 教程沙箱已清空（真实数据未触碰）');
  }

  /** 内部复位：不做 emit，供 load/clear 复用 */
  private resetTutorial(): void {
    this.tutorialActive = false;
    this.tutorialBatchId = '';
    this.tutorialGraphId = '';
    this.tutorialEgoNodeId = '';
    this.tutorialCards = [];
    this.tutorialNodes = [];
    this.tutorialEdges = [];
    this.tutorialGraphs = [];
    this.tutorialDataset = null;
  }
}

export const store = new Store();
