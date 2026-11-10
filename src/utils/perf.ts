/**
 * 启动耗时卡点
 * - 从模块首次加载（≈小程序冷启动）开始计时，输出「当前累计耗时 + 卡点名」
 * - 仅 console.info，不做落盘，避免测量本身拖慢首屏
 */
const T0 = Date.now();

/** 记录一个启动卡点：perfMark('图谱数据载入', { graphs: 3 }) */
export function perfMark(name: string, extra?: Record<string, unknown>): void {
  const cost = Date.now() - T0;
  if (extra) console.info(`[Perf] +${cost}ms ${name}`, extra);
  else console.info(`[Perf] +${cost}ms ${name}`);
}
