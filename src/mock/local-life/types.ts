import type { BusinessType, OpenHour } from "@/types";

export type HangzhouDistrict =
  | "西湖区"
  | "上城区"
  | "拱墅区"
  | "滨江区"
  | "余杭区"
  | "萧山区";

export type HangzhouBusinessDistrict =
  | "西湖景区"
  | "湖滨"
  | "黄龙"
  | "武林"
  | "城西/西溪"
  | "滨江"
  | "良渚/未来科技城"
  | "钱江新城"
  | "运河"
  | "龙井/满觉陇";

export type LocalLifeBusinessType = BusinessType | "parent_child";

export type DietTag =
  | "不辣友好"
  | "清淡"
  | "减脂友好"
  | "低油"
  | "低糖"
  | "素食选项"
  | "清真"
  | "儿童友好";

export type SceneTag =
  | "亲子轻松"
  | "朋友聚会"
  | "情侣约会"
  | "夫妻休闲"
  | "轻松不赶"
  | "拍照打卡"
  | "雨天友好"
  | "低预算"
  | "本地人认可";

export type FacilityTag =
  | "室内"
  | "户外"
  | "可停车"
  | "地铁方便"
  | "洗手间方便"
  | "婴儿车友好"
  | "可预约"
  | "可排队取号";

export type RiskTag =
  | "雨天体验下降"
  | "高温暴晒"
  | "节假日拥挤"
  | "晚高峰排队"
  | "步行较多"
  | "跨区通勤"
  | "价格偏高"
  | "儿童不适合";

export type TimeScoreMap = Record<string, number>;
export type HourLevelMap = Record<string, 1 | 2 | 3 | 4 | 5>;

export type LocalLifePlace = {
  id: string;
  name: string;
  aliasNames?: string[];
  businessType: LocalLifeBusinessType;
  categoryL1: string;
  categoryL2: string;
  categoryL3?: string;
  city: "杭州";
  district: HangzhouDistrict;
  businessDistrict: HangzhouBusinessDistrict;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  priceLevel: 1 | 2 | 3 | 4;
  avgSpendCny?: number;
  operatingStatus: "open" | "temporarily_closed" | "closed" | "unknown";
  openHours: OpenHour[];
  imageUrl?: string;
  source: "mock" | "osm" | "manual" | "public";
  sourceConfidence: number;
};

export type LocalLifeMetrics = {
  placeId: string;
  popularityScore: number;
  searchHeatScore: number;
  reviewVelocityScore: number;
  dealAttractivenessScore: number;
  conversionSignalScore: number;
  localUserApprovalScore: number;
  touristTrapRisk: number;
  aiOverrecommendedRisk: number;
  hasDeal: boolean;
  dealTags: string[];
  savedAmountCny?: number;
  reservationSupported: boolean;
  queueSupported: boolean;
  avgQueueMinByHour: TimeScoreMap;
};

export type SceneProfile = {
  placeId: string;
  familyWithChildScore: number;
  friendsGatheringScore: number;
  coupleDateScore: number;
  lightOutdoorScore: number;
  physicalIntensity: 1 | 2 | 3 | 4 | 5;
  relaxationScore: number;
  photoFriendlyScore: number;
  conversationFriendlyScore: number;
  childAgeRange?: [number, number];
  childSafetyScore?: number;
  strollerFriendly: boolean;
  restroomConvenience: 1 | 2 | 3 | 4 | 5;
  noiseLevel: 1 | 2 | 3 | 4 | 5;
  crowdLevelByHour: HourLevelMap;
  bestFor: string[];
  avoidFor: string[];
};

export type FoodProfile = {
  placeId: string;
  cuisines: string[];
  tasteProfile: {
    spicy: 0 | 1 | 2 | 3 | 4 | 5;
    oily: 0 | 1 | 2 | 3 | 4 | 5;
    sweet: 0 | 1 | 2 | 3 | 4 | 5;
    salty: 0 | 1 | 2 | 3 | 4 | 5;
    light: 0 | 1 | 2 | 3 | 4 | 5;
  };
  dietTags: DietTag[];
  mealSuitability: {
    lunch: number;
    dinner: number;
    afternoonTea: number;
    lightMeal: number;
  };
  diningSceneTags: string[];
};

export type RouteMode = "walk" | "bike" | "drive" | "transit" | "auto";

export type RouteProfile = {
  fromPlaceId: string | "user_current_location";
  toPlaceId: string;
  mode: RouteMode;
  distanceMeters: number;
  durationMin: number;
  routeShape: "same_district" | "same_business_district" | "nearby" | "cross_city" | "detour";
  frictionLevel: 1 | 2 | 3 | 4 | 5;
  childFriendly: boolean;
  weatherSensitive: boolean;
  trafficRisk: "low" | "medium" | "high";
  explanation: string;
};

export type WeatherRule = {
  condition: "rain" | "heavy_rain" | "hot" | "cold" | "windy";
  affectedTags: string[];
  preferTags: string[];
  penalty: number;
  explanation: string;
};

export type ScenarioRule = {
  id: string;
  name: string;
  triggerKeywords: string[];
  inferredPreferences: string[];
  inferredConstraints: string[];
  placeTypePreferences: LocalLifeBusinessType[];
  placeTypeAvoid: string[];
  routeConstraints: {
    maxFirstLegMin?: number;
    maxTotalTravelMin?: number;
    maxWalkMeters?: number;
  };
  defaultTimeWindow?: {
    start: string;
    end: string;
    reason: string;
  };
  explanationTemplates: string[];
};

export type GoldenScenario = {
  id: string;
  input: string;
  currentLocation: LocalLifeLocation;
  expected: {
    timeWindow?: [string, string];
    includeBusinessTypes: LocalLifeBusinessType[];
    avoidBusinessTypes: string[];
    preferences: string[];
    maxTotalTravelMin?: number;
    shouldMentionWeather?: boolean;
    shouldMentionDiet?: boolean;
  };
};

export type LocalLifeLocation = {
  label: string;
  district: HangzhouDistrict;
  businessDistrict?: HangzhouBusinessDistrict;
  lat: number;
  lng: number;
};
