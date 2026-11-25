// Navegação e painéis da Carteira. Não armazena dados privados fora da sessão.
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const fmt = new Intl.NumberFormat("pt-BR",{maximumFractionDigits:4});
const titles = {dashboard:"Visão geral",carteira:"Minha carteira",patrimonio:"Patrimônio",rentabilidade:"Rentabilidade",proventos:"Proventos",transacoes:"Transações",composicao:"Composição",metodologias:"Metodologias",mercado:"Mercado"};
const methods = {GRAHAM:"Graham",BAZIN:"Bazin",GORDON_DDM:"Gordon (DDM)",DCF_FCFF:"Fluxo de caixa descontado (FCFF)",DCF_FCFE:"Fluxo de caixa descontado (FCFE)",LUCRO_RESIDUAL:"Lucro residual",LUCRO_PROJETADO:"Lucro projetado",LYNCH:"Peter Lynch"};
let actions, revision=0;
function route(){
  const key=location.hash.slice(1); const page=Object.hasOwn(titles,key)?key:"dashboard";
  document.querySelectorAll("[data-screen]").forEach(el=>el.hidden=el.dataset.screen!==page);
  document.querySelectorAll("[data-page]").forEach(el=>{if(el.dataset.page===page)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current");});
  $("#welcome-title").textContent=titles[page];
  $("#new-position").hidden=!(page==="dashboard"||page==="carteira");
  $("#portfolio-performance").hidden=!(page==="dashboard"||page==="rentabilidade"||page==="patrimonio");
}
function table(headers, rows){return rows.length?"<table><thead><tr>"+headers.map(x=>"<th>"+esc(x)+"</th>").join("")+"</tr></thead><tbody>"+rows.map(r=>"<tr>"+r.map(x=>"<td>"+esc(x)+"</td>").join("")+"</tr>").join("")+"</tbody></table>":'<p class="empty">Nenhum registro disponível.</p>';}
function bars(items, total){return items.length?items.map(([label,value])=>'<div class="bar-item"><div><span>'+esc(label)+'</span><strong>'+money.format(value)+(total>0?' • '+fmt.format(100*value/total)+'%':'')+'</strong></div><div class="bar-track"><span style="width:'+Math.max(0,Math.min(100,total>0?100*value/total:0))+'%"></span></div></div>').join(""):'<p class="empty">Nenhum registro disponível.</p>';}
export function renderWorkspace({positions,transactions,quotes,types,positionValue,transactionTotal,operationName}){
  const groups={}; for(const p of positions){const label=types[p.asset_type]||p.asset_type;groups[label]=(groups[label]||0)+positionValue(p);}
  const list=Object.entries(groups).sort((a,b)=>b[1]-a[1]), total=list.reduce((s,x)=>s+x[1],0);
  const note='<p class="data-note">Estimativa: '+Object.keys(quotes).length+' de '+positions.length+' posições com cotação. Sem cotação, utiliza preço médio.</p>';
  $("#dash-allocation").innerHTML=bars(list,total)+note; $("#full-allocation").innerHTML=bars(list,total)+note;
  const income=transactions.filter(t=>t.operation==="dividend"); const months={};for(const t of income){const key=t.traded_at.slice(0,7);months[key]=(months[key]||0)+transactionTotal(t);}
  const monthly=Object.entries(months).sort((a,b)=>a[0].localeCompare(b[0]));const sum=income.reduce((s,t)=>s+transactionTotal(t),0);
  $("#dash-income").innerHTML='<strong class="hero-value">'+money.format(sum)+'</strong><p>Total registrado em todos os períodos</p>'+bars(monthly.slice(-6),sum);
  $("#income-chart").innerHTML=bars(monthly.slice(-12),sum);
  $("#income-table").innerHTML=table(["Data","Ativo","Valor recebido"],income.slice().reverse().map(t=>[t.traded_at,t.ticker,money.format(transactionTotal(t))]));
  $("#transaction-table").innerHTML=table(["Data","Ativo","Operação","Quantidade","Valor"],transactions.slice().reverse().map(t=>[t.traded_at,t.ticker,operationName(t.operation),t.quantity??"—",money.format(transactionTotal(t))]));
}
function printable(v){return v==null?"N/D":Array.isArray(v)?v.join(", "):typeof v==="object"?JSON.stringify(v):String(v);}
async function searchMethods(e){
  e.preventDefault();const ticket=++revision;const ticker=$("#method-ticker").value.trim().toUpperCase(), type=$("#method-class").value;const p={ticker,asset_type:type};
  const path="/api/v1/assets/"+encodeURIComponent(ticker);$("#method-status").textContent="Consultando "+ticker+"…";for(const id of ["method-cards","method-quote","method-facts"])$("#"+id).replaceChildren();
  const result=await Promise.allSettled([actions.api(path+"?asset_type="+type),actions.api(path+"/coverage"),actions.api(path+"/fundamentals?years=5")]);
  if(ticket!==revision)return;
  const [quote,coverage,facts]=result.map(r=>r.status==="fulfilled"?r.value:null);
  const asset=quote?.data, rows=(Array.isArray(coverage?.data)?coverage.data:[]).filter(r=>r.classe===(type==="stock"?"ACAO":"FII"));
  $("#method-status").textContent=rows.length?rows.length+" metodologias com cobertura registrada.":"Não foi retornada cobertura para esta classe. Cálculos bloqueados.";
  if(result.some(r=>r.status==="rejected"))$("#method-status").textContent+=" Uma ou mais consultas falharam.";
  $("#method-quote").innerHTML=asset?.price!=null?'<div class="method-price">Cotação de '+esc(ticker)+' <strong>'+money.format(asset.price)+'</strong><small>Referência: '+esc(asset.updated_at||"não informada")+'</small></div>':"";
  const derived=facts?.data?.derived_indicators||[];const observed=facts?.data?.facts||[];
  $("#method-facts").innerHTML=table(["Período","Indicador","Valor","Unidade","Qualidade"],derived.slice().reverse().map(x=>[x.periodo_fim,x.indicador,x.valor==null?"N/D":fmt.format(x.valor),x.unidade,x.qualidade]))+'<details><summary>Fatos contábeis ('+observed.length+')</summary>'+table(["Período","Métrica","Valor","Unidade","Fonte"],observed.slice().reverse().map(x=>[x.periodo_fim,x.metrica,x.valor==null?"N/D":fmt.format(x.valor),x.unidade,x.fonte]))+'</details>';
  for(const r of rows){
    const card=document.createElement("article");card.className="valuation method-card";
    card.innerHTML='<span>'+esc(methods[r.metodo]||r.metodo)+'</span><strong>'+esc(r.status.replaceAll("_"," "))+'</strong><span>Anos disponíveis: '+esc(r.anos_disponiveis??"N/D")+'</span><span>Faltam: '+esc(printable(r.campos_ausentes))+'</span><span>'+esc(r.observacao||"")+'</span>';
    $("#method-cards").append(card);
    // Graham: apenas LPA/VPA derivados, anuais, mesmo período e cobertura PRONTO.
    if(type!=="stock"||r.metodo!=="GRAHAM"||r.status!=="PRONTO")continue;
    const annual=derived.filter(x=>["ANUAL","DFP"].includes(String(x.periodicidade).toUpperCase()));
    const pairs=annual.filter(x=>String(x.indicador).toUpperCase()==="LPA"&&Number(x.valor)>0).sort((a,b)=>String(b.periodo_fim).localeCompare(String(a.periodo_fim)));
    const lpa=pairs.find(x=>annual.some(y=>String(y.indicador).toUpperCase()==="VPA"&&y.periodo_fim===x.periodo_fim&&Number(y.valor)>0));const vpa=lpa&&annual.find(y=>String(y.indicador).toUpperCase()==="VPA"&&y.periodo_fim===lpa.periodo_fim&&Number(y.valor)>0);
    if(!lpa||!vpa){card.insertAdjacentHTML("beforeend","<p>Par anual LPA/VPA não disponível.</p>");continue;}
    const fair=Math.sqrt(22.5*Number(lpa.valor)*Number(vpa.valor));const box=document.createElement("div");box.innerHTML='<p>Valor de Graham: <b>'+money.format(fair)+'</b> • '+esc(lpa.periodo_fim)+'</p><label>Margem de segurança (%) <input type="number" min="0" max="99" step="1" value="0"></label><p class="ceiling"></p><button class="secondary" type="button">Salvar preço-teto</button><p class="message" role="status"></p>';card.append(box);const input=box.querySelector("input");const calc=()=>{const m=Number(input.value);return input.value!==""&&m>=0&&m<=99?fair*(1-m/100):null;};const update=()=>{const c=calc();box.querySelector(".ceiling").textContent=c==null?"Margem inválida":"Preço-teto: "+money.format(c);};input.oninput=update;update();
    box.querySelector("button").onclick=async()=>{const c=calc();if(c==null)return;try{await actions.saveValuation(p,"graham",c,{formula:"sqrt(22.5*LPA*VPA)",period:lpa.periodo_fim,lpa:lpa.valor,vpa:vpa.valor,margin_percent:Number(input.value)});box.querySelector(".message").textContent="Preço-teto salvo.";}catch{box.querySelector(".message").textContent="Não foi possível salvar.";}};
  }
}
async function market(){const ticket=revision;$("#market-overview").textContent="Consultando…";try{const r=await actions.api("/api/v1/market/overview");if(ticket!==revision)return;const data=r.data;const flatten=(v,p="",depth=0)=>v!==null&&typeof v==="object"&&depth<5?Object.entries(v).flatMap(([k,x])=>flatten(x,p?p+" / "+k:k,depth+1)):[[p,printable(v)]];$("#market-overview").innerHTML=table(["Indicador","Valor"],data?flatten(data):[]);}catch(e){if(ticket===revision)$("#market-overview").textContent=e.message;}}
export function setupWorkspace(opts){actions=opts;window.addEventListener("hashchange",route);route();$("#position-search").oninput=opts.render;$("#position-filter").onchange=opts.render;$("#method-search").onsubmit=searchMethods;$("#market-refresh").onclick=market;document.querySelectorAll(".history-trigger").forEach(b=>b.onclick=async()=>{await opts.openPerformance();$("#wealth-inline").innerHTML=$("#portfolio-chart").innerHTML;$("#wealth-status").textContent=$("#performance-status").textContent;$("#return-status").textContent=$("#performance-status").textContent;$("#twr-inline").textContent=$("#portfolio-twr").textContent;$("#xirr-inline").textContent=$("#portfolio-xirr").textContent;});}
export function resetWorkspace(){revision++;for(const id of ["method-cards","method-quote","method-facts","method-status","market-overview","wealth-inline","wealth-status","return-status","twr-inline","xirr-inline","dash-allocation","full-allocation","dash-income","income-chart","income-table","transaction-table","positions-list","transactions-list"])$("#"+id)?.replaceChildren();document.querySelectorAll("dialog[open]").forEach(d=>d.close());location.hash="dashboard";}
