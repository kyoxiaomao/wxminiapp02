/**
 * 全局实体类型定义（名片图谱 MVP）
 * 数据模型核心原则（需求文档 §4）：
 * 1. 名片全局唯一，图谱节点只存引用（Node.cardId → Card.id）
 * 2. 图谱内昵称是显示层（同一张名片在不同图谱可有不同昵称/称谓）
 */

/** 图谱类型：不同类型预置不同关系标签与默认布局 */
export type GraphType = 'family' | 'company' | 'customer' | 'cars' | 'fish' | 'custom';

/** 图谱类型中文名 */
export const GRAPH_TYPE_LABELS: Record<GraphType, string> = {
  family: '家族',
  company: '公司',
  customer: '客户',
  cars: '车友',
  fish: '钓友',
  custom: '自定义'
};

/** 关系类型：决定连线样式（夫妻实线加粗 / 亲子 / 其他） */
export type RelationType = 'spouse' | 'parent' | 'colleague' | 'friend' | 'custom';

/** 卡片风格模板：只决定卡片视觉（色条/主题色），字段全量展示（key 复用旧值兼容存量数据） */
export type CardTemplate = 'family' | 'company' | 'school' | 'custom';

/** 名片扩展字段（模板预置字段与用户自定义字段统一存放） */
export interface CardField {
  /** 字段标识（role / birthday / wechat…） */
  key: string;
  /** 显示名（称谓 / 生日 / 微信…） */
  label: string;
  /** 行首 emoji 图标 */
  icon: string;
  /** 字段值 */
  value: string;
}

/** 名片：一个人的完整信息，全局唯一实体 */
export interface Card {
  id: string;
  name: string;
  phone: string;
  company: string;
  /** 职位 */
  title: string;
  /** 头像图片地址（mock 阶段用 picsum，后续接云存储） */
  avatar: string;
  /** 名片上的照片集 */
  photos: string[];
  note: string;
  /** 是否是"我的名片"（对外展示的那张，全局唯一） */
  isMe: boolean;
  /** 来源：manual=本人创建/代录，shared=收到的活名片（内容以源卡为准） */
  source?: 'manual' | 'shared';
  /** 活名片引用的源卡 id（source='shared' 时有值；引用条自身 id 也用源卡 id） */
  refCardId?: string;
  /** 是否已公开分享（转发过名片才允许他人经云函数读取） */
  shared?: boolean;
  /** 活名片内容版本号（云函数按内容摘要计算，内容变则变） */
  contentVersion?: number;
  /** 已知的最新内容版本（收下/刷新时记录） */
  updatedVersion?: number;
  /** 已看过的版本（点开详情时记录；updatedVersion > seenVersion → 列表红点「有更新」） */
  seenVersion?: number;
  createdAt: string;
  /** 卡片风格（必填：建卡时必带；只影响视觉，不影响字段显示） */
  template: CardTemplate;
  /** 扩展字段（预置字段 + 用户自定义字段，全量展示） */
  customFields?: CardField[];
}

/** 图谱：特定关系层，如家族 / 公司 / 客户 / 车友 */
export interface Graph {
  id: string;
  name: string;
  type: GraphType;
  /** 类型显示名（type=custom 时用户自定义的类型名，如「球友」；空则用默认标签） */
  typeLabel?: string;
  /** 封面色（S4 画布主色的延伸，列表卡片用） */
  coverColor: string;
  /** 图谱头像（创建时上传，空则下拉面板回退类型 emoji） */
  avatar?: string;
  createdAt: string;
}

/** 图谱节点：一个节点表达一个人，关联一张名片 */
export interface GraphNode {
  id: string;
  graphId: string;
  /** 关联名片；null 表示匿名节点（未关联名片） */
  cardId: string | null;
  /** 称谓 / 角色（族长、长媳、上级…，所有图谱类型统称「称谓」） */
  role: string;
  /** 代际（家族图谱用于分层布局，1 = 第一代） */
  gen?: number;
  /** 布局坐标（世界系，拖动防抖写云端，重建时优先恢复；恢复后仍参与力学） */
  x?: number;
  y?: number;
  /** 显式锁定标记（数据层保留；普通拖动只记坐标不置位，不冻结节点） */
  pinned?: boolean;
}

/** 关系边：两个人之间的一条带标签的关系 */
export interface Edge {
  id: string;
  graphId: string;
  /** 起始节点 id */
  source: string;
  /** 目标节点 id */
  target: string;
  type: RelationType;
  /** 关系标签文案（长子 / 长媳 / 上级…） */
  label: string;
}

/** 新建名片的入参（id 由 store 生成） */
export type CardInput = Omit<Card, 'id'>;
export type GraphInput = Omit<Graph, 'id'>;
export type NodeInput = Omit<GraphNode, 'id'>;
export type EdgeInput = Omit<Edge, 'id'>;

/** 「我的名片」姓名占位（首登一键授权后未填姓名时使用；显示层视为资料未完善） */
export const DEFAULT_MY_CARD_NAME = '微信用户';

/** 用户资料（首登建名片引导收集，写入 users 集合） */
export interface UserProfile {
  /** 微信昵称（<input type="nickname"> 一键填充） */
  nickname: string;
  /** 真实姓名（手填） */
  name: string;
  /** 头像（云存储 fileID） */
  avatar: string;
  /** 手机号（企业主体 getPhoneNumber 授权换取，可手填） */
  phone: string;
  /** 微信号（微信无获取 API，手填） */
  wechat: string;
}
