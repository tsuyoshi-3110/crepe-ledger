/*
 * 入れ忘れた日。売上が空のままの日があると、月の原価率（レシート ÷ 売上）が高く出てしまうので知らせる。
 *
 * 見るのは昨日までの2週間。ただし帳簿を使い始めた日（いちばん古い記録）より前は数えない。
 * 「休み」にした日は数えない。
 */
import { salesTotalOf } from "@/lib/calc";
import { addDays, eachDay } from "@/lib/dates";
import type { DayRecord } from "@/lib/types";

export const MISSING_LOOKBACK_DAYS = 14;

export function missingDays(days: DayRecord[], today: string): string[] {
  if (days.length === 0) return [];
  const first = days.reduce((min, d) => (d.date < min ? d.date : min), days[0].date);
  const lookback = addDays(today, -MISSING_LOOKBACK_DAYS);
  const from = first > lookback ? first : lookback;
  const to = addDays(today, -1);
  if (to < from) return [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  return eachDay(from, to).filter((date) => {
    const day = byDate.get(date);
    return !day || (!day.closed && salesTotalOf(day) === 0);
  });
}
