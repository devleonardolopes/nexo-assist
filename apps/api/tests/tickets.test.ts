import { describe, expect, test } from "bun:test";
import { ReopenNotAllowed } from "../src/services/tickets";
import { setup } from "./helpers";

describe("serviço de chamados", () => {
  test("privacidade: um funcionário nunca recebe chamado de outro", async () => {
    const { c } = await setup();
    // INC-20150 é da Carla.
    expect(await c.tickets.getForUser("usr_ana", "INC-20150")).toBeNull();
    expect((await c.tickets.getForUser("usr_carla", "INC-20150"))?.id).toBe("INC-20150");
    const anaIds = (await c.tickets.listForUser("usr_ana")).map((t) => t.id);
    expect(anaIds).not.toContain("INC-20150");
    expect(anaIds).toContain("INC-20311");
  });

  test("atualizar chamado de outra pessoa falha e não altera nada", async () => {
    const { c } = await setup();
    expect(c.tickets.addUpdate("usr_ana", "INC-20150", "oi")).rejects.toThrow();
    expect((await c.tickets.getForUser("usr_carla", "INC-20150"))?.status).toBe("resolved");
  });

  test("marca como vencido o chamado médio parado há 5 dias", async () => {
    const { c } = await setup();
    const t = await c.tickets.getForUser("usr_ana", "INC-20311");
    expect(t?.overdue).toBe(true);
    expect((await c.tickets.getForUser("usr_ana", "INC-20298"))?.overdue).toBe(false);
  });

  test("reabre chamado resolvido há até 7 dias e recusa os mais antigos", async () => {
    const { c } = await setup();
    const reopened = await c.tickets.reopen("usr_carla", "INC-20150", "voltou a bloquear");
    expect(reopened.status).toBe("open");
    expect(reopened.resolvedAt).toBeNull();
    expect(c.tickets.reopen("usr_ana", "INC-19877", "voltou")).rejects.toBeInstanceOf(ReopenNotAllowed);
  });

  test("cria chamado com numeração sequencial por tipo", async () => {
    const { c } = await setup();
    const t = await c.tickets.create("usr_ana", { type: "INC", title: "x", description: "y", category: "Outros", priority: "low", affected: "self" });
    expect(t.id).toBe("INC-20501");
    expect(t.status).toBe("open");
  });
});
