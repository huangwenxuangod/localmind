import type { FoodProfile, LocalLifeMetrics, SceneProfile } from "./types";
import { LOCAL_LIFE_PLACES } from "./places";

const q = { "14": 8, "15": 10, "16": 12, "17": 18, "18": 28, "19": 24 };
const lowCrowd = { "14": 2, "15": 2, "16": 2, "17": 3, "18": 3, "19": 2 } as const;
const midCrowd = { "14": 3, "15": 3, "16": 3, "17": 4, "18": 4, "19": 4 } as const;
const highCrowd = { "14": 4, "15": 5, "16": 5, "17": 4, "18": 4, "19": 4 } as const;

export const LOCAL_LIFE_METRICS: LocalLifeMetrics[] = [
  {
    placeId: "hz_xh_leisure_001",
    popularityScore: 96,
    searchHeatScore: 94,
    reviewVelocityScore: 80,
    dealAttractivenessScore: 20,
    conversionSignalScore: 75,
    localUserApprovalScore: 88,
    touristTrapRisk: 62,
    aiOverrecommendedRisk: 72,
    hasDeal: false,
    dealTags: ["免费"],
    reservationSupported: false,
    queueSupported: false,
    avgQueueMinByHour: { "14": 0, "15": 0, "16": 0, "17": 0, "18": 0 },
  },
  {
    placeId: "hz_xh_leisure_002",
    popularityScore: 82,
    searchHeatScore: 76,
    reviewVelocityScore: 68,
    dealAttractivenessScore: 50,
    conversionSignalScore: 66,
    localUserApprovalScore: 86,
    touristTrapRisk: 28,
    aiOverrecommendedRisk: 24,
    hasDeal: true,
    dealTags: ["低价门票", "亲子散步"],
    savedAmountCny: 8,
    reservationSupported: false,
    queueSupported: false,
    avgQueueMinByHour: { "14": 0, "15": 0, "16": 0, "17": 0 },
  },
  {
    placeId: "hz_sc_shopping_001",
    popularityScore: 94,
    searchHeatScore: 96,
    reviewVelocityScore: 85,
    dealAttractivenessScore: 72,
    conversionSignalScore: 88,
    localUserApprovalScore: 84,
    touristTrapRisk: 48,
    aiOverrecommendedRisk: 58,
    hasDeal: true,
    dealTags: ["餐饮团购", "下午茶", "停车优惠"],
    savedAmountCny: 35,
    reservationSupported: true,
    queueSupported: true,
    avgQueueMinByHour: { "14": 6, "15": 8, "16": 10, "17": 15, "18": 25 },
  },
  {
    placeId: "hz_xh_rest_001",
    popularityScore: 90,
    searchHeatScore: 88,
    reviewVelocityScore: 72,
    dealAttractivenessScore: 82,
    conversionSignalScore: 90,
    localUserApprovalScore: 86,
    touristTrapRisk: 34,
    aiOverrecommendedRisk: 42,
    hasDeal: true,
    dealTags: ["双人套餐", "家庭聚餐", "性价比"],
    savedAmountCny: 42,
    reservationSupported: true,
    queueSupported: true,
    avgQueueMinByHour: q,
  },
  {
    placeId: "hz_xh_rest_002",
    popularityScore: 86,
    searchHeatScore: 78,
    reviewVelocityScore: 70,
    dealAttractivenessScore: 76,
    conversionSignalScore: 82,
    localUserApprovalScore: 84,
    touristTrapRisk: 25,
    aiOverrecommendedRisk: 30,
    hasDeal: true,
    dealTags: ["清淡江浙菜", "双人套餐"],
    savedAmountCny: 30,
    reservationSupported: true,
    queueSupported: true,
    avgQueueMinByHour: { "14": 4, "15": 4, "16": 8, "17": 14, "18": 22 },
  },
  {
    placeId: "hz_xh_food_001",
    popularityScore: 78,
    searchHeatScore: 72,
    reviewVelocityScore: 66,
    dealAttractivenessScore: 70,
    conversionSignalScore: 70,
    localUserApprovalScore: 80,
    touristTrapRisk: 18,
    aiOverrecommendedRisk: 18,
    hasDeal: true,
    dealTags: ["轻食套餐", "工作日优惠"],
    savedAmountCny: 25,
    reservationSupported: true,
    queueSupported: false,
    avgQueueMinByHour: { "14": 2, "15": 3, "16": 4, "17": 8, "18": 16 },
  },
  {
    placeId: "hz_yh_parent_001",
    popularityScore: 84,
    searchHeatScore: 80,
    reviewVelocityScore: 76,
    dealAttractivenessScore: 65,
    conversionSignalScore: 74,
    localUserApprovalScore: 78,
    touristTrapRisk: 20,
    aiOverrecommendedRisk: 22,
    hasDeal: true,
    dealTags: ["亲子票", "全天畅玩"],
    savedAmountCny: 60,
    reservationSupported: true,
    queueSupported: true,
    avgQueueMinByHour: { "14": 12, "15": 14, "16": 18, "17": 12 },
  },
];

export const SCENE_PROFILES: SceneProfile[] = [
  {
    placeId: "hz_xh_leisure_001",
    familyWithChildScore: 82,
    friendsGatheringScore: 74,
    coupleDateScore: 84,
    lightOutdoorScore: 88,
    physicalIntensity: 2,
    relaxationScore: 86,
    photoFriendlyScore: 92,
    conversationFriendlyScore: 62,
    childAgeRange: [4, 12],
    childSafetyScore: 78,
    strollerFriendly: false,
    restroomConvenience: 3,
    noiseLevel: 3,
    crowdLevelByHour: highCrowd,
    bestFor: ["亲子散步", "情侣走走", "免费打卡"],
    avoidFor: ["暴雨", "节假日极限避人流"],
  },
  {
    placeId: "hz_xh_leisure_002",
    familyWithChildScore: 90,
    friendsGatheringScore: 66,
    coupleDateScore: 78,
    lightOutdoorScore: 92,
    physicalIntensity: 2,
    relaxationScore: 90,
    photoFriendlyScore: 84,
    conversationFriendlyScore: 70,
    childAgeRange: [3, 12],
    childSafetyScore: 88,
    strollerFriendly: true,
    restroomConvenience: 4,
    noiseLevel: 2,
    crowdLevelByHour: midCrowd,
    bestFor: ["低强度亲子", "植物观察", "轻松散步"],
    avoidFor: ["大雨", "闭园前赶场"],
  },
  {
    placeId: "hz_sc_shopping_001",
    familyWithChildScore: 76,
    friendsGatheringScore: 94,
    coupleDateScore: 86,
    lightOutdoorScore: 58,
    physicalIntensity: 2,
    relaxationScore: 78,
    photoFriendlyScore: 82,
    conversationFriendlyScore: 76,
    strollerFriendly: true,
    restroomConvenience: 5,
    noiseLevel: 4,
    crowdLevelByHour: highCrowd,
    bestFor: ["朋友逛街", "雨天室内", "餐饮衔接"],
    avoidFor: ["想完全安静", "节假日怕人多"],
  },
  {
    placeId: "hz_xh_rest_002",
    familyWithChildScore: 82,
    friendsGatheringScore: 82,
    coupleDateScore: 76,
    lightOutdoorScore: 30,
    physicalIntensity: 1,
    relaxationScore: 82,
    photoFriendlyScore: 70,
    conversationFriendlyScore: 78,
    childAgeRange: [3, 12],
    childSafetyScore: 80,
    strollerFriendly: true,
    restroomConvenience: 4,
    noiseLevel: 3,
    crowdLevelByHour: midCrowd,
    bestFor: ["清淡晚餐", "家庭用餐", "低油低糖"],
    avoidFor: ["追求强仪式感约会"],
  },
  {
    placeId: "hz_qj_rest_001",
    familyWithChildScore: 54,
    friendsGatheringScore: 78,
    coupleDateScore: 94,
    lightOutdoorScore: 42,
    physicalIntensity: 1,
    relaxationScore: 74,
    photoFriendlyScore: 88,
    conversationFriendlyScore: 86,
    strollerFriendly: false,
    restroomConvenience: 4,
    noiseLevel: 2,
    crowdLevelByHour: lowCrowd,
    bestFor: ["夫妻约会", "环境优先", "纪念日"],
    avoidFor: ["低预算", "带小孩快速吃饭"],
  },
  {
    placeId: "hz_yh_parent_001",
    familyWithChildScore: 96,
    friendsGatheringScore: 40,
    coupleDateScore: 30,
    lightOutdoorScore: 20,
    physicalIntensity: 3,
    relaxationScore: 70,
    photoFriendlyScore: 78,
    conversationFriendlyScore: 42,
    childAgeRange: [2, 8],
    childSafetyScore: 92,
    strollerFriendly: true,
    restroomConvenience: 5,
    noiseLevel: 4,
    crowdLevelByHour: midCrowd,
    bestFor: ["雨天亲子", "消耗孩子精力", "室内安全"],
    avoidFor: ["只想安静散步", "预算敏感"],
  },
];

export const FOOD_PROFILES: FoodProfile[] = [
  {
    placeId: "hz_xh_rest_001",
    cuisines: ["杭帮菜", "江浙菜", "家常菜"],
    tasteProfile: { spicy: 1, oily: 2, sweet: 3, salty: 2, light: 4 },
    dietTags: ["不辣友好", "清淡", "儿童友好"],
    mealSuitability: { lunch: 86, dinner: 90, afternoonTea: 20, lightMeal: 64 },
    diningSceneTags: ["家庭聚餐", "朋友聚会", "性价比"],
  },
  {
    placeId: "hz_xh_rest_002",
    cuisines: ["江浙菜", "茶餐厅"],
    tasteProfile: { spicy: 1, oily: 2, sweet: 2, salty: 2, light: 5 },
    dietTags: ["不辣友好", "清淡", "减脂友好", "低油", "素食选项", "儿童友好"],
    mealSuitability: { lunch: 82, dinner: 88, afternoonTea: 34, lightMeal: 78 },
    diningSceneTags: ["家庭聚餐", "清淡晚餐", "朋友聊天"],
  },
  {
    placeId: "hz_xh_food_001",
    cuisines: ["轻食", "西餐", "沙拉"],
    tasteProfile: { spicy: 0, oily: 1, sweet: 1, salty: 2, light: 5 },
    dietTags: ["不辣友好", "清淡", "减脂友好", "低油", "低糖", "素食选项"],
    mealSuitability: { lunch: 80, dinner: 76, afternoonTea: 62, lightMeal: 94 },
    diningSceneTags: ["减脂轻食", "快速解决", "情侣轻晚餐"],
  },
  {
    placeId: "hz_bj_rest_001",
    cuisines: ["江浙菜", "家常菜"],
    tasteProfile: { spicy: 1, oily: 2, sweet: 2, salty: 2, light: 4 },
    dietTags: ["不辣友好", "清淡", "儿童友好"],
    mealSuitability: { lunch: 82, dinner: 86, afternoonTea: 20, lightMeal: 60 },
    diningSceneTags: ["朋友聚会", "家庭聚餐", "商场衔接"],
  },
  {
    placeId: "hz_sc_cafe_001",
    cuisines: ["咖啡", "甜品", "轻食"],
    tasteProfile: { spicy: 0, oily: 1, sweet: 3, salty: 1, light: 4 },
    dietTags: ["不辣友好", "低糖", "素食选项"],
    mealSuitability: { lunch: 35, dinner: 20, afternoonTea: 86, lightMeal: 64 },
    diningSceneTags: ["下午茶", "朋友聊天", "逛街休息"],
  },
];

export function getMetrics(placeId: string) {
  return LOCAL_LIFE_METRICS.find((item) => item.placeId === placeId) ?? synthesizeMetrics(placeId);
}

export function getSceneProfile(placeId: string) {
  return SCENE_PROFILES.find((item) => item.placeId === placeId) ?? synthesizeSceneProfile(placeId);
}

export function getFoodProfile(placeId: string) {
  return FOOD_PROFILES.find((item) => item.placeId === placeId) ?? synthesizeFoodProfile(placeId);
}

function stableNoise(seed: string, min: number, max: number) {
  const code = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return min + (code % (max - min + 1));
}

function placeById(placeId: string) {
  return LOCAL_LIFE_PLACES.find((place) => place.id === placeId);
}

function synthesizeMetrics(placeId: string): LocalLifeMetrics | undefined {
  const place = placeById(placeId);
  if (!place) return undefined;
  const base = Math.round(place.rating * 18 + place.sourceConfidence * 8);
  const popularity = Math.max(45, Math.min(96, base + stableNoise(placeId, -8, 8)));
  const dealByType = place.businessType === "restaurant" || place.businessType === "shopping" || place.businessType === "parent_child";
  const queueBase = place.businessType === "restaurant" ? 18 : place.businessType === "shopping" ? 10 : place.businessType === "parent_child" ? 14 : 4;
  return {
    placeId,
    popularityScore: popularity,
    searchHeatScore: Math.max(40, Math.min(96, popularity + stableNoise(`${placeId}:heat`, -10, 10))),
    reviewVelocityScore: Math.max(35, Math.min(92, Math.round(Math.log10(place.reviewCount + 10) * 18))),
    dealAttractivenessScore: dealByType ? stableNoise(`${placeId}:deal`, 58, 86) : stableNoise(`${placeId}:deal`, 25, 58),
    conversionSignalScore: stableNoise(`${placeId}:conversion`, 62, 90),
    localUserApprovalScore: Math.max(50, Math.min(94, Math.round(place.rating * 18 + stableNoise(`${placeId}:local`, -4, 8)))),
    touristTrapRisk: place.businessDistrict === "西湖景区" || place.businessDistrict === "湖滨"
      ? stableNoise(`${placeId}:tourist`, 38, 70)
      : stableNoise(`${placeId}:tourist`, 12, 42),
    aiOverrecommendedRisk: place.reviewCount > 50000 || place.businessDistrict === "西湖景区"
      ? stableNoise(`${placeId}:ai`, 42, 76)
      : stableNoise(`${placeId}:ai`, 14, 46),
    hasDeal: dealByType,
    dealTags: dealByType ? defaultDealTags(place) : [],
    savedAmountCny: dealByType ? stableNoise(`${placeId}:save`, 12, 68) : undefined,
    reservationSupported: place.businessType === "restaurant" || place.businessType === "parent_child" || place.businessType === "entertainment",
    queueSupported: place.businessType === "restaurant" || place.businessType === "shopping" || place.businessType === "parent_child",
    avgQueueMinByHour: {
      "14": Math.max(0, queueBase - 6),
      "15": Math.max(0, queueBase - 4),
      "16": queueBase,
      "17": queueBase + 6,
      "18": queueBase + 12,
      "19": queueBase + 10,
    },
  };
}

function defaultDealTags(place: NonNullable<ReturnType<typeof placeById>>) {
  if (place.businessType === "parent_child") return ["亲子票", "周末套餐"];
  if (place.businessType === "restaurant" && place.categoryL2.includes("轻食")) return ["轻食套餐", "双人优惠"];
  if (place.businessType === "restaurant") return ["双人套餐", "到店团购"];
  if (place.businessType === "shopping") return ["餐饮团购", "停车优惠"];
  return ["到店优惠"];
}

function synthesizeSceneProfile(placeId: string): SceneProfile | undefined {
  const place = placeById(placeId);
  if (!place) return undefined;
  const isIndoor = ["shopping", "parent_child", "culture", "entertainment", "restaurant", "cafe"].includes(place.businessType);
  const isParent = place.businessType === "parent_child";
  const isFood = place.businessType === "restaurant" || place.businessType === "cafe";
  const isLeisure = place.businessType === "leisure";
  const physicalIntensity = place.businessType === "sport" ? 4 : isLeisure ? 2 : 1;
  const crowd = place.businessDistrict === "湖滨" || place.businessDistrict === "西湖景区" ? highCrowd : place.businessType === "parent_child" ? midCrowd : lowCrowd;
  return {
    placeId,
    familyWithChildScore: isParent ? 90 : isIndoor ? 76 : isLeisure ? 74 : 58,
    friendsGatheringScore: place.businessType === "shopping" ? 92 : isFood ? 82 : place.businessType === "entertainment" ? 84 : 68,
    coupleDateScore: place.categoryL3?.includes("精品") || place.categoryL3?.includes("约会") ? 88 : isFood || place.businessType === "cafe" ? 78 : isLeisure ? 80 : 62,
    lightOutdoorScore: isLeisure ? 86 : isIndoor ? 48 : 58,
    physicalIntensity,
    relaxationScore: isFood || place.businessType === "cafe" ? 82 : isParent ? 70 : place.businessType === "shopping" ? 76 : 78,
    photoFriendlyScore: place.businessDistrict === "西湖景区" || place.categoryL2.includes("街区") ? 86 : isIndoor ? 72 : 68,
    conversationFriendlyScore: isFood || place.businessType === "cafe" ? 78 : place.businessType === "shopping" ? 70 : 62,
    childAgeRange: isParent ? [2, 10] : isLeisure ? [4, 12] : undefined,
    childSafetyScore: isParent ? 88 : isIndoor ? 78 : 68,
    strollerFriendly: isIndoor || place.businessType === "shopping",
    restroomConvenience: isIndoor ? 5 : place.businessDistrict === "西湖景区" ? 3 : 4,
    noiseLevel: place.businessType === "parent_child" || place.businessType === "shopping" ? 4 : place.businessType === "cafe" ? 2 : 3,
    crowdLevelByHour: crowd,
    bestFor: defaultBestFor(place),
    avoidFor: defaultAvoidFor(place),
  };
}

function defaultBestFor(place: NonNullable<ReturnType<typeof placeById>>) {
  if (place.businessType === "parent_child") return ["亲子放电", "雨天备选", "儿童友好"];
  if (place.businessType === "shopping") return ["朋友逛街", "雨天室内", "餐饮衔接"];
  if (place.businessType === "culture") return ["长辈友好", "雨天室内", "低强度"];
  if (place.businessType === "restaurant") return ["聚餐", "补给", "聊天"];
  if (place.businessType === "cafe") return ["休息", "聊天", "下午茶"];
  if (place.businessType === "entertainment") return ["朋友轻娱乐", "约会", "雨天"];
  return ["轻松走走", "拍照", "放松"];
}

function defaultAvoidFor(place: NonNullable<ReturnType<typeof placeById>>) {
  if (place.businessType === "sport") return ["低强度亲子", "长辈同行"];
  if (place.businessType === "parent_child") return ["只想安静聊天", "预算敏感"];
  if (place.businessDistrict === "西湖景区") return ["极限避人流", "大雨天户外"];
  if (place.businessType === "restaurant") return ["完全不想排队"];
  return ["强实时保障场景"];
}

function synthesizeFoodProfile(placeId: string): FoodProfile | undefined {
  const place = placeById(placeId);
  if (!place || (place.businessType !== "restaurant" && place.businessType !== "cafe")) return undefined;
  const isLight = place.categoryL2.includes("轻食") || place.categoryL2.includes("咖啡") || place.categoryL2.includes("茶");
  const isJiangzhe = place.categoryL2.includes("江浙") || place.categoryL3?.includes("杭帮") || place.categoryL3?.includes("家常");
  return {
    placeId,
    cuisines: [place.categoryL2, place.categoryL3 ?? place.categoryL1].filter(Boolean),
    tasteProfile: {
      spicy: isJiangzhe || isLight ? 1 : 2,
      oily: isLight ? 1 : 2,
      sweet: isJiangzhe ? 3 : 2,
      salty: 2,
      light: isLight ? 5 : isJiangzhe ? 4 : 3,
    },
    dietTags: [
      "不辣友好",
      ...(isLight || isJiangzhe ? ["清淡" as const] : []),
      ...(isLight ? ["减脂友好" as const, "低油" as const, "低糖" as const, "素食选项" as const] : []),
      ...(isJiangzhe ? ["儿童友好" as const] : []),
    ],
    mealSuitability: {
      lunch: place.businessType === "restaurant" ? 82 : 38,
      dinner: place.businessType === "restaurant" ? 86 : 28,
      afternoonTea: place.businessType === "cafe" ? 88 : isLight ? 60 : 24,
      lightMeal: isLight ? 92 : 62,
    },
    diningSceneTags: place.businessType === "cafe" ? ["下午茶", "朋友聊天", "约会休息"] : ["朋友聚餐", "家庭用餐", "本地生活"],
  };
}
