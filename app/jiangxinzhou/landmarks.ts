export type LandmarkCategory = "nature" | "architecture" | "culture" | "recreation" | "transport";

export type Landmark = {
  id: number;
  name: string;
  category: LandmarkCategory;
  description: string;
  season?: string;
  anchorId: string;
  modelKey?: string;
  accent: string;
  priority: number;
};

export const categoryLabels: Record<LandmarkCategory, string> = {
  nature: "自然景观",
  architecture: "地标建筑",
  culture: "人文体验",
  recreation: "休闲活动",
  transport: "滨水交通",
};

export const landmarks: Landmark[] = [
  {
    id: 1,
    name: "青奥森林公园",
    category: "nature",
    description: "沿江的林地与慢行空间，适合从桥头进入，沿江堤步道慢慢游览。",
    season: "全年",
    anchorId: "qingao-forest-park",
    modelKey: "forest-park",
    accent: "#4f9a67",
    priority: 4,
  },
  {
    id: 2,
    name: "南京眼步行桥",
    category: "transport",
    description: "江心洲南侧最醒目的滨水地标，连接两岸的步行与观景动线。",
    season: "全年",
    anchorId: "nanjing-eye",
    modelKey: "nanjing-eye",
    accent: "#2f83a9",
    priority: 1,
  },
  {
    id: 3,
    name: "长江江豚科教中心",
    category: "culture",
    description: "以长江江豚保护、科普展示和公众教育为主题的北段滨水体验节点。",
    season: "全年",
    anchorId: "dolphin-center",
    modelKey: "dolphin-hall",
    accent: "#3e8fb1",
    priority: 2,
  },
  {
    id: 4,
    name: "小垦丁灯塔",
    category: "architecture",
    description: "江堤路一带的红白旋纹灯塔群；公开资料显示，现场可见三座不同尺度的灯塔。",
    season: "5—8 月",
    anchorId: "xiaokenting-lighthouse",
    modelKey: "lighthouse",
    accent: "#d5545c",
    priority: 1,
  },
  {
    id: 5,
    name: "江岛科创中心·樱花林",
    category: "architecture",
    description: "以江岛科创中心和江岛智立方园区为原型的低密度玻璃建筑组团，周边保留樱花林与开放绿轴。",
    season: "3—4 月",
    anchorId: "e3-park",
    modelKey: "innovation-center",
    accent: "#d887a3",
    priority: 3,
  },
  {
    id: 6,
    name: "胜科国际水务中心",
    category: "architecture",
    description: "胜科国际水务中心（公开资料中的 International Sustainability Hub）现代玻璃体量与绿化界面。",
    season: "全年",
    anchorId: "water-center",
    modelKey: "water-center",
    accent: "#6573a9",
    priority: 3,
  },
  {
    id: 7,
    name: "基督教江心洲堂",
    category: "culture",
    description: "以 OSM 实名建筑轮廓修正旧版导览锚点，按白色礼拜堂体量与尖塔轮廓进行分级复原。",
    season: "全年",
    anchorId: "chapel",
    modelKey: "chapel",
    accent: "#7969a7",
    priority: 5,
  },
  {
    id: 8,
    name: "江堤步道",
    category: "recreation",
    description: "沿江慢行的连续体验线，串联灯塔、花田与森林公园。",
    season: "全年",
    anchorId: "riverwalk",
    modelKey: "riverwalk",
    accent: "#c48742",
    priority: 6,
  },
  {
    id: 9,
    name: "大江侧粉黛花田",
    category: "nature",
    description: "江风光带上的季节性花田，秋季呈现粉色观景带。",
    season: "10—11 月",
    anchorId: "pink-field",
    modelKey: "pink-field",
    accent: "#db91ad",
    priority: 5,
  },
  {
    id: 10,
    name: "池杉林四季花海",
    category: "nature",
    description: "水杉、花海和林下空间共同组成南段的自然景观节点。",
    season: "四季轮换",
    anchorId: "seasonal-garden",
    modelKey: "seasonal-garden",
    accent: "#d6a04e",
    priority: 5,
  },
  {
    id: 11,
    name: "ROCHO灯塔咖啡馆",
    category: "recreation",
    description: "江心洲北段的圆形滨江咖啡空间，公开报道提到其橙粉色楼梯通道、环形室内与绿地环境。",
    season: "全年",
    anchorId: "rocho-cafe",
    modelKey: "rocho-cafe",
    accent: "#dc7a91",
    priority: 2,
  },
];

export const routes = [
  {
    id: "island-loop",
    name: "江心洲环岛线",
    description: "串联北段灯塔、中段建筑和南段花海的主游览线",
    color: "#e2b75d",
    roadNames: ["环岛东路", "环岛西路", "江堤路"],
  },
  {
    id: "riverwalk",
    name: "江堤慢行线",
    description: "贴近江面的观景支线，适合骑行与日落散步",
    color: "#6cc1c0",
    roadNames: ["江堤路", "林荫路", "南京眼步行桥"],
  },
  {
    id: "innovation-axis",
    name: "科创绿轴线",
    description: "沿中新大道、梅子洲路串联科创园区与滨江节点",
    color: "#88b7da",
    roadNames: ["中新大道", "梅子洲路", "科技路", "思泽路"],
  },
] as const;
