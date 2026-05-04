import type { BusinessType, Merchant } from "@/types";
import type { LocalLifeBusinessType, LocalLifePlace } from "./types";

export function toCoreBusinessType(type: LocalLifeBusinessType): BusinessType {
  return type === "parent_child" ? "leisure" : type;
}

export function localPlaceToMerchant(place: LocalLifePlace): Merchant {
  return {
    id: place.id,
    name: place.name,
    type: toCoreBusinessType(place.businessType),
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    rating: place.rating,
    priceLevel: place.priceLevel,
    openHours: place.openHours,
    capacity: 999,
    tags: [
      place.categoryL1,
      place.categoryL2,
      place.businessDistrict,
      place.district,
      place.source === "mock" ? "mock数据" : "已入库名称",
    ].filter(Boolean),
    sceneBlacklist: [],
    dietarySupport: [],
  };
}
