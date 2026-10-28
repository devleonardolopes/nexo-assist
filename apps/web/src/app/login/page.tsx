import { LoginForm } from "@/components/login-form";
import { NexoMark } from "@/components/nexo-mark";

export const metadata = { title: "Entrar · Nexo Assist" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh bg-paper">
      <Showcase />
      <section className="flex min-h-dvh flex-1 flex-col justify-between px-5 py-8 sm:px-14 sm:py-10">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2.5 lg:hidden">
            <NexoMark size={22} />
            <span className="text-[17px] font-bold tracking-[-0.2px] text-ink">Nexo Assist</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[13.5px]">
            <span className="hidden text-ink-3 sm:inline">Problema para entrar?</span>
            <span className="font-semibold text-primary-text">Ligue no ramal 4000</span>
          </div>
        </div>

        <div className="flex justify-center py-10">
          <div className="w-full max-w-[380px]">
            <div className="mb-7 space-y-2">
              <h1 className="font-display text-[40px] leading-[1.1] tracking-[-0.8px] text-ink">Entrar</h1>
              <p className="text-[15.5px] leading-normal text-ink-3">Use seu e-mail corporativo e a senha da rede Nexo.</p>
            </div>
            <LoginForm />
          </div>
        </div>

        <div className="flex items-center justify-between text-[12.5px] text-ink-3">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </div>
      </section>
    </main>
  );
}

function Showcase() {
  return (
    <aside className="hidden w-[800px] max-w-[55%] shrink-0 flex-col justify-between bg-ink px-16 pb-12 pt-10 text-white lg:flex">
      <div className="flex items-center gap-2.5">
        <NexoMark size={24} color="#FFFFFF" />
        <span className="text-[17px] font-bold tracking-[-0.2px]">Nexo Assist</span>
      </div>

      <div className="flex flex-col gap-9">
        <div className="flex flex-col gap-[18px]">
          <p className="text-[13.5px] font-medium text-white/55">Service desk de TI da Nexo</p>
          <h2 className="font-display text-[54px] leading-[1.04] tracking-[-1.2px]">Seu problema de TI, resolvido em uma conversa.</h2>
          <p className="max-w-[520px] text-base leading-[1.55] text-white/65">
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa.
          </p>
        </div>

        <div className="pl-24">
          <div className="flex w-[500px] flex-col gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-[18px]">
            <div className="flex justify-end">
              <div className="rounded-[12px_12px_4px_12px] bg-paper px-3.5 py-[9px] text-[13.5px] text-ink">Meu notebook não conecta na VPN. Erro 809.</div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-[12.5px]">
                <span className="font-semibold text-white/80">Nexo Assist</span>
                <span className="text-white/45">consultou seus chamados · criou um chamado</span>
              </div>
              <div className="w-[380px] rounded-[4px_12px_12px_12px] bg-white/[0.08] px-3.5 py-2.5 text-[13.5px] leading-normal text-white">
                Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
              </div>
              <div className="flex w-fit items-center gap-2 rounded-xl bg-paper px-3 py-[7px] text-[12.5px]">
                <span className="size-[7px] rounded-full bg-warning" />
                <span className="font-semibold text-ink">INC-20517</span>
                <span className="text-ink-3">Rede e VPN · Alta · em até 4 h</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <dl className="flex border-t border-white/10 pt-6">
        <Stat value="8 s" label="primeira resposta, em média" />
        <Stat value="72%" label="resolvidos sem fila" divider />
        <Stat value="6" label="analistas online agora" divider live />
      </dl>
    </aside>
  );
}

function Stat({ value, label, divider, live }: { value: string; label: string; divider?: boolean; live?: boolean }) {
  return (
    <div className={`flex flex-1 flex-col gap-1.5 ${divider ? "border-l border-white/10 pl-6" : ""}`}>
      <dd className="flex items-center gap-2 font-display text-[34px] tracking-[-0.6px]">
        {value}
        {live && <span className="size-2 rounded-full bg-success" />}
      </dd>
      <dt className="text-[13.5px] text-white/55">{label}</dt>
    </div>
  );
}
