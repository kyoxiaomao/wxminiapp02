import { fnvHash } from './forceGraph';

/**
 * 节点头像工具
 * 圆圈内的展示规则：节点关联名片有头像时绘制名片头像照片（graph 页 Canvas 直接绘制），
 * 无头像时白底圆圈写名字；本文件仅保留称谓→性别推断等辅助逻辑。
 */

/** demo 13 人的称谓 → 性别映射（保证与原版视觉一致），未知称谓按 hash 兜底 */
const ROLE_GENDER: Record<string, 'm' | 'f'> = {
  爷爷: 'm', 奶奶: 'f', 爸爸: 'm', 妈妈: 'f', 姑姑: 'f', 姑父: 'm',
  舅舅: 'm', 舅妈: 'f', 我: 'm', 姐姐: 'f', 表哥: 'm', 弟弟: 'm', 妹妹: 'f'
};

export function inferGender(role: string, id: string): 'm' | 'f' {
  return ROLE_GENDER[role] ?? (fnvHash(id) % 2 === 0 ? 'f' : 'm');
}
