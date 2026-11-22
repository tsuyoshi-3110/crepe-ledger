import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Firebase の設定が入っているか。入っていなければ「手元だけ」の形で動く
 *（ログインなし・この端末のブラウザに保存。lib/store.ts）。Firebase のプロジェクトを作るまでの試し用。
 */
export const firebaseEnabled = Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

/** 帳簿の置き場所 shops/{SHOP_ID}。Firestore のルールで、パスワードでログインした人だけが読み書きできる */
export const SHOP_ID = process.env.NEXT_PUBLIC_SHOP_ID || "main";

let app: FirebaseApp | null = null;

function firebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps()[0] ?? initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  return app;
}

export const firebaseAuth = (): Auth => getAuth(firebaseApp());
export const firestore = (): Firestore => getFirestore(firebaseApp());
