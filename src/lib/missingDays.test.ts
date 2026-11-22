import { test } from "node:test";
import assert from "node:assert/strict";

import { missingDays } from "./missingDays";
import { emptyDay, type DayRecord } from "./types";

const sold = (date: string): DayRecord => ({ ...emptyDay(date), sales: { store: 1000, uber: 0, rocket: 0 } });

test("記録が無い・売上が0の日を出し、休みの日と今日は出さない", () => {
  const days = [sold("2026-11-15"), { ...emptyDay("2026-11-17"), closed: true }, emptyDay("2026-11-18"), sold("2026-11-20")];
  assert.deepEqual(missingDays(days, "2026-11-20"), ["2026-11-16", "2026-11-18", "2026-11-19"]);
});

test("使い始めた日より前と、2週間より前は数えない", () => {
  assert.deepEqual(missingDays([], "2026-11-20"), []);
  assert.equal(missingDays([sold("2026-10-01")], "2026-11-20").length, 14);
});
