import { getServerSupabase } from "@/lib/supabase/server";
import { getCompanion } from "@/lib/db";
import ChatClient from "./chat-client";

export default async function Home() {
  // 미들웨어가 미인증을 /login으로 보내지만, Supabase env 없을 땐 미들웨어가
  // 통과시키므로 여기서도 한 번 더 체크해 가드.
  const supabase = await getServerSupabase();

  // env 없으면: 인증 없이 기본값으로 데모. 알파 개발 편의.
  if (!supabase) {
    return <ChatClient aiName="온" intensity="다정" email={null} />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // 미들웨어가 처리하지만 폴백: 정적으로 안내
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
      aiName={companion?.name ?? "온"}
      intensity={companion?.intensity ?? "다정"}
      email={user.email ?? null}
    />
  );
}
