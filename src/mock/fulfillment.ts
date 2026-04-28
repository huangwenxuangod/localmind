// Mock履约API — 模拟商家预约/预校验接口
import type { Merchant, ValidationResult, ExecutionResult } from "@/types";
import { getMerchantById } from "./merchants";

// 模拟网络延迟
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// 验证商家在指定时段是否可用
export async function validateMerchant(
  merchantId: string,
  startTime: string,
  endTime: string,
  headcount: number
): Promise<ValidationResult> {
  await delay(100 + Math.random() * 200);

  const merchant = getMerchantById(merchantId);
  if (!merchant) {
    return { merchantId, available: false, reason: "商家不存在" };
  }

  const start = new Date(startTime);
  const dayOfWeek = start.getDay() as 0|1|2|3|4|5|6;
  const timeStr = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;

  const todayHours = merchant.openHours.find((h) => h.day === dayOfWeek);
  if (!todayHours) {
    return { merchantId, available: false, reason: "今日不营业" };
  }
  if (timeStr < todayHours.open || timeStr >= todayHours.close) {
    return { merchantId, available: false, reason: `营业时间 ${todayHours.open}-${todayHours.close}，不在时段内` };
  }
  if (headcount > merchant.capacity) {
    return { merchantId, available: false, reason: `容量不足（最大${merchant.capacity}人）` };
  }

  // 模拟5%随机不可用（满座等）
  if (Math.random() < 0.05) {
    return { merchantId, available: false, reason: "当前时段名额已满" };
  }

  return { merchantId, available: true };
}

// 执行预约
export async function executeMerchantBooking(
  merchantId: string,
  startTime: string,
  headcount: number
): Promise<ExecutionResult> {
  await delay(200 + Math.random() * 500);

  const merchant = getMerchantById(merchantId);
  if (!merchant) {
    return { taskId: "", success: false, merchant: null, failureReason: "商家不存在", executedAt: new Date().toISOString() };
  }

  // 模拟3%执行失败（瞬间停业/系统异常）
  if (Math.random() < 0.03) {
    return {
      taskId: "",
      success: false,
      merchant,
      failureReason: "预约系统异常，请稍后重试",
      executedAt: new Date().toISOString(),
    };
  }

  return {
    taskId: "",
    success: true,
    merchant,
    executedAt: new Date().toISOString(),
  };
}
