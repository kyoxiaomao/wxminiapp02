const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 换取手机号（企业主体能力）
 * - 入参 code：<Button open-type="getPhoneNumber"> 授权返回的一次性凭证
 * - 服务端用 code 换真实手机号（微信按次计费，仅用户点授权时调用一次）
 * - 出错返回 code:1 随 message 抛给客户端，不做兜底假数据
 */
exports.main = async (event) => {
  const { code } = event || {};
  if (!code) {
    return { code: 1, message: '缺少授权 code', data: null };
  }
  try {
    const res = await cloud.openapi.phonenumber.getPhoneNumber({ code });
    const info = res.phoneInfo || {};
    const phoneNumber = info.purePhoneNumber || info.phoneNumber || '';
    console.info('[getPhone] 手机号换取成功:', phoneNumber);
    return {
      code: 0,
      message: 'ok',
      data: { phoneNumber, countryCode: info.countryCode || '' }
    };
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    console.error('[getPhone] 换取手机号失败:', err);
    return { code: 1, message, data: null };
  }
};
