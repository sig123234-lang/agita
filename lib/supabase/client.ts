// 클라이언트 컴포넌트용. 브라우저에서 직접 Supabase 호출 (anon key).

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

export function getBrowserSupabase() {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createBrowserClient(env.url, env.anonKey);
}
