/*
 * レシートの読み取り。本体は lib/receiptExtraction.ts。
 * 入れるのはログインした人だけ。アカウントは管理者しか作れない（Firebase で新しい登録を止めてある）ので、
 * ログインできる＝店の人。
 * Firebase の設定が無い手元の開発（npm run dev）だけはログイン無しで通す。
 * 失敗しても画面は写真を持ったまま手入力へ倒れるので、例外は投げずに返す。
 */
import { NextResponse } from "next/server";

import { ALL_CATEGORIES } from "@/lib/categories";
import { adminAuth } from "@/lib/firebaseAdmin";
import { MAX_IMAGE_CHARS, itemsMatchTotal, normalizeDate, runExtraction } from "@/lib/receiptExtraction";

export const runtime = "nodejs";
export const maxDuration = 90;

async function allowed(request: Request): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return process.env.NODE_ENV === "development";
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return decoded.firebase?.sign_in_provider === "password";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!(await allowed(request))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "AI の鍵（OPENAI_API_KEY）が入っていないので読み取れません。手で入力してください。" }, { status: 200 });
  }

  const body = (await request.json().catch(() => ({}))) as { image?: unknown; today?: unknown };
  const image = typeof body.image === "string" && body.image.startsWith("data:image/") && body.image.length <= MAX_IMAGE_CHARS ? body.image : "";
  if (!image) return NextResponse.json({ ok: false, error: "レシート画像がありません。" }, { status: 400 });
  const today = normalizeDate(body.today) || new Date().toISOString().slice(0, 10);

  const result = await runExtraction(image, today, [...ALL_CATEGORIES]);
  if (result.ok === false) {
    return NextResponse.json(
      { ok: false, error: result.unreadable ? result.error : "読み取りできませんでした。手で入力してください。" },
      { status: result.unreadable ? 200 : 502 },
    );
  }
  return NextResponse.json(
    { ok: true, ...result.data, itemsMatchTotal: itemsMatchTotal(result.data.items, result.data.totalAmount), model: result.model },
    { headers: { "Cache-Control": "no-store" } },
  );
}
