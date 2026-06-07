// DB CRUD 헬퍼 — 서버 사이드 (route handler / RSC).
// Supabase env 미설정이면 모든 함수가 no-op으로 동작 (개발 편의).

import type { SupabaseClient } from "@supabase/supabase-js";

export type Companion = {
  user_id: string;
  name: string;
  voice_id: string | null;
  intensity: "담백" | "다정" | "설렘" | string;
};

export type Session = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  message_count: number;
};

export async function getCompanion(
  supabase: SupabaseClient,
  userId: string,
): Promise<Companion | null> {
  const { data } = await supabase
    .from("companions")
    .select("user_id, name, voice_id, intensity")
    .eq("user_id", userId)
    .maybeSingle();
  return data as Companion | null;
}

export async function startSession(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as string;
}

export async function endSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  await supabase
    .from("sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId);
}

export async function saveMessage(
  supabase: SupabaseClient,
  args: {
    sessionId: string;
    userId: string;
    role: "user" | "assistant";
    content: string;
  },
): Promise<void> {
  await supabase.from("messages").insert({
    session_id: args.sessionId,
    user_id: args.userId,
    role: args.role,
    content: args.content,
  });
}

export async function incrementSessionMessageCount(
  supabase: SupabaseClient,
  sessionId: string,
  by = 1,
): Promise<void> {
  // RPC 없이 read-modify-write — 알파 트래픽엔 충분. 베타에선 함수로 원자화.
  const { data } = await supabase
    .from("sessions")
    .select("message_count")
    .eq("id", sessionId)
    .single();
  if (!data) return;
  await supabase
    .from("sessions")
    .update({ message_count: (data.message_count ?? 0) + by })
    .eq("id", sessionId);
}
