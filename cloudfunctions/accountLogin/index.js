const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/** 平台审核用登录账号（改这里即可更换账号密码） */
const ACCOUNTS = {
  demo: 'demo888'
};

/**
 * 平台审核用账号密码登录
 * - 只验证账号密码（轻量），验证通过后客户端进入「演示模式」：
 *   直接读写共享 demo_* 集合（一份演示数据所有测试账号共用，不归属任何 openid）
 * - 不复制数据：demo_* 集合由 migrateDemo 初始化一次，见 cloudfunctions/migrateDemo
 */
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const { account, password } = event || {};
  if (!OPENID) {
    return { code: 1, message: '未获取到微信身份', data: null };
  }
  if (!account || !ACCOUNTS[account] || ACCOUNTS[account] !== password) {
    return { code: 1, message: '账号或密码错误', data: null };
  }

  // 记录登录信息（不改 onboarded：演示模式的进入由客户端 demoMode 标记接管）
  try {
    const db = cloud.database();
    const now = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const users = db.collection('users');
    const uRes = await users.where({ openId: OPENID }).limit(1).get();
    if (uRes.data[0]) {
      await users.where({ openId: OPENID }).update({
        data: { lastLoginAt: now, loginCount: db.command.inc(1), loginMode: 'demo' }
      });
    } else {
      await users.add({
        data: {
          openId: OPENID,
          _openid: OPENID,
          onboarded: false,
          loginMode: 'demo',
          firstLoginAt: now,
          lastLoginAt: now,
          loginCount: 1,
          createdAt: now
        }
      });
    }
  } catch (err) {
    console.error('[accountLogin] 登录记录写入失败（不影响登录）:', err);
  }

  console.info('[accountLogin] 账号密码登录成功:', account);
  return { code: 0, message: 'ok', data: { account, demo: true } };
};
