import { describe, expect, test } from "bun:test";
import { config } from "../src/config";
import { dec, draftOf, login, say, setup } from "./helpers";

const ana = "ana.souza@nexo.com.br";

describe("agent: regras do service desk", () => {
  test("dúvida respondida pela central não abre chamado", async () => {
    const { c } = await setup([dec({ intent: "faq", kb_article_id: "kb-horario", reply: "O service desk atende de segunda a sexta, das 8h às 18h." })]);
    const who = await login(c, ana);
    const before = (await c.tickets.listForUser(who.user.id)).length;
    const r = await say(c, who, "Qual o horário do service desk?");
    expect(r.message?.content).toContain("8h às 18h");
    expect(r.message?.cards.some((x) => x.kind === "articles")).toBe(true);
    expect(r.message?.steps.map((s) => s.tool)).toContain("search_kb");
    expect((await c.tickets.listForUser(who.user.id)).length).toBe(before);
  });

  test("abertura: pergunta o que falta, monta rascunho, e só cria depois da confirmação", async () => {
    const { c } = await setup([
      dec({ intent: "ticket_create", reply: "O artigo vale só para Windows 10; o seu é Windows 11.", draft: draftOf() }),
      dec({ intent: "ticket_create", draft: draftOf({ affected: "self", blocking: false, deadline_today: true, priority_reason: "por causa da reunião às 14h" }) }),
    ]);
    const who = await login(c, ana);
    const before = (await c.tickets.listForUser(who.user.id)).length;

    const q = await say(c, who, "Meu notebook não conecta na VPN, erro 809");
    expect(q.message?.cards[0]).toMatchObject({ kind: "question", question: "Quem está sendo afetado?" });

    const d = await say(c, who, "Só eu. Tenho reunião às 14h.");
    const card = d.message?.cards[0];
    expect(card?.kind).toBe("draft");
    if (card?.kind !== "draft") throw new Error();
    expect(card.draft.priority).toBe("high"); // compromisso no mesmo dia, regra em código
    expect(d.message?.steps.map((s) => s.tool)).toEqual(expect.arrayContaining(["classify_priority", "get_sla", "build_draft"]));
    expect((await c.tickets.listForUser(who.user.id)).length).toBe(before); // ainda não criou

    const conv = await c.convos.getOrCreateActive(who.user.id);
    const events: any[] = [];
    await c.agent.confirmDraft({ user: { id: who.user.id, name: who.user.name, department: null, os: null }, conversation: conv, messagesUsed: 2 }, card.draft.id, (e) => events.push(e));
    expect((await c.tickets.listForUser(who.user.id)).length).toBe(before + 1);
    expect(events.find((e) => e.type === "message").message.content).toContain("INC-20501");
  });

  test("duplicidade: problema já coberto atualiza o chamado existente, sem abrir outro", async () => {
    const { c } = await setup([
      dec({ intent: "ticket_update", duplicate_of: "INC-20311", draft: draftOf({ title: "Notebook lento", category: "Hardware", description: "Agora também trava ao abrir o Excel." }) }),
    ]);
    const who = await login(c, ana);
    const before = (await c.tickets.listForUser(who.user.id)).length;
    const r = await say(c, who, "O notebook continua lento e agora trava no Excel");
    const card = r.message?.cards[0];
    if (card?.kind !== "draft") throw new Error("esperava rascunho");
    expect(card.draft).toMatchObject({ kind: "update", ticketId: "INC-20311" });
    const conv = await c.convos.getOrCreateActive(who.user.id);
    await c.agent.confirmDraft({ user: { id: who.user.id, name: who.user.name, department: null, os: null }, conversation: conv, messagesUsed: 1 }, card.draft.id, () => {});
    expect((await c.tickets.listForUser(who.user.id)).length).toBe(before);
  });

  test("duplicidade detectada pelo código mesmo quando o modelo não aponta", async () => {
    const { c } = await setup([dec({ intent: "ticket_create", draft: draftOf({ title: "Notebook lento depois da atualização do Windows", description: "Lentidão após atualização do Windows", category: "Hardware", affected: "self", blocking: false, deadline_today: false }) })]);
    const who = await login(c, ana);
    const r = await say(c, who, "meu notebook está lento depois da atualização");
    const card = r.message?.cards[0];
    expect(card?.kind === "draft" && card.draft.kind).toBe("update");
  });

  test("chamado resolvido há até 7 dias é reaberto, não duplicado", async () => {
    const { c } = await setup([dec({ intent: "ticket_create", duplicate_of: "INC-20150", draft: draftOf({ title: "Senha do SAP bloqueada", category: "Acesso", description: "Bloqueou de novo." }) })]);
    const who = await login(c, "carla.mendes@nexo.com.br");
    const r = await say(c, who, "O SAP bloqueou de novo");
    const card = r.message?.cards[0];
    expect(card?.kind === "draft" && card.draft.kind).toBe("reopen");
  });

  test("confiança baixa transfere para um analista e o agent para de responder", async () => {
    const { c, decider } = await setup([dec({ intent: "clarify", confidence: 0.41, understanding: "Conexão intermitente", handoff_summary: "Conexão cai só no app de vendas" })]);
    const who = await login(c, ana);
    const r = await say(c, who, "a conexão cai e volta sei lá");
    const conv = await c.convos.getOrCreateActive(who.user.id);
    expect(conv.status).toBe("waiting_analyst");
    expect(conv.transferReason).toBe("low_confidence");
    expect(conv.agentConfidence).toBe(41);
    expect(conv.transferSummary).toContain("app de vendas");
    expect(r.message?.steps.map((s) => s.tool)).toContain("transfer");

    const calls = decider.calls;
    const silent = await say(c, who, "alguém aí?");
    expect(silent.message).toBeUndefined();
    expect(decider.calls).toBe(calls); // o LLM não foi chamado
    const msgs = await c.convos.listMessages(conv.id);
    expect(msgs.at(-1)?.content).toBe("alguém aí?");
  });

  test("seleção de chamado vencido mostra o prazo e oferece analista, sem usar o modelo", async () => {
    const { c, decider } = await setup([]);
    const who = await login(c, ana);
    const r = await say(c, who, "INC-20311 · Notebook lento", { type: "select_ticket", ticketId: "INC-20311" });
    expect(decider.calls).toBe(0);
    expect(r.message?.content).toContain("acima do prazo de 3 dias úteis");
    expect(r.message?.decision?.source).toBe("rule");
    expect(r.message?.cards.some((x) => x.kind === "actions")).toBe(true);
  });

  test("botão 'Falar com um analista' transfere pelo motivo de chamado vencido", async () => {
    const { c } = await setup([]);
    const who = await login(c, ana);
    await say(c, who, "INC-20311", { type: "select_ticket", ticketId: "INC-20311" });
    await say(c, who, "Falar com um analista", { type: "transfer" });
    const conv = await c.convos.getOrCreateActive(who.user.id);
    expect(conv.status).toBe("waiting_analyst");
    expect(conv.transferReason).toBe("overdue");
    expect(conv.relatedTicketId).toBe("INC-20311");
    expect((await c.tickets.getForUser(who.user.id, "INC-20311"))?.status).toBe("waiting_analyst");
  });

  test("privacidade: o modelo nunca recebe chamados de outro funcionário e o chamado alheio 'não existe'", async () => {
    const { c, decider } = await setup([dec({ intent: "ticket_status", ticket_id: "INC-20150" })]);
    const who = await login(c, ana);
    const r = await say(c, who, "Qual o status do INC-20150?");
    expect(decider.prompts[0]).not.toContain("Senha do SAP");
    expect(decider.prompts[0]).not.toContain("INC-20150 |");
    expect(r.message?.content).toContain("Não encontrei esse chamado entre os seus");
    expect(r.message?.cards.length).toBe(0);
  });

  test("lista os chamados abertos quando há vários e o usuário não escolheu", async () => {
    const { c } = await setup([dec({ intent: "ticket_status" })]);
    const who = await login(c, ana);
    const r = await say(c, who, "Qual o status do meu chamado?");
    expect(r.message?.content).toBe("Você tem 3 chamados abertos. Sobre qual deles quer saber?");
    const card = r.message?.cards[0];
    expect(card?.kind === "ticket_list" && card.tickets.map((t) => t.id)).toEqual(expect.arrayContaining(["INC-20311", "INC-20298", "REQ-10442"]));
  });

  test("limite de 30 mensagens por sessão", async () => {
    const { c } = await setup(Array.from({ length: config.messageLimit }, () => dec({ intent: "greeting", reply: "Oi!" })));
    const who = await login(c, ana);
    for (let i = 0; i < config.messageLimit; i++) expect((await say(c, who, `oi ${i}`)).message).toBeDefined();
    const r = await say(c, who, "mais uma");
    expect(r.error).toMatchObject({ code: "message_limit" });
    // Nova sessão (novo login) zera o contador.
    const again = await login(c, ana);
    expect(await c.auth.messagesUsed(again.session.id)).toBe(0);
  });

  test("sistema de chamados indisponível: avisa e oferece analista, sem inventar resposta", async () => {
    const { c } = await setup([dec({ intent: "ticket_status" })], { failureRate: 1 });
    const who = await login(c, ana);
    const r = await say(c, who, "status do meu chamado");
    expect(r.message?.content).toContain("instável");
    expect(r.message?.steps.some((s) => !s.ok)).toBe(true);
  });

  test("caso crítico já nasce com analista chamado ao confirmar", async () => {
    const { c } = await setup([dec({ intent: "ticket_create", draft: draftOf({ title: "Sem rede no escritório", category: "Rede e VPN", description: "Toda a equipe sem rede", affected: "team", blocking: true, deadline_today: false }) })]);
    const who = await login(c, ana);
    const r = await say(c, who, "A rede caiu para o time inteiro");
    const card = r.message?.cards[0];
    if (card?.kind !== "draft") throw new Error();
    expect(card.draft.priority).toBe("critical");
    const conv = await c.convos.getOrCreateActive(who.user.id);
    await c.agent.confirmDraft({ user: { id: who.user.id, name: who.user.name, department: null, os: null }, conversation: conv, messagesUsed: 1 }, card.draft.id, () => {});
    expect((await c.convos.get(conv.id))?.status).toBe("waiting_analyst");
    expect((await c.convos.get(conv.id))?.transferReason).toBe("critical");
  });

  test("falha do modelo (após nova tentativa) encaminha o caso a um analista", async () => {
    const { c, decider } = await setup([]);
    const who = await login(c, ana);
    const r = await say(c, who, "preciso de ajuda"); // decider sem roteiro lança erro
    expect(decider.calls).toBe(2); // tentativa + nova tentativa
    const conv = await c.convos.getOrCreateActive(who.user.id);
    expect(conv.status).toBe("waiting_analyst");
    expect(r.message?.content).toContain("analista");
  });
});

describe("console do analista", () => {
  test("assumir pausa o agent, devolver retoma e encerrar fecha", async () => {
    const { c, decider } = await setup([dec({ intent: "greeting", reply: "Olá!" })], { keepSeedTransfers: true });
    const rafael = await login(c, "rafael.lima@nexo.com.br");
    const list = await c.analyst.list(rafael.user.id, "for_you", "");
    expect(list.items.map((i) => i.userName)).toEqual(expect.arrayContaining(["Ana Souza", "Carla Mendes"]));

    await c.analyst.claim("conv_ana", rafael.user);
    expect((await c.convos.get("conv_ana"))?.status).toBe("with_analyst");
    expect((await c.tickets.getForUser("usr_ana", "INC-20311"))?.status).toBe("in_progress");

    const ana_ = await login(c, ana);
    const silent = await say(c, ana_, "Posso sim, está ligado.");
    expect(silent.message).toBeUndefined();
    expect(decider.calls).toBe(0);

    await c.analyst.send("conv_ana", rafael.user, "Ótimo! Vou iniciar o acesso remoto.");
    const mine = await c.analyst.list(rafael.user.id, "mine", "");
    expect(mine.items.map((i) => i.userName)).toEqual(["Ana Souza"]);

    await c.analyst.release("conv_ana", rafael.user);
    expect((await c.convos.get("conv_ana"))?.status).toBe("agent");
    const back = await say(c, ana_, "oi");
    expect(back.message?.content).toBe("Olá!");

    await c.analyst.claim("conv_carla", rafael.user);
    await c.analyst.close("conv_carla", rafael.user);
    expect((await c.convos.get("conv_carla"))?.status).toBe("resolved");
  });

  test("outro analista não assume nem responde conversa que já está com alguém", async () => {
    const { c } = await setup([], { keepSeedTransfers: true });
    const rafael = await login(c, "rafael.lima@nexo.com.br");
    const marina = await login(c, "marina.alves@nexo.com.br");
    await c.analyst.claim("conv_ana", rafael.user);
    expect(c.analyst.claim("conv_ana", marina.user)).rejects.toThrow();
    expect(c.analyst.send("conv_ana", marina.user, "oi")).rejects.toThrow();
  });
});
