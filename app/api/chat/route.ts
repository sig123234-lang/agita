import Anthropic from "@anthropic-ai/sdk";
import {
  buildSystemPrompt,
  computeAiMoodState,
  pickNextTopic,
  type Intensity,
  type LastDiary,
  type UserProfile,
} from "@/lib/prompts";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  getCompanion,
  startSession,
  saveMessage,
  incrementSessionMessageCount,
  getLastDiary,
  getUserProfile,
} from "@/lib/db";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

type ClientMessage = { role: "user" | "assistant"; content: string };

type ChatRequest = {
  messages: ClientMessage[];
  intensity?: Intensity;
  aiName?: string;
  sessionId?: string | null;
};

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY가 설정되지 않았어요." }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
    if (!Array.isArray(body?.messages)) throw new Error("messages must be an array");
  } catch {
    return new Response(JSON.stringify({ error: "잘못된 요청이에요." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // ─── 인증 + 영속화 (Supabase 있을 때만) ──────────────────────────────────
  const supabase = await getServerSupabase();
  let userId: string | null = null;
  let sessionId: string | null = body.sessionId ?? null;
  let companionName = body.aiName ?? "agita";
  let companionIntensity: string = body.intensity ?? "다정";
  let lastDiary: LastDiary | null = null;
  let userProfile: UserProfile | null = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "로그인이 필요해요." }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    userId = user.id;

    const companion = await getCompanion(supabase, userId);
    if (companion) {
      companionName = companion.name;
      companionIntensity = companion.intensity;
    }

    [lastDiary, userProfile] = await Promise.all([
      getLastDiary(supabase, userId),
      getUserProfile(supabase, userId),
    ]);

    if (!sessionId) {
      sessionId = await startSession(supabase, userId);
    }

    const lastUserMsg = [...body.messages].reverse().find((m) => m.role === "user");
    if (sessionId && lastUserMsg) {
      await saveMessage(supabase, {
        sessionId,
        userId,
        role: "user",
        content: lastUserMsg.content,
      });
    }
  }

  const systemPrompt = buildSystemPrompt({
    name: companionName,
    lastDiary,
    userProfile,
    aiMoodState: computeAiMoodState(lastDiary),
    nextTopic: pickNextTopic(lastDiary, userProfile),
    intensity: companionIntensity,
  });

  const anthropic = new Anthropic({ apiKey });

  let assistantFull = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const llmStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
        });

        for await (const event of llmStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            assistantFull += text;
            controller.enqueue(encoder.encode(text));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "알 수 없는 오류";
        const errText = `\n\n[오류가 생겼어요: ${msg}]`;
        assistantFull += errText;
        controller.enqueue(encoder.encode(errText));
      } finally {
        controller.close();

        if (supabase && userId && sessionId && assistantFull) {
          await saveMessage(supabase, {
            sessionId,
            userId,
            role: "assistant",
            content: assistantFull,
          });
          await incrementSessionMessageCount(supabase, sessionId, 2);
        }
      }
    },
  });

  const headers: Record<string, string> = {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-cache, no-transform",
  };
  if (sessionId) headers["x-session-id"] = sessionId;

  return new Response(stream, { headers });
}
