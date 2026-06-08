import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getDiary } from "@/lib/db";
import { DiaryCard } from "../diary-card";
import { DiaryActions } from "./diary-actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function DiaryDetailPage({ params }: Props) {
  const { id } = await params;
  const diaryId = Number(id);
  if (!Number.isFinite(diaryId)) notFound();

  const supabase = await getServerSupabase();
  if (!supabase) {
    return (
      <div className="diaries-shell">
        <div className="login-card">
          <h1>설정 안 됨</h1>
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
          <p className="dim"><Link href="/login">/login</Link></p>
        </div>
      </div>
    );
  }

  const diary = await getDiary(supabase, diaryId);
  if (!diary || diary.user_id !== user.id) notFound();

  return (
    <div className="diaries-shell">
      <header className="diaries-header">
        <div>
          <h1>{diary.date}</h1>
          <p className="dim">온이 남긴 일기.</p>
        </div>
        <Link href="/diaries" className="back-btn">← 목록</Link>
      </header>

      <DiaryCard diary={diary} showLink={false} />

      <DiaryActions
        diaryId={diary.id}
        initialDiaryText={diary.payload.diary ?? ""}
      />
    </div>
  );
}
