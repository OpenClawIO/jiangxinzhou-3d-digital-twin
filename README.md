# 南京江心洲3D时空

[English](#english) · 中文

江心洲全岛中英双语 3D 公众游览地图。项目使用 WGS84 作为统一坐标系，将高德 GCJ-02 锚点转换后再与开放道路、建筑轮廓和 Blender 米制模型叠合。

## 数据与建模

- 286 个 OpenStreetMap 建筑轮廓、263 段道路、13 个地标锚点。
- 12 条当前交通线路、43 个去重站点和 3 个换乘枢纽，覆盖 486、552、552 区间、553 内外圈、地铁 10 号线、两类接驳、假日观光、旗杆轮渡和环岛骑行。
- Blender 5.2 米制模型拆分为地形、南/中/北建筑、植被和重点地标六个 GLB。
- Blender 原创建模的公交车、自动驾驶接驳车、岛城接驳车、地铁 10 号线车厢和客运轮渡按所选线路在 Three.js 场景中展示。
- 南京眼按公开的 240 米主跨资料建模；灯塔组、ROCHO、江豚中心、胜科水务、江岛智立方和基督教江心洲堂采用分级复原。
- 高德、Google Earth、政府、新华社和机构照片仅用于位置或形态核对，不在仓库中重新分发。
- 公众游览级三维物理地图，不属于测绘、导航或地籍数据。估算模型会在界面中标记。

## 本地运行

```bash
npm install
npm run dev
```

地图校验：`npm run map:validate`；交通数据校验：`npm run transport:validate`。重新生成全岛 Blender 资产：`npm run model:build`；重新生成交通工具：`npm run model:transport`。

## Three.js 运行时

- 3D 场景独立动态加载，核心地形与地标优先，植被在浏览器空闲时再载入。
- 静止时按需渲染；相机、标签与道路只在视图变化时更新。
- 自动识别桌面与移动设备性能，同时允许手动切换精细、均衡和节能画质。
- WebGL 2 不可用时自动显示 Blender 全岛预览图，不让页面空白。

实现与回归记录见 [`THREEJS_OPTIMIZATION.md`](./THREEJS_OPTIMIZATION.md)。

## 游戏式探索

- 首次进入可选择环岛地标、自然景观或建筑文化任务，也可直接自由探索。
- 目标信标、任务 HUD 与一键定位共同引导镜头；只有进入地标视图后才能主动收录发现。
- 已发现地标会同步更新所有相关任务进度，并保存在当前浏览器；不包含账号、排名、付费或虚构地图机制。
- 中文、英文和移动端共享同一套任务状态，手机端自动采用更轻量的渲染配置。

探索规则校验：`npm run exploration:validate`。完整回归：`npm test`。

## 交通网络

- 线路选择器按公交、地铁、接驳、观光、轮渡和骑行分组；切换后同步更新线路颜色、站序、运营信息及 3D 交通工具。
- 点击任意站点可平滑聚焦；道路名称按相机缩放级别逐步显示，避免全岛鸟瞰时标签重叠。
- V10 已加入模拟实时交通层：交通图层开启后显示线路状态、车辆数量、预计到站和数据更新时间；当前数据由本地确定性模拟器生成，后续可通过服务端 provider 替换为授权实时数据。
- 高德坐标先由 GCJ-02 转换到 WGS84；没有公开精确坐标的站点按官方站序吸附到已核验道路走廊，并明确标为“导览估算站点”。
- 当前运营层不包含规划中的地铁 13、17 号线与预留线路；临时调整与班次以运营方当日公告为准。

交通数据生成：`npm run transport:build`。数据与模型清单位于 `data/jiangxinzhou-v2/transit-*.geojson`、`transport-evidence.json` 和 `public/models/jiangxinzhou-v2/scene-manifest.json`。

模拟交通实时层校验：`npm run transit:validate`。V10 默认使用 `TRANSIT_REALTIME_MODE=simulated`，无需 API Key；未来接入授权运营方数据时，服务端 provider 可读取 `TRANSIT_REALTIME_URL`、`TRANSIT_REALTIME_TOKEN` 和 `TRANSIT_REALTIME_FORMAT`，浏览器仍只访问 `/api/transit/realtime`。

## 主要来源

- [高德地图江心洲](https://ditu.amap.com/search?query=%E6%B1%9F%E5%BF%83%E6%B4%B2&city=320100)
- [Google Earth 江心洲](https://earth.google.com/web/search/Jiangxinzhou,+Nanjing,+Jiangsu,+China)
- [OpenStreetMap relation 11630502](https://www.openstreetmap.org/relation/11630502) — ODbL
- [南京市政府江心洲生态文旅资料](https://www.nanjing.gov.cn/xxgkn/jytabljggk/2025njytabl/shizxta/202512/t20251203_5704828.html)
- [南京公交 552 路区间调整公告](https://www.njgongjiao.com/tongzhi/8879)
- [建邺区岛城接驳线调整公告](https://www.njjy.gov.cn/jyyw/202605/t20260529_5848823.html)
- [南京眼项目资料](https://gjzx.nanjing.gov.cn/xmqk/qabxq/202509/t20250903_5641986.html)

完整证据台账见 `data/jiangxinzhou-v2/evidence.json`。

## English

A bilingual, full-island 3D visitor map of Jiangxinzhou, Nanjing. All spatial layers use WGS84 and a shared metre-scale Blender/Three.js scene. The project includes 286 OSM building footprints, 263 road segments, 12 current transport lines, 43 deduplicated stops, evidence-graded landmarks, responsive rendering and explicit estimated-model labels.

The transport layer covers buses, Metro Line 10, park and city shuttles, holiday sightseeing services, the Qigan ferry and the 22.5 km cycling loop. Five original Blender vehicle assets are shown along the selected line. Stops without public precise coordinates remain visibly marked as guide-map estimates.

The game-inspired exploration mode adds four expeditions, guided camera objectives, discovery feedback and browser-local progress. It does not introduce accounts, leaderboards, payments or fictional geography.

This is a public visitor 3D time-space map, not survey, navigation or cadastral data. OpenStreetMap-derived geometry is provided under ODbL; reference imagery is not redistributed.
