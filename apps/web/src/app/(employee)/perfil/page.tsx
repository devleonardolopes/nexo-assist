"use client";

import { KeyRound, Loader2, Lock, Mail, RotateCcwKey } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmployeeShell } from "@/components/employee-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useMe } from "@/lib/use-me";

const CARD = "overflow-hidden rounded-2xl border border-[#1B243117] bg-paper shadow-card";

export default function ProfilePage() {
  const user = useMe("employee");
  const [days, setDays] = useState<number | null | undefined>(undefined);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api
      .profile()
      .then((p) => setDays(p.passwordChangedDaysAgo))
      .catch(() => setDays(null));
  }, []);

  async function reset() {
    setSending(true);
    try {
      const r = await api.resetPassword();
      toast.success(`Link de redefinição enviado para ${r.sentTo}.`);
    } catch {
      toast.error("Não foi possível enviar o link agora. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  return (
    <EmployeeShell user={user} crumb="Meu perfil">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[600px] flex-col gap-8 px-4 py-8 sm:px-10 sm:py-12">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-[-0.4px] text-ink">Meu perfil</h1>
            <p className="text-[14.5px] text-ink-3">Seus dados de acesso ao service desk de TI.</p>
          </div>

          <section className={CARD} aria-label="Dados">
            <div className="flex flex-col gap-1 border-b border-rule px-6 py-5 sm:flex-row sm:items-center sm:gap-4">
              <span className="text-[13.5px] text-ink-3 sm:w-40">Nome</span>
              {user ? <span className="text-[14.5px] font-medium text-ink">{user.name}</span> : <Skeleton className="h-5 w-40" />}
            </div>
            <div className="flex flex-col gap-1 px-6 py-5 sm:flex-row sm:items-center sm:gap-4">
              <span className="text-[13.5px] text-ink-3 sm:w-40">E-mail corporativo</span>
              <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                {user ? <span className="text-[14.5px] font-medium text-ink">{user.email}</span> : <Skeleton className="h-5 w-52" />}
                <span className="flex items-center gap-[5px] text-[12.5px] text-ink-3">
                  <Lock className="size-[13px]" />
                  Gerenciado pela TI
                </span>
              </div>
            </div>
          </section>

          <section className={CARD} aria-label="Senha">
            <div className="flex flex-wrap items-center gap-4 p-6">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-desk">
                <KeyRound className="size-[18px] text-ink-2" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold text-ink">Senha</p>
                <div className="text-[13.5px] text-ink-3">
                  {days === undefined ? <Skeleton className="mt-1 h-4 w-32" /> : days === null ? "Data da última alteração indisponível" : `Alterada há ${days} dias`}
                </div>
              </div>
              <button
                onClick={reset}
                disabled={sending}
                className="flex h-9 items-center gap-[7px] rounded-lg border border-[#1B24311F] bg-paper pl-3 pr-3.5 text-[13.5px] font-medium text-ink-2 shadow-input transition-colors enabled:hover:bg-desk disabled:opacity-60"
              >
                {sending ? <Loader2 className="size-[15px] animate-spin" /> : <RotateCcwKey className="size-[15px]" />}
                Redefinir senha
              </button>
            </div>
            <div className="flex items-center gap-2 border-t border-rule bg-desk px-6 py-3">
              <Mail className="size-3.5 shrink-0 text-ink-3" />
              <p className="text-[13px] text-ink-3">Enviaremos um link de redefinição para {user?.email ?? "seu e-mail corporativo"}.</p>
            </div>
          </section>
        </div>
      </div>
    </EmployeeShell>
  );
}
