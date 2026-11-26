# Carteira Consolidada sem dependência do Render

## Objetivo

A Carteira Consolidada não deverá realizar chamadas ao serviço Render do Robô Financeiro em produção.

## Origem por domínio

| Domínio | Origem principal | Acesso da Carteira |
|---|---|---|
| Catálogo, logos e metadados | Neon | View de leitura autenticada |
| Cotações e históricos | Neon | View paginada |
| Fundamentos e indicadores | Neon | Views por ativo e período |
| Proventos e data-ex | Neon | View reconciliada por ticker e classe |
| Eventos corporativos | Neon | View com fator e data efetiva |
| Oportunidades | Neon | View de triagem explicável |
| Documentos PDF | Google Drive | URL controlada ou função intermediária |
| Dados pessoais, posições e transações | Supabase | RLS por usuário |

## Arquitetura de acesso

1. O usuário autentica no Supabase.
2. A Carteira envia o JWT da sessão para o endpoint de leitura.
3. A camada de leitura consulta somente views do schema `carteira_api` no Neon.
4. A camada de leitura aplica paginação, limites e filtros por ticker, classe e período.
5. Documentos do Drive são entregues por URL controlada, sem credencial do Drive no navegador.

A primeira opção será Neon Data API com autenticação compatível com a sessão Supabase. Se houver incompatibilidade de JWT ou RLS, será usada uma Supabase Edge Function com permissão somente de leitura no schema `carteira_api`.

## Critério de conclusão

A migração somente será concluída quando a Carteira funcionar com as chamadas ao Render bloqueadas, incluindo catálogo, logos, cotações, históricos, fundamentos, proventos, eventos, oportunidades, documentos e resumos.
