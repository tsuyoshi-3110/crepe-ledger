"use client";

import { Camera, ChevronLeft, ChevronRight, ImageUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { FileDropOverlay } from "@/components/FileDropOverlay";
import { ReceiptEditor } from "@/components/ReceiptEditor";
import { ReceiptScanner } from "@/components/ReceiptScanner";
import { useFileDrop } from "@/components/useFileDrop";
import type { ShopData } from "@/components/useShopData";
import { isCostCategory } from "@/lib/categories";
import { monthLabel, shiftMonth, shortDate, todayLocal } from "@/lib/dates";
import { formatYen } from "@/lib/format";
import { isScannerAvailable } from "@/lib/receiptScan";
import type { Purchase } from "@/lib/types";

type Editor = { editing: Purchase | null; file: File | null } | null;

/** レシートを撮る・選ぶ。その月のレシートの一覧から直す */
export function ReceiptTab({ data, reload }: { data: ShopData; reload: () => Promise<void> }) {
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const [editor, setEditor] = useState<Editor>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const pickRef = useRef<HTMLInputElement | null>(null);
  const drop = useFileDrop((files) => setEditor({ editing: null, file: files[0] }));

  const list = useMemo(() => data.purchases.filter((p) => p.date.startsWith(month)), [data.purchases, month]);
  const costTotal = list.filter((p) => isCostCategory(p.category)).reduce((s, p) => s + p.total, 0);
  const otherTotal = list.filter((p) => !isCostCategory(p.category)).reduce((s, p) => s + p.total, 0);

  function startCamera() {
    setScanError("");
    // カメラで自動に撮れない端末（古い iPhone など）は、写真の撮影・選択の画面を開く
    if (isScannerAvailable()) setScanning(true);
    else pickRef.current?.click();
  }

  if (scanning) {
    return (
      <ReceiptScanner
        onCapture={(file) => { setScanning(false); setEditor({ editing: null, file }); }}
        onClose={() => setScanning(false)}
        onUnavailable={(reason) => { setScanning(false); setScanError(reason); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div {...drop.handlers} className="relative grid grid-cols-2 gap-3">
        {drop.dragging && <FileDropOverlay label="ここに落とすと読み取ります" />}
        <button type="button" className="cl-primary !min-h-24 flex-col text-base" onClick={startCamera}><Camera size={28} />レシートを撮る</button>
        <button type="button" className="cl-secondary !min-h-24 flex-col text-base" onClick={() => pickRef.current?.click()}><ImageUp size={28} />写真・PDFを選ぶ</button>
        <input
          ref={pickRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) setEditor({ editing: null, file });
          }}
        />
      </div>
      {scanError && <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{scanError}「写真・PDFを選ぶ」から撮ってください。</p>}
      <button type="button" className="w-full text-sm text-stone-500 underline" onClick={() => setEditor({ editing: null, file: null })}>レシートが無い支払いを手で入れる</button>

      <div className="flex items-center justify-between">
        <button type="button" className="cl-secondary !px-3" aria-label="前の月" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={20} /></button>
        <span className="text-lg font-bold">{monthLabel(month)}</span>
        <button type="button" className="cl-secondary !px-3" aria-label="次の月" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={20} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="cl-card !p-3"><p className="text-xs text-stone-500">原価（材料・包装）</p><p className="tabular text-lg font-bold">{formatYen(costTotal)}</p></div>
        <div className="cl-card !p-3"><p className="text-xs text-stone-500">その他の経費</p><p className="tabular text-lg font-bold">{formatYen(otherTotal)}</p></div>
      </div>

      <ul className="cl-card divide-y divide-[var(--line)] !p-0">
        {list.length === 0 && <li className="p-4 text-center text-sm text-stone-500">この月のレシートはまだありません</li>}
        {list.map((p) => (
          <li key={p.id}>
            <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setEditor({ editing: p, file: null })}>
              <span className="w-10 text-sm text-stone-500">{shortDate(p.date)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.storeName || "（店名なし）"}</span>
                <span className="text-xs text-stone-500">{p.category}{p.items.length > 0 ? `・${p.items.length}品` : ""}</span>
              </span>
              <span className="tabular font-bold">{formatYen(p.total)}</span>
            </button>
          </li>
        ))}
      </ul>

      {editor && (
        <ReceiptEditor
          data={data}
          editing={editor.editing}
          file={editor.file}
          onClose={() => setEditor(null)}
          onSaved={async () => { await reload(); setEditor(null); }}
        />
      )}
    </div>
  );
}
