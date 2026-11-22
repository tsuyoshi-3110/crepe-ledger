import OpenAI from "openai";

let client: OpenAI | null = null;

/** 鍵が無いと作った時点で例外になるので、呼ぶときに作る（テストや鍵の無い開発で読み込めるように） */
export function openai(): OpenAI {
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}
