# Carteira Consolidada

Site pessoal de investimentos com contas individuais.

- **Supabase**: autenticação e posições privadas por usuário.
- **Robô Financeiro no Render**: consulta autenticada de cotação e indicadores.
- **GitHub Pages**: publicação estática e gratuita.

## Segurança

O arquivo `config.js` contém somente a URL e a chave publicável do Supabase. As tabelas usam RLS para que cada pessoa visualize e altere somente os próprios dados.

A API do Robô valida o token da conta Supabase antes de responder. Nenhuma chave administrativa, conexão Neon ou comando do Robô é enviado para o navegador.

## Variáveis no Render

- `PORTFOLIO_SUPABASE_URL`
- `PORTFOLIO_SUPABASE_PUBLISHABLE_KEY`
- `PORTFOLIO_WEB_ORIGINS`

A API será exposta apenas em modo de leitura em `/api/v1/assets/<ticker>`.