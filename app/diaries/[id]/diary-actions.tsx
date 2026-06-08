"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DiaryActions({
  diaryId,
  initialDiaryText,
}: {
  diaryId: number;
  initialDiaryText: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "editing" | "saving" | "deleting">("idle");
  const [text, setText] = useState(initialDiaryText);
  const [err, setErr] = useState<string>("");

  async function save() {
    setErr("");
    setMode("saving");
    const res = await fetch(`/api/diary/${diaryId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ diary: text }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "수정에 실패했어요.");
      setMode("editing");
      return;
    }
    setMode("idle");
    router.refresh();
  }

  async function remove() {
    if (!confirm("이 일기를 삭제할까요? 되돌릴 수 없어요.")) return;
    setMode("deleting");
    const res = await fetch(`/api/diary/${diaryId}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "삭제에 실패했어요.");
      setMode("idle");
      return;
    }
    router.push("/diaries");
    router.refresh();
  }

  if (mode === "editing" || mode === "saving") {
    return (
      <div className="diary-edit">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          disabled={mode === "saving"}
        />
        {err && <p className="err">{err}</p>}
        <div className="diary-edit-actions">
          <button onClick={() => setMode("idle")} disabled={mode === "saving"} className="btn-ghost">
            취소
          </button>
          <button onClick={save} disabled={mode === "saving"} className="btn-primary">
            {mode === "saving" ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="diary-actions">
      {err && <p className="err">{err}</p>}
      <button onClick={() => setMode("editing")} className="btn-ghost">본문 수정</button>
      <button onClick={remove} disabled={mode === "deleting"} className="btn-danger">
        {mode === "deleting" ? "삭제 중…" : "삭제"}
      </button>
    </div>
  );
}
