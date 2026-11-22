"use client";

/*
 * 帳簿の読み書き。Firebase があれば Firestore の shops/{SHOP_ID}/{コレクション}/{id}、
 * 無ければこの端末のブラウザ（localStorage）に置く。画面はどちらでも同じ呼び方をする。
 *
 * 1店の1年分でも日が365件、レシートが千件ほどなので、コレクションは丸ごと読んで画面で絞る。
 */
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";

import { SHOP_ID, firebaseEnabled, firestore } from "@/lib/firebaseClient";

export type CollectionName = "days" | "purchases" | "materials" | "staff" | "fixedCosts" | "meta";

const LOCAL_PREFIX = "crepe-ledger:";

function readLocal(name: CollectionName): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PREFIX + name) ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeLocal(name: CollectionName, value: Record<string, unknown>): void {
  localStorage.setItem(LOCAL_PREFIX + name, JSON.stringify(value));
}

export async function listDocs<T>(name: CollectionName): Promise<T[]> {
  if (!firebaseEnabled) return Object.values(readLocal(name)) as T[];
  const snapshot = await getDocs(collection(firestore(), "shops", SHOP_ID, name));
  return snapshot.docs.map((d) => d.data() as T);
}

export async function putDoc<T extends object>(name: CollectionName, id: string, value: T): Promise<void> {
  if (!firebaseEnabled) {
    const all = readLocal(name);
    all[id] = value;
    writeLocal(name, all);
    return;
  }
  await setDoc(doc(firestore(), "shops", SHOP_ID, name, id), value);
}

export async function removeDoc(name: CollectionName, id: string): Promise<void> {
  if (!firebaseEnabled) {
    const all = readLocal(name);
    delete all[id];
    writeLocal(name, all);
    return;
  }
  await deleteDoc(doc(firestore(), "shops", SHOP_ID, name, id));
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 20)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
