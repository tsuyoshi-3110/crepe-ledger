/*
 * 日付は "YYYY-MM-DD" の文字列で持つ。Date は日本時間の正午で作り、時差で日がずれないようにする。
 */

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function toDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

function fromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayLocal(): string {
  return fromDate(new Date());
}

export function addDays(date: string, delta: number): string {
  const d = toDate(date);
  d.setDate(d.getDate() + delta);
  return fromDate(d);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** その日を含む週の月曜 */
export function mondayOf(date: string): string {
  const day = toDate(date).getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

/** from から to まで（両端を含む）の日付 */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

export type Period = { key: string; label: string; from: string; to: string };

/** その月にかかる週（月曜はじまり）。月をまたぐ週もそのまま7日で数える */
export function weeksOfMonth(month: string): Period[] {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const weeks: Period[] = [];
  for (let start = mondayOf(first); start <= last; start = addDays(start, 7)) {
    const end = addDays(start, 6);
    weeks.push({ key: start, label: `${shortDate(start)}〜${shortDate(end)}`, from: start, to: end });
  }
  return weeks;
}

/** その年の12か月 */
export function monthsOfYear(year: number): Period[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { key: month, label: `${i + 1}月`, from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` };
  });
}

/** "2026-11-03" → "11/3" */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** "2026-11-03" → "11/3(火)" */
export function dateWithWeekday(date: string): string {
  return `${shortDate(date)}(${WEEKDAYS[toDate(date).getDay()]})`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}年${Number(m)}月`;
}
