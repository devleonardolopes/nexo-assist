import { schema } from "../db/client";
import type { Db } from "../db/client";

export type Article = typeof schema.articles.$inferSelect;

const STOP = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "um", "uma", "que", "para", "por", "com", "meu", "minha", "me", "se", "ao", "nao", "como", "pra"]);

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export const tokenize = (s: string): string[] =>
  normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

/** Central de ajuda: busca por palavras-chave (suficiente para 5–10 artigos curtos; troca por embeddings sem mudar a interface). */
export class KnowledgeBase {
  constructor(private db: Db) {}

  async search(query: string, limit = 3): Promise<{ article: Article; score: number }[]> {
    const terms = tokenize(query);
    if (!terms.length) return [];
    const all = await this.db.select().from(schema.articles);
    return all
      .map((article) => {
        const title = normalize(article.title);
        const tags = article.tags.map(normalize).join(" ");
        const body = normalize(article.body);
        const score = terms.reduce(
          (sum, t) => sum + (title.includes(t) ? 3 : 0) + (tags.includes(t) ? 2 : 0) + (body.includes(t) ? 1 : 0),
          0,
        );
        return { article, score };
      })
      .filter((r) => r.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
