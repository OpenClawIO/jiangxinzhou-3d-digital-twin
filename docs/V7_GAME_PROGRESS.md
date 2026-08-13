# 南京江心洲3D时空 V7 · 共享世界游戏化重构

更新时间：2026-08-13

## 已完成

- 建立 `app/jiangxinzhou/game/` 游戏层：类型契约、状态 reducer、确定性世界 tick、URL 解析、存档迁移和网关工厂。
- 默认单人模式使用 `LocalGameGateway`，不依赖网络；共享模式支持 `BroadcastChannel` 房间演示，房间容量模型为 32 人。
- 游客身份、昵称/颜色、玩家标记、移动状态、目标接近判定、观察记录、XP、徽章与个人地标图鉴已连通。
- 现有四条探索任务保持兼容；地图目标通过地标 ID 驱动“沿道路前往 → 到达 → 观察记录”循环。
- Three.js 增加单个 `InstancedMesh` 玩家标记层，当前玩家高亮圈和选中玩家标签不改变地图几何与 GLB。
- 新增游戏 HUD、任务追踪、团队目标、房间成员、事件提示、重连提示、身份编辑和移动端可用的互动提示。
- V1 本地探索存档迁移到 `jiangxinzhou-game-collection-v2`，不删除旧存档。
- 新增 Supabase Realtime 适配器：匿名身份、Presence、Broadcast、房间成员和命令端点；未配置 Supabase 或服务不可用时回退单人。
- 新增 Supabase RLS 迁移和独立 Node 22 权威模拟服务脚手架；服务密钥只允许存在 worker 环境。
- 新增 `scripts/validate-game-v7.mjs`，覆盖 URL、tick 确定性、移动、reducer 奖励幂等、V1→V2 迁移和本地网关命令幂等。

## 本地验证

- `npm run game:validate` 通过。
- `npx tsc --noEmit` 通过。
- `npm run lint -- --no-cache` 通过。
- `npm run build` 通过。
- Playwright：桌面首屏、身份编辑、共享房间 URL、地标移动/观察/图鉴、390×844 移动端均已检查；刷新后无 WebGL runtime error，保留 1 条 Three.js 内部 `THREE.Clock` deprecation warning。

## 已发布

- GitHub 分支：`codex/game-v7-shared-world`，提交 `03afebb69cb4885254c121b5ffeeb268d07d8375`。
- Vercel 正式站点：[jiangxinzhou-3d-digital-twin.vercel.app](https://jiangxinzhou-3d-digital-twin.vercel.app/jiangxinzhou)。
- Preview 构建已通过远端 `npm run build`；正式域名 smoke check 返回页面标题和 `/jiangxinzhou` 路由。

## 待外部配置后启用

- Supabase 项目 URL、publishable key、匿名登录开关、SQL migration 和 worker 部署尚未写入当前环境；因此线上默认仍是本地网关，不能把本地 Broadcast 演示误称为跨设备多人服务。
- 需要配置 `NEXT_PUBLIC_GAME_COMMAND_URL` 指向 `services/jiangxinzhou-sim-worker`，再进行两浏览器/32 客户端压力验证。
- 当前正式站点默认使用 LocalGameGateway，确保没有实时服务时仍可进入地图；共享房间在同源浏览器标签页之间使用 BroadcastChannel 演示。
