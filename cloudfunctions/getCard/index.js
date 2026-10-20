const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** 生成引用条业务 id（cards.id 有全局唯一索引，必须唯一） */
function uid() {
  return `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 内容版本号：按名片内容摘要计算，内容变则变（红点「有更新」判定用） */
function contentVersion(card) {
  const s = JSON.stringify([
    card.name,
    card.phone,
    card.company,
    card.title,
    card.avatar,
    card.note,
    card.template,
    card.customFields,
    card.photos
  ]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * 按 id 读取分享的活名片（服务端读，不受「仅创建者可读写」权限限制）
 * - 活名片机制：内容永远以源卡为准，收礼者每次打开都经此函数拉最新
 * - 仅返回已标记 shared=true 的卡（分享者转发过才公开），未分享的卡读不到
 * - 名片互换（swap=true，收礼者首次收下时调用）：把自己的名片回赠给源卡拥有者，
 *   对方名片列表自动出现收礼者的名片（同样是活名片引用），重复收下走副本刷新不重复建条
 */
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { id, swap } = event || {};
  if (!id) {
    return { code: 1, message: '缺少名片 id', data: null };
  }
  try {
    const db = cloud.database();
    const res = await db.collection('cards').where({ id }).limit(1).get();
    const card = res.data[0];
    if (!card) {
      return { code: 1, message: '名片不存在', data: null };
    }
    if (card.shared !== true) {
      return { code: 1, message: '名片未公开分享', data: null };
    }

    // ---------- 名片互换：把调用者的名片回赠给源卡拥有者 ----------
    // （写入对方名下需服务端操作：对方卡片集是「仅创建者可读写」，客户端写不进）
    if (swap && OPENID && card.openId !== OPENID) {
      try {
        const mineRes = await db.collection('cards').where({ openId: OPENID, isMe: true }).limit(1).get();
        const mine = mineRes.data[0];
        if (mine) {
          const ownerOpenId = card.openId;
          // 自己的名片标记公开，对方才能经本函数拉到最新
          if (mine.shared !== true) {
            await db.collection('cards').doc(mine._id).update({ data: { shared: true } });
          }
          // 回传/写入内容剥掉主键与归属字段
          const { _id: _m, openId: _o1, _openid: _o2, ...mineContent } = mine;
          const mineVersion = contentVersion(mine);
          // 权威去重：对方名下已有指向我名片的引用条则只刷新副本
          const dupRes = await db
            .collection('cards')
            .where({ refCardId: mine.id, openId: ownerOpenId })
            .limit(1)
            .get();
          if (dupRes.data[0]) {
            await db.collection('cards').doc(dupRes.data[0]._id).update({
              data: { ...mineContent, contentVersion: mineVersion }
            });
            console.info('[getCard] 互换：对方已有引用条，刷新副本:', dupRes.data[0].id);
          } else {
            const refDoc = {
              ...mineContent,
              id: uid(),
              source: 'shared',
              refCardId: mine.id,
              isMe: false,
              // 版本字段：回赠即视为「有更新未读」，对方点开详情后清红点
              contentVersion: mineVersion,
              updatedVersion: mineVersion,
              seenVersion: 0,
              openId: ownerOpenId,
              _openid: ownerOpenId,
              createdAt: new Date().toISOString()
            };
            await db.collection('cards').add({ data: refDoc });
            console.info('[getCard] 互换：已回赠名片 %s 给 %s', mine.id, ownerOpenId);
          }
        } else {
          console.info('[getCard] 互换跳过：调用者尚无名片');
        }
      } catch (err) {
        // 互换失败不拖死拉取（收礼者仍能看到名片），错误随日志暴露
        console.error('[getCard] 名片互换失败:', err);
      }
    }

    // 归属字段与数据库主键不回传（_id 回传会导致收礼者插入引用条时主键冲突）
    const { openId, _openid, _id, ...rest } = card;
    // 附带内容版本号：客户端据此判定「有更新」红点
    rest.contentVersion = contentVersion(card);
    console.info('[getCard] 返回分享名片:', id);
    return { code: 0, message: 'ok', data: rest };
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    console.error('[getCard] 读取名片失败:', err);
    return { code: 1, message, data: null };
  }
};
