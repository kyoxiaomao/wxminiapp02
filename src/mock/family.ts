import type { Card, Edge, Graph, GraphNode } from '@/types';

/**
 * 陈氏家族假数据（与 index.html demo 的家族完全一致：13 人、三代、12 条关系）
 * 单人一行定义，派生名片 / 节点 / 关系，便于 S3-S6 直接使用。
 */

interface MemberDef {
  /** 成员代号（p1/c1/g1…，与 index.html demo 对齐） */
  code: string;
  name: string;
  /** 称谓 / 角色 */
  role: string;
  /** 代际：1 族长辈 / 2 子女辈 / 3 孙辈 */
  gen: 1 | 2 | 3;
  gender: 'm' | 'f';
  company: string;
  title: string;
  phone: string;
  note: string;
}

const MEMBERS: MemberDef[] = [
  { code: 'p1', name: '陈鸿儒', role: '爷爷', gen: 1, gender: 'm', company: '原市教育局', title: '退休教师', phone: '138 0571 0001', note: '爷爷，每年清明主持祭祖，书法爱好者。' },
  { code: 'p2', name: '林淑芬', role: '奶奶', gen: 1, gender: 'f', company: '原市纺织厂', title: '退休职工', phone: '138 0571 0002', note: '奶奶，做得一手好菜，家庭聚会的固定主厨。' },

  { code: 'c1', name: '陈志远', role: '爸爸', gen: 2, gender: 'm', company: '远航科技', title: '工程师', phone: '138 0571 1001', note: '爸爸，定居杭州，在远航科技做工程师。' },
  { code: 's1', name: '苏婉清', role: '妈妈', gen: 2, gender: 'f', company: '自由职业', title: '平面设计师', phone: '138 0571 1002', note: '妈妈，在杭州经营自己的设计工作室。' },
  { code: 'c2', name: '陈志玲', role: '姑姑', gen: 2, gender: 'f', company: '市人民医院', title: '会计', phone: '138 0571 1003', note: '姑姑，留在本地照顾爷爷奶奶。' },
  { code: 's2', name: '周建国', role: '姑父', gen: 2, gender: 'm', company: '远航科技', title: '销售经理', phone: '138 0571 1004', note: '姑父，商务部销售经理，家族聚会气氛担当。' },
  { code: 'c3', name: '陈志明', role: '舅舅', gen: 2, gender: 'm', company: '市第一医院', title: '外科医生', phone: '138 0571 1005', note: '舅舅，定居南京，家族健康顾问。' },
  { code: 's3', name: '吴雅琴', role: '舅妈', gen: 2, gender: 'f', company: '南京外国语学校', title: '教师', phone: '138 0571 1006', note: '舅妈，教高中语文。' },

  { code: 'g1', name: '陈嘉禾', role: '我', gen: 3, gender: 'm', company: '浙江大学', title: '计算机系本科生', phone: '138 0571 2001', note: '我，计算机系大二，小程序的实际使用者。' },
  { code: 'g2', name: '陈嘉悦', role: '姐姐', gen: 3, gender: 'f', company: '杭州第二中学', title: '高中生', phone: '138 0571 2002', note: '姐姐，高二，舞蹈特长。' },
  { code: 'g3', name: '林思远', role: '表哥', gen: 3, gender: 'm', company: '南师大附中', title: '初中生', phone: '138 0571 2003', note: '表哥，随姑父姓林，篮球打得好。' },
  { code: 'g4', name: '陈嘉言', role: '弟弟', gen: 3, gender: 'm', company: '南京芳草园小学', title: '小学生', phone: '138 0571 2004', note: '弟弟，小学四年级，奥数苗子。' },
  { code: 'g5', name: '陈嘉宁', role: '妹妹', gen: 3, gender: 'f', company: '南京芳草园小学', title: '小学生', phone: '138 0571 2005', note: '妹妹，小学二年级，喜欢画画。' }
];

/** 头像用云存储 fileID（avatars/seed/，AI 生成人像，与 seed 云函数同一份映射；一张卡一个，全局不重复） */
const BUCKET = '6d69-mingpiantupu-d1gbmi23j8988d532-1300901896';
const avatarOf = (code: string) =>
  `cloud://mingpiantupu-d1gbmi23j8988d532.${BUCKET}/avatars/seed/avatar-card-${code}.jpg`;

/** 家族模板预置的生日（与 MEMBERS 顺序一致） */
const BIRTHDAYS = [
  '1948-03-12', '1950-07-08',
  '1975-11-23', '1978-04-17', '1980-09-02', '1979-06-15', '1982-12-30', '1984-02-19',
  '2005-08-21', '2008-10-05', '2010-01-18', '2014-05-27', '2016-09-14'
];

/** 家族成员微信号（虚构，与 MEMBERS 顺序一致） */
const WECHAT_IDS = [
  'chr-1948', 'lsf-1950',
  'czy-1975', 'swq-1978', 'czl-1980', 'zjg-1979', 'czm-1982', 'wyq-1984',
  'jiahe-2005', 'jiayue-2008', 'siyuan-2010', 'jiayan-2014', 'jianing-2016'
];

/** 关系定义（source/target 用成员代号，与 index.html demo 的 12 条边一致） */
const RELATIONS: { from: string; to: string; type: 'spouse' | 'parent'; label: string }[] = [
  // 夫妻 ×4
  { from: 'p1', to: 'p2', type: 'spouse', label: '夫妻' },
  { from: 'c1', to: 's1', type: 'spouse', label: '夫妻' },
  { from: 'c2', to: 's2', type: 'spouse', label: '夫妻' },
  { from: 'c3', to: 's3', type: 'spouse', label: '夫妻' },
  // 父母 → 子女 ×8
  { from: 'p1', to: 'c1', type: 'parent', label: '长子' },
  { from: 'p1', to: 'c2', type: 'parent', label: '长女' },
  { from: 'p1', to: 'c3', type: 'parent', label: '次子' },
  { from: 'c1', to: 'g1', type: 'parent', label: '长子' },
  { from: 'c1', to: 'g2', type: 'parent', label: '女儿' },
  { from: 'c2', to: 'g3', type: 'parent', label: '儿子' },
  { from: 'c3', to: 'g4', type: 'parent', label: '儿子' },
  { from: 'c3', to: 'g5', type: 'parent', label: '女儿' }
];

const nodeId = (code: string) => `node-${code}`;
const cardId = (code: string) => `card-${code}`;

/** 图谱 1 个 */
export const familyGraph: Graph = {
  id: 'graph-family',
  name: '陈氏家族图谱',
  type: 'family',
  coverColor: '#d9c9dd',
  createdAt: '2026-01-20 10:00:00'
};

/** 名片 13 张（全字段：称谓 + 生日 + 微信号） */
export const familyCards: Card[] = MEMBERS.map((m, i) => ({
  id: cardId(m.code),
  name: m.name,
  phone: m.phone,
  company: m.company,
  title: m.code === 'g1' ? '计算机系本科生' : m.title,
  avatar: avatarOf(m.code),
  photos: [],
  note: m.note,
  // 设定"长孙"为本小程序使用者的名片
  isMe: m.code === 'g1',
  createdAt: '2026-01-20 10:00:00',
  template: 'family' as const,
  customFields: [
    { key: 'role', label: '称谓', icon: '👪', value: m.role },
    { key: 'birthday', label: '生日', icon: '🎂', value: BIRTHDAYS[i] ?? '' },
    { key: 'wechat', label: '微信号', icon: '💬', value: WECHAT_IDS[i] ?? '' }
  ]
}));

/** 节点 13 个：每个成员一个节点，显示名取关联名片姓名，角色=称谓 */
export const familyNodes: GraphNode[] = MEMBERS.map(m => ({
  id: nodeId(m.code),
  graphId: familyGraph.id,
  cardId: cardId(m.code),
  role: m.role,
  gen: m.gen
}));

/** 关系 12 条 */
export const familyEdges: Edge[] = RELATIONS.map((r, i) => ({
  id: `edge-family-${i + 1}`,
  graphId: familyGraph.id,
  source: nodeId(r.from),
  target: nodeId(r.to),
  type: r.type,
  label: r.label
}));

// ============ 公司图谱「远航科技」（只含公司名片 + 我；与 seed 云函数一致） ============

/** 公司图谱 1 个 */
export const companyGraph: Graph = {
  id: 'graph-company',
  name: '远航科技',
  type: 'company',
  coverColor: '#c9d6e8',
  createdAt: '2026-03-01 09:00:00'
};

/** 公司节点 11 个：我（card-g1）+ 公司同事 b1~b4/m1~m3 + 家族抽 3 人（c1/s1/s2 与家族图谱双归属），全员远航科技内部 */
export const companyNodes: GraphNode[] = [
  { id: 'node-company-me', graphId: companyGraph.id, cardId: 'card-g1', role: '我' },
  { id: 'node-company-b1', graphId: companyGraph.id, cardId: 'card-b1', role: '技术总监' },
  { id: 'node-company-b2', graphId: companyGraph.id, cardId: 'card-b2', role: '产品经理' },
  { id: 'node-company-b3', graphId: companyGraph.id, cardId: 'card-b3', role: '商务总监' },
  { id: 'node-company-b4', graphId: companyGraph.id, cardId: 'card-b4', role: '行政主管' },
  { id: 'node-company-m1', graphId: companyGraph.id, cardId: 'card-m1', role: '研发实习生' },
  { id: 'node-company-m2', graphId: companyGraph.id, cardId: 'card-m2', role: '设计实习生' },
  { id: 'node-company-m3', graphId: companyGraph.id, cardId: 'card-m3', role: '运营实习生' },
  { id: 'node-company-c1', graphId: companyGraph.id, cardId: 'card-c1', role: '工程师' },
  { id: 'node-company-s1', graphId: companyGraph.id, cardId: 'card-s1', role: '设计顾问' },
  { id: 'node-company-s2', graphId: companyGraph.id, cardId: 'card-s2', role: '销售经理' }
];

/**
 * 公司职级汇报树 10 条（下属→上级，标签「上级」，纯树无闭环）
 * 何俊杰为根：陈志远/郑晓岚/苏婉清/马跃/韩雪 直接下属，实习生归各自带教，周建国归马跃
 */
export const companyEdges: Edge[] = [
  { id: 'edge-company-1', graphId: companyGraph.id, source: 'node-company-c1', target: 'node-company-b1', type: 'colleague', label: '上级' },
  { id: 'edge-company-2', graphId: companyGraph.id, source: 'node-company-b2', target: 'node-company-b1', type: 'colleague', label: '上级' },
  { id: 'edge-company-3', graphId: companyGraph.id, source: 'node-company-s1', target: 'node-company-b1', type: 'colleague', label: '上级' },
  { id: 'edge-company-4', graphId: companyGraph.id, source: 'node-company-b3', target: 'node-company-b1', type: 'colleague', label: '上级' },
  { id: 'edge-company-5', graphId: companyGraph.id, source: 'node-company-b4', target: 'node-company-b1', type: 'colleague', label: '上级' },
  { id: 'edge-company-6', graphId: companyGraph.id, source: 'node-company-me', target: 'node-company-c1', type: 'colleague', label: '上级' },
  { id: 'edge-company-7', graphId: companyGraph.id, source: 'node-company-m1', target: 'node-company-c1', type: 'colleague', label: '上级' },
  { id: 'edge-company-8', graphId: companyGraph.id, source: 'node-company-m3', target: 'node-company-b2', type: 'colleague', label: '上级' },
  { id: 'edge-company-9', graphId: companyGraph.id, source: 'node-company-m2', target: 'node-company-s1', type: 'colleague', label: '上级' },
  { id: 'edge-company-10', graphId: companyGraph.id, source: 'node-company-s2', target: 'node-company-b3', type: 'colleague', label: '上级' }
];
