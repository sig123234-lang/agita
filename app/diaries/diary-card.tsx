// 일기 카드 — 리스트·상세·채팅 모달 공통. 순수 렌더.

import Link from "next/link";
import type { LastDiary } from "@/lib/prompts";

const MOOD_DOT = ["", "🌑", "🌘", "🌗", "🌖", "🌕"]; // 1=힘듦 ~ 5=좋음

type Section = { key: keyof LastDiary; label: string };
const SECTIONS: Section[] = [
  { key: "did_today", label: "한 일" },
  { key: "hardships", label: "힘들었던 거" },
  { key: "highlights", label: "좋았던 순간" },
  { key: "tomorrow", label: "내일" },
  { key: "plans", label: "계획" },
  { key: "regrets", label: "후회" },
  { key: "longing", label: "보고 싶은" },
  { key: "memorable_quotes", label: "기억에 남는 말" },
  { key: "followups", label: "다음에 이어 물어볼 것" },
];

export type DiaryCardData = {
  id: string | number;
  date: string;
  payload: LastDiary;
  safety_flag: boolean;
};

export function DiaryCard({
  diary,
  showLink = true,
  compact = false,
}: {
  diary: DiaryCardData;
  showLink?: boolean;
  compact?: boolean;
}) {
  const p = diary.payload;
  const moodLabel = p.mood?.label ?? "";
  const moodScore = Math.max(1, Math.min(5, p.mood?.score ?? 3));
  const moodIcon = MOOD_DOT[moodScore] ?? "🌗";

  return (
    <article className={`diary-card${compact ? " compact" : ""}`}>
      <header className="diary-head">
        <div>
          <div className="diary-date">{diary.date}</div>
          {moodLabel && (
            <div className="diary-mood">
              <span aria-hidden>{moodIcon}</span>
              <span>{moodLabel}</span>
            </div>
          )}
        </div>
        {showLink && (
          <Link href={`/diaries/${diary.id}`} className="diary-open">
            펼쳐 보기 →
          </Link>
        )}
      </header>

      {p.diary && <p className="diary-body">{p.diary}</p>}

      {!compact && (
        <div className="diary-sections">
          {SECTIONS.map(({ key, label }) => {
            const items = (p[key] as string[] | undefined) ?? [];
            if (!Array.isArray(items) || items.length === 0) return null;
            return (
              <section key={key} className="diary-section">
                <h3>{label}</h3>
                <ul>
                  {items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {diary.safety_flag && (
        <div className="diary-safety">
          마음이 많이 힘들 땐 자살예방상담 109 / 정신건강 위기상담 1577-0199.
        </div>
      )}
    </article>
  );
}
