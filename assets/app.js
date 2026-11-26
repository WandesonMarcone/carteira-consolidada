import { setupWorkspace, renderWorkspace, resetWorkspace } from "./workspace.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.CARTEIRA_CONFIG;
const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dates = new Intl.DateTimeFormat("pt-BR");
const types = { fii: "FII", stock: "Ação", etf: "ETF", bdr: "BDR", fixed_income: "Renda fixa", crypto: "Cripto", other: "Outro" };
const apiTypes = new Set(["stock", "fii", "etf", "bdr", "crypto", "currency"]);
const selectedDays = 120;
let positions = [], transactions = [], quotes = {}, currentUser = null, quoteProgress = null, currentAsset = null, assetOrigin = "#mercado", portfolioRequest = 0;
const $ = s => document.querySelector(s);
const dateISO = d => new Date(d).toISOString().slice(0, 10);
const displayDate = value => { const raw=String(value || "").slice(0,10); if(!raw)return "N/D"; const parsed=new Date(raw+"T12:00:00Z"); return Number.isNaN(parsed.valueOf())?raw:dates.format(parsed); };
const number = v => Number(v || 0);
const escape = s => String(s ?? "").replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
const message = (selector, text, error = false) => { const el = $(selector); el.textContent = text; el.classList.toggle("error", error); };
const assetKey = p => `${p.asset_type}:${p.ticker}`;
// Cache de leituras de mercado, somente em memória e isolado por sessão.
const marketCache = new Map(), marketPending = new Map();
let marketEpoch=0, activeToken=null, dataRevision=0, assetRevision=0;
function clearMarketCache(){marketEpoch++;marketCache.clear();marketPending.clear();}
function ttlFor(path){if(path.startsWith("/api/v1/assets?"))return 60000;if(/\/(history|income|corporate-events|performance|fundamentals|coverage)(\?|$)/.test(path))return 120000;return 30000;}
function neonAssetType(value){const raw=String(value||"").toLowerCase();return ({acao:"stock",acao_unit:"stock",acao_on:"stock",fii:"fii",etf:"etf",bdr:"bdr",cripto:"crypto",moeda:"currency",renda_fixa:"fixed_income"}[raw]||raw);}
function neonDateFilter(days){const d=new Date();d.setUTCDate(d.getUTCDate()-Number(days||120));return d.toISOString().slice(0,10);}
const neonLogoCache=new Map();
async function neonLogos(tickers=[]){const wanted=tickers.filter(Boolean).filter(t=>!neonLogoCache.has(t));if(wanted.length){const rows=await neonRows("logos",{select:"ticker,logo_url,fonte,status",limit:1000});for(const row of rows)neonLogoCache.set(String(row.ticker).toUpperCase(),row.logo_url||null);}return tickers.map(t=>neonLogoCache.get(String(t).toUpperCase())||null);}
async function neonRows(view,params={}){const url=new URL(config.dataApiUrl+"/"+view);for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null&&value!=="")url.searchParams.set(key,String(value));const response=await fetch(url,{headers:{Authorization:"Bearer "+activeToken,Accept:"application/json"}});if(!response.ok)throw new Error("Neon Data API indisponível ("+response.status+").");return response.json();}
async function neonRequest(path){
  const parsed=new URL(path,"https://carteira.local"),parts=parsed.pathname.split("/").filter(Boolean),query=parsed.searchParams;
  if(parts[0]!=="api"||parts[1]!=="v1"||parts[2]!=="assets"){
    if(path==="/api/v1/market/overview"){return {data:await neonRows("mercado",{select:"*",limit:500})};}
    throw new Error("Endpoint não mapeado na Neon: "+path);
  }
  const ticker=parts[3],assetType=neonAssetType(query.get("asset_type")),view=assetType==="stock"?"cotacoes_acoes":assetType==="fii"?"cotacoes_fiis":"instrumentos";
  const mapAsset=row=>({...row,asset_type:neonAssetType(row.asset_type||assetType),name:row.nome||row.nome_emissor,updated_at:row.atualizado_em||row.data_coleta||row.referencia_em,price:row.preco??row.fechamento});
  if(!ticker){
    const all=await neonRows("ativos",{select:"*",limit:1000});
    const logoRows=await neonLogos(all.map(row=>row.ticker));
    const logoByTicker=new Map(all.map((row,index)=>[String(row.ticker).toUpperCase(),logoRows[index]]));
    const q=String(query.get("q")||"").toUpperCase(),sector=query.get("sector")||"",filtered=all.filter(row=>{const type=neonAssetType(row.asset_type);return (!assetType||type===assetType)&&(!q||String(row.ticker).includes(q)||String(row.nome||"").toUpperCase().includes(q))&&(!sector||row.setor===sector);});
    const page=Math.max(1,Number(query.get("page")||1)),size=Math.min(100,Math.max(1,Number(query.get("page_size")||24))),rows=filtered.slice((page-1)*size,page*size).map(row=>({...mapAsset(row),logo_url:logoByTicker.get(String(row.ticker).toUpperCase())||null}));
    return {data:rows,total:filtered.length,has_more:page*size<filtered.length,sectors:[...new Set(filtered.map(x=>x.setor).filter(Boolean))].sort()};
  }
  if(parts.length===4){
    const assets=await neonRows("ativos",{select:"*",ticker:"eq."+ticker,limit:1}),base=assets[0]||{ticker,asset_type:assetType};const logoRows=await neonRows("logos",{select:"ticker,logo_url,fonte,status",ticker:"eq."+ticker,limit:1});
    let quote=null;
    if(view==="instrumentos"){const rows=await neonRows("instrumentos",{select:"*",ticker:"eq."+ticker,limit:1});quote=rows[0];}
    else {const rows=await neonRows(view,{select:"*",ticker:"eq."+ticker,order:"data_referencia.desc",limit:1});quote=rows[0];}
    return {data:{...mapAsset(base),...(quote||{}),price:quote?.preco??quote?.fechamento??base.price??null,updated_at:quote?.data_coleta??quote?.data_referencia??base.atualizado_em??null,logo_url:logoRows[0]?.logo_url||null,indicators:{DY:quote?.dy,PL:quote?.pl,PVP:quote?.pvp,ROE:quote?.roe,VPA:quote?.vpa,LPA:quote?.lpa,MONTHLY_DIVIDEND:quote?.dividendo_mensal},asset_type:assetType}};
  }
  if(parts[4]==="history"){const rows=await neonRows(view==="instrumentos"?"instrumentos":view,{select:"*",ticker:"eq."+ticker,order:"data_referencia.asc",limit:1000});return {data:rows.filter(row=>!query.get("days")||String(row.data_referencia||row.referencia_em).slice(0,10)>=neonDateFilter(query.get("days"))).map(row=>({date:row.data_referencia||row.referencia_em,price:row.preco??row.fechamento,close:row.preco??row.fechamento,source:row.fonte,source_quality:row.qualidade_fonte}))};}
  if(parts[4]==="income"){const rows=await neonRows("proventos",{select:"*",ticker:"eq."+ticker,order:"data_ex.desc",limit:1000});return {data:rows.map(row=>({...row,ex_date:row.data_ex,payment_date:row.data_pagamento,amount_per_unit:row.valor_unitario,source:row.fonte,source_quality:row.qualidade_fonte}))};}
  if(parts[4]==="corporate-events"){const rows=await neonRows("eventos_corporativos",{select:"*",ticker:"eq."+ticker,order:"data_referencia.desc",limit:1000});return {data:rows.map(row=>({...row,event_type:row.tipo,effective_date:row.data_referencia,factor:row.fator}))};}
  if(parts[4]==="fundamentals"){const facts=await neonRows("fundamentos",{select:"*",ticker:"eq."+ticker,order:"periodo_fim.desc",limit:2000}),derived=await neonRows("indicadores_valuation",{select:"*",ticker:"eq."+ticker,order:"periodo_fim.desc",limit:1000});return {data:{facts,derived_indicators:derived}};}
  if(parts[4]==="coverage"){return {data:[]};}
  throw new Error("Endpoint de ativo não mapeado na Neon: "+path);
}
const api = async path => {
  const owner=currentUser?.id, epoch=marketEpoch, token=activeToken;
  if(!owner||!token)throw new Error("Sessão encerrada.");
  const key=owner+":"+path, entry=marketCache.get(key);
  if(entry&&entry.expires>Date.now())return entry.value;
  if(marketPending.has(key))return marketPending.get(key);
  const request=(async()=>{
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);
    try{
      const value=await neonRequest(path);
      if(epoch!==marketEpoch||currentUser?.id!==owner)throw new Error("Sessão alterada.");
      marketCache.delete(key);marketCache.set(key,{value,expires:Date.now()+ttlFor(path)});
      if(marketCache.size>100)marketCache.delete(marketCache.keys().next().value);
      return value;
    }catch(e){if(e.name==="AbortError")throw new Error("O Robô demorou a responder. Tente novamente.");throw e;}finally{clearTimeout(timer);}
  })();
  marketPending.set(key,request);
  try{return await request;}finally{if(marketPending.get(key)===request)marketPending.delete(key);}
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
  const valid=points.filter(p=>Number.isFinite(Number(p[valueField]))&&pointDate(p));
  if(!valid.length)return '<div class="chart-empty"><span>◌</span><p>Não há histórico suficiente para exibir este gráfico.</p></div>';
  const width=760,height=310,left=82,right=22,top=22,bottom=48,plotW=width-left-right,plotH=height-top-bottom;
  const values=valid.map(p=>Number(p[valueField])),min=Math.min(...values),max=Math.max(...values),spread=max-min||Math.max(Math.abs(max)*.02,1);
  const x=i=>left+(valid.length===1?plotW/2:i/(valid.length-1)*plotW),y=v=>top+plotH-(v-min)/spread*plotH;
  const line=valid.map((p,i)=>`${x(i).toFixed(2)},${y(Number(p[valueField])).toFixed(2)}`).join(" ");
  const area=`${left},${top+plotH} ${line} ${left+plotW},${top+plotH}`;
  const fmtValue=v=>money.format(v),chartId=`area-${valueField}-${Math.random().toString(36).slice(2,8)}`;
  const grid=[0,.5,1].map(frac=>{const yy=top+frac*plotH,vv=max-frac*spread;return `<line class="chart-gridline" x1="${left}" x2="${left+plotW}" y1="${yy}" y2="${yy}"/><text class="chart-axis-label" x="${left-10}" y="${yy+4}" text-anchor="end">${fmtValue(vv)}</text>`;}).join("");
  const labelPoints=[0,Math.floor((valid.length-1)/2),valid.length-1].filter((n,i,a)=>a.indexOf(n)===i);
  const xlabels=labelPoints.map(i=>`<text class="chart-axis-label" x="${x(i)}" y="${height-12}" text-anchor="${i===0?"start":i===valid.length-1?"end":"middle"}">${escape(displayDate(pointDate(valid[i])))}</text>`).join("");
  const markerStep=Math.max(1,Math.ceil(valid.length/28));
  const markers=valid.map((p,i)=>i%markerStep===0||i===valid.length-1?`<circle class="chart-marker" cx="${x(i)}" cy="${y(Number(p[valueField]))}" r="3"><title>${escape(displayDate(pointDate(p)))} • ${fmtValue(Number(p[valueField]))}</title></circle>`:"").join("");
  return `<svg class="professional-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(label)}"><defs><linearGradient id="${chartId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--chart-accent)" stop-opacity=".24"/><stop offset="100%" stop-color="var(--chart-accent)" stop-opacity="0"/></linearGradient></defs>${grid}<polygon class="chart-area" points="${area}" fill="url(#${chartId})"/><polyline class="chart-line" points="${line}"/>${markers}${xlabels}</svg>`;
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
async function loadQuotes(revision,snapshot){
  const queue=snapshot.filter(p=>apiTypes.has(p.asset_type)&&!Number(quotes[assetKey(p)]?.price));
  quoteProgress={done:0,total:queue.length,failed:0};render();let cursor=0;
  async function worker(){while(cursor<queue.length){const p=queue[cursor++];if(revision!==dataRevision)return;try{const response=await api("/api/v1/assets/"+encodeURIComponent(p.ticker)+"?asset_type="+encodeURIComponent(p.asset_type));if(revision!==dataRevision)return;const data=response.data||response;if(Number(data.price)>0)quotes[assetKey(p)]=data;else quoteProgress.failed++;}catch(_){quoteProgress.failed++;}if(revision!==dataRevision)return;quoteProgress.done++;render();}}
  await Promise.all(Array.from({length:Math.min(6,queue.length)},worker));if(revision===dataRevision){quoteProgress=null;render();}
}
async function loadData(){
  const revision=++dataRevision;
  const [p,t]=await Promise.all([supabase.from("positions").select("id,ticker,asset_type,quantity,average_price").order("ticker"),supabase.from("transactions").select("id,position_id,ticker,asset_type,operation,traded_at,quantity,unit_price,total_value,notes").order("traded_at")]);
  if(revision!==dataRevision||!currentUser)return;
  if(p.error||t.error){message("#app-message","Não foi possível carregar seus dados privados.",true);return;}
  positions=p.data||[];transactions=t.data||[];
  quotes=Object.fromEntries(Object.entries(quotes).filter(([key])=>positions.some(p=>assetKey(p)===key)));
  render();void loadQuotes(revision,positions.slice());
}
function render() {
  renderWorkspace({ positions, transactions, quotes, types, money, positionValue, transactionTotal, operationName });
  const invested = positions.reduce((sum, p) => sum + number(p.average_price) * number(p.quantity), 0);
  const marketValue = positions.reduce((sum, p) => sum + positionValue(p), 0);
  $("#total-invested").textContent = money.format(invested); $("#total-value").textContent = money.format(marketValue); $("#total-assets").textContent = positions.length;
  $("#market-status").textContent = quoteProgress?`Carregando cotações ${quoteProgress.done}/${quoteProgress.total}…`:positions.length?`${Object.keys(quotes).length} de ${positions.length} posições com cotação`:`Sua carteira ainda não tem ativos.`; $("#updated-at").textContent = positions.length ? "Dados pessoais carregados; cotações conforme cobertura da API." : "Cadastre uma posição e as transações reais para medir a rentabilidade.";
  const list = $("#positions-list");
  const term = ($("#position-search").value || "").trim().toUpperCase(), filter = $("#position-filter").value;
  const shown = positions.filter(p => (!filter || p.asset_type === filter) && p.ticker.includes(term));
  list.innerHTML = shown.length ? shown.map(p => { const quote = quotes[assetKey(p)]; return `<div class="position-row"><div><div class="ticker">${escape(p.ticker)}</div><div class="asset-type">${types[p.asset_type] || escape(p.asset_type)}</div></div><div class="asset-meta">${number(p.quantity).toLocaleString("pt-BR")} unidades<br>PM ${money.format(p.average_price)}</div><div class="value"><strong>${money.format(positionValue(p))}</strong><small>${quote?.price ? `Cotação: ${money.format(quote.price)}` : "Sem cotação: preço médio"}</small></div><div class="row-actions"><button class="secondary analyze" data-id="${p.id}">Abrir análise</button><button class="secondary transact" data-id="${p.id}">Transação</button><button class="secondary edit" data-id="${p.id}">Editar</button></div></div>`; }).join("") : '<p class="empty">Nenhuma posição encontrada.</p>';
  document.querySelectorAll(".analyze").forEach(b => b.onclick = () => openAsset(positions.find(p => p.id === b.dataset.id)));
  document.querySelectorAll(".transact").forEach(b => b.onclick = () => openTransaction(positions.find(p => p.id === b.dataset.id)));
  document.querySelectorAll(".edit").forEach(b => b.onclick = () => openPosition(positions.find(p => p.id === b.dataset.id)));
  $("#transactions-list").innerHTML = transactions.length ? transactions.slice().reverse().slice(0, 8).map(t => `<li><b>${escape(t.ticker)}</b> • ${operationName(t.operation)} • ${dates.format(new Date(t.traded_at + "T12:00:00"))} • ${money.format(transactionTotal(t))}</li>`).join("") : '<li>Nenhuma transação registrada: TWR e XIRR ficam indisponíveis.</li>';
}
function operationName(op) { return ({ buy:"Compra", sell:"Venda", dividend:"Provento", fee:"Custo", adjustment:"Ajuste" })[op] || op; }
function openPosition(p, selected = null) { $("#position-form").reset(); $("#position-id").value = p?.id || ""; $("#position-title").textContent = p ? "Editar posição" : "Adicionar posição"; if (p) { $("#position-ticker").value = p.ticker; $("#position-type").value = p.asset_type; $("#position-quantity").value = p.quantity; $("#position-average").value = p.average_price; } $("#position-ticker").readOnly=!!selected||!!p; $("#position-type").disabled=!!selected||!!p; if (selected) { $("#position-ticker").value=selected.ticker; $("#position-type").value=selected.asset_type; } $("#position-dialog").showModal(); }
function transactionMode(){return $("#transaction-operation").value === "sell" ? "sell" : "buy";}
function updateTransactionAssets(selectedTicker=""){
  const kind=$("#transaction-category").value, items=positions.filter(p=>p.asset_type===kind), list=$("#transaction-asset-options");
  list.innerHTML=items.map(p=>`<option value="${escape(p.ticker)}"></option>`).join("");
  const found=items.find(p=>p.ticker.toUpperCase()===String(selectedTicker).trim().toUpperCase());
  if(found){$("#transaction-asset-search").value=found.ticker;$("#transaction-position").value=found.id;$("#transaction-ticker").value=found.ticker;$("#transaction-type").value=found.asset_type;}
  else {$("#transaction-asset-search").value="";$("#transaction-position").value="";$("#transaction-ticker").value="";$("#transaction-type").value=kind;}
  $("#transaction-asset-search").disabled=!items.length;
  $("#transaction-asset-search").placeholder=items.length?"Busque entre os ativos da sua carteira":"Você ainda não tem ativo dessa categoria";
  updateTransactionTotal();
}
function updateTransactionTotal(){
  const extra=$("#transaction-extra-operation").value, op=extra||transactionMode();
  $("#transaction-operation").value=op;
  const costs=number($("#transaction-brokerage").value)+number($("#transaction-fees").value);
  const gross=number($("#transaction-price").value)*number($("#transaction-quantity").value);
  const total=extra?number($("#transaction-extra-total").value):(op==="sell"?gross-costs:gross+costs);
  $("#transaction-total").value=Math.max(0,total).toFixed(2);
  $("#transaction-total-preview").textContent=money.format(Math.max(0,total));
  $("#transaction-total-label").textContent=op==="sell"?"Total líquido da venda":op==="buy"?"Total da compra":"Valor do lançamento";
  $("#transaction-extra-total-wrap").classList.toggle("hidden",!extra);
  $("#transaction-price").required=!extra;$("#transaction-quantity").required=!extra;$("#transaction-extra-total").required=!!extra;
  $("#transaction-price").disabled=!!extra;$("#transaction-quantity").disabled=!!extra;
  $("#transaction-brokerage").disabled=!!extra;$("#transaction-fees").disabled=!!extra;
  $("#transaction-mode").querySelectorAll("[data-transaction-mode]").forEach(b=>{const active=!extra&&b.dataset.transactionMode===op;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
}
function openTransaction(p) { $("#transaction-form").reset(); $("#transaction-date").value=dateISO(new Date()); $("#transaction-category").value=p.asset_type; updateTransactionAssets(p.ticker); $("#transaction-price").value=quotes[assetKey(p)]?.price ?? p.average_price ?? ""; $("#transaction-title").textContent="Adicionar transação"; $("#transaction-extra-operation").value=""; $("#transaction-operation").value="buy"; updateTransactionTotal(); $("#transaction-dialog").showModal(); }
async function personalValuation(p, method) { const result = await supabase.from("personal_valuations").select("*").eq("ticker", p.ticker).eq("asset_type", p.asset_type).eq("method", method).maybeSingle(); return result.data; }
async function saveValuation(p, method, ceiling, assumptions) { if(p.asset_type!=="stock")throw new Error("Metodologias somente para ações."); const { error } = await supabase.from("personal_valuations").upsert({ ticker:p.ticker, asset_type:p.asset_type, method, ceiling_price:ceiling, assumptions }, { onConflict:"user_id,ticker,asset_type,method" }); if (error) throw error; }
function assetIdentity(p,asset={}){
  const identity=$("#asset-identity");identity.replaceChildren();const logo=asset.logo_url||p.logo_url,mark=document.createElement("span");mark.className="asset-logo";mark.textContent=p.ticker.slice(0,2);
  if(typeof logo==="string"&&logo.startsWith("https://")){const image=document.createElement("img");image.src=logo;image.alt="";image.referrerPolicy="no-referrer";image.loading="lazy";image.onerror=()=>image.remove();mark.append(image);}identity.append(mark);
  $("#asset-title").textContent=p.ticker+" • "+(types[p.asset_type]||p.asset_type);
  $("#asset-subtitle").textContent=[asset.name||p.name||"",asset.classification?.sector||p.sector||"",asset.classification?.subsector||p.subsector||""].filter(Boolean).join(" • ")||"Dados da carteira e do mercado";
  const price=asset.price??p.price??quotes[assetKey(p)]?.price,updated=String(asset.updated_at||"");$("#asset-current-price").textContent=price!=null?money.format(Number(price)):"Indisponível";$("#asset-price-reference").textContent=/^\d{4}-\d{2}-\d{2}/.test(updated)?"Referência: "+displayDate(updated):"Cotação e referência retornadas pela API";
}
function assetIndicators(p,asset){
  const indicators=asset.indicators||{},labels={DY:"Dividend Yield",LPA:"Lucro por ação",MONTHLY_DIVIDEND:"Provento mensal",PL:"Preço/Lucro",PVP:"Preço/Valor Patrimonial",ROE:"Retorno sobre patrimônio",VPA:"Valor patrimonial por ação"};
  const show=(key,value)=>{if(value==null||!Number.isFinite(Number(value)))return "N/D";const n=Number(value);if(["LPA","VPA","MONTHLY_DIVIDEND"].includes(key))return money.format(n);if(["DY","ROE"].includes(key))return new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2}).format(n)+"%";if(["PL","PVP"].includes(key))return new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2}).format(n)+"×";return escape(value);};
  $("#asset-indicators").innerHTML=Object.entries(indicators).map(([k,v])=>{const key=k.toUpperCase();return `<article class="stat"><span>${escape(labels[key]||key)}</span><strong>${show(key,v)}</strong><small>Informado pela API do Robô</small></article>`;}).join("");
  if(p.asset_type==="stock"){const capital=asset.share_capital||{},integer=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:0}),shares=v=>v!=null&&Number.isSafeInteger(Number(v))&&Number(v)>=0?integer.format(Number(v)):"Não confirmado";$("#asset-indicators").insertAdjacentHTML("beforeend",`<article class="stat share-stat"><span>Ações do ticker</span><strong>${shares(capital.ticker_shares)}</strong><small>${capital.reference_date?"Referência "+escape(capital.reference_date):"Sem conciliação confirmada"}</small></article><article class="stat share-stat"><span>Total de ações da empresa</span><strong>${shares(capital.company_shares)}</strong><small>${capital.status==="ESTIMATIVA_YAHOO"?"Estimativa Yahoo; não equivale ao capital emitido confirmado.":"Não somar entre classes do mesmo emissor."}</small></article>`);}
}
function openAsset(p){if(!p||!currentUser)return;if(!location.hash.startsWith("#ativo/"))assetOrigin=location.hash==="#carteira"?"#carteira":"#mercado";$("#asset-back").href=assetOrigin;currentAsset={...p};window.activeAsset=currentAsset;const hash=`#ativo/${encodeURIComponent(p.asset_type)}/${encodeURIComponent(p.ticker)}`;if(location.hash!==hash)location.hash=hash;renderAssetPage(currentAsset);}
function restoreActiveAsset(){const match=location.hash.match(/^#ativo\/([^/]+)\/(.+)$/);if(!match||!currentUser)return;let kind,ticker;try{kind=decodeURIComponent(match[1]);ticker=decodeURIComponent(match[2]);}catch{return;}const item=positions.find(p=>p.ticker===ticker&&p.asset_type===kind)||(currentAsset?.ticker===ticker&&currentAsset?.asset_type===kind?currentAsset:null)||{ticker,asset_type:kind};if(item.ticker===ticker&&item.asset_type===kind)openAsset(item);}
async function renderAssetPage(p){if(!currentUser)return;currentAsset={...p};window.activeAsset=currentAsset;const revision=++assetRevision,owner=currentUser.id,valid=()=>revision===assetRevision&&currentUser?.id===owner&&currentAsset?.ticker===p.ticker&&location.hash.startsWith("#ativo/");const owned=positions.find(x=>x.ticker===p.ticker&&x.asset_type===p.asset_type),path="/api/v1/assets/"+encodeURIComponent(p.ticker),type=encodeURIComponent(p.asset_type),query="?asset_type="+type+"&days="+selectedDays,get=suffix=>api(path+suffix+query);
  $("#asset-add").hidden=!!owned;$("#asset-add").onclick=()=>openPosition(null,p);$("#asset-valuation").hidden=p.asset_type!=="stock";$("#asset-method-section").hidden=p.asset_type!=="stock";
  const goMethods=()=>{if(p.asset_type!=="stock")return;$("#method-ticker").value=p.ticker;$("#method-class").value="stock";location.hash="metodologias";$("#method-search").requestSubmit();};$("#asset-valuation").onclick=goMethods;$("#asset-valuation-inline").onclick=goMethods;
  $(".transact-current").onclick=()=>{if(owned)openTransaction(owned);else message("#app-message","Adicione este ativo à carteira antes de registrar uma operação.",true);};
  assetIdentity(p,quotes[assetKey(p)]||{});$("#asset-return").textContent="—";$("#asset-return-detail").textContent="Calculado com histórico real";$("#asset-indicators").innerHTML='<article class="stat skeleton"><span>Fundamentos</span><strong>Carregando…</strong></article>';$("#asset-price-chart").innerHTML='<div class="chart-loading"><span class="loader"></span>Carregando histórico de preços…</div>';$("#asset-price-summary").replaceChildren();
  $("#asset-position-summary").innerHTML=owned?`<div><span>Quantidade</span><strong>${number(owned.quantity).toLocaleString("pt-BR")}</strong></div><div><span>Preço médio</span><strong>${money.format(number(owned.average_price))}</strong></div><div><span>Valor estimado</span><strong>${money.format(positionValue(owned))}</strong></div>`:'<p>Este ativo ainda não está na sua carteira. Adicione-o para acompanhar seu patrimônio e registrar transações.</p>';
  $("#asset-wealth-chart").innerHTML=owned?'<p class="empty">Carregando patrimônio desta posição…</p>':'<p class="empty">Adicione o ativo à carteira para acompanhar seu patrimônio.</p>';$("#asset-methods").replaceChildren();$("#asset-income-panel").dataset.loaded="";$("#asset-events-panel").dataset.loaded="";
  $("#asset-income-panel").ontoggle=async()=>{const panel=$("#asset-income-panel");if(!panel.open||panel.dataset.loaded===p.ticker)return;panel.dataset.loaded=p.ticker;$("#asset-income").innerHTML='<div class="chart-loading"><span class="loader"></span>Carregando proventos…</div>';try{const [income,events]=await Promise.all([get("/income"),transactions.some(t=>t.ticker===p.ticker&&t.asset_type===p.asset_type)?get("/corporate-events"):Promise.resolve({data:[]})]);if(valid())renderIncome(p,normalizedList(income),normalizedList(events));}catch(e){if(valid())$("#asset-income").innerHTML='<p class="error">'+escape(e.message)+'.</p>';}};
  $("#asset-events-panel").ontoggle=async()=>{const panel=$("#asset-events-panel");if(!panel.open||panel.dataset.loaded===p.ticker)return;panel.dataset.loaded=p.ticker;$("#asset-events").innerHTML='<div class="chart-loading"><span class="loader"></span>Carregando eventos…</div>';try{const events=await get("/corporate-events");if(valid())renderEvents(normalizedList(events));}catch(e){if(valid())$("#asset-events").innerHTML='<p class="error">'+escape(e.message)+'.</p>';}};
  if(!apiTypes.has(p.asset_type)){message("#asset-status","Consulta de mercado indisponível para esta classe.",true);return;}message("#asset-status","Carregando cotação e indicadores…");
  const details=api(path+"?asset_type="+type).then(response=>{if(!valid())return;const asset=response.data||response;assetIdentity(p,asset);assetIndicators(p,asset);message("#asset-status",/^\d{4}-\d{2}-\d{2}/.test(String(asset.updated_at||""))?"Última atualização: "+displayDate(asset.updated_at):"Dados atualizados conforme retorno do Robô.");}).catch(e=>{if(valid()){message("#asset-status",e.message,true);$("#asset-indicators").innerHTML='<article class="stat"><span>Fundamentos</span><strong>Indisponíveis</strong><small>Tente novamente mais tarde.</small></article>';}});
  const history=get("/history").then(async response=>{if(!valid())return;const rows=normalizedList(response),points=rows.map(row=>({date:pointDate(row),price:pointPrice(row)})).filter(row=>row.date&&row.price>0).sort((a,b)=>a.date.localeCompare(b.date));$("#asset-price-chart").innerHTML=svgChart(points,"price","Histórico de preço de "+p.ticker);if(points.length){const first=points[0],last=points.at(-1),change=Number(first.price)?(Number(last.price)/Number(first.price)-1)*100:null;$("#asset-price-summary").innerHTML=`<div><span>Primeiro registro</span><strong>${money.format(first.price)}</strong><small>${displayDate(first.date)}</small></div><div><span>Último registro</span><strong>${money.format(last.price)}</strong><small>${displayDate(last.date)}</small></div><div><span>Variação no período</span><strong class="${change>=0?"positive":"negative"}">${change==null?"N/D":(change>=0?"+":"")+change.toFixed(2)+"%"}</strong><small>Entre os registros retornados</small></div>`;$("#asset-return").textContent=change==null?"N/D":(change>=0?"+":"")+change.toFixed(2)+"%";$("#asset-return-detail").textContent="Variação entre primeiro e último registro.";}if(owned){const historyTransactions=transactions.filter(t=>t.ticker===p.ticker&&t.asset_type===p.asset_type&&["buy","sell","adjustment"].includes(t.operation));if(!historyTransactions.length){$("#asset-wealth-chart").innerHTML='<p class="empty">Sem transações registradas para calcular a evolução desta posição.</p>';return;}try{const events=normalizedList(await get("/corporate-events"));if(!valid())return;const wealth=points.map(point=>({date:point.date,value:eventAdjustedQuantity(owned,point.date,events)*point.price}));$("#asset-wealth-chart").innerHTML=svgChart(wealth,"value","Evolução patrimonial de "+p.ticker);}catch{$("#asset-wealth-chart").innerHTML='<p class="empty">Histórico pessoal indisponível para este ativo.</p>';}}}).catch(e=>{if(valid())$("#asset-price-chart").innerHTML='<p class="error">'+escape(e.message)+" Histórico temporariamente indisponível.</p>";});
  await Promise.allSettled([details,history]);if(valid()&&owned&&!transactions.some(t=>t.ticker===p.ticker&&t.asset_type===p.asset_type))$("#asset-wealth-chart").innerHTML='<p class="empty">Sem transações reais para montar a evolução desta posição.</p>';
}
function unavailable(title, reason) { return `<article class="valuation unavailable"><span>${escape(title)}</span><strong>Indisponível</strong><span>${escape(reason)}</span></article>`; }
function renderIncome(p, incomes, events) {
  const rows = incomes.map(i => { const ex = incomeDate(i); const amount = number(i.amount_per_unit); const qty = ex ? eventAdjustedQuantity(p, ex, events) : 0; return { ex, payment: i.payment_date || null, amount, qty, total:amount * qty, source:statusText(i) }; });
  $("#asset-income").innerHTML = rows.length ? `<table><thead><tr><th>Data-ex</th><th>Pagamento</th><th>Valor/un.</th><th>Qtde elegível</th><th>Total</th><th>Origem</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escape(displayDate(r.ex))}</td><td>${escape(displayDate(r.payment))}</td><td>${money.format(r.amount)}</td><td>${r.ex ? r.qty.toLocaleString("pt-BR") : "N/D"}</td><td>${r.ex ? money.format(r.total) : "N/D"}</td><td>${escape(r.source)}</td></tr>`).join("")}</tbody></table>` : '<p class="empty">Nenhum provento retornado para o período. Ausência não é tratada como zero.</p>';
}
function renderEvents(events) { $("#asset-events").innerHTML = events.length ? `<ul class="records">${events.map(e => `<li><b>${escape(e.event_type || e.type || "Evento")}</b> • ${escape(displayDate(eventDate(e)))} • fator ${validFactor(e)} • ${escape(statusText(e))}</li>`).join("")}</ul>` : '<p class="empty">Nenhum evento corporativo confirmado no período.</p>'; }
async function renderMethods(p, asset) {
  const container=$("#asset-methods"); container.replaceChildren();
  if(p.asset_type!=="stock")return;
  const button=document.createElement("button");button.className="primary";button.textContent="Abrir central de metodologias";
  button.onclick=()=>{$("#method-ticker").value=p.ticker;$("#method-class").value=p.asset_type;location.hash="metodologias";$("#method-search").requestSubmit();};
  container.append(button);
}
async function openPerformance(){
  const ticket=++portfolioRequest,owner=currentUser?.id,days=selectedDays;$("#portfolio-twr").textContent="—";$("#portfolio-xirr").textContent="—";$("#portfolio-chart").innerHTML='<div class="chart-loading"><span class="loader"></span>Consultando histórico da carteira…</div>';
  if(!transactions.length){$("#portfolio-chart").innerHTML='<div class="chart-empty"><span>◌</span><p>Registre transações reais para calcular o desempenho da carteira.</p></div>';message("#performance-status","Ainda não há transações suficientes para calcular TWR e XIRR.",true);return;}
  const series={},events={},assets=positions.filter(p=>apiTypes.has(p.asset_type));let completed=0;message("#performance-status",`Consultando ${assets.length} ativos para o período de ${days} dias…`);
  for(let offset=0;offset<assets.length;offset+=4){if(ticket!==portfolioRequest||currentUser?.id!==owner)return;await Promise.all(assets.slice(offset,offset+4).map(async p=>{const key=assetKey(p),type=encodeURIComponent(p.asset_type),ticker=encodeURIComponent(p.ticker);try{const [h,e]=await Promise.all([api(`/api/v1/assets/${ticker}/history?asset_type=${type}&days=${days}`),api(`/api/v1/assets/${ticker}/corporate-events?asset_type=${type}&days=${days}`)]);series[key]=normalizedList(h);events[key]=normalizedList(e);}catch(_){series[key]=[];events[key]=[];}completed++;if(ticket===portfolioRequest)message("#performance-status",`Histórico consultado: ${completed}/${assets.length} ativos.`);}));}
  if(ticket!==portfolioRequest||currentUser?.id!==owner)return;if(!assets.length||assets.some(p=>!series[assetKey(p)]?.length)){message("#performance-status","Histórico incompleto para uma ou mais posições. Rentabilidade bloqueada para evitar um resultado enganoso.",true);$("#portfolio-chart").innerHTML='<div class="chart-empty"><span>!</span><p>Faltam séries de preços para este período.</p></div>';return;}
  const points=portfolioHistory(series,events),flows=transactions.map(t=>({date:t.traded_at,amount:t.operation==="buy"||t.operation==="fee"?-transactionTotal(t):t.operation==="sell"||t.operation==="dividend"?transactionTotal(t):0})).filter(f=>f.amount);const last=points.at(-1);if(last)flows.push({date:last.date,amount:last.value});const tv=twr(points),xv=xirr(flows);
  $("#portfolio-twr").textContent=tv==null?"Indisponível":`${tv.toFixed(2)}%`;$("#portfolio-xirr").textContent=xv==null?"Indisponível":`${(xv*100).toFixed(2)}% a.a.`;$("#portfolio-chart").innerHTML=svgChart(points,"value","Evolução do patrimônio da carteira");message("#performance-status",points.length?`Série real: ${points.length} datas • janela de ${days} dias.`:"Não há histórico suficiente para este período.",!points.length);
  if(location.hash==="#patrimonio"){$("#wealth-inline").innerHTML=$("#portfolio-chart").innerHTML;$("#wealth-status").textContent=$("#performance-status").textContent;}
  if(location.hash==="#dashboard"){$("#dash-wealth").innerHTML=$("#portfolio-chart").innerHTML;$("#dash-wealth").dataset.loaded="true";$("#dash-history-status").textContent=$("#performance-status").textContent;$("#dash-return").textContent=$("#portfolio-twr").textContent;}
}
function setupAuth() {
  document.querySelectorAll(".tab").forEach(b => b.onclick = () => { document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b)); $("#login-form").classList.toggle("hidden", b.dataset.tab !== "login"); $("#signup-form").classList.toggle("hidden", b.dataset.tab !== "signup"); });
  $("#login-form").onsubmit = async e => { e.preventDefault(); const { error } = await supabase.auth.signInWithPassword({ email:$("#login-email").value, password:$("#login-password").value }); message("#auth-message", error?.message || "", !!error); };
  $("#signup-form").onsubmit = async e => { e.preventDefault(); const { data, error } = await supabase.auth.signUp({ email:$("#signup-email").value, password:$("#signup-password").value, options:{ data:{ full_name:$("#signup-name").value }, emailRedirectTo:window.location.href } }); message("#auth-message", error?.message || (data.session ? "Conta criada." : "Conta criada. Confirme o e-mail."), !!error); };
}
$("#new-position").onclick = () => { location.hash="mercado"; }; $("#portfolio-performance").onclick = () => { location.hash="rentabilidade"; }; $("#performance-refresh").onclick=()=>openPerformance();
document.querySelectorAll("[data-close]").forEach(button => button.onclick = () => $(button.dataset.close).close());

$("#position-form").onsubmit = async e => { e.preventDefault(); const id=$("#position-id").value, payload={ ticker:$("#position-ticker").value.trim().toUpperCase(), asset_type:$("#position-type").value, quantity:number($("#position-quantity").value), average_price:number($("#position-average").value) }; const result=id ? await supabase.from("positions").update(payload).eq("id",id) : await supabase.from("positions").insert(payload); if (result.error) return message("#position-message",result.error.message,true); $("#position-dialog").close(); await loadData(); };
$("#transaction-category").onchange=()=>updateTransactionAssets();
$("#transaction-asset-search").onchange=()=>{const item=positions.find(p=>p.asset_type===$("#transaction-category").value&&p.ticker.toUpperCase()===$("#transaction-asset-search").value.trim().toUpperCase());if(item){updateTransactionAssets(item.ticker);$("#transaction-price").value=quotes[assetKey(item)]?.price??item.average_price??"";}else{$("#transaction-position").value="";$("#transaction-ticker").value="";$("#transaction-type").value=$("#transaction-category").value;}updateTransactionTotal();};
$("#transaction-mode").querySelectorAll("[data-transaction-mode]").forEach(b=>b.onclick=()=>{ $("#transaction-extra-operation").value="";$("#transaction-operation").value=b.dataset.transactionMode;updateTransactionTotal();});
["#transaction-extra-operation","#transaction-extra-total","#transaction-price","#transaction-quantity","#transaction-brokerage","#transaction-fees"].forEach(id=>{ $(id).addEventListener("input",updateTransactionTotal);$(id).addEventListener("change",updateTransactionTotal); });
$("#transaction-form").onsubmit = async e => { e.preventDefault(); if(!$("#transaction-position").value)return message("#transaction-message","Selecione um ativo já cadastrado na sua carteira.",true); const op=$("#transaction-operation").value, brokerage=number($("#transaction-brokerage").value), fees=number($("#transaction-fees").value); const extraCosts=(op==="buy"||op==="sell")&&(brokerage||fees)?`Custos — corretagem ${money.format(brokerage)}; taxas ${money.format(fees)}.`:""; const note=[$("#transaction-notes").value.trim().slice(0,150),extraCosts].filter(Boolean).join(" ").slice(0,250); const payload={ position_id:$("#transaction-position").value, ticker:$("#transaction-ticker").value, asset_type:$("#transaction-type").value, operation:op, traded_at:$("#transaction-date").value, quantity:op==="buy"||op==="sell"?number($("#transaction-quantity").value):null, unit_price:op==="buy"||op==="sell"?number($("#transaction-price").value):null, total_value:number($("#transaction-total").value), notes:note||null }; const {error}=await supabase.from("transactions").insert(payload); if(error)return message("#transaction-message",error.message,true); $("#transaction-dialog").close(); await loadData(); };
setupAuth();
async function testNeonConnection(){const output=$("#neon-connection-result"),button=$("#neon-connection-test");if(!output||!button)return;if(!activeToken){output.textContent="Faça login antes de testar.";output.className="message error";return}button.disabled=true;output.textContent="Testando sessão Supabase na Neon…";output.className="message";try{const response=await fetch(config.dataApiUrl+"/ativos?select=ticker,asset_type&limit=1",{headers:{Authorization:"Bearer "+activeToken,Accept:"application/json"}});if(!response.ok)throw new Error("HTTP "+response.status);const rows=await response.json();output.textContent="Conexão Neon aprovada. "+rows.length+" registro(s) recebido(s).";output.className="message success"}catch(error){output.textContent="Conexão Neon não validada: "+error.message;output.className="message error"}finally{button.disabled=false}}
setupWorkspace({ api, saveValuation, personalValuation, render, openPerformance, openAsset, openPosition, getPositions:()=>positions, getUser:()=>currentUser, getActiveAsset:()=>currentAsset, restoreActiveAsset, logout:()=>supabase.auth.signOut() });
supabase.auth.onAuthStateChange((_event, session) => { const previous=currentUser?.id; currentUser=session?.user || null; activeToken=session?.access_token||null; if(previous!==currentUser?.id){clearMarketCache();dataRevision++;assetRevision++;positions=[];transactions=[];quotes={};} $("#auth-view").classList.toggle("hidden",!!currentUser); $("#app-view").classList.toggle("hidden",!currentUser); if(!currentUser){ positions=[]; transactions=[]; quotes={}; $("#user-actions").replaceChildren(); resetWorkspace(); return; } $("#user-actions").innerHTML=`<span>${escape(currentUser.email)}</span><button id="logout" class="secondary">Sair</button>`; $("#logout").onclick=()=>supabase.auth.signOut(); if(previous!==currentUser.id||_event==="INITIAL_SESSION"||_event==="SIGNED_IN"&&positions.length===0) setTimeout(() => { if (currentUser?.id === session.user.id) { loadData().then(()=>{if(location.hash.startsWith("#ativo/"))restoreActiveAsset();else if(["#rentabilidade","#patrimonio"].includes(location.hash))openPerformance();}); } },0); });
$("#neon-connection-test").onclick=testNeonConnection;