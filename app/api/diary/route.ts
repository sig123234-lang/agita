// 일기 생성. 영속화는 클라(localStorage)가 함.
// POST { messages } → DIARY_PROMPT 실행 → JSON 파싱 → 반환.

import Anthropic from "@anthropic-ai/sdk";
import { DIARY_PROMPT, safeParseDiaryJson, type LastDiary } from "@/lib/prompts";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_DIARY_MODEL || "claude-sonnet-4-6";

type ClientMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY 없음." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  let messages: ClientMessage[];
  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length < 2) {
      throw new Error("messages must be a non-empty conversation");
    }
  } catch {
    return new Response(JSON.stringify({ error: "대화 내용이 필요해요." }), {
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

  const diary: LastDiary = safeParseDiaryJson(raw);
  if (!diary.date) diary.date = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify({ diary }), {
    headers: { "content-type": "application/json" },
  });
}
