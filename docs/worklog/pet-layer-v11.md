# 南京江心洲 PET 生态层 V11 工作记录

## 目标

在江心洲自然景观区域加入四个原创低面数 PET：岛岛小狗、樱樱小猫、花花小兔和鹭鹭白鹭。PET 与江豚、水体、道路和交通分层，使用 Blender GLB + Three.js 程序化动作，不改变地图基础数据。

## 动作设计

- 小狗：漫游、嗅闻、坐下、摇摆式身体节奏。
- 小猫：漫游、伸懒腰、休息、短距离巡游。
- 小兔：跳跃、吃草、警觉停留。
- 白鹭：涉水、理羽、短暂起飞。

动作使用确定性周期，不加入夸张跳跃；`reducedMotion`、Legacy 和 efficiency 档只显示静态模型。

## 场景布置

- 小狗：青奥森林公园绿地。
- 小猫：ROCHO 灯塔咖啡馆附近。
- 小兔：粉黛花田附近。
- 白鹭：江堤步道近岸区域。

每个 PET 在锚点周围限制活动半径，不穿越建筑和水体，不增加点击任务和多人同步协议。自然景观开关关闭时不加载、不绘制 PET 层。

## 资产预算

- `jiangxinzhou-pets.glb`：Blender 原创几何。
- 4 个语义根节点：`PetDog`、`PetCat`、`PetRabbit`、`PetEgret`。
- 6,076 三角面、21 个材质 primitive、84,688 bytes Meshopt GLB。
- 通过合并每个物种网格，避免零件级模型造成过多绘制调用。

## 验证

```bash
npm run model:pets
npm run pets:validate
npm run lint
npm test
```

`do` skill 的 task 初始化脚本因当前 Python 3.9 不支持项目脚本使用的 `X | Y` 类型语法而失败；因此本文件作为本次工作管理与验收记录，代码在当前分支直接完成并执行同等验证。
