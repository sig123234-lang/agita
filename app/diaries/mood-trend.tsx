// 최근 일기 mood score 추이 — 인라인 SVG.

import type { DiaryCardData } from "./diary-card";

const COLORS = ["#5a3232", "#7a4636", "#85694a", "#9aa362", "#a2c47b"]; // 1→5

export function MoodTrend({ diaries }: { diaries: DiaryCardData[] }) {
  // 최근 30개를 옛것→새것 순으로
  const recent = [...diaries].slice(0, 30).reverse();
  if (recent.length === 0) return null;

  const W = 600;
  const H = 80;
  const PAD = 6;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;
  const stepX = recent.length > 1 ? innerW / (recent.length - 1) : 0;

  const pts = recent.map((d, i) => {
    const score = Math.max(1, Math.min(5, d.payload.mood?.score ?? 3));
    const x = PAD + i * stepX;
    const y = PAD + innerH * (1 - (score - 1) / 4);
    return { x, y, score };
  });

  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="mood-trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="기분 추이">
        <path d={path} fill="none" stroke="rgba(217,160,102,0.35)" strokeWidth="1.5" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={COLORS[p.score - 1] ?? "#85694a"} />
        ))}
      </svg>
      <div className="mood-trend-caption">
        최근 {recent.length}개 일기의 기분 — 위쪽일수록 좋음
      </div>
    </div>
  );
}
