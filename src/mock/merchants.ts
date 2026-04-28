// Mock商家数据库 — 覆盖主要业态，供预校验/执行阶段使用
import type { Merchant } from "@/types";

export const MOCK_MERCHANTS: Merchant[] = [
  // ---- 正餐 ----
  {
    id: "m001", name: "外婆家（西湖店）", type: "restaurant",
    address: "杭州市西湖区湖滨路123号", lat: 30.2512, lng: 120.1498,
    rating: 4.6, priceLevel: 2, capacity: 120,
    openHours: [{ day: 0, open: "11:00", close: "21:30" }, { day: 1, open: "11:00", close: "21:30" }, { day: 2, open: "11:00", close: "21:30" }, { day: 3, open: "11:00", close: "21:30" }, { day: 4, open: "11:00", close: "21:30" }, { day: 5, open: "11:00", close: "22:00" }, { day: 6, open: "11:00", close: "22:00" }],
    tags: ["浙菜", "家常菜", "热门"], sceneBlacklist: [],
    dietarySupport: ["素食选项"],
  },
  {
    id: "m002", name: "绿茶餐厅（龙井路）", type: "restaurant",
    address: "杭州市西湖区龙井路88号", lat: 30.2390, lng: 120.1220,
    rating: 4.5, priceLevel: 2, capacity: 80,
    openHours: [{ day: 0, open: "11:00", close: "21:00" }, { day: 1, open: "11:00", close: "21:00" }, { day: 2, open: "11:00", close: "21:00" }, { day: 3, open: "11:00", close: "21:00" }, { day: 4, open: "11:00", close: "21:00" }, { day: 5, open: "10:30", close: "21:30" }, { day: 6, open: "10:30", close: "21:30" }],
    tags: ["江浙菜", "茶餐", "环境好"], sceneBlacklist: [],
    dietarySupport: ["素食选项", "低油低糖"],
  },
  {
    id: "m003", name: "弄堂里（解放路店）", type: "restaurant",
    address: "杭州市上城区解放路456号", lat: 30.2465, lng: 120.1680,
    rating: 4.4, priceLevel: 2, capacity: 60,
    openHours: [{ day: 0, open: "10:30", close: "21:00" }, { day: 1, open: "10:30", close: "21:00" }, { day: 2, open: "10:30", close: "21:00" }, { day: 3, open: "10:30", close: "21:00" }, { day: 4, open: "10:30", close: "21:00" }, { day: 5, open: "10:00", close: "22:00" }, { day: 6, open: "10:00", close: "22:00" }],
    tags: ["小吃", "快餐", "地道"], sceneBlacklist: [],
    dietarySupport: [],
  },
  {
    id: "m004", name: "新荣记（西湖旗舰）", type: "restaurant",
    address: "杭州市西湖区南山路66号", lat: 30.2410, lng: 120.1510,
    rating: 4.8, priceLevel: 4, capacity: 100,
    openHours: [{ day: 0, open: "11:30", close: "14:00" }, { day: 1, open: "11:30", close: "14:00" }, { day: 2, open: "11:30", close: "14:00" }, { day: 3, open: "11:30", close: "14:00" }, { day: 4, open: "11:30", close: "14:00" }, { day: 5, open: "11:30", close: "22:00" }, { day: 6, open: "11:30", close: "22:00" }],
    tags: ["台州菜", "高端", "商务"], sceneBlacklist: [],
    dietarySupport: ["清真选项"],
  },
  {
    id: "m005", name: "清真牛肉面馆", type: "restaurant",
    address: "杭州市拱墅区运河路22号", lat: 30.3210, lng: 120.1350,
    rating: 4.3, priceLevel: 1, capacity: 40,
    openHours: [{ day: 0, open: "07:00", close: "20:00" }, { day: 1, open: "07:00", close: "20:00" }, { day: 2, open: "07:00", close: "20:00" }, { day: 3, open: "07:00", close: "20:00" }, { day: 4, open: "07:00", close: "20:00" }, { day: 5, open: "07:00", close: "20:30" }, { day: 6, open: "07:00", close: "20:30" }],
    tags: ["清真", "面食", "实惠"], sceneBlacklist: [],
    dietarySupport: ["清真"],
  },

  // ---- 咖啡/茶饮 ----
  {
    id: "m010", name: "星巴克（西湖天地店）", type: "cafe",
    address: "杭州市上城区南山路28号", lat: 30.2430, lng: 120.1490,
    rating: 4.2, priceLevel: 3, capacity: 50,
    openHours: [{ day: 0, open: "08:00", close: "22:00" }, { day: 1, open: "07:30", close: "22:00" }, { day: 2, open: "07:30", close: "22:00" }, { day: 3, open: "07:30", close: "22:00" }, { day: 4, open: "07:30", close: "22:00" }, { day: 5, open: "08:00", close: "23:00" }, { day: 6, open: "08:00", close: "23:00" }],
    tags: ["咖啡", "西湖景观", "打卡"], sceneBlacklist: [],
    dietarySupport: ["植物奶"],
  },
  {
    id: "m011", name: "喜茶（湖滨In77）", type: "cafe",
    address: "杭州市上城区延安路77号B1", lat: 30.2520, lng: 120.1530,
    rating: 4.5, priceLevel: 2, capacity: 30,
    openHours: [{ day: 0, open: "10:00", close: "22:00" }, { day: 1, open: "10:00", close: "22:00" }, { day: 2, open: "10:00", close: "22:00" }, { day: 3, open: "10:00", close: "22:00" }, { day: 4, open: "10:00", close: "22:00" }, { day: 5, open: "10:00", close: "22:30" }, { day: 6, open: "10:00", close: "22:30" }],
    tags: ["奶茶", "爆款", "年轻人"], sceneBlacklist: [],
    dietarySupport: ["低糖选项"],
  },

  // ---- 购物 ----
  {
    id: "m020", name: "湖滨银泰in77", type: "shopping",
    address: "杭州市上城区延安路77号", lat: 30.2518, lng: 120.1528,
    rating: 4.3, priceLevel: 3, capacity: 5000,
    openHours: [{ day: 0, open: "10:00", close: "22:00" }, { day: 1, open: "10:00", close: "22:00" }, { day: 2, open: "10:00", close: "22:00" }, { day: 3, open: "10:00", close: "22:00" }, { day: 4, open: "10:00", close: "22:00" }, { day: 5, open: "10:00", close: "22:30" }, { day: 6, open: "10:00", close: "22:30" }],
    tags: ["商场", "购物中心", "品牌"], sceneBlacklist: [],
    dietarySupport: [],
  },
  {
    id: "m021", name: "杭州大厦（武林广场）", type: "shopping",
    address: "杭州市下城区武林广场1号", lat: 30.2820, lng: 120.1530,
    rating: 4.2, priceLevel: 4, capacity: 8000,
    openHours: [{ day: 0, open: "10:00", close: "22:00" }, { day: 1, open: "10:00", close: "22:00" }, { day: 2, open: "10:00", close: "22:00" }, { day: 3, open: "10:00", close: "22:00" }, { day: 4, open: "10:00", close: "22:00" }, { day: 5, open: "10:00", close: "22:00" }, { day: 6, open: "10:00", close: "22:00" }],
    tags: ["高端购物", "奢侈品", "武林"], sceneBlacklist: [],
    dietarySupport: [],
  },

  // ---- 娱乐 ----
  {
    id: "m030", name: "超级密室（西湖店）", type: "entertainment",
    address: "杭州市西湖区学院路99号3F", lat: 30.2750, lng: 120.1310,
    rating: 4.6, priceLevel: 3, capacity: 40,
    openHours: [{ day: 0, open: "11:00", close: "22:00" }, { day: 1, open: "13:00", close: "22:00" }, { day: 2, open: "13:00", close: "22:00" }, { day: 3, open: "13:00", close: "22:00" }, { day: 4, open: "13:00", close: "22:00" }, { day: 5, open: "11:00", close: "23:00" }, { day: 6, open: "11:00", close: "23:00" }],
    tags: ["密室逃脱", "沉浸式", "热门"],
    sceneBlacklist: ["family", "elder"],
    dietarySupport: [],
  },
  {
    id: "m031", name: "万达影城（滨江店）", type: "entertainment",
    address: "杭州市滨江区江南大道500号", lat: 30.2080, lng: 120.2150,
    rating: 4.2, priceLevel: 2, capacity: 600,
    openHours: [{ day: 0, open: "10:00", close: "24:00" }, { day: 1, open: "10:00", close: "24:00" }, { day: 2, open: "10:00", close: "24:00" }, { day: 3, open: "10:00", close: "24:00" }, { day: 4, open: "10:00", close: "24:00" }, { day: 5, open: "10:00", close: "24:00" }, { day: 6, open: "10:00", close: "24:00" }],
    tags: ["电影", "IMAX", "家庭"], sceneBlacklist: [],
    dietarySupport: [],
  },

  // ---- 休闲 ----
  {
    id: "m040", name: "西湖风景区（断桥）", type: "leisure",
    address: "杭州市西湖区北山街断桥", lat: 30.2600, lng: 120.1530,
    rating: 4.9, priceLevel: 1, capacity: 99999,
    openHours: [{ day: 0, open: "00:00", close: "23:59" }, { day: 1, open: "00:00", close: "23:59" }, { day: 2, open: "00:00", close: "23:59" }, { day: 3, open: "00:00", close: "23:59" }, { day: 4, open: "00:00", close: "23:59" }, { day: 5, open: "00:00", close: "23:59" }, { day: 6, open: "00:00", close: "23:59" }],
    tags: ["景区", "免费", "西湖", "散步"], sceneBlacklist: [],
    dietarySupport: [],
  },
  {
    id: "m041", name: "良渚文化村博物馆", type: "culture",
    address: "杭州市余杭区良渚街道良渚博物院", lat: 30.4310, lng: 120.0120,
    rating: 4.7, priceLevel: 1, capacity: 1000,
    openHours: [{ day: 0, open: "09:00", close: "17:30" }, { day: 2, open: "09:00", close: "17:30" }, { day: 3, open: "09:00", close: "17:30" }, { day: 4, open: "09:00", close: "17:30" }, { day: 5, open: "09:00", close: "17:30" }, { day: 6, open: "09:00", close: "17:30" }],
    tags: ["博物馆", "文化", "亲子", "长辈"],
    sceneBlacklist: [],
    dietarySupport: [],
  },
];

export function getMerchantsByType(type: string): Merchant[] {
  return MOCK_MERCHANTS.filter((m) => m.type === type);
}

export function getMerchantById(id: string): Merchant | undefined {
  return MOCK_MERCHANTS.find((m) => m.id === id);
}
