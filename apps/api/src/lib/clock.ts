let override: Date | null = null;

/** Relógio injetável: os testes fixam a data para validar prazos de SLA. */
export const now = (): Date => (override ? new Date(override) : new Date());
export const setNow = (date: Date | null) => {
  override = date;
};
