"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listLocalDiaries, type StoredDiary } from "@/lib/local-store";
import { DiaryCard } from "./diary-card";
import { MoodTrend } from "./mood-trend";

export default function DiariesPage() {
  const [diaries, setDiaries] = useState<StoredDiary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setDiaries(listLocalDiaries());
    setLoaded(true);
  }, []);

  return (
    <div className="diaries-shell">
      <header className="diaries-header">
        <div>
          <h1>지난 날들</h1>
          <p className="dim">온과 나눈 이야기들의 기록.</p>
        </div>
        <Link href="/" className="back-btn">← 돌아가기</Link>
      </header>

      {!loaded ? null : diaries.length === 0 ? (
        <div className="empty-state">
          <p>아직 일기가 없어요.</p>
          <p className="dim">대화 후 "마무리"를 누르면 온이 일기를 남겨줘요.</p>
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
