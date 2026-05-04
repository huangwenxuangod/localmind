import type { LocalLifeLocation, LocalLifePlace, RouteMode, RouteProfile } from "./types";

const MODE_SPEED_METERS_PER_MIN: Record<Exclude<RouteMode, "auto">, number> = {
  walk: 75,
  bike: 180,
  drive: 360,
  transit: 260,
};

function toRad(value: number) {
  return value * Math.PI / 180;
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function chooseAutoMode(distance: number, familyWithChild: boolean): Exclude<RouteMode, "auto"> {
  if (distance <= 900 && !familyWithChild) return "walk";
  if (distance <= 1400 && !familyWithChild) return "bike";
  return "drive";
}

export function estimateRoute(
  from: LocalLifeLocation | LocalLifePlace,
  to: LocalLifePlace,
  options?: {
    mode?: RouteMode;
    familyWithChild?: boolean;
    weatherRisk?: boolean;
  }
): RouteProfile {
  const rawDistance = distanceMeters(from, to);
  const familyWithChild = options?.familyWithChild ?? false;
  const selectedMode = options?.mode === "auto" || !options?.mode
    ? chooseAutoMode(rawDistance, familyWithChild)
    : options.mode;
  const trafficMultiplier = selectedMode === "drive" && rawDistance > 4_000 ? 1.25 : 1;
  const weatherMultiplier = options?.weatherRisk && selectedMode !== "drive" ? 1.25 : 1;
  const durationMin = Math.max(
    4,
    Math.round(rawDistance / MODE_SPEED_METERS_PER_MIN[selectedMode] * trafficMultiplier * weatherMultiplier)
  );
  const sameDistrict = "district" in from && from.district === to.district;
  const sameBusinessDistrict = "businessDistrict" in from && from.businessDistrict === to.businessDistrict;
  const routeShape = sameBusinessDistrict
    ? "same_business_district"
    : sameDistrict
      ? "same_district"
      : rawDistance > 10_000
        ? "cross_city"
        : "nearby";
  const walkingBurdenHigh = selectedMode === "walk" && rawDistance > (familyWithChild ? 1200 : 1800);
  const childFriendly = !walkingBurdenHigh && durationMin <= (familyWithChild ? 28 : 40);
  const frictionLevel = Math.min(
    5,
    Math.max(
      1,
      Math.ceil(durationMin / 15) + (routeShape === "cross_city" ? 1 : 0) + (walkingBurdenHigh ? 1 : 0)
    )
  ) as 1 | 2 | 3 | 4 | 5;

  return {
    fromPlaceId: "id" in from ? from.id : "user_current_location",
    toPlaceId: to.id,
    mode: selectedMode,
    distanceMeters: rawDistance,
    durationMin,
    routeShape,
    frictionLevel,
    childFriendly,
    weatherSensitive: selectedMode !== "drive" && rawDistance > 900,
    trafficRisk: selectedMode === "drive" && rawDistance > 5_000 ? "medium" : "low",
    explanation: buildRouteExplanation(selectedMode, rawDistance, durationMin, routeShape, childFriendly),
  };
}

function buildRouteExplanation(
  mode: Exclude<RouteMode, "auto">,
  distance: number,
  durationMin: number,
  routeShape: RouteProfile["routeShape"],
  childFriendly: boolean
) {
  const modeLabel = mode === "walk" ? "步行" : mode === "bike" ? "骑行" : mode === "drive" ? "打车/驾车" : "公共交通";
  const shapeLabel: Record<RouteProfile["routeShape"], string> = {
    same_business_district: "同商圈，动线顺",
    same_district: "同区移动，通勤可控",
    nearby: "跨邻近区域，需预留通勤",
    cross_city: "跨城通勤，只有高匹配才值得推荐",
    detour: "存在绕路风险",
  };
  return `${modeLabel}约 ${(distance / 1000).toFixed(1)}km，${durationMin} 分钟；${shapeLabel[routeShape]}；${childFriendly ? "亲子可接受" : "亲子场景需谨慎"}`;
}

