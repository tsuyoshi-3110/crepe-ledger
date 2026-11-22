"use client";

import { ChevronLeft, ChevronRight, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import { AmountInput } from "@/components/AmountInput";
import type { ShopData } from "@/components/useShopData";
import { feeFromRate, summarize } from "@/lib/calc";
import { addDays, dateWithWeekday, shortDate, todayLocal } from "@/lib/dates";
import { formatYen } from "@/lib/format";
import { missingDays } from "@/lib/missingDays";
import { recentPriceChanges } from "@/lib/priceWatch";
import { putDoc } from "@/lib/store";
import { CHANNELS, emptyDay, type DayRecord, type LaborEntry } from "@/lib/types";

type Props = { data: ShopData; reload: () => Promise<void>; onOpenSettings: () => void };

/** 1日の入力。売上（窓口ごと）・働いた時間を入れて保存する。手数料は設定の率から出す */
export function DayTab({ data, reload, onOpenSettings }: Props) {
  const [date, setDate] = useState(todayLocal());
  const saved = useMemo(() => data.days.find((d) => d.date === date) ?? null, [data.days, date]);
  return (
    <div className="space-y-4">
      <PriceAlerts data={data} />
      <MissingDays data={data} current={date} onPick={setDate} />
      <div className="flex items-center justify-between">
        <button type="button" className="cl-secondary !px-3" aria-label="前の日" onClick={() => setDate(addDays(date, -1))}><ChevronLeft size={20} /></button>
        <label className="relative text-center">
          <span className="text-xl font-bold">{dateWithWeekday(date)}</span>
          {date === todayLocal() && <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-[var(--brand)]">今日</span>}
          <input type="date" className="absolute inset-0 opacity-0" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="日付を選ぶ" />
        </label>
        <button type="button" className="cl-secondary !px-3" aria-label="次の日" onClick={() => setDate(addDays(date, 1))}><ChevronRight size={20} /></button>
      </div>
      {/* 日を変えたら入力を作り直す（前の日の入力が残らないように） */}
      <DayForm key={`${date}:${saved ? JSON.stringify(saved) : ""}`} date={date} saved={saved} data={data} reload={reload} onOpenSettings={onOpenSettings} />
    </div>
  );
}

function initialLabor(saved: DayRecord | null, data: ShopData): LaborEntry[] {
  const entries = [...(saved?.labor ?? [])];
  // 在籍中のスタッフは、まだ入れていなくても0時間の行で並べる（入れやすいように）
  for (const s of data.staff) {
    if (s.active && !entries.some((e) => e.staffId === s.id)) entries.push({ staffId: s.id, name: s.name, hours: 0, hourlyWage: s.hourlyWage });
  }
  return entries;
}

function DayForm({ date, saved, data, reload, onOpenSettings }: { date: string; saved: DayRecord | null } & Props) {
  const start = saved ?? emptyDay(date);
  const [sales, setSales] = useState(start.sales);
  const [fees, setFees] = useState(start.fees);
  const [labor, setLabor] = useState<LaborEntry[]>(() => initialLabor(saved, data));
  const [note, setNote] = useState(start.note);
  const [closed, setClosed] = useState(!!start.closed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const record: DayRecord = { date, sales, fees, labor: labor.filter((e) => e.hours > 0), note: note.trim(), closed };
  // Firestore は項目の順を並べ替えて返すので、決まった順に並べ直してから比べる
  const dirty = dayKey(record) !== dayKey(saved ?? emptyDay(date));
  // 原価は売上 × 目標の原価率（レシートからは出さない。lib/calc.ts）
  const summary = summarize(date, date, [record], data.purchases, data.fixedCosts, data.settings.targetCostRate);

  function setChannelSales(channel: "store" | "uber" | "rocket", value: number) {
    setSales((s) => ({ ...s, [channel]: value }));
    // 手数料は入力欄を持たず、売上を入れるたびに設定の率から出す（2026-11-23 ユーザー）
    if (channel === "uber") setFees((f) => ({ ...f, uber: feeFromRate(value, data.settings.uberFeeRate) }));
    if (channel === "rocket") setFees((f) => ({ ...f, rocket: feeFromRate(value, data.settings.rocketFeeRate) }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await putDoc("days", date, record);
      await reload();
    } catch {
      setError("保存できませんでした。通信を確かめてもう一度押してください。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <label className="flex items-center justify-end gap-2 text-sm font-semibold text-stone-600">
        <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
        この日は休み
      </label>
      <section className="cl-card space-y-3">
        <h2 className="font-bold">売上</h2>
        {CHANNELS.map((channel) => (
          <div key={channel.key}>
            <label className="flex items-center gap-3">
              <span className="w-28 shrink-0 font-semibold">{channel.label}</span>
              <AmountInput className="cl-input cl-amount" value={sales[channel.key]} onChange={(v) => setChannelSales(channel.key, v)} placeholder="0" />
            </label>
            {channel.delivery && sales[channel.key] > 0 && (
              <p className="mt-1 pl-6 text-sm text-stone-500 tabular">
                うち手数料 {formatYen(fees[channel.key as "uber" | "rocket"])}
              </p>
            )}
          </div>
        ))}
        {(data.settings.uberFeeRate === 0 || data.settings.rocketFeeRate === 0) && (
          <button type="button" className="text-left text-xs text-stone-500 underline" onClick={onOpenSettings}>
            設定で手数料の率を入れると、手数料が出ます
          </button>
        )}
        <p className="flex justify-between border-t border-[var(--line)] pt-2 font-bold"><span>合計</span><span className="tabular">{formatYen(summary.sales.total)}</span></p>
      </section>

      <section className="cl-card space-y-3">
        <h2 className="font-bold">働いた時間</h2>
        {labor.length === 0 && (
          <button type="button" className="text-sm text-stone-500 underline" onClick={onOpenSettings}>設定でスタッフと時給を入れてください</button>
        )}
        {labor.map((entry, index) => (
          <label key={entry.staffId} className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{entry.name}</span>
              <span className="text-xs text-stone-500">時給 {formatYen(entry.hourlyWage)}</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0"
              className="cl-input cl-amount !w-24"
              value={entry.hours === 0 ? "" : entry.hours}
              placeholder="0"
              onChange={(e) => {
                const hours = Math.max(0, Number(e.target.value) || 0);
                setLabor((list) => list.map((item, i) => (i === index ? { ...item, hours } : item)));
              }}
            />
            <span className="w-8 text-sm text-stone-500">時間</span>
          </label>
        ))}
        {summary.labor > 0 && <p className="flex justify-between border-t border-[var(--line)] pt-2 font-bold"><span>人件費</span><span className="tabular">{formatYen(summary.labor)}</span></p>}
      </section>

      <section className="cl-card space-y-1.5">
        <h2 className="mb-1 font-bold">この日の利益</h2>
        <Row label="売上" value={summary.sales.total} />
        <Row label={`原価（手数料を引いた売上 × ${data.settings.targetCostRate}%）`} value={-summary.cost} />
        <Row label="粗利" value={summary.grossProfit} bold />
        <Row label="人件費" value={-summary.labor} />
        <Row label="手数料" value={-summary.fees} />
        <Row label="固定費の日割り" value={-summary.fixedCosts} />
        <Row label="営業利益" value={summary.operatingProfit} bold colored />
      </section>

      <textarea className="cl-input min-h-16" placeholder="メモ（天気・イベントなど）" value={note} onChange={(e) => setNote(e.target.value)} />

      {/* 直したときだけ、下に保存のボタンを浮かせる（保存済みのまま浮いていると、下の入力欄に重なって邪魔になる） */}
      {dirty || saving ? (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10">
          <button type="button" className="cl-primary w-full shadow-lg" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />}保存する
          </button>
        </div>
      ) : (
        saved && <p className="text-center text-sm text-stone-500">保存済み</p>
      )}
      {error && <p className="text-center text-sm font-semibold text-red-700">{error}</p>}
    </>
  );
}

function dayKey(d: DayRecord): string {
  return JSON.stringify([
    d.sales.store, d.sales.uber, d.sales.rocket, d.fees.uber, d.fees.rocket, d.note, !!d.closed,
    d.labor.map((e) => [e.staffId, e.hours, e.hourlyWage]),
  ]);
}

function Row({ label, value, bold = false, colored = false }: { label: string; value: number; bold?: boolean; colored?: boolean }) {
  const color = colored ? (value >= 0 ? "text-[var(--profit)]" : "text-[var(--loss)]") : "";
  return (
    <p className={`flex justify-between gap-3 ${bold ? "border-t border-[var(--line)] pt-1.5 text-lg font-bold" : "text-sm text-stone-600"}`}>
      <span>{label}</span>
      <span className={`tabular ${color}`}>{formatYen(value)}</span>
    </p>
  );
}

/**
 * 材料の値段のお知らせ（2週間）。レシートを保存したときにも出すが、あとで見返せるように今日の画面にも置く。
 * レシートは利益には入れず、足しておくのと値段の変化を見るためだけに使う（2026-11-22 ユーザー）。
 */
function PriceAlerts({ data }: { data: ShopData }) {
  const today = todayLocal();
  const changes = useMemo(() => recentPriceChanges(data.purchases, data.materials, addDays(today, -14)), [data.purchases, data.materials, today]);
  if (changes.length === 0) return null;
  return (
    <section className="cl-card space-y-2 border border-orange-200 !bg-orange-50">
      <h2 className="text-sm font-bold text-orange-900">材料の値段が変わりました（2週間）</h2>
      {changes.slice(0, 5).map((c) => (
        <p key={`${c.materialId}-${c.date}`} className="flex items-center gap-2 text-sm">
          {c.diff > 0 ? <TrendingUp size={16} className="shrink-0 text-[var(--loss)]" /> : <TrendingDown size={16} className="shrink-0 text-[var(--profit)]" />}
          <span className="min-w-0 flex-1 truncate font-semibold">{c.materialName}</span>
          <span className="tabular text-stone-600">{formatYen(c.previousUnitPrice)} → <b>{formatYen(c.unitPrice)}</b></span>
          <span className={`tabular w-14 text-right text-xs font-bold ${c.diff > 0 ? "text-[var(--loss)]" : "text-[var(--profit)]"}`}>{c.diff > 0 ? "+" : ""}{c.percent.toFixed(0)}%</span>
          <span className="w-10 text-right text-xs text-stone-500">{shortDate(c.date)}</span>
        </p>
      ))}
    </section>
  );
}

/**
 * 入れ忘れた日（昨日までの2週間）。売上が空の日があると、月の原価率が高く出るので知らせる。
 * 日付を押すとその日を開く。休みの日は「この日は休み」にすると消える。
 */
function MissingDays({ data, current, onPick }: { data: ShopData; current: string; onPick: (date: string) => void }) {
  const missing = useMemo(() => missingDays(data.days, todayLocal()), [data.days]);
  if (missing.length === 0) return null;
  return (
    <section className="cl-card space-y-2 border border-amber-200 !bg-amber-50">
      <h2 className="text-sm font-bold text-amber-900">売上が入っていない日があります</h2>
      <div className="flex flex-wrap gap-2">
        {missing.map((date) => (
          <button
            key={date}
            type="button"
            onClick={() => onPick(date)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${date === current ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-amber-300 bg-white text-amber-900"}`}
          >
            {dateWithWeekday(date)}
          </button>
        ))}
      </div>
      <p className="text-xs text-stone-500">お店が休みの日は、その日を開いて「この日は休み」にしてください。</p>
    </section>
  );
}
