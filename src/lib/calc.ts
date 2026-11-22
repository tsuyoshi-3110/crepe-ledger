/*
 * 利益の計算。
 *
 *   売上     ＝ 店頭 ＋ Uber ＋ ロケット（手数料を引く前）
 *   原価     ＝ レシートの「材料費」「包装資材費」（レシートの日付の日に数える）
 *   粗利     ＝ 売上 − 原価
 *   販管費   ＝ 人件費（時給×時間）＋ 販売手数料（Uber・ロケット）＋ その他の経費のレシート ＋ 固定費の日割り
 *   営業利益 ＝ 粗利 − 販管費
 *
 * 固定費（家賃など）は月の額をその月の日数で割り、期間の日数分を入れる。週が月をまたいでも、
 * 日ごとにその日の月で割るので合う。
 *
 * 【週の原価は目安】（2026-11-22 ユーザー指定）
 * 材料はまとめて買うので、レシートの日付で数えると、買った週だけ原価が大きく、次の週は0に近くなる。
 * レシートは月単位で売上から引くと実際に近い。そこで週の原価は「週の売上 × その月の原価率」にする。
 * 月の途中なら、月初からその日までのレシートと売上で率を出す。月をまたぐ週は、日ごとにその日の月の率を使う。
 */
import { isCostCategory } from "@/lib/categories";
import { daysInMonth, eachDay } from "@/lib/dates";
import type { DayRecord, FixedCost, Purchase } from "@/lib/types";

export type Summary = {
  sales: { store: number; uber: number; rocket: number; total: number };
  cost: number;
  grossProfit: number;
  labor: number;
  laborHours: number;
  fees: number;
  otherExpenses: number;
  fixedCosts: number;
  sga: number;
  operatingProfit: number;
  /** 売上を入れた日の数 */
  openDays: number;
  /** 原価が目安（月の原価率から出した）か。false はレシートを足した実際の額 */
  costEstimated: boolean;
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

  let cost = 0;
  let otherExpenses = 0;
  for (const purchase of purchases) {
    if (!inRange(purchase.date)) continue;
    if (isCostCategory(purchase.category)) cost += purchase.total;
    else otherExpenses += purchase.total;
  }

  const fixed = Math.round(eachDay(from, to).reduce((sum, date) => sum + fixedCostOfDay(date, fixedCosts), 0));
  const grossProfit = sales.total - cost;
  const sga = labor + fees + otherExpenses + fixed;
  return {
    sales,
    cost,
    grossProfit,
    labor,
    laborHours,
    fees,
    otherExpenses,
    fixedCosts: fixed,
    sga,
    operatingProfit: grossProfit - sga,
    openDays,
    costEstimated: false,
  };
}

/** その月の原価率（0〜1）。月初から upTo（月末より前ならその日）までのレシートと売上で出す。売上が無ければ null */
export function monthCostRate(month: string, upTo: string, days: DayRecord[], purchases: Purchase[]): number | null {
  const from = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const to = upTo < monthEnd ? upTo : monthEnd;
  if (to < from) return null;
  const s = summarize(from, to, days, purchases, []);
  return s.sales.total > 0 ? s.cost / s.sales.total : null;
}

/** 週・1日の集計。原価だけ「日ごとの売上 × その日の月の原価率」に置き換える（理由はこのファイルの頭） */
export function summarizeWithMonthRate(
  from: string,
  to: string,
  today: string,
  days: DayRecord[],
  purchases: Purchase[],
  fixedCosts: FixedCost[],
): Summary {
  const base = summarize(from, to, days, purchases, fixedCosts);
  const rates = new Map<string, number | null>();
  const rateOf = (month: string) => {
    if (!rates.has(month)) rates.set(month, monthCostRate(month, today, days, purchases));
    return rates.get(month) ?? 0;
  };
  let cost = 0;
  for (const day of days) {
    if (day.date < from || day.date > to) continue;
    cost += salesTotalOf(day) * rateOf(day.date.slice(0, 7));
  }
  cost = Math.round(cost);
  const grossProfit = base.sales.total - cost;
  return { ...base, cost, grossProfit, operatingProfit: grossProfit - base.sga, costEstimated: true };
}
