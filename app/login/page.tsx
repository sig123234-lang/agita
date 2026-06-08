"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

function LoginInner() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "err">("idle");
  const [errMsg, setErrMsg] = useState<string>("");

  if (!isSupabaseConfigured()) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>설정 안 됨</h1>
          <p className="dim">
            Supabase 환경변수가 없어요.
            <br />
            <code>supabase/README.md</code> 보고 채워주세요.
          </p>
        </div>
      </div>
    );
  }

  async function signInGoogle() {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setStatus("sending");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setStatus("err");
      setErrMsg(error.message);
    }
  }

  async function signInKakao() {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setStatus("sending");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo },
    });
    if (error) {
      setStatus("err");
      setErrMsg(error.message);
    }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase || !email.trim()) return;
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setStatus("err");
      setErrMsg(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <h1>agita</h1>
        <p className="dim">매일 밤, 하루를 털어놓는 친구.</p>

        <button className="btn-oauth google" onClick={signInGoogle} disabled={status === "sending"}>
          Google로 계속하기
        </button>
        <button className="btn-oauth kakao" onClick={signInKakao} disabled={status === "sending"}>
          카카오로 계속하기
        </button>

        <div className="divider"><span>또는</span></div>

        <form onSubmit={sendMagicLink}>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className="btn-primary" disabled={status === "sending"}>
            매직 링크 받기
          </button>
        </form>

        {status === "sent" && (
          <p className="ok">메일함을 확인해주세요. 메일에 있는 링크 누르면 로그인 끝.</p>
        )}
        {status === "err" && <p className="err">{errMsg}</p>}

        <p className="footnote-login">
          agita는 AI예요. 전문 상담을 대체하지 않아요.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-shell" />}>
      <LoginInner />
    </Suspense>
  );
}
