// 세션 종료 + 일기 생성.
// POST { sessionId } → 메시지 읽어 DIARY_PROMPT → diaries 저장 → 일기 반환.
// 멱등: 같은 세션에 일기 있으면 기존 일기 반환.

import Anthropic from "@anthropic-ai/sdk";
import { DIARY_PROMPT, safeParseDiaryJson } from "@/lib/prompts";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  endSession,
  getDiaryBySession,
  getSession,
  getSessionMessages,
  saveDiary,
} from "@/lib/db";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_DIARY_MODEL || "claude-sonnet-4-6";

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY 없음." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  let sessionId: string;
  try {
    const body = await req.json();
    sessionId = String(body.sessionId ?? "");
    if (!sessionId) throw new Error("sessionId 필요");
  } catch {
    return new Response(JSON.stringify({ error: "sessionId가 필요해요." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = await getServerSupabase();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase 설정 안 됨." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "로그인이 필요해요." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const session = await getSession(supabase, sessionId);
  if (!session || session.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "세션을 찾을 수 없어요." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  // 멱등: 이미 일기 있으면 그대로 반환
  const existing = await getDiaryBySession(supabase, sessionId);
  if (existing) {
    return new Response(JSON.stringify({ diary: existing, reused: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const messages = await getSessionMessages(supabase, sessionId);
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: "대화 내용이 없어요." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const transcript = messages
    .map((m) => `${m.role === "user" ? "사용자" : "온"}: ${m.content}`)
    .join("\n");

  const anthropic = new Anthropic({ apiKey });
  let raw: string;
  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: DIARY_PROMPT,
      messages: [{ role: "user", content: transcript }],
    });
    const first = resp.content[0];
    raw = first.type === "text" ? first.text : "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "일기 생성 실패";
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  const parsed = safeParseDiaryJson(raw);
  const date = parsed.date ?? new Date().toISOString().slice(0, 10);

  const saved = await saveDiary(supabase, {
    userId: user.id,
    sessionId,
    date,
    payload: parsed,
    safetyFlag: !!parsed.safety_flag,
  });

  await endSession(supabase, sessionId);

  // CP4에서 safety_flag true → 운영자 알림 (슬랙 등) 트리거 예정

  return new Response(JSON.stringify({ diary: saved }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
