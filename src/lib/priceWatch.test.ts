import { test } from "node:test";
import assert from "node:assert/strict";

import { compareWithPrevious, findMaterial, normalizeName, recentPriceChanges } from "./priceWatch";
import type { Material, Purchase } from "./types";

const milk: Material = { id: "milk", name: "牛乳", aliases: ["ｷﾞｭｳﾆｭｳ 1L", "明治おいしい牛乳"] };

function bought(id: string, date: string, amount: number, quantity = 1, createdAt = 0): Purchase {
  return { id, date, storeName: "業務スーパー", total: amount, category: "材料費", items: [{ name: "牛乳", quantity, amount, materialId: "milk" }], createdAt };
}

test("品名は全角半角・空白の違いをそろえて材料に結ぶ", () => {
  assert.equal(normalizeName("ｷﾞｭｳﾆｭｳ 1L"), "ギュウニュウ1l".toLowerCase());
  assert.equal(findMaterial("ギュウニュウ1L", [milk])?.id, "milk");
  assert.equal(findMaterial("卵", [milk]), null);
});

test("前回より単価が変わったら知らせる。数量で割った単価で比べる", () => {
  const history = [bought("p1", "2026-11-01", 400, 2)];
  const up = compareWithPrevious({ amount: 460, quantity: 2 }, milk, "2026-11-05", history);
  assert.equal(up?.previousUnitPrice, 200);
  assert.equal(up?.unitPrice, 230);
  assert.equal(up?.percent, 15);
  assert.equal(compareWithPrevious({ amount: 200, quantity: 1 }, milk, "2026-11-05", history), null);
});

test("前回は日付の前のいちばん新しい記録。直しているレシート自身とあとの日付は除く", () => {
  const history = [bought("p1", "2026-11-01", 200), bought("p2", "2026-11-03", 220), bought("p3", "2026-11-09", 250)];
  assert.equal(compareWithPrevious({ amount: 230, quantity: 1 }, milk, "2026-11-05", history)?.previousUnitPrice, 220);
  assert.equal(compareWithPrevious({ amount: 230, quantity: 1 }, milk, "2026-11-03", history, "p2")?.previousUnitPrice, 200);
});

test("お知らせは期間の中で変わったものだけ、新しい順", () => {
  const history = [bought("p1", "2026-10-01", 200), bought("p2", "2026-10-20", 220), bought("p3", "2026-11-02", 220), bought("p4", "2026-11-10", 198)];
  const changes = recentPriceChanges(history, [milk], "2026-10-15");
  assert.deepEqual(changes.map((c) => [c.date, c.previousUnitPrice, c.unitPrice]), [["2026-11-10", 220, 198], ["2026-10-20", 200, 220]]);
});
