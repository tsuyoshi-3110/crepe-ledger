/*
 * lib/exportSheets.ts の表を Excel（.xlsx）にしてダウンロードする。ブラウザだけで作る。
 * exceljs は大きいので、押したときに読み込む。
 */
import type { Sheet } from "@/lib/exportSheets";

const FORMATS = { yen: "#,##0", rate: "0.0%", number: "#,##0.##" } as const;

export async function downloadExcel(sheets: Sheet[], fileName: string): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "甘味処クレープよって屋 帳簿";
  for (const sheet of sheets) {
    const ws = book.addWorksheet(sheet.name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = sheet.columns.map((c) => ({ header: c.header, width: c.width, style: c.format ? { numFmt: FORMATS[c.format] } : {} }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E8E0" } };
    for (const row of sheet.rows) ws.addRow(row);
    if (sheet.totalRow) ws.addRow(sheet.totalRow).font = { bold: true };
  }
  const buffer = await book.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
