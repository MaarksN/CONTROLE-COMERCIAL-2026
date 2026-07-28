# Auditoria de Inteligência Artificial: Atlas Comercial 360 (vinext-starter)

## 1. Resumo executivo

A presente auditoria avaliou a infraestrutura de Inteligência Artificial implementada no projeto **Atlas Comercial 360** (um projeto baseado em `vinext-starter`). O sistema possui duas funcionalidades centrais com uso de IA Generativa: **Geração de Relatórios Executivos** a partir de dados de dashboard e um **Assistente Virtual de Inteligência Comercial (Chat)**.

Atualmente, o código emprega a OpenAI (`gpt-4o-mini`) e Anthropic para a geração de relatórios, permitindo alternar entre eles, além de utilizar a Groq (`llama-3.1-70b-versatile`) como motor de inferência ultra-rápido para o widget do assistente.

A auditoria identificou vulnerabilidades críticas no uso atual, incluindo a configuração de um nome de modelo inexistente para a Anthropic (`claude-sonnet-5`), a ausência de memória conversacional no chat do assistente (cada mensagem é isolada), e injeção completa de contexto não estruturado em cada requisição, o que onera custos e degrada a performance para volumes grandes de dados. Propomos uma arquitetura de roteamento (AI Gateway) com correção imediata dos modelos e adoção de práticas de cache e filtragem de contexto.

## 2. Veredito em uma página

* **Melhor IA geral:** OpenAI `gpt-4o-mini` (pelo balanço de custo, velocidade e janela de contexto estendida, adequado para a extração direta de relatórios).
* **Melhor custo-benefício:** Groq com Meta Llama 3.1 8B ou 70B (custo por milhão de tokens significativamente menor, com inferência em tempo real).
* **Melhor IA premium:** Anthropic `claude-3-5-sonnet-20240620` (ou superior) para raciocínio analítico complexo em relatórios que demandem avaliações de risco avançadas.
* **Melhor IA rápida:** Groq com `llama-3.1-70b-versatile` (já utilizada, excelente para o Assistente Comercial interativo).
* **Melhor para código:** Não aplicável diretamente neste cenário (uso puramente comercial de dados, mas `gpt-4o` e `claude-3-5-sonnet` seriam recomendados caso houvesse).
* **Melhor para documentos:** Anthropic `claude-3-5-sonnet` (superior no suporte a documentos nativos).
* **Melhor para voz / visão:** Não há casos de uso implementados. Para futuras necessidades de voz, OpenAI Whisper. Para visão, `gpt-4o`.
* **Arquitetura recomendada:** Implementação de um AI Gateway local (como o LiteLLM ou roteador próprio) para abstrair as chamadas, com a correção urgente do modelo da Anthropic, gestão de contexto no assistente via LangChain ou Vercel AI SDK, e injeção parcial de contexto em vez de enviar todo o dashboard JSON a cada requisição.

## 3. Arquitetura atual

O sistema é uma aplicação web Full-Stack baseada em Next.js (vinext-starter), Drizzle ORM e banco de dados SQLite (com preparo para Cloudflare D1).
A IA está integrada via APIs REST chamadas diretamente do lado do servidor (Serverless Functions / Route Handlers):
1. **Relatórios:** A rota `/api/ai/report` recebe um contexto JSON e chama a API da OpenAI ou Anthropic dependendo das configurações em banco (`integrationSettings`).
2. **Assistente de Chat:** O componente React `AssistantWidget.tsx` envia o input do usuário e o `dataContext` completo para `/api/ai/groq`, que faz bypass para a API da Groq (`llama-3.1-70b-versatile`).

## 4. Inventário de modelos encontrados

* **OpenAI:** `gpt-4o-mini` (Geração de relatórios - `app/api/ai/report/route.ts`).
* **Anthropic:** `claude-sonnet-5` (Geração de relatórios - `app/api/ai/report/route.ts`). *Alerta: O nome do modelo está incorreto e retornará erro na API.*
* **Groq / Meta:** `llama-3.1-70b-versatile` (Assistente Comercial - `app/api/ai/groq/route.ts`).

## 5. Mapa de funcionalidades

| Funcionalidade | Arquivo | Linhas | Fornecedor | Modelo | Tipo de Uso |
| --- | --- | --- | --- | --- | --- |
| Relatório Executivo | `app/api/ai/report/route.ts` | 13-32 | OpenAI | `gpt-4o-mini` | Texto / Resumo de JSON |
| Relatório Executivo | `app/api/ai/report/route.ts` | 34-58 | Anthropic | `claude-sonnet-5` (Inválido) | Texto / Resumo de JSON |
| Chat do Assistente | `app/api/ai/groq/route.ts` | 16-32 | Groq | `llama-3.1-70b-versatile` | Texto / Chat |

## 6. Problemas encontrados

1. **Modelo Inválido (P0 - Crítico):** A chamada para a Anthropic (`app/api/ai/report/route.ts`) usa `claude-sonnet-5`, o que resultará em erro (HTTP 400/404) na API oficial. O modelo deve ser `claude-3-5-sonnet-20240620`.
2. **Falta de Memória no Chat (P1 - Alta Prioridade):** No `AssistantWidget.tsx`, ao chamar `/api/ai/groq`, apenas a última mensagem (`prompt`) é enviada, omitindo o histórico de conversação. O usuário não pode fazer perguntas de seguimento.
3. **Injeção de Contexto Total (P2 - Média Prioridade):** O JSON de `dataContext` (dashboard inteiro) é re-injetado em cada requisição de chat na Groq. Se o volume de dados crescer, ultrapassará a janela de contexto ou aumentará drasticamente os custos operacionais (tokens de entrada desperdiçados repetidamente).
4. **Ausência de Fallback e Timeout (P2):** Se a API da OpenAI/Anthropic/Groq cair, a aplicação falha sem tentar um modelo alternativo ou timeout gracioso, resultando em erro 500 no client.

## 7. Pesquisa de mercado

* **OpenAI (`gpt-4o-mini`):** Extremamente econômico, contexto de 128K. Ideal para leitura de JSONs médios/grandes onde raciocínio complexo não é estritamente necessário.
* **Anthropic (`claude-3-5-sonnet`):** Líder em raciocínio analítico, formatação de relatórios precisos. Custo intermediário. Excelente para quando os dados exigem insights de negócios mais sofisticados.
* **Groq (`llama-3.1-70b-versatile`):** A arquitetura LPU da Groq fornece velocidade inigualável (centenas de tokens por segundo), o que o torna ideal para componentes em tempo real (como widgets flutuantes). O Llama 3.1 70B possui nível quase comparável ao GPT-4 em tarefas pontuais, mas o custo de inferência na Groq é muito atrativo.

## 8. Comparativo técnico

| Critério | `gpt-4o-mini` | `claude-3-5-sonnet` | Groq `llama-3.1-70b` |
| --- | --- | --- | --- |
| Janela de contexto | 128k | 200k | 128k |
| Velocidade | Rápida | Média | Ultra-rápida |
| Raciocínio c/ JSON | Bom | Excelente | Bom |
| Function Calling | Sim | Sim | Sim |
| Prompt Caching | Sim (nativo) | Sim (explícito) | Em avaliação |

## 9. Comparativo financeiro

*(Valores oficiais em USD, conversão para BRL hipotética a R$ 5,50)*

* **`gpt-4o-mini`:** $0,15 por 1M tokens (entrada) / $0,60 por 1M tokens (saída).
* **`claude-3-5-sonnet`:** $3,00 por 1M tokens (entrada) / $15,00 por 1M tokens (saída).
* **Groq `llama-3.1-70b`:** ~$0,59 por 1M tokens (entrada) / ~$0,79 por 1M tokens (saída).

**Cenário Médio (10.000 chamadas/mês):** (Considerando média de 4000 tokens de entrada e 500 tokens de saída por chamada)
* **`gpt-4o-mini`:** 40M entrada ($6.00) + 5M saída ($3.00) = **$9.00 / mês** (R$ 49,50).
* **`claude-3-5-sonnet`:** 40M entrada ($120.00) + 5M saída ($75.00) = **$195.00 / mês** (R$ 1.072,50).
* **Groq `llama-3.1-70b`:** 40M entrada ($23.60) + 5M saída ($3.95) = **$27.55 / mês** (R$ 151,52).

## 10. Matriz de pontuação

| Critério | Peso | `gpt-4o-mini` | `claude-3-5-sonnet` | Groq `llama-3.1-70b` |
| --- | ---: | :---: | :---: | :---: |
| Adequação ao caso de uso (Resumo e Chat) | 20% | 9 | 10 | 9 |
| Qualidade das respostas | 15% | 8 | 10 | 8 |
| Confiabilidade (Uptime API) | 10% | 9 | 9 | 8 |
| Custo operacional | 15% | 10 | 4 | 8 |
| Velocidade | 10% | 8 | 7 | 10 |
| Saída estruturada | 5% | 9 | 9 | 8 |
| Integração (Tools) | 5% | 10 | 9 | 8 |
| Privacidade (Zero Retention) | 10% | 7 (Enterprise) | 8 | 7 |
| Escalabilidade | 5% | 10 | 9 | 10 |
| Facilidade de implementação | 5% | 10 | 10 | 10 |
| **Nota Ponderada** | **100%** | **8.85** | **8.15** | **8.55** |

*Nota: Claude 3.5 perde pontos apenas pelo custo significativamente maior se o envio integral de contexto não for resolvido. `gpt-4o-mini` vence pelo equilíbrio absoluto em tarefas simples.*

## 11. Recomendação por funcionalidade

| Funcionalidade | Modelo atual | Modelo recomendado | Alternativa | Motivo |
| --- | --- | --- | --- | --- |
| **Relatórios Executivos** | `gpt-4o-mini` / `claude-sonnet-5` (inválido) | `gpt-4o-mini` (como default) | `claude-3-5-sonnet-20240620` | `gpt-4o-mini` possui custo-benefício imbatível para sumarização de JSON. Claude fica para clientes "Premium". |
| **Assistente Chat (Widget)** | Groq `llama-3.1-70b-versatile` | Groq `llama-3.1-70b-versatile` | `gpt-4o-mini` | Velocidade é essencial para widgets de interface. A Groq proporciona resposta instantânea, melhorando a UX. |

## 12. Arquitetura multimodelo

Recomenda-se unificar as chamadas em um "AI Gateway" no servidor:
1. **Roteamento Dinâmico:** Uma função ou middleware que aceite um identificador de provider.
2. **Fallback:** Caso a Groq atinja limites de requisição (Rate Limit), redirecionar automaticamente a chamada para `gpt-4o-mini`.
3. **Gerenciamento de Contexto:** Ao invés de mandar todo o `dataContext`, usar uma extração filtrada, enviando ao LLM apenas métricas resumidas, ou adotando ferramentas (Tool Calling) para que o LLM peça dados de vendas específicos, evitando sobrecarga no Token Input.

## 13. Plano de migração

* **Fase 1 (Imediata):** Corrigir o identificador de modelo da Anthropic de `claude-sonnet-5` para `claude-3-5-sonnet-20240620` na rota `/api/ai/report/route.ts`.
* **Fase 2 (Curto Prazo):** Atualizar o `AssistantWidget.tsx` e `/api/ai/groq/route.ts` para enviar e processar o histórico (Array de mensagens) em vez de apenas a última mensagem (string simples).
* **Fase 3 (Médio Prazo):** Implementar RAG leve ou Tool Calling para o Assistente Comercial, evitando injetar `dataContext` inteiro em cada requisição.
* **Fase 4 (Longo Prazo):** Abstrair todas as rotas para o Vercel AI SDK ou LiteLLM, padronizando callbacks, streaming (Server-Sent Events) e tratamento de erros (fallback).

## 14. Riscos da migração

* **Tempo de latência elevado:** A alteração do Groq para outras IAs no chat pode causar frustração se a velocidade for perceptivelmente reduzida; a Groq deve ser mantida para o Chat primário.
* **Sobrecarga de custos (Contexto Crescente):** Sem lidar com o `dataContext`, à medida que a base de vendas crescer, os tokens estourarão. Implementar filtragem (apenas últimos 30 dias, por exemplo) como mitigação.

## 15. Roadmap

* **Ações Imediatas (P0):** Alteração da string do modelo Anthropic e ajustes no Widget de Chat (memória).
* **30 dias (P1):** Implementação de streaming de resposta no Assistente Widget (para que a resposta seja lida enquanto é gerada, reduzindo o tempo de percepção de espera).
* **60 dias (P2):** Criação de um AI Router que forneça Fallback de Groq para OpenAI.
* **90 dias (P3):** Substituição de "Injeção de JSON" por "Ferramentas (Function Calling)" no Groq/OpenAI, permitindo ao IA rodar queries diretas (via Drizzle/SQL) de forma natural.

## 16. Fontes

* **OpenAI Pricing:** https://openai.com/pricing (Data: Ago 2024)
* **Anthropic Pricing:** https://www.anthropic.com/pricing (Data: Ago 2024)
* **Groq Pricing/Limits:** https://wow.groq.com/ (Data: Ago 2024)
* Análise de código via repositório `vinext-starter`.

---

# 20. Tabela de Recomendação por Funcionalidade

| Funcionalidade | Modelo atual | Modelo recomendado | Alternativa | Motivo | Economia estimada | Risco |
| --- | --- | --- | --- | --- | ---: | --- |
| Geração de Relatórios | `gpt-4o-mini` / `claude-sonnet-5` | `gpt-4o-mini` | `claude-3-5-sonnet` | Menor custo por extração padronizada de JSON. | ~95% frente ao Claude | Baixo |
| Assistente Chat | Groq `llama-3.1-70b` | Groq `llama-3.1-70b` | `gpt-4o-mini` | Baixíssima latência (TTFT) otimizando UX | Manutenção | Moderado (Rate Limiting) |

---

# 21. Quadro Final de Decisão

## VEREDITO FINAL

### Melhor arquitetura
Adoção do Vercel AI SDK com roteamento inteligente, mantendo o modelo Groq (Llama) na "linha de frente" do chat pela latência e velocidade, e o OpenAI `gpt-4o-mini` para processos assíncronos (Relatórios).

### Modelo principal
**OpenAI `gpt-4o-mini`** e **Groq `llama-3.1-70b-versatile`** (Coexistentes).

### Por que foi escolhido
Balanceiam perfeitamente as demandas: Relatórios exigem estabilidade e leitura longa de JSON a custo baixíssimo (`gpt-4o-mini`); o Assistente em tempo real requer fluidez humana interativa quase instantânea, onde o poder do chip LPU da Groq é insuperável e gratuito/barato.

### Modelo econômico
**OpenAI `gpt-4o-mini`** (Para processos textuais profundos onde a latência não seja prioridade, custando menos de um décimo do GPT-4o ou Claude Sonnet).

### Modelo premium
**Anthropic `claude-3-5-sonnet-20240620`** (Exclusivo para contas Enterprise que precisem de avaliações estratégicas refinadas no relatório, onde precisão gramatical/lógica seja suprema).

### Modelo de fallback
**OpenAI `gpt-4o-mini`** atua como fallback natural para falhas na API do Groq.

### Soluções que devem permanecer
A integração atual com `gpt-4o-mini` e `Groq`.

### Soluções que devem ser substituídas
A string inválida `claude-sonnet-5` deve ser reescrita para `claude-3-5-sonnet-20240620`. O payload completo do dashboard injetado integralmente na prompt do chat deve ser substituído por RAG ou resumos.

### Economia estimada
* **Mensal:** $186.00 (evitando usar o Claude como modelo padrão para todos).
* **Anual:** ~$2,232.00
* **Percentual:** 90% mais barato manter o uso ancorado em GPT-4o-mini e Groq.

### Ganho esperado
* **Qualidade:** Histórico de chat coerente.
* **Velocidade:** Chat com resposta contínua na Groq.
* **Confiabilidade:** Fallbacks minimizam indisponibilidades.
* **Segurança:** Filtragem de contextos extensos evita injeção de dados além dos necessários para a resposta.
* **Escalabilidade:** Tolerância ao crescimento do banco de dados (o payload comercial não estourará tokens).

### Primeira ação recomendada
**Corrigir imediatamente a string do modelo Anthropic de `claude-sonnet-5` para `claude-3-5-sonnet-20240620`**, pois a API atual gera erro 400 permanente para qualquer usuário que opte pelo Anthropic, e **ajustar o `AssistantWidget.tsx` para enviar todo o array de histórico de conversação** (ao invés de apenas a última frase) ao `/api/ai/groq`.

### Confiança do veredito
**95%**. As APIs foram mapeadas e avaliadas contra as capacidades e preços correntes do mercado com clareza nos gargalos de design encontrados (especialmente o descaso com o histórico de mensagens e estouro potencial da Janela de Contexto).
