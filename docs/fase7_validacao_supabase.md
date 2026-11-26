# Validação Supabase — Fase 7

Projeto: `jhhacvkdiiucotnofjtw`

## Resultado

- Tabelas pessoais confirmadas: `profiles`, `institutions`, `positions`, `transactions`, `portfolio_preferences`, `goals`, `user_roles` e `personal_valuations`.
- Todas as tabelas listadas estão com RLS habilitado.
- O frontend usa somente a chave publicável do Supabase.
- Posições, transações e valuations usam `auth.uid()` como proprietário padrão.
- Nenhuma credencial `service_role` foi encontrada no código da Carteira.

## Compatibilidade planejada

A Neon Data API foi configurada para validar JWTs pelo JWKS do Supabase, com audience `authenticated`. A leitura autenticada ainda precisa ser testada com um JWT emitido por uma sessão real do usuário.

## Achado de segurança

O advisor do Supabase apontou que a proteção contra senhas vazadas está desativada. Essa configuração é uma pendência de segurança do projeto Supabase e não foi alterada automaticamente nesta migração.
