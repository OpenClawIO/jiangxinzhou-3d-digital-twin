# 南京眼步行桥重建报告

更新日期：2026-08-12

## 结果

- 使用 Blender 5.2 Python API 建立独立双 LOD 南京眼模型，旧版直杆桥塔占位几何已从通用地标资产移除。
- 工程路径采用 `road-11-0 + road-11-2` 的九点 WGS84 中心线，模型路径约 828 米，对应官方 827.5 米工程路线。
- LOD1：12,696 三角面、411,196 bytes、7 个材质绘制组。
- LOD2：74,992 三角面、2,022,548 bytes、36 根斜拉索、11 个材质绘制组。
- Three.js 在全岛和移动端使用 LOD1；桌面平衡/高画质的南京眼特写使用 LOD2，并保留 LOD1 加载回退。
- 桥塔、桥面和边缘灯随南京真实日夜状态平滑变化。

## 视觉核验

Wikimedia Commons 公开分类中的 12 张 CC BY-SA 4.0 照片用于侧视、桥面、塔内、塔脚、拉索、栏杆和入口核验。照片确认索塔为底部开口、桥面从两腿之间穿过的倾斜椭圆拱，而不是底部闭合的椭圆环。照片只作为参考，没有嵌入网站或 GLB。

工程参数和全部照片元数据见 [`data/jiangxinzhou-v2/nanjing-eye-evidence.json`](../data/jiangxinzhou-v2/nanjing-eye-evidence.json)。Blender 自动生成的五个检查视角保存在被 Git 忽略的 `output/nanjing-eye-review/`。

## 自动验证

- `npm run lint`
- `npm run model:validate`
- `npm test`
- Playwright 桌面 1440×1000：中文、LOD2、实时夜景、来源链接，无控制台错误。
- Playwright 移动端 390×844：自动节能模式、LOD1、中英文切换、详情卡，无控制台错误。

当前模型属于照片核验的公众游览级重建，不属于测绘、激光扫描或施工 BIM 数据。
