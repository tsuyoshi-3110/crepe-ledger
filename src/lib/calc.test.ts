import { test } from "node:test";
import assert from "node:assert/strict";

import { feeFromRate, fixedCostOfDay, summarize } from "./calc";
import { weeksOfMonth } from "./dates";
import { emptyDay, type DayRecord, type Purchase } from "./types";

function day(date: string, patch: Partial<DayRecord>): DayRecord {
  return { ...emptyDay(date), ...patch };
}

function purchase(date: string, total: number, category: string): Purchase {
  return { id: `${date}-${total}`, date, storeName: "", total, category, items: [], createdAt: 0 };
}

test("原価は（売上−手数料）×目標の原価率。レシートは別に足すだけで利益に入れない", () => {
  const days = [
    day("2026-11-02", {
      sales: { store: 30000, uber: 10000, rocket: 5000 },
      fees: { uber: 3500, rocket: 1500 },
      labor: [{ staffId: "a", name: "A", hours: 5, hourlyWage: 1100 }, { staffId: "b", name: "B", hours: 2.5, hourlyWage: 1000 }],
    }),
  ];
  const purchases = [purchase("2026-11-02", 8000, "材料費"), purchase("2026-11-02", 2000, "包装資材費"), purchase("2026-11-02", 1000, "消耗品費")];
  const s = summarize("2026-11-02", "2026-11-02", days, purchases, [], 30);
  assert.equal(s.sales.total, 45000);
  assert.equal(s.cost, 12000);
  assert.equal(s.receiptCost, 10000);
  assert.equal(s.grossProfit, 33000);
  assert.equal(s.labor, 5500 + 2500);
  assert.equal(s.laborHours, 7.5);
  assert.equal(s.fees, 5000);
  assert.equal(s.receiptOther, 1000);
  assert.equal(s.operatingProfit, 33000 - (8000 + 5000));
  assert.equal(s.openDays, 1);
});

test("レシートが無くても原価は引く", () => {
  const days = [day("2026-11-22", { sales: { store: 75410, uber: 9515, rocket: 10960 } })];
  assert.equal(summarize("2026-11-22", "2026-11-22", days, [], [], 30).cost, Math.round(95885 * 0.3));
});

test("期間の外の日とレシートは数えない", () => {
  const days = [day("2026-11-01", { sales: { store: 100, uber: 0, rocket: 0 } }), day("2026-11-03", { sales: { store: 999, uber: 0, rocket: 0 } })];
  const s = summarize("2026-11-01", "2026-11-02", days, [purchase("2026-11-03", 500, "材料費")], [], 30);
  assert.equal(s.sales.total, 100);
  assert.equal(s.receiptCost, 0);
});

test("固定費はその日の月の日数で日割りし、1か月分でちょうど月の額", () => {
  const fixed = [{ id: "rent", name: "家賃", monthlyAmount: 90000 }];
  assert.equal(fixedCostOfDay("2026-11-10", fixed), 3000);
  assert.equal(summarize("2026-11-01", "2026-11-30", [], [], fixed, 30).fixedCosts, 90000);
  assert.equal(summarize("2026-10-26", "2026-11-01", [], [], fixed, 30).fixedCosts, Math.round((90000 / 31) * 6 + 3000));
});

test("手数料の初めの値は売上×率で、円未満は切り捨て", () => {
  assert.equal(feeFromRate(10001, 35), 3500);
  assert.equal(feeFromRate(10000, 0), 0);
});

test("週は月曜はじまりで、月をまたぐ週も含める", () => {
  const weeks = weeksOfMonth("2026-11");
  assert.equal(weeks[0].from, "2026-10-26");
  assert.equal(weeks.at(-1)?.from, "2026-11-30");
  assert.equal(weeks.length, 6);
});
