# Fase 7 — Auditoria inicial da Carteira Consolidada

Data: 26/11/2026

## Estado encontrado

- O frontend usa Supabase para autenticação, posições, transações e valuations pessoais.
- O frontend consulta o Robô Financeiro por `config.roboApiUrl`, atualmente `https://robo-fii-v2.onrender.com`.
- As consultas de mercado enviam o token da sessão Supabase no cabeçalho `Authorization`.
- O frontend não contém string SQL, credencial administrativa do Neon ou chave privada.
- As chamadas atuais usam `/api/v1/assets`, `/history`, `/income`, `/corporate-events`, `/performance` e `/fundamentals`.
- Há cache em memória por usuário, carregamento progressivo e até seis workers simultâneos.

## Dependência atual

`config.js` mantém a URL do Render e `assets/app.js` a utiliza em todas as consultas financeiras. A migração operacional ainda não começou.

## Neon auditado

O banco `banco-investbot` possui 64 tabelas no schema `public`, incluindo catálogo, cotações, históricos, fundamentos, proventos, eventos, oportunidades e dados de mercado. Não existe ainda o schema `carteira_api`.

Tabelas candidatas para views de leitura incluem `ativos_catalogo`, `ativos`, `dados_financeiros_acoes`, `dados_financeiros_fiis`, `fundamentos_ativos`, `indicadores_valuation_ativos`, `proventos_ativos`, `eventos_corporativos_ativos`, `observacoes_instrumentos_internacionais`, `observacoes_mercado`, `series_mercado`, `oportunidades_triagem` e `resumos_ativos`.

## Backup e isolamento

- Branch local: `fase7-auditoria-neon`.
- Tag local: `fase7-backup-2026-11-26`.
- Branch Neon sem compute: `fase7-carteira-auditoria-2026-11-26`.
- Produção não foi alterada.

## Próxima etapa

Modelar o contrato de leitura do schema `carteira_api`, confrontar cada endpoint atual com as tabelas disponíveis e escolher entre Neon Data API e Edge Functions. Nenhuma credencial administrativa será levada ao frontend.
