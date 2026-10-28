"use client";

import { ArrowRight, Check, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("ana.souza@nexo.com.br");
  const [password, setPassword] = useState("senha-da-rede");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user } = await api.login(email, password);
      router.replace(user.role === "analyst" ? "/atendente" : "/chat");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar agora. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-7" noValidate>
      <div className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="text-[13.5px] font-medium text-ink">
            E-mail corporativo
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome.sobrenome@nexo.com.br"
              className="h-11 rounded-lg border-input bg-paper pl-10 text-[14.5px] shadow-input"
              aria-invalid={Boolean(error)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-[13.5px] font-medium text-ink">
              Senha
            </Label>
            <button type="button" className="text-[13.5px] font-medium text-primary-text hover:underline">
              Esqueci minha senha
            </button>
          </div>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-primary-text" />
            <Input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-lg border-[1.5px] border-cta bg-paper pl-10 pr-11 text-[14.5px] focus-visible:ring-0"
              aria-invalid={Boolean(error)}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-2 top-1/2 flex size-[30px] -translate-y-1/2 items-center justify-center rounded-md text-ink-3 hover:bg-desk"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-[9px] pt-0.5 text-[13.5px] text-ink-2">
          <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} className="size-[18px] rounded-md data-checked:border-cta data-checked:bg-cta">
            <Check className="size-3" />
          </Checkbox>
          Manter conectado neste computador
        </label>
      </div>

      {error && (
        <p role="alert" className="-mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[13.5px] text-danger-text">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={loading || !email || !password}
        className={cn("h-11 gap-2 rounded-lg bg-cta text-[15.5px] font-semibold text-white shadow-[0_1px_2px_#0062C433,0_6px_16px_#0062C426] hover:bg-cta-hover")}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Entrando…
          </>
        ) : (
          <>
            Entrar <ArrowRight className="size-4" />
          </>
        )}
      </Button>
    </form>
  );
}
