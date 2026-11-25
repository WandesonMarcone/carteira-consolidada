# Integração frontend — layout aprovado (mobile e desktop)

O frontend reutiliza Supabase Auth e tabelas positions, transactions, personal_valuations, além dos endpoints existentes do Robô. Não acessa Neon ou Drive diretamente. O layout utiliza dados reais ou estados vazios, não o conteúdo fictício do protótipo.

## Disponíveis no contrato do Robô
GET /api/v1/assets/{ticker}, /history, /income, /corporate-events, /performance, /fundamentals, /coverage; GET /api/v1/market/overview. Bearer Supabase. Validar cobertura e produção antes de declarar funcionalidade completa.

## Pendências prioritárias no Robô
1. PR #86: GET /api/v1/assets com paginação, filtros por classe/nome/setor, catálogo consolidado. Retornar data[], total, has_more, sectors[] e ticker, asset_type, name, sector, subsector, price, updated_at, logo_url em cada registro. Confirmar compatibilidade com docs/contrato_catalogo.md.
2. Logos web: HTTPS acessível ao navegador sem token em URL, cache aprovado, sem credenciais Drive/Logo.dev. Nome e logo também no detalhe. Campo ausente null. Ativar mídia somente após validação de licenças e segurança.
3. Complementar histórico de preços, proventos, eventos e fatos oficiais quando houver lacunas; distinguir insuficiência de zero e classe não aplicável. Usar coverage apenas para ações nesta Carteira, não criar metodologias FII/ETF/BDR.
4. Opcional: GET /api/v1/assets/{ticker}/documents com metadados e links públicos oficiais (não Drive privado); benchmark histórico de CDI, IPCA, IBOV e IFIX em endpoint próprio; cotação consolidada em lote para reduzir chamadas. Definir contrato antes de integrar.
5. Renda fixa requer catálogo e regras próprias; não tratar títulos como ações.

## Pendências locais
- Escopo atual de metodologias para ações: Graham, Bazin, Gordon, Peter Lynch, projeção de lucros históricos e múltiplos do setor. FCFF e FCFE não são apresentados. Crescimento, retorno exigido, yield, prazo, payout projetado, P/L, PEG e múltiplos setoriais são editáveis pelo usuário; os botões de sugestão apenas preenchem valores para simulação.
- A migration `20261125204427_expand_personal_valuation_methods.sql` amplia a constraint de `personal_valuations` para salvar as premissas dos métodos. Ela já foi aplicada no Supabase e a constraint foi consultada para confirmar os métodos permitidos. Proventos coletados do Yahoo são complementares e devem ser reconciliados com B3/CVM antes de serem tratados como oficiais.
- Múltiplos setoriais ainda são informados manualmente; comparação automática exige catálogo de pares do mesmo setor e normalização dos indicadores.
- Validar cálculo de carteira, transações e proventos ponta a ponta com conta de teste e histórico completo. Não afirmar rentabilidade certificada.
- Deploy Pages separado em build/deploy para evitar corrida de disponibilidade do artefato. Validação no navegador autenticado ainda necessária.
