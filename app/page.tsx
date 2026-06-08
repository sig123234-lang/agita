import { getServerSupabase } from "@/lib/supabase/server";
import { getCompanion } from "@/lib/db";
import ChatClient from "./chat-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await getServerSupabase();

  // env 없으면: 데모 모드 (개발 편의). 미들웨어가 보호 라우트 통과시킴.
  if (!supabase) {
    return <ChatClient aiName="agita" intensity="다정" email={null} />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // 미들웨어가 /login으로 보내지만 폴백
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>로그인 필요</h1>
          <p className="dim">/login 으로 이동해주세요.</p>
        </div>
      </div>
    );
  }

  const companion = await getCompanion(supabase, user.id);

  return (
    <ChatClient
      aiName={companion?.name ?? "agita"}
      intensity={companion?.intensity ?? "다정"}
      email={user.email ?? null}
    />
  );
}
