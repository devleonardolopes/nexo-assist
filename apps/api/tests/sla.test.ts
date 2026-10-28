import { describe, expect, test } from "bun:test";
import { addBusinessDays, addBusinessHours, describeDue, dueAt, slaFor } from "../src/services/sla";

// Horários em Brasília (UTC-3). 2026-10-28 é uma quarta-feira.
const brt = (s: string) => new Date(`${s}-03:00`);
const show = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

describe("SLA em horas úteis", () => {
  test("prioridade alta: 4 horas úteis dentro do expediente (09:43 → 13:43)", () => {
    expect(show(dueAt("high", brt("2026-10-28T09:43:00")))).toBe("2026-10-28 13:43");
  });

  test("alta: horas que passam das 18h continuam no próximo dia útil", () => {
    expect(show(addBusinessHours(brt("2026-10-28T16:00:00"), 4))).toBe("2026-10-29 10:00");
  });

  test("alta pedida na sexta à tarde vence na segunda", () => {
    expect(show(addBusinessHours(brt("2026-10-30T17:00:00"), 4))).toBe("2026-11-02 11:00");
  });

  test("alta pedida no sábado conta a partir de segunda 8h", () => {
    expect(show(addBusinessHours(brt("2026-10-31T11:00:00"), 4))).toBe("2026-11-02 12:00");
  });

  test("crítica: 1 hora corrida (plantão 24h), até de madrugada", () => {
    expect(show(dueAt("critical", brt("2026-10-31T02:00:00")))).toBe("2026-10-31 03:00");
  });

  test("média: 3 dias úteis pulando o fim de semana", () => {
    expect(show(addBusinessDays(brt("2026-10-29T10:00:00"), 3))).toBe("2026-11-03 10:00");
  });

  test("baixa: 5 dias úteis", () => {
    expect(show(dueAt("low", brt("2026-10-28T10:00:00")))).toBe("2026-11-04 10:00");
  });

  test("chamado médio parado há 5 dias está vencido; resolvido ou aprovado nunca vence", () => {
    const at = brt("2026-10-28T10:01:00");
    const updatedAt = brt("2026-10-23T10:00:00").toISOString();
    expect(slaFor({ priority: "medium", status: "waiting_analyst", updatedAt }, at).overdue).toBe(true);
    expect(slaFor({ priority: "medium", status: "in_progress", updatedAt: brt("2026-10-27T10:00:00").toISOString() }, at).overdue).toBe(false);
    expect(slaFor({ priority: "medium", status: "resolved", updatedAt }, at)).toEqual({ dueAt: null, overdue: false });
    expect(slaFor({ priority: "low", status: "approved", updatedAt }, at).overdue).toBe(false);
  });

  test("descreve o prazo como horário no mesmo dia e data+horário nos demais", () => {
    const at = brt("2026-10-28T09:43:00");
    expect(describeDue(brt("2026-10-28T13:43:00"), at)).toBe("13:43");
    expect(describeDue(brt("2026-10-30T10:00:00"), at)).toBe("30/10 às 10:00");
  });
});
