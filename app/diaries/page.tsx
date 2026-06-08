import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { listDiaries } from "@/lib/db";
import { DiaryCard } from "./diary-card";
import { MoodTrend } from "./mood-trend";

export const dynamic = "force-dynamic";

export default async function DiariesPage() {
  const supabase = await getServerSupabase();
  if (!supabase) {
    return (
      <div className="diaries-shell">
        <div className="login-card">
          <h1>설정 안 됨</h1>
          <p className="dim">Supabase 환경변수가 없어요.</p>
        </div>
      </div>
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="diaries-shell">
        <div className="login-card">
          <h1>로그인 필요</h1>
          <p className="dim"><Link href="/login">/login</Link>으로 이동.</p>
        </div>
      </div>
    );
  }

  const diaries = await listDiaries(supabase, user.id, 90);

  return (
    <div className="diaries-shell">
      <header className="diaries-header">
        <div>
          <h1>지난 날들</h1>
          <p className="dim">agita와 나눈 이야기들의 기록.</p>
        </div>
        <Link href="/" className="back-btn">← 돌아가기</Link>
      </header>

      {diaries.length === 0 ? (
        <div className="empty-state">
          <p>아직 일기가 없어요.</p>
          <p className="dim">대화 후 "마무리"를 누르면 agita가 일기를 남겨줘요.</p>
        </div>
      ) : (
        <>
          {diaries.length >= 2 && <MoodTrend diaries={diaries} />}
          <div className="diaries-list">
            {diaries.map((d) => (
              <DiaryCard key={d.id} diary={d} compact />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
