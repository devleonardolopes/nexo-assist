import { getApp } from "@nexo/api";

// O Elysia (apps/api) roda dentro do Next: mesmo domínio, cookie de sessão sem CORS.
export const dynamic = "force-dynamic";
// Respostas do agent são transmitidas por SSE; deixa a função viver o suficiente na Vercel.
export const maxDuration = 60;

const handle = (request: Request) => getApp().handle(request);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
