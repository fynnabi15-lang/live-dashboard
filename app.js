'use strict';
/* BOT·COCKPIT – reine Anzeige. Alle Werte stammen aus echten Quellen; fehlt etwas, steht "–". */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const nf=(v,d=2)=>{v=+v;if(!isFinite(v))return'–';d=Math.max(0,Math.min(20,d|0));return v.toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d})};
const usd=(v,d=2)=>v==null||!isFinite(v)?'–':'$'+nf(v,d);
const pct=v=>v==null||!isFinite(v)?'–':(v>=0?'+':'')+nf(v,2)+' %';
const cls=v=>v>0?'up':v<0?'down':'sec';
const px=v=>{if(v==null||!isFinite(v))return'–';v=+v;if(v>=1000)return usd(v);if(v>=1)return usd(v,v>=100?2:3);if(v>=.01)return'$'+nf(v,4);if(v===0)return'$0';return'$'+nf(v,Math.min(12,Math.max(4,2-Math.floor(Math.log10(v))+1)))};
const cmp=v=>{if(v==null||!isFinite(v))return'–';v=+v;const a=Math.abs(v);return a>=1e9?nf(v/1e9,2)+' Mrd':a>=1e6?nf(v/1e6,2)+' Mio':a>=1e4?nf(v/1e3,1)+' Tsd':nf(v,0)};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const berlin=(t,o)=>new Date(t).toLocaleString('de-DE',{timeZone:'Europe/Berlin',...o});
const tmS=t=>berlin(t,{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const tmM=t=>berlin(t,{hour:'2-digit',minute:'2-digit'});
const dtM=t=>berlin(t,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const ago=t=>{if(!t)return'–';const s=Math.max(0,(Date.now()-t)/1000);return s<5?'gerade eben':s<60?'vor '+Math.floor(s)+' s':s<3600?'vor '+Math.floor(s/60)+' Min':s<86400?'vor '+Math.floor(s/3600)+' Std '+Math.floor(s%3600/60)+' Min':'vor '+Math.floor(s/86400)+' Tg'};
const short=m=>m?m.slice(0,4)+'…'+m.slice(-4):'';
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0)/4294967295};
const REASON={LIQUIDITY_TOO_LOW:'Liquidität zu niedrig',VERDICT_NOT_BUY:'Urteil war kein Kauf',RUG_RISK:'Rug-Risiko',RUGCHECK_FAIL:'RugCheck nicht bestanden',SENTIMENT_BLOCK:'Sentiment blockiert',DATA_MISSING:'Daten fehlen',STATUS_NOT_PASS:'Status nicht PASS',ROUTE_UNKNOWN:'Handelsroute unbekannt'};
const reasonDe=c=>REASON[c]||String(c).replace(/_/g,' ').toLowerCase().replace(/^./,x=>x.toUpperCase());
const GROUPS={Scout:['Scouts','Suchen neue Coins & Auffälligkeiten (Launches, Whales, Sentiment).'],Analyst:['Analyse','Bewertet Kandidaten: BUY / MONITOR / SKIP mit Confidence.'],Filter:['Filter','Prüfen Rug-Risiko und Liquidität.'],Guard:['Wächter','Letztes Tor: Risikolimits vor jedem Kauf.'],Sniper:['Sniper','Führt Käufe aus – aktuell nur Paper-Modus.'],Support:['Support · Positionen & Journal','Positionen, Journal und Steuer-Ledger.'],Infra:['Infrastruktur','Wallet-Funding, Health, Backtest, Streitschlichter.']};
const CEX=[['SOL','Solana'],['BTC','Bitcoin'],['ETH','Ethereum'],['JUP','Jupiter'],['BONK','Bonk'],['WIF','dogwifhat'],['XRP','XRP'],['BNB','BNB'],['DOGE','Dogecoin']];
const HLN={BONK:['kBONK',1000]};
const SOL_MINT='So11111111111111111111111111111111111111112';

/* ---------- Zustand ---------- */
const D={snap:null,t0:Date.now(),px:{},dex:{},dexT:0,wal:{},spark:{},tickCount:0,tps:0,
 src:{bin:{mode:null,t:0,err:null,wsFail:0},hl:{ok:false,t:0},dex:{ok:null,t:0,err:null},sol:{mode:null,t:0},stream:{}},
 stream:{url:null,open:false,lastMsg:0,lastState:0,seq:0,clients:null,fails:0,es:null},stateAt:0,evKeys:new Set(),seen:false,extra:new Set()};
const UI={drawer:null,tab:'sys'};
const jget=async(u,o)=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);try{const r=await fetch(u,{...o,signal:c.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(t)}};
const jpost=(u,b)=>jget(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});

/* ---------- Bot-Daten: Stream (SSE) oder Snapshot ---------- */
let CFG={stream:null,state:'state.json'};
async function initBotData(){
 try{CFG={...CFG,...await jget('config.json?t='+Date.now(),{cache:'no-store'})}}catch{}
 const q=new URLSearchParams(location.search).get('stream');
 if(q&&/^https?:\/\//i.test(q))CFG.stream=q;
 D.stream.url=CFG.stream&&/^https?:\/\//i.test(CFG.stream)?CFG.stream:null;
 pollSnapshot();
 if(D.stream.url)openStream();
}
function openStream(){
 if(D.stream.es){try{D.stream.es.close()}catch{}}
 let es;try{es=new EventSource(D.stream.url)}catch{D.stream.fails++;return setTimeout(openStream,30000)}
 D.stream.es=es;
 es.onopen=()=>{D.stream.open=true;D.stream.fails=0;D.stream.lastMsg=Date.now()};
 es.addEventListener('state',e=>{try{const s=JSON.parse(e.data);D.stream.lastMsg=D.stream.lastState=Date.now();D.stream.open=true;applyState(s,'stream');ecgKick(1)}catch(x){console.warn('Stream-Daten ungültig',x)}});
 es.addEventListener('ping',e=>{try{const p=JSON.parse(e.data);D.stream.seq=p.seq;D.stream.clients=p.clients}catch{}D.stream.lastMsg=Date.now();D.stream.open=true;ecgKick(.45)});
 es.onerror=()=>{D.stream.open=false;D.stream.fails++;if(D.stream.fails>=3){try{es.close()}catch{}D.stream.es=null;setTimeout(openStream,45000)}};
}
async function pollSnapshot(){
 const live=D.stream.open&&Date.now()-D.stream.lastMsg<25000;
 if(!live){try{const s=await jget((CFG.state||'state.json')+'?t='+Date.now(),{cache:'no-store'});applyState(s,'snapshot');ecgKick(.8)}catch(e){D.src.snapErr=String(e.message||e)}}
 setTimeout(pollSnapshot,30000);
}
function applyState(s,from){
 if(!s||!s.bots)return;
 if(D.snap&&from==='snapshot'&&D.stream.lastState&&s.generatedAt<=D.snap.generatedAt)return;
 const first=!D.snap;D.snap=s;D.stateAt=Date.now();D.stateFrom=from;
 s.coins.forEach(c=>c.mint&&!c.mint.startsWith('0x'));
 let fresh=0;const keys=new Set();
 for(const e of s.events){const k=e.t+'|'+e.agent+'|'+e.sym+'|'+e.text;keys.add(k);if(!D.evKeys.has(k)){e._new=!first;if(!first)fresh++}}
 D.evKeys=keys;
 renderAll(first);
 if(fresh&&D.sound)beep(fresh>2?880:660);
 pollDex(true);subSol();
}

/* ---------- Kurse: Binance WS → Hyperliquid WS → REST ---------- */
const dirty=new Set();
function setPx(k,o){const q=D.px[k]||(D.px[k]={});const old=q.p;Object.assign(q,o);if(o.p!=null){q.dir=old==null?0:o.p>old?1:o.p<old?-1:0;q.pt=Date.now();D.tickCount++}dirty.add(k)}
let bws=null,bwsI=0,bwsBack=1000,bwsMsg=0;
const BHOSTS=['wss://stream.binance.com:443','wss://data-stream.binance.vision','wss://stream.binance.com:9443'];
function binConnect(){
 const st=CEX.flatMap(([s])=>[s.toLowerCase()+'usdt@trade',s.toLowerCase()+'usdt@miniTicker']).join('/');
 const host=BHOSTS[bwsI%BHOSTS.length];let w,got=false;
 try{w=new WebSocket(host+'/stream?streams='+st)}catch{bwsI++;return setTimeout(binConnect,bwsBack)}
 bws=w;
 w.onopen=()=>{D.src.bin.mode='WebSocket';D.src.bin.host=host.replace('wss://','')};
 w.onmessage=ev=>{got=true;bwsMsg=Date.now();bwsBack=1000;D.src.bin.t=bwsMsg;D.src.bin.mode='WebSocket';let m;try{m=JSON.parse(ev.data).data}catch{return}if(!m||!m.s)return;const k=m.s.replace('USDT','');
  if(m.e==='trade')setPx(k,{p:+m.p,src:'Binance WS'});
  else if(m.e==='24hrMiniTicker'){const o={ch:(+m.c-+m.o)/+m.o*100,h:+m.h,l:+m.l,q:+m.q,o:+m.o};if(!D.px[k]?.pt||Date.now()-D.px[k].pt>4000){o.p=+m.c;o.src='Binance WS'}setPx(k,o)}};
 w.onclose=()=>{if(bws!==w)return;if(!got){bwsI++;D.src.bin.wsFail++}setTimeout(binConnect,bwsBack);bwsBack=Math.min(bwsBack*1.6,20000)};
 w.onerror=()=>{try{w.close()}catch{}};
}
async function binRest(){
 const q=encodeURIComponent(JSON.stringify(CEX.map(([s])=>s+'USDT')));let d,err;
 for(const h of['https://api.binance.com','https://data-api.binance.vision']){try{d=await jget(h+'/api/v3/ticker/24hr?symbols='+q);break}catch(e){err=e}}
 if(!d)throw err;d.forEach(t=>setPx(t.symbol.replace('USDT',''),{p:+t.lastPrice,ch:+t.priceChangePercent,h:+t.highPrice,l:+t.lowPrice,q:+t.quoteVolume,o:+t.openPrice,src:'Binance REST'}));D.src.bin.mode='REST';D.src.bin.t=Date.now();
}
setInterval(async()=>{if(Date.now()-bwsMsg>6000&&Date.now()-D.t0>2500){try{await binRest();D.src.bin.err=null}catch(e){D.src.bin.err=String(e.message||e)}}},2000);
// Hyperliquid: allMids (WebSocket), nur als Ersatz wenn Binance still ist; Tagesänderung per REST
let hws=null;
function hlConnect(){
 let w;try{w=new WebSocket('wss://api.hyperliquid.xyz/ws')}catch{return setTimeout(hlConnect,20000)}hws=w;
 w.onopen=()=>{D.src.hl.ok=true;w.send(JSON.stringify({method:'subscribe',subscription:{type:'allMids'}}))};
 w.onmessage=ev=>{let m;try{m=JSON.parse(ev.data)}catch{return}if(m.channel!=='allMids')return;D.src.hl.t=Date.now();D.src.hl.ok=true;const mids=m.data.mids;
  if(Date.now()-bwsMsg<6000)return;
  for(const [s] of CEX){const h=HLN[s];const v=+mids[h?h[0]:s];if(isFinite(v)&&v>0){const p=h?v/h[1]:v;setPx(s,{p,src:'Hyperliquid WS'})}}};
 w.onclose=()=>{D.src.hl.ok=false;if(hws===w)setTimeout(hlConnect,5000)};w.onerror=()=>{try{w.close()}catch{}};
}
async function hlChange(){
 if(Date.now()-bwsMsg<6000&&D.src.bin.mode==='WebSocket')return;
 try{const [meta,ctx]=await jpost('https://api.hyperliquid.xyz/info',{type:'metaAndAssetCtxs'});meta.universe.forEach((u,i)=>{const e=CEX.find(([s])=>(HLN[s]?HLN[s][0]:s)===u.name);if(!e)return;const c=ctx[i],k=HLN[e[0]]?.[1]||1;const prev=+c.prevDayPx/k,cur=+c.midPx/k;if(prev>0&&D.px[e[0]]?.src!=='Binance WS')setPx(e[0],{ch:(cur-prev)/prev*100,...(D.px[e[0]]?.p==null?{p:cur,src:'Hyperliquid'}:{})})})}catch{}
}
setInterval(hlChange,30000);

/* ---------- Memecoins: DexScreener ---------- */
function botMints(){const s=D.snap;if(!s)return[];const out=[];const add=m=>{if(m&&!m.startsWith('0x')&&!out.includes(m))out.push(m)};
 s.positions.forEach(p=>add(p.mint));s.radar.forEach(r=>add(r.mint));s.flow.forEach(f=>add(f.mint));s.bots.forEach(b=>add(b.coin?.mint));s.coins.forEach(c=>add(c.mint));D.extra.forEach(add);return out.slice(0,60)}
let dexBusy=false;
async function pollDex(now){
 if(dexBusy&&!now)return;if(!D.snap)return;dexBusy=true;
 try{const list=botMints();for(let i=0;i<list.length;i+=30){const part=list.slice(i,i+30);const d=await jget('https://api.dexscreener.com/tokens/v1/solana/'+part.join(','));const best={};d.forEach(p=>{const a=p.baseToken.address;if(!best[a]||(p.liquidity?.usd||0)>(best[a].liquidity?.usd||0))best[a]=p});
  part.forEach(a=>{const p=best[a];const old=D.dex[a];D.dex[a]=p?{price:+p.priceUsd,c5:p.priceChange?.m5??null,c1:p.priceChange?.h1??null,c6:p.priceChange?.h6??null,c24:p.priceChange?.h24??null,liq:p.liquidity?.usd??null,v5:p.volume?.m5??null,v1:p.volume?.h1??null,v24:p.volume?.h24??null,mc:p.marketCap??null,fdv:p.fdv??null,tx:p.txns?.h24||null,pair:p.pairAddress,url:p.url,dex:p.dexId,sym:p.baseToken.symbol,name:p.baseToken.name,created:p.pairCreatedAt||null,t:Date.now(),dir:old&&!old.none?(+p.priceUsd>old.price?1:+p.priceUsd<old.price?-1:0):0}:{none:true,t:Date.now()};
   if(p){const sp=D.spark['m'+a]||(D.spark['m'+a]=[]);sp.push(+p.priceUsd);if(sp.length>60)sp.shift();dirty.add('m'+a)}})}
  D.src.dex={ok:true,t:Date.now(),err:null}}catch(e){D.src.dex.ok=false;D.src.dex.err=String(e.message||e)}
 dexBusy=false;
}
setInterval(()=>pollDex(),5000);

/* ---------- Solana: WSS accountSubscribe (+ RPC-Start/Abgleich) ---------- */
let sws=null,solSubbed='',solMsg=0;
const RPC='https://solana-rpc.publicnode.com';
async function solPoll(){
 if(!D.snap)return;const a=D.snap.wallets.map(w=>w.address);
 try{const r=await jpost(RPC,{jsonrpc:'2.0',id:1,method:'getMultipleAccounts',params:[a,{encoding:'base64',dataSlice:{offset:0,length:0}}]});if(r.error)throw new Error(r.error.message);r.result.value.forEach((v,i)=>{D.wal[a[i]]={sol:(v?v.lamports:0)/1e9,t:Date.now(),via:'RPC'}});D.src.sol.rpc=true;D.src.sol.err=null}catch(e){D.src.sol.err=String(e.message||e)}
}
setInterval(solPoll,20000);
function subSol(){
 if(!D.snap)return;const key=D.snap.wallets.map(w=>w.address).join(',');
 if(solSubbed===key&&sws&&sws.readyState<=1)return;solSubbed=key;solPoll();
 try{sws&&sws.close()}catch{}
 let w;try{w=new WebSocket('wss://solana-rpc.publicnode.com')}catch{D.src.sol.mode=null;return}sws=w;const ids={};
 w.onopen=()=>{D.snap.wallets.forEach((x,i)=>{ids[i+1]=x.address;w.send(JSON.stringify({jsonrpc:'2.0',id:i+1,method:'accountSubscribe',params:[x.address,{encoding:'base64',commitment:'confirmed'}]}))});D.src.sol.mode='WebSocket'};
 const subs={};
 w.onmessage=ev=>{let m;try{m=JSON.parse(ev.data)}catch{return}solMsg=D.src.sol.t=Date.now();
  if(m.id&&typeof m.result==='number'){subs[m.result]=ids[m.id];return}
  if(m.method==='accountNotification'){const a=subs[m.params.subscription];const v=m.params.result?.value;if(a&&v){const old=D.wal[a]?.sol;D.wal[a]={sol:v.lamports/1e9,t:Date.now(),via:'WSS',flash:old!=null&&old!==v.lamports/1e9};if(D.wal[a].flash){feedLocal(`Wallet-Bestand geändert: ${nf(v.lamports/1e9,4)} SOL`);if(D.sound)beep(520)}}}};
 w.onclose=()=>{D.src.sol.mode=null;if(sws===w){solSubbed='';setTimeout(subSol,8000)}};w.onerror=()=>{try{w.close()}catch{}};
}
const localFeed=[];
function feedLocal(text){localFeed.unshift({t:Date.now(),agent:'Solana WSS',kind:'Wallet',text,level:'info',_new:true,local:true});if(localFeed.length>10)localFeed.pop();renderFeed()}


/* ---------- Helfer: DOM ---------- */
const setT=(el,t)=>{if(el&&el.textContent!==t)el.textContent=t};
const botSt=b=>{if(!b.lastT)return['none','WARTET'];const m=(Date.now()-b.lastT)/60000;return m<=15?['active','AKTIV']:m<=120?['calm','RUHIG']:['idle','INAKTIV']};
const bName=b=>b.name.replace(/^[A-D]\d\s*/,'')||b.name;
const vcls=v=>!v?'':/^(BUY|STRONG|OK|PASS|ABGEGLICHEN|BEREIT|HIGH)/i.test(v)||/bonding_9/.test(v)?'hi':/(BLOCK|SKIP|ALARM|DEGRADED|WARN|ABWEICH|DATEN|FAIL)/i.test(v)?'lo':'';
const symOf=m=>D.dex[m]?.sym||D.snap?.coins.find(c=>c.mint===m)?.symbol||D.snap?.radar.find(c=>c.mint===m)?.symbol||short(m);
const botById=id=>D.snap?.bots.find(b=>b.id===id);
let beepCtx=null;
function beep(f){try{beepCtx=beepCtx||new (window.AudioContext||window.webkitAudioContext)();const o=beepCtx.createOscillator(),g=beepCtx.createGain();o.frequency.value=f;o.type='sine';g.gain.setValueAtTime(.0001,beepCtx.currentTime);g.gain.exponentialRampToValueAtTime(.06,beepCtx.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,beepCtx.currentTime+.18);o.connect(g).connect(beepCtx.destination);o.start();o.stop(beepCtx.currentTime+.2)}catch{}}

/* ---------- Render: KPIs ---------- */
const KP=[];
function renderKpis(){
 const s=D.snap,host=$('#kpis');
 if(!KP.length){const names=['Bots aktiv','Signale','Radar-Kandidaten','Offene Positionen','Paper-Equity (SOL)','Wallet-SOL live'];names.forEach((n,i)=>{const d=document.createElement('div');d.className='kpi';d.style.animationDelay=i*70+'ms';d.innerHTML=`<small>${n}</small><b class="mono">–</b><span></span>`;host.appendChild(d);KP.push({el:d,b:d.children[1],sub:d.children[2],v:null,from:0,to:null,dec:0,t0:0})});
  host.children[0].dataset.tip='Bots mit Aktivität in den letzten 15 Minuten (live berechnet).';host.children[1].dataset.tip='Alle Analyse-Signale im Log, davon blockiert.';host.children[2].dataset.tip='Coins, die der Launch Sniffer im letzten Lauf nahe der Graduation (≥80 % Bonding Curve) gefunden hat.';host.children[3].dataset.tip='Offene Positionen laut Bot (Paper-Modus: simuliert).';host.children[4].dataset.tip='Simuliertes Paper-Konto des Bots – kein echtes Geld.';host.children[5].dataset.tip='SOL in Haupt- + Trading-Wallet, live über Solana-WebSocket.'}
 const act=s.bots.filter(b=>botSt(b)[0]==='active').length;
 const w=s.wallets.map(x=>D.wal[x.address]?.sol);const wsum=w.some(v=>v!=null)?w.reduce((a,v)=>a+(v||0),0):null;
 const vals=[[act,0,`von ${s.bots.length} Bots`],[s.counts.signals,0,`geblockt ${s.counts.blocked} · MONITOR ${s.counts.monitor}`],[s.radar.length,0,`Sniffer: ${s.sniffer?.scanned??'–'} gescannt (≥${s.sniffer?.minProgress??'–'} %)`],[s.pf.openPositions,0,`Modus ${s.mode}`],[s.paper?.equitySol,3,s.paper?`${s.paper.closed} geschlossen · Netto ${nf(s.paper.netPnlSol,3)} SOL`:''],[wsum,4,wsum==null?'wird geladen …':s.wallets.map(x=>x.label.split('-')[0]+' '+nf(D.wal[x.address]?.sol,3)).join(' · ')]];
 vals.forEach(([v,d,sub],i)=>{const k=KP[i];k.dec=d;setT(k.sub,sub);if(v==null){setT(k.b,'–');k.to=null;return}if(k.to!==v){k.from=k.v??0;k.to=v;k.t0=performance.now()}});
}
function animKpis(now){for(const k of KP){if(k.to==null)continue;const p=Math.min(1,(now-k.t0)/900),e=1-Math.pow(1-p,3);const v=k.from+(k.to-k.from)*e;if(k.v!==v||p<1){k.v=v;setT(k.b,nf(p<1?v:k.to,k.dec))}}}

/* ---------- Render: Bots ---------- */
function botHTML(b){return `<i class="sweep"></i><header><span class="dot"></span><span class="bid">${esc(b.id)}</span><b class="bn"></b><span class="stt"></span></header><p class="task"></p><div class="bcn"><button class="cs" data-act="coin" hidden></button><span class="cp mono"></span><span class="cc mono"></span></div><div class="vd"><span class="badge"></span><span class="conf"><i></i></span><span class="cv mono"></span></div><ul class="rs"></ul><div class="mt"></div><footer><span class="ago mono"></span><span class="more">Details ›</span></footer>`}
function renderBots(first){
 const s=D.snap,host=$('#bots');
 if(!host.children.length){let delay=0;for(const g of Object.keys(GROUPS)){const bs=s.bots.filter(b=>b.group===g);if(!bs.length)continue;const sec=document.createElement('section');sec.className='grp';sec.id='g-'+g;sec.innerHTML=`<h3 data-tip="${esc(GROUPS[g][1])}">${esc(GROUPS[g][0])}</h3><div class="gcards"></div>`;const gc=sec.lastChild;
  bs.forEach(b=>{const a=document.createElement('article');a.className='bot';a.tabIndex=0;a.dataset.act='bot';a.dataset.id=b.id;a.style.animationDelay=(delay++*45)+'ms';a.innerHTML=botHTML(b);gc.appendChild(a)});host.appendChild(sec)}}
 for(const b of s.bots){const el=$(`.bot[data-id="${b.id}"]`,host);if(el)updBot(el,b)}
 const act=s.bots.filter(b=>botSt(b)[0]==='active').length;
 setT($('#botsSub'),`${act} von ${s.bots.length} aktiv · klicke einen Bot für alle Details`);
}
function updBot(el,b){
 const [st,stt]=botSt(b);el.dataset.st=st;const r=b.reasoning;
 setT($('.bn',el),bName(b));setT($('.stt',el),stt);
 const task=b.task||'Noch keine Aktivität im Log';const tk=$('.task',el);
 const sig=(b.lastT||0)+'|'+task;if(el._sig!==undefined&&el._sig!==sig){el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash')}el._sig=sig;
 setT(tk,task);tk.title=task;
 const cs=$('.cs',el);if(b.coin&&b.coin.mint){cs.hidden=false;cs.dataset.mint=b.coin.mint;setT(cs,b.coin.sym||short(b.coin.mint))}else cs.hidden=true;
 const v=r?.verdict,bd=$('.badge',el);bd.hidden=!v;if(v){setT(bd,v);bd.className='badge '+vcls(v)}
 const cf=r?.confidence;$('.conf',el).hidden=cf==null;$('.conf i',el).style.width=(cf==null?0:Math.max(0,Math.min(100,cf)))+'%';setT($('.cv',el),cf==null?'':'Conf '+cf);
 const rs=(r?.reasons?.length?r.reasons.map(reasonDe):r?.risks?.length?[r.risks[0]]:[]).slice(0,2);
 const rh=rs.map(x=>`<li title="${esc(x)}">${esc(x)}</li>`).join('')||`<li style="border-style:dashed;color:#777">${r?'keine Gründe im Log':'keine Begründung vorhanden'}</li>`;if(el._rh!==rh){$('.rs',el).innerHTML=rh;el._rh=rh}
 const mh=(b.metrics||[]).slice(0,3).map(([l,x])=>`<div><small>${esc(l)}</small><b>${esc(x)}</b></div>`).join('');if(el._mh!==mh){$('.mt',el).innerHTML=mh;el._mh=mh}$('.mt',el).hidden=!mh;
 setT($('.ago',el),b.lastT?'zuletzt '+ago(b.lastT):'keine Zeitangabe');
 updBotLive(el,b);
}
function updBotLive(el,b){const m=b.coin?.mint,d=m&&D.dex[m];setT($('.cp',el),d&&!d.none?px(d.price):'');const c=$('.cc',el);if(d&&!d.none&&d.c5!=null){setT(c,pct(d.c5)+' 5m');c.className='cc mono '+cls(d.c5)}else setT(c,'')}
function liveBots(){const s=D.snap;if(!s)return;for(const b of s.bots){const el=$(`.bot[data-id="${b.id}"]`);if(!el)continue;const st=botSt(b);el.dataset.st=st[0];setT($('.stt',el),st[1]);setT($('.ago',el),b.lastT?'zuletzt '+ago(b.lastT):'keine Zeitangabe');updBotLive(el,b)}}

/* ---------- Render: Pipeline ---------- */
let coinEls=[],laneW=0;
function renderPipe(){
 const s=D.snap,host=$('#pipe');const st=s.stages;
 const key=st.join()+'|'+s.flow.slice(0,8).map(f=>f.mint+f.t).join();
 if(host._k!==key){host._k=key;
  host.innerHTML=`<div class="nodes">${st.map((n,i)=>`<div class="nd" data-act="stage" data-v="${n}"><div class="ring">${i+1}</div><b>${n}</b><small></small></div>`).join('')}</div><div class="lane">${st.map((n,i)=>`<i class="vl" style="left:${(i+.5)/st.length*100}%"></i>`).join('')}<span class="lnote">${s.flow.length?'':'Keine Signale im Log'}</span></div>`;
  const lane=$('.lane',host);coinEls=s.flow.slice(0,8).map((f,i)=>{const c=document.createElement('div');c.className='cn';c.dataset.act='coin';c.dataset.mint=f.mint;c.textContent=(f.sym||short(f.mint)).slice(0,10);
   c.dataset.tip=`${f.sym} · ${f.verdict||'–'} · Conf ${f.confidence??'–'} · ${f.stop?`gestoppt bei ${f.stop.stage}: ${f.stop.reason.split(', ').map(reasonDe).join(', ')}`:'bis zum Sniper gekommen'} · ${ago(f.t)}`;
   lane.appendChild(c);return{el:c,f,i,w:c.offsetWidth||70,x:false}});measure()}
 $$('.nd',host).forEach((n,i)=>{const g=st[i];const bs=s.bots.filter(b=>b.group===g),act=bs.filter(b=>botSt(b)[0]==='active').length;n.dataset.a=act?1:0;setT($('small',n),`${bs.length} Bot${bs.length===1?'':'s'} · ${act} aktiv`);n.dataset.tip=`${GROUPS[g]?.[1]||g} Klicken springt zu den Bots.`});
}
function measure(){const l=$('.lane');laneW=l?l.clientWidth:0;coinEls.forEach(c=>c.w=c.el.offsetWidth||70)}
const ease=p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
function animPipe(now){
 if(!coinEls.length||!laneW)return;const n=D.snap.stages.length,C=11000,N=coinEls.length;
 coinEls.forEach((c,k)=>{const ph=((now+k*C/N)%C)/C;const xs=(i)=>(i+.5)/n*laneW-9;const xt=xs(Math.max(0,Math.min(n-1,c.f.reached)));let x,op;
  if(ph<.1){x=xs(0);op=ph/.1}else if(ph<.55){x=xs(0)+(xt-xs(0))*ease((ph-.1)/.45);op=1}else if(ph<.86){x=xt;op=1}else{x=xt;op=1-(ph-.86)/.14}
  const y=5+(k%3)*22;c.el.style.transform=`translate(${Math.max(0,Math.min(laneW-c.w,x))}px,${y}px)`;c.el.style.opacity=op.toFixed(2);
  const fresh=k===0&&Date.now()-c.f.t<10*60000;const xx=!!c.f.stop&&ph>=.55;if(xx!==c.x){c.x=xx;c.el.classList.toggle('x',xx)}if(c.fresh!==fresh){c.fresh=fresh;c.el.classList.toggle('fresh',fresh)}});
}

/* ---------- Render: Kurse ---------- */
const rows={};let rowKey='';
function buildPrices(force){
 const s=D.snap;const mints=botMints().slice(0,26);const key=mints.join();if(!force&&key===rowKey&&$('#plist').children.length)return;rowKey=key;
 const row=(k,kind,id,sym,sub)=>`<button class="pr" data-act="${kind}" data-id="${esc(id)}" data-mint="${esc(id)}" data-k="${esc(k)}"><span class="s"><b>${esc(sym)}</b><small>${esc(sub)}</small></span><span class="p">–</span><canvas class="k" width="152" height="28"></canvas><span class="c">–</span></button>`;
 $('#plist').innerHTML=`<div class="ps">Märkte · live</div>`+CEX.map(([k,n])=>row(k,'cex',k,k,n)).join('')+`<div class="ps">Coins der Bots · DexScreener</div>`+(mints.length?mints.map(m=>row('m'+m,'coin',m,symOf(m),short(m)+' · Δ 1 Std')).join(''):'<div class="empty">Keine Coins im aktuellen Bot-Stand.</div>');
 for(const k in rows)delete rows[k];
 $$('#plist .pr').forEach(el=>{rows[el.dataset.k]={el,p:$('.p',el),c:$('.c',el),cv:$('.k',el),lp:null,lf:0}});
 Object.keys(rows).forEach(k=>dirty.add(k));
}
function rowVals(k){if(k[0]==='m'){const d=D.dex[k.slice(1)];return d&&!d.none?{p:d.price,ch:d.c1,dir:d.dir}:{none:!!d}}const q=D.px[k];return q?{p:q.p,ch:q.ch,dir:q.dir}:{}}
function flushPx(now){
 for(const k of dirty){const r=rows[k];if(!r){dirty.delete(k);continue}const v=rowVals(k);
  if(v.p!=null&&v.p!==r.lp){setT(r.p,px(v.p));if(r.lp!=null&&now-r.lf>120&&v.p!==r.lp){r.lf=now;const c=v.p>r.lp?'fu':'fd';r.el.classList.remove('fu','fd');void r.el.offsetWidth;r.el.classList.add(c)}r.lp=v.p}
  else if(v.none&&r.lp==null)setT(r.p,'n/a');
  if(v.ch!=null){setT(r.c,pct(v.ch));r.c.className='c '+cls(v.ch)}
  dirty.delete(k)}
}
function drawSparks(){
 for(const k in rows){const r=rows[k];let a;if(k[0]==='m')a=D.spark[k];else a=D.spark[k];if(!a||a.length<2)continue;const cv=r.cv,x=cv.getContext('2d'),w=cv.width,h=cv.height;x.clearRect(0,0,w,h);let mn=Math.min(...a),mx=Math.max(...a);if(mx===mn){mx+=1e-9;mn-=1e-9}x.beginPath();a.forEach((v,i)=>{const X=i/(a.length-1)*(w-2)+1,Y=h-3-(v-mn)/(mx-mn)*(h-6);i?x.lineTo(X,Y):x.moveTo(X,Y)});x.strokeStyle='rgba(255,255,255,.85)';x.lineWidth=1.5;x.stroke()}
}
setInterval(()=>{for(const [k] of CEX){const p=D.px[k]?.p;if(p!=null){const a=D.spark[k]||(D.spark[k]=[]);a.push(p);if(a.length>90)a.shift()}}drawSparks()},1000);

/* ---------- Render: Feed ---------- */
const feedMap=new Map();
function evKey(e){return e.t+'|'+e.agent+'|'+e.sym+'|'+e.text}
function renderFeed(){
 const s=D.snap;if(!s)return;const items=[...localFeed,...s.events].sort((a,b)=>b.t-a.t).slice(0,60);const host=$('#feed');const keep=new Set();let prev=null;
 items.forEach((e,i)=>{const k=evKey(e);keep.add(k);let el=feedMap.get(k);if(!el){el=document.createElement('button');el.className='fe '+(e.level||'info')+(e._new?' new':'');el.dataset.act='evt';if(e.mint)el.dataset.mint=e.mint;el.dataset.agent=e.agent;
   el.innerHTML=`<span class="tm">${tmS(e.t)}</span><span class="ln"><b>${esc(e.sym||e.kind)}</b><em>${esc(e.agent)}</em></span><span class="tx">${esc(e.text)}</span>`;feedMap.set(k,el);e._new=false}
  const want=prev?prev.nextSibling:host.firstChild;if(el!==want)host.insertBefore(el,want);prev=el});
 for(const [k,el] of feedMap)if(!keep.has(k)){el.remove();feedMap.delete(k)}
 setT($('#feedSub'),`${s.events.length} Ereignisse im Log`);
}

/* ---------- Render: Radar ---------- */
let rpts=[],rcv,rctx,rW=0,rH=0,rDpr=1;
function renderRadarList(){
 const s=D.snap;rpts=s.radar.map(r=>({...r,a:hash(r.mint)*Math.PI*2,rr:Math.max(.12,Math.min(.92,1-(r.prog-s.sniffer.minProgress)/(100-s.sniffer.minProgress)*.8-.08))}));
 setT($('#radSub'),s.sniffer?`${s.sniffer.scanned} gescannt · ${ago(s.sniffer.at)}`:'');
 const h=s.radar.length?s.radar.map(r=>`<button class="rr" data-act="coin" data-mint="${r.mint}"><b>${esc(r.symbol)}</b><span>${nf(r.prog,1)} %</span><span>$${cmp(r.mc)}</span></button>`).join(''):'<div class="empty">Keine Kandidaten über der Schwelle im letzten Lauf.</div>';
 const l=$('#rlist');if(l._h!==h){l.innerHTML=h;l._h=h}
}
function radarSize(){rcv=$('#radar');rDpr=Math.min(2,window.devicePixelRatio||1);rW=rcv.clientWidth;rH=rcv.clientHeight;rcv.width=rW*rDpr;rcv.height=rH*rDpr;rctx=rcv.getContext('2d')}
let rHover=null;
function drawRadar(now){
 if(!rctx||!rW)return;const x=rctx;x.setTransform(rDpr,0,0,rDpr,0,0);x.clearRect(0,0,rW,rH);const cx=rW/2,cy=rH/2,R=Math.min(rW,rH)/2-8;
 x.strokeStyle='rgba(255,255,255,.16)';x.lineWidth=1;[.25,.5,.75,1].forEach(f=>{x.beginPath();x.arc(cx,cy,R*f,0,7);x.stroke()});x.beginPath();x.moveTo(cx-R,cy);x.lineTo(cx+R,cy);x.moveTo(cx,cy-R);x.lineTo(cx,cy+R);x.stroke();
 const ang=(now/6000)%1*Math.PI*2;for(let i=0;i<28;i++){const a=ang-i*.035;x.strokeStyle=`rgba(255,255,255,${.5*(1-i/28)})`;x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);x.stroke()}
 x.fillStyle='#fff';x.beginPath();x.arc(cx,cy,2.5,0,7);x.fill();
 x.font='10px ui-monospace,monospace';
 for(const p of rpts){let d=((ang-p.a)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);const glow=Math.max(0,1-d/2.2);const X=cx+Math.cos(p.a)*p.rr*R,Y=cy+Math.sin(p.a)*p.rr*R;p.x=X;p.y=Y;
  x.fillStyle=`rgba(255,255,255,${.35+.65*glow})`;x.beginPath();x.arc(X,Y,3+glow*2.5+(p===rHover?2:0),0,7);x.fill();
  if(glow>.5||p===rHover){x.strokeStyle=`rgba(255,255,255,${glow*.6})`;x.beginPath();x.arc(X,Y,6+(1-glow)*14,0,7);x.stroke()}
  x.fillStyle=`rgba(255,255,255,${.55+.45*glow})`;x.fillText((p.symbol||'').slice(0,9),X+7,Y+3)}
 if(!rpts.length){x.fillStyle='#777';x.textAlign='center';x.fillText('keine Kandidaten ≥ '+(D.snap?.sniffer?.minProgress??80)+' %',cx,cy+R+2);x.textAlign='left'}
}

/* ---------- System-Herzschlag (EKG) ---------- */
let ecg,ecgX,ecgBuf=[],ecgQ=[],ecgAcc=0;
function ecgSize(){ecg=$('#ecg');const d=Math.min(2,devicePixelRatio||1);ecg.width=ecg.clientWidth*d;ecg.height=56*d;ecgX=ecg.getContext('2d');ecgX.setTransform(d,0,0,d,0,0);const n=ecg.clientWidth;while(ecgBuf.length<n)ecgBuf.unshift(0);ecgBuf=ecgBuf.slice(-n)}
function ecgKick(a){if(ecgQ.length>60)return;[0,.15,-.1,.9,-.8,.25,0,.12,.05,0].forEach(v=>{ecgQ.push(v*a,v*a,v*a)})}
function drawEcg(dt){
 if(!ecgX||UI.tab!=='sys')return;ecgAcc+=dt*55;while(ecgAcc>=1){ecgAcc--;ecgBuf.shift();ecgBuf.push(ecgQ.length?ecgQ.shift():0)}
 const w=ecg.clientWidth,h=56,x=ecgX;x.clearRect(0,0,w,h);x.beginPath();ecgBuf.forEach((v,i)=>{const Y=h/2-v*(h/2-4);i?x.lineTo(i,Y):x.moveTo(i,Y)});x.strokeStyle='rgba(255,255,255,.18)';x.lineWidth=5;x.stroke();x.strokeStyle='#fff';x.lineWidth=1.3;x.stroke();
 x.fillStyle='#fff';x.beginPath();x.arc(w-2,h/2-ecgBuf[w-1]*(h/2-4),2.5,0,7);x.fill();
}

/* ---------- Tabs (System / Risiko / Quellen), Chips ---------- */
function renderTabs(){
 const s=D.snap;if(!s)return;
 const hb=s.bots.map(b=>{const [st]=botSt(b);return `<button class="hb" data-act="bot" data-id="${b.id}" data-st="${st}" data-tip="${esc(b.id+' '+bName(b)+' · '+(b.lastT?ago(b.lastT):'keine Daten'))}">${esc(b.id)}</button>`}).join('');const hr=$('#hbrow');if(hr._h!==hb){hr.innerHTML=hb;hr._h=hb}
 const last=Math.max(...s.filePulse.map(f=>f.t),0);const act=s.bots.filter(b=>botSt(b)[0]==='active').length;
 const mini=[['Aktive Bots',`${act}/${s.bots.length}`],['Modus',s.mode],['Health',(s.health?.overall||'–')+(s.health?.alerts?` · ${s.health.alerts} Alarme`:'')],['Letzte Datei',last?ago(last):'–'],['Kurs-Ticks/s',nf(D.tps,0)],['Bot-Stand',tmM(s.generatedAt)]];
 const mh=mini.map(([l,v])=>`<span>${l}</span><b>${esc(v)}</b>`).join('');const m=$('#sysmini');if(m._h!==mh){m.innerHTML=mh;m._h=mh}
 // Risiko
 const c=s.config||{},open=s.pf?.openPositions??0,max=c.maxOpenPositions||0;const f=max?Math.min(1,open/max):0,C=2*Math.PI*36;
 const R=`<div class="gauge"><svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="36" fill="none" stroke="#222" stroke-width="7"/><circle cx="46" cy="46" r="36" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(f*C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 46 46)" style="transition:stroke-dasharray 1s"/><text x="46" y="50" text-anchor="middle" fill="#fff" font-family="ui-monospace,monospace" font-size="17">${open}/${max||'–'}</text></svg><div style="flex:1"><div class="kv"><span>Max. SOL pro Kauf</span><b class="mono">${c.maxBuySol??'–'}</b></div><div class="kv"><span>Tagesstopp</span><b class="mono">${c.dailyStopPct??'–'} %</b></div><div class="kv"><span>Wochenpause</span><b class="mono">${c.weeklyPausePct??'–'} %</b></div></div></div><div class="kv"><span>ATH-Stopp</span><b class="mono">${c.athStopPct??'–'} %</b></div><div class="kv"><span>Max. Signalalter</span><b class="mono">${c.maxSignalAgeMin??'–'} Min</b></div><div class="kv"><span>Paper-Equity</span><b class="mono">${s.paper?nf(s.paper.equitySol,3)+' SOL':'–'}</b></div><div style="padding-top:6px">${(c.requiredGates||[]).map(g=>`<span class="tag">${esc(g)}</span>`).join('')}</div><div class="sec" style="font-size:10.5px;padding-top:6px">Tages-/Wochen-Verlust wird vom Bot nicht exportiert – daher keine Auslastungsanzeige.</div>`;
 const rk=$('#risk');if(rk._h!==R){rk.innerHTML=R;rk._h=R}
}
function renderSrcs(){
 const s=D.snap,st=D.stream,n=Date.now();const live=st.open&&n-st.lastMsg<25000;
 const L=[['Bot-Stream',st.url?(live?'live':'warn'):'off',st.url?(live?`verbunden · Ping ${ago(st.lastMsg)}`:'getrennt → Snapshot'):'nicht konfiguriert'],
 ['Bot-Snapshot',D.snap?'live':'warn',D.snap?'Stand '+tmM(D.snap.generatedAt):'–'],
 ['Binance',D.src.bin.mode==='WebSocket'&&n-D.src.bin.t<6000?'live':D.src.bin.mode==='REST'?'warn':'off',D.src.bin.mode==='WebSocket'&&n-D.src.bin.t<6000?'WebSocket · '+(D.src.bin.host||''):D.src.bin.mode==='REST'?'REST alle 2 s':D.src.bin.err?'nicht erreichbar':'verbinde …'],
 ['Hyperliquid',D.src.hl.ok&&n-D.src.hl.t<8000?'live':'off',D.src.hl.ok&&n-D.src.hl.t<8000?'WebSocket (Reserve)':'getrennt'],
 ['DexScreener',D.src.dex.ok?'live':D.src.dex.ok===false?'warn':'off',D.src.dex.ok?'alle 5 s · '+ago(D.src.dex.t):D.src.dex.err||'–'],
 ['Solana',D.src.sol.mode==='WebSocket'?'live':D.src.sol.rpc?'warn':'off',D.src.sol.mode==='WebSocket'?'WSS accountSubscribe':D.src.sol.rpc?'RPC alle 20 s':D.src.sol.err||'–']];
 const h=L.map(([a,b,c])=>`<div class="src" data-s="${b}"><i class="ld"></i><span>${a}</span><em>${esc(c)}</em></div>`).join('')+`<div class="sec" style="font-size:10.5px;padding-top:7px">Token-Bestände der Wallets sind über öffentliche RPCs nicht abrufbar und werden nicht angezeigt.</div>`;
 const e=$('#srcs');if(e._h!==h){e.innerHTML=h;e._h=h}
}
function renderChips(){
 const n=Date.now(),st=D.stream;const live=st.url&&st.open&&n-st.lastMsg<25000;
 const cb=$('#chipBot'),gen=D.snap?.generatedAt;
 cb.dataset.s=live?'live':'warn';
 setT($('span',cb),live?`Bot-Stream LIVE · Änderung ${ago(st.lastState||gen)}`:`Bot-Stand: ${gen?tmM(gen):'…'} Uhr · ${st.url?'Stream offline':'Snapshot'}`);
 cb.dataset.tip=live?'Server schickt Änderungen der Bot-Dateien sofort per Server-Sent-Events.':'Kein Live-Stream: die Seite lädt alle 30 s den zuletzt veröffentlichten Bot-Stand (state.json). Er ist so aktuell wie der letzte Upload.';
 const cp=$('#chipPx'),b=D.src.bin,wsOk=b.mode==='WebSocket'&&n-b.t<6000,hlOk=D.src.hl.ok&&n-D.src.hl.t<6000&&!wsOk;
 cp.dataset.s=wsOk||hlOk?'live':b.mode==='REST'?'warn':'off';
 setT($('span',cp),wsOk?`Kurse LIVE · Binance WS · ${nf(D.tps,0)}/s`:hlOk?'Kurse LIVE · Hyperliquid WS':b.mode==='REST'?'Kurse · REST alle 2 s':'Kurse verbinden …');
 const cs=$('#chipSol');const so=D.src.sol.mode==='WebSocket';cs.dataset.s=so?'live':D.src.sol.rpc?'warn':'off';setT($('span',cs),so?'Solana WSS LIVE':D.src.sol.rpc?'Solana RPC · 20 s':'Solana …');
 setT($('#pxSub'),wsOk?'WebSocket · Tick-genau':hlOk?'Hyperliquid WS':b.mode==='REST'?'REST (2 s)':'…');
}


/* ---------- Drawer ---------- */
const kv=(l,v,t)=>`<div ${t?`data-tip="${esc(t)}"`:''}><small>${esc(l)}</small><b>${v}</b></div>`;
const ulist=a=>a&&a.length?`<ul class="ul">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<div class="sec">–</div>';
function botDrawer(b){
 const [st,stt]=botSt(b),r=b.reasoning,d=b.coin?.mint&&D.dex[b.coin.mint];
 const files=(b.files||[]).map(f=>{const fp=D.snap.filePulse.find(x=>x.f.replace(/\.(jsonl|json|md)$/,'')===f||x.f===f);return `<span class="tag">${esc(f)}${fp?' · '+ago(fp.t):''}</span>`}).join('');
 return [`${b.id} · ${bName(b)}`,`
 <div class="sec2"><div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="badge ${st==='active'?'hi':''}">${stt}</span><span class="sec">${b.lastT?`letzte Aktion ${ago(b.lastT)} · ${dtM(b.lastT)} Uhr`:'noch keine Aktion im Log'}</span></div>${b.note?`<div class="sec" style="margin-top:6px;font-size:11.5px">${esc(b.note)}</div>`:''}</div></div>
 <div class="sec2"><h4>Rolle</h4><div>${esc(b.title||'')}${b.role?' – '+esc(b.role):''}</div></div>
 <div class="sec2"><h4>Aktuelle Aufgabe</h4><div class="card">${esc(b.task||'Noch keine Aktivität im Log')}</div></div>
 ${b.coin&&b.coin.mint?`<div class="sec2"><h4>Beobachteter Coin</h4><div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn" data-act="coin" data-mint="${b.coin.mint}">${esc(b.coin.sym||short(b.coin.mint))} ›</button><span class="mono">${d&&!d.none?px(d.price):'–'}</span><span class="mono ${d&&!d.none?cls(d.c5):''}">${d&&!d.none&&d.c5!=null?pct(d.c5)+' (5 Min)':''}</span></div></div>`:''}
 <div class="sec2"><h4>Überlegung</h4><div class="card">${r?`<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><span class="badge ${vcls(r.verdict)}">${esc(r.verdict||'–')}</span>${r.badge?`<span class="badge">${esc(r.badge)}</span>`:''}${r.confidence!=null?`<span class="mono sec">Confidence ${r.confidence}/100</span>`:''}</div>${r.text?`<p style="margin-bottom:8px">${esc(r.text)}</p>`:''}${r.reasons?.length?`<div class="sec small" style="margin-bottom:4px">Gründe</div>${ulist(r.reasons.map(reasonDe))}`:''}${r.risks?.length?`<div class="sec small" style="margin:10px 0 4px">Risiken laut Analyse</div>${ulist(r.risks)}`:''}${!r.text&&!r.reasons?.length&&!r.risks?.length?'<span class="sec">Keine Begründung im Log.</span>':''}`:'<span class="sec">Dieser Bot hat noch keine Entscheidung geloggt – er wartet auf Signale.</span>'}</div></div>
 <div class="sec2"><h4>Kennzahlen</h4><div class="kvs">${(b.metrics||[]).map(([l,v])=>kv(l,esc(v))).join('')||'<span class="sec">–</span>'}</div></div>
 <div class="sec2"><h4>Letzte Aktionen</h4>${(b.recent||[]).length?b.recent.slice(0,10).map(e=>`<div class="dfe" ${e.mint?`data-act="coin" data-mint="${e.mint}"`:''}><span class="tm">${dtM(e.t)}</span><span><b>${esc(e.sym||e.kind)}</b> ${esc(e.text)}</span></div>`).join(''):'<span class="sec">keine</span>'}</div>
 <div class="sec2"><h4>Datenquellen (Dateien)</h4>${files||'<span class="sec">–</span>'}</div>`]}
function coinDrawer(m){
 const s=D.snap,d=D.dex[m],v=s.verdicts?.[m],rd=s.radar.find(r=>r.mint===m),pos=s.positions.find(p=>p.mint===m);const sym=symOf(m);
 const vv=v?[v.signal&&`<div class="dfe" style="cursor:default"><span class="tm">Analyst</span><span><b>${esc(v.signal.verdict)}</b> · Conf ${v.signal.confidence??'–'} · ${(v.signal.reasons||[]).map(reasonDe).join(', ')||'–'} <span class="sec">(${ago(v.signal.t)})</span></span></div>`,v.sentiment&&`<div class="dfe" style="cursor:default"><span class="tm">Sentiment</span><span>${esc(JSON.stringify(v.sentiment).slice(0,160))}</span></div>`,v.whale&&`<div class="dfe" style="cursor:default"><span class="tm">Whale</span><span>${v.whale.n}× · zuletzt ${esc(v.whale.lastAction||'–')} $${cmp(v.whale.lastUsd)} <span class="sec">(${ago(v.whale.lastT)})</span></span></div>`,v.exec&&`<div class="dfe" style="cursor:default"><span class="tm">Sniper</span><span><b>${esc(v.exec.status)}</b> – ${esc(reasonDe(v.exec.reason||''))}</span></div>`].filter(Boolean).join(''):'';
 return [sym,`
 <div class="sec2"><div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="big" data-lv="p">–</span><span class="mono" data-lv="c1"></span></div><div class="mono sec" style="font-size:10.5px;word-break:break-all;margin-top:4px">${esc(m)}</div></div>
 <div class="sec2"><div class="tfbar" id="tfbar"></div><div class="chart" id="chart"><div class="msg">Lade Chart …</div></div><div class="sec mono" id="chinfo" style="font-size:11px;margin-top:5px"></div></div>
 <div class="sec2"><h4>Markt (DexScreener, alle 5 s)</h4><div class="kvs" id="coinkv"></div></div>
 ${rd?`<div class="sec2"><h4>Im Signal-Radar</h4><div class="kvs">${kv('Bonding Curve',nf(rd.prog,1)+' %')}${kv('Market Cap','$'+cmp(rd.mc))}${kv('Volumen 5 Min','$'+cmp(rd.v5))}${kv('Käufe/Verkäufe',rd.buys+' / '+rd.sells)}${kv('Holder',rd.holders??'–')}${kv('Top-10',rd.top10!=null?nf(rd.top10,1)+' %':'–')}</div></div>`:''}
 <div class="sec2"><h4>Was die Bots zu diesem Coin sagen</h4>${vv||'<span class="sec">Keine Bot-Einträge zu diesem Coin.</span>'}${pos?`<div class="dfe" style="cursor:default"><span class="tm">Position</span><span>${esc(JSON.stringify(pos).slice(0,200))}</span></div>`:''}</div>
 <div class="sec2" style="display:flex;gap:8px;flex-wrap:wrap">${d&&d.url?`<a class="btn" href="${esc(d.url)}" target="_blank" rel="noopener">DexScreener ↗</a>`:''}<a class="btn" href="https://solscan.io/token/${esc(m)}" target="_blank" rel="noopener">Solscan ↗</a></div>`]}
function cexDrawer(k){
 const n=CEX.find(c=>c[0]===k)?.[1]||k;
 return [`${k} · ${n}`,`
 <div class="sec2"><div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="big" data-lv="p">–</span><span class="mono" data-lv="ch"></span></div><div class="sec" style="font-size:11px" data-lv="src"></div></div>
 <div class="sec2"><div class="tfbar" id="tfbar"></div><div class="chart" id="chart"><div class="msg">Lade Chart …</div></div><div class="sec mono" id="chinfo" style="font-size:11px;margin-top:5px"></div></div>
 <div class="sec2"><h4>24-Stunden-Werte</h4><div class="kvs" id="cexkv"></div></div>`]}
function openDrawer(type,id,noHash){
 if(!D.snap)return;if(type==='coin')D.extra.add(id);UI.drawer={type,id};
 let r;if(type==='bot'){const b=botById(id);if(!b)return;r=botDrawer(b);UI.drawer.sig=JSON.stringify(b)}else if(type==='coin')r=coinDrawer(id);else r=cexDrawer(id);
 chartDestroy();$('#dtitle').textContent=r[0];$('#dbody').innerHTML=r[1];$('#dbody').scrollTop=0;
 $('#drawer').hidden=false;$('#veil').hidden=false;document.body.style.overflow='hidden';
 $$('.dnav [data-act=prev],.dnav [data-act=next]').forEach(b=>b.style.visibility=type==='bot'?'visible':'hidden');
 if(type==='coin'){if(!D.dex[id]||D.dex[id].t<Date.now()-5000)pollDex(true);chartOpen({type:'dex',mint:id})}else if(type==='cex')chartOpen({type:'cex',sym:id});
 if(!noHash)history.replaceState(null,'','#'+type+'/'+id);drawerTick();
}
function closeDrawer(){UI.drawer=null;$('#drawer').hidden=true;$('#veil').hidden=true;document.body.style.overflow='';chartDestroy();history.replaceState(null,'',location.pathname+location.search)}
function stepBot(d){if(UI.drawer?.type!=='bot')return;const a=D.snap.bots,i=a.findIndex(b=>b.id===UI.drawer.id);openDrawer('bot',a[(i+d+a.length)%a.length].id)}
function drawerTick(){
 const u=UI.drawer;if(!u||!D.snap)return;
 if(u.type==='bot'){const b=botById(u.id);if(b){const sig=JSON.stringify(b);if(sig!==u.sig){const r=botDrawer(b);const top=$('#dbody').scrollTop;$('#dbody').innerHTML=r[1];$('#dbody').scrollTop=top;u.sig=sig}}return}
 const set=(k,t,c)=>{const e=$(`[data-lv="${k}"]`);if(e){setT(e,t);if(c!=null)e.className='mono '+c}};
 if(u.type==='coin'){const d=D.dex[u.id];if(d&&!d.none){set('p',px(d.price));set('c1',pct(d.c1)+' (1 Std)',cls(d.c1));const h=$('#coinkv'),H=[['5 Min',pct(d.c5)],['1 Std',pct(d.c1)],['6 Std',pct(d.c6)],['24 Std',pct(d.c24)],['Liquidität','$'+cmp(d.liq)],['Market Cap','$'+cmp(d.mc)],['Vol. 5 Min','$'+cmp(d.v5)],['Vol. 1 Std','$'+cmp(d.v1)],['Vol. 24 Std','$'+cmp(d.v24)],['Txns 24 Std',d.tx?`${d.tx.buys} K / ${d.tx.sells} V`:'–'],['Alter',d.created?ago(d.created).replace('vor ',''):'–'],['DEX',d.dex||'–']].map(([l,v])=>kv(l,esc(v))).join('');if(h&&h._h!==H){h.innerHTML=H;h._h=H}}else if(d&&d.none)set('p','nicht bei DexScreener gefunden')}
 if(u.type==='cex'){const q=D.px[u.id]||{};set('p',px(q.p));set('ch',pct(q.ch)+' (24 Std)',cls(q.ch));setT($('[data-lv=src]'),q.src?'Quelle: '+q.src+(q.pt?' · letzter Tick '+ago(q.pt):''):'');const h=$('#cexkv'),H=[['24h Hoch',px(q.h)],['24h Tief',px(q.l)],['24h Eröffnung',px(q.o)],['24h Volumen','$'+cmp(q.q)]].map(([l,v])=>kv(l,esc(v))).join('');if(h&&h._h!==H){h.innerHTML=H;h._h=H}}
}

/* ---------- Chart (TradingView Lightweight Charts) ---------- */
const CHS={chart:null,series:null,spec:null,tf:null,tok:0,last:null,first:null};
const TFS={cex:[['Live','1s',1],['1 Min','1m',60],['15 Min','15m',900],['1 Std','1h',3600],['1 Tag','1d',86400]],dex:[['1 Min','m1',60],['5 Min','m5',300],['15 Min','m15',900],['1 Std','h1',3600]]};
function chartDestroy(){CHS.tok++;if(CHS.chart){try{CHS.chart.remove()}catch{}}CHS.chart=CHS.series=CHS.spec=null}
function chartOpen(spec){
 const list=TFS[spec.type];CHS.spec=spec;CHS.tf=list[spec.type==='cex'?1:0];
 $('#tfbar').innerHTML=list.map(t=>`<button data-act="tf" data-v="${t[1]}">${t[0]}</button>`).join('');
 const el=$('#chart');if(!window.LightweightCharts){$('.msg',el).textContent='Chart-Bibliothek nicht geladen';return}
 const ch=CHS.chart=LightweightCharts.createChart(el,{autoSize:true,layout:{background:{color:'transparent'},textColor:'#9a9a9a',fontFamily:'ui-monospace,Menlo,monospace',fontSize:11,attributionLogo:false},grid:{vertLines:{color:'rgba(255,255,255,.05)'},horzLines:{color:'rgba(255,255,255,.05)'}},rightPriceScale:{borderColor:'rgba(255,255,255,.15)'},crosshair:{mode:0,vertLine:{color:'#fff',labelBackgroundColor:'#222'},horzLine:{color:'#fff',labelBackgroundColor:'#222'}},timeScale:{borderColor:'rgba(255,255,255,.15)',timeVisible:true,secondsVisible:false,tickMarkFormatter:(t,ty)=>ty>=3?tmM(t*1000):ty===2?berlin(t*1000,{day:'2-digit',month:'2-digit'}):tmM(t*1000)},localization:{timeFormatter:t=>berlin(t*1000,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}),priceFormatter:p=>spec.type==='dex'?px(p).replace('$',''):nf(p,p>=100?2:p>=1?3:5)}});
 CHS.series=ch.addAreaSeries({lineColor:'#ffffff',topColor:'rgba(255,255,255,.22)',bottomColor:'rgba(255,255,255,0)',lineWidth:2,priceLineColor:'#fff',lastValueVisible:true,priceFormat:{type:'price',precision:spec.type==='dex'?8:4,minMove:spec.type==='dex'?1e-8:1e-4}});
 chartLoad();
}
async function chartLoad(){
 const sp=CHS.spec;if(!sp||!CHS.series)return;const tok=++CHS.tok,tf=CHS.tf;
 $$('#tfbar button').forEach(b=>b.classList.toggle('on',b.dataset.v===tf[1]));
 const msg=$('#chart .msg')||(()=>{const m=document.createElement('div');m.className='msg';$('#chart').appendChild(m);return m})();msg.textContent='Lade Chart …';msg.hidden=false;
 try{let pts=[];
  if(sp.type==='cex'){let d,err;for(const h of['https://api.binance.com','https://data-api.binance.vision']){try{d=await jget(`${h}/api/v3/klines?symbol=${sp.sym}USDT&interval=${tf[1]}&limit=${tf[1]==='1s'?400:500}`);break}catch(e){err=e}}if(!d)throw err;pts=d.map(k=>({time:Math.floor(k[0]/1000),value:+k[4]}))}
  else{let pair=D.dex[sp.mint]?.pair;if(!pair){await pollDex(true);pair=D.dex[sp.mint]?.pair}if(!pair)throw new Error('Kein Handelspaar bei DexScreener');
   const [kind,agg]=tf[1][0]==='m'?['minute',+tf[1].slice(1)]:['hour',1];const d=await jget(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pair}/ohlcv/${kind}?aggregate=${agg}&limit=300&currency=usd`);
   pts=(d.data?.attributes?.ohlcv_list||[]).map(k=>({time:k[0],value:+k[4]})).reverse()}
  if(tok!==CHS.tok)return;
  const seen=new Set();pts=pts.filter(p=>isFinite(p.value)&&p.value>0&&!seen.has(p.time)&&seen.add(p.time)).sort((a,b)=>a.time-b.time);
  if(pts.length>6){const vs=pts.map(p=>p.value).sort((a,b)=>a-b),med=vs[vs.length>>1];pts=pts.filter(p=>p.value<med*25&&p.value>med/25)}
  if(!pts.length)throw new Error('Keine Kursdaten');
  CHS.series.setData(pts);CHS.chart.applyOptions({timeScale:{secondsVisible:tf[1]==='1s'}});CHS.chart.timeScale().fitContent();CHS.first=pts[0].value;CHS.last=pts[pts.length-1];msg.hidden=true;chartInfo();
 }catch(e){if(tok===CHS.tok){msg.hidden=false;msg.textContent='Kein Chart: '+(e.message||e)}}
}
function chartLive(){
 const sp=CHS.spec;if(!sp||!CHS.series||!CHS.last||!CHS.tf)return;const v=sp.type==='cex'?D.px[sp.sym]?.p:(D.dex[sp.mint]&&!D.dex[sp.mint].none?D.dex[sp.mint].price:null);if(v==null||!isFinite(v))return;
 const sec=CHS.tf[2],t=Math.floor(Date.now()/1000/sec)*sec;if(t<CHS.last.time)return;
 if(sp.type==='dex'&&(v>CHS.last.value*25||v<CHS.last.value/25))return;
 CHS.last={time:t,value:v};try{CHS.series.update(CHS.last)}catch{}chartInfo();
}
function chartInfo(){const e=$('#chinfo');if(!e||!CHS.last||!CHS.first)return;const c=(CHS.last.value-CHS.first)/CHS.first*100;e.innerHTML=`Zeitraum ${esc(CHS.tf[0])}: <span class="${cls(c)}">${pct(c)}</span> · Zeitzone Berlin · aktualisiert live`}

/* ---------- Tooltips, Hintergrund, Hauptschleife ---------- */
const tipEl=$('#tip');let tipT=0;
function showTip(el,x,y,text){const t=text||el?.dataset.tip;if(!t)return;tipEl.textContent=t;tipEl.hidden=false;const w=tipEl.offsetWidth,h=tipEl.offsetHeight;tipEl.style.left=Math.max(6,Math.min(innerWidth-w-6,x-w/2))+'px';tipEl.style.top=(y+18+h>innerHeight?y-h-14:y+18)+'px'}
document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const el=e.target.closest?.('[data-tip]');clearTimeout(tipT);if(!el){tipEl.hidden=true;return}tipT=setTimeout(()=>showTip(el,e.clientX,e.clientY),280)});
document.addEventListener('pointerdown',()=>{tipEl.hidden=true;clearTimeout(tipT)});
document.addEventListener('scroll',()=>{tipEl.hidden=true},true);

const bgc=$('#bg'),bx=bgc.getContext('2d');let P=[],bgW=0,bgH=0,bgT=0;
function bgInit(){const d=Math.min(1.5,devicePixelRatio||1);bgW=innerWidth;bgH=innerHeight;bgc.width=bgW*d;bgc.height=bgH*d;bx.setTransform(d,0,0,d,0,0);const n=Math.min(70,Math.floor(bgW*bgH/22000));P=Array.from({length:n},()=>({x:Math.random()*bgW,y:Math.random()*bgH,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,r:Math.random()*1.2+.3}))}
function bgDraw(now){if(now-bgT<33)return;bgT=now;bx.clearRect(0,0,bgW,bgH);for(const p of P){p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=bgW;if(p.x>bgW)p.x=0;if(p.y<0)p.y=bgH;if(p.y>bgH)p.y=0;bx.fillStyle='rgba(255,255,255,.55)';bx.fillRect(p.x,p.y,p.r,p.r)}
 bx.lineWidth=.6;for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){const dx=P[i].x-P[j].x,dy=P[i].y-P[j].y,d=dx*dx+dy*dy;if(d<9000){bx.strokeStyle=`rgba(255,255,255,${.16*(1-d/9000)})`;bx.beginPath();bx.moveTo(P[i].x,P[i].y);bx.lineTo(P[j].x,P[j].y);bx.stroke()}}}

const PERF={frames:0,slow:0,max:0,start:performance.now(),lastF:0};window.__perf=PERF;
let lastNow=0;
function loop(now){
 const dt=lastNow?Math.min(.1,(now-lastNow)/1000):0;lastNow=now;
 if(PERF.lastF){const f=now-PERF.lastF;PERF.frames++;if(f>50)PERF.slow++;if(f>PERF.max)PERF.max=f}PERF.lastF=now;
 if(D.snap){animKpis(now);animPipe(now);flushPx(now);drawRadar(now);drawEcg(dt)}
 bgDraw(now);requestAnimationFrame(loop);
}

/* ---------- Render-Orchestrierung ---------- */
function renderAll(first){
 renderKpis();renderPipe();renderBots(first);renderFeed();renderRadarList();buildPrices();renderTabs();renderSrcs();renderChips();
 if(first){measure();radarSize();ecgSize();route(true)}
}
function setTab(v){UI.tab=v;$$('.tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));$$('.tab').forEach(t=>t.hidden=t.dataset.t!==v);if(v==='sys')ecgSize();if(v==='src')renderSrcs()}
function route(first){const m=location.hash.match(/^#(bot|coin|cex)\/(.+)$/);if(m&&D.snap&&(!UI.drawer||UI.drawer.id!==m[2]))openDrawer(m[1],decodeURIComponent(m[2]),true)}
addEventListener('hashchange',()=>{if(!location.hash||location.hash==='#'){if(UI.drawer)closeDrawer()}else route()});

/* ---------- Ereignisse ---------- */
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-act]');if(!el)return;const a=el.dataset.act;
 if(a==='bot')openDrawer('bot',el.dataset.id);
 else if(a==='coin'){e.stopPropagation();openDrawer('coin',el.dataset.mint)}
 else if(a==='cex')openDrawer('cex',el.dataset.id);
 else if(a==='evt'){if(el.dataset.mint)openDrawer('coin',el.dataset.mint);else{const b=D.snap.bots.find(b=>b.name===el.dataset.agent);if(b)openDrawer('bot',b.id)}}
 else if(a==='stage'){const g=$('#g-'+el.dataset.v);if(g){g.scrollIntoView({behavior:'smooth',block:'start'});g.querySelectorAll('.bot').forEach(b=>{b.classList.remove('flash');void b.offsetWidth;b.classList.add('flash')})}}
 else if(a==='tab')setTab(el.dataset.v);
 else if(a==='src'){setTab('src');$('#pTabs').scrollIntoView({block:'nearest',behavior:'smooth'})}
 else if(a==='tf'){CHS.tf=TFS[CHS.spec.type].find(t=>t[1]===el.dataset.v);chartLoad()}
 else if(a==='sound')toggleSound();
 else if(a==='help')$('#help').hidden=false;
 else if(a==='helpclose')$('#help').hidden=true;
 else if(a==='close')closeDrawer();
 else if(a==='prev')stepBot(-1);else if(a==='next')stepBot(1);
});
function toggleSound(){D.sound=!D.sound;$('#soundBtn').classList.toggle('on',D.sound);if(D.sound)beep(740)}
document.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;const k=e.key;
 if(k==='Escape'){if(!$('#help').hidden)$('#help').hidden=true;else if(UI.drawer)closeDrawer()}
 else if(k==='ArrowRight')stepBot(1);else if(k==='ArrowLeft')stepBot(-1);
 else if(k==='s'||k==='S')toggleSound();else if(k==='?')$('#help').hidden=!$('#help').hidden;
 else if(k==='1')$('.mainhead').scrollIntoView({behavior:'smooth'});else if(k==='2')$('#pFeed').scrollIntoView({behavior:'smooth',block:'nearest'});else if(k==='3')$('#pPrices').scrollIntoView({behavior:'smooth',block:'nearest'});
 else if((k==='Enter'||k===' ')&&document.activeElement?.classList.contains('bot')){e.preventDefault();document.activeElement.click()}});
document.addEventListener('pointermove',e=>{if(e.target.id!=='radar'){if(rHover){rHover=null}return}const r=e.target.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let b=null,bd=18*18;for(const p of rpts){const d=(p.x-x)**2+(p.y-y)**2;if(d<bd){bd=d;b=p}}rHover=b;e.target.style.cursor=b?'pointer':'crosshair';if(b)showTip(null,e.clientX,e.clientY,`${b.symbol} · ${nf(b.prog,1)} % Bonding Curve · MC $${cmp(b.mc)}`);else tipEl.hidden=true});
$('#radar').addEventListener('click',()=>{if(rHover)openDrawer('coin',rHover.mint)});
addEventListener('resize',()=>{measure();radarSize();ecgSize();bgInit()});
addEventListener('error',e=>console.warn('JS-Fehler:',e.message));

/* ---------- Takt-Timer ---------- */
setInterval(()=>{
 const n=Date.now();setT($('#clock'),tmS(n));const s=Math.floor((n-D.t0)/1000);setT($('#session'),[s/3600|0,s/60%60|0,s%60].map(x=>String(x).padStart(2,'0')).join(':'));
 D.tps=D.tickCount;D.tickCount=0;
 if(!D.snap)return;liveBots();renderChips();renderTabs();renderKpis();if(UI.tab==='src')renderSrcs();drawerTick();chartLive();setT($('#radSub'),D.snap.sniffer?`${D.snap.sniffer.scanned} gescannt · ${ago(D.snap.sniffer.at)}`:'');
 $$('#pipe .nd').forEach((nd,i)=>{const g=D.snap.stages[i],act=D.snap.bots.filter(b=>b.group===g&&botSt(b)[0]==='active').length;nd.dataset.a=act?1:0});
},1000);

/* ---------- Start ---------- */
bgInit();radarSize();ecgSize();requestAnimationFrame(loop);
binConnect();hlConnect();hlChange();
initBotData();
