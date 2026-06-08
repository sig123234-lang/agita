import Anthropic from "@anthropic-ai/sdk";
import {
  buildSystemPrompt,
  computeAiMoodState,
  pickNextTopic,
  type Intensity,
  type LastDiary,
  type UserProfile,
} from "@/lib/prompts";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

type ClientMessage = { role: "user" | "assistant"; content: string };

type ChatRequest = {
  messages: ClientMessage[];
  intensity?: Intensity;
  aiName?: string;
  // 클라가 localStorage에서 읽어 같이 넘김
  lastDiary?: LastDiary | null;
  userProfile?: UserProfile | null;
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

  const lastDiary = body.lastDiary ?? null;
  const userProfile = body.userProfile ?? null;

  const systemPrompt = buildSystemPrompt({
    name: body.aiName ?? "온",
    lastDiary,
    userProfile,
    aiMoodState: computeAiMoodState(lastDiary),
    nextTopic: pickNextTopic(lastDiary, userProfile),
    intensity: body.intensity ?? "다정",
  });

  const anthropic = new Anthropic({ apiKey });

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
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "알 수 없는 오류";
        controller.enqueue(encoder.encode(`\n\n[오류가 생겼어요: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
