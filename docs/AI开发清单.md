# 名片图谱小程序 — 开发进度与后续 AI 开发清单

> 整理时间：2026-10-10。面向后续 AI 辅助开发，包含：已开发模块、未完成占位、分阶段开发清单、开发须知（硬约束与已知坑）。
> 产品设计依据见 [名片产品设计定稿.md](./名片产品设计定稿.md)。

---

## 一、项目概览

| 项 | 说明 |
|---|---|
| 技术栈 | Taro 4.1.9（React 18 + TypeScript + Sass）|
| 目标平台 | 微信小程序（weapp），模拟器 + 真机调试（不做 H5 编译） |
| 数据层 | 本地内存 Mock（`src/store`），**无持久化、无后端**，重启即重置 |
| 构建 | `npm run build:weapp` 生成 `dist/` → 微信开发者工具加载；`npm run dev:weapp` watch 模式 |
| 页面 | 5 个：图谱（tab）/ 名片（tab）/ 我的（tab）/ 名片详情 / 名片编辑 |
| 主题 | 紫色系（主色 `#7d3c98`，文本 `#3b2a44`/`#6d5a78`，边框 `#e8dcef`），取自根目录 `index.html` demo |

---

## 二、已开发模块清单

### 1. 工程骨架 ✅
- `src/app.config.ts`：页面注册、全局窗口、原生 tabBar（图谱/名片/我的，PNG 图标）
- `src/app.tsx` / `src/app.scss`、`src/styles/`（`theme.scss` / `variables.scss` / `compat.scss`）
- `config/` Taro 构建配置；`scripts/` 辅助脚本

### 2. 数据层（Mock Store）✅ — `src/store/index.ts`、`src/store/useStoreVersion.ts`
- 实体：Card（名片，全局唯一）/ Graph（图谱）/ GraphNode（节点，引用 cardId）/ Edge（关系边），类型见 `src/types/index.ts`
- 完整 CRUD + 派生查询（`getCardOfNode` / `listGraphsOfCard` / `listGraphsByType`）
- 响应式：`version` 自增 + `subscribe` + `useStoreVersion` hook
- 级联规则：删名片 → 关联节点变匿名；删节点 → 删其全部关系；删图谱 → 级联删节点/关系
- 称谓双向同步：`syncRoleToNodes`（名片称谓 → 节点 role）、`syncRoleToCard`（节点称谓 → 名片扩展字段）
- 跨页暂存：`linkPendingNodeId`（图谱「关联名片」→ 名片页）
- Mock 数据：`src/mock/family.ts`（家族图谱+成员）、`src/mock/more.ts`（更多名片）、`src/mock/presets.ts`（图谱类型预设关系标签、4 套名片模板）

### 3. 名片列表页 ✅ — `src/pages/card/`
- 搜索（姓名/电话/公司/职位模糊匹配）、我的名片入口、新建名片入口
- 名片条：左侧 6rpx 模板色条（紫=家族/蓝=公司/绿=学校/橙=通用）、单行布局、头像 56rpx、高度 88rpx
- 左滑删除（仿微信消息列表，ref 管理展开态、5px 水平位移阈值、支持 onTouchCancel）
- 关联模式：从图谱页跳入后选择名片关联到节点

### 4. 名片详情页 ✅ — `src/pages/card/detail/`
- 直接编辑（输入即保存，无编辑按钮）
- 模板切换（family/company/school/custom，无关字段隐藏但数据保留，只补缺失字段）
- ~~分享字段勾选（字段前圆点）~~ 已于 2026-10-10 取消并删除（字段授权功能无必要）
- 头像/照片更换（`Taro.chooseMedia`）、自定义扩展字段、所属图谱标签
- 电话拨打、删除名片、称谓编辑（绑定同步到图谱节点）
- ⚠️ 占位：分享按钮（toast「分享功能即将上线」）、一键添加到图谱（toast 占位）

### 5. 名片编辑页 ✅ — `src/pages/card/edit/`
- 新建（无 id）/ 编辑（带 id）双模式复用，表单校验（姓名必填）
- 头像/照片选择、扩展字段增删（自定义字段名+emoji 图标）

### 6. 图谱页 ✅（核心，约 1480 行）— `src/pages/graph/index.tsx`
- **Canvas 2d 力导向画布**：
  - 手势：单指平移、双指捏合缩放（下限 0.62）、拖节点 pin、点击选中（6px 位移阈值分流点击/拖动）、长按 500ms
  - 渲染：节点头像圆（无头像写名字）、圈外称谓标签、连线样式（夫妻实线加粗/亲子/其他）、关系标签、选中高亮、长按操作按钮
  - `fitView` 取景（以「我」为中心 / 全览，平滑动画）
  - 初始布局：放射树（BFS 分层，长辈朝上、晚辈朝下、同层扇区均匀分布）
- **UI 面板**：
  - 图谱选择药丸 + 自适应下拉菜单（160–320px，「emoji 名称 类型·人数」，当前项深紫底 `#e4d3ee`，无图谱时仅「＋ 创建新图谱」）
  - 新建图谱面板：悬浮白卡垂直居中、左右留 24px、无取消按钮、点半透明紫遮罩（`rgba(125,60,152,0.35)`）取消、类型下拉（绝对定位 + ScrollView）
  - 详情抽屉：家族图谱显示家族模板字段（电话点击拨打、微信号📋整行复制、称谓、生日），其他图谱显示电话/公司/职位；称谓药丸内联编辑（原生 Input 动态宽度）
  - 长按操作：新增节点并连线（+/−）、删除成员、修改关系（关系标签点击编辑）、换头像/上传头像
  - 「关联名片」→ switchTab 名片页 → 回填关联
- ⚠️ 占位：图谱共享（toast「共享功能即将上线」）

### 7. 力导向引擎 ✅ — `src/utils/forceGraph.ts`
- 参数与 index.html demo 1:1：斥力 12000、弹簧 96·158、向心 0.0022、阻尼 0.72、代际分层 GEN_Y、交叉避让 BARY 0.06·900 帧上限
- BFS 放射树初始布局、alpha 衰减、wake 唤醒

### 8. 公共组件 ✅ — `src/components/`
- Avatar、Empty、Loading、SearchBar（均含 module.scss）

### 9. 工具层 ✅ — `src/utils/`
- `avatarPainter.ts`：Canvas 头像绘制；`graphDebug.ts`：dbg 调试日志（JSONL 追加写 + SESSION 分隔 + 256KB 轮转）；`toast.ts`：统一提示

### 10. 云服务层 ✅ — `src/services/`（2026-10-10 已接 CloudBase）
- `callFunction` / `getDatabase`：只走 `Taro.cloud`（真实 CloudBase），**不做 mock 兜底**，出错直接抛出暴露问题（H5 兜底分支已删除）
- `auth.ts`：`initCloud()` + `getOpenId()`（login 云函数透出），`app.tsx` 启动时 `bootstrapAuth()`
- 已部署 `cloudfunctions/login`；`graphs/nodes/edges` 集合与 store 云化待做

---

## 三、未完成 / 占位功能一览

| 功能 | 现状 | 位置 |
|---|---|---|
| 「我的」个人中心 | 占位页（Empty 组件） | `src/pages/mine/index.tsx` |
| 名片分享 / 转发 | toast 占位 | `pages/card/detail` |
| 图谱共享 | toast 占位 | `pages/graph` |
| 一键添加到图谱 | toast 占位 | `pages/card/detail` |
| 云后端 / 账号 | 仅服务桩 | `src/services/cloud.ts` |
| 数据持久化 | 内存态，重启重置 | `src/store` |
| 活名片（refCardId 引用同步） | 仅设计定稿 | — |
| 备注层 / 撤回分享 | 仅设计定稿 | — |
| 图谱群裂变认领 | 仅设计定稿 | — |
| 批量导入（vcf / OCR） | 仅设计定稿 | — |
| 头像/昵称一键带入 | 未做（现用 chooseMedia） | `pages/card/edit` |

---

## 四、后续 AI 开发清单（建议顺序）

### P0 — 基础补齐（无后端依赖）
1. **「我的」个人中心页**：我的名片入口、资料设置、（预留会员权益区）。涉及 `src/pages/mine/`。
2. **转发分享基础能力**：`useShareAppMessage` 生成名片/图谱分享卡片（带 `graphId`/`cardId` 参数），为后续群裂变铺路。
3. **数据持久化**：store 变更落 `Taro.setStorage`，启动时恢复（在云化之前先解决「重启即重置」）。
4. ~~**云服务桩修正**~~ 已随 H5 兜底分支删除（2026-10-10），不再需要。
5. **头像/昵称一键带入**：`<button open-type="chooseAvatar">` + `<input type="nickname">`（个人主体可用，体验接近自动获取）。

### P1 — 云化后端（微信云开发，个人主体可用）
6. **云开发初始化**：`app.tsx` 调 `Taro.cloud.init()`，建云函数目录 `cloudfunctions/`。
7. **数据上云**：集合设计（cards / graphs / nodes / edges / shares / users），**替换 `src/store` 实现、方法签名不变**（业务代码零改动——架构已为此预留）。
8. **登录与用户标识**：`wx.login` → openid/unionid，作为卡片 `source: 'manual' | 'shared'` 与 `refCardId` 的账号基础。
9. **卡片结构扩展**：增加 `source`、`refCardId`、版本号字段（设计定稿 §六，上云免迁移）。

### P2 — 分享、认领与活名片（核心产品闭环）
10. **图谱分享到群**：分享卡片带 graphId → 群成员点开进入。
11. **认领 + 授权流程**：成员认领自己的名片 → 授权 → 获得图谱内名片（字段级授权已取消，按整卡分享）。
    - ⚠️ 合规红线：名片必须「认领 + 授权」，不可由创建者单方面录入他人信息后送出（《个保法》，微信审核重点）。
12. **活名片引用同步**：本地只存 `refCardId`，源卡版本 +1 → 全量同步所有持有者。
13. **备注层**：持有者私有备注（昵称/分组/备忘）与权威数据分层合并展示。
14. **撤回分享 / 持有者视图**（依赖待拍板问题结论）。

### P3 — 导入与增强
15. **vcf 文件导入**：`wx.chooseMessageFile` 选 .vcf → 解析 vCard 批量建卡（免费，首选）。
16. **OCR 图片导入**：截图/纸质名片 → 腾讯云 OCR → 建卡（少量调用费用）。
17. **修改历史 / 撤销机制**（待拍板 §五-4）。

### 待拍板问题（开发 P2 前需确认）
1. 源卡 A 能否看到「谁持有我的名片」？
2. 撤回分享后，持有者侧变灰锁定还是保留末版？
3. 无主静态卡能否「升级合并」为活名片？以谁为准？
4. 源卡误改即时全量传播，是否需要修改历史/撤销？

---

## 五、AI 开发须知（硬约束与工程约定）

### 平台硬限制（不要尝试实现）
- ❌ 读取手机通讯录（无 API，仅 `wx.addPhoneContact` 单向写入）
- ❌ 获取手机号（需**企业认证**主体，0.03 元/次，个人主体不可用）
- ❌ 静默获取真实昵称/头像/性别/地区（`getUserProfile` 2022-10 起仅返回「微信用户」）
- ❌ 获取本人或他人微信号、好友列表；❌ 按微信号发起会话；❌ 直接拨打微信语音/视频通话
- ❌ 音视频通话（`wx.joinVoipChat` 仅特定类目企业主体）
- ✅ 可用：`wx.login`（openid）、chooseAvatar 一键头像、`input type="nickname"` 一键昵称、`wx.addPhoneContact` 写入通讯录

### 工程约定
- 图谱模块必须复刻根目录 `index.html` 的拖动效果与力学参数（**勿擅自调参**）
- 数据层只依赖 `src/store` 公开方法，云化时仅替换 store 实现
- 名片模板切换：无关字段隐藏但数据保留，只补缺失字段
- 名片详情页：直接编辑，输入即保存

### 已知坑（改代码前必读）
- 微信开发者工具需加载 `dist/` 编译产物（先 `npm run build:weapp`）；产物更新不显示时「编译」或清缓存
- tabBar 图标仅支持 png/jpg/jpeg（SVG 编译报错）
- 内联样式 rpx 在 H5 不转换 → 尺寸用 SCSS 预设类
- Canvas 原生组件层级高于普通 View → 覆盖物用 CoverView（工具中可能不可见，以真机为准）
- 图谱页已有兜底机制，勿破坏：Canvas 尺寸三次校准（50/150/400ms）、`useDidShow` 代数守卫重启渲染循环、touchStart 清理僵尸触点、点击/拖动 6px 分流、`resizeCanvas` 不调 fitView
- React 闭包陷阱：`rebuildEngine`/`buildInputs` 需显式传入目标 graphId
- 微信原生 Input 文字不随竖向 padding 垂直居中：药丸输入框需固定 height + line-height、竖向 padding 归零；宽度需按字数动态计算（无 width:auto）
- dbg 日志为追加写（`src/utils/graphDebug.ts`），复现现场勿改成全量覆盖
