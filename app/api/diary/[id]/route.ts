// 일기 단건 수정/삭제.
// DELETE                       → 삭제
// PATCH { diary: string }      → 본문(diary 텍스트)만 갈아끼움

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";
import { deleteDiary, getDiary, updateDiaryText } from "@/lib/db";

export const runtime = "nodejs";

type AuthResult =
  | { ok: false; error: string; status: 500 | 401 }
  | { ok: true; supabase: SupabaseClient; userId: string };

async function authedClient(): Promise<AuthResult> {
  const supabase = await getServerSupabase();
  if (!supabase) return { ok: false, error: "Supabase 설정 안 됨.", status: 500 };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요해요.", status: 401 };
  return { ok: true, supabase, userId: user.id };
}

function badJson(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const diaryId = Number(id);
  if (!Number.isFinite(diaryId)) return badJson("잘못된 id예요.", 400);

  const a = await authedClient();
  if (!a.ok) return badJson(a.error, a.status);

  const row = await getDiary(a.supabase, diaryId);
  if (!row || row.user_id !== a.userId) return badJson("일기를 찾을 수 없어요.", 404);

  await deleteDiary(a.supabase, diaryId);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const diaryId = Number(id);
  if (!Number.isFinite(diaryId)) return badJson("잘못된 id예요.", 400);

  let diaryText: string;
  try {
    const body = await req.json();
    diaryText = String(body.diary ?? "");
    if (!diaryText.trim()) throw new Error("empty");
  } catch {
    return badJson("diary 필드가 필요해요.", 400);
  }

  const a = await authedClient();
  if (!a.ok) return badJson(a.error, a.status);

  const row = await getDiary(a.supabase, diaryId);
  if (!row || row.user_id !== a.userId) return badJson("일기를 찾을 수 없어요.", 404);

  const updated = await updateDiaryText(a.supabase, diaryId, diaryText);
  return new Response(JSON.stringify({ diary: updated }), {
    headers: { "content-type": "application/json" },
  });
}
