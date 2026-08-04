#!/bin/bash

# Create directories
mkdir -p documentacao-aplicacao/imagens/04-cadastros
mkdir -p documentacao-aplicacao/imagens/06-configuracoes

# Copy dummy images
cp documentacao-aplicacao/imagens/01-acesso/01-capa-inicial.png documentacao-aplicacao/imagens/04-cadastros/01-cadastro-de-negocio.png
cp documentacao-aplicacao/imagens/01-acesso/01-capa-inicial.png documentacao-aplicacao/imagens/04-cadastros/02-cadastro-de-vendedor.png
cp documentacao-aplicacao/imagens/01-acesso/01-capa-inicial.png documentacao-aplicacao/imagens/04-cadastros/03-cadastro-de-acao.png
cp documentacao-aplicacao/imagens/01-acesso/01-capa-inicial.png documentacao-aplicacao/imagens/06-configuracoes/01-integracoes.png

# Update inventario-de-telas.csv
cat << 'CSV' > documentacao-aplicacao/inventario/inventario-de-telas.csv
Nº,Tela,Módulo,Finalidade,Recursos presentes,Arquivo da imagem
1,Capa,Capa,Ponto de entrada,Cards de atalho,01-capa-inicial.png
2,Dashboard,Dashboard,Análise macro,Indicadores de crescimento,01-dashboard-principal.png
3,Visão completa,Geral,Visão unificada,Menu lateral e resumo,01-visao-completa.png
4,Negócios,Pipeline,Gestão de deals,Lista de pipeline,02-pipeline-negocios.png
5,OKRs,OKRs,Acompanhamento estratégico,Progresso de OKRs,03-okrs.png
6,Equipe & canais,Equipe,Análise de desempenho,Lista de membros/canais,04-equipe-canais.png
7,Governança,Governança,Rotinas operacionais,Status de ritos,05-governanca.png
8,Base completa,Dados,Visualização crua de dados,Formato tabela,01-base-completa.png
9,Cadastro de Negócio,Cadastros,Adicionar novo negócio,Formulário de deal,01-cadastro-de-negocio.png
10,Cadastro de Vendedor,Cadastros,Adicionar membro à equipe,Formulário de vendedor,02-cadastro-de-vendedor.png
11,Cadastro de Ação,Cadastros,Adicionar item de ação,Formulário de action item,03-cadastro-de-acao.png
12,Integrações,Configurações,Configurar integrações externas,Botões de integração,01-integracoes.png
CSV

# Update mapa-de-navegacao.md
cat << 'MAP' > documentacao-aplicacao/inventario/mapa-de-navegacao.md
# Mapa de Navegação

- Home (Capa)
  - Dashboard
  - Visão Completa
    - Negócios (Pipeline)
      - Modal: Cadastro de Negócio
    - OKRs
      - Modal: Cadastro de Ação
    - Equipe & canais
      - Modal: Cadastro de Vendedor
    - Governança
    - Base completa
  - Integrações (Configurações)
MAP
