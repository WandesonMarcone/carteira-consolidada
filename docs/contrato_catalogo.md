# Contrato proposto: catálogo de ativos (pendente no Robô)
A Carteira não acessa Neon, Drive ou credenciais administrativas do Robô. Reutiliza o Bearer Supabase.
GET /api/v1/assets?asset_type=stock|fii|etf|bdr|crypto|fixed_income&page=1&page_size=24&q=&sector=
Resposta: { "data": [{ "ticker": "...", "asset_type": "stock", "name": "...", "sector": "...", "subsector": "...", "price": null, "logo_url": null, "updated_at": null }], "total": 0, "has_more": false, "sectors": [] }
O catálogo deve paginar a base consolidada, fornecer nome oficial, classificação e logo cacheada quando disponível; preço, logo e datas ausentes permanecem nulos. Logos devem ser URLs HTTPS acessíveis ao navegador sem segredo e sem expor acesso ao Drive. Filtrar pelo nome/ticker é opcional. Classes sem catálogo suportado devem declarar indisponibilidade. O endpoint ainda não existe no Robô; até sua implementação o frontend exibe apenas posições próprias, com aviso. Não alterar o Robô nesta PR.
