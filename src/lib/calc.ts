/*
 * 利益の計算。
 *
 *   売上     ＝ 店頭 ＋ Uber ＋ ロケット（手数料を引く前）
 *   原価     ＝ 売上 × 目標の原価率（設定）
 *   粗利     ＝ 売上 − 原価
 *   販管費   ＝ 人件費（時給×時間）＋ 販売手数料（Uber・ロケット）＋ 固定費の日割り
 *   営業利益 ＝ 粗利 − 販管費
 *
 * 【レシートは利益に入れない】（2026-11-22 ユーザー。強く指定）
 * 値段は材料費が目標の原価率に収まるように決めているので、原価は売上 × 目標の原価率で出す。
 * レシートは別に足しておくだけ（receiptCost＝材料・包装、receiptOther＝それ以外）。原価にも販管費にも入れない。
 * 使い道は、月ごとに足しておくのと、品目の単価の上がり下がりを見る（lib/priceWatch.ts）ことだけ。
 *
 * 固定費（家賃など）は月の額をその月の日数で割り、期間の日数分を入れる。週が月をまたいでも、
 * 日ごとにその日の月で割るので合う。
 */
import { isCostCategory } from "@/lib/categories";
import { daysInMonth, eachDay } from "@/lib/dates";
import type { DayRecord, FixedCost, Purchase } from "@/lib/types";

export type Summary = {
  sales: { store: number; uber: number; rocket: number; total: number };
  /** 原価＝売上 × 目標の原価率 */
  cost: number;
  /** 材料・包装のレシートの合計（別に足しておくだけ。利益には入れない） */
  receiptCost: number;
  /** それ以外のレシートの合計（同じく利益には入れない） */
  receiptOther: number;
  grossProfit: number;
  labor: number;
  laborHours: number;
  fees: number;
  fixedCosts: number;
  sga: number;
  operatingProfit: number;
  /** 売上を入れた日の数 */
  openDays: number;
};

export function laborCostOf(day: DayRecord): number {
  return day.labor.reduce((sum, entry) => sum + Math.round(entry.hours * entry.hourlyWage), 0);
}

export function salesTotalOf(day: DayRecord): number {
  return day.sales.store + day.sales.uber + day.sales.rocket;
}

/** 手数料の初めの値（売上 × 率%）。円未満は切り捨て */
export function feeFromRate(sales: number, ratePercent: number): number {
  if (sales <= 0 || ratePercent <= 0) return 0;
  return Math.floor((sales * ratePercent) / 100);
}

/** 固定費の日割り。その日の月の日数で割る */
export function fixedCostOfDay(date: string, fixedCosts: FixedCost[]): number {
  const monthly = fixedCosts.reduce((sum, cost) => sum + cost.monthlyAmount, 0);
  return monthly / daysInMonth(date.slice(0, 7));
}

export function summarize(
  from: string,
  to: string,
  days: DayRecord[],
  purchases: Purchase[],
  fixedCosts: FixedCost[],
  targetPercent: number,
): Summary {
  const inRange = (date: string) => date >= from && date <= to;
  const sales = { store: 0, uber: 0, rocket: 0, total: 0 };
  let labor = 0;
  let laborHours = 0;
  let fees = 0;
  let openDays = 0;
  for (const day of days) {
    if (!inRange(day.date)) continue;
    sales.store += day.sales.store;
    sales.uber += day.sales.uber;
    sales.rocket += day.sales.rocket;
    if (salesTotalOf(day) > 0) openDays += 1;
    labor += laborCostOf(day);
    laborHours += day.labor.reduce((sum, entry) => sum + entry.hours, 0);
    fees += day.fees.uber + day.fees.rocket;
  }
  sales.total = sales.store + sales.uber + sales.rocket;

  let receiptCost = 0;
  let receiptOther = 0;
  for (const purchase of purchases) {
    if (!inRange(purchase.date)) continue;
    if (isCostCategory(purchase.category)) receiptCost += purchase.total;
    else receiptOther += purchase.total;
  }

  const fixed = Math.round(eachDay(from, to).reduce((sum, date) => sum + fixedCostOfDay(date, fixedCosts), 0));
  const cost = Math.round((sales.total * Math.max(0, targetPercent)) / 100);
  const grossProfit = sales.total - cost;
  const sga = labor + fees + fixed;
  return {
    sales,
    cost,
    receiptCost,
    grossProfit,
    labor,
    laborHours,
    fees,
    receiptOther,
    fixedCosts: fixed,
    sga,
    operatingProfit: grossProfit - sga,
    openDays,
  };
}
