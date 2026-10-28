# Nexo Assist

Agent de service desk de TI em um chat: o funcionário descreve o problema com as próprias palavras e o agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados (sempre com confirmação) e chama um analista quando precisa. Há também um console para o analista assumir, devolver ou encerrar conversas.

## Como rodar

Requisitos: [Bun](https://bun.sh) 1.3+.

```bash
bun install
cp .env.example .env        # preencha DEEPSEEK_API_KEY
bun run dev:web             # http://localhost:3000 (migra e popula o banco sozinho)
```

O banco SQLite fica em `apps/api/data/nexo.db` (criado na primeira requisição). Para zerar os dados, apague esse arquivo. Comandos úteis:

| Comando | O que faz |
| --- | --- |
| `bun run dev:web` | App completo (Next + API Elysia montada em `/api`) |
| `bun run dev:api` | Só a API, em `http://localhost:3001/api` |
| `bun run db:generate` | Gera uma migration nova (nome com timestamp) a partir do schema |
| `bun run db:migrate` / `db:seed` | Aplica migrations / popula dados de exemplo |
| `bun run test` | 30 testes (SLA, privacidade, duplicidade, transferência, limite, console) |
| `bun run typecheck` | TypeScript estrito em todos os pacotes |

### Contas de demonstração

Qualquer senha é aceita (como pede o PRD). O papel vem do usuário no banco.

| E-mail | Papel | Estado inicial |
| --- | --- | --- |
| `ana.souza@nexo.com.br` | funcionária | conversa **já transferida** (igual ao protótipo do console), chamado INC-20311 vencido |
| `carla.mendes@nexo.com.br`, `bruno.tavares@nexo.com.br` | funcionários | transferidas (Bruno por baixa confiança, 41%) |
| `diego.ramos@nexo.com.br`, `elisa.prado@nexo.com.br` | funcionários | conversa em andamento com o agent |
| `fabio.nunes@nexo.com.br`, `gabriela.rocha@nexo.com.br` | funcionários | conversa anterior resolvida: começam do zero |
| `rafael.lima@nexo.com.br` (N2), `marina.alves@nexo.com.br` (N1) | analistas | console em `/atendente` |

Para testar o agent com a Ana, entre como Rafael, abra a conversa dela e use **Devolver ao agent**.

## Arquitetura

```
apps/web      Next.js + React + shadcn/ui + lucide-react   (interface)
apps/api      Elysia + Mastra + Drizzle/libSQL             (agent, serviços, rotas)
packages/shared  tipos e contratos TypeScript              (DTOs, eventos SSE)
```

- **Interface** só conhece os contratos de `@nexo/shared` e fala com `/api` (cookie de sessão httpOnly, mesmo domínio).
- **API**: `routes (app.ts)` → `agent/` → `services/`. O agent nunca acessa o banco direto: usa `TicketService` (o "sistema legado" simulado), `KnowledgeBase`, `ConversationStore`. O `TicketService` não importa nada do agent.
- **Persistência**: Drizzle + libSQL (SQLite). Conversas, mensagens, rascunhos, chamados e o **estado de cada conversa** (`agent`, `waiting_analyst`, `with_analyst`, `resolved`) sobrevivem a reinícios. Migrations versionadas com timestamp (`apps/api/drizzle/2026…_init.sql`).
- **Tempo real**: respostas por SSE (passos do agent aparecem enquanto ele trabalha, depois o texto em streaming). O console usa polling de 3 s.

## Como o agent decide o que fazer

Uma chamada ao modelo por mensagem, com **decisão estruturada** (validada com Zod). Em vez de deixar o LLM chamar ferramentas livremente, o código monta o contexto, o modelo decide e o código executa.

1. **Contexto (código, sem LLM):** chamados *do funcionário* (consulta já filtrada por dono), busca por palavras-chave na central, rascunho pendente e as últimas mensagens.
2. **Decisão (LLM):** devolve `understanding`, `intent`, `confidence`, `reasoning`, campos extraídos do chamado (título, descrição, tipo, categoria, quem é afetado, se impede o trabalho, compromisso hoje) e um texto de resposta.
3. **Execução (código):** o `Agent` em `agent/orchestrator.ts` aplica as regras do Anexo A:
   - **Prioridade e prazo são regra, não opinião do modelo.** O modelo só extrai os fatos; `classifyPriority` (impacto × urgência) e `dueAt` (horas úteis, seg–sex 8h–18h, crítica em 1 h corrida) decidem.
   - **Confirmação:** nada é criado ou atualizado sem o funcionário confirmar o rascunho.
   - **Sem duplicidade:** o modelo aponta `duplicate_of`; o código valida (chamado é do usuário? está ativo ou resolvido há ≤ 7 dias?) e ainda procura por similaridade. Resultado: atualiza ou reabre em vez de abrir outro.
   - **Perguntas:** se falta "quem é afetado" ou a urgência, pergunta com opções rápidas (1–4), uma por vez.
   - **Transferência:** a pedido, caso crítico, chamado vencido (oferece e transfere ao aceitar) ou **confiança < 60%**. Leva resumo do caso; depois disso o agent fica em silêncio até o analista devolver.
   - **Privacidade e escopo:** o modelo só vê os chamados do próprio usuário; um chamado alheio responde "não encontrei entre os seus", sem revelar se existe. Assuntos fora de TI são redirecionados.
4. **Ações de botão** (selecionar chamado, falar com analista, confirmar, cancelar) **não passam pelo modelo**: são regras fixas, mais rápidas e sem custo.

### Transparência

Acima de cada resposta aparecem os passos ("consultou seus chamados", "classificou a prioridade"…). Clicar neles (ou em **Ver detalhes**) abre o que o agent entendeu, a ação, a **confiança** (barra e %) e o **porquê**, além do detalhe de cada passo e se a decisão veio do modelo ou de uma regra fixa. Tudo isso é persistido por mensagem, então o analista e a equipe conseguem auditar depois.

### Qualidade das decisões

- Regras de negócio em código determinístico e **testadas** (`apps/api/tests`): SLA e vencimento, prioridade, duplicidade/reabertura, privacidade entre funcionários, limite de 30 mensagens, transferência por baixa confiança, agent silencioso com analista, indisponibilidade do sistema legado, console do analista.
- O modelo é injetável (`Decider`): os testes usam um decider roteirizado, sem rede e sem custo.
- Saída do modelo validada por schema; se falhar, nova tentativa e, persistindo, o caso vai para um analista em vez de ficar sem resposta.

## Escolhas e trade-offs

- **Modelo: DeepSeek (`deepseek-v4-flash`)** via Mastra. Escolhido por custo, latência e qualidade em português. O "thinking" fica desligado (respostas mais rápidas e baratas; a decisão já é guiada por esquema). Troca por `LLM_MODEL`.
- **Uma chamada por mensagem + prompt estático primeiro** (aproveita cache de prefixo) e histórico curto: custo previsível por conversa, somado ao limite de 30 mensagens/sessão, ao limite por IP e ao teto diário de chamadas ao LLM (`DAILY_LLM_CAP`).
- **Busca na central por palavras-chave**: suficiente para 10 artigos; trocar por embeddings não muda a interface.
- **Senha**: qualquer senha é aceita para usuários cadastrados (PRD). Em produção a verificação ficaria no provedor de identidade.
- **Polling no console** em vez de WebSocket: simples e suficiente aqui.
- **Sistema legado instável**: o `TicketService` aceita uma taxa de falha (`LEGACY_FAILURE_RATE`); o agent tenta de novo e, se não der, avisa e oferece um analista.

## Deploy (Vercel)

O Elysia roda dentro do Next (`apps/web/src/app/api/[[...slugs]]/route.ts`), então é um único projeto, sem CORS. Basta importar o repositório na Vercel (Root Directory: `apps/web`) e definir `DEEPSEEK_API_KEY` nas variáveis de ambiente (somente lá, nunca no código).

O banco é um SQLite em `/tmp`, recriado e populado com os dados de exemplo a cada deploy ou cold start. Para esta demonstração isso é intencional: os dados não persistem entre deploys. Se um dia precisar persistir, basta apontar `DATABASE_URL` (e `DATABASE_AUTH_TOKEN`) para um libSQL remoto; o código é o mesmo.

## O que faria com mais tempo

- Busca semântica na central e avaliação do agent com um conjunto de conversas reais (evals com o LLM).
- WebSocket/SSE no console e indicador de "digitando".
- Autenticação real (SSO), auditoria completa e métricas de custo por conversa.
- Testes de interface (Playwright) para os fluxos principais.
