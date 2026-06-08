// 현재는 인증 없음 — 모든 요청 통과.
// CP-auth (NextAuth + RDS) 붙일 때 lib/supabase/middleware.ts 패턴 부활.

export function middleware() {
  // no-op
}

export const config = {
  matcher: [],
};
