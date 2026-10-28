"use client";

import type { Role, SessionUser } from "@nexo/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Carrega o usuário da sessão e leva cada papel para a sua área (funcionário em /chat, analista em /atendente). */
export function useMe(expected: Role) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .me()
      .then(({ user }) => {
        if (!alive) return;
        if (user.role !== expected) router.replace(user.role === "analyst" ? "/atendente" : "/chat");
        else setUser(user);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [expected, router]);
  return user;
}
