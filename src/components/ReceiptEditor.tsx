"use client";

import { Crop, Loader2, Plus, Sparkles, Trash2, TrendingDown, TrendingUp, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AmountInput } from "@/components/AmountInput";
import { ReceiptCropEditor, receiptSourceOf } from "@/components/ReceiptCropEditor";
import type { ShopData } from "@/components/useShopData";
import { ALL_CATEGORIES, DEFAULT_CATEGORY } from "@/lib/categories";
import { shortDate, todayLocal } from "@/lib/dates";
import { formatYen } from "@/lib/format";
import { compareWithPrevious, findMaterial, unitPriceOf } from "@/lib/priceWatch";
import { blobToDataUrl, normalizeReceiptImage, readReceipt } from "@/lib/receiptImage";
import { newId, putDoc, removeDoc } from "@/lib/store";
import type { Material, Purchase, PurchaseItem } from "@/lib/types";

/** 材料の選び方。"auto"＝品名から自動、"new"＝新しい材料にする、それ以外＝その材料の id */
type ItemDraft = { name: string; quantity: number; amount: number; link: string };

type Props = {
  data: ShopData;
  /** 直すときのレシート。新しく入れるときは null */
  editing: Purchase | null;
  /** 撮った・選んだ写真。あれば AI で読む */
  file: File | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

/** 品目の行の材料。選んであればそれ、自動なら品名で探す */
function materialOf(item: ItemDraft, materials: Material[]): Material | null {
  if (item.link === "new") return null;
  if (item.link !== "auto") return materials.find((m) => m.id === item.link) ?? null;
  return findMaterial(item.name, materials);
}

export function ReceiptEditor({ data, editing, file, onClose, onSaved }: Props) {
  const [storeName, setStoreName] = useState(editing?.storeName ?? "");
  const [date, setDate] = useState(editing?.date ?? todayLocal());
  const [total, setTotal] = useState(editing?.total ?? 0);
  const [category, setCategory] = useState(editing?.category ?? DEFAULT_CATEGORY);
  const [items, setItems] = useState<ItemDraft[]>(
    () => editing?.items.map((i) => ({ name: i.name, quantity: i.quantity, amount: i.amount, link: i.materialId || "auto" })) ?? [],
  );
  const [previewUrl, setPreviewUrl] = useState("");
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function readImage(blob: Blob) {
    setReading(true);
    setReadNote(null);
    try {
      const normalized = await normalizeReceiptImage(blob);
      setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(normalized); });
      const result = await readReceipt(await blobToDataUrl(normalized));
      if (!result.ok) { setReadNote({ ok: false, text: result.message }); return; }
      if (result.storeName) setStoreName(result.storeName);
      if (result.date) setDate(result.date);
      const sum = result.items.reduce((s, i) => s + i.amount, 0);
      setTotal(result.totalAmount || sum);
      if (result.category) setCategory(result.category);
      setItems(result.items.map((i) => ({ ...i, link: "auto" })));
      setReadNote({
        ok: result.itemsMatchTotal,
        text: result.itemsMatchTotal
          ? "AI が読み取りました。違うところがあれば直してから保存してください。"
          : `品目の合計 ${formatYen(sum)} がレシートの合計と合いません。読み違いか外税のレシートです。品目を確かめてください。`,
      });
    } catch (cause) {
      setReadNote({ ok: false, text: cause instanceof Error ? cause.message : "読み取りできませんでした。" });
    } finally {
      setReading(false);
    }
  }

  useEffect(() => {
    if (file) queueMicrotask(() => void readImage(file));
    // 写真が来たときに一度だけ読む
  }, [file]);

  const changes = useMemo(
    () => items.map((item) => {
      const material = materialOf(item, data.materials);
      if (!material) return null;
      return compareWithPrevious(item, material, date, data.purchases, editing?.id ?? "");
    }),
    [items, data.materials, data.purchases, date, editing?.id],
  );

  const itemsSum = items.reduce((s, i) => s + i.amount, 0);

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function save() {
    setError("");
    if (total <= 0) { setError("合計の金額を入れてください。"); return; }
    if (!date) { setError("日付を入れてください。"); return; }
    setSaving(true);
    try {
      // 品目を材料に結ぶ。新しい品名は材料を作り、別の材料へ結んだ品名はその材料の別名に足す（次から自動で結ぶ）
      const materials = [...data.materials];
      const touched = new Map<string, Material>();
      const savedItems: PurchaseItem[] = [];
      for (const item of items) {
        const name = item.name.trim();
        if (!name || item.amount <= 0) continue;
        let material = materialOf(item, materials);
        if (!material) {
          material = { id: newId(), name, aliases: [name] };
          materials.push(material);
          touched.set(material.id, material);
        } else if (!findMaterial(name, [material])) {
          material = { ...material, aliases: [...material.aliases, name] };
          materials.splice(materials.findIndex((m) => m.id === material!.id), 1, material);
          touched.set(material.id, material);
        }
        savedItems.push({ name, quantity: item.quantity > 0 ? item.quantity : 1, amount: item.amount, materialId: material.id });
      }
      for (const material of touched.values()) await putDoc("materials", material.id, material);
      const purchase: Purchase = {
        id: editing?.id ?? newId(),
        date,
        storeName: storeName.trim(),
        total,
        category,
        items: savedItems,
        createdAt: editing?.createdAt ?? Date.now(),
      };
      await putDoc("purchases", purchase.id, purchase);
      await onSaved();
    } catch {
      setError("保存できませんでした。通信を確かめてもう一度押してください。");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing || !window.confirm("このレシートを消しますか？")) return;
    setSaving(true);
    try {
      await removeDoc("purchases", editing.id);
      await onSaved();
    } catch {
      setError("消せませんでした。もう一度お試しください。");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[var(--background)] pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{editing ? "レシートを直す" : "レシートを確かめる"}</h2>
          <button type="button" className="cl-secondary !px-3" aria-label="閉じる" onClick={onClose}><X size={20} /></button>
        </div>

        {previewUrl && (
          <div className="cl-card space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="レシート" className="mx-auto max-h-72 rounded-lg object-contain" />
            {file && !reading && (
              <button type="button" className="cl-secondary w-full !min-h-10 text-sm" onClick={() => setCropOpen(true)}><Crop size={16} />切り抜き直して読み直す</button>
            )}
          </div>
        )}
        {cropOpen && file && (
          <ReceiptCropEditor
            source={receiptSourceOf(file)}
            onClose={() => setCropOpen(false)}
            onApply={(cropped) => { setCropOpen(false); void readImage(cropped); }}
          />
        )}
        {reading && <p className="flex items-center gap-2 rounded-xl bg-orange-50 p-3 text-sm font-semibold text-orange-900"><Loader2 size={16} className="animate-spin" />AI が読み取っています…</p>}
        {readNote && (
          <p className={`flex items-start gap-2 rounded-xl p-3 text-sm font-semibold ${readNote.ok ? "bg-sky-50 text-sky-900" : "bg-amber-50 text-amber-900"}`}>
            {readNote.ok ? <Sparkles size={16} className="mt-0.5 shrink-0" /> : <TriangleAlert size={16} className="mt-0.5 shrink-0" />}{readNote.text}
          </p>
        )}

        <section className="cl-card space-y-3">
          <label className="block text-sm font-semibold">お店<input className="cl-input mt-1" value={storeName} onChange={(e) => setStoreName(e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold">日付<input type="date" className="cl-input mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="block text-sm font-semibold">合計<AmountInput className="cl-input cl-amount mt-1" value={total} onChange={setTotal} /></label>
          </div>
          <label className="block text-sm font-semibold">
            費目
            <select className="cl-input mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
              {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}{c === "材料費" || c === "包装資材費" ? "（材料・包装）" : ""}</option>)}
            </select>
          </label>
        </section>

        <section className="cl-card space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-bold">品目</h3>
            {items.length > 0 && <span className={`tabular text-sm ${Math.abs(itemsSum - total) > 2 ? "font-bold text-amber-700" : "text-stone-500"}`}>計 {formatYen(itemsSum)}</span>}
          </div>
          {items.length === 0 && <p className="text-sm text-stone-500">品目を入れると、材料の値段が変わったときに知らせます。</p>}
          {items.map((item, index) => {
            const change = changes[index];
            const autoMatch = findMaterial(item.name, data.materials);
            return (
              <div key={index} className={`space-y-2 rounded-xl border p-3 ${change ? (change.diff > 0 ? "border-red-300 bg-red-50/60" : "border-emerald-300 bg-emerald-50/60") : "border-[var(--line)]"}`}>
                <div className="flex gap-2">
                  <input className="cl-input !min-h-10 flex-1" value={item.name} placeholder="品名" onChange={(e) => updateItem(index, { name: e.target.value })} />
                  <button type="button" className="cl-secondary !min-h-10 !px-2.5" aria-label="この品目を消す" onClick={() => setItems((list) => list.filter((_, i) => i !== index))}><Trash2 size={16} /></button>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <input type="number" inputMode="decimal" min="0" className="cl-input !min-h-10 !w-16 text-right" value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) || 0 })} aria-label="数量" />
                  <span className="text-stone-500">個</span>
                  <AmountInput className="cl-input !min-h-10 flex-1 text-right" value={item.amount} onChange={(v) => updateItem(index, { amount: v })} aria-label="金額" />
                  <span className="tabular w-20 text-right text-xs text-stone-500">@{formatYen(unitPriceOf(item))}</span>
                </div>
                {/* 品名で自動に結んだ材料が違うときや、店で書き方が違う同じ材料に結ぶときに選び直す */}
                <select className="cl-input !min-h-10 text-sm" value={item.link} onChange={(e) => updateItem(index, { link: e.target.value })} aria-label="材料">
                  <option value="auto">{autoMatch ? `材料：${autoMatch.name}` : "新しい材料として登録"}</option>
                  {data.materials.filter((m) => m.id !== autoMatch?.id).map((m) => <option key={m.id} value={m.id}>材料：{m.name}</option>)}
                  {autoMatch && <option value="new">新しい材料として登録</option>}
                </select>
                {change && (
                  <p className={`flex items-start gap-1.5 text-sm font-bold ${change.diff > 0 ? "text-[var(--loss)]" : "text-[var(--profit)]"}`}>
                    {change.diff > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    <span>
                      前回 {formatYen(change.previousUnitPrice)} → {formatYen(change.unitPrice)}（{change.diff > 0 ? "+" : ""}{change.percent.toFixed(0)}%）
                      <span className="block text-xs font-normal text-stone-500">前回は {shortDate(change.previousDate)} {change.previousStore}</span>
                    </span>
                  </p>
                )}
              </div>
            );
          })}
          <button type="button" className="cl-secondary w-full !min-h-10 text-sm" onClick={() => setItems((list) => [...list, { name: "", quantity: 1, amount: 0, link: "auto" }])}><Plus size={16} />品目を足す</button>
        </section>

        {editing && <button type="button" className="w-full text-sm font-semibold text-red-700 underline" disabled={saving} onClick={() => void remove()}>このレシートを消す</button>}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-[var(--line)] bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          {error && <p className="mb-2 text-center text-sm font-semibold text-red-700">{error}</p>}
          <button type="button" className="cl-primary w-full" disabled={saving || reading} onClick={() => void save()}>
            {saving && <Loader2 size={16} className="animate-spin" />}保存する
          </button>
        </div>
      </div>
    </div>
  );
}
