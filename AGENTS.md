# Diretrizes do Agente - CONTROLE-COMERCIAL-2026

## 1. Contexto do Projeto
- Sistema de Governança Comercial, Gestão de Metas 2026, Forecast e Integração Bitrix24.

## 2. Regras de Código & Arquitetura
- Escreva código completo de nível de produção. NUNCA use comentários como `// TODO: implementar` ou omita trechos de código.
- Stack: Next.js (App Router), Drizzle ORM / SQLite / Postgres, Python (scripts de dados e refatoração).
- Preserve os cálculos de atingimento de cota e projeção financeira sem alterar a precisão decimal.
- Ao rodar scripts Python (`refactor_*.py`), certifique-se de manter compatibilidade com o schema do Drizzle.
- NUNCA commite o arquivo `.sites-deploy.tgz` ou credenciais do Bitrix24 no Git.

## 3. Padrões de Testes & Documentação
- Execute a suíte de testes Vitest (`vitest.config.ts`) antes de criar novos builds.
- Atualize a documentação em `documentacao-aplicacao/` após alterações estruturais.
