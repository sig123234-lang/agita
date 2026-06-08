// DB CRUD 헬퍼 — 서버 사이드 (route handler / RSC).
// Supabase env 미설정이면 모든 함수가 no-op으로 동작 (개발 편의).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LastDiary, UserProfile } from "./prompts";

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

export type DiaryRow = {
  id: number;
  session_id: string | null;
  user_id: string;
  date: string;
  payload: LastDiary;
  safety_flag: boolean;
  created_at: string;
};

export type MessageRow = {
  id: number;
  session_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
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

export async function getSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<Session | null> {
  const { data } = await supabase
    .from("sessions")
    .select("id, user_id, started_at, ended_at, message_count")
    .eq("id", sessionId)
    .maybeSingle();
  return data as Session | null;
}

export async function getSessionMessages(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<MessageRow[]> {
  const { data } = await supabase
    .from("messages")
    .select("id, session_id, user_id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return (data ?? []) as MessageRow[];
}

// ─── diaries ──────────────────────────────────────────────────────────────

export async function saveDiary(
  supabase: SupabaseClient,
  args: {
    userId: string;
    sessionId: string | null;
    date: string;
    payload: LastDiary;
    safetyFlag: boolean;
  },
): Promise<DiaryRow | null> {
  const { data } = await supabase
    .from("diaries")
    .insert({
      user_id: args.userId,
      session_id: args.sessionId,
      date: args.date,
      payload: args.payload,
      safety_flag: args.safetyFlag,
    })
    .select("*")
    .single();
  return (data ?? null) as DiaryRow | null;
}

export async function getLastDiary(
  supabase: SupabaseClient,
  userId: string,
): Promise<LastDiary | null> {
  const { data } = await supabase
    .from("diaries")
    .select("payload")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.payload ?? null) as LastDiary | null;
}

export async function listDiaries(
  supabase: SupabaseClient,
  userId: string,
  limit = 90,
): Promise<DiaryRow[]> {
  const { data } = await supabase
    .from("diaries")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  return (data ?? []) as DiaryRow[];
}

export async function getDiaryBySession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<DiaryRow | null> {
  const { data } = await supabase
    .from("diaries")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  return (data ?? null) as DiaryRow | null;
}

export async function getDiary(
  supabase: SupabaseClient,
  diaryId: number,
): Promise<DiaryRow | null> {
  const { data } = await supabase
    .from("diaries")
    .select("*")
    .eq("id", diaryId)
    .maybeSingle();
  return (data ?? null) as DiaryRow | null;
}

export async function deleteDiary(
  supabase: SupabaseClient,
  diaryId: number,
): Promise<void> {
  await supabase.from("diaries").delete().eq("id", diaryId);
}

export async function updateDiaryText(
  supabase: SupabaseClient,
  diaryId: number,
  diaryText: string,
): Promise<DiaryRow | null> {
  // payload의 diary 필드만 갈아끼움. 다른 필드 보존.
  const { data: existing } = await supabase
    .from("diaries")
    .select("payload")
    .eq("id", diaryId)
    .maybeSingle();
  if (!existing) return null;
  const nextPayload = { ...(existing.payload as LastDiary), diary: diaryText };
  const { data } = await supabase
    .from("diaries")
    .update({ payload: nextPayload })
    .eq("id", diaryId)
    .select("*")
    .single();
  return (data ?? null) as DiaryRow | null;
}

// ─── profiles ─────────────────────────────────────────────────────────────

export async function getUserProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserProfile | null> {
  const { data } = await supabase
    .from("user_profiles")
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.payload ?? null) as UserProfile | null;
}
