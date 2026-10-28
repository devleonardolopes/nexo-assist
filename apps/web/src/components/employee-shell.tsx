"use client";

import { ChevronRight, LogOut, Menu, MessageSquare, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@nexo/shared";
import { NexoMark } from "@/components/nexo-mark";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/chat", label: "Atendimento", icon: MessageSquare },
  { href: "/perfil", label: "Meu perfil", icon: UserRound },
];

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((p, i, a) => (i === 0 || i === a.length - 1 ? p[0] : ""))
    .join("")
    .toUpperCase();

function SidebarContent({ user, onNavigate }: { user: SessionUser | null; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api.logout().catch(() => undefined);
    router.replace("/login");
  }

  return (
    <div className="flex h-full flex-col px-3.5 pb-3.5 pt-5">
      <div className="flex items-center gap-2.5 px-2">
        <NexoMark size={20} />
        <span className="text-base font-bold tracking-[-0.2px] text-ink">Nexo Assist</span>
      </div>
      <nav className="mt-[22px] flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px]",
                active ? "bg-primary-soft font-semibold text-primary-text" : "font-medium text-ink-2 hover:bg-desk",
              )}
            >
              <Icon className={cn("size-4", active ? "text-primary-text" : "text-ink-3")} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div className="flex items-center gap-2.5 border-t border-rule px-2 pb-1 pt-3.5">
        <Avatar className="size-[34px] bg-primary-soft">
          <AvatarFallback className="bg-primary-soft text-[12.5px] font-bold text-primary-text">{user ? initials(user.name) : ""}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-ink">{user?.name ?? " "}</p>
          <p className="truncate text-[11.5px] text-ink-3">{user?.email ?? " "}</p>
        </div>
      </div>
      <button onClick={logout} className="mt-1 flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-ink-2 hover:bg-desk">
        <LogOut className="size-4 text-ink-3" />
        Sair
      </button>
    </div>
  );
}

/** Estrutura das telas do funcionário: barra lateral (gaveta no mobile), barra superior e conteúdo. */
export function EmployeeShell({
  user,
  crumb,
  right,
  children,
}: {
  user: SessionUser | null;
  crumb: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-dvh bg-paper">
      <aside className="hidden w-[232px] shrink-0 border-r border-rule lg:block">
        <SidebarContent user={user} />
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-[280px] gap-0 p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarContent user={user} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-rule px-4 sm:px-8">
          <button
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            className="flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-desk lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <nav aria-label="Você está em" className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px]">
            <span className="hidden text-ink-3 sm:inline">Service desk de TI</span>
            <ChevronRight className="hidden size-3.5 text-ink-3 sm:block" />
            <span className="truncate font-semibold text-ink">{crumb}</span>
          </nav>
          {right}
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
