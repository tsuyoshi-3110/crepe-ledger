"use client";

import { useCallback, useEffect, useState } from "react";

import { listDocs } from "@/lib/store";
import { DEFAULT_SETTINGS, type DayRecord, type FixedCost, type Material, type Purchase, type Settings, type Staff } from "@/lib/types";

export type ShopData = {
  days: DayRecord[];
  purchases: Purchase[];
  materials: Material[];
  staff: Staff[];
  fixedCosts: FixedCost[];
  settings: Settings;
};

/** 帳簿を丸ごと読む。書いたあとは reload で読み直す */
export function useShopData() {
  const [data, setData] = useState<ShopData | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const [days, purchases, materials, staff, fixedCosts, meta] = await Promise.all([
        listDocs<DayRecord>("days"),
        listDocs<Purchase>("purchases"),
        listDocs<Material>("materials"),
        listDocs<Staff>("staff"),
        listDocs<FixedCost>("fixedCosts"),
        listDocs<Settings & { id: string }>("meta"),
      ]);
      const settings = meta.find((m) => m.id === "settings");
      setData({
        days,
        purchases: purchases.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
        materials: materials.sort((a, b) => a.name.localeCompare(b.name, "ja")),
        staff: staff.sort((a, b) => a.name.localeCompare(b.name, "ja")),
        fixedCosts,
        settings: { ...DEFAULT_SETTINGS, ...settings },
      });
      setError("");
    } catch {
      setError("帳簿を読み込めませんでした。通信を確かめて、開き直してください。");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void reload());
  }, [reload]);

  return { data, error, reload };
}
