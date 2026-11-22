"use client";

import { signOut, type User } from "firebase/auth";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { AmountInput } from "@/components/AmountInput";
import type { ShopData } from "@/components/useShopData";
import { shortDate } from "@/lib/dates";
import { firebaseAuth } from "@/lib/firebaseClient";
import { formatYen } from "@/lib/format";
import { priceHistory } from "@/lib/priceWatch";
import { newId, putDoc, removeDoc } from "@/lib/store";
import type { FixedCost, Material, Settings, Staff } from "@/lib/types";

type Props = { data: ShopData; reload: () => Promise<void>; user: User | null };

export function SettingsTab({ data, reload, user }: Props) {
  return (
    <div className="space-y-4 pb-4">
      <Rates data={data} reload={reload} />
      <StaffList data={data} reload={reload} />
      <FixedCosts data={data} reload={reload} />
      <Materials data={data} reload={reload} />
      {user && (
        <section className="cl-card space-y-2">
          <p className="text-sm text-stone-500">{user.email} でログインしています</p>
          <button type="button" className="cl-secondary w-full" onClick={() => void signOut(firebaseAuth())}>ログアウト</button>
        </section>
      )}
    </div>
  );
}

function useSaver(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
      await reload();
    } catch {
      setError("保存できませんでした。通信を確かめてもう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function Rates({ data, reload }: Omit<Props, "user">) {
  const [rates, setRates] = useState<Settings>(data.settings);
  const { busy, error, run } = useSaver(reload);
  const dirty = (Object.keys(rates) as (keyof Settings)[]).some((key) => rates[key] !== data.settings[key]);
  const row = (key: keyof Settings, label: string) => (
    <label className="flex items-center gap-3">
      <span className="flex-1 font-semibold">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        max="100"
        step="0.1"
        className="cl-input cl-amount !w-24"
        value={rates[key] === 0 ? "" : rates[key]}
        placeholder="0"
        onChange={(e) => setRates((r) => ({ ...r, [key]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))}
      />
      <span>%</span>
    </label>
  );
  return (
    <section className="cl-card space-y-3">
      <h2 className="font-bold">目標の原価率</h2>
      <p className="text-xs text-stone-500">原価は「売上 × この率」で出します。</p>
      {row("targetCostRate", "材料・包装")}
      <h2 className="border-t border-[var(--line)] pt-3 font-bold">デリバリーの手数料率</h2>
      <p className="text-xs text-stone-500">売上を入れると、手数料にこの率を掛けた額が入ります（その日ごとに直せます）。</p>
      {row("uberFeeRate", "Uber Eats")}
      {row("rocketFeeRate", "ロケットナウ")}
      {dirty && <button type="button" className="cl-primary w-full" disabled={busy} onClick={() => void run(() => putDoc("meta", "settings", { id: "settings", ...rates }))}>{busy && <Loader2 size={16} className="animate-spin" />}保存する</button>}
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
    </section>
  );
}

function StaffList({ data, reload }: Omit<Props, "user">) {
  const [draft, setDraft] = useState<Staff | null>(null);
  const { busy, error, run } = useSaver(reload);
  return (
    <section className="cl-card space-y-3">
      <h2 className="font-bold">スタッフと時給</h2>
      <p className="text-xs text-stone-500">時給を変えても、前に入れた日の人件費はそのときの時給のままです。</p>
      {data.staff.map((s) => (
        <button key={s.id} type="button" className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2.5 text-left" onClick={() => setDraft(s)}>
          <span className={`font-semibold ${s.active ? "" : "text-stone-400"}`}>{s.name}{s.active ? "" : "（今は休み）"}</span>
          <span className="tabular">{formatYen(s.hourlyWage)}/時</span>
        </button>
      ))}
      {draft ? (
        <div className="space-y-2 rounded-xl bg-stone-50 p-3">
          <input className="cl-input" placeholder="名前" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <label className="flex items-center gap-2"><span className="w-12 text-sm">時給</span><AmountInput className="cl-input cl-amount" value={draft.hourlyWage} onChange={(v) => setDraft({ ...draft, hourlyWage: v })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />今日の画面に出す（辞めた人は外す）</label>
          <div className="flex gap-2">
            <button type="button" className="cl-secondary flex-1" onClick={() => setDraft(null)}>やめる</button>
            <button
              type="button"
              className="cl-primary flex-1"
              disabled={busy || !draft.name.trim() || draft.hourlyWage <= 0}
              onClick={() => void run(async () => { await putDoc("staff", draft.id, { ...draft, name: draft.name.trim() }); setDraft(null); })}
            >保存する</button>
          </div>
        </div>
      ) : (
        <button type="button" className="cl-secondary w-full" onClick={() => setDraft({ id: newId(), name: "", hourlyWage: 0, active: true })}><Plus size={16} />スタッフを足す</button>
      )}
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
    </section>
  );
}

function FixedCosts({ data, reload }: Omit<Props, "user">) {
  const [draft, setDraft] = useState<FixedCost | null>(null);
  const { busy, error, run } = useSaver(reload);
  const total = data.fixedCosts.reduce((s, c) => s + c.monthlyAmount, 0);
  return (
    <section className="cl-card space-y-3">
      <h2 className="font-bold">毎月の固定費</h2>
      <p className="text-xs text-stone-500">家賃・リースなど、毎月決まってかかるもの。日割りで週・月の利益に入ります。レシートで入れるものは、ここには入れません。</p>
      {data.fixedCosts.map((c) => (
        <button key={c.id} type="button" className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2.5 text-left" onClick={() => setDraft(c)}>
          <span className="font-semibold">{c.name}</span>
          <span className="tabular">{formatYen(c.monthlyAmount)}/月</span>
        </button>
      ))}
      {data.fixedCosts.length > 0 && <p className="flex justify-between text-sm font-bold"><span>合計</span><span className="tabular">{formatYen(total)}/月</span></p>}
      {draft ? (
        <div className="space-y-2 rounded-xl bg-stone-50 p-3">
          <input className="cl-input" placeholder="名前（家賃など）" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <label className="flex items-center gap-2"><span className="w-12 text-sm">月額</span><AmountInput className="cl-input cl-amount" value={draft.monthlyAmount} onChange={(v) => setDraft({ ...draft, monthlyAmount: v })} /></label>
          <div className="flex gap-2">
            {data.fixedCosts.some((c) => c.id === draft.id) && (
              <button type="button" className="cl-secondary !px-3" aria-label="消す" disabled={busy} onClick={() => void run(async () => { await removeDoc("fixedCosts", draft.id); setDraft(null); })}><Trash2 size={16} /></button>
            )}
            <button type="button" className="cl-secondary flex-1" onClick={() => setDraft(null)}>やめる</button>
            <button
              type="button"
              className="cl-primary flex-1"
              disabled={busy || !draft.name.trim() || draft.monthlyAmount <= 0}
              onClick={() => void run(async () => { await putDoc("fixedCosts", draft.id, { ...draft, name: draft.name.trim() }); setDraft(null); })}
            >保存する</button>
          </div>
        </div>
      ) : (
        <button type="button" className="cl-secondary w-full" onClick={() => setDraft({ id: newId(), name: "", monthlyAmount: 0 })}><Plus size={16} />固定費を足す</button>
      )}
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
    </section>
  );
}

/**
 * 材料。レシートを保存すると品名から自動で増える。名前を直したり、店で書き方が違う同じ材料を1つにまとめたりする。
 * まとめると、まとめた側の別名とレシートの品目が残す側へ移り、単価の比べ先が1つになる。
 */
function Materials({ data, reload }: Omit<Props, "user">) {
  const [openId, setOpenId] = useState("");
  const [name, setName] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const { busy, error, run } = useSaver(reload);

  function open(material: Material) {
    setOpenId(openId === material.id ? "" : material.id);
    setName(material.name);
    setMergeInto("");
  }

  async function merge(source: Material, target: Material) {
    await putDoc("materials", target.id, { ...target, aliases: [...new Set([...target.aliases, source.name, ...source.aliases])] });
    for (const purchase of data.purchases) {
      if (!purchase.items.some((i) => i.materialId === source.id)) continue;
      await putDoc("purchases", purchase.id, { ...purchase, items: purchase.items.map((i) => (i.materialId === source.id ? { ...i, materialId: target.id } : i)) });
    }
    await removeDoc("materials", source.id);
  }

  return (
    <section className="cl-card space-y-3">
      <h2 className="font-bold">材料と単価</h2>
      {data.materials.length === 0 && <p className="text-sm text-stone-500">レシートを品目つきで保存すると、ここに材料が並びます。</p>}
      {data.materials.map((m) => {
        const history = priceHistory(m.id, data.purchases);
        const latest = history[0];
        return (
          <div key={m.id} className="rounded-xl border border-[var(--line)]">
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left" onClick={() => open(m)}>
              <span className="min-w-0 flex-1 truncate font-semibold">{m.name}</span>
              <span className="tabular text-sm">{latest ? formatYen(latest.unitPrice) : "—"}</span>
              <ChevronDown size={16} className={`text-stone-400 transition ${openId === m.id ? "rotate-180" : ""}`} />
            </button>
            {openId === m.id && (
              <div className="space-y-3 border-t border-[var(--line)] p-3">
                <ul className="space-y-1 text-sm">
                  {history.slice(0, 8).map((h, i) => (
                    <li key={`${h.purchaseId}-${i}`} className="flex justify-between gap-2 text-stone-600">
                      <span className="w-12">{shortDate(h.date)}</span>
                      <span className="min-w-0 flex-1 truncate">{h.storeName}</span>
                      <span className="tabular">{formatYen(h.unitPrice)}</span>
                    </li>
                  ))}
                </ul>
                {m.aliases.length > 0 && <p className="text-xs text-stone-500">レシートの書き方：{m.aliases.join("、")}</p>}
                <div className="flex gap-2">
                  <input className="cl-input !min-h-10 flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label="材料の名前" />
                  <button type="button" className="cl-secondary !min-h-10" disabled={busy || !name.trim() || name.trim() === m.name} onClick={() => void run(() => putDoc("materials", m.id, { ...m, name: name.trim() }))}>名前を直す</button>
                </div>
                <div className="flex gap-2">
                  <select className="cl-input !min-h-10 flex-1 text-sm" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} aria-label="まとめる先">
                    <option value="">同じ材料にまとめる…</option>
                    {data.materials.filter((o) => o.id !== m.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <button
                    type="button"
                    className="cl-secondary !min-h-10"
                    disabled={busy || !mergeInto}
                    onClick={() => {
                      const target = data.materials.find((o) => o.id === mergeInto);
                      if (target && window.confirm(`「${m.name}」を「${target.name}」にまとめますか？`)) void run(async () => { await merge(m, target); setOpenId(""); });
                    }}
                  >まとめる</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
    </section>
  );
}
