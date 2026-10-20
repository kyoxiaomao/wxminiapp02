const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** 演示数据源账号（模拟器登录、带完整演示数据的账号），严禁编造其他 openId */
const DEMO_OPENID = 'oNC1A3eRkE08AOlzeeaCCz6d6INo';

/** 服务端分页拉全（单次 get 上限 100 条） */
async function fetchAll(db, collection, where) {
  const out = [];
  for (let skip = 0; ; skip += 100) {
    const res = await db.collection(collection).where(where).skip(skip).limit(100).get();
    out.push(...res.data);
    if (res.data.length < 100) break;
    if (skip >= 1000) break;
  }
  return out;
}

/** 确保集合存在（已存在忽略报错） */
async function ensureCollection(db, name) {
  try {
    await db.createCollection(name);
  } catch (_) {
    // 已存在
  }
}

/**
 * 一次性运维工具：初始化共享演示数据
 * - 把演示账号（DEMO_OPENID）的卡片/图谱/节点/关系复制进 demo_* 集合
 * - 复制出的数据不带 openId/_openid（不归属任何人），所有测试账号共用这一份
 * - 幂等：demo_cards 已有数据时跳过（防止误重复执行），传 force=true 则先清空重建
 * - 集合权限：demo_cards / demo_graphs / demo_nodes / demo_edges 需在控制台设为
 *   「所有人可读写」（仅假演示数据，无隐私风险），客户端才能读写
 */
exports.main = async (event) => {
  const { force } = event || {};
  const db = cloud.database();
  try {
    for (const col of ['demo_cards', 'demo_graphs', 'demo_nodes', 'demo_edges']) {
      await ensureCollection(db, col);
    }
    const countRes = await db.collection('demo_cards').count();
    if (countRes.total > 0 && !force) {
      return { code: 0, message: 'ok', data: { skipped: true, reason: 'demo 数据已存在', count: countRes.total } };
    }
    if (force) {
      for (const col of ['demo_cards', 'demo_graphs', 'demo_nodes', 'demo_edges']) {
        const all = await fetchAll(db, col, {});
        for (const doc of all) await db.collection(col).doc(doc._id).remove();
      }
    }

    const [cards, graphs, nodes, edges] = await Promise.all([
      fetchAll(db, 'cards', { openId: DEMO_OPENID }),
      fetchAll(db, 'graphs', { openId: DEMO_OPENID }),
      fetchAll(db, 'nodes', { openId: DEMO_OPENID }),
      fetchAll(db, 'edges', { openId: DEMO_OPENID })
    ]);

    // 剥掉归属与主键：共享数据不归属任何 openid
    const strip = ({ _id, openId, _openid, ...rest }) => rest;

    for (const doc of cards) await db.collection('demo_cards').add({ data: strip(doc) });
    for (const doc of graphs) await db.collection('demo_graphs').add({ data: strip(doc) });
    for (const doc of nodes) await db.collection('demo_nodes').add({ data: strip(doc) });
    for (const doc of edges) await db.collection('demo_edges').add({ data: strip(doc) });

    console.info('[migrateDemo] 演示数据已初始化：卡片 %d / 图谱 %d / 节点 %d / 关系 %d', cards.length, graphs.length, nodes.length, edges.length);
    return {
      code: 0,
      message: 'ok',
      data: { skipped: false, cards: cards.length, graphs: graphs.length, nodes: nodes.length, edges: edges.length }
    };
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    console.error('[migrateDemo] 初始化失败:', err);
    return { code: 1, message, data: null };
  }
};
