/*
 * Excel に書き出す表の中身。確定申告や税理士さんに渡すときに使う。
 * ここでは表（列と行）だけを作り、Excel のファイルにするのは lib/exportExcel.ts（ブラウザで作る）。
 *
 * 原価は売上 × 目標の原価率（lib/calc.ts）。レシートは利益に入れず、月の集計の右に月ごとの合計だけ並べる。
 */
import { laborCostOf, salesTotalOf, summarize } from "@/lib/calc";
import { isCostCategory } from "@/lib/categories";
import { daysInMonth, dateWithWeekday, eachDay, monthLabel, shiftMonth } from "@/lib/dates";
import type { DayRecord, FixedCost, Material, Purchase } from "@/lib/types";

export type CellFormat = "yen" | "rate" | "number";
export type Column = { header: string; width: number; format?: CellFormat };
export type Cell = string | number | null;
export type Sheet = { name: string; columns: Column[]; rows: Cell[][]; totalRow?: Cell[] };

export type ExportInput = {
  days: DayRecord[];
  purchases: Purchase[];
  materials: Material[];
  fixedCosts: FixedCost[];
  settings: { targetCostRate: number };
};

const rate = (numerator: number, denominator: number): Cell => (denominator > 0 ? numerator / denominator : null);

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = shiftMonth(m, 1)) months.push(m);
  return months;
}

/** from〜to（両端を含む）の表。to は今日より先なら今日までにする */
export function buildSheets(input: ExportInput, from: string, to: string, today: string): Sheet[] {
  const end = to < today ? to : today;
  const inRange = (date: string) => date >= from && date <= end;
  const days = input.days.filter((d) => inRange(d.date));
  const purchases = input.purchases.filter((p) => inRange(p.date)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  // 集計（月ごと）
  const summaryColumns: Column[] = [
    { header: "月", width: 12 },
    { header: "営業日数", width: 9, format: "number" },
    { header: "店頭", width: 12, format: "yen" },
    { header: "Uber Eats", width: 12, format: "yen" },
    { header: "ロケットナウ", width: 12, format: "yen" },
    { header: "売上", width: 13, format: "yen" },
    { header: "原価（売上×目標の率）", width: 16, format: "yen" },
    { header: "粗利", width: 13, format: "yen" },
    { header: "人件費", width: 12, format: "yen" },
    { header: "人件費率", width: 8, format: "rate" },
    { header: "手数料", width: 12, format: "yen" },
    { header: "固定費", width: 12, format: "yen" },
    { header: "営業利益", width: 13, format: "yen" },
    { header: "利益率", width: 8, format: "rate" },
    { header: "レシート：材料・包装", width: 16, format: "yen" },
    { header: "レシート：その他", width: 14, format: "yen" },
  ];
  const summaryRow = (label: string, f: string, t: string): Cell[] => {
    const s = summarize(f, t, input.days, input.purchases, input.fixedCosts, input.settings.targetCostRate);
    return [
      label, s.openDays, s.sales.store, s.sales.uber, s.sales.rocket, s.sales.total,
      s.cost, s.grossProfit,
      s.labor, rate(s.labor, s.sales.total), s.fees, s.fixedCosts,
      s.operatingProfit, rate(s.operatingProfit, s.sales.total),
      s.receiptCost, s.receiptOther,
    ];
  };
  const months = monthsBetween(from, end);
  const summarySheet: Sheet = {
    name: "月の集計",
    columns: summaryColumns,
    rows: months.map((m) => {
      const monthEnd = `${m}-${String(daysInMonth(m)).padStart(2, "0")}`;
      return summaryRow(monthLabel(m), m + "-01" < from ? from : `${m}-01`, monthEnd < end ? monthEnd : end);
    }),
    totalRow: months.length > 1 ? summaryRow("合計", from, end) : undefined,
  };

  // 日ごと
  const byDate = new Map(days.map((d) => [d.date, d]));
  const daySheet: Sheet = {
    name: "日ごとの売上",
    columns: [
      { header: "日付", width: 12 },
      { header: "曜日", width: 10 },
      { header: "店頭", width: 11, format: "yen" },
      { header: "Uber Eats", width: 11, format: "yen" },
      { header: "ロケットナウ", width: 11, format: "yen" },
      { header: "売上", width: 12, format: "yen" },
      { header: "Uber 手数料", width: 11, format: "yen" },
      { header: "ロケット手数料", width: 12, format: "yen" },
      { header: "人件費", width: 11, format: "yen" },
      { header: "働いた時間", width: 10, format: "number" },
      { header: "メモ", width: 30 },
    ],
    rows: eachDay(from, end).map((date) => {
      const d = byDate.get(date);
      const weekday = dateWithWeekday(date).replace(/^.*\(/, "").replace(")", "");
      if (!d) return [date, weekday, null, null, null, null, null, null, null, null, "（未入力）"];
      const hours = d.labor.reduce((sum, e) => sum + e.hours, 0);
      return [
        date, weekday, d.sales.store, d.sales.uber, d.sales.rocket, salesTotalOf(d),
        d.fees.uber, d.fees.rocket, laborCostOf(d), hours, [d.closed ? "休み" : "", d.note].filter(Boolean).join("　"),
      ];
    }),
  };
  daySheet.totalRow = ["合計", "", ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => daySheet.rows.reduce((sum, r) => sum + (Number(r[i]) || 0), 0)), ""];

  // レシート
  const receiptSheet: Sheet = {
    name: "レシート",
    columns: [
      { header: "日付", width: 12 },
      { header: "店", width: 22 },
      { header: "科目", width: 12 },
      { header: "区分", width: 12 },
      { header: "金額", width: 12, format: "yen" },
    ],
    rows: purchases.map((p) => [p.date, p.storeName, p.category, isCostCategory(p.category) ? "材料・包装" : "その他", p.total]),
    totalRow: ["合計", "", "", "", purchases.reduce((sum, p) => sum + p.total, 0)],
  };

  // 品目
  const materialName = new Map(input.materials.map((m) => [m.id, m.name]));
  const itemSheet: Sheet = {
    name: "レシートの品目",
    columns: [
      { header: "日付", width: 12 },
      { header: "店", width: 22 },
      { header: "品名（レシートのまま）", width: 28 },
      { header: "材料", width: 16 },
      { header: "数量", width: 7, format: "number" },
      { header: "金額", width: 11, format: "yen" },
      { header: "単価", width: 11, format: "yen" },
    ],
    rows: purchases.flatMap((p) =>
      p.items.map((item) => [
        p.date, p.storeName, item.name, materialName.get(item.materialId) ?? "", item.quantity, item.amount,
        item.quantity > 0 ? Math.round(item.amount / item.quantity) : null,
      ]),
    ),
  };

  // 人件費
  const laborSheet: Sheet = {
    name: "人件費",
    columns: [
      { header: "日付", width: 12 },
      { header: "名前", width: 14 },
      { header: "時間", width: 8, format: "number" },
      { header: "時給", width: 10, format: "yen" },
      { header: "金額", width: 11, format: "yen" },
    ],
    rows: days
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .flatMap((d) => d.labor.filter((e) => e.hours > 0).map((e) => [d.date, e.name, e.hours, e.hourlyWage, Math.round(e.hours * e.hourlyWage)])),
  };
  laborSheet.totalRow = ["合計", "", laborSheet.rows.reduce((s, r) => s + Number(r[2]), 0), "", laborSheet.rows.reduce((s, r) => s + Number(r[4]), 0)];

  return [summarySheet, daySheet, receiptSheet, itemSheet, laborSheet];
}
