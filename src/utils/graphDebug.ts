import Taro from '@tarojs/taro';

/**
 * 图谱画布调试卡点日志（临时排查用，验证后整文件删除）：
 * 内存累积 + 400ms 节流追加落盘到 USER_DATA_PATH/graph_debug_log.json，
 * 同时打 console 兜底。
 *
 * 关键设计（排查教训）：旧版每次启动全量覆盖文件，复现现场的日志会被下一次启动抹掉。
 * 现改为「追加写 + 会话分隔行」，每次启动写一行 SESSION 标记，历史会话保留可回溯；
 * 文件超过 256KB 时清空重开，防止无限膨胀。格式为 JSONL（每行一条 JSON）。
 */

interface DbgEntry {
  t: number; // 绝对时间戳 ms
  at: string; // 相对启动秒数，方便看时序
  ev: string; // 事件名
  [k: string]: unknown;
}

const MAX = 800; // 内存上限（console 回看用）
const MAX_FILE = 256 * 1024; // 文件轮转阈值
const t0 = Date.now();
const logs: DbgEntry[] = [];
const pending: DbgEntry[] = [];
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let filePathLogged = false;

function flush(): void {
  writeTimer = null;
  const batch = pending.splice(0, pending.length);
  if (!batch.length) return;
  try {
    const dir = Taro.env?.USER_DATA_PATH;
    if (!dir) {
      console.warn('[GraphDebug] 无 USER_DATA_PATH，仅 console');
      return;
    }
    const filePath = `${dir}/graph_debug_log.json`;
    const fsm = Taro.getFileSystemManager();
    const header = `==== SESSION ${nowStr()} ====\n`;
    const body = batch.map(e => JSON.stringify(e)).join('\n') + '\n';
    const writeBatch = (create: boolean) => {
      // 微信 fs 的 appendFile 不会自动建文件（ENOENT），首次/轮转后需先 writeFile 创建
      const options = {
        filePath,
        data: (create ? header : '') + body,
        encoding: 'utf8' as const,
        success: () => {
          if (!filePathLogged) {
            filePathLogged = true;
            console.info('[GraphDebug] 日志文件路径：', filePath);
          }
        },
        fail: (err: unknown) => {
          console.warn('[GraphDebug] 写文件失败', err);
        }
      };
      if (create) fsm.writeFile(options);
      else fsm.appendFile(options);
    };
    fsm.stat({
      filePath,
      success: res => {
        const r = res as unknown as { size?: number; stats?: { size?: number } };
        const size = r?.size ?? r?.stats?.size ?? 0;
        if (size > MAX_FILE) fsm.unlink({ filePath, complete: () => writeBatch(true) });
        else writeBatch(false);
      },
      fail: () => writeBatch(true) // 文件不存在：带会话头新建
    });
  } catch (err) {
    console.warn('[GraphDebug] flush 异常', err);
  }
}

function nowStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 记录一条卡点日志：dbg('事件名', { 附加字段 }) */
export function dbg(ev: string, data?: Record<string, unknown>): void {
  const entry: DbgEntry = { t: Date.now(), at: +((Date.now() - t0) / 1000).toFixed(2), ev, ...data };
  logs.push(entry);
  if (logs.length > MAX) logs.shift();
  pending.push(entry);
  console.info('[GraphDebug]', ev, data ?? '');
  if (!writeTimer) writeTimer = setTimeout(flush, 400);
}
