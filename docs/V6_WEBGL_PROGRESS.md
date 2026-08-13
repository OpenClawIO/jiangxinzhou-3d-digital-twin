# 南京江心洲3D时空 V6 WebGL2 进度

- [x] 创建 `codex/webgl-runtime-v6` 分支
- [x] 锁定 WebGL 后处理与 GLB 优化依赖
- [x] 自适应渲染档位、帧调度、遥测与上下文恢复
- [x] 写实光照、后处理和材质补丁
- [x] 米制道路、水体、植被和南京眼渲染升级
- [x] Meshopt 模型优化与资源生命周期修复
- [x] lint、测试、生产构建和浏览器回归
- [x] GitHub 推送、Vercel Preview 与正式部署

## 验收记录

地图数据与 Blender 工程尺寸未修改。浏览器与构建验收记录：

- 默认 balanced 全岛镜头：约 60.9 FPS、150 个估算绘制调用、63,088 三角面（1440×1000，Playwright Chromium）。
- 南京眼 LOD2：111,704 三角面、137 个估算绘制调用；日景、夜景和 LOD1 404 回退均已验证。
- 默认关键 GLB 316,308 bytes；全部 GLB 从 5,076,656 bytes 压缩到 1,189,456 bytes，减少 76.6%。
- 页面实载 JavaScript 从基线约 493,217 bytes gzip 增至 544,841 bytes gzip，V6 增量约 51,624 bytes gzip。
- 390×844 移动端 peek 状态保留 90.4% 的可见地图舞台；中英文、底部面板和触控入口已回归。
- 水系 + 周边岸线 + high 组合、公交 486 动画、真实时间夜景、legacy 对照和 WebGL 故障恢复纳入浏览器回归。
- `npm test`、`npm audit --omit=dev`、Meshopt dry-run 和生产构建通过；生产依赖 0 个已知漏洞。

## 发布记录

- Vercel Preview：<https://jiangxinzhou-3d-digital-twin-3plaqabw3-x-1d49.vercel.app>
- Vercel Production：<https://jiangxinzhou-3d-digital-twin.vercel.app/jiangxinzhou>
- Preview 受 Vercel SSO 保护；已通过 `vercel curl` 验证页面和 GLB，并在公开 Production 完成桌面 WebGL2、英文深链接和南京眼 LOD2 浏览器回归。
