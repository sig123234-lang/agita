"use client";

import { useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Message = { role: "user" | "assistant"; content: string };

type Props = {
  aiName: string;
  intensity: string;
  email: string | null;
};

export default function ChatClient({ aiName, intensity, email }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakMode, setSpeakMode] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 타자기 효과
  const targetRef = useRef("");
  const displayedRef = useRef("");
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // TTS
  const speakModeRef = useRef(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current =
        voices.find((v) => v.lang === "ko-KR") ||
        voices.find((v) => v.lang.startsWith("ko")) ||
        null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  function ttsSupported() {
    return typeof window !== "undefined" && !!window.speechSynthesis;
  }

  function speak(text: string) {
    if (!ttsSupported() || !text.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    if (voiceRef.current) u.voice = voiceRef.current;
    window.speechSynthesis.speak(u);
  }

  function toggleSpeakMode() {
    const next = !speakMode;
    speakModeRef.current = next;
    setSpeakMode(next);
    if (!next && ttsSupported()) window.speechSynthesis.cancel();
  }

  function autosize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }

  function setLastAssistant(content: string) {
    setMessages((m) => {
      const copy = [...m];
      const last = copy[copy.length - 1];
      if (last && last.role === "assistant") {
        copy[copy.length - 1] = { ...last, content };
      }
      return copy;
    });
  }

  function startTypewriter() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const target = targetRef.current;
      const shown = displayedRef.current;
      if (shown.length < target.length) {
        const remaining = target.length - shown.length;
        const step = remaining > 100 ? Math.ceil(remaining / 50) : 1;
        displayedRef.current = target.slice(0, shown.length + step);
        setLastAssistant(displayedRef.current);
      } else if (doneRef.current) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setBusy(false);
      }
    }, 38);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (ttsSupported()) window.speechSynthesis.cancel();

    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    requestAnimationFrame(autosize);

    targetRef.current = "";
    displayedRef.current = "";
    doneRef.current = false;
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    startTypewriter();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: next,
          intensity,
          aiName,
          sessionId,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res
          .json()
          .catch(() => ({ error: "응답을 받지 못했어요." }));
        targetRef.current += `\n[${err.error || "오류가 생겼어요."}]`;
        doneRef.current = true;
        return;
      }

      // 서버가 새 세션을 만들면 헤더로 돌려줌
      const newSessionId = res.headers.get("x-session-id");
      if (newSessionId && newSessionId !== sessionId) setSessionId(newSessionId);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        targetRef.current += decoder.decode(value, { stream: true });
      }
      if (speakModeRef.current) speak(targetRef.current);
    } catch {
      targetRef.current += "\n[연결에 문제가 생겼어요. 다시 시도해 주세요.]";
    } finally {
      doneRef.current = true;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function signOut() {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-text">
          <h1>{aiName}</h1>
          <p>오늘 하루, 나한테 들려줘.</p>
        </div>
        <div className="header-actions">
          <button
            className={`tts-toggle${speakMode ? " on" : ""}`}
            onClick={toggleSpeakMode}
            title="말하기 모드 — 온의 답을 음성으로 읽어줘요"
            aria-pressed={speakMode}
          >
            {speakMode ? "🔊 켜짐" : "🔇 말하기"}
          </button>
          {email && (
            <button className="signout" onClick={signOut} title={email}>
              로그아웃
            </button>
          )}
        </div>
      </header>

      <div className="messages" ref={messagesRef}>
        {messages.length === 0 && (
          <div className="intro">
            <div className="big">오늘 어땠어?</div>
            <div>
              잘 보낸 하루든, 힘든 일이 있었든.
              <br />
              아무한테도 못한 얘기, 나한테 풀어놔도 돼.
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const isAi = m.role === "assistant";
          const isTyping = isAi && i === messages.length - 1 && busy;
          return (
            <div key={i} className={`row ${isAi ? "ai-row" : "user-row"}`}>
              <div
                className={`bubble ${isAi ? "ai" : "user"}${
                  isTyping ? " typing" : ""
                }`}
              >
                {m.content}
              </div>
              {isAi && m.content.trim() && ttsSupported() && (
                <button
                  className="replay"
                  onClick={() => speak(m.content)}
                  title="이 답변 다시 듣기"
                  aria-label="다시 듣기"
                >
                  🔊
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="composer">
        <textarea
          ref={taRef}
          value={input}
          placeholder="오늘 있었던 일, 떠오르는 마음, 뭐든…"
          rows={1}
          onChange={(e) => {
            setInput(e.target.value);
            autosize();
          }}
          onKeyDown={onKeyDown}
        />
        <button onClick={send} disabled={busy || !input.trim()}>
          보내기
        </button>
      </div>

      <div className="footnote">
        온은 AI예요. 전문 상담을 대체하지 않아요. 많이 힘들 땐 자살예방상담 109.
      </div>
    </div>
  );
}
