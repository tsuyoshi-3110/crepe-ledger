/*
 * レシート写真から 店名・日付・合計・費目・品目 を読み取る本体。
 *
 * 元は XenoReceipt の lib/receiptExtraction.ts（2026-11-22 に写した）。店名・日付・合計の読み方は
 * そちらで実物を読み比べて決めたものをそのまま使う。
 *
 * 【XenoReceipt との違い：品目も読む】
 * XenoReceipt は品目を読まない（略称が多く、誤読が増えるため）。ここでは材料の単価の変化を
 * 見張るために品目と数量・金額まで読ませる。品目はあくまで確認する画面の下書きで、人が直してから保存する。
 * 品目の合計がレシートの合計と合わないときは、画面で知らせる（route.ts の itemsMatchTotal）。
 */
import type { Reasoning } from "openai/resources/shared";

import { openai } from "@/lib/openai";

const MODELS = ["gpt-5.6-terra", "gpt-5.4", "gpt-5.1"];

// XenoReceipt で読み比べた結果、考えさせないほうが速く正確だった。SDK 5.x の型に "none" が無いので書き換える
const REASONING = { effort: "none" } as unknown as Reasoning;

const SYSTEM_PROMPT = `あなたは日本のレシート・領収書を読み取る担当者です。クレープ屋の仕入れ・経費のレシートです。
渡された画像から、次の項目を抽出してJSONで返してください。

1. storeName … 店舗名・発行者名
2. date       … 利用日（YYYY-MM-DD形式）
3. totalAmount … 支払合計金額（円・整数）
4. items      … 買った品目の行

【厳守事項】
- 画像から実際に判読できた内容だけを返す。推測・補完は一切しない。

【storeName】
- レシート上部の店名・会社名をそのまま写す。半角カナは全角に直してよい。
- 「〇〇店」「〇〇支店」などの支店名が付いていればそのまま含める。
- 「領収書」「レシート」「お買上票」などの帳票名は店舗名ではない。
- 読めなければ空文字 "" にする。実在しそうな店名で埋めてはならない。

【date】
- レシートに印字された利用日・発行日を YYYY-MM-DD にする（和暦は西暦へ直す）。
- 年が印字されておらず月日しか無い場合は、参考情報として渡される「今日の日付」の年を使う。
  ただし、それだと未来日になる場合は前年とする。
- 読めなければ空文字 "" にする。

【totalAmount】（最も間違いが多い項目）
- 「合計」「お会計」「税込合計」「ご請求額」「領収金額」の金額を採る。
- 小計／内消費税／消費税等／課税対象額／お預り／現金／お釣り／ポイント／値引／個々の商品の金額 と取り違えない。
- 「小計」と「合計」が両方あるときは必ず「合計」を採る。
- 割引・値引の行の金額は合計ではない。割引があるときの合計は、割引を差し引いたあとの額。
- 「合計」の行が無いレシートは「領収金額」「お支払」「請求額」の行、それも無ければ支払手段の行から釣銭を引いた額。
- 数字は「¥」「円」「,」を除いた整数にする。読めなければ 0。推測してはならない。

【items】（買った品目。1行が1品目）
- name：レシートに印字された品名をそのまま写す。半角カナは全角に直してよい。略称を一般的な名前に直さない。
  先頭の部門番号や「※」「＊」「軽」などの税の印は名前に含めない。
- quantity：数量。「2個 × 150」「@150 × 2」「2点」なら 2。数量の印字が無ければ 1。
  量り売りの重さ（「325g」）は数量にしない（1 にする）。
- unitPrice：1つあたりの値段。数量の印字が無ければ amount と同じ。
- amount：その行の金額（数量ぶん。値引き前）。
- discount：その品目にかかる値引き・割引の額（正の整数）。値引きの行は品目として出さず、
  直前の品目の discount に入れる。レシート全体への値引き（「小計値引」など）はどの品目にも入れない。無ければ 0。
- 小計・合計・消費税・お預り・お釣り・ポイント・袋代以外の会計の行は品目ではない。レジ袋は品目に含める。
- 品目が読めないレシート（駐車場・公共料金など）は空の配列にする。

【readable】
- 店舗名・利用日・合計金額のうち1つでも読み取れたら true。
- レシートではない画像、または全く判読できない場合は false にする。`;

function schemaFor(categories: string[]): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["readable", "storeName", "date", "totalAmount", "category", "items"],
    properties: {
      readable: { type: "boolean" },
      storeName: { type: "string" },
      date: { type: "string" },
      totalAmount: { type: "integer" },
      category: { type: "string", enum: [...categories, ""], description: "費目。候補から1つ。決めきれなければ空" },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "quantity", "unitPrice", "amount", "discount"],
          properties: {
            name: { type: "string" },
            quantity: { type: "number" },
            unitPrice: { type: "integer" },
            amount: { type: "integer" },
            discount: { type: "integer" },
          },
        },
      },
    },
  };
}

function categoryText(categories: string[]): string {
  return `
費目を次の候補から1つ選び、category に入れてください。候補：${categories.map((c) => `「${c}」`).join("")}
- 食品・飲み物・果物・乳製品・粉・砂糖・油・クリーム・チョコなど、売り物の材料 → 「材料費」
- 容器・クレープの包み紙・紙袋・ストロー・スプーン・紙ナプキン・シール → 「包装資材費」
- 洗剤・ゴミ袋・ゴム手袋・キッチンペーパーなど、店で使う日用品 → 「消耗品費」
- 電気・ガス・水道 → 「水道光熱費」／電話・インターネット → 「通信費」
- 材料と包装が混ざっているときは、金額の多いほう。決めきれなければ空文字 ""。`;
}

export const MAX_IMAGE_CHARS = 8_000_000;

export type ExtractedItem = { name: string; quantity: number; amount: number };

export type Extracted = {
  storeName: string;
  date: string;
  totalAmount: number;
  category: string;
  /** amount は値引きを引いたあと */
  items: ExtractedItem[];
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function normalizeDate(raw: unknown): string {
  const value = text(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  return value;
}

export function normalizeAmount(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  const value = Math.round(raw);
  return value <= 0 || value > 100_000_000 ? 0 : value;
}

/** AI の品目の行を、保存する形（値引き後の金額・数量）にする。読み違いの行は落とす */
export function normalizeItems(raw: unknown): ExtractedItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ExtractedItem[] = [];
  for (const row of raw.slice(0, 100)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = text(r.name).slice(0, 60);
    const quantity = typeof r.quantity === "number" && r.quantity > 0 && r.quantity < 10_000 ? r.quantity : 1;
    let amount = normalizeAmount(r.amount);
    // 金額が読めず単価と数量だけ読めたときは掛ける
    if (amount === 0) amount = normalizeAmount(r.unitPrice) * quantity;
    const discount = normalizeAmount(r.discount);
    if (!name || amount <= 0) continue;
    items.push({ name, quantity, amount: Math.max(0, amount - discount) });
  }
  return items;
}

/** 品目の合計がレシートの合計と合うか（外税のレシートは税のぶん合わない。±2円は丸めとして許す） */
export function itemsMatchTotal(items: ExtractedItem[], total: number): boolean {
  if (items.length === 0 || total <= 0) return true;
  return Math.abs(items.reduce((sum, item) => sum + item.amount, 0) - total) <= 2;
}

export async function runExtraction(
  image: string,
  todayJst: string,
  categories: string[],
): Promise<{ ok: true; data: Extracted; model: string } | { ok: false; unreadable: boolean; error: string }> {
  const userText = `レシートの写真を1枚添付します。参考：今日の日付は ${todayJst} です（年が印字されていないときの補完にだけ使う）。${categoryText(categories)}`;
  let lastError: unknown = null;
  for (const model of MODELS) {
    try {
      const response = await openai().responses.create(
        {
          model,
          store: false,
          input: [
            { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
            { role: "user", content: [{ type: "input_text", text: userText }, { type: "input_image", image_url: image, detail: "high" }] },
          ],
          text: { format: { type: "json_schema", name: "receipt_with_items", strict: true, schema: schemaFor(categories) } },
          max_output_tokens: 6000,
          reasoning: REASONING,
        },
        { timeout: 75_000 },
      );
      const rawText = response.output_text?.trim();
      if (!rawText) throw new Error("EMPTY_AI_RESULT");
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      const data: Extracted = {
        storeName: text(parsed.storeName).slice(0, 100),
        date: normalizeDate(parsed.date),
        totalAmount: normalizeAmount(parsed.totalAmount),
        category: categories.includes(text(parsed.category)) ? text(parsed.category) : "",
        items: normalizeItems(parsed.items),
      };
      const gotSomething = data.storeName !== "" || data.date !== "" || data.totalAmount > 0;
      if (parsed.readable !== true || !gotSomething) {
        return { ok: false, unreadable: true, error: "読み取りできませんでした。手で入力してください。" };
      }
      return { ok: true, data, model };
    } catch (error) {
      lastError = error;
    }
  }
  return { ok: false, unreadable: false, error: lastError instanceof Error ? lastError.message : "ai_failed" };
}
