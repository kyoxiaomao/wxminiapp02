import Taro from '@tarojs/taro'

/**
 * 云函数调用：只走真实 CloudBase，不做任何 mock 兜底
 * 出错直接抛出，暴露问题便于开发调试
 */
export async function callFunction<T = any>(
  name: string,
  data?: Record<string, any>
): Promise<T> {
  const res = await Taro.cloud.callFunction({ name, data })
  const result = res.result as { code: number; message: string; data: T }
  if (result.code !== 0) {
    console.error(`[Cloud] ${name} failed:`, result.message)
    throw new Error(result.message || '请求失败')
  }
  return result.data
}

export function getDatabase() {
  return Taro.cloud.database()
}

/**
 * 上传文件到云存储：返回 fileID（cloud:// 开头，Image 组件可直接展示）
 * 出错直接抛出，不做任何兜底
 */
export async function uploadFile(cloudPath: string, filePath: string): Promise<string> {
  const res = await Taro.cloud.uploadFile({ cloudPath, filePath })
  console.info('[Cloud] 文件已上传：%s → %s', cloudPath, res.fileID)
  return res.fileID
}

// ============ 统一数据访问层：客户端 SDK 直连集合（数据归属当前 openid） ============

export async function dbList<T = any>(
  collection: string,
  query: Record<string, any> = {},
  opts?: { skip?: number; limit?: number }
): Promise<T[]> {
  const hasQuery = Object.keys(query).length > 0
  let q: any = hasQuery ? getDatabase().collection(collection).where(query) : getDatabase().collection(collection)
  if (opts?.skip) q = q.skip(opts.skip)
  if (opts?.limit) q = q.limit(opts.limit)
  const res = await q.get()
  return res.data as T[]
}

export async function dbAdd(collection: string, data: Record<string, any>): Promise<void> {
  await getDatabase().collection(collection).add({ data })
}

// Taro 的类型里 where() 之后没有 update / remove（微信 SDK 运行时有），这里用 any
export async function dbUpdate(
  collection: string,
  query: Record<string, any>,
  patch: Record<string, any>
): Promise<void> {
  const q: any = getDatabase().collection(collection).where(query)
  await q.update({ data: patch })
}

export async function dbRemove(collection: string, query: Record<string, any>): Promise<void> {
  const q: any = getDatabase().collection(collection).where(query)
  await q.remove()
}
