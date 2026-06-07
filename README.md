# 온 (ON) — AI 동반자

매일 밤, 사용자가 하루를 털어놓는 AI 동반자.
끝까지 듣고, 기억하고, 일기로 남겨준다.

> 상세 설계: `companion_master_spec.md` (외부 문서)
> 알파 빌드 브리프: 텍스트 우선, 음성·결제·070·카카오톡은 M2.

## 현재 단계: M1 텍스트 알파

| # | 체크포인트 | 상태 |
|---|---|---|
| 1 | Next.js + 페르소나 + 로컬 채팅 | ✅ |
| 2 | Supabase Auth + Postgres | ✅ |
| 3 | 일기 생성 + 캘린더 뷰 | ⏳ |
| 4 | 안전 레이어 (위기 탐지 + 자원 + 슬랙) | ⏳ |
| 5 | 온보딩·연령 게이트·설정·삭제권·피드백 | ⏳ |
| 6 | Vercel 배포 + 사용 캡 + 모니터링 | ⏳ |

## 스택 (M1)

```
Next.js 15 (Vercel)
 ├─ UI:    app/page.tsx (RSC) → app/chat-client.tsx (interactive)
 │         app/login/page.tsx (Google/Kakao OAuth + 매직 링크)
 ├─ API:   app/api/chat/route.ts (Claude Sonnet 4.6 스트리밍 + 영속화)
 ├─ Auth:  Supabase (lib/supabase/{server,client,middleware}.ts)
 │         middleware.ts: 보호 라우트 자동 리디렉트
 ├─ DB:    Supabase Postgres (companions, sessions, messages, diaries, profiles, ...)
 │         RLS로 사용자 데이터 격리 (supabase/schema.sql)
 └─ 프롬프트: lib/prompts.ts (companion_master_spec § 3)
```

## 셋업

```bash
# 1) Supabase 프로젝트 만들고 스키마 적용 (supabase/README.md 참고)
# 2) 환경변수 채우기
cp .env.local.example .env.local
#    ANTHROPIC_API_KEY
#    NEXT_PUBLIC_SUPABASE_URL
#    NEXT_PUBLIC_SUPABASE_ANON_KEY

npm install
npm run dev
# http://localhost:3000 → /login으로 자동 이동 → 가입 → 대화
```

Supabase env가 없으면 데모 모드로 동작 (인증/영속화 없이 채팅만). 알파 개발 편의.

## 디렉토리

```
agita/
├── app/
│   ├── page.tsx              # RSC: auth check → ChatClient
│   ├── chat-client.tsx       # 인터랙티브 채팅 (스트리밍·TTS·세션관리)
│   ├── layout.tsx
│   ├── globals.css
│   ├── login/page.tsx        # 로그인 (Google + Kakao + 매직 링크)
│   ├── auth/callback/route.ts # OAuth/매직 링크 콜백
│   └── api/chat/route.ts     # Claude 스트리밍 + 영속화
├── lib/
│   ├── prompts.ts            # 페르소나 프롬프트 팩
│   ├── db.ts                 # DB CRUD 헬퍼
│   └── supabase/
│       ├── env.ts
│       ├── server.ts
│       ├── client.ts
│       └── middleware.ts
├── middleware.ts             # 인증 미들웨어 (보호 라우트 → /login)
├── supabase/
│   ├── schema.sql            # 스키마 + RLS + 자동 트리거
│   └── README.md             # 셋업 가이드
└── m2_voice/                 # 🔒 M2 음성 프로토타입 (격리, 알파엔 미사용)
```

## M2 (보류)

- 음성 통화 (STT/TTS/Pipecat/Daily/감정신호)
- "온" 전용 보이스 (성우 클로닝)
- 결제/요금제 (토스페이먼츠/포트원)
- 실제 070 1인 1번호
- 카카오톡 채널 챗봇
- 먼저 전화 걸기 / 가끔 거절 (행동 레이어)
