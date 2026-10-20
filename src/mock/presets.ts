import type { CardTemplate, GraphType, RelationType } from '@/types';

/** 图谱类型预设：创建图谱时按类型预置关系标签与默认布局 */
export interface GraphPreset {
  /** 预置关系标签（S4 关系编辑时可选） */
  relations: string[];
  /** 默认布局：family 用分层树，其余用力导向网络 */
  layout: 'tree' | 'force';
  /** 默认关系类型 */
  defaultRelation: RelationType;
}

export const GRAPH_PRESETS: Record<GraphType, GraphPreset> = {
  family: {
    relations: ['夫妻', '父子', '母子', '父女', '母女', '兄弟', '姐妹', '兄妹', '姐弟'],
    layout: 'tree',
    defaultRelation: 'parent'
  },
  company: {
    relations: ['上级', '下级', '同事', '合伙人', '客户对接'],
    layout: 'force',
    defaultRelation: 'colleague'
  },
  customer: {
    relations: ['负责人', '对接人', '合作伙伴', '转介绍'],
    layout: 'force',
    defaultRelation: 'colleague'
  },
  cars: {
    relations: ['车友', '会长', '队友', '同行'],
    layout: 'force',
    defaultRelation: 'friend'
  },
  fish: {
    relations: ['钓友', '领队', '同伴', '渔具店老板'],
    layout: 'force',
    defaultRelation: 'friend'
  },
  custom: {
    relations: ['相识', '好友', '同学', '邻居'],
    layout: 'force',
    defaultRelation: 'custom'
  }
};

/** 预置字段定义 */
export interface TemplateFieldDef {
  key: string;
  label: string;
  icon: string;
}

/**
 * 风格模板定义：只决定卡片视觉（色条/主题色），不再决定字段显示
 * （字段全量展示，模板 key 复用旧值保持存量数据兼容）
 */
export interface CardTemplateDef {
  key: CardTemplate;
  /** 风格名 */
  label: string;
  icon: string;
  /** 风格主题色（列表色条/角标文字） */
  color: string;
  /** 主题色的浅底（角标背景） */
  colorBg: string;
}

export const CARD_TEMPLATES: CardTemplateDef[] = [
  { key: 'family', label: '淡紫', icon: '🎨', color: '#7d3c98', colorBg: '#efe4f3' },
  { key: 'company', label: '靛蓝', icon: '🎨', color: '#2f6fed', colorBg: '#e8f1fe' },
  { key: 'school', label: '森绿', icon: '🎨', color: '#0f9d58', colorBg: '#e6f6ec' },
  { key: 'custom', label: '暖橙', icon: '🎨', color: '#ff7d00', colorBg: '#fff3e6' }
];

/** 预置字段全集：所有名片全量展示/编辑，不再按模板过滤（称谓除外——称谓归图谱节点） */
export const ALL_PRESET_FIELDS: TemplateFieldDef[] = [
  { key: 'role', label: '称谓', icon: '👪' },
  { key: 'birthday', label: '生日', icon: '🎂' },
  { key: 'wechat', label: '微信号', icon: '💬' },
  { key: 'department', label: '部门', icon: '🗂️' },
  { key: 'workEmail', label: '工作邮箱', icon: '📧' },
  { key: 'schoolName', label: '学校', icon: '🏫' },
  { key: 'college', label: '院系', icon: '📚' },
  { key: 'grade', label: '年级', icon: '🗓️' }
];

/** 全部预置字段 key（用于区分用户自建字段） */
export const PRESET_FIELD_KEYS = new Set(ALL_PRESET_FIELDS.map(f => f.key));

/** 按风格 key 取定义；未知 key 直接报错暴露问题（template 必填，不存在缺省回退） */
export function getCardTemplate(key: CardTemplate): CardTemplateDef {
  const def = CARD_TEMPLATES.find(t => t.key === key);
  if (!def) throw new Error(`[presets] 未知卡片风格: ${key}`);
  return def;
}
