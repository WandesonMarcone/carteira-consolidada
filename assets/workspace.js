// Navegação e painéis da Carteira. Não armazena dados privados fora da sessão.
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const fmt = new Intl.NumberFormat("pt-BR",{maximumFractionDigits:4});
const titles = {dashboard:"Visão geral",carteira:"Minha carteira",patrimonio:"Patrimônio",rentabilidade:"Rentabilidade",proventos:"Proventos",transacoes:"Transações",composicao:"Composição",metodologias:"Metodologias para ações",mercado:"Mercado"};
const methods = {GRAHAM:"Graham",BAZIN:"Bazin",GORDON_DDM:"Gordon (DDM)",DCF_FCFF:"Fluxo de caixa descontado (FCFF)",DCF_FCFE:"Fluxo de caixa descontado (FCFE)",LUCRO_RESIDUAL:"Lucro residual",LUCRO_PROJETADO:"Lucro projetado",PETER_LYNCH_PEG:"Peter Lynch (PEG)",DIVIDENDOS_PRECO_TETO:"Preço-teto por dividendos",MULTIPLOS_PARES:"Múltiplos de pares"};
let actions, revision=0, catalogRevision=0, catalogClass="stock", catalogPage=1, catalogRows=[], catalogLoaded=false;
function route(){
  const key=location.hash.slice(1); const page=Object.hasOwn(titles,key)?key:"dashboard";
  document.querySelectorAll("[data-screen]").forEach(el=>el.hidden=el.dataset.screen!==page);
  document.querySelectorAll("[data-page]").forEach(el=>{if(el.dataset.page===page)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current");});
  $("#welcome-title").textContent=titles[page];
  const group=["carteira","patrimonio","rentabilidade","proventos","transacoes","composicao"].includes(page)?"carteira":page;
  document.querySelectorAll("[data-nav]").forEach(el=>el.classList.toggle("selected",el.dataset.nav===group));
  if(page==="mercado"&&actions?.getUser()&&!catalogLoaded)loadCatalog();
  $("#new-position").hidden=!(page==="dashboard"||page==="carteira");
  $("#portfolio-performance").hidden=!(page==="dashboard"||page==="rentabilidade"||page==="patrimonio");
}
function table(headers, rows){return rows.length?"<table><thead><tr>"+headers.map(x=>"<th>"+esc(x)+"</th>").join("")+"</tr></thead><tbody>"+rows.map(r=>"<tr>"+r.map(x=>"<td>"+esc(x)+"</td>").join("")+"</tr>").join("")+"</tbody></table>":'<p class="empty">Nenhum registro disponível.</p>';}
function bars(items, total){return items.length?items.map(([label,value])=>'<div class="bar-item"><div><span>'+esc(label)+'</span><strong>'+money.format(value)+(total>0?' • '+fmt.format(100*value/total)+'%':'')+'</strong></div><div class="bar-track"><span style="width:'+Math.max(0,Math.min(100,total>0?100*value/total:0))+'%"></span></div></div>').join(""):'<p class="empty">Nenhum registro disponível.</p>';}
export function renderWorkspace({positions,transactions,quotes,types,positionValue,transactionTotal,operationName}){
  if(location.hash==="#mercado"&&!catalogLoaded&&actions?.getUser()&&$("#catalog-retry").hidden)loadCatalog();
  const groups={}; for(const p of positions){const label=types[p.asset_type]||p.asset_type;groups[label]=(groups[label]||0)+positionValue(p);}
  const list=Object.entries(groups).sort((a,b)=>b[1]-a[1]), total=list.reduce((s,x)=>s+x[1],0);
  const note='<p class="data-note">Estimativa: '+Object.keys(quotes).length+' de '+positions.length+' posições com cotação. Sem cotação, utiliza preço médio.</p>';
  $("#dash-allocation").innerHTML=donut(list,total)+note; $("#full-allocation").innerHTML=bars(list,total)+note;
  const income=transactions.filter(t=>t.operation==="dividend"); const months={};for(const t of income){const key=t.traded_at.slice(0,7);months[key]=(months[key]||0)+transactionTotal(t);}
  const limit=new Date();limit.setFullYear(limit.getFullYear()-1);const cutoff=limit.toISOString().slice(0,10);
  $("#dash-income-total").textContent=money.format(income.filter(t=>t.traded_at>=cutoff&&t.traded_at<=new Date().toISOString().slice(0,10)).reduce((s,t)=>s+transactionTotal(t),0));
  $("#dash-transactions").innerHTML=table(["Ativo","Operação","Valor"],transactions.slice().reverse().slice(0,5).map(t=>[t.ticker,operationName(t.operation),money.format(transactionTotal(t))]));
  const monthly=Object.entries(months).sort((a,b)=>a[0].localeCompare(b[0]));const sum=income.reduce((s,t)=>s+transactionTotal(t),0);
  $("#dash-income").innerHTML='<strong class="hero-value">'+money.format(sum)+'</strong><p>Total registrado em todos os períodos</p>'+bars(monthly.slice(-6),sum);
  $("#income-chart").innerHTML=bars(monthly.slice(-12),sum);
  $("#income-table").innerHTML=table(["Data","Ativo","Valor recebido"],income.slice().reverse().map(t=>[t.traded_at,t.ticker,money.format(transactionTotal(t))]));
  $("#transaction-table").innerHTML=table(["Data","Ativo","Operação","Quantidade","Valor"],transactions.slice().reverse().map(t=>[t.traded_at,t.ticker,operationName(t.operation),t.quantity??"—",money.format(transactionTotal(t))]));
}
function donut(items,total){
 if(!(total>0)||items.some(x=>x[1]<0))return bars(items,total);
 const colors=["#174837","#C5A45D","#8BA48D","#66776A","#D6D2C5","#896F47","#477E72"];let at=0;
 const legend=items.map(([label,value],i)=>{const start=at;at+=100*value/total;return {label,value,start,end:at,color:colors[i%colors.length]};});
 return '<div class="donutbox"><div class="donut" style="background:conic-gradient('+legend.map(x=>x.color+" "+x.start+"% "+x.end+"%").join(",")+')"><span>'+esc(money.format(total))+'</span></div><div class="donut-legend">'+legend.map(x=>'<div><i style="background:'+x.color+'"></i><span>'+esc(x.label)+'</span><b>'+fmt.format(100*x.value/total)+'%</b></div>').join("")+'</div></div>';
}
function printable(v){return v==null?"N/D":Array.isArray(v)?v.join(", "):typeof v==="object"?JSON.stringify(v):String(v);}
async function searchMethods(e){
  e.preventDefault();if($("#method-class").value!=="stock"){ $("#method-status").textContent="Metodologias disponíveis apenas para ações."; return; }const ticket=++revision;const ticker=$("#method-ticker").value.trim().toUpperCase(), type="stock";const p={ticker,asset_type:type};
  const path="/api/v1/assets/"+encodeURIComponent(ticker);$("#method-status").textContent="Consultando "+ticker+"…";for(const id of ["method-cards","method-quote","method-facts"])$("#"+id).replaceChildren();
  const result=await Promise.allSettled([actions.api(path+"?asset_type="+type),actions.api(path+"/coverage"),actions.api(path+"/fundamentals?years=5")]);
  if(ticket!==revision)return;
  const [quote,coverage,facts]=result.map(r=>r.status==="fulfilled"?r.value:null);
  const asset=quote?.data, rows=(Array.isArray(coverage?.data)?coverage.data:[]).filter(r=>r.classe==="ACAO");
  $("#method-status").textContent=rows.length?rows.length+" metodologias com cobertura registrada.":"Não foi retornada cobertura para esta classe. Cálculos bloqueados.";
  if(result.some(r=>r.status==="rejected"))$("#method-status").textContent+=" Uma ou mais consultas falharam.";
  $("#method-quote").innerHTML=asset?.price!=null?'<div class="method-price">Cotação de '+esc(ticker)+' <strong>'+money.format(asset.price)+'</strong><small>Referência: '+esc(asset.updated_at||"não informada")+'</small></div>':"";
  const derived=facts?.data?.derived_indicators||[];const observed=facts?.data?.facts||[];
  $("#method-facts").innerHTML=table(["Período","Indicador","Valor","Unidade","Qualidade"],derived.slice().reverse().map(x=>[x.periodo_fim,x.indicador,x.valor==null?"N/D":fmt.format(x.valor),x.unidade,x.qualidade]))+'<details><summary>Fatos contábeis ('+observed.length+')</summary>'+table(["Período","Métrica","Valor","Unidade","Fonte"],observed.slice().reverse().map(x=>[x.periodo_fim,x.metrica,x.valor==null?"N/D":fmt.format(x.valor),x.unidade,x.fonte]))+'</details>';
  for(const r of rows){
    const card=document.createElement("article");card.className="valuation method-card";
    card.innerHTML='<span>'+esc(methods[r.metodo]||r.metodo)+'</span><strong>'+esc(r.status.replaceAll("_"," "))+'</strong><span>Anos disponíveis: '+esc(r.anos_disponiveis??"N/D")+'</span><span>Faltam: '+esc(printable(r.campos_ausentes))+'</span><span>'+esc(r.observacao||"")+'</span>';
    $("#method-cards").append(card);
    if(type!=="stock"||!["PRONTO","PREMISSAS_NECESSARIAS"].includes(r.status))continue;
    const annual=derived.filter(x=>["ANUAL","DFP"].includes(String(x.periodicidade).toUpperCase()));
    const latest=(key,day)=>annual.filter(x=>String(x.indicador).toUpperCase()===key&&x.valor!=null&&Number.isFinite(Number(x.valor))&&(!day||x.periodo_fim===day)).sort((a,b)=>String(b.periodo_fim).localeCompare(String(a.periodo_fim)))[0];
    let fields=[],base, formula, calculate;
    if(r.metodo==="GRAHAM"){
      const lpa=latest("LPA"),vpa=lpa&&latest("VPA",lpa.periodo_fim);
      if(lpa&&vpa&&Number(lpa.valor)>0&&Number(vpa.valor)>0){base={period:lpa.periodo_fim,lpa:lpa.valor,vpa:vpa.valor};formula="sqrt(22.5*LPA*VPA)";calculate=()=>Math.sqrt(22.5*Number(lpa.valor)*Number(vpa.valor));}
    }else if(["BAZIN","DIVIDENDOS_PRECO_TETO","GORDON_DDM"].includes(r.metodo)){
      const dpa=latest("DPA");
      if(dpa&&Number(dpa.valor)>0){
        base={period:dpa.periodo_fim,dpa:dpa.valor};
        if(r.metodo==="GORDON_DDM"){fields=[["growth","Crescimento anual (%)",""],["rate","Custo de capital (%)",""]];formula="DPA*(1+g)/(k-g)";calculate=v=>v.rate>v.growth&&v.rate>0&&v.growth>-100?Number(dpa.valor)*(1+v.growth/100)/((v.rate-v.growth)/100):null;}
        else{fields=[["rate","Dividend yield exigido (%)",""]];formula="DPA/yield";calculate=v=>v.rate>0?Number(dpa.valor)/(v.rate/100):null;}
      }
    }else{card.insertAdjacentHTML("beforeend","<p>Calculadora específica ainda não implementada.</p>");continue;}
    if(!calculate){card.insertAdjacentHTML("beforeend","<p>Dados anuais compatíveis não disponíveis.</p>");continue;}
    const box=document.createElement("div");box.innerHTML='<p>Base: '+esc(base.period)+' • '+esc(formula)+'</p>'+fields.map(([key,label,value])=>'<label>'+esc(label)+'<input data-param="'+key+'" type="number" step="any" value="'+value+'"></label>').join("")+'<label>Margem de segurança (%)<input data-param="margin" type="number" min="0" max="99" step="any" value="0"></label><p class="ceiling"></p><button class="secondary" type="button">Salvar preço-teto</button><p class="message" role="status"></p>';card.append(box);
    const params=()=>Object.fromEntries([...box.querySelectorAll("input")].map(input=>[input.dataset.param,input.value.trim()===""?NaN:Number(input.value)]));
    const calc=()=>{const v=params();if(Object.values(v).some(x=>!Number.isFinite(x))||v.margin<0||v.margin>99)return null;const fair=calculate(v);return Number.isFinite(fair)&&fair>0?{fair,ceiling:fair*(1-v.margin/100),v}:null;};
    const update=()=>{const c=calc();box.querySelector(".ceiling").textContent=c?"Valor calculado: "+money.format(c.fair)+" • Preço-teto: "+money.format(c.ceiling):"Informe premissas válidas.";box.querySelector("button").disabled=!c;};box.querySelectorAll("input").forEach(input=>input.oninput=update);update();
    const key=r.metodo.toLowerCase();
    if(key!=="graham"){box.querySelector("button").hidden=true;box.querySelector(".message").textContent="Cálculo disponível; salvamento depende de atualização do schema Supabase.";continue;}
    box.querySelector("button").onclick=async()=>{const c=calc();if(!c)return;try{await actions.saveValuation(p,key,c.ceiling,{formula,...base,...c.v});box.querySelector(".message").textContent="Preço-teto salvo.";}catch{box.querySelector(".message").textContent="Não foi possível salvar.";}};
    try{const saved=await actions.personalValuation(p,key);if(ticket!==revision)return;if(saved?.ceiling_price!=null)box.querySelector(".message").textContent="Preço-teto salvo anteriormente: "+money.format(saved.ceiling_price);}catch{}

  }
}
async function market(){const ticket=revision;$("#market-overview").textContent="Consultando…";try{const r=await actions.api("/api/v1/market/overview");if(ticket!==revision)return;const data=r.data;const flatten=(v,p="",depth=0)=>v!==null&&typeof v==="object"&&depth<5?Object.entries(v).flatMap(([k,x])=>flatten(x,p?p+" / "+k:k,depth+1)):[[p,printable(v)]];$("#market-overview").innerHTML=table(["Indicador","Valor"],data?flatten(data):[]);}catch(e){if(ticket===revision)$("#market-overview").textContent=e.message;}}

// Catálogo paginado: somente dados fornecidos pelo Robô, sem lista inventada.
async function loadCatalog(){
  if(!actions?.getUser())return;
  const token=++catalogRevision;catalogLoaded=true;
  const search=$("#catalog-search").value.trim(),sector=$("#catalog-sector").value;
  $("#catalog-manual").hidden=true;$("#catalog-retry").hidden=true;$("#catalog-status").textContent="Consultando catálogo…";$("#catalog-list").setAttribute("aria-busy","true");
  $("#catalog-prev").disabled=true;$("#catalog-next").disabled=true;
  try{
    const params=new URLSearchParams({asset_type:catalogClass,page:String(catalogPage),page_size:"24",q:search,sector});
    const response=await actions.api("/api/v1/assets?"+params.toString());
    if(token!==catalogRevision||!actions.getUser())return;
    if(!Array.isArray(response.data))throw Error("Formato de catálogo não suportado.");
    catalogRows=response.data.filter(x=>x&&x.asset_type===catalogClass&&/^[A-Z0-9._-]{1,16}$/.test(x.ticker));
    const sectors=Array.isArray(response.sectors)?response.sectors.filter(s=>typeof s==="string"):[];
    const select=$("#catalog-sector");select.replaceChildren(new Option("Todos os setores",""));
    for(const s of new Set([...sectors,...(sector?[sector]:[])]))select.add(new Option(s,s));select.value=sector;
    $("#catalog-status").textContent=catalogRows.length?"Página "+catalogPage+(Number.isFinite(response.total)?" • "+response.total+" ativos cadastrados no Robô":""):"Nenhum ativo encontrado.";
    $("#catalog-prev").disabled=catalogPage<=1;$("#catalog-next").disabled=response.has_more!==true;
  }catch(e){
    if(token!==catalogRevision||!actions.getUser())return;
    $("#catalog-manual").hidden=false;
    catalogRows=actions.getPositions().filter(p=>p.asset_type===catalogClass&&(!search||p.ticker.toLowerCase().includes(search.toLowerCase())));
    catalogLoaded=false;$("#catalog-retry").hidden=false;$("#catalog-status").textContent="Catálogo temporariamente indisponível. "+e.message+" Exibindo posições cadastradas.";
  }
  $("#catalog-list").replaceChildren();$("#catalog-list").removeAttribute("aria-busy");
  for(const p of catalogRows){
    const row=document.createElement("button");row.className="catalog-row";row.type="button";
    const mark=document.createElement("span");mark.className="asset-logo";mark.textContent=p.ticker.slice(0,2);
    if(typeof p.logo_url==="string"&&p.logo_url.startsWith("https://")){
      const img=document.createElement("img");img.src=p.logo_url;img.alt="";img.loading="lazy";img.referrerPolicy="no-referrer";img.onerror=()=>img.remove();mark.append(img);
    }
    const text=document.createElement("span");text.className="catalog-name";const title=document.createElement("strong");title.textContent=p.ticker;const subtitle=document.createElement("small");subtitle.textContent=[p.name,p.sector,p.subsector].filter(Boolean).join(" • ")||"Ver detalhes";text.append(title,subtitle);
    const value=document.createElement("span");value.className="catalog-price";value.textContent=p.price!=null&&Number.isFinite(Number(p.price))?money.format(Number(p.price)):"›";
    row.append(mark,text,value);row.onclick=()=>actions.openAsset(actions.getPositions().find(x=>x.ticker===p.ticker&&x.asset_type===p.asset_type)||p);$("#catalog-list").append(row);
  }
}
function setupCatalog(){
  $("#catalog-retry").onclick=()=>loadCatalog();
  $("#pick-stock").onclick=()=>{catalogClass="stock";catalogPage=1;$("#catalog-search").value="";$("#catalog-sector").value="";document.querySelectorAll("[data-market-class]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.marketClass==="stock")));catalogLoaded=false;location.hash="mercado";};
  $("#catalog-manual").onclick=()=>actions.openPosition();
  document.querySelectorAll("[data-market-class]").forEach(b=>b.onclick=()=>{catalogClass=b.dataset.marketClass;catalogPage=1;$("#catalog-sector").value="";document.querySelectorAll("[data-market-class]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));loadCatalog();});
  let timer;$("#catalog-search").oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{catalogPage=1;loadCatalog();},300);};
  $("#catalog-sector").onchange=()=>{catalogPage=1;loadCatalog();};
  $("#catalog-prev").onclick=()=>{if(catalogPage>1){catalogPage--;loadCatalog();}};
  $("#catalog-next").onclick=()=>{catalogPage++;loadCatalog();};
  document.querySelectorAll("[data-menu]").forEach(b=>b.onclick=()=>{const wallet=b.dataset.menu==="wallet";$("#wallet-menu").hidden=!wallet;$("#more-menu").hidden=wallet;$("#sheet-title").textContent=wallet?"Minha carteira":"Mais";$("#nav-sheet").showModal();});
  $("#wallet-menu").querySelectorAll("a").forEach(a=>a.onclick=()=>$("#nav-sheet").close());
  $("#profile-open").onclick=()=>{$("#nav-sheet").close();$("#profile-email").textContent=actions.getUser()?.email||"";$("#profile-dialog").showModal();};
  $("#sheet-logout").onclick=()=>{$("#nav-sheet").close();actions.logout();};
}

export function setupWorkspace(opts){actions=opts;setupCatalog();window.addEventListener("hashchange",route);route();$("#position-search").oninput=opts.render;$("#position-filter").onchange=opts.render;$("#method-search").onsubmit=searchMethods;$("#market-refresh").onclick=market;document.querySelectorAll(".history-trigger").forEach(b=>b.onclick=async()=>{await opts.openPerformance(false);$("#wealth-inline").innerHTML=$("#portfolio-chart").innerHTML;$("#wealth-status").textContent=$("#performance-status").textContent;$("#return-status").textContent=$("#performance-status").textContent;$("#twr-inline").textContent=$("#portfolio-twr").textContent;$("#xirr-inline").textContent=$("#portfolio-xirr").textContent;$("#dash-wealth").innerHTML=$("#portfolio-chart").innerHTML;$("#dash-return").textContent=$("#portfolio-twr").textContent;$("#dash-history-status").textContent=$("#performance-status").textContent;});}
export function resetWorkspace(){revision++;catalogRevision++;catalogLoaded=false;catalogRows=[];catalogPage=1;$("#catalog-list").replaceChildren();$("#catalog-status").textContent="";$("#profile-email").textContent="";for(const id of ["dash-return","dash-wealth","dash-history-status","dash-income-total","dash-transactions","method-cards","method-quote","method-facts","method-status","market-overview","wealth-inline","wealth-status","return-status","twr-inline","xirr-inline","dash-allocation","full-allocation","dash-income","income-chart","income-table","transaction-table","positions-list","transactions-list"])$("#"+id)?.replaceChildren();document.querySelectorAll("dialog[open]").forEach(d=>d.close());location.hash="dashboard";}
