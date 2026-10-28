import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "nexo_session";

// Quem não tem sessão vai para o login; a autorização por papel é feita na API.
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(COOKIE);
  const { pathname } = request.nextUrl;
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/chat", "/perfil", "/atendente/:path*"],
};
