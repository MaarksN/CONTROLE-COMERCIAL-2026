# 1. Resumo executivo
O Atlas Comercial 360 é uma aplicação de controle comercial robusta que centraliza dados, métricas, pipeline de negócios e acompanhamento de OKRs em um único ambiente integrado. A plataforma é desenhada para líderes comerciais e equipes de vendas, facilitando a visualização rápida da saúde do negócio e da performance da equipe, e promovendo alinhamento por meio de dados claros e estruturados. Os principais benefícios incluem a centralização das informações de governança e vendas, a fácil navegabilidade por áreas de interesse (como Dashboard analítico e Visão completa), e a organização de metas e OKRs.

# 2. Objetivo da plataforma
A plataforma tem como principal objetivo unificar a operação de controle comercial. Ela centraliza atividades como o acompanhamento de metas (YTD), gerenciamento de negócios ativos (pipeline), verificação de indicadores de crescimento, supervisão do desempenho da equipe e monitoramento de OKRs e governança. Dessa forma, ela elimina a necessidade de múltiplas ferramentas desconexas, oferecendo uma visão unificada que apoia decisões rápidas e embasadas.

# 3. Estrutura da navegação
- **Capa (Tela Inicial)**
  - Dashboard
  - Visão completa
- **Menu Lateral**
  - Dashboard (00)
  - Visão completa (01)
  - Negócios (02)
  - OKRs (03)
  - Equipe & canais (04)
  - Governança (05)
  - Base completa (06)

# 4. Inventário de telas
| Nº | Tela | Módulo | Finalidade | Recursos presentes | Arquivo da imagem |
|---|---|---|---|---|---|
| 1 | Capa | Capa | Ponto de entrada | Cards de atalho | 01-capa-inicial.png |
| 2 | Dashboard | Dashboard | Análise macro | Indicadores de crescimento | 01-dashboard-principal.png |
| 3 | Visão completa | Geral | Visão unificada | Menu lateral e resumo | 01-visao-completa.png |
| 4 | Negócios | Pipeline | Gestão de deals | Lista de pipeline | 02-pipeline-negocios.png |
| 5 | OKRs | OKRs | Acompanhamento estratégico | Progresso de OKRs | 03-okrs.png |
| 6 | Equipe & canais | Equipe | Análise de desempenho | Lista de membros/canais | 04-equipe-canais.png |
| 7 | Governança | Governança | Rotinas operacionais | Status de ritos | 05-governanca.png |
| 8 | Base completa | Dados | Visualização crua de dados | Formato tabela | 01-base-completa.png |

# 5. Descrição dos módulos
- **Capa**: Apresenta os dois caminhos principais (Dashboard analítico ou Visão completa).
- **Dashboard**: Focado em dados agregados, comparação ano-a-ano, desempenho mensal, meses acima da meta e identificação de gargalos.
- **Visão Completa**: Une receita, pipeline, equipe, OKRs e governança em uma única tela.
- **Negócios**: Gerenciamento do pipeline de vendas e negócios em andamento.
- **OKRs**: Acompanhamento dos Objectives and Key Results, avaliando o progresso das metas estratégicas.
- **Equipe & canais**: Avaliação de desempenho individual e por canais de aquisição.
- **Governança**: Gestão de rotinas, reuniões e processos internos.
- **Base completa**: Acesso aos dados brutos ou em formato de planilhas para validação de dados detalhados.

# 6. Fluxos existentes
1. **Acesso inicial**: Usuário entra na página e decide qual visão acessar (Dashboard ou Visão Completa).
2. **Consulta de desempenho macro**: Através do Dashboard, consulta crescimento YOY e meses na meta.
3. **Consulta de negócios (Pipeline)**: Pela navegação lateral, acessa "Negócios" para visualizar deals.
4. **Consulta de metas de equipe**: Acesso a "Equipe & canais" para ver desempenho dos vendedores.
5. **Auditoria de dados**: Acesso a "Base completa" para checar fontes de dados brutos.

# 7. Componentes encontrados
- Botões de navegação lateral (menu)
- Cards de resumo (Capa)
- Indicadores numéricos e textuais
- Estrutura de planilhas
- Elementos de lista (pipeline/equipe)
- Componentes de progresso (OKRs)
- Modais (para edição, não acionados diretamente, mas presentes no código)

# 8. Conteúdo e dados apresentados
- Indicadores financeiros (Receita ajustada, Meta YTD, Crescimento YOY)
- Métricas operacionais (Meses acima da meta, Gargalos, Negócios ativos)
- Informações sobre a equipe e canais
- Status de OKRs e métricas de acompanhamento estratégico.

# 9. Experiência atual
A aplicação oferece uma interface limpa, bem estruturada e de carregamento rápido. A divisão entre uma visão executiva ("Dashboard") e uma detalhada ("Visão completa") garante que a ferramenta atenda tanto necessidades gerenciais quanto operacionais, proporcionando facilidade de uso e clareza na exposição dos dados.

# 10. Atualizações futuras
| Atualização futura | Benefício | Impacto esperado | Prioridade | Complexidade | Área relacionada |
|---|---|---|---|---|---|
| Criação de filtros globais por período na barra superior | Permitirá aos usuários cruzar rapidamente os dados por diferentes períodos (trimestre, semestre) | Maior agilidade na consulta histórica | Alta | Simples | Dashboard / Visão Completa |
| Inserção de gráficos interativos de tendências | Como recurso complementar, facilitará a visualização visual da performance ao longo do tempo | Melhor visualização analítica | Média | Moderada | Dashboard |
| Funcionalidade de exportação de relatórios em PDF | Uma próxima versão poderá oferecer a exportação executiva das telas para apresentações | Rapidez no compartilhamento de resultados | Baixa | Simples | Base Completa / Dashboard |

# 11. Sugestão de roadmap
## Próximo ciclo
- Criação de filtros globais por período na barra superior.
- Funcionalidade de exportação de relatórios em PDF.

## Médio prazo
- Inserção de gráficos interativos de tendências.

## Evolução estratégica
- Em atualizações futuras, poderá ser incorporado um módulo preditivo usando inteligência artificial para antecipar desvios de meta com base na velocidade do pipeline.

# 12. Arquivos produzidos
- Documento de briefing: `briefing/briefing-completo.md`, `briefing/resumo-executivo.md`
- Inventário de telas: `inventario/inventario-de-telas.csv`
- Imagens capturadas: localizadas em `imagens/`
- Vídeos gravados: `videos/apresentacao-completa.mp4`, `videos/demonstracao-dos-fluxos.mp4`
- Roteiro do vídeo: `roteiros/roteiro-apresentacao.md`, `roteiros/roteiro-demonstracao.md`
- Lista de atualizações futuras: `briefing/atualizacoes-futuras.md`
- Mapa de navegação: `inventario/mapa-de-navegacao.md`
- Roadmap sugerido: `briefing/roadmap.md`
