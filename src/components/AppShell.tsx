"use client";

import type { User } from "firebase/auth";
import { BarChart3, CalendarDays, Loader2, Receipt, Settings as SettingsIcon } from "lucide-react";
import { useState } from "react";

import { DayTab } from "@/components/DayTab";
import { ReceiptTab } from "@/components/ReceiptTab";
import { SettingsTab } from "@/components/SettingsTab";
import { SummaryTab } from "@/components/SummaryTab";
import { useShopData } from "@/components/useShopData";
import { firebaseEnabled } from "@/lib/firebaseClient";

type Tab = "day" | "receipt" | "summary" | "settings";

const TABS: { key: Tab; label: string; icon: typeof CalendarDays }[] = [
  { key: "day", label: "今日", icon: CalendarDays },
  { key: "receipt", label: "レシート", icon: Receipt },
  { key: "summary", label: "集計", icon: BarChart3 },
  { key: "settings", label: "設定", icon: SettingsIcon },
];

export function AppShell({ user }: { user: User | null }) {
  const [tab, setTab] = useState<Tab>("day");
  const { data, error, reload } = useShopData();

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
      {!firebaseEnabled && (
        <p className="bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-900">お試しの形です。入れた数字はこの端末のブラウザにだけ残ります。</p>
      )}
      {error && <p className="m-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      {!data ? (
        <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-stone-400" /></div>
      ) : (
        <main className="px-4 pt-4">
          {tab === "day" && <DayTab data={data} reload={reload} onOpenSettings={() => setTab("settings")} />}
          {tab === "receipt" && <ReceiptTab data={data} reload={reload} />}
          {tab === "summary" && <SummaryTab data={data} />}
          {tab === "settings" && <SettingsTab data={data} reload={reload} user={user} />}
        </main>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-bold ${tab === key ? "text-[var(--brand)]" : "text-stone-400"}`}
            >
              <Icon size={22} strokeWidth={tab === key ? 2.4 : 2} />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
