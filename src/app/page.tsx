"use client";

import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, type User } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { firebaseAuth, firebaseEnabled } from "@/lib/firebaseClient";

function loginErrorMessage(code: string | undefined): string {
  if (code === "auth/network-request-failed") return "通信できませんでした。電波のよい所でもう一度お試しください。";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "メールアドレスかパスワードが違います。";
  if (code === "auth/admin-restricted-operation") return "このアカウントは登録されていません。管理者に作ってもらってください。";
  if (code === "auth/too-many-requests") return "続けて失敗したので、しばらく止めています。少し待ってからお試しください。";
  return "ログインできませんでした。もう一度お試しください。";
}

export default function Home() {
  if (!firebaseEnabled) return <AppShell user={null} />;
  return <LoginGate />;
}

/**
 * ログイン。メールアドレスとパスワードだけ（2026-11-22 ユーザー指定。Google は外した）。
 * アカウントは管理者が Firebase の画面の「ユーザーを追加」で作る。Firebase で新しい登録を止めてあるので、
 * ログインできる＝管理者が作った人（奥さまと管理者）。だから名簿は持たない。
 */
function LoginGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const auth = firebaseAuth();
    auth.languageCode = "ja";
    return onAuthStateChanged(auth, setUser);
  }, []);

  if (user === undefined) return <main className="grid min-h-dvh place-items-center"><Loader2 className="animate-spin text-stone-400" /></main>;
  if (user) return <AppShell user={user} />;

  async function login() {
    setMessage("");
    if (!email.trim() || !password) { setMessage("メールアドレスとパスワードを入れてください。"); return; }
    setBusy(true);
    try {
      await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
    } catch (cause) {
      setMessage(loginErrorMessage((cause as { code?: string })?.code));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!email.trim()) { setMessage("メールアドレスを入れてから押してください。"); return; }
    try {
      await sendPasswordResetEmail(firebaseAuth(), email.trim());
      setMessage("パスワードを決め直すメールを送りました。");
    } catch (cause) {
      setMessage(loginErrorMessage((cause as { code?: string })?.code));
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-5">
      <form className="cl-card w-full max-w-sm space-y-3" onSubmit={(e) => { e.preventDefault(); void login(); }}>
        <h1 className="text-center text-xl font-bold">クレープ帳簿</h1>
        <input className="cl-input" type="email" autoComplete="email" inputMode="email" placeholder="メールアドレス" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="cl-input" type="password" autoComplete="current-password" placeholder="パスワード" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" className="cl-primary w-full" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />}ログイン</button>
        <button type="button" className="w-full text-sm text-stone-500 underline" onClick={() => void reset()}>パスワードを忘れたとき</button>
        {message && <p className="text-sm font-semibold text-red-700">{message}</p>}
      </form>
    </main>
  );
}
