-- agita — M1 Postgres 스키마 + RLS
-- Supabase SQL Editor에 통째로 붙여넣어 1회 실행. 멱등하게 작성.

-- ─── companions ────────────────────────────────────────────────────────
create table if not exists public.companions (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  name        text not null default 'agita',
  voice_id    text,
  intensity   text not null default '다정' check (intensity in ('담백', '다정', '설렘')),
  updated_at  timestamptz not null default now()
);

-- ─── sessions ──────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  message_count   int not null default 0
);
create index if not exists idx_sessions_user_started
  on public.sessions(user_id, started_at desc);

-- ─── messages ──────────────────────────────────────────────────────────
create table if not exists public.messages (
  id          bigserial primary key,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_messages_session_created
  on public.messages(session_id, created_at);

-- ─── diaries ───────────────────────────────────────────────────────────
create table if not exists public.diaries (
  id            bigserial primary key,
  session_id    uuid references public.sessions(id) on delete set null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  payload       jsonb not null,
  safety_flag   boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_diaries_user_date
  on public.diaries(user_id, date desc);

-- ─── user_profiles (장기 프로필, 7일 주기 갱신용) ────────────────────
-- ⚠️ Supabase Auth 템플릿이 public.profiles를 미리 만들어둘 수 있어 충돌 회피
--    위해 user_profiles로 이름 분리.
create table if not exists public.user_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ─── usage ─────────────────────────────────────────────────────────────
create table if not exists public.usage (
  user_id        uuid not null references auth.users(id) on delete cascade,
  month          text not null,
  message_count  int not null default 0,
  plan           text not null default 'free',
  primary key (user_id, month)
);

-- ─── feedback ──────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  uuid references public.sessions(id) on delete set null,
  rating      int check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);

-- ═════════════════════════════════════════════════════════════════════════
-- RLS — 본인 데이터만 접근 (Supabase SQL Editor 호환을 위해 명시적 풀어쓰기)
-- ═════════════════════════════════════════════════════════════════════════

alter table public.companions    enable row level security;
alter table public.sessions      enable row level security;
alter table public.messages      enable row level security;
alter table public.diaries       enable row level security;
alter table public.user_profiles enable row level security;
alter table public.usage         enable row level security;
alter table public.feedback      enable row level security;

-- companions
drop policy if exists "own row select" on public.companions;
drop policy if exists "own row insert" on public.companions;
drop policy if exists "own row update" on public.companions;
drop policy if exists "own row delete" on public.companions;
create policy "own row select" on public.companions for select using (auth.uid() = user_id);
create policy "own row insert" on public.companions for insert with check (auth.uid() = user_id);
create policy "own row update" on public.companions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row delete" on public.companions for delete using (auth.uid() = user_id);

-- sessions
drop policy if exists "own row select" on public.sessions;
drop policy if exists "own row insert" on public.sessions;
drop policy if exists "own row update" on public.sessions;
drop policy if exists "own row delete" on public.sessions;
create policy "own row select" on public.sessions for select using (auth.uid() = user_id);
create policy "own row insert" on public.sessions for insert with check (auth.uid() = user_id);
create policy "own row update" on public.sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row delete" on public.sessions for delete using (auth.uid() = user_id);

-- messages
drop policy if exists "own row select" on public.messages;
drop policy if exists "own row insert" on public.messages;
drop policy if exists "own row update" on public.messages;
drop policy if exists "own row delete" on public.messages;
create policy "own row select" on public.messages for select using (auth.uid() = user_id);
create policy "own row insert" on public.messages for insert with check (auth.uid() = user_id);
create policy "own row update" on public.messages for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row delete" on public.messages for delete using (auth.uid() = user_id);

-- diaries
drop policy if exists "own row select" on public.diaries;
drop policy if exists "own row insert" on public.diaries;
drop policy if exists "own row update" on public.diaries;
drop policy if exists "own row delete" on public.diaries;
create policy "own row select" on public.diaries for select using (auth.uid() = user_id);
create policy "own row insert" on public.diaries for insert with check (auth.uid() = user_id);
create policy "own row update" on public.diaries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row delete" on public.diaries for delete using (auth.uid() = user_id);

-- user_profiles
drop policy if exists "own row select" on public.user_profiles;
drop policy if exists "own row insert" on public.user_profiles;
drop policy if exists "own row update" on public.user_profiles;
drop policy if exists "own row delete" on public.user_profiles;
create policy "own row select" on public.user_profiles for select using (auth.uid() = user_id);
create policy "own row insert" on public.user_profiles for insert with check (auth.uid() = user_id);
create policy "own row update" on public.user_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row delete" on public.user_profiles for delete using (auth.uid() = user_id);

-- usage
drop policy if exists "own row select" on public.usage;
drop policy if exists "own row insert" on public.usage;
drop policy if exists "own row update" on public.usage;
drop policy if exists "own row delete" on public.usage;
create policy "own row select" on public.usage for select using (auth.uid() = user_id);
create policy "own row insert" on public.usage for insert with check (auth.uid() = user_id);
create policy "own row update" on public.usage for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row delete" on public.usage for delete using (auth.uid() = user_id);

-- feedback
drop policy if exists "own row select" on public.feedback;
drop policy if exists "own row insert" on public.feedback;
drop policy if exists "own row update" on public.feedback;
drop policy if exists "own row delete" on public.feedback;
create policy "own row select" on public.feedback for select using (auth.uid() = user_id);
create policy "own row insert" on public.feedback for insert with check (auth.uid() = user_id);
create policy "own row update" on public.feedback for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row delete" on public.feedback for delete using (auth.uid() = user_id);

-- ═════════════════════════════════════════════════════════════════════════
-- 신규 사용자 가입 시 companions 행 자동 생성
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $func$
begin
  insert into public.companions (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$func$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
