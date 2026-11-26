# Fase 7 — prova isolada da Neon Data API

- Branch de teste do Neon: `fase7-carteira-schema-test`.
- Branch id: `br-orange-cell-avhl9tat`.
- Schema criado: `carteira_api`.
- Views criadas: `ativos`, `cotacoes_acoes`, `cotacoes_fiis`, `fundamentos`, `indicadores_valuation`, `proventos`, `eventos_corporativos`, `oportunidades`, `instrumentos` e `mercado`.
- Neon Data API provisionada somente nessa branch, com schema `carteira_api` e JWT externo do Supabase.
- Endpoint sem token respondeu HTTP 401, confirmando que a API não está pública.
- A branch de produção não foi alterada.

A próxima validação precisa usar um JWT real da sessão Supabase em ambiente de teste e confirmar leitura, CORS, filtros e paginação. Depois será criada a mesma estrutura na branch de produção, com permissões restritas e revisão do contrato antes da troca do frontend.
