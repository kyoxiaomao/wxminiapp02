import Taro from '@tarojs/taro'
import { store } from '@/store'
import { callFunction, getDatabase, setDemoCloudMode } from './cloud'
import type { UserProfile } from '@/types'

/** CloudBase 环境 ID（项目唯一真实环境，来自 tcb env list，严禁编造） */
export const CLOUD_ENV_ID = 'mingpiantupu-d1gbmi23j8988d532'

/** login 云函数返回数据 */
interface LoginData {
  openid: string
  appid: string
  unionid: string
  claimed: number
  /** 是否已完成首登建名片引导 */
  onboarded: boolean
  /** 用户资料（引导完成后写入） */
  profile: UserProfile | null
}

let loginPromise: Promise<LoginData> | null = null

/**
 * 云开发初始化（应用启动时调用一次）
 * - traceUser: true 让 CloudBase 将请求与当前微信用户关联
 */
export function initCloud(): void {
  Taro.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
  console.info('[Auth] CloudBase 已初始化，env:', CLOUD_ENV_ID)
}

/**
 * 获取登录数据（openid / 首登引导状态）
 * - 小程序 CloudBase 天然免登录：openid 由微信在云函数侧自动注入，这里经 login 云函数透出
 * - 结果缓存，整个启动周期只请求一次
 * - 出错直接抛出，不做兜底
 */
function fetchLoginData(): Promise<LoginData> {
  if (!loginPromise) {
    loginPromise = callFunction<LoginData>('login').then(data => {
      console.info('[Auth] 微信登录成功，openid: %s，onboarded: %s', data.openid, data.onboarded)
      return data
    })
  }
  return loginPromise
}

/** 获取当前用户 openid（账号锚点） */
export function getOpenId(): Promise<string> {
  return fetchLoginData().then(data => data.openid)
}

export interface BootstrapResult {
  /** 是否已完成首登建名片引导（false → 需要弹引导页建立我的名片） */
  onboarded: boolean
}

/**
 * 应用启动登录：初始化云 + 拿 openid + 载入云端数据（名片 / 图谱）
 * 失败直接抛出暴露问题（不做静默兜底）
 */
export async function bootstrapAuth(): Promise<BootstrapResult> {
  initCloud()
  const login = await fetchLoginData()
  store.setUserOpenId(login.openid)
  // 演示模式（账号密码登录过）：本地记住，重启直达演示数据（共享 demo_* 集合）
  if (Taro.getStorageSync('demoMode')) {
    store.demoMode = true
    setDemoCloudMode(true)
    console.info('[Auth] 演示模式（上次账号密码登录），直接载入演示数据')
    await Promise.all([store.loadCardsFromCloud(), store.loadGraphsFromCloud()])
    return { onboarded: true }
  }
  // 名片与图谱并行拉取：串行时首屏要等两轮云端往返全完成
  await Promise.all([store.loadCardsFromCloud(), store.loadGraphsFromCloud()])
  return { onboarded: login.onboarded }
}

/** 进入/退出演示模式：本地持久化标记（重启后按此载入共享演示数据） */
export function setDemoMode(on: boolean): void {
  store.demoMode = on
  setDemoCloudMode(on)
  Taro.setStorageSync('demoMode', on)
  console.info('[Auth] 演示模式已%s', on ? '开启' : '关闭')
}

/**
 * 首登引导完成：用户资料写入 users 集合并标记 onboarded
 * - profile 必须用 command.set 整体替换：普通嵌套对象更新会被展开成 profile.xxx 子字段，
 *   而 login 新建的记录 profile=null，会在 null 上建子字段报错（Cannot create field）
 * - 写入失败直接抛出（否则下次启动会重复弹引导）
 */
export async function completeOnboarding(profile: UserProfile): Promise<void> {
  const db = getDatabase()
  await db
    .collection('users')
    .where({ openId: store.userOpenId })
    .update({ data: { onboarded: true, profile: db.command.set(profile) } })
  console.info('[Auth] 首登引导完成，资料已写入 users：', profile.name)
}
