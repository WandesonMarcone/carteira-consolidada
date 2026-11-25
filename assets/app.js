import { setupWorkspace, renderWorkspace, resetWorkspace } from "./workspace.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.CARTEIRA_CONFIG;
const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dates = new Intl.DateTimeFormat("pt-BR");
const types = { fii: "FII", stock: "Ação", etf: "ETF", bdr: "BDR", fixed_income: "Renda fixa", crypto: "Cripto", other: "Outro" };
const apiTypes = new Set(["stock", "fii", "etf", "bdr", "crypto", "currency"]);
let positions = [], transactions = [], quotes = {}, currentUser = null;
const $ = s => document.querySelector(s);
const dateISO = d => new Date(d).toISOString().slice(0, 10);
const number = v => Number(v || 0);
const escape = s => String(s ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
const message = (selector, text, error = false) => { const el = $(selector); el.textContent = text; el.classList.toggle("error", error); };
const assetKey = p => `${p.asset_type}:${p.ticker}`;
const api = async path => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sessão encerrada.");
  const response = await fetch(config.roboApiUrl + path, { headers: { Authorization: `Bearer ${session.access_token}` } });
  if (!response.ok) throw new Error(`API do Robô indisponível (${response.status}).`);
  return response.json();
};
const positionValue = p => number(quotes[assetKey(p)]?.price || p.average_price) * number(p.quantity);
const transactionTotal = t => number(t.total_value) || number(t.quantity) * number(t.unit_price);
const validFactor = event => {
  const kind = String(event.event_type || event.type || event.kind || "").toLowerCase();
  const factor = number(event.factor);
  return factor > 0 && (kind.includes("desdob") || kind.includes("split") || kind.includes("grup") || kind.includes("reverse")) ? factor : 1;
};
const eventDate = event => event.effective_date || event.date || event.ex_date || null;
const incomeDate = income => income.ex_date || income.date || income.payment_date || null;
const pointDate = point => point.date || point.reference_date || point.observed_at?.slice(0, 10);
const pointPrice = point => number(point.price || point.close || point.closing_price || point.value);

function normalizedList(payload) { return Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []; }
function eventAdjustedQuantity(p, atDate, events = []) {
  let quantity = 0;
  for (const t of transactions.filter(t => t.ticker === p.ticker && t.asset_type === p.asset_type && t.traded_at <= atDate)) {
    const signal = t.operation === "sell" ? -1 : (t.operation === "buy" || t.operation === "adjustment" ? 1 : 0);
    if (!signal) continue;
    const factor = events.filter(event => {
      const day = eventDate(event);
      return day && day >= t.traded_at && day <= atDate;
    }).reduce((total, event) => total * validFactor(event), 1);
    quantity += signal * number(t.quantity) * factor;
  }
  return Math.max(0, quantity);
}
function svgChart(points, valueField, label) {
  const valid = points.filter(p => Number.isFinite(number(p[valueField])));
  if (valid.length < 2) return '<p class="empty">Série insuficiente para formar este gráfico.</p>';
  const values = valid.map(p => number(p[valueField])); const min = Math.min(...values); const max = Math.max(...values); const spread = max - min || 1;
  const coords = valid.map((p, i) => `${10 + (i / (valid.length - 1)) * 580},${200 - ((number(p[valueField]) - min) / spread) * 165}`).join(" ");
  return `<svg viewBox="0 0 600 220" role="img" aria-label="${escape(label)}"><line class="grid" x1="10" x2="590" y1="35" y2="35"/><line class="grid" x1="10" x2="590" y1="117" y2="117"/><line class="grid" x1="10" x2="590" y1="200" y2="200"/><polyline class="line" points="${coords}"/><text x="12" y="25">${money.format(max)}</text><text x="12" y="216">${money.format(min)}</text></svg>`;
}
function xirr(flows) {
  if (flows.length < 2 || !flows.some(f => f.amount < 0) || !flows.some(f => f.amount > 0)) return null;
  const t0 = new Date(flows[0].date + "T12:00:00Z");
  const npv = rate => flows.reduce((sum, flow) => sum + flow.amount / Math.pow(1 + rate, (new Date(flow.date + "T12:00:00Z") - t0) / 86400000 / 365), 0);
  let rate = 0.1;
  for (let i = 0; i < 80; i++) { const value = npv(rate), h = 0.000001, slope = (npv(rate + h) - value) / h; if (!Number.isFinite(slope) || Math.abs(slope) < 1e-10) return null; const next = rate - value / slope; if (!Number.isFinite(next) || next <= -0.9999 || next > 1000) return null; if (Math.abs(next - rate) < 1e-7) return next; rate = next; }
  return null;
}
function portfolioHistory(priceSeriesByAsset, eventSeriesByAsset) {
  const allDates = [...new Set(Object.values(priceSeriesByAsset).flat().map(pointDate).filter(Boolean))].sort();
  return allDates.map(day => {
    let value = 0, cash = 0, externalFlow = 0;
    for (const p of positions) {
      const key = assetKey(p); const points = priceSeriesByAsset[key] || [];
      const last = [...points].reverse().find(point => pointDate(point) <= day); if (!last) continue;
      const quantity = eventAdjustedQuantity(p, day, eventSeriesByAsset[key] || []);
      value += quantity * pointPrice(last);
    }
    for (const t of transactions.filter(t => t.traded_at <= day)) {
      const total = transactionTotal(t);
      if (t.operation === "dividend") cash += total;
      if (t.operation === "fee") cash -= total;
      if (t.traded_at === day && t.operation === "buy") externalFlow += total;
      if (t.traded_at === day && t.operation === "sell") externalFlow -= total;
    }
    return { date: day, value: value + cash, externalFlow };
  });
}
function twr(points) {
  if (points.length < 2) return null; let factor = 1;
  for (let i = 1; i < points.length; i++) { const base = points[i - 1].value + points[i].externalFlow; if (base > 0 && points[i].value >= 0) factor *= points[i].value / base; }
  return (factor - 1) * 100;
}
function statusText(record) {
  const source = record?.source || "fonte não informada"; const quality = record?.source_quality || record?.quality || "qualidade não informada";
  return `${source} • ${quality}`;
}
async function loadQuotes() {
  quotes = {};
  await Promise.all(positions.map(async p => { if (!apiTypes.has(p.asset_type)) return; try { const response = await api(`/api/v1/assets/${encodeURIComponent(p.ticker)}?asset_type=${encodeURIComponent(p.asset_type)}`); const data = response.data || response; if (number(data.price) > 0) quotes[assetKey(p)] = data; } catch (_) {} }));
}
async function loadData() {
  const [p, t] = await Promise.all([
    supabase.from("positions").select("*").order("ticker"),
    supabase.from("transactions").select("*").order("traded_at")
  ]);
  if (p.error || t.error) { message("#app-message", "Não foi possível carregar seus dados privados.", true); return; }
  positions = p.data || []; transactions = t.data || []; await loadQuotes(); render();
}
function render() {
  renderWorkspace({ positions, transactions, quotes, types, money, positionValue, transactionTotal, operationName });
  const invested = positions.reduce((sum, p) => sum + number(p.average_price) * number(p.quantity), 0);
  const marketValue = positions.reduce((sum, p) => sum + positionValue(p), 0);
  $("#total-invested").textContent = money.format(invested); $("#total-value").textContent = money.format(marketValue); $("#total-assets").textContent = positions.length;
  $("#market-status").textContent = `${Object.keys(quotes).length} de ${positions.length} ativos com cotação da API`; $("#updated-at").textContent = positions.length ? "Dados pessoais e mercado atualizados agora." : "Cadastre uma posição e as transações reais para medir a rentabilidade.";
  const list = $("#positions-list");
  const term = ($("#position-search").value || "").trim().toUpperCase(), filter = $("#position-filter").value;
  const shown = positions.filter(p => (!filter || p.asset_type === filter) && p.ticker.includes(term));
  list.innerHTML = shown.length ? shown.map(p => { const quote = quotes[assetKey(p)]; return `<div class="position-row"><div><div class="ticker">${escape(p.ticker)}</div><div class="asset-type">${types[p.asset_type] || escape(p.asset_type)}</div></div><div class="asset-meta">${number(p.quantity).toLocaleString("pt-BR")} unidades<br>PM ${money.format(p.average_price)}</div><div class="value"><strong>${money.format(positionValue(p))}</strong><small>${quote?.price ? `Cotação: ${money.format(quote.price)}` : "Sem cotação: preço médio"}</small></div><div class="row-actions"><button class="secondary analyze" data-id="${p.id}">Analisar</button><button class="secondary transact" data-id="${p.id}">Transação</button><button class="secondary edit" data-id="${p.id}">Editar</button></div></div>`; }).join("") : '<p class="empty">Nenhuma posição encontrada.</p>';
  document.querySelectorAll(".analyze").forEach(b => b.onclick = () => openAsset(positions.find(p => p.id === b.dataset.id)));
  document.querySelectorAll(".transact").forEach(b => b.onclick = () => openTransaction(positions.find(p => p.id === b.dataset.id)));
  document.querySelectorAll(".edit").forEach(b => b.onclick = () => openPosition(positions.find(p => p.id === b.dataset.id)));
  $("#transactions-list").innerHTML = transactions.length ? transactions.slice().reverse().slice(0, 8).map(t => `<li><b>${escape(t.ticker)}</b> • ${operationName(t.operation)} • ${dates.format(new Date(t.traded_at + "T12:00:00"))} • ${money.format(transactionTotal(t))}</li>`).join("") : '<li>Nenhuma transação registrada: TWR e XIRR ficam indisponíveis.</li>';
}
function operationName(op) { return ({ buy:"Compra", sell:"Venda", dividend:"Provento", fee:"Custo", adjustment:"Ajuste" })[op] || op; }
function openPosition(p, selected = null) { $("#position-form").reset(); $("#position-id").value = p?.id || ""; $("#position-title").textContent = p ? "Editar posição" : "Adicionar posição"; if (p) { $("#position-ticker").value = p.ticker; $("#position-type").value = p.asset_type; $("#position-quantity").value = p.quantity; $("#position-average").value = p.average_price; } if (selected) { $("#position-ticker").value=selected.ticker; $("#position-type").value=selected.asset_type; } $("#position-dialog").showModal(); }
function openTransaction(p) { $("#transaction-form").reset(); $("#transaction-position").value = p.id; $("#transaction-ticker").value = p.ticker; $("#transaction-type").value = p.asset_type; $("#transaction-date").value = dateISO(new Date()); $("#transaction-title").textContent = `Transação • ${p.ticker}`; $("#transaction-dialog").showModal(); }
async function personalValuation(p, method) { const result = await supabase.from("personal_valuations").select("*").eq("ticker", p.ticker).eq("asset_type", p.asset_type).eq("method", method).maybeSingle(); return result.data; }
async function saveValuation(p, method, ceiling, assumptions) { const { error } = await supabase.from("personal_valuations").upsert({ ticker:p.ticker, asset_type:p.asset_type, method, ceiling_price:ceiling, assumptions }, { onConflict:"user_id,ticker,asset_type,method" }); if (error) throw error; }
async function openAsset(p) {
  window.activeAsset = p;
  $("#asset-add").hidden=!!p.id;
  $("#asset-add").onclick=()=>{ $("#asset-dialog").close(); openPosition(null,p); };
  $("#asset-valuation").hidden=!["stock","fii"].includes(p.asset_type);
  $("#asset-valuation").onclick=()=>{ $("#asset-dialog").close(); $("#method-ticker").value=p.ticker; $("#method-class").value=p.asset_type; location.hash="metodologias"; $("#method-search").requestSubmit(); };
  $("#asset-identity").replaceChildren(); $("#asset-indicators").replaceChildren(); $("#asset-return").textContent="N/D"; $("#asset-return-detail").textContent="";
  $("#asset-title").textContent = `${p.ticker} • ${types[p.asset_type] || p.asset_type}`; if (!$("#asset-dialog").open) $("#asset-dialog").showModal();
  $("#asset-price-chart").innerHTML = ""; $("#asset-wealth-chart").innerHTML = ""; $("#asset-income").innerHTML = ""; $("#asset-events").innerHTML = ""; $("#asset-methods").innerHTML = ""; message("#asset-status", "Consultando dados autenticados do Robô…");
  if (!apiTypes.has(p.asset_type)) { message("#asset-status", "Esta classe não possui integração de mercado neste contrato.", true); $("#asset-methods").innerHTML = unavailable("Métodos de ações", "Esta classe utiliza modelo específico; não há valuation inventado."); return; }
  let asset = {}, history = [], incomes = [], events = [], performance = {};
  try {
    const type = encodeURIComponent(p.asset_type), ticker = encodeURIComponent(p.ticker), days = Number($("#period").value || 120);
    const [a,h,i,e,perf] = await Promise.all([api(`/api/v1/assets/${ticker}?asset_type=${type}`), api(`/api/v1/assets/${ticker}/history?asset_type=${type}&days=${days}`), api(`/api/v1/assets/${ticker}/income?asset_type=${type}&days=${days}`), api(`/api/v1/assets/${ticker}/corporate-events?asset_type=${type}&days=${days}`), api(`/api/v1/assets/${ticker}/performance?asset_type=${type}&days=${days}`)]);
    asset = a.data || a; history = normalizedList(h); incomes = normalizedList(i); events = normalizedList(e); performance = perf.data || perf;
    const coverage = h.coverage || {}; message("#asset-status", coverage.points ? `${coverage.points} pontos • ${coverage.first_date || "início não informado"} a ${coverage.last_date || "fim não informado"}` : `Período solicitado: ${days} dias. O Robô não retornou série consolidada.`);
  } catch (error) { message("#asset-status", error.message, true); }
  if (window.activeAsset !== p || !currentUser || !$("#asset-dialog").open) return;
  const identity=$("#asset-identity"); const image=document.createElement("img"); const logo=asset.logo_url||p.logo_url; if (typeof logo==="string"&&logo.startsWith("https://")) { image.src=logo; image.alt="Logo de "+p.ticker; image.referrerPolicy="no-referrer"; image.onerror=()=>image.remove(); identity.append(image); } const info=document.createElement("div"); info.textContent=[asset.name||p.name||p.ticker, asset.classification?.sector||p.sector, asset.price!=null?money.format(asset.price):null].filter(Boolean).join(" • "); identity.append(info);
  $("#asset-indicators").innerHTML=Object.entries(asset.indicators||{}).map(([k,v])=>`<article class="valuation"><span>${escape(k.toUpperCase())}</span><strong>${v==null?"N/D":escape(v)}</strong></article>`).join("");
  if (p.asset_type === "stock") {
    const capital = asset.share_capital || {};
    const integer = new Intl.NumberFormat("pt-BR", {maximumFractionDigits:0});
    const shares = v => v != null && Number.isSafeInteger(Number(v)) && Number(v)>=0 ? integer.format(Number(v)) : "Não confirmado";
    $("#asset-indicators").insertAdjacentHTML("beforeend", `<article class="valuation"><span>Ações do ticker (emitidas)</span><strong>${shares(capital.ticker_shares)}</strong></article><article class="valuation"><span>Total de ações da empresa</span><strong>${shares(capital.company_shares)}</strong><span>${capital.reference_date ? "Ref. "+escape(capital.reference_date)+" • "+escape(capital.source||"") : "Pendente de conciliação oficial"}</span><span>Não somar entre classes do mesmo emissor.</span></article>`);
  }
  const pricePoints = history.map(x => ({ date:pointDate(x), price:pointPrice(x) })).filter(x => x.date && x.price > 0); $("#asset-price-chart").innerHTML = svgChart(pricePoints, "price", "Evolução do preço");
  const wealth = pricePoints.map(point => ({ date:point.date, wealth:eventAdjustedQuantity(p, point.date, events) * point.price })); $("#asset-wealth-chart").innerHTML = transactions.some(t => t.ticker === p.ticker && t.asset_type === p.asset_type) ? svgChart(wealth, "wealth", "Patrimônio do ativo") : '<p class="empty">Registre compras e vendas para formar patrimônio pessoal sem supor quantidade histórica.</p>';
  renderIncome(p, incomes, events); renderEvents(events); await renderMethods(p, asset, history);
  const simple = performance.simple_total_return_percent; $("#asset-return").textContent = simple != null && Number.isFinite(Number(simple)) ? `${number(simple).toFixed(2)}%` : "N/D"; $("#asset-return-detail").textContent = simple != null && Number.isFinite(Number(simple)) ? "Retorno de 1 unidade no período, sem custos, impostos ou personalização." : "A API não forneceu retorno simples para o período.";
}
function unavailable(title, reason) { return `<article class="valuation unavailable"><span>${escape(title)}</span><strong>Indisponível</strong><span>${escape(reason)}</span></article>`; }
function renderIncome(p, incomes, events) {
  const rows = incomes.map(i => { const ex = incomeDate(i); const amount = number(i.amount_per_unit); const qty = ex ? eventAdjustedQuantity(p, ex, events) : 0; return { ex, amount, qty, total:amount * qty, source:statusText(i) }; });
  $("#asset-income").innerHTML = rows.length ? `<table><thead><tr><th>Data-ex</th><th>Valor/un.</th><th>Qtde elegível</th><th>Total</th><th>Origem</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escape(r.ex || "N/D")}</td><td>${money.format(r.amount)}</td><td>${r.ex ? r.qty.toLocaleString("pt-BR") : "N/D"}</td><td>${r.ex ? money.format(r.total) : "N/D"}</td><td>${escape(r.source)}</td></tr>`).join("")}</tbody></table>` : '<p class="empty">Nenhum provento retornado para o período. Ausência não é tratada como zero.</p>';
}
function renderEvents(events) { $("#asset-events").innerHTML = events.length ? `<ul class="records">${events.map(e => `<li><b>${escape(e.event_type || e.type || "Evento")}</b> • ${escape(eventDate(e) || "data não informada")} • fator ${validFactor(e)} • ${escape(statusText(e))}</li>`).join("")}</ul>` : '<p class="empty">Nenhum evento corporativo confirmado no período.</p>'; }
async function renderMethods(p, asset) {
  const container=$("#asset-methods"); container.replaceChildren();
  if(!["stock","fii"].includes(p.asset_type)){container.innerHTML=unavailable("Metodologias","Classe sem cobertura de valuation no contrato.");return;}
  const button=document.createElement("button");button.className="primary";button.textContent="Abrir central de metodologias";
  button.onclick=()=>{$("#asset-dialog").close();$("#method-ticker").value=p.ticker;$("#method-class").value=p.asset_type;location.hash="metodologias";$("#method-search").requestSubmit();};
  container.append(button);
}
async function openPerformance() {
  if (!$("#performance-dialog").open) $("#performance-dialog").showModal(); $("#portfolio-twr").textContent = "N/D"; $("#portfolio-xirr").textContent = "N/D"; message("#performance-status", "Calculando apenas com as suas transações e preços da API…"); $("#portfolio-chart").innerHTML = "";
  if (!transactions.length) { message("#performance-status", "Registre transações reais para calcular TWR e XIRR. Nenhum valor foi inventado.", true); return; }
  const days = Number($("#period").value || 120); const series = {}, events = {};
  await Promise.all(positions.filter(p => apiTypes.has(p.asset_type)).map(async p => { const key=assetKey(p), type=encodeURIComponent(p.asset_type), ticker=encodeURIComponent(p.ticker); try { const [h,e] = await Promise.all([api(`/api/v1/assets/${ticker}/history?asset_type=${type}&days=${days}`), api(`/api/v1/assets/${ticker}/corporate-events?asset_type=${type}&days=${days}`)]); series[key] = normalizedList(h); events[key] = normalizedList(e); } catch (_) { series[key] = []; events[key] = []; } }));
  const points = portfolioHistory(series, events); const flows = transactions.map(t => ({ date:t.traded_at, amount:t.operation === "buy" || t.operation === "fee" ? -transactionTotal(t) : t.operation === "sell" || t.operation === "dividend" ? transactionTotal(t) : 0 })).filter(f => f.amount); const last = points.at(-1); if (last) flows.push({ date:last.date, amount:last.value }); const twrValue = twr(points), xirrValue = xirr(flows);
  $("#portfolio-twr").textContent = twrValue == null ? "Indisponível" : `${twrValue.toFixed(2)}%`; $("#portfolio-xirr").textContent = xirrValue == null ? "Indisponível" : `${(xirrValue * 100).toFixed(2)}% a.a.`; $("#portfolio-chart").innerHTML = svgChart(points, "value", "Patrimônio pessoal"); message("#performance-status", points.length ? `Série pessoal: ${points.length} datas. TWR usa fluxo externo no fim do dia; XIRR usa compras, vendas, proventos, custos e valor final.` : "Não há preços históricos suficientes para montar a série pessoal.", !points.length);
}
function setupAuth() {
  document.querySelectorAll(".tab").forEach(b => b.onclick = () => { document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b)); $("#login-form").classList.toggle("hidden", b.dataset.tab !== "login"); $("#signup-form").classList.toggle("hidden", b.dataset.tab !== "signup"); });
  $("#login-form").onsubmit = async e => { e.preventDefault(); const { error } = await supabase.auth.signInWithPassword({ email:$("#login-email").value, password:$("#login-password").value }); message("#auth-message", error?.message || "", !!error); };
  $("#signup-form").onsubmit = async e => { e.preventDefault(); const { data, error } = await supabase.auth.signUp({ email:$("#signup-email").value, password:$("#signup-password").value, options:{ data:{ full_name:$("#signup-name").value }, emailRedirectTo:window.location.href } }); message("#auth-message", error?.message || (data.session ? "Conta criada." : "Conta criada. Confirme o e-mail."), !!error); };
}
$("#new-position").onclick = () => { location.hash="mercado"; }; $("#portfolio-performance").onclick = openPerformance;
document.querySelectorAll("[data-close]").forEach(button => button.onclick = () => $(button.dataset.close).close());
$("#period").onchange = () => { if ($("#asset-dialog").open) openAsset(window.activeAsset); };
$("#position-form").onsubmit = async e => { e.preventDefault(); const id=$("#position-id").value, payload={ ticker:$("#position-ticker").value.trim().toUpperCase(), asset_type:$("#position-type").value, quantity:number($("#position-quantity").value), average_price:number($("#position-average").value) }; const result=id ? await supabase.from("positions").update(payload).eq("id",id) : await supabase.from("positions").insert(payload); if (result.error) return message("#position-message",result.error.message,true); $("#position-dialog").close(); await loadData(); };
$("#transaction-form").onsubmit = async e => { e.preventDefault(); const payload={ position_id:$("#transaction-position").value, ticker:$("#transaction-ticker").value, asset_type:$("#transaction-type").value, operation:$("#transaction-operation").value, traded_at:$("#transaction-date").value, quantity:$("#transaction-quantity").value ? number($("#transaction-quantity").value) : null, unit_price:$("#transaction-price").value ? number($("#transaction-price").value) : null, total_value:number($("#transaction-total").value), notes:$("#transaction-notes").value || null }; const {error}=await supabase.from("transactions").insert(payload); if(error)return message("#transaction-message",error.message,true); $("#transaction-dialog").close(); await loadData(); };
setupAuth();
setupWorkspace({ api, saveValuation, personalValuation, render, openPerformance, openAsset, openPosition, getPositions:()=>positions, getUser:()=>currentUser, logout:()=>supabase.auth.signOut() });
supabase.auth.onAuthStateChange((_event, session) => { currentUser=session?.user || null; $("#auth-view").classList.toggle("hidden",!!currentUser); $("#app-view").classList.toggle("hidden",!currentUser); if(!currentUser){ positions=[]; transactions=[]; quotes={}; $("#user-actions").replaceChildren(); resetWorkspace(); return; } $("#user-actions").innerHTML=`<span>${escape(currentUser.email)}</span><button id="logout" class="secondary">Sair</button>`; $("#logout").onclick=()=>supabase.auth.signOut(); setTimeout(() => { if (currentUser?.id === session.user.id) loadData(); },0); });
