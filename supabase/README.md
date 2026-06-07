# Supabase 셋업 (M1)

## 1. 프로젝트 만들기

1. https://supabase.com/dashboard → New project
2. 이름·비밀번호·리전 (Tokyo 추천 — 한국 사용자 지연 최소)
3. 생성 후 Settings → API 에서:
   - `Project URL` → `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. 스키마 적용

1. 좌측 메뉴 **SQL Editor** → New query
2. `supabase/schema.sql` 통째로 붙여넣기 → Run
3. Table Editor에 `companions / sessions / messages / diaries / profiles / usage / feedback` 7개 테이블 생기면 통과

## 3. Auth — Google OAuth (필수)

1. 좌측 메뉴 **Authentication** → Providers → Google → Enabled 토글
2. https://console.cloud.google.com/ → APIs & Services → Credentials → OAuth client ID
   - Type: Web application
   - Authorized redirect URIs: `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Client ID·Secret을 Supabase Google Provider 설정에 붙여넣기 → Save
4. Authentication → URL Configuration:
   - **Site URL**: `http://localhost:3000` (로컬 개발), 배포 후 프로덕션 URL 추가
   - **Redirect URLs**: `http://localhost:3000/auth/callback`, 프로덕션도 추가

## 4. Auth — Kakao (선택, 한국 사용자 위해 권장)

Supabase는 Kakao를 기본 제공 provider로 지원해요.
1. https://developers.kakao.com/ → 내 애플리케이션 → 추가
2. 카카오 로그인 활성화, Redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. REST API 키 + Client Secret 발급
4. Supabase → Authentication → Providers → Kakao → Enabled + 키 입력

Kakao 끄고 Google만으로도 알파 시작 가능.

## 5. 로컬 개발

```bash
cp .env.local.example .env.local
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 채우기
npm run dev
# http://localhost:3000 → 로그인 페이지로 자동 이동
```

## 검증

- 회원가입 후 Supabase Dashboard → `auth.users` 에 본인 row 보임
- 같은 트리거로 `public.companions` 에 본인 row 자동 생성됨 (`intensity = 다정`)
- 채팅 한 번 보내면 `public.sessions` 1행 + `public.messages` 2행(user + assistant) 생김

## RLS 확인

RLS가 켜져 있어서 다른 사람 데이터는 절대 안 보임.
SQL Editor에서 `select * from messages` 하면 *내(현재 로그인된)* 메시지만 나옴.
