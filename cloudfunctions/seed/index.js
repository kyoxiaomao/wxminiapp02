const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 测试数据种子（幂等运维工具，唯一测试数据源 = demo_* 共享集合）
 * - 完善 21 张测试名片：头像换为云存储唯一 fileID、customFields 按全集补全
 * - 我的名片（isMe）只补空字段，不覆盖用户已填内容
 * - 新建公司图谱「远航科技」（只含公司名片 + 我），家族图谱维持 13 人
 * - 幂等：按 id 查「存在则 update / 不存在才 add」；force=true 先清空 demo_* 重建
 * - 演示模式（demo/demo888 登录）经 demoRW 云函数读写的就是 demo_* 这一份；
 *   主集合 cards/graphs/nodes/edges 留给真实微信登录用户，本函数不写入
 *
 * 数据内容与 src/mock/family.ts、src/mock/more.ts 保持一致（头像除外：mock 同步用同一份 fileID 映射）。
 */

/** 头像 fileID 映射（avatars/seed/ 目录，AI 生成人像，一张卡一个，全局不重复） */
const BUCKET = '6d69-mingpiantupu-d1gbmi23j8988d532-1300901896';
const avatar = (code) => `cloud://mingpiantupu-d1gbmi23j8988d532.${BUCKET}/avatars/seed/avatar-card-${code}.jpg`;

/** 北京时间 YYYY-MM-DD HH:mm:ss */
function beijingNow() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

/** 确保集合存在（已存在忽略报错） */
async function ensureCollection(db, name) {
  try {
    await db.collection(name).count();
  } catch (_) {
    try {
      await db.createCollection(name);
    } catch (__) {
      // 已存在
    }
  }
}

// ============ 家族 13 人（与 src/mock/family.ts 的 MEMBERS 一致） ============

const FAMILY = [
  { code: 'p1', name: '陈鸿儒', role: '爷爷', gen: 1, phone: '138 0571 0001', company: '原市教育局', title: '退休教师', birthday: '1948-03-12', wechat: 'chr-1948', note: '爷爷，每年清明主持祭祖，书法爱好者。' },
  { code: 'p2', name: '林淑芬', role: '奶奶', gen: 1, phone: '138 0571 0002', company: '原市纺织厂', title: '退休职工', birthday: '1950-07-08', wechat: 'lsf-1950', note: '奶奶，做得一手好菜，家庭聚会的固定主厨。' },

  { code: 'c1', name: '陈志远', role: '爸爸', gen: 2, phone: '138 0571 1001', company: '远航科技', title: '工程师', birthday: '1975-11-23', wechat: 'czy-1975', note: '爸爸，定居杭州，在远航科技做工程师。' },
  { code: 's1', name: '苏婉清', role: '妈妈', gen: 2, phone: '138 0571 1002', company: '自由职业', title: '平面设计师', birthday: '1978-04-17', wechat: 'swq-1978', note: '妈妈，在杭州经营自己的设计工作室。' },
  { code: 'c2', name: '陈志玲', role: '姑姑', gen: 2, phone: '138 0571 1003', company: '市人民医院', title: '会计', birthday: '1980-09-02', wechat: 'czl-1980', note: '姑姑，留在本地照顾爷爷奶奶。' },
  { code: 's2', name: '周建国', role: '姑父', gen: 2, phone: '138 0571 1004', company: '远航科技', title: '销售经理', birthday: '1979-06-15', wechat: 'zjg-1979', note: '姑父，商务部销售经理，家族聚会气氛担当。' },
  { code: 'c3', name: '陈志明', role: '舅舅', gen: 2, phone: '138 0571 1005', company: '市第一医院', title: '外科医生', birthday: '1982-12-30', wechat: 'czm-1982', note: '舅舅，定居南京，家族健康顾问。' },
  { code: 's3', name: '吴雅琴', role: '舅妈', gen: 2, phone: '138 0571 1006', company: '南京外国语学校', title: '教师', birthday: '1984-02-19', wechat: 'wyq-1984', note: '舅妈，教高中语文。' },

  { code: 'g1', name: '陈嘉禾', role: '我', gen: 3, phone: '138 0571 2001', company: '浙江大学', title: '计算机系本科生', birthday: '2005-08-21', wechat: 'jiahe-2005', note: '我，计算机系大二，小程序的实际使用者。' },
  { code: 'g2', name: '陈嘉悦', role: '姐姐', gen: 3, phone: '138 0571 2002', company: '杭州第二中学', title: '高中生', birthday: '2008-10-05', wechat: 'jiayue-2008', note: '姐姐，高二，舞蹈特长。' },
  { code: 'g3', name: '林思远', role: '表哥', gen: 3, phone: '138 0571 2003', company: '南师大附中', title: '初中生', birthday: '2010-01-18', wechat: 'siyuan-2010', note: '表哥，随姑父姓林，篮球打得好。' },
  { code: 'g4', name: '陈嘉言', role: '弟弟', gen: 3, phone: '138 0571 2004', company: '南京芳草园小学', title: '小学生', birthday: '2014-05-27', wechat: 'jiayan-2014', note: '弟弟，小学四年级，奥数苗子。' },
  { code: 'g5', name: '陈嘉宁', role: '妹妹', gen: 3, phone: '138 0571 2005', company: '南京芳草园小学', title: '小学生', birthday: '2016-09-14', wechat: 'jianing-2016', note: '妹妹，小学二年级，喜欢画画。' }
];

// ============ 非家族 8 人（与 src/mock/more.ts 一致，字段按全集补全） ============

const MORE = [
  { code: 'b1', name: '何俊杰', phone: '139 0571 3001', company: '远航科技', title: '技术总监', template: 'company', birthday: '1981-05-09', wechat: 'hj-junjie', department: '研发部', workEmail: 'hejunjie@yuanhang.tech', note: '陈志远的同事，前后端都懂，技术选型可以找他聊。' },
  { code: 'b2', name: '郑晓岚', phone: '139 0571 3002', company: '远航科技', title: '产品经理', template: 'company', birthday: '1993-02-28', wechat: 'zxl-pm', department: '产品部', workEmail: 'zhengxiaolan@yuanhang.tech', note: '负责小程序产品线，需求评审时的对接人。' },
  { code: 'b3', name: '马跃', phone: '139 0571 3003', company: '远航科技', title: '商务总监', template: 'company', birthday: '1976-08-16', wechat: 'mayue-trade', department: '商务部', workEmail: 'mayue@yuanhang.tech', note: '商务部负责人，酒量好，谈判场面稳得住。' },
  { code: 'b4', name: '韩雪', phone: '139 0571 3004', company: '远航科技', title: '行政主管', template: 'company', birthday: '1988-11-02', wechat: 'hanxue-nurse', department: '行政部', workEmail: 'hanxue@yuanhang.tech', note: '行政部主管，公司大小活动都归她张罗。' },

  { code: 'm1', name: '李昀铮', phone: '139 0571 4001', company: '远航科技', title: '研发实习生', template: 'company', birthday: '2005-03-30', wechat: 'lyz-cs', department: '研发部', workEmail: 'liyunzheng@yuanhang.tech', schoolName: '浙江大学', college: '计算机学院', grade: '大二', note: '同班同学，一起做课程设计，算法比赛队友，现在同在远航实习。' },
  { code: 'm2', name: '王梓涵', phone: '139 0571 4002', company: '远航科技', title: '设计实习生', template: 'company', birthday: '2007-06-12', wechat: 'wzh-design', department: '设计部', workEmail: 'wangzihan@yuanhang.tech', schoolName: '浙江大学', college: '传媒与国际文化学院', grade: '大一', note: '社团认识的学妹，负责海报设计，现在在远航设计部实习。' },
  { code: 'm3', name: '沈亦可', phone: '139 0571 4003', company: '远航科技', title: '运营实习生', template: 'company', birthday: '2007-01-25', wechat: 'syk-nju', department: '运营部', workEmail: 'shenyike@yuanhang.tech', schoolName: '南京大学', college: '外国语学院', grade: '大一', note: '高中同学，在南京上学，远程参与远航的运营实习。' },

  { code: 'm4', name: '赵国栋', phone: '139 0571 5001', company: '社区水电维修', title: '师傅', template: 'custom', birthday: '1971-04-18', wechat: 'zgd-repair', note: '小区门口维修店的师傅，手艺好，随叫随到。' }
];

/** 组装 customFields（全集：称谓/生日/微信/部门/邮箱/学校/院系/年级，按全集顺序，有值才建） */
function buildFields(m) {
  const defs = [
    { key: 'role', label: '称谓', icon: '👪', value: m.role },
    { key: 'birthday', label: '生日', icon: '🎂', value: m.birthday },
    { key: 'wechat', label: '微信号', icon: '💬', value: m.wechat },
    { key: 'department', label: '部门', icon: '🗂️', value: m.department },
    { key: 'workEmail', label: '工作邮箱', icon: '📧', value: m.workEmail },
    { key: 'schoolName', label: '学校', icon: '🏫', value: m.schoolName },
    { key: 'college', label: '院系', icon: '📚', value: m.college },
    { key: 'grade', label: '年级', icon: '🗓️', value: m.grade }
  ];
  return defs.filter(d => d.value);
}

// ============ 图谱数据 ============

const FAMILY_GRAPH = {
  id: 'graph-family',
  name: '陈氏家族图谱',
  type: 'family',
  coverColor: '#d9c9dd',
  createdAt: '2026-01-20 10:00:00'
};

/** 家族 12 条关系（与 src/mock/family.ts 的 RELATIONS 一致） */
const FAMILY_RELATIONS = [
  { from: 'p1', to: 'p2', type: 'spouse', label: '夫妻' },
  { from: 'c1', to: 's1', type: 'spouse', label: '夫妻' },
  { from: 'c2', to: 's2', type: 'spouse', label: '夫妻' },
  { from: 'c3', to: 's3', type: 'spouse', label: '夫妻' },
  { from: 'p1', to: 'c1', type: 'parent', label: '长子' },
  { from: 'p1', to: 'c2', type: 'parent', label: '长女' },
  { from: 'p1', to: 'c3', type: 'parent', label: '次子' },
  { from: 'c1', to: 'g1', type: 'parent', label: '长子' },
  { from: 'c1', to: 'g2', type: 'parent', label: '女儿' },
  { from: 'c2', to: 'g3', type: 'parent', label: '儿子' },
  { from: 'c3', to: 'g4', type: 'parent', label: '儿子' },
  { from: 'c3', to: 'g5', type: 'parent', label: '女儿' }
];

/** 公司图谱「远航科技」：只含公司名片 b1~b4 + 我（我的卡，运行时按 isMe 查） */
const COMPANY_GRAPH = {
  id: 'graph-company',
  name: '远航科技',
  type: 'company',
  coverColor: '#c9d6e8',
  createdAt: '2026-03-01 09:00:00'
};

/** 公司节点：cardId 为 'me' 时运行时替换为 isMe 卡 id；「我」两图谱称谓统一为「我」 */
const COMPANY_NODES = [
  { code: 'me', cardId: 'me', role: '我' },
  { code: 'b1', cardId: 'card-b1', role: '技术总监' },
  { code: 'b2', cardId: 'card-b2', role: '产品经理' },
  { code: 'b3', cardId: 'card-b3', role: '商务总监' },
  { code: 'b4', cardId: 'card-b4', role: '行政主管' },
  { code: 'm1', cardId: 'card-m1', role: '研发实习生' },
  { code: 'm2', cardId: 'card-m2', role: '设计实习生' },
  { code: 'm3', cardId: 'card-m3', role: '运营实习生' },
  { code: 'c1', cardId: 'card-c1', role: '工程师' },
  { code: 's1', cardId: 'card-s1', role: '设计顾问' },
  { code: 's2', cardId: 'card-s2', role: '销售经理' }
];

/**
 * 公司职级汇报树（下属→上级，标签「上级」，纯树无闭环）
 * 何俊杰（技术总监）为根：陈志远/郑晓岚/苏婉清/马跃/韩雪 直接下属，
 * 实习生归各自带教，周建国归商务部马跃
 */
const COMPANY_RELATIONS = [
  { from: 'c1', to: 'b1', label: '上级' },
  { from: 'b2', to: 'b1', label: '上级' },
  { from: 's1', to: 'b1', label: '上级' },
  { from: 'b3', to: 'b1', label: '上级' },
  { from: 'b4', to: 'b1', label: '上级' },
  { from: 'me', to: 'c1', label: '上级' },
  { from: 'm1', to: 'c1', label: '上级' },
  { from: 'm3', to: 'b2', label: '上级' },
  { from: 'm2', to: 's1', label: '上级' },
  { from: 's2', to: 'b3', label: '上级' }
];

// ============ 写入工具 ============

/**
 * 幂等 upsert 写共享演示集合 demo_*（唯一测试数据源）
 * - 演示模式（demo/demo888）经 demoRW 云函数读写的就是这份
 * - 剥掉 openId/_openid 归属：共享数据不归属任何 openid，所有测试账号共用一份
 * - 主集合不再写入（留给真实用户数据），测试数据只维护这一份
 */
async function upsert(db, collection, doc) {
  const colName = `demo_${collection}`;
  const { openId, _openid, ...rest } = doc;
  const existing = await db.collection(colName).where({ id: doc.id }).limit(1).get();
  if (existing.data.length) {
    await db.collection(colName).doc(existing.data[0]._id).update({ data: rest });
    return 'updated';
  }
  await db.collection(colName).add({ data: rest });
  return 'added';
}

exports.main = async (event) => {
  const { force } = event || {};
  const db = cloud.database();
  const stats = { cards: { added: 0, updated: 0 }, graphs: { added: 0, updated: 0 }, nodes: { added: 0, updated: 0 }, edges: { added: 0, updated: 0 } };

  try {
    for (const col of ['cards', 'graphs', 'nodes', 'edges']) {
      await ensureCollection(db, `demo_${col}`);
    }

    if (force) {
      for (const col of ['cards', 'graphs', 'nodes', 'edges']) {
        // 逐批取一批删一批（删除后数据前移，不能带 skip）
        for (;;) {
          const res = await db.collection(`demo_${col}`).limit(100).get();
          if (!res.data.length) break;
          for (const doc of res.data) await db.collection(`demo_${col}`).doc(doc._id).remove();
          if (res.data.length < 100) break;
        }
      }
    }

    // 我的名片 id：测试基准数据里 card-g1（陈嘉禾）即 isMe 卡；演示数据里已有 isMe 卡则用它
    const myRes = await db.collection('demo_cards').where({ isMe: true }).limit(1).get();
    const myCardId = myRes.data.length ? myRes.data[0].id : 'card-g1';

    // ---- 名片：13 家族 + 8 非家族（头像唯一 fileID，customFields 全集补全） ----
    const cards = [
      ...FAMILY.map(m => ({
        id: `card-${m.code}`,
        name: m.name,
        phone: m.phone,
        company: m.company,
        title: m.title,
        avatar: avatar(m.code),
        photos: [],
        note: m.note,
        isMe: m.code === 'g1',
        source: 'manual',
        createdAt: '2026-01-20 10:00:00',
        template: 'family',
        customFields: buildFields(m)
      })),
      ...MORE.map(m => ({
        id: `card-${m.code}`,
        name: m.name,
        phone: m.phone,
        company: m.company,
        title: m.title,
        avatar: avatar(m.code),
        photos: [],
        note: m.note,
        isMe: false,
        source: 'manual',
        createdAt: '2026-02-11 09:30:00',
        template: m.template,
        customFields: buildFields(m)
      }))
    ];
    for (const c of cards) {
      const r = await upsert(db, 'cards', c);
      stats.cards[r === 'added' ? 'added' : 'updated'] += 1;
    }

    // ---- 我的名片完善：按 isMe 卡只补空字段（空或占位名「微信用户」才写入），不覆盖已填内容 ----
    const myDoc = myRes.data.length ? myRes.data[0] : null;
    if (myDoc) {
      const DEFAULT_NAME = '微信用户';
      const fill = {};
      if (!myDoc.name || !myDoc.name.trim() || myDoc.name === DEFAULT_NAME) fill.name = '陈嘉禾';
      if (!myDoc.avatar) fill.avatar = avatar('g1');
      if (!myDoc.phone) fill.phone = '138 0571 2001';
      if (!myDoc.company) fill.company = '浙江大学';
      if (!myDoc.title) fill.title = '计算机系本科生';
      if (!myDoc.note) fill.note = '长孙，计算机系大二，小程序的实际使用者。';
      const fields = Array.isArray(myDoc.customFields) ? [...myDoc.customFields] : [];
      const ensureField = (key, label, icon, value) => {
        if (!value) return;
        const idx = fields.findIndex(f => f.key === key);
        if (idx >= 0) {
          if (!fields[idx].value) fields[idx] = { ...fields[idx], value };
        } else {
          fields.push({ key, label, icon, value });
        }
      };
      ensureField('birthday', '生日', '🎂', '2005-08-21');
      ensureField('wechat', '微信号', '💬', 'jiahe-2005');
      ensureField('role', '称谓', '👪', '我');
      if (Object.keys(fill).length || fields.some((f, i) => f.value !== (myDoc.customFields || [])[i]?.value)) {
        fill.customFields = fields;
        await db.collection('demo_cards').doc(myDoc._id).update({ data: fill });
        stats.cards.updated += 1;
      }
    }

    // ---- 家族图谱：graph + 13 节点 + 12 边 ----
    await upsert(db, 'graphs', FAMILY_GRAPH);
    stats.graphs.updated += 1;
    for (const m of FAMILY) {
      const r = await upsert(db, 'nodes', {
        id: `node-${m.code}`,
        graphId: FAMILY_GRAPH.id,
        cardId: `card-${m.code}`,
        role: m.role,
        gen: m.gen
      });
      stats.nodes[r === 'added' ? 'added' : 'updated'] += 1;
    }
    for (let i = 0; i < FAMILY_RELATIONS.length; i++) {
      const rel = FAMILY_RELATIONS[i];
      const r = await upsert(db, 'edges', {
        id: `edge-family-${i + 1}`,
        graphId: FAMILY_GRAPH.id,
        source: `node-${rel.from}`,
        target: `node-${rel.to}`,
        type: rel.type,
        label: rel.label
      });
      stats.edges[r === 'added' ? 'added' : 'updated'] += 1;
    }

    // ---- 公司图谱：graph + 5 节点（我 + b1~b4）+ 5 边 ----
    await upsert(db, 'graphs', COMPANY_GRAPH);
    stats.graphs.updated += 1;
    const nodeCard = (code, cardId) => (cardId === 'me' ? myCardId : cardId);
    for (const n of COMPANY_NODES) {
      const r = await upsert(db, 'nodes', {
        id: `node-company-${n.code}`,
        graphId: COMPANY_GRAPH.id,
        cardId: nodeCard(n.code, n.cardId),
        role: n.role
      });
      stats.nodes[r === 'added' ? 'added' : 'updated'] += 1;
    }
    for (let i = 0; i < COMPANY_RELATIONS.length; i++) {
      const rel = COMPANY_RELATIONS[i];
      const r = await upsert(db, 'edges', {
        id: `edge-company-${i + 1}`,
        graphId: COMPANY_GRAPH.id,
        source: `node-company-${rel.from}`,
        target: `node-company-${rel.to}`,
        type: 'colleague',
        label: rel.label
      });
      stats.edges[r === 'added' ? 'added' : 'updated'] += 1;
    }

    console.info('[seed] 完成:', JSON.stringify(stats));
    return { code: 0, message: 'ok', data: { myCardId, stats } };
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    console.error('[seed] 失败:', err);
    return { code: 1, message, data: null };
  }
};
