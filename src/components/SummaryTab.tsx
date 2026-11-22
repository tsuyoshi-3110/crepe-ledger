"use client";

import { ChevronLeft, ChevronRight, FileSpreadsheet, Loader2 } from "lucide-react";
import { useState } from "react";

import type { ShopData } from "@/components/useShopData";
import { summarize, type Summary } from "@/lib/calc";
import { daysInMonth, monthLabel, monthsOfYear, shiftMonth, todayLocal, weeksOfMonth, type Period } from "@/lib/dates";
import { downloadExcel } from "@/lib/exportExcel";
import { buildSheets } from "@/lib/exportSheets";
import { formatRate, formatYen } from "@/lib/format";

type Mode = "week" | "month";

/** 週ごと・月ごとの利益。上にその月（その年）の合計、下に1週（1か月）ずつ */
export function SummaryTab({ data }: { data: ShopData }) {
  const today = todayLocal();
  const [mode, setMode] = useState<Mode>("week");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(Number(today.slice(0, 4)));

  const periods: Period[] = mode === "week" ? weeksOfMonth(month) : monthsOfYear(year);
  const range = mode === "week"
    ? { label: `${monthLabel(month)}の合計`, from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` }
    : { label: `${year}年の合計`, from: `${year}-01-01`, to: `${year}-12-31` };
  // 原価は売上 × 目標の原価率。レシートは参考として並べる（lib/calc.ts）
  const sum = (from: string, to: string) => summarize(from, to, data.days, data.purchases, data.fixedCosts, data.settings.targetCostRate);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  // 週ごとを見ているときはその月、月ごとのときはその年を書き出す
  async function exportExcel() {
    setExporting(true);
    setExportError("");
    try {
      const name = mode === "week" ? month : String(year);
      await downloadExcel(buildSheets(data, range.from, range.to, today), `よって屋帳簿_${name}.xlsx`);
    } catch {
      setExportError("書き出せませんでした。もう一度押してください。");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-xl bg-stone-200/70 p-1">
        {(["week", "month"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`h-10 rounded-lg text-sm font-bold ${mode === m ? "bg-white shadow-sm" : "text-stone-500"}`}>
            {m === "week" ? "週ごと" : "月ごと"}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button type="button" className="cl-secondary !px-3" aria-label="前へ" onClick={() => (mode === "week" ? setMonth(shiftMonth(month, -1)) : setYear(year - 1))}><ChevronLeft size={20} /></button>
        <span className="text-lg font-bold">{mode === "week" ? monthLabel(month) : `${year}年`}</span>
        <button type="button" className="cl-secondary !px-3" aria-label="次へ" onClick={() => (mode === "week" ? setMonth(shiftMonth(month, 1)) : setYear(year + 1))}><ChevronRight size={20} /></button>
      </div>

      <SummaryCard title={range.label} summary={sum(range.from, range.to)} target={data.settings.targetCostRate} highlight />
      {periods
        .filter((p) => p.from <= today)
        .reverse()
        .map((p) => <SummaryCard key={p.key} title={p.label} summary={sum(p.from, p.to)} target={data.settings.targetCostRate} />)}
      <button type="button" className="cl-secondary w-full" disabled={exporting || range.from > today} onClick={() => void exportExcel()}>
        {exporting ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />}
        {mode === "week" ? monthLabel(month) : `${year}年`}をExcelで書き出す
      </button>
      {exportError && <p className="text-center text-sm font-semibold text-red-700">{exportError}</p>}
      <p className="pb-2 text-xs text-stone-500">原価は「売上 × 目標の原価率（設定）」です（デリバリーは手数料を引いた額に掛けます）。レシートは利益に入れていません（レシートのタブで月ごとの合計を見られます）。週は月曜から日曜。月をまたぐ週は、どちらの月にも出ます（月の合計には、その月の日だけが入ります）。</p>
    </div>
  );
}

function SummaryCard({ title, summary: s, target, highlight = false }: { title: string; summary: Summary; target: number; highlight?: boolean }) {
  const empty = s.sales.total === 0 && s.labor === 0;
  return (
    <section className={`cl-card space-y-1.5 ${highlight ? "border-2 border-orange-200" : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold">{title}</h3>
        <span className={`tabular text-xl font-bold ${s.operatingProfit >= 0 ? "text-[var(--profit)]" : "text-[var(--loss)]"}`}>
          {empty ? "—" : formatYen(s.operatingProfit)}
        </span>
      </div>
      {empty ? (
        <p className="text-sm text-stone-400">まだ入力がありません</p>
      ) : (
        <>
          <Line label="売上" value={formatYen(s.sales.total)} note={`${s.openDays}日`} bold />
          <Line label="　店頭" value={formatYen(s.sales.store)} note={formatRate(s.sales.store, s.sales.total)} />
          <Line label="　Uber Eats" value={formatYen(s.sales.uber)} note={formatRate(s.sales.uber, s.sales.total)} />
          <Line label="　ロケットナウ" value={formatYen(s.sales.rocket)} note={formatRate(s.sales.rocket, s.sales.total)} />
          <Line label={`原価（目標 ${target}%）`} value={formatYen(s.cost)} />
          <Line label="粗利" value={formatYen(s.grossProfit)} note={`粗利率 ${formatRate(s.grossProfit, s.sales.total)}`} bold />
          <Line label="人件費" value={formatYen(s.labor)} note={`${formatRate(s.labor, s.sales.total)}・${s.laborHours}時間`} />
          <Line label="手数料" value={formatYen(s.fees)} note={formatRate(s.fees, s.sales.uber + s.sales.rocket)} />
          <Line label="固定費" value={formatYen(s.fixedCosts)} />
          <Line label="営業利益" value={formatYen(s.operatingProfit)} note={`利益率 ${formatRate(s.operatingProfit, s.sales.total)}`} bold />
        </>
      )}
    </section>
  );
}

function Line({ label, value, note = "", bold = false }: { label: string; value: string; note?: string; bold?: boolean }) {
  return (
    <p className={`grid grid-cols-[1fr_auto_6.5rem] items-baseline gap-2 ${bold ? "border-t border-[var(--line)] pt-1.5 font-bold" : "text-sm text-stone-600"}`}>
      <span className="whitespace-pre">{label}</span>
      <span className="tabular text-right">{value}</span>
      <span className="tabular text-right text-xs font-normal text-stone-500">
        {note}
      </span>
    </p>
  );
}
