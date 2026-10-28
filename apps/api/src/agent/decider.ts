import { Agent } from "@mastra/core/agent";
import { config } from "../config";
import { type Decision, DecisionSchema } from "./schema";
import { SYSTEM_PROMPT } from "./prompt";

export interface DecideResult {
  decision: Decision;
  latencyMs: number;
  model: string;
}

/**
 * Porta do agent com o LLM. A implementação real usa Mastra + DeepSeek; os testes injetam um decider
 * determinístico, o que permite validar as regras do service desk sem rede nem custo.
 */
export interface Decider {
  decide(prompt: string, onReplyDelta?: (delta: string) => void): Promise<DecideResult>;
}

export class LlmUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmUnavailable";
  }
}

/** Falta de configuração (chave ausente): não adianta tentar de novo nem transferir. */
export class LlmNotConfigured extends LlmUnavailable {
  constructor() {
    super("DEEPSEEK_API_KEY não configurada");
    this.name = "LlmNotConfigured";
  }
}

export class MastraDecider implements Decider {
  private agent: Agent | null = null;

  private getAgent(): Agent {
    if (!config.deepseekApiKey) throw new LlmNotConfigured();
    this.agent ??= new Agent({
      id: "nexo-assist",
      name: "Nexo Assist",
      instructions: SYSTEM_PROMPT,
      model: { providerId: "deepseek", modelId: config.model, apiKey: config.deepseekApiKey },
    });
    return this.agent;
  }

  async decide(prompt: string, onReplyDelta?: (delta: string) => void): Promise<DecideResult> {
    const agent = this.getAgent();
    const started = Date.now();
    let lastReply = "";
    try {
      const stream = await agent.stream(prompt, {
        maxSteps: 1,
        // DeepSeek não aceita json_schema nativo: o Mastra injeta o formato no prompt e valida com Zod.
        structuredOutput: { schema: DecisionSchema, jsonPromptInjection: true },
        // Sem "thinking": respostas mais rápidas e baratas; a decisão já é guiada por um esquema explícito.
        providerOptions: { deepseek: { thinking: { type: "disabled" } } },
        modelSettings: { temperature: 0.2 },
      });
      if (onReplyDelta) {
        for await (const partial of stream.objectStream) {
          const reply = typeof partial?.reply === "string" ? partial.reply : "";
          if (reply.length > lastReply.length) {
            onReplyDelta(reply.slice(lastReply.length));
            lastReply = reply;
          }
        }
      }
      const decision = DecisionSchema.parse(await stream.object);
      return { decision, latencyMs: Date.now() - started, model: config.model };
    } catch (err) {
      if (err instanceof LlmUnavailable) throw err;
      throw new LlmUnavailable(err instanceof Error ? err.message : "Falha ao consultar o modelo");
    }
  }
}
