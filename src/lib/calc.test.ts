import { test } from "node:test";
import assert from "node:assert/strict";

import { feeFromRate, fixedCostOfDay, monthCostRate, summarize, summarizeWithMonthRate } from "./calc";
import { weeksOfMonth } from "./dates";
import { emptyDay, type DayRecord, type Purchase } from "./types";

function day(date: string, patch: Partial<DayRecord>): DayRecord {
  return { ...emptyDay(date), ...patch };
}

function purchase(date: string, total: number, category: string): Purchase {
  return { id: `${date}-${total}`, date, storeName: "", total, category, items: [], createdAt: 0 };
}

test("売上−原価が粗利、粗利−販管費が営業利益", () => {
  const days = [
    day("2026-11-02", {
      sales: { store: 30000, uber: 10000, rocket: 5000 },
      fees: { uber: 3500, rocket: 1500 },
      labor: [{ staffId: "a", name: "A", hours: 5, hourlyWage: 1100 }, { staffId: "b", name: "B", hours: 2.5, hourlyWage: 1000 }],
    }),
  ];
  const purchases = [purchase("2026-11-02", 8000, "材料費"), purchase("2026-11-02", 2000, "包装資材費"), purchase("2026-11-02", 1000, "消耗品費")];
  const s = summarize("2026-11-02", "2026-11-02", days, purchases, []);
  assert.equal(s.sales.total, 45000);
  assert.equal(s.cost, 10000);
  assert.equal(s.grossProfit, 35000);
  assert.equal(s.labor, 5500 + 2500);
  assert.equal(s.laborHours, 7.5);
  assert.equal(s.fees, 5000);
  assert.equal(s.otherExpenses, 1000);
  assert.equal(s.operatingProfit, 35000 - (8000 + 5000 + 1000));
  assert.equal(s.openDays, 1);
});

test("期間の外の日とレシートは数えない", () => {
  const days = [day("2026-11-01", { sales: { store: 100, uber: 0, rocket: 0 } }), day("2026-11-03", { sales: { store: 999, uber: 0, rocket: 0 } })];
  const s = summarize("2026-11-01", "2026-11-02", days, [purchase("2026-11-03", 500, "材料費")], []);
  assert.equal(s.sales.total, 100);
  assert.equal(s.cost, 0);
});

test("固定費はその日の月の日数で日割りし、1か月分でちょうど月の額", () => {
  const fixed = [{ id: "rent", name: "家賃", monthlyAmount: 90000 }];
  assert.equal(fixedCostOfDay("2026-11-10", fixed), 3000);
  assert.equal(summarize("2026-11-01", "2026-11-30", [], [], fixed).fixedCosts, 90000);
  // 10/26〜11/1：10月の6日分（31日で割る）＋11月の1日分（30日で割る）
  assert.equal(summarize("2026-10-26", "2026-11-01", [], [], fixed).fixedCosts, Math.round((90000 / 31) * 6 + 3000));
});

test("手数料の初めの値は売上×率で、円未満は切り捨て", () => {
  assert.equal(feeFromRate(10001, 35), 3500);
  assert.equal(feeFromRate(10000, 0), 0);
});

test("週は月曜はじまりで、月をまたぐ週も含める", () => {
  const weeks = weeksOfMonth("2026-11");
  assert.equal(weeks[0].from, "2026-10-26");
  assert.equal(weeks[0].to, "2026-11-01");
  assert.equal(weeks.at(-1)?.from, "2026-11-30");
  assert.equal(weeks.length, 6);
});

test("週の原価は、週の売上 × その月の原価率（月初から今日まで）", () => {
  const sales = (date: string, store: number) => day(date, { sales: { store, uber: 0, rocket: 0 } });
  const days = [sales("2026-11-02", 10000), sales("2026-11-09", 30000)];
  // 11/2 にまとめて買った 12,000 円。今日 11/10 までの率は 12000 / 40000 = 30%
  const purchases = [purchase("2026-11-02", 12000, "材料費")];
  assert.equal(monthCostRate("2026-11", "2026-11-10", days, purchases), 0.3);
  const week1 = summarizeWithMonthRate("2026-11-02", "2026-11-08", "2026-11-10", days, purchases, []);
  const week2 = summarizeWithMonthRate("2026-11-09", "2026-11-15", "2026-11-10", days, purchases, []);
  assert.equal(week1.cost, 3000);
  assert.equal(week2.cost, 9000);
  assert.equal(week1.costEstimated, true);
  // 週の目安を足すと、月のレシートの実際の額に合う
  assert.equal(week1.cost + week2.cost, summarize("2026-11-01", "2026-11-30", days, purchases, []).cost);
});

test("月をまたぐ週は、日ごとにその日の月の率を使う", () => {
  const days = [day("2026-10-31", { sales: { store: 10000, uber: 0, rocket: 0 } }), day("2026-11-01", { sales: { store: 10000, uber: 0, rocket: 0 } })];
  const purchases = [purchase("2026-10-31", 2000, "材料費"), purchase("2026-11-01", 4000, "材料費")];
  assert.equal(summarizeWithMonthRate("2026-10-26", "2026-11-01", "2026-11-05", days, purchases, []).cost, 2000 + 4000);
  assert.equal(monthCostRate("2026-12", "2026-11-05", days, purchases), null);
});
