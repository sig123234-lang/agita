-- 온 (ON) — M1 Postgres 스키마 + RLS
-- spec § 5 데이터 모델을 텍스트 알파에 맞게 변형:
--   calls(통화) → sessions(대화 세션)
--   duration_sec → message_count
-- diaries·profiles는 payload(JSONB)로 유연하게 보관.
--
-- Supabase SQL Editor에 통째로 붙여넣어 1회 실행. 멱등하게 작성.

-- ─── companions ─────────────────────────────────────────────────────────
create table if not exists public.companions (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '온',
  voice_id    text,
  intensity   text not null default '다정' check (intensity in ('담백', '다정', '설렘')),
  updated_at  timestamptz not null default now()
);

-- ─── sessions ───────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  message_count   int not null default 0
);
create index if not exists idx_sessions_user_started
  on public.sessions(user_id, started_at desc);

-- ─── messages ───────────────────────────────────────────────────────────
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

-- ─── diaries (CP3) ──────────────────────────────────────────────────────
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

-- ─── profiles (장기 프로필 — CP3 이후) ─────────────────────────────────
create table if not exists public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ─── usage (CP6 사용량 캡) ──────────────────────────────────────────────
create table if not exists public.usage (
  user_id        uuid not null references auth.users(id) on delete cascade,
  month          text not null,
  message_count  int not null default 0,
  plan           text not null default 'free',
  primary key (user_id, month)
);

-- ─── feedback (CP5) ─────────────────────────────────────────────────────
create table if not exists public.feedback (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  uuid references public.sessions(id) on delete set null,
  rating      int check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);


-- ═══════════════════════════════════════════════════════════════════════
-- RLS — 모든 테이블은 *오직 본인 데이터만* 접근 가능
-- ═══════════════════════════════════════════════════════════════════════

alter table public.companions enable row level security;
alter table public.sessions   enable row level security;
alter table public.messages   enable row level security;
alter table public.diaries    enable row level security;
alter table public.profiles   enable row level security;
alter table public.usage      enable row level security;
alter table public.feedback   enable row level security;

-- 동일 패턴 — auth.uid()가 user_id면 OK
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'companions','sessions','messages','diaries','profiles','usage','feedback'
  ]) loop
    execute format('drop policy if exists "own row select" on public.%I', t);
    execute format('drop policy if exists "own row insert" on public.%I', t);
    execute format('drop policy if exists "own row update" on public.%I', t);
    execute format('drop policy if exists "own row delete" on public.%I', t);

    execute format(
      'create policy "own row select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy "own row insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "own row update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "own row delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;


-- ═══════════════════════════════════════════════════════════════════════
-- 새 사용자 가입 시 자동으로 companions 행 생성 (기본값으로)
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.companions (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
