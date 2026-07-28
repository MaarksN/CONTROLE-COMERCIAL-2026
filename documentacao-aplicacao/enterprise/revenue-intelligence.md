# Revenue Intelligence, Health Score, Alertas e Seller Score

Este documento descreve os quatro motores adicionados ao Controle Comercial
2026: **Revenue Intelligence** (`app/deriveRevenueIntelligence.ts`), **Sales
Health Score** (`app/deriveHealthScore.ts`), **Smart Alerts**
(`app/deriveAlerts.ts`) e **Sales Performance Score**
(`app/deriveSellerScore.ts`). Todos são funções puras, testadas em
`tests/derive*.test.ts`, que recebem os dados já existentes (`commercial_deals`,
`monthly_metrics`, `seller_growth_targets`, `dataQualityIssues`) e nunca
inventam números: quando um dado necessário não existe, o motor retorna um
estado explícito de indisponibilidade em vez de um valor fabricado.

## Por que um motor de regras, não um modelo estatístico

O dataset tem ~85 negócios em 2026 e 7 meses de histórico mensal consolidado
— volume insuficiente para treinar ou validar um modelo estatístico/ML
responsável. Por isso, toda a "inteligência" aqui é um **motor de regras
determinístico e explicável**: cada número exibido na interface carrega os
fatores exatos que o produziram (`factors`, `formula`, `detail` em cada
função). Isso é intencional e documentado no próprio código-fonte.

## Revenue Intelligence (`app/deriveRevenueIntelligence.ts`)

### Probabilidade dinâmica por negócio — `computeDealProbability`

Probabilidade-base por etapa (`aberto` 35%, `ganho` 75%, `faturado` 92%,
`pago` 100%), ajustada por penalidades reais:

| Fator | Fonte do dado | Penalidade |
|---|---|---|
| Parado (dias desde `updatedAt`) | `commercial_deals.updated_at` | −5% (15d) / −15% (30d) / −30% (60d) |
| Ciclo acima da média | `proposalAcceptedAt` vs. `averageSalesCycle` | −10% (1.5x) / −20% (2.5x) |
| Ticket atípico vs. média do vendedor | `adjusted` vs. média do `owner` | −10% (2x) / −20% (3x) |
| Desconto/ajuste acima do padrão | `(sold - adjusted) / sold` | −10% (>50%) / −20% (>75%) |

Probabilidade final limitada a [5%, 97%] para etapas abertas; `pago` é
sempre 100% (já realizado, não é mais previsão).

### Classificação de receita — `classifyRevenue`

- **Realizada**: soma de `adjusted` para negócios em etapa `pago`.
- **Comprometida**: soma de `adjusted` para `ganho`/`faturado`.
- **Pipeline aberto**: soma de `adjusted` para `aberto`.
- **Em risco**: subconjunto de aberto/ganho com ≥21 dias sem atualização OU
  ticket >2x a média do vendedor — os únicos dois sinais de risco que este
  dataset realmente suporta (não existe campo de "próxima atividade"/
  engajamento de CRM para checar).

### Forecast — `computeForecastScenarios`

```
Pipeline ponderado = Σ valor do negócio × probabilidade dinâmica
Commit             = realizado + comprometido
Best Case          = Commit + 100% do pipeline aberto
Forecast IA        = Commit + pipeline ponderado
Gap                = meta do mês − Forecast IA
Meta diária        = Gap ÷ dias restantes no mês (quando Gap > 0)
Aderência projetada = Forecast IA ÷ meta (rótulo explícito: estimativa
                       determinística, não uma probabilidade estatística)
```

### Confiança da previsão — `computeForecastConfidence`

Nunca retorna uma porcentagem fabricada — apenas `"alta"`/`"moderada"`/
`"baixa"` com os motivos exatos (meses de histórico, volume de negócios,
completude de datas). Abaixo de 6 meses de histórico ou 5 negócios no
escopo, o rótulo é sempre `"baixa"`.

## Sales Health Score (`app/deriveHealthScore.ts`)

Score 0-100, composto por 7 dimensões (das 9 sugeridas originalmente —
"Produtividade" e "Retenção/Satisfação" foram omitidas por não terem fonte de
dado real neste app: não há log de atividades nem módulo de CS/NPS):

| Dimensão | Peso | Fórmula |
|---|---|---|
| Pipeline | 20% | pipeline aberto ÷ gap para a meta do mês |
| Conversão | 15% | negócios além de "aberto" ÷ total |
| Receita | 15% | atingimento YTD |
| CRM/Qualidade de dados | 15% | 100 − penalidade por severidade (real, de `dataQualityIssues`) − % campos ausentes |
| Follow-up | 15% | 1 − (negócios parados ≥30d ÷ total aberto/comprometido) |
| Forecast | 15% | % de meses fora da faixa crítica |
| Velocidade | 5% | ciclo médio vs. teto assumido de 30 dias (premissa de negócio documentada, não benchmark externo) |

Faixas: 90-100 excelente · 80-89 saudável · 70-79 atenção · 60-69 risco · <60
crítico. Cada dimensão é clicável na interface e abre os negócios que a
compõem (drill-down).

## Smart Alerts (`app/deriveAlerts.ts`)

Alertas são recomputados a cada leitura (não são um snapshot estático) e
identificados por uma `key` determinística, para que o estado de interação
humana (dispensar/resolver) sobreviva à recomputação. Regras: receita em
risco, meses críticos de meta, concentração de carteira (≥35%/50%), negócios
parados por vendedor, problemas de qualidade de dados (os 7 reais da
auditoria original), e vendedores abaixo da própria meta de crescimento
mensal. Nenhum texto é gerado por IA/LLM — tudo é template preenchido com
números reais.

Persistência: tabela `alert_state` (auto-criada, mesmo padrão de
`seller_growth_targets`) guarda apenas `status`/`justification`/`actor_email`
por `key`; o conteúdo do alerta em si nunca é armazenado, só recalculado.
Rotas: `GET /api/alerts`, `PATCH /api/alerts/[key]`.

## Sales Performance Score (`app/deriveSellerScore.ts`)

Score 0-100 por vendedor: meta de crescimento (30%), participação na receita
(20%), conversão para faturamento (20%), follow-up da carteira (20%),
velocidade vs. média da empresa (10%). Duas dimensões do spec original são
explicitamente marcadas como **indisponíveis** (`available: false`) em vez de
receberem um número:

- **Atividades** (ligações, reuniões, e-mails): requer integração de CRM/
  atividades que não existe hoje.
- **Meta de crescimento / velocidade**: quando o vendedor não tem meta
  definida ou não tem negócios com ciclo completo, a dimensão aparece como
  indisponível com a nota exata do que falta.

## Limitações conhecidas (do spec original, não implementadas nesta fase)

Sem fonte de dado real hoje neste aplicativo — implementá-las agora exigiria
inventar números, o que violaria a regra do próprio spec de "nunca inventar
resultados":

- Jornada completa Marketing → SDR → Closer → Implantação → CS → Renovação →
  Upsell → Financeiro → NPS (só existe o trecho Closer → Faturamento/Pago).
- Copiloto de IA comercial (perguntas em linguagem natural, recomendações
  geradas por LLM).
- Digital Twin / simulador de cenários.
- Governança multi-tenant (esta é uma aplicação de uma única empresa).
- Pesos de score configuráveis por empresa/perfil (constantes documentadas no
  código; não há UI de configuração multi-tenant).
- Métricas de RevOps que dependem de custo (CAC, payback) — não há dados de
  custo de marketing/vendas importados.
- Dimensões de atividade de CRM (ligações, e-mails, reuniões) no Sales
  Performance Score.

Cada uma dessas lacunas está sinalizada explicitamente na interface (estado
vazio com a nota do dado faltante) em vez de omitida silenciosamente.
