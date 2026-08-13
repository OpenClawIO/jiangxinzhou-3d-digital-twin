# 江心洲江豚模型 V10 工作记录

## 重建目标

替换原先由多个球体和薄片鳍片拼接的粗糙江豚模型，保持现有 Three.js 动画、实例复用和 GLB URL 不变，提升近距离辨识度。

## 已完成

- Blender 改为连续环带曲面生成身体和圆钝头部。
- 保留短吻、青灰背部、浅色腹部、无背鳍低脊、眼睛、胸鳍和分叉尾鳍。
- 胸鳍与尾鳍改为带厚度、扫掠曲线和圆角的实体网格。
- GLB 保留 `PorpoiseBody`、`PorpoiseHead`、`PorpoiseBackRidge`、`PorpoiseFlipperLeft`、`PorpoiseFlipperRight`、`PorpoiseTail` 语义节点。
- Three.js 保留 GLB 多材质组，不再把腹部材质错误降级为第一种材质。

## 当前资产指标

- 文件：`public/models/jiangxinzhou-v2/finless-porpoise.glb`
- 三角面：25,952
- 绘制调用：7
- 压缩后体积：129,352 bytes
- 长度：约 1.82 m
- 模型类型：公众游览级连续曲面原创模型

## 验收

已完成 Blender 正面斜视、侧视、俯视渲染；已通过 `porpoise:validate`、TypeScript 和 lint。完整项目回归与 Preview 发布在模型校验后执行。
