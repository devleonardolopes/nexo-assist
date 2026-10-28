import type {
  AnalystConversation,
  ChatState,
  ConversationFilter,
  ConversationListResponse,
  MessageDTO,
  SendMessageBody,
  SessionUser,
  StreamEvent,
} from "@nexo/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
      location.href = "/login";
    }
    throw new ApiError(res.status, (data as { error?: string }).error ?? "Algo deu errado. Tente novamente.");
  }
  return data as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  login: (email: string, password: string) => post<{ user: SessionUser }>("/auth/login", { email, password }),
  logout: () => post<{ ok: true }>("/auth/logout"),
  me: () => request<{ user: SessionUser }>("/auth/me"),
  profile: () => request<{ user: SessionUser; passwordChangedDaysAgo: number | null }>("/me/profile"),
  resetPassword: () => post<{ ok: true; sentTo: string }>("/me/password-reset"),

  chat: () => request<ChatState>("/chat"),
  confirmDraft: (id: string) => post<{ events: StreamEvent[] }>(`/chat/drafts/${id}/confirm`),
  cancelDraft: (id: string) => post<{ events: StreamEvent[] }>(`/chat/drafts/${id}/cancel`),

  analyst: {
    list: (filter: ConversationFilter, q: string) =>
      request<ConversationListResponse>(`/analyst/conversations?filter=${filter}&q=${encodeURIComponent(q)}`),
    detail: (id: string) => request<AnalystConversation>(`/analyst/conversations/${id}`),
    claim: (id: string) => post<{ ok: true }>(`/analyst/conversations/${id}/claim`),
    release: (id: string) => post<{ ok: true }>(`/analyst/conversations/${id}/release`),
    close: (id: string) => post<{ ok: true }>(`/analyst/conversations/${id}/close`),
    send: (id: string, text: string) => post<{ message: MessageDTO }>(`/analyst/conversations/${id}/messages`, { text }),
  },
};

/** Lê o stream SSE de /chat/messages e entrega cada evento à medida que chega. */
export async function streamMessage(body: SendMessageBody, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  const res = await fetch("/api/chat/messages", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    if (res.status === 401) location.href = "/login";
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (data as { error?: string }).error ?? "Não foi possível enviar a mensagem.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)) as StreamEvent);
    }
  }
}
