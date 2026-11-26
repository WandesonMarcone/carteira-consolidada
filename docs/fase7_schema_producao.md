# Fase 7 — estrutura de leitura na produção

- Schema `carteira_api` criado na branch principal do Neon.
- As dez views de leitura foram criadas sem modificar as tabelas públicas existentes.
- Neon Data API provisionada com JWT externo do Supabase.
- CORS limitado ao domínio do GitHub Pages.
- Role `authenticated` criada caso ausente e recebeu somente `USAGE` no schema e `SELECT` nas views.
- Acesso anônimo testado e bloqueado com HTTP 401.
- O frontend ainda não foi apontado para essa URL. A troca ocorrerá após validar um JWT real de sessão Supabase e comparar os formatos dos endpoints.
