"use client";

import { firebaseAuth, firebaseEnabled } from "@/lib/firebaseClient";
import { loadPdfjs } from "@/lib/pdfjs";
import { todayLocal } from "@/lib/dates";

/*
 * 撮った・選んだレシートを、読み取りに使う JPEG にそろえて AI に渡す。
 * 元は XenoReceipt の lib/receiptImage.ts（2026-11-22 に写した）。
 */

const RECEIPT_MAX_SIDE = 1600;

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** 画像なら EXIF の向きを反映して長辺を制限、PDF なら1ページ目を描いて JPEG にする */
export async function normalizeReceiptImage(file: Blob): Promise<Blob> {
  if (file instanceof File && isPdfFile(file)) return renderPdfReceipt(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("この画像は読み込めませんでした。JPEG・PNG・PDFでお試しください。");
  }
  const scale = Math.min(1, RECEIPT_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像の変換に失敗しました。");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToJpeg(canvas, "画像の変換に失敗しました。");
}

async function renderPdfReceipt(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const pdfjs = await loadPdfjs();
    const pdf = await pdfjs.getDocument({ url }).promise;
    try {
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RECEIPT_MAX_SIDE / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("PDFの変換に失敗しました。");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      return await canvasToJpeg(canvas, "PDFの変換に失敗しました。");
    } finally {
      await pdf.destroy();
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PDFの変換")) throw error;
    throw new Error("このPDFは読み込めませんでした。");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, message: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(message))), "image/jpeg", 0.85);
  });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    reader.readAsDataURL(blob);
  });
}

export type ReadItem = { name: string; quantity: number; amount: number };

export type ReceiptReadResult =
  | { ok: true; storeName: string; date: string; totalAmount: number; category: string; items: ReadItem[]; itemsMatchTotal: boolean }
  | { ok: false; message: string };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** AI で読む。どんな失敗でも例外を投げずに ok:false を返す（登録が AI の生死に引きずられないように） */
export async function readReceipt(imageDataUrl: string): Promise<ReceiptReadResult> {
  const fallback = "読み取りできませんでした。手で入力してください。";
  try {
    const token = firebaseEnabled ? await firebaseAuth().currentUser?.getIdToken() : "";
    const response = await fetch("/api/receipt-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ image: imageDataUrl, today: todayLocal() }),
    });
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data || data.ok !== true) return { ok: false, message: text(data?.error) || fallback };
    const items = Array.isArray(data.items)
      ? (data.items as Record<string, unknown>[]).map((i) => ({ name: text(i.name), quantity: num(i.quantity) || 1, amount: num(i.amount) }))
      : [];
    return {
      ok: true,
      storeName: text(data.storeName),
      date: text(data.date),
      totalAmount: num(data.totalAmount),
      category: text(data.category),
      items,
      itemsMatchTotal: data.itemsMatchTotal !== false,
    };
  } catch {
    return { ok: false, message: fallback };
  }
}
