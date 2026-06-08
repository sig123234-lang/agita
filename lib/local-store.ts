// 일기 영속화 — 브라우저 localStorage.
// 알파 단계용. auth + DB 붙이면 lib/db.ts로 이전 (구조 동일).

"use client";

import type { LastDiary } from "./prompts";

const KEY = "agita_diaries_v1";

export type StoredDiary = {
  id: string;
  date: string;
  payload: LastDiary;
  safety_flag: boolean;
  created_at: string; // ISO
};

function readAll(): StoredDiary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as StoredDiary[]) : [];
  } catch {
    return [];
  }
}

function writeAll(arr: StoredDiary[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(arr));
}

export function listLocalDiaries(): StoredDiary[] {
  return readAll().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getLocalDiary(id: string): StoredDiary | null {
  return readAll().find((d) => d.id === id) ?? null;
}

export function getLastLocalDiary(): LastDiary | null {
  return listLocalDiaries()[0]?.payload ?? null;
}

export function saveLocalDiary(payload: LastDiary): StoredDiary {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stored: StoredDiary = {
    id,
    date: payload.date ?? new Date().toISOString().slice(0, 10),
    payload,
    safety_flag: !!payload.safety_flag,
    created_at: new Date().toISOString(),
  };
  const arr = readAll();
  arr.push(stored);
  writeAll(arr);
  return stored;
}

export function deleteLocalDiary(id: string): void {
  writeAll(readAll().filter((d) => d.id !== id));
}

export function updateLocalDiaryText(id: string, diary: string): StoredDiary | null {
  const arr = readAll();
  const idx = arr.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const next: StoredDiary = {
    ...arr[idx],
    payload: { ...arr[idx].payload, diary },
  };
  arr[idx] = next;
  writeAll(arr);
  return next;
}
