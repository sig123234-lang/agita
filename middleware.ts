import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Supabase auth는 Edge 런타임 비호환 → Node로 강제 (Next.js 15+ 지원).
export const config = {
  runtime: "nodejs",
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}
