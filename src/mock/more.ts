import type { Card } from '@/types';

/**
 * 家族以外的关系层假数据：公司 / 学校 / 通用模板
 * 这些人不在家族图谱中（无节点），仅作为名片模块的多模板样例
 * （b1~b4 除外：这 4 张公司卡同时是公司图谱「远航科技」的节点）
 */

/** 头像用云存储 fileID（avatars/seed/，AI 生成人像，与 seed 云函数同一份映射；一张卡一个，全局不重复） */
const BUCKET = '6d69-mingpiantupu-d1gbmi23j8988d532-1300901896';
const avatarOf = (code: string) =>
  `cloud://mingpiantupu-d1gbmi23j8988d532.${BUCKET}/avatars/seed/avatar-card-${code}.jpg`;

/** 公司模板 4 张 */
const COMPANY_CARDS: Card[] = [
  {
    id: 'card-b1',
    name: '何俊杰',
    phone: '139 0571 3001',
    company: '远航科技',
    title: '技术总监',
    avatar: avatarOf('b1'),
    photos: [],
    note: '陈志远的同事，前后端都懂，技术选型可以找他聊。',
    isMe: false,
    createdAt: '2026-02-11 09:30:00',
    template: 'company',
    customFields: [
      { key: 'birthday', label: '生日', icon: '🎂', value: '1981-05-09' },
      { key: 'wechat', label: '微信号', icon: '💬', value: 'hj-junjie' },
      { key: 'department', label: '部门', icon: '🗂️', value: '研发部' },
      { key: 'workEmail', label: '工作邮箱', icon: '📧', value: 'hejunjie@yuanhang.tech' }
    ]
  },
  {
    id: 'card-b2',
    name: '郑晓岚',
    phone: '139 0571 3002',
    company: '远航科技',
    title: '产品经理',
    avatar: avatarOf('b2'),
    photos: [],
    note: '负责小程序产品线，需求评审时的对接人。',
    isMe: false,
    createdAt: '2026-02-11 09:35:00',
    template: 'company',
    customFields: [
      { key: 'birthday', label: '生日', icon: '🎂', value: '1993-02-28' },
      { key: 'wechat', label: '微信号', icon: '💬', value: 'zxl-pm' },
      { key: 'department', label: '部门', icon: '🗂️', value: '产品部' },
      { key: 'workEmail', label: '工作邮箱', icon: '📧', value: 'zhengxiaolan@yuanhang.tech' }
    ]
  },
  {
    id: 'card-b3',
    name: '马跃',
    phone: '139 0571 3003',
    company: '远航科技',
    title: '商务总监',
    avatar: avatarOf('b3'),
    photos: [],
    note: '商务部负责人，酒量好，谈判场面稳得住。',
    isMe: false,
    createdAt: '2026-03-02 14:10:00',
    template: 'company',
    customFields: [
      { key: 'birthday', label: '生日', icon: '🎂', value: '1976-08-16' },
      { key: 'wechat', label: '微信号', icon: '💬', value: 'mayue-trade' },
      { key: 'department', label: '部门', icon: '🗂️', value: '商务部' },
      { key: 'workEmail', label: '工作邮箱', icon: '📧', value: 'mayue@yuanhang.tech' }
    ]
  },
  {
    id: 'card-b4',
    name: '韩雪',
    phone: '139 0571 3004',
    company: '远航科技',
    title: '行政主管',
    avatar: avatarOf('b4'),
    photos: [],
    note: '行政部主管，公司大小活动都归她张罗。',
    isMe: false,
    createdAt: '2026-03-15 11:20:00',
    template: 'company',
    customFields: [
      { key: 'birthday', label: '生日', icon: '🎂', value: '1988-11-02' },
      { key: 'wechat', label: '微信号', icon: '💬', value: 'hanxue-nurse' },
      { key: 'department', label: '部门', icon: '🗂️', value: '行政部' },
      { key: 'workEmail', label: '工作邮箱', icon: '📧', value: 'hanxue@yuanhang.tech' }
    ]
  }
];

/** 实习生同学卡 3 张（陈嘉禾的同学，现在远航科技实习——同时是公司图谱节点） */
const SCHOOL_CARDS: Card[] = [
  {
    id: 'card-m1',
    name: '李昀铮',
    phone: '139 0571 4001',
    company: '远航科技',
    title: '研发实习生',
    avatar: avatarOf('m1'),
    photos: [],
    note: '同班同学，一起做课程设计，算法比赛队友，现在同在远航实习。',
    isMe: false,
    createdAt: '2026-03-20 16:00:00',
    template: 'company',
    customFields: [
      { key: 'birthday', label: '生日', icon: '🎂', value: '2005-03-30' },
      { key: 'wechat', label: '微信号', icon: '💬', value: 'lyz-cs' },
      { key: 'department', label: '部门', icon: '🗂️', value: '研发部' },
      { key: 'workEmail', label: '工作邮箱', icon: '📧', value: 'liyunzheng@yuanhang.tech' },
      { key: 'schoolName', label: '学校', icon: '🏫', value: '浙江大学' },
      { key: 'college', label: '院系', icon: '📚', value: '计算机学院' },
      { key: 'grade', label: '年级', icon: '🗓️', value: '大二' }
    ]
  },
  {
    id: 'card-m2',
    name: '王梓涵',
    phone: '139 0571 4002',
    company: '远航科技',
    title: '设计实习生',
    avatar: avatarOf('m2'),
    photos: [],
    note: '社团认识的学妹，负责海报设计，现在在远航设计部实习。',
    isMe: false,
    createdAt: '2026-03-22 18:40:00',
    template: 'company',
    customFields: [
      { key: 'birthday', label: '生日', icon: '🎂', value: '2007-06-12' },
      { key: 'wechat', label: '微信号', icon: '💬', value: 'wzh-design' },
      { key: 'department', label: '部门', icon: '🗂️', value: '设计部' },
      { key: 'workEmail', label: '工作邮箱', icon: '📧', value: 'wangzihan@yuanhang.tech' },
      { key: 'schoolName', label: '学校', icon: '🏫', value: '浙江大学' },
      { key: 'college', label: '院系', icon: '📚', value: '传媒与国际文化学院' },
      { key: 'grade', label: '年级', icon: '🗓️', value: '大一' }
    ]
  },
  {
    id: 'card-m3',
    name: '沈亦可',
    phone: '139 0571 4003',
    company: '远航科技',
    title: '运营实习生',
    avatar: avatarOf('m3'),
    photos: [],
    note: '高中同学，在南京上学，远程参与远航的运营实习。',
    isMe: false,
    createdAt: '2026-04-01 20:15:00',
    template: 'company',
    customFields: [
      { key: 'birthday', label: '生日', icon: '🎂', value: '2007-01-25' },
      { key: 'wechat', label: '微信号', icon: '💬', value: 'syk-nju' },
      { key: 'department', label: '部门', icon: '🗂️', value: '运营部' },
      { key: 'workEmail', label: '工作邮箱', icon: '📧', value: 'shenyike@yuanhang.tech' },
      { key: 'schoolName', label: '学校', icon: '🏫', value: '南京大学' },
      { key: 'college', label: '院系', icon: '📚', value: '外国语学院' },
      { key: 'grade', label: '年级', icon: '🗓️', value: '大一' }
    ]
  }
];

/** 通用模板 1 张 */
const CUSTOM_CARDS: Card[] = [
  {
    id: 'card-m4',
    name: '赵国栋',
    phone: '139 0571 5001',
    company: '社区水电维修',
    title: '师傅',
    avatar: avatarOf('m4'),
    photos: [],
    note: '小区门口维修店的师傅，手艺好，随叫随到。',
    isMe: false,
    createdAt: '2026-04-08 10:05:00',
    template: 'custom',
    customFields: [
      { key: 'birthday', label: '生日', icon: '🎂', value: '1971-04-18' },
      { key: 'wechat', label: '微信号', icon: '💬', value: 'zgd-repair' }
    ]
  }
];

/** 全部非家族名片（迁移基准数据，云端 cards 集合已收录） */
export const moreCards: Card[] = [...COMPANY_CARDS, ...SCHOOL_CARDS, ...CUSTOM_CARDS];
