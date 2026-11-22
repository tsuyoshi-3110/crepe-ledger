/*
 * 帳簿のデータの形。Firestore では shops/{shopId}/{コレクション}/{id} に置く（lib/store.ts）。
 * 金額はすべて税込の円（整数）。
 */

/** 売上の窓口 */
export type Channel = "store" | "uber" | "rocket";

export const CHANNELS: { key: Channel; label: string; delivery: boolean }[] = [
  { key: "store", label: "店頭", delivery: false },
  { key: "uber", label: "Uber Eats", delivery: true },
  { key: "rocket", label: "ロケットナウ", delivery: true },
];

/** その日に働いた人。時給はその日の時点の額を写しておく（あとで時給を変えても過去の人件費が動かない） */
export type LaborEntry = { staffId: string; name: string; hours: number; hourlyWage: number };

/**
 * 1日分の記録（days/{YYYY-MM-DD}）。
 * 売上は手数料を引く前の額。Uber・ロケットの手数料は販管費として別に持つ。
 */
export type DayRecord = {
  date: string;
  sales: Record<Channel, number>;
  fees: { uber: number; rocket: number };
  labor: LaborEntry[];
  note: string;
  /** 店の休み。入れ忘れの知らせから外す（前からの記録には無いので省略できる） */
  closed?: boolean;
};

/** レシートの1行。amount は値引きを引いたあとの額。単価は amount ÷ quantity */
export type PurchaseItem = { name: string; quantity: number; amount: number; materialId: string };

/** 仕入れ・経費のレシート（purchases/{id}）。日付の日に原価・経費として数える */
export type Purchase = {
  id: string;
  date: string;
  storeName: string;
  total: number;
  category: string;
  items: PurchaseItem[];
  createdAt: number;
};

/** 材料（materials/{id}）。レシートの品名の書き方が店で違うので、別名をまとめて持つ */
export type Material = { id: string; name: string; aliases: string[] };

/** スタッフ（staff/{id}） */
export type Staff = { id: string; name: string; hourlyWage: number; active: boolean };

/** 毎月かかる固定の経費（fixedCosts/{id}）。家賃など。日割りで週・月に入れる */
export type FixedCost = { id: string; name: string; monthlyAmount: number };

/**
 * 設定（meta/settings）。率はすべて %。
 * 手数料率は売上を入れたときに手数料の初めの値を出すのに使う。
 * 目標の原価率は、集計で実際の原価率と並べて、超えた週・月を知らせるのに使う。
 */
export type Settings = { uberFeeRate: number; rocketFeeRate: number; targetCostRate: number };

/** 目標の原価率の既定は 30%（材料費の平均を 30% 以下にして値段を決めている。2026-11-22 ユーザー） */
export const DEFAULT_SETTINGS: Settings = { uberFeeRate: 0, rocketFeeRate: 0, targetCostRate: 30 };

export function emptyDay(date: string): DayRecord {
  return { date, sales: { store: 0, uber: 0, rocket: 0 }, fees: { uber: 0, rocket: 0 }, labor: [], note: "" };
}
