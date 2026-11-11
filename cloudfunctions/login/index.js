const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** 北京时间 YYYY-MM-DD HH:mm:ss（与文档示例格式一致） */
function beijingNow() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * 登录云函数：返回调用者 openid 和首登引导状态，记录登录信息
 * - 小程序 CloudBase 天然免登录，身份由微信自动注入，这里只做透出
 * - 登录记录：users 集合 upsert（首登写 firstLoginAt，之后只刷 lastLoginAt/loginCount）
 */
exports.main = async () => {
  const { OPENID } = cloud.getWXContext();

  // 非小程序调用（CLI 测试等）无微信上下文
  if (!OPENID) {
    return { code: 0, message: 'ok', data: { openid: '', onboarded: false } };
  }

  const db = cloud.database();

  // 登录记录 upsert：写挂了不拖死登录（openid 仍要返回），错误写日志
  // onboarded：客户端据此决定是否走首登流程
  let onboarded = false;
  try {
    const users = db.collection('users');
    const now = beijingNow();
    const existing = await users.where({ openId: OPENID }).limit(1).get();
    if (existing.data.length) {
      await users.where({ openId: OPENID }).update({
        data: { lastLoginAt: now, loginCount: db.command.inc(1) }
      });
      onboarded = existing.data[0].onboarded === true;
    } else {
      await users.add({
        data: {
          openId: OPENID,
          firstLoginAt: now,
          lastLoginAt: now,
          loginCount: 1,
          createdAt: now,
          onboarded: false, // 首登建名片引导标记：引导完成后客户端置 true
          profile: null, // 引导完成后写入
          _openid: OPENID // 服务端写入需手动补，客户端才能在「仅创建者可读写」下读到
        }
      });
    }
  } catch (err) {
    console.error('[login] users 写入失败:', err);
  }

  return { code: 0, message: 'ok', data: { openid: OPENID, onboarded } };
};
