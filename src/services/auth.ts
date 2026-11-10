import Taro from '@tarojs/taro'
import { store } from '@/store'
import { callFunction, dbList, getDatabase, setDemoCloudMode } from './cloud'
import { perfMark } from '@/utils/perf'
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
  /** 是否已完成首登建名片（授权）流程 */
  onboarded: boolean
}

interface UserDoc {
  openId: string
  /** 新人指引是否已自动播放过（防止重启后重播） */
  tutorialSeen?: boolean
}

/**
 * 应用启动登录：初始化云 + 拿 openid + 载入云端数据（名片 / 图谱）
 * - 首登（未授权）用户：静默播种「我的名片」+默认图谱+「我」节点，并准备自动进入新人指引
 * - 失败直接抛出暴露问题（不做静默兜底）
 */
export async function bootstrapAuth(): Promise<BootstrapResult> {
  perfMark('bootstrapAuth 开始')
  initCloud()
  perfMark('Cloud.init 完成')
  // 演示模式只在「账号密码登录」的当前会话内有效：冷启动一律回到真实账号。
  // 历史版本会把 demoMode 持久化在本机，账号密码入口关闭后无法再关闭，
  // 这里进入即清理，避免重启后一直停留在共享演示数据里。
  if (Taro.getStorageSync('demoMode')) {
    Taro.removeStorageSync('demoMode')
    console.info('[Auth] 已清除本机遗留的演示模式标记，本次按真实账号登录')
  }
  store.demoMode = false
  setDemoCloudMode(false)
  // 登录与首屏数据并行：集合读取由客户端 ACL 按当前用户自动限定，不依赖 openid；
  // 账号锚点/首登播种等写操作必须等登录返回后再做
  const loginTask = fetchLoginData().then(data => {
    perfMark('login 云函数返回', { onboarded: data.onboarded })
    return data
  })
  const [login] = await Promise.all([
    loginTask,
    store.loadCardsFromCloud(),
    store.loadGraphsFromCloud()
  ])
  store.setUserOpenId(login.openid)
  store.firstLoginFlow = !login.onboarded
  perfMark('cards/graphs 载入完成', {
    cards: store.listCards().length,
    graphs: store.listGraphs().length
  })
  if (!login.onboarded) {
    // 首登：先把「我的名片 + 我的图谱 + 我节点」静默建好，保证图谱页有内容、
    // 「未完善」节点可点击授权；未看过指引才自动播放，避免杀进程后重播。
    await store.seedFirstLoginAccount()
    perfMark('首登播种完成')
    const [userDoc] = await dbList<UserDoc>('users', { openId: login.openid }, { limit: 1 })
    perfMark('首登状态读取完成', { tutorialSeen: !!userDoc?.tutorialSeen })
    if (!userDoc?.tutorialSeen) {
      store.markFirstLoginTutorialPending()
      console.info('[Auth] 首登用户：准备自动进入新人指引')
    }
  }
  return { onboarded: login.onboarded }
}

/** 标记新人指引已自动播放过（失败只报错，不阻断指引） */
export async function markTutorialSeen(): Promise<void> {
  const db = getDatabase()
  await db
    .collection('users')
    .where({ openId: store.userOpenId })
    .update({ data: { tutorialSeen: true } })
  console.info('[Auth] 新人指引已标记为看过，下次启动不再自动播放')
}

/** 进入/退出演示模式（仅当前会话有效；下次冷启动会回到真实账号） */
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
