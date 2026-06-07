// 미들웨어용 헬퍼: 모든 요청에서 Supabase 쿠키(세션) 갱신.
// 로그인 안 된 상태로 보호 라우트 접근하면 /login으로 리디렉트.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

const PROTECTED_PREFIXES = ["/", "/api/chat"];
const PUBLIC_PATHS = new Set([
  "/login",
  "/auth/callback",
]);

function isProtected(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return false;
  if (pathname.startsWith("/_next")) return false;
  if (pathname.startsWith("/favicon")) return false;
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p === "/" ? "" : p + "/"),
  );
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const env = getSupabaseEnv();

  // Supabase env 없으면 인증 무시하고 통과 (개발 편의)
  if (!env) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 미인증 + 보호 라우트면 로그인으로
  if (!user && isProtected(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // 인증됐는데 /login 들어왔으면 홈으로
  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
