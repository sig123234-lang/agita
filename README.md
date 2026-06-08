# 온 (ON) — AI 동반자

매일 밤, 사용자가 하루를 털어놓는 AI 동반자.
끝까지 듣고, 기억하고, 일기로 남겨준다.

> 상세 설계: `companion_master_spec.md` (외부 문서)
> 알파 빌드 브리프: 텍스트 우선, 음성·결제·070·카카오톡은 M2.

## 현재 단계: M1 텍스트 알파

| # | 체크포인트 | 상태 |
|---|---|---|
| 1 | Next.js + 페르소나 + 로컬 채팅 | ✅ |
| 2 | Auth (Supabase 코드 dormant — auth는 알파 후로 연기) | ⏸️ |
| 3 | 일기 생성 + 캘린더 (localStorage 영속화) | ✅ |
| 4 | 안전 레이어 (위기 탐지 + 자원 + 슬랙) | ⏳ |
| 5 | 온보딩·연령 게이트·설정·삭제권·피드백 | ⏳ |
| 6 | Vercel 배포 + 사용 캡 + 모니터링 | ⏳ |
| — | [보류] NextAuth + AWS RDS 연결 | ⏸️ |

알파 동안은 **로그인 없음 + 브라우저 localStorage에 일기 저장** — 인프라·계정 0,
한 기기 한 사용자, 데모는 URL만 던지면 됨. auth + DB는 알파 끝나고 NextAuth.js + AWS RDS로 한 번에 붙임.

## 스택 (M1 알파)

```
Next.js 15 (Vercel)
 ├─ UI:      app/page.tsx → app/chat-client.tsx (스트리밍·TTS·일기 모달)
 │           app/diaries/ (목록 + 상세 + 수정/삭제, mood trend)
 ├─ API:     app/api/chat/route.ts  — Claude Sonnet 4.6 스트리밍
 │           app/api/diary/route.ts — DIARY_PROMPT로 JSON 일기 생성
 ├─ 저장:    lib/local-store.ts — localStorage CRUD
 └─ 프롬프트: lib/prompts.ts (companion_master_spec § 3)
```

## 셋업

```bash
cp .env.local.example .env.local
# ANTHROPIC_API_KEY 채우기 (그것만 필요)

npm install
npm run dev
# http://localhost:3000
```

## 기능 확인

1. 채팅으로 온이랑 대화 (2~4문장, 추임새, 질문 하나씩 — 페르소나 그대로)
2. 2턴 이상 되면 화면 하단에 "오늘 마무리하기" 버튼
3. 누르면 온이 일기 생성 → 모달로 보여줌 → localStorage 저장
4. 다음 대화 시작하면 온이 어제 일기 followup 챙김 ("발표 어떻게 됐어?")
5. 헤더 "📔 지난 일기" → 목록·mood trend·상세 보기·수정/삭제

## 디렉토리

```
agita/
├── app/
│   ├── page.tsx / chat-client.tsx   # 채팅
│   ├── diaries/                      # 일기 목록·상세
│   ├── api/chat/route.ts             # Claude 스트리밍
│   └── api/diary/route.ts            # 일기 생성
├── lib/
│   ├── prompts.ts                    # 페르소나 프롬프트 팩
│   ├── local-store.ts                # localStorage 어댑터
│   ├── supabase/  + db.ts            # 🔒 dormant (auth 단계에서 부활)
├── supabase/schema.sql               # 🔒 dormant (RDS에 그대로 적용 가능)
├── middleware.ts                     # no-op (auth 없음)
└── m2_voice/                         # 🔒 음성 프로토타입 (M2 자산)
```

## M2 (보류)

- 음성 통화 (STT/TTS/Pipecat/Daily/감정신호)
- "온" 전용 보이스 (성우 클로닝)
- 결제/요금제 (토스페이먼츠/포트원)
- 실제 070 1인 1번호
- 카카오톡 채널 챗봇
- 먼저 전화 걸기 / 가끔 거절 (행동 레이어)
