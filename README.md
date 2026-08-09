# 南京江心洲 3D 孪生数字地图 V2

[English](#english) · 中文

江心洲全岛中英双语 3D 公众游览地图。项目使用 WGS84 作为统一坐标系，将高德 GCJ-02 锚点转换后再与开放道路、建筑轮廓和 Blender 米制模型叠合。

## 数据与建模

- 286 个 OpenStreetMap 建筑轮廓、263 段道路、13 个地标锚点。
- Blender 5.2 米制模型拆分为地形、南/中/北建筑、植被和重点地标六个 GLB。
- 南京眼按公开的 240 米主跨资料建模；灯塔组、ROCHO、江豚中心、胜科水务、江岛智立方和基督教江心洲堂采用分级复原。
- 高德、Google Earth、政府、新华社和机构照片仅用于位置或形态核对，不在仓库中重新分发。
- 公众游览级数字孪生，不属于测绘、导航或地籍数据。估算模型会在界面中标记。

## 本地运行

```bash
npm install
npm run dev
```

数据校验：`npm run map:validate`。重新生成 Blender 资产：`npm run model:build`。

## Three.js 运行时

- 3D 场景独立动态加载，核心地形与地标优先，植被在浏览器空闲时再载入。
- 静止时按需渲染；相机、标签与道路只在视图变化时更新。
- 自动识别桌面与移动设备性能，同时允许手动切换精细、均衡和节能画质。
- WebGL 2 不可用时自动显示 Blender 全岛预览图，不让页面空白。

实现与回归记录见 [`THREEJS_OPTIMIZATION.md`](./THREEJS_OPTIMIZATION.md)。

## 主要来源

- [高德地图江心洲](https://ditu.amap.com/search?query=%E6%B1%9F%E5%BF%83%E6%B4%B2&city=320100)
- [Google Earth 江心洲](https://earth.google.com/web/search/Jiangxinzhou,+Nanjing,+Jiangsu,+China)
- [OpenStreetMap relation 11630502](https://www.openstreetmap.org/relation/11630502) — ODbL
- [南京市政府江心洲生态文旅资料](https://www.nanjing.gov.cn/xxgkn/jytabljggk/2025njytabl/shizxta/202512/t20251203_5704828.html)
- [南京眼项目资料](https://gjzx.nanjing.gov.cn/xmqk/qabxq/202509/t20250903_5641986.html)

完整证据台账见 `data/jiangxinzhou-v2/evidence.json`。

## English

A bilingual, full-island 3D visitor map of Jiangxinzhou, Nanjing. All spatial layers use WGS84 and a shared metre-scale Blender/Three.js scene. The project includes 286 OSM building footprints, 263 road segments, evidence-graded landmarks, responsive rendering and explicit estimated-model labels.

This is a public visitor digital twin, not survey, navigation or cadastral data. OpenStreetMap-derived geometry is provided under ODbL; reference imagery is not redistributed.
