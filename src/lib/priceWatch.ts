/*
 * 材料の単価の見張り。
 *
 * レシートの品名は店ごとに書き方が違う（「ｷﾞｭｳﾆｭｳ1L」「牛乳 1000ml」）。品名をそろえて材料に結び、
 * 同じ材料の前回の単価と比べる。結びつけは「品名の別名」で行い、一度結べば次から自動で同じ材料になる。
 * 単価は 金額（値引き後）÷ 数量。
 */
import type { Material, Purchase, PurchaseItem } from "@/lib/types";

/** 品名を比べる形にする（全角半角・大文字小文字・空白の違いを消す） */
export function normalizeName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[\s・]/g, "");
}

export function unitPriceOf(item: Pick<PurchaseItem, "amount" | "quantity">): number {
  if (item.quantity <= 0) return item.amount;
  return Math.round(item.amount / item.quantity);
}

/** 品名から材料を探す。名前か別名がそろえて同じなら同じ材料 */
export function findMaterial(itemName: string, materials: Material[]): Material | null {
  const key = normalizeName(itemName);
  if (!key) return null;
  return materials.find((m) => normalizeName(m.name) === key || m.aliases.some((alias) => normalizeName(alias) === key)) ?? null;
}

export type PriceChange = {
  materialId: string;
  materialName: string;
  date: string;
  storeName: string;
  previousDate: string;
  previousStore: string;
  previousUnitPrice: number;
  unitPrice: number;
  diff: number;
  /** 変わった割合（%）。前回が0なら0 */
  percent: number;
};

type Observation = { date: string; createdAt: number; purchaseId: string; storeName: string; unitPrice: number };

/** 材料ごとの買った記録（古い順） */
function observations(purchases: Purchase[]): Map<string, Observation[]> {
  const map = new Map<string, Observation[]>();
  for (const purchase of purchases) {
    for (const item of purchase.items) {
      if (!item.materialId || item.amount <= 0) continue;
      const list = map.get(item.materialId) ?? [];
      list.push({ date: purchase.date, createdAt: purchase.createdAt, purchaseId: purchase.id, storeName: purchase.storeName, unitPrice: unitPriceOf(item) });
      map.set(item.materialId, list);
    }
  }
  for (const list of map.values()) list.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  return map;
}

function change(materialId: string, materialName: string, now: Observation, before: Observation): PriceChange {
  const diff = now.unitPrice - before.unitPrice;
  return {
    materialId,
    materialName,
    date: now.date,
    storeName: now.storeName,
    previousDate: before.date,
    previousStore: before.storeName,
    previousUnitPrice: before.unitPrice,
    unitPrice: now.unitPrice,
    diff,
    percent: before.unitPrice > 0 ? (diff / before.unitPrice) * 100 : 0,
  };
}

/**
 * いま確かめているレシートの1行が、前回と比べて変わったか。
 * 前回＝その日付より前（同じ日なら先に登録したもの）で、いちばん新しい記録。このレシート自身は除く。
 */
export function compareWithPrevious(
  item: Pick<PurchaseItem, "amount" | "quantity">,
  material: Material,
  date: string,
  purchases: Purchase[],
  excludePurchaseId = "",
): PriceChange | null {
  if (item.amount <= 0) return null;
  const list = (observations(purchases).get(material.id) ?? []).filter((o) => o.purchaseId !== excludePurchaseId && o.date <= date);
  const before = list.at(-1);
  if (!before) return null;
  const now: Observation = { date, createdAt: Date.now(), purchaseId: excludePurchaseId, storeName: "", unitPrice: unitPriceOf(item) };
  if (now.unitPrice === before.unitPrice) return null;
  return change(material.id, material.name, now, before);
}

/** 期間の中で単価が変わった記録（新しい順）。ホームのお知らせに出す */
export function recentPriceChanges(purchases: Purchase[], materials: Material[], since: string): PriceChange[] {
  const names = new Map(materials.map((m) => [m.id, m.name]));
  const changes: PriceChange[] = [];
  for (const [materialId, list] of observations(purchases)) {
    for (let i = 1; i < list.length; i++) {
      if (list[i].date < since) continue;
      if (list[i].unitPrice === list[i - 1].unitPrice) continue;
      changes.push(change(materialId, names.get(materialId) ?? "", list[i], list[i - 1]));
    }
  }
  return changes.sort((a, b) => b.date.localeCompare(a.date));
}

/** 材料ごとの単価の移り変わり（新しい順） */
export function priceHistory(materialId: string, purchases: Purchase[]): Observation[] {
  return [...(observations(purchases).get(materialId) ?? [])].reverse();
}
