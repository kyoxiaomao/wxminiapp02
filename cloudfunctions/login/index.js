const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** 北京时间 YYYY-MM-DD HH:mm:ss（与文档示例格式一致） */
function beijingNow() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * 登录云函数：返回调用者 openid，认领 mock 迁移数据，记录登录信息
 * - 小程序 CloudBase 天然免登录，身份由微信自动注入，这里只做透出
 * - 认领（开发期一次性）：把迁移进来的测试数据（openId='test-openid'）归属到当前用户，
 *   同时补 _openid 字段，使客户端 SDK 在「仅创建者可读写」权限下可读写
 * - 登录记录：users 集合 upsert（首登写 firstLoginAt，之后只刷 lastLoginAt/loginCount）
 */
exports.main = async () => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext();

  // 非小程序调用（CLI 测试等）无微信上下文，跳过认领避免写坏归属
  if (!OPENID) {
    return { code: 0, message: 'ok', data: { openid: '', appid: APPID || '', unionid: '', claimed: 0 } };
  }

  const db = cloud.database();

  // 认领 mock 数据：仅首次登录时命中（之后 test-openid 文档不存在，更新 0 条）
  let claimed = 0;
  for (const col of ['cards', 'graphs', 'nodes', 'edges']) {
    const r = await db
      .collection(col)
      .where({ openId: 'test-openid' })
      .update({ data: { openId: OPENID, _openid: OPENID } });
    claimed += r.stats.updated;
  }

  // 登录记录 upsert：写挂了不拖死登录（openid 仍要返回），错误随结果带出
  // onboarded/profile：首登建名片引导用（客户端据 onboarded 决定是否弹引导页）
  let loginRecord = null;
  let loginRecordError = '';
  let onboarded = false;
  let profile = null;
  try {
    const users = db.collection('users');
    const now = beijingNow();
    const existing = await users.where({ openId: OPENID }).limit(1).get();
    if (existing.data.length) {
      const doc = existing.data[0];
      await users.where({ openId: OPENID }).update({
        data: { lastLoginAt: now, loginCount: db.command.inc(1) }
      });
      loginRecord = {
        firstLoginAt: doc.firstLoginAt,
        lastLoginAt: now,
        loginCount: (doc.loginCount || 0) + 1
      };
      onboarded = doc.onboarded === true;
      profile = doc.profile || null;
    } else {
      const doc = {
        openId: OPENID,
        firstLoginAt: now,
        lastLoginAt: now,
        loginCount: 1,
        createdAt: now,
        onboarded: false, // 首登建名片引导标记：引导完成后客户端置 true
        profile: null, // { nickname, name, avatar } 引导完成后写入
        _openid: OPENID // 服务端写入需手动补，客户端才能在「仅创建者可读写」下读到
      };
      await users.add({ data: doc });
      loginRecord = { firstLoginAt: now, lastLoginAt: now, loginCount: 1 };
    }
  } catch (err) {
    loginRecordError = String(err && err.message ? err.message : err);
    console.error('[login] users 写入失败:', loginRecordError);
  }

  return {
    code: 0,
    message: 'ok',
    data: {
      openid: OPENID,
      appid: APPID,
      unionid: UNIONID || '',
      claimed,
      loginRecord,
      loginRecordError,
      onboarded,
      profile
    }
  };
};
