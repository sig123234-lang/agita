# agita — AI 동반자

매일 밤, 사용자가 하루를 털어놓는 AI 동반자.
끝까지 듣고, 기억하고, 일기로 남겨준다.

> 상세 설계: `companion_master_spec.md` (외부 문서)
> 알파 빌드: 텍스트 우선, 음성·결제·070·카카오톡은 M2.

## 현재 단계: M1 텍스트 알파

| # | 체크포인트 | 상태 |
|---|---|---|
| 1 | Next.js + 페르소나 + 로컬 채팅 | ✅ |
| 2 | Supabase Auth + Postgres | ✅ |
| 3 | 일기 생성 + 캘린더 + DB 영속화 | ✅ |
| 4 | 안전 레이어 (위기 탐지 + 자원 + 슬랙) | ⏳ |
| 5 | 온보딩·연령 게이트·설정·삭제권·피드백 | ⏳ |
| 6 | Vercel 배포 + 사용 캡 + 모니터링 | ⏳ |

## 스택

```
Next.js 15 (Vercel)
 ├─ UI:    app/page.tsx (RSC) → app/chat-client.tsx
 │         app/diaries/ (RSC: 목록·상세) + diary-actions.tsx (편집·삭제)
 │         app/login/page.tsx (Google + Kakao + 매직 링크)
 ├─ API:   /api/chat   — Claude Sonnet 4.6 스트리밍 + 메시지 영속화
 │         /api/diary  — 세션 종료 + 일기 생성 + DB 저장 (멱등)
 │         /api/diary/[id] — DELETE / PATCH
 ├─ Auth:  Supabase (lib/supabase/{server,client,middleware}.ts)
 │         middleware.ts: 보호 라우트 자동 리디렉트
 └─ DB:    Supabase Postgres + RLS (supabase/schema.sql)
           companions / sessions / messages / diaries / profiles / usage / feedback
           기억 주입: 매 채팅마다 lastDiary + profile을 서버가 DB에서 로드
```

## 셋업

```bash
# 1) Supabase 프로젝트 만들고 스키마 적용 — supabase/README.md 참고
# 2) 환경변수 채우기
cp .env.local.example .env.local
#    ANTHROPIC_API_KEY
#    NEXT_PUBLIC_SUPABASE_URL
#    NEXT_PUBLIC_SUPABASE_ANON_KEY

npm install
npm run dev
# http://localhost:3000 → /login → 가입 → 대화 → 마무리 → 일기
```

Supabase env 비어있으면 자동 데모 모드 (인증·영속화 없이 채팅만).

## 기능 확인 흐름

1. 로그인 → 채팅 ("안녕, 왔네. 오늘 하루 어땠어?")
2. 2턴 이상 되면 "오늘 마무리하기" 버튼 → 일기 생성 → 모달
3. "📔 지난 일기" → 목록 + mood trend + 상세 보기
4. 상세에서 본문 수정 / 일기 삭제
5. 다음 대화 시작하면 agita가 어제 일기 followup 자동 챙김 ("발표 어떻게 됐어?")

## 디렉토리

```
agita/
├── app/
│   ├── page.tsx / chat-client.tsx
│   ├── diaries/ (page · [id]/page · diary-card · mood-trend · diary-actions)
│   ├── login/page.tsx
│   ├── auth/callback/route.ts
│   └── api/ (chat · diary · diary/[id])
├── lib/
│   ├── prompts.ts      # 페르소나 프롬프트 팩 + buildSystemPrompt + safeParseDiaryJson
│   ├── db.ts           # Supabase CRUD 헬퍼
│   └── supabase/       # 클라이언트 3종 (server/client/middleware) + env 가드
├── middleware.ts       # 인증 미들웨어
├── supabase/
│   ├── schema.sql      # 스키마 + RLS + 신규 사용자 트리거
│   └── README.md       # 셋업 가이드
└── m2_voice/           # 🔒 음성 프로토타입 (M2 자산)
```

## M2 (보류)

- 음성 통화 (STT/TTS/Pipecat/Daily/감정신호)
- "agita" 전용 보이스 (성우 클로닝)
- 결제/요금제 (토스페이먼츠/포트원)
- 실제 070 1인 1번호
- 카카오톡 채널 챗봇
- 먼저 전화 걸기 / 가끔 거절
