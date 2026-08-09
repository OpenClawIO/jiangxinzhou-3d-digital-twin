import type { LandmarkCategory } from "./landmarks";

export type Language = "zh" | "en";

export type LocalizedText = {
  zh: string;
  en: string;
};

export const languageLabels: Record<Language, string> = {
  zh: "中",
  en: "EN",
};

export const localize = (text: LocalizedText, language: Language): string => text[language];

export const pageCopy = {
  title: {
    zh: "南京江心洲 3D 孪生数字地图",
    en: "Nanjing Jiangxinzhou 3D Digital Twin Map",
  },
  description: {
    zh: "基于 WGS84、开放建筑轮廓、高德地图、Google Earth 与公开建筑资料交叉核验的江心洲全岛 3D 数字地图。",
    en: "A full-island 3D map cross-checked against WGS84 open geometry, Amap, Google Earth and public architectural references.",
  },
  openGraphDescription: {
    zh: "探索江心洲经公开资料核实的地标建筑、季节景观与滨江游览路线。",
    en: "Explore publicly cross-checked landmarks, seasonal landscapes and riverside routes across Jiangxinzhou.",
  },
  intro: {
    zh: "真实比例全岛底图、286 个建筑轮廓与分级写实地标，共享同一套米制空间坐标。",
    en: "A metre-based island model with 286 building footprints and evidence-graded landmark reconstructions.",
  },
  noScript: {
    zh: "需要启用 JavaScript 才能浏览江心洲 3D 场景。",
    en: "Enable JavaScript to explore the Jiangxinzhou 3D scene.",
  },
} satisfies Record<string, LocalizedText>;

export const experienceCopy = {
  ariaLabel: {
    zh: "江心洲 3D 地图体验",
    en: "Jiangxinzhou 3D map experience",
  },
  toolbarKicker: {
    zh: "探索江心洲 · 地图数据",
    en: "EXPLORE THE ISLAND · MAP DATA",
  },
  heading: {
    zh: "全岛空间实景 · 2026 当前状态",
    en: "FULL-ISLAND SPATIAL VIEW · CURRENT 2026",
  },
  languageToggle: {
    zh: "语言选择",
    en: "Language selector",
  },
  layers: {
    zh: "图层",
    en: "LAYERS",
  },
  roads: {
    zh: "道路",
    en: "Roads",
  },
  buildings: {
    zh: "建筑",
    en: "Buildings",
  },
  landscape: {
    zh: "景观",
    en: "Landscape",
  },
  landmarkLayer: {
    zh: "地标",
    en: "Landmarks",
  },
  viewTabs: {
    zh: "地图视角",
    en: "Map view",
  },
  overview: {
    zh: "全岛视图",
    en: "Overview",
  },
  route: {
    zh: "路线浏览",
    en: "Route browse",
  },
  landmark: {
    zh: "地标视图",
    en: "Landmark view",
  },
  stageNote: {
    zh: "拖拽旋转 · 滚轮缩放 · 点击地标",
    en: "Drag to rotate · scroll to zoom · click a landmark",
  },
  performanceMode: {
    zh: "节能模式",
    en: "Efficiency mode",
  },
  quality: {
    zh: "画质",
    en: "Quality",
  },
  qualityControl: {
    zh: "切换 3D 渲染画质",
    en: "Change 3D rendering quality",
  },
  qualityAuto: {
    zh: "自动",
    en: "Auto",
  },
  qualityHigh: {
    zh: "精细",
    en: "High",
  },
  qualityBalanced: {
    zh: "均衡",
    en: "Balanced",
  },
  qualityEfficiency: {
    zh: "节能",
    en: "Efficiency",
  },
  renderOnDemand: {
    zh: "按需渲染",
    en: "Render on demand",
  },
  loadingScene: {
    zh: "正在建立全岛三维场景",
    en: "Building the full-island 3D scene",
  },
  loadingSceneDetail: {
    zh: "先显示核心地形，植被将在设备空闲时载入",
    en: "Core terrain first; vegetation loads while the device is idle",
  },
  webglUnavailable: {
    zh: "此设备暂时无法运行 WebGL 2",
    en: "WebGL 2 is unavailable on this device",
  },
  webglFallback: {
    zh: "已显示 Blender 全岛预览图；可更新浏览器或关闭图形节能设置后重试。",
    en: "A Blender overview is shown instead. Update the browser or disable graphics power saving, then retry.",
  },
  retryScene: {
    zh: "重试 3D 场景",
    en: "Retry 3D scene",
  },
  resetView: {
    zh: "复位全岛",
    en: "Reset island",
  },
  north: {
    zh: "北方",
    en: "North",
  },
  legend: {
    zh: "地图图例",
    en: "Map legend",
  },
  legendLandmark: {
    zh: "地标",
    en: "Landmarks",
  },
  legendRoute: {
    zh: "游览路线",
    en: "Routes",
  },
  legendRoad: {
    zh: "道路中心线",
    en: "Road centerlines",
  },
  legendWater: {
    zh: "滨水区域",
    en: "Waterfront",
  },
  islandProfile: {
    zh: "岸线、道路、建筑、景观与地标统一投影到 WGS84 米制坐标；高德 GCJ-02 锚点已转换后再参与叠合。",
    en: "Shoreline, roads, buildings, landscapes and landmarks share one WGS84 metre grid; Amap GCJ-02 anchors are converted before alignment.",
  },
  islandProfileTitle: { zh: "岛屿概况", en: "ISLAND PROFILE" },
  area: { zh: "官方面积", en: "Official area" },
  embankment: { zh: "环岛堤路", en: "Embankment loop" },
  buildingFootprints: { zh: "建筑轮廓", en: "Building footprints" },
  keyLandmarks: {
    zh: "个重点地标",
    en: "key landmarks",
  },
  roadSegments: {
    zh: "条道路线",
    en: "road segments",
  },
  routes: {
    zh: "条路线",
    en: "routes",
  },
  selectedLandmark: {
    zh: "已选地标",
    en: "SELECTED LANDMARK",
  },
  bestExperience: {
    zh: "最佳体验",
    en: "Best experience",
  },
  amapVerified: {
    zh: "高德锚点已核验",
    en: "Amap anchor verified",
  },
  relativePosition: {
    zh: "导览相对定位 · 待现场复核",
    en: "Relative guide-map position · field verification pending",
  },
  triangulated: { zh: "多源核验", en: "Cross-checked" },
  estimated: { zh: "估算模型", en: "Estimated model" },
  focusLandmark: {
    zh: "聚焦这个地标",
    en: "Focus this landmark",
  },
  routeSelector: {
    zh: "路线选择",
    en: "ROUTE SELECTOR",
  },
  landmarkIndex: {
    zh: "地标索引",
    en: "LANDMARK INDEX",
  },
  evidence: { zh: "证据与来源", en: "EVIDENCE & SOURCES" },
  sources: { zh: "项来源", en: "sources" },
  dataLayer: {
    zh: "数据层 / OSM ODbL + 高德 POI 核验 + Google Earth 形态参照 · Blender 5.2 GLB",
    en: "DATA / OSM ODbL + AMAP POI CHECK + GOOGLE EARTH FORM REFERENCE · BLENDER 5.2 GLB",
  },
  precisionNote: {
    zh: "公众游览级数字孪生 · 非测绘或地籍数据",
    en: "PUBLIC VISITOR DIGITAL TWIN · NOT SURVEY OR CADASTRAL DATA",
  },
  location: {
    zh: "南京 · 江心洲 · 2026",
    en: "Nanjing · Jiangxinzhou · 2026",
  },
} satisfies Record<string, LocalizedText>;

export const categoryLabels: Record<Language, Record<LandmarkCategory, string>> = {
  zh: {
    nature: "自然景观",
    architecture: "地标建筑",
    culture: "人文体验",
    recreation: "休闲活动",
    transport: "滨水交通",
  },
  en: {
    nature: "Natural landscape",
    architecture: "Landmark architecture",
    culture: "Cultural experience",
    recreation: "Leisure",
    transport: "Waterfront transport",
  },
};

export const landmarkCopy: Record<number, {
  name: LocalizedText;
  description: LocalizedText;
  season: LocalizedText;
}> = {
  1: {
    name: { zh: "青奥森林公园", en: "Qing'ao Forest Park" },
    description: {
      zh: "沿江的林地与慢行空间，适合从桥头进入，沿江堤步道慢慢游览。",
      en: "A riverside woodland and slow-mobility space, best entered from the bridgehead and explored along the embankment walk.",
    },
    season: { zh: "全年", en: "Year-round" },
  },
  2: {
    name: { zh: "南京眼步行桥", en: "Nanjing Eye Pedestrian Bridge" },
    description: {
      zh: "江心洲南侧最醒目的滨水地标，连接两岸的步行与观景动线。",
      en: "Jiangxinzhou's most recognizable southern waterfront landmark, connecting both banks with a pedestrian and viewing route.",
    },
    season: { zh: "全年", en: "Year-round" },
  },
  3: {
    name: { zh: "长江江豚科教中心", en: "Yangtze Finless Porpoise Science & Education Center" },
    description: {
      zh: "以长江江豚保护、科普展示和公众教育为主题的北段滨水体验节点。",
      en: "A northern waterfront experience node focused on Yangtze finless porpoise conservation, science exhibits and public education.",
    },
    season: { zh: "全年", en: "Year-round" },
  },
  4: {
    name: { zh: "小垦丁灯塔", en: "Xiaokenting Lighthouse" },
    description: {
      zh: "江堤路一带的红白旋纹灯塔群；公开资料显示，现场可见三座不同尺度的灯塔。",
      en: "A group of red-and-white spiral lighthouses along Jiangdi Road; public references show three towers in different scales.",
    },
    season: { zh: "5—8 月", en: "May–August" },
  },
  5: {
    name: { zh: "江岛科创中心·樱花林", en: "Jiangdao Innovation Center · Cherry Blossom Grove" },
    description: {
      zh: "以江岛科创中心和江岛智立方园区为原型的低密度玻璃建筑组团，周边保留樱花林与开放绿轴。",
      en: "A low-rise glass cluster inspired by Jiangdao Innovation Center and Jiangdao Smart Cube, framed by a cherry grove and an open green axis.",
    },
    season: { zh: "3—4 月", en: "March–April" },
  },
  6: {
    name: { zh: "胜科国际水务中心", en: "Sembcorp International Water Center" },
    description: {
      zh: "胜科国际水务中心（公开资料中的 International Sustainability Hub）现代玻璃体量与绿化界面。",
      en: "A modern glass volume and planted frontage inspired by Sembcorp International Water Center, also referenced publicly as the International Sustainability Hub.",
    },
    season: { zh: "全年", en: "Year-round" },
  },
  7: {
    name: { zh: "基督教江心洲堂", en: "Jiangxinzhou Christian Church" },
    description: {
      zh: "以 OSM 实名建筑轮廓修正旧版导览锚点，按白色礼拜堂体量与尖塔轮廓进行分级复原。",
      en: "The former guide-map anchor is corrected to the named OSM footprint and reconstructed as a white chapel mass with a slender spire.",
    },
    season: { zh: "全年", en: "Year-round" },
  },
  8: {
    name: { zh: "江堤步道", en: "Riverside Embankment Walk" },
    description: {
      zh: "沿江慢行的连续体验线，串联灯塔、花田与森林公园。",
      en: "A continuous riverside walking line connecting the lighthouses, flower fields and forest park.",
    },
    season: { zh: "全年", en: "Year-round" },
  },
  9: {
    name: { zh: "大江侧粉黛花田", en: "Riverside Pink Muhly Field" },
    description: {
      zh: "江风光带上的季节性花田，秋季呈现粉色观景带。",
      en: "A seasonal flower field along the riverfront, forming a pink viewing belt in autumn.",
    },
    season: { zh: "10—11 月", en: "October–November" },
  },
  10: {
    name: { zh: "池杉林四季花海", en: "Pond Cypress Four-Season Flower Garden" },
    description: {
      zh: "水杉、花海和林下空间共同组成南段的自然景观节点。",
      en: "Pond cypress, seasonal blooms and an understory space form this southern nature node.",
    },
    season: { zh: "四季轮换", en: "Seasonal rotation" },
  },
  11: {
    name: { zh: "ROCHO灯塔咖啡馆", en: "ROCHO Lighthouse Café" },
    description: {
      zh: "江心洲北段的圆形滨江咖啡空间，公开报道提到其橙粉色楼梯通道、环形室内与绿地环境。",
      en: "A circular riverside café in northern Jiangxinzhou, publicly described with orange-pink stairways, a ring-shaped interior and a green setting.",
    },
    season: { zh: "全年", en: "Year-round" },
  },
};

export const routeCopy: Record<string, { name: LocalizedText; description: LocalizedText }> = {
  "island-loop": {
    name: { zh: "江心洲环岛线", en: "Jiangxinzhou Island Loop" },
    description: {
      zh: "串联北段灯塔、中段建筑和南段花海的主游览线",
      en: "The main sightseeing loop linking northern lighthouses, central buildings and southern flower fields",
    },
  },
  riverwalk: {
    name: { zh: "江堤慢行线", en: "Riverside Slow Walk" },
    description: {
      zh: "贴近江面的观景支线，适合骑行与日落散步",
      en: "A waterside viewing branch for cycling and sunset walks",
    },
  },
  "innovation-axis": {
    name: { zh: "科创绿轴线", en: "Innovation Green Axis" },
    description: {
      zh: "沿中新大道、梅子洲路串联科创园区与滨江节点",
      en: "A green-axis route along Zhongxin Avenue and Meizizhou Road linking innovation parks with the waterfront",
    },
  },
};
