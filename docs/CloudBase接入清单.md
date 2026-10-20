# CloudBase 接入清单

> 依据 https://docs.cloudbase.net/skill.md（CloudBase AI Agent 接入技能）。整理时间：2026-10-10。
> 目标：用腾讯云开发（CloudBase）补齐本项目缺失的后端，对应 [AI开发清单.md](./AI开发清单.md) 的 P1/P2 阶段。

---

## 一、这个 skill 能带来什么

CloudBase = 腾讯云开发：**数据库、登录鉴权、云函数、云存储、静态托管**，与微信小程序深度集成（个人主体可用）。
该 skill 让 AI Agent 在 IDE 内一站式完成：装插件/MCP → 登录 → 建环境 → 建表/写云函数/部署/查日志，不离开编辑器。

---

## 二、环境准备（一次性）

| # | 步骤 | 命令 / 说明 |
|---|---|---|
| 1 | Node ≥ 18 + npm/npx | `node -v; npm -v`，缺则 `winget install OpenJS.NodeJS.LTS` |
| 2 | 安装 CloudBase 插件（优先） | `npx plugins add TencentCloudBase/cloudbase-plugin -y --scope user` |
| 3 | 装 Skills 加速 | `npx skills add tencentcloudbase/cloudbase-skills -y` |
| 4 | CLI 兜底（MCP 未就绪时） | `npm i -g @cloudbase/cli` → `tcb login` → `tcb env list` → `tcb env use <envId>` |
| 5 | GitHub 不可达 | 用 CNB：`npx plugins add https://cnb.cool/tencent/cloud/cloudbase/cloudbase-plugin.git -y --scope user` |

注意事项（skill 明文规则）：
- 插件/MCP 需重启 IDE 才在下个会话生效，**当前会话用 `tcb` CLI 继续干活，不要干等**
- 禁止 `tcb deploy`，用领域命令 `tcb fn deploy` / `tcb hosting deploy` 等
- 不编造 envId / 密钥；Plugin、手写 MCP、应用市场三选一，不叠加
- 小程序专项文档：https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/tutorials/ai-develop-miniprogram

---

## 三、项目接入清单（能力 → 用途）

| # | CloudBase 能力 | 本项目用途 | 对应开发清单 |
|---|---|---|---|
| 1 | 登录鉴权（微信登录 → openid） | 用户身份基础，卡片归属、认领、持有关系的账号锚点 | P1-8 |
| 2 | 云数据库 | 集合 `cards / graphs / nodes / edges / shares / users`，**替换 `src/store` 实现（方法签名不变）**，业务代码零改动 | P1-7 |
| 3 | 云函数 | 分享/认领/授权校验、活名片版本同步、撤回、频控防滥用 | P1-6、P2-11~14 |
| 4 | 数据库实时推送（watch） | 活名片「改动自动同步」的现成实现，不用自己写轮询 | P2-12 |
| 5 | 云存储 | 头像/照片持久化（现在 `chooseMedia` 只有临时路径）、分享卡封面 | P0 补充 |
| 6 | 静态托管 / 云托管 | 后续管理后台、H5 预览版 | 远期 |
| 7 | AI Toolkit（MCP + Skills） | AI 直接建集合、写/部署云函数、查日志、改权限规则 | 提效工具 |

---

## 四、建议落地顺序

1. 环境准备（上表 1–4，本会话 CLI 即可完成）→ `tcb login` + 建环境拿到 envId
2. `app.tsx` 接 `Taro.cloud.init()`，微信登录拿 openid（替换本地 mock 用户）
3. 建集合 + 把 `src/mock` 数据迁入
4. 重写 `src/store` 为云实现（方法签名不变，前端不改）
5. 云函数：分享 → 认领+授权 → 活名片 watch 同步（对应两个增长循环的后端闭环）

---

## 五、约束提醒

- 云开发不改变微信平台硬限制：手机号获取仍需企业主体，通讯录/微信号/语音通话依然不可用
- 数据库权限规则：写权限只给本人卡片，读权限按分享/认领关系设计（不采用字段级授权——原「字段勾选」功能已于 2026-10-10 取消）
- 个人主体可用云开发，但推广功能（群裂变、关系链）建议先确认小程序类目与主体路径
