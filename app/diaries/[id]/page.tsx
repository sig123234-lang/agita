"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  deleteLocalDiary,
  getLocalDiary,
  updateLocalDiaryText,
  type StoredDiary,
} from "@/lib/local-store";
import { DiaryCard } from "../diary-card";

export default function DiaryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? "";

  const [diary, setDiary] = useState<StoredDiary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"idle" | "editing">("idle");
  const [text, setText] = useState("");

  useEffect(() => {
    const d = getLocalDiary(id);
    setDiary(d);
    setText(d?.payload.diary ?? "");
    setLoaded(true);
  }, [id]);

  if (loaded && !diary) notFound();
  if (!diary) return null;

  function save() {
    const updated = updateLocalDiaryText(id, text);
    if (updated) {
      setDiary(updated);
      setMode("idle");
    }
  }

  function remove() {
    if (!confirm("이 일기를 삭제할까요? 되돌릴 수 없어요.")) return;
    deleteLocalDiary(id);
    router.push("/diaries");
  }

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

      {mode === "editing" ? (
        <div className="diary-edit">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
          />
          <div className="diary-edit-actions">
            <button onClick={() => { setText(diary.payload.diary ?? ""); setMode("idle"); }} className="btn-ghost">
              취소
            </button>
            <button onClick={save} className="btn-primary">저장</button>
          </div>
        </div>
      ) : (
        <div className="diary-actions">
          <button onClick={() => setMode("editing")} className="btn-ghost">본문 수정</button>
          <button onClick={remove} className="btn-danger">삭제</button>
        </div>
      )}
    </div>
  );
}
