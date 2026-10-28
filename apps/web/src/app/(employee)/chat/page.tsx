"use client";

import type { ConversationStatus } from "@nexo/shared";
import { useCallback, useState } from "react";
import { ChatView, StatusPill } from "@/components/chat/chat-view";
import { EmployeeShell } from "@/components/employee-shell";
import { useMe } from "@/lib/use-me";

export default function ChatPage() {
  const user = useMe("employee");
  const [status, setStatus] = useState<{ s: ConversationStatus; analyst: string | null }>({ s: "agent", analyst: null });
  const onStatus = useCallback((s: ConversationStatus, analyst: string | null) => setStatus((p) => (p.s === s && p.analyst === analyst ? p : { s, analyst })), []);
  return (
    <EmployeeShell user={user} crumb="Atendimento" right={<StatusPill status={status.s} analyst={status.analyst} />}>
      <ChatView user={user} onStatus={onStatus} />
    </EmployeeShell>
  );
}
