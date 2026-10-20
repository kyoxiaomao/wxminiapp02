const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const COLS = { cards: 'demo_cards', graphs: 'demo_graphs', nodes: 'demo_nodes', edges: 'demo_edges' };
const MAX_PAGE = 100;

/** 拉全（服务端单次 get 上限 100 条，skip 分页） */
async function fetchAll(db, colName, where, skip = 0) {
  const out = [];
  for (let s = skip; ; s += MAX_PAGE) {
    const res = await db.collection(colName).where(where).skip(s).limit(MAX_PAGE).get();
    out.push(...res.data);
    if (res.data.length < MAX_PAGE) break;
    if (s >= 1000) break;
  }
  return out;
}

/**
 * 演示数据读写网关（平台审核用「账号密码登录」的演示模式数据层）
 * - 操作共享 demo_* 集合（一份演示数据所有测试账号共用，不归属任何 openid）
 * - 服务端操作绕过客户端 ACL，无需把集合权限开成「所有人可读写」
 * - action: list / add / update / remove
 */
exports.main = async (event) => {
  const { collection, action, query, docId, data, limit } = event || {};
  const colName = COLS[collection];
  if (!colName) {
    return { code: 1, message: '未知集合: ' + collection, data: null };
  }
  const db = cloud.database();
  try {
    switch (action) {
      case 'list': {
        const docs = await fetchAll(db, colName, query || {});
        return { code: 0, message: 'ok', data: docs };
      }
      case 'add': {
        const res = await db.collection(colName).add({ data });
        return { code: 0, message: 'ok', data: { _id: res._id } };
      }
      case 'update': {
        if (docId) {
          await db.collection(colName).doc(docId).update({ data });
        } else {
          await db.collection(colName).where(query || {}).update({ data });
        }
        return { code: 0, message: 'ok', data: null };
      }
      case 'remove': {
        if (docId) {
          await db.collection(colName).doc(docId).remove();
        } else {
          const docs = await fetchAll(db, colName, query || {});
          for (const d of docs) await db.collection(colName).doc(d._id).remove();
        }
        return { code: 0, message: 'ok', data: null };
      }
      default:
        return { code: 1, message: '未知操作: ' + action, data: null };
    }
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    console.error('[demoRW] 操作失败:', collection, action, err);
    return { code: 1, message, data: null };
  }
};
