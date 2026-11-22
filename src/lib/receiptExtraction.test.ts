import { test } from "node:test";
import assert from "node:assert/strict";

import { itemsMatchTotal, normalizeItems } from "./receiptExtraction";

test("品目は値引きを引いた額にし、金額の無い行は単価×数量、名前か金額の無い行は落とす", () => {
  const items = normalizeItems([
    { name: "牛乳", quantity: 2, unitPrice: 200, amount: 400, discount: 50 },
    { name: "卵", quantity: 1, unitPrice: 300, amount: 0, discount: 0 },
    { name: "", quantity: 1, unitPrice: 100, amount: 100, discount: 0 },
    { name: "小麦粉", quantity: 1, unitPrice: 0, amount: 0, discount: 0 },
  ]);
  assert.deepEqual(items, [{ name: "牛乳", quantity: 2, amount: 350 }, { name: "卵", quantity: 1, amount: 300 }]);
});

test("品目の合計と合計金額は±2円まで合っているとみなす", () => {
  assert.equal(itemsMatchTotal([{ name: "a", quantity: 1, amount: 998 }], 1000), true);
  assert.equal(itemsMatchTotal([{ name: "a", quantity: 1, amount: 926 }], 1000), false);
  assert.equal(itemsMatchTotal([], 1000), true);
});
