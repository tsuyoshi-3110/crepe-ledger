import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSheets } from "./exportSheets";
import { emptyDay } from "./types";

test("原価は売上×目標の率、レシートは右に並べるだけ。日ごとは今日まで、品目に単価", () => {
  const days = [{ ...emptyDay("2026-11-02"), sales: { store: 10000, uber: 0, rocket: 0 }, labor: [{ staffId: "a", name: "A", hours: 2, hourlyWage: 1000 }] }];
  const purchases = [{ id: "p", date: "2026-11-02", storeName: "業務スーパー", total: 3000, category: "材料費", items: [{ name: "卵", quantity: 2, amount: 600, materialId: "egg" }], createdAt: 0 }];
  const sheets = buildSheets({ days, purchases, materials: [{ id: "egg", name: "卵", aliases: [] }], fixedCosts: [], settings: { targetCostRate: 30 } }, "2026-11-01", "2026-11-30", "2026-11-03");
  const [summary, daily, receipts, items, labor] = sheets;
  assert.deepEqual(summary.rows[0].slice(0, 8), ["2026年11月", 1, 10000, 0, 0, 10000, 3000, 7000]);
  assert.deepEqual(summary.rows[0].slice(14), [3000, 0]);
  assert.equal(daily.rows.length, 3);
  assert.equal(daily.rows[0][10], "（未入力）");
  assert.equal(receipts.rows[0][3], "材料・包装");
  assert.deepEqual(items.rows[0].slice(3), ["卵", 2, 600, 300]);
  assert.deepEqual(labor.totalRow, ["合計", "", 2, "", 2000]);
});
