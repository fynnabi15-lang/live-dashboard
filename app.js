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
const ago=t=>{if(!t)return'–';const tn=typeof t==='number'?t:(t instanceof Date?t.getTime():Date.parse(t));if(!isFinite(tn))return'–';const s=Math.max(0,(Date.now()-tn)/1000);return s<5?'gerade eben':s<60?'vor '+Math.floor(s)+' s':s<3600?'vor '+Math.floor(s/60)+' Min':s<86400?'vor '+Math.floor(s/3600)+' Std '+Math.floor(s%3600/60)+' Min':'vor '+Math.floor(s/86400)+' Tg'};
const short=m=>m?m.slice(0,4)+'…'+m.slice(-4):'';
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0)/4294967295};
const REASON={LIQUIDITY_TOO_LOW:'Liquidität zu niedrig',VERDICT_NOT_BUY:'Urteil war kein Kauf',RUG_RISK:'Rug-Risiko',RUGCHECK_FAIL:'RugCheck nicht bestanden',SENTIMENT_BLOCK:'Sentiment blockiert',DATA_MISSING:'Daten fehlen',STATUS_NOT_PASS:'Status nicht PASS',ROUTE_UNKNOWN:'Handelsroute unbekannt'};
const reasonDe=c=>REASON[c]||String(c).replace(/_/g,' ').toLowerCase().replace(/^./,x=>x.toUpperCase());
const GROUPS={Scout:['Scouts','Suchen neue Coins & Auffälligkeiten (Launches, Whales, Sentiment).'],Analyst:['Analyse','Bewertet Kandidaten: BUY / MONITOR / SKIP mit Confidence.'],Filter:['Filter','Prüfen Rug-Risiko und Liquidität.'],Guard:['Wächter','Letztes Tor: Risikolimits vor jedem Kauf.'],Sniper:['Sniper','Führt Käufe aus – aktuell nur Paper-Modus.'],Support:['Support · Positionen & Journal','Positionen, Journal und Steuer-Ledger.'],Infra:['Infrastruktur','Wallet-Funding, Health, Backtest, Streitschlichter.']};
const CEX=[['SOL','Solana'],['BTC','Bitcoin'],['ETH','Ethereum'],['JUP','Jupiter'],['BONK','Bonk'],['WIF','dogwifhat'],['XRP','XRP'],['BNB','BNB'],['DOGE','Dogecoin']];
const HLN={BONK:['kBONK',1000]};
const SOL_MINT='So11111111111111111111111111111111111111112';

/* ---------- Zustand ---------- */
const REDUCED=matchMedia('(prefers-reduced-motion:reduce)').matches;let HIDDEN=document.hidden;document.addEventListener('visibilitychange',()=>{HIDDEN=document.hidden});
const D={snap:null,t0:Date.now(),px:{},dex:{},dexT:0,wal:{},spark:{},tickCount:0,tps:0,ghLive:0,
 src:{bin:{mode:null,t:0,err:null,wsFail:0},hl:{ok:false,t:0},dex:{ok:null,t:0,err:null},sol:{mode:null,t:0},stream:{}},
 stream:{url:null,open:false,lastMsg:0,lastState:0,seq:0,clients:null,fails:0,es:null},stateAt:0,evKeys:new Set(),seen:false,extra:new Set()};
const UI={drawer:null,page:'ueb',sec:'a1',sc:'C1',a1sel:null,jsel:null,lr:6,kch:{type:'cex',sym:'SOL'}};
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
 if(!live){let ok=false;if(CFG.live){try{const s=await jget(CFG.live,{cache:'no-cache',headers:{Accept:'application/vnd.github.raw+json'}});applyState(s,'snapshot');D.ghLive=Date.parse(s.generatedAt)||0;ok=true;ecgKick(.8)}catch(e){D.src.liveErr=String(e.message||e)}}
 if(!ok){try{const s=await jget((CFG.state||'state.json')+'?t='+Date.now(),{cache:'no-store'});applyState(s,'snapshot');ecgKick(.8)}catch(e){D.src.snapErr=String(e.message||e)}}}
 setTimeout(pollSnapshot,CFG.live?15000:30000);
}
function bilanzSig(s){
 const pick=id=>{const b=(s.bots||[]).find(x=>x&&x.id===id);return b?b.metrics:null};
 try{return JSON.stringify([s.mode,s.perf??null,s.pnlByToken??null,s.positions??null,s.paper??null,pick('A5'),pick('B3')])}catch{return ''}
}
function applyState(s,from){
 if(!s||!s.bots)return;
 if(D.snap&&from==='snapshot'&&D.stream.lastState&&s.generatedAt<=D.snap.generatedAt)return;
 if(D.snap&&s.generatedAt===D.snap.generatedAt&&from==='snapshot'&&bilanzSig(s)===bilanzSig(D.snap)){D.stateAt=Date.now();D.ghLive=Date.parse(s.generatedAt)||D.ghLive;renderChips();return}
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
function botMints(){const s=D.snap;if(!s)return[];const out=[];const add=m=>{if(m&&!m.startsWith('0x')&&!out.includes(m))out.push(m)};D.extra.forEach(add);
 s.radar.forEach(r=>add(r.mint));s.flow.forEach(f=>add(f.mint));s.bots.forEach(b=>add(b.coin?.mint));s.coins.forEach(c=>add(c.mint));const v=s.v4;if(v){v.a1.list.slice(0,12).forEach(a=>add(a.mint));v.scouts.c3.scanNow.forEach(e=>add(e.mint));v.scouts.c1.slice(0,10).forEach(e=>add(e.mint))}return out.slice(0,90)}
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


/* ---------- v4-Helfer: Adressen, Kopieren, Links ---------- */
const NODATA='<span class="nd0">keine Daten</span>';
const V4=()=>D.snap?.v4||null;
const solscanTok=m=>`https://solscan.io/token/${m}`,solscanAcc=a=>`https://solscan.io/account/${a}`,solscanTx=t=>`https://solscan.io/tx/${t}`,dexLink=m=>`https://dexscreener.com/solana/${m}`,pumpLink=m=>`https://pump.fun/coin/${m}`;
const lnk=(h,t)=>`<a href="${esc(h)}" target="_blank" rel="noopener">${t}</a>`;
function mintBlock(m,o={}){
 if(!m)return NODATA;
 return `<span class="mint${o.sm?' sm':''}"><code>${esc(m)}</code><span class="ma"><button class="cpy" data-act="copy" data-v="${esc(m)}">Kopieren</button>${o.nolinks?'':lnk(solscanTok(m),'Solscan')+lnk(dexLink(m),'DexScreener')+lnk(pumpLink(m),'pump.fun')}</span></span>`;
}
function addrBlock(a,o={}){
 if(!a)return NODATA;
 return `<span class="mint sm"><code>${esc(a)}</code><span class="ma"><button class="cpy" data-act="copy" data-v="${esc(a)}">Kopieren</button>${o.sol===false?'':lnk(solscanAcc(a),'Solscan')}</span></span>`;
}
let toastT=0;
function toast(t){const e=$('#toast');e.textContent=t;e.hidden=false;e.classList.remove('in');void e.offsetWidth;e.classList.add('in');clearTimeout(toastT);toastT=setTimeout(()=>{e.hidden=true},1800)}
function copyText(v,btn){
 const done=()=>{toast('Adresse kopiert ✓');if(btn){const o=btn.dataset.o||btn.textContent;btn.dataset.o=o;btn.textContent='✓ Kopiert';btn.classList.add('ok');setTimeout(()=>{btn.textContent=o;btn.classList.remove('ok')},1400)}};
 const fb=()=>{try{const t=document.createElement('textarea');t.value=v;t.style.cssText='position:fixed;opacity:0;left:-999px';document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();done()}catch{toast('Kopieren nicht möglich')}};
 if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(v).then(done,fb);else fb();
}
const tAgo=t=>t?`<span data-ago="${t}"></span>`:'<span class="sec">keine Zeit</span>';
function updAgo(){$$('[data-ago]').forEach(e=>setT(e,ago(+e.dataset.ago)))}
const vbadge=v=>v?`<span class="badge ${vcls(v)}">${esc(v)}</span>`:'';
const stIcon={pass:['✓','Bestanden'],fail:['✕','Nicht bestanden'],unknown:['?','Keine Daten'],info:['•','Messwert'],na:['–','Nicht nötig'],live:['⏱','Gültigkeit']};
const fmtVal=(c)=>{const v=c.value;if(v==null)return NODATA;const s=String(v);if(/^-?\d+(\.\d+)?$/.test(s)){const n=+s;const t=Math.abs(n)>=1000?nf(n,0):s.replace('.',',');return (c.id==='mc'||c.id==='liq')?'$'+t:t}return esc(s.replace(/^None\/None$/,'null/null'))};

/* ---------- Helfer: DOM ---------- */
const setT=(el,t)=>{if(el&&el.textContent!==t)el.textContent=t};
const PASSIVE_KIND=/^(status_check|config_prep|test|journal|unverified_history)$/;
const botSt=b=>{if(b.running===true&&!PASSIVE_KIND.test(b.actionKind||''))return['active','AKTIV'];if(b.actionKind==='unverified_history')return['none','HISTORISCH'];if(PASSIVE_KIND.test(b.actionKind||''))return['none',b.actionKind==='test'?'TEST':b.actionKind==='config_prep'?'VORBEREITET':b.actionKind==='journal'?'JOURNAL':'STATUS'];if(b.status==='UNKNOWN'&&!b.lastT)return['none','UNBEKANNT'];if(!b.lastT)return['none','KEINE AKTION'];return['idle','LETZT'];};
function botAge(b){const p=[];if(b.observedAt)p.push('beobachtet '+ago(Date.parse(b.observedAt)));if(b.actionKind==='unverified_history'&&b.lastActionAt)p.push('historisch '+ago(Date.parse(b.lastActionAt)));else if(b.lastT)p.push('Aktion '+ago(b.lastT));if(b.sourceUpdatedAt)p.push('Quelle '+ago(Date.parse(b.sourceUpdatedAt)));if(b.reportedLastActionAt&&b.reportedLastActionAt!==b.lastActionAt)p.push('gemeldet '+ago(Date.parse(b.reportedLastActionAt)));if(!p.length)p.push(b.status==='UNKNOWN'?'nicht verfügbar':'keine Zeit');return p.join(' · ')}
function shownTask(b){if(b.taskFixed===true&&b.task)return b.task;return b.status==='UNKNOWN'?'Nicht verfügbar':'Keine bestätigte Aktion'}
function publicLine(t){const s=String(t??'');if(!/^[A-Za-z0-9_ .:%+-]{1,80}$/.test(s))return 'Ereignis';if(/\b(eur|iban|ledger|fifo|steuer|instruction|ignore previous|verified trades)\b/i.test(s))return 'Ereignis';return s}
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
  host.children[0].dataset.tip='Nur Bots mit belegter laufender Aktion. Ein frischer Export ist kein Aktiv-Nachweis.';host.children[1].dataset.tip='Alle Analyse-Signale im Log, davon blockiert.';host.children[2].dataset.tip='Coins, die der Launch Sniffer im letzten Lauf nahe der Graduation (≥80 % Bonding Curve) gefunden hat.';host.children[3].dataset.tip='Nur mit geprüftem positionBook. Steuer-Lots und leere Dateien sind keine Null.';host.children[4].dataset.tip='Nur mit geprüftem Paper-Buch. Kein Steuer-Ledger.';host.children[5].dataset.tip='SOL in Haupt- + Trading-Wallet, live über Solana-WebSocket.'}
 const act=s.bots.filter(b=>botSt(b)[0]==='active').length;
 const w=s.wallets.map(x=>D.wal[x.address]?.sol);const wsum=w.some(v=>v!=null)?w.reduce((a,v)=>a+(v||0),0):null;
 const books=tradeReport(s),openN=books.positions?books.positions.count:null,paperN=books.paper?books.paper.closed:null;
 const vals=[[act,0,`von ${s.bots.length} Bots`],[s.counts.signals,0,`geblockt ${s.counts.blocked} · MONITOR ${s.counts.monitor}`],[s.radar.length,0,`Sniffer: ${s.sniffer?.scanned??'–'} gescannt (≥${s.sniffer?.minProgress??'–'} %)`],[openN,0,!books.positions?UNVERIFIED:openN==null?'Keine Daten':`Modus ${s.mode}`],[paperN,0,!books.paper?UNVERIFIED:paperN==null?'Keine Daten':`PAPER · beobachtet ${dtM(Date.parse(books.paper.observedAt))} Uhr`],[wsum,4,wsum==null?'wird geladen …':s.wallets.map(x=>x.label.split('-')[0]+' '+nf(D.wal[x.address]?.sol,3)).join(' · ')]];
 vals.forEach(([v,d,sub],i)=>{const k=KP[i];k.dec=d;setT(k.sub,sub);if(v==null){setT(k.b,'–');k.to=null;return}if(k.to!==v){k.from=k.v??0;k.to=v;k.t0=performance.now();k.done=false}});
}
function animKpis(now){for(const k of KP){if(k.to==null||k.done)continue;const p=Math.min(1,(now-k.t0)/700),e=1-Math.pow(1-p,3);const v=k.from+(k.to-k.from)*e;k.v=v;setT(k.b,nf(p<1?v:k.to,k.dec));if(p>=1)k.done=true}}

/* ---------- Render: Bots ---------- */
function botHTML(b){return `<i class="sweep"></i><header><span class="dot"></span><span class="bid">${esc(b.id)}</span><b class="bn"></b><span class="stt"></span></header><p class="task"></p><div class="bcn"><button class="cs" data-act="coin" hidden></button><span class="cp mono"></span><span class="cc mono"></span></div><div class="vd"><span class="badge"></span><span class="conf"><i></i></span><span class="cv mono"></span></div><ul class="rs"></ul><div class="mt"></div><footer><span class="ago mono"></span><span class="more">Details ›</span></footer>`}
function renderBots(first){
 const s=D.snap,host=$('#bots');
 if(!host.children.length){let delay=0;for(const g of Object.keys(GROUPS)){const bs=s.bots.filter(b=>b.group===g);if(!bs.length)continue;const sec=document.createElement('section');sec.className='grp';sec.id='g-'+g;sec.innerHTML=`<h3 data-act="grp" data-tip="Klicken zum Ein-/Ausklappen"><span class="gt">${esc(GROUPS[g][0])}</span><em class="gdesc">${esc(GROUPS[g][1])}</em><span class="chev">⌄</span></h3><div class="gcards"></div>`;const gc=sec.lastChild;
  bs.forEach(b=>{const a=document.createElement('article');a.className='bot';a.tabIndex=0;a.dataset.act='bot';a.dataset.id=b.id;a.style.animationDelay=(delay++*45)+'ms';a.innerHTML=botHTML(b);gc.appendChild(a)});host.appendChild(sec)}}
 for(const b of s.bots){const el=$(`.bot[data-id="${b.id}"]`,host);if(el)updBot(el,b)}
 const act=s.bots.filter(b=>botSt(b)[0]==='active').length;
 setT($('#botsSub'),`${act} mit belegter laufender Aktion · ${s.bots.length} Karten · fehlende Datei bleibt unbekannt`);
}
function updBot(el,b){
 const [st,stt]=botSt(b);el.dataset.st=st;const r=b.reasoning;
 setT($('.bn',el),bName(b));setT($('.stt',el),stt);
 const task=shownTask(b);const tk=$('.task',el);
 const sig=(b.lastT||0)+'|'+task;if(el._sig!==undefined&&el._sig!==sig){el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash')}el._sig=sig;
 setT(tk,task);tk.title=task;
 const cs=$('.cs',el);if(b.coin&&b.coin.mint){cs.hidden=false;cs.dataset.mint=b.coin.mint;setT(cs,b.coin.sym||short(b.coin.mint))}else cs.hidden=true;
 const v=r?.verdict,bd=$('.badge',el);bd.hidden=!v;if(v){setT(bd,v);bd.className='badge '+vcls(v)}
 const cf=r?.confidence;$('.conf',el).hidden=cf==null;$('.conf i',el).style.width=(cf==null?0:Math.max(0,Math.min(100,cf)))+'%';setT($('.cv',el),cf==null?'':'Conf '+cf);
 const rs=(r?.reasons?.length?r.reasons.map(reasonDe):r?.risks?.length?[r.risks[0]]:[]).slice(0,2);
 const rh=rs.map(x=>`<li title="${esc(x)}">${esc(x)}</li>`).join('')||`<li style="border-style:dashed;color:#777">${r?'keine Gründe im Log':'keine Begründung vorhanden'}</li>`;if(el._rh!==rh){$('.rs',el).innerHTML=rh;el._rh=rh}
 const mh=(b.metrics||[]).slice(0,3).map(([l,x])=>`<div><small>${esc(l)}</small><b>${esc(publicMetric(l,x))}</b></div>`).join('');if(el._mh!==mh){$('.mt',el).innerHTML=mh;el._mh=mh}$('.mt',el).hidden=!mh;
 setT($('.ago',el),botAge(b));
 updBotLive(el,b);
}
function updBotLive(el,b){const m=b.coin?.mint,d=m&&D.dex[m];setT($('.cp',el),d&&!d.none?px(d.price):'');const c=$('.cc',el);if(d&&!d.none&&d.c5!=null){setT(c,pct(d.c5)+' 5m');c.className='cc mono '+cls(d.c5)}else setT(c,'')}
function liveBots(){const s=D.snap;if(!s)return;for(const b of s.bots){const el=$(`.bot[data-id="${b.id}"]`);if(!el)continue;const st=botSt(b);el.dataset.st=st[0];setT($('.stt',el),st[1]);setT($('.ago',el),botAge(b));updBotLive(el,b)}}

/* ---------- Render: Pipeline ---------- */
let coinEls=[],laneW=0;
function renderPipe(){
 const s=D.snap,host=$('#pipe');const st=s.stages;
 const key=st.join()+'|'+s.flow.slice(0,5).map(f=>f.mint+f.t).join();
 if(host._k!==key){host._k=key;
  host.innerHTML=`<div class="nodes">${st.map((n,i)=>`<div class="nd" data-act="stage" data-v="${n}"><div class="ring">${i+1}</div><b>${n}</b><small></small></div>`).join('')}</div><div class="lane">${st.map((n,i)=>`<i class="vl" style="left:${(i+.5)/st.length*100}%"></i>`).join('')}<span class="lnote">${s.flow.length?'':'Pipeline nicht angebunden'}</span></div>`;
  const lane=$('.lane',host);coinEls=s.flow.slice(0,5).map((f,i)=>{const c=document.createElement('div');c.className='cn';c.dataset.act='coin';c.dataset.mint=f.mint;c.textContent=(f.sym||short(f.mint)).slice(0,10);
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
  const y=8+k*14;c.el.style.transform=`translate(${Math.max(0,Math.min(laneW-c.w,x))}px,${y}px)`;c.el.style.opacity=op.toFixed(2);
  const fresh=k===0&&Date.now()-c.f.t<10*60000;const xx=!!c.f.stop&&ph>=.55;if(xx!==c.x){c.x=xx;c.el.classList.toggle('x',xx)}if(c.fresh!==fresh){c.fresh=fresh;c.el.classList.toggle('fresh',fresh)}});
}

/* ---------- Kurse: Rail-Panel + Kurse-Seite ---------- */
const rows={};let memeKey='';
const addRow=(k,r)=>{(rows[k]||(rows[k]=[])).push(r)};
const _io=typeof IntersectionObserver==='function'?new IntersectionObserver(es=>{for(const e of es){const r=e.target._row;if(r)r.vis=e.isIntersecting}},{root:null,threshold:0}):null;
function obsVis(r){if(_io&&r.el){r.el._row=r;_io.observe(r.el)}}
function buildMini(){
 const host=$('#plist');if(host.children.length)return;
 host.innerHTML=CEX.map(([k,n])=>`<button class="pr" data-act="cex" data-id="${k}" data-k="${k}" data-tip="${esc(n)} – Klick öffnet den Chart"><span class="s"><b>${k}</b><small>${esc(n)}</small></span><span class="p">–</span><canvas class="k" width="152" height="28"></canvas><span class="c">–</span></button>`).join('');
 $$('#plist .pr').forEach(el=>{const r={el,p:$('.p',el),c:$('.c',el),cv:$('.k',el),lp:null,lf:0,vis:true};addRow(el.dataset.k,r);obsVis(r)});
}
function buildKcards(){
 const host=$('#kcards');if(host.children.length)return;
 host.innerHTML=CEX.map(([k,n])=>`<button class="kc" data-act="ksel" data-type="cex" data-id="${k}" data-k="${k}"><header><b>${k}</b><small>${esc(n)}</small><span class="c mono">–</span></header><div class="p mono">–</div><canvas class="k" width="300" height="52"></canvas><div class="kx"><span>Hoch <b data-x="h">–</b></span><span>Tief <b data-x="l">–</b></span><span>Vol. <b data-x="q">–</b></span></div></button>`).join('');
 $$('#kcards .kc').forEach(el=>{const r={el,p:$('.p',el),c:$('.c',el),cv:$('.k',el),lp:null,lf:0,card:true,vis:true,h:$('[data-x=h]',el),l:$('[data-x=l]',el),q:$('[data-x=q]',el)};addRow(el.dataset.k,r);obsVis(r)});
CEX.forEach(([k])=>dirty.add(k));markK();
}
function markK(){$$('#kcards .kc').forEach(e=>e.classList.toggle('sel',UI.kch.type==='cex'&&UI.kch.sym===e.dataset.id));$$('#mtab tbody tr').forEach(e=>e.classList.toggle('sel',UI.kch.type==='dex'&&UI.kch.mint===e.dataset.id))}
function buildMemes(force){
 const s=D.snap;if(!s)return;const mints=botMints().slice(0,40);const key=mints.join();if(!force&&key===memeKey)return;memeKey=key;
 const tb=$('#mtab tbody');tb.innerHTML=mints.length?mints.map(m=>`<tr data-act="ksel" data-type="dex" data-id="${esc(m)}"><td><b class="ms"></b><small class="mt2"></small></td><td>${mintBlock(m,{sm:1,nolinks:1})}</td><td class="r mono pp">–</td><td class="r mono c5">–</td><td class="r mono c1">–</td><td class="r mono c24">–</td><td class="r mono lq">–</td><td class="r mono mc">–</td><td class="r mono v1">–</td></tr>`).join(''):'<tr><td colspan="9" class="empty">Keine Coins im aktuellen Bot-Stand.</td></tr>';
 $$('tr',tb).forEach(tr=>{const m=tr.dataset.id;if(!m)return;setT($('.ms',tr),symOf(m));const c=s.coins.find(x=>x.mint===m);setT($('.mt2',tr),c?.tags?.length?c.tags.join(' · '):'')});
 markK();updMemes();
}
function updMemes(){
 const s=D.snap;if(!s)return;let n=0;
 $$('#mtab tbody tr').forEach(tr=>{const m=tr.dataset.id;if(!m)return;const d=D.dex[m];if(!d)return;
  if(d.none){setT($('.pp',tr),'n/a');return}n++;
  setT($('.ms',tr),symOf(m));
  const pp=$('.pp',tr);const t=px(d.price);if(pp.textContent!==t){pp.textContent=t;if(tr._lp!=null&&tr._lp!==d.price){tr.classList.remove('fu','fd');void tr.offsetWidth;tr.classList.add(d.price>tr._lp?'fu':'fd')}tr._lp=d.price}
  const pc=(sel,v)=>{const e=$(sel,tr);setT(e,pct(v));e.className=e.className.replace(/\b(up|down|sec)\b/g,'').trim()+' '+cls(v)};
  pc('.c5',d.c5);pc('.c1',d.c1);pc('.c24',d.c24);setT($('.lq',tr),d.liq!=null?'$'+cmp(d.liq):'–');setT($('.mc',tr),d.mc!=null?'$'+cmp(d.mc):'–');setT($('.v1',tr),d.v1!=null?'$'+cmp(d.v1):'–')});
 setT($('#mSub'),`${n} von ${$$('#mtab tbody tr').length} bei DexScreener gefunden · ${D.src.dex.ok?'alle 5 s · '+ago(D.src.dex.t):'–'}`);
}
function rowVals(k){const q=D.px[k];return q?{p:q.p,ch:q.ch,dir:q.dir}:{}}
let pxFlushAt=0;
function flushPx(now){
 if(!dirty.size)return;
 // Max ~8 DOM-Updates/s – WS-Ticks puffern in D.px, sichtbarer Text nur getaktet
 if(now-pxFlushAt<120)return;pxFlushAt=now;
 for(const k of dirty){const rs=rows[k];if(!rs){dirty.delete(k);continue}const v=rowVals(k),q=D.px[k]||{};
  for(const r of rs){
   if(!r.el.isConnected)continue;
   if(v.p!=null&&v.p!==r.lp){setT(r.p,px(v.p));if(r.lp!=null&&now-r.lf>280){r.lf=now;const c=v.p>r.lp?'fu':'fd';r.el.classList.remove('fu','fd');r.el.classList.add(c)}r.lp=v.p}
   if(v.ch!=null){const t=pct(v.ch);if(r.c.textContent!==t){r.c.textContent=t;r.c.className=(r.card?'c mono ':'c ')+cls(v.ch)}}
   if(r.card){setT(r.h,px(q.h));setT(r.l,px(q.l));setT(r.q,q.q!=null?'$'+cmp(q.q):'–')}}
  dirty.delete(k)}
}
function drawSparks(){
 if(HIDDEN)return;
 for(const k in rows){const a=D.spark[k];if(!a||a.length<2)continue;let mn=a[0],mx=a[0];for(let i=1;i<a.length;i++){const v=a[i];if(v<mn)mn=v;if(v>mx)mx=v}if(mx===mn){mx+=1e-9;mn-=1e-9}
  for(const r of rows[k]){const cv=r.cv;if(!cv||!r.vis)continue;const x=cv.getContext('2d'),w=cv.width,h=cv.height;x.clearRect(0,0,w,h);x.beginPath();for(let i=0;i<a.length;i++){const X=i/(a.length-1)*(w-2)+1,Y=h-3-(a[i]-mn)/(mx-mn)*(h-6);i?x.lineTo(X,Y):x.moveTo(X,Y)}x.strokeStyle='rgba(255,255,255,.75)';x.lineWidth=1.25;x.stroke()}}
}
setInterval(()=>{if(HIDDEN)return;for(const [k] of CEX){const p=D.px[k]?.p;if(p!=null){const a=D.spark[k]||(D.spark[k]=[]);a.push(p);if(a.length>48)a.shift()}}drawSparks()},2000);

/* ---------- Render: Feed ---------- */
const feedMap=new Map();
function evKey(e){return e.t+'|'+e.agent+'|'+e.sym+'|'+e.text}
function renderFeed(){
 const s=D.snap;if(!s)return;const items=[...localFeed,...s.events].sort((a,b)=>b.t-a.t).slice(0,60);const host=$('#feed');const keep=new Set();let prev=null;
 items.forEach((e,i)=>{const k=evKey(e);keep.add(k);let el=feedMap.get(k);if(!el){el=document.createElement('button');el.className='fe '+(e.level||'info')+(e._new?' new':'');el.dataset.act='evt';if(e.mint)el.dataset.mint=e.mint;el.dataset.agent=e.agent;
   el.innerHTML=`<span class="tm">${tmS(e.t)}</span><span class="ln"><b>${esc(e.sym||e.kind)}</b><em>${esc(e.agent)}</em></span><span class="tx">${esc(publicLine(e.text))}</span>`;feedMap.set(k,el);e._new=false}
  const want=prev?prev.nextSibling:host.firstChild;if(el!==want)host.insertBefore(el,want);prev=el});
 for(const [k,el] of feedMap)if(!keep.has(k)){el.remove();feedMap.delete(k)}
 setT($('#feedSub'),`${s.events.length} Ereignisse im Log`);
}

/* ---------- Render: Radar ---------- */
let rpts=[],rcv,rctx,rW=0,rH=0,rDpr=1;
function renderRadarList(){
 const s=D.snap;rpts=s.radar.map(r=>({...r,a:hash(r.mint)*Math.PI*2,rr:Math.max(.12,Math.min(.92,1-(r.prog-s.sniffer.minProgress)/(100-s.sniffer.minProgress)*.8-.08))}));
 setT($('#radSub'),s.sniffer?`${s.sniffer.scanned} gescannt · ${ago(s.sniffer.at)}`:'');
 const h=s.radar.length?s.radar.map(r=>`<button class="rr" data-act="coin" data-mint="${r.mint}"><b>${esc(r.symbol)}</b><span>${nf(r.prog,1)} %</span><span>$${cmp(r.mc)}</span></button>`).join(''):`<div class="empty">${s.sniffer&&s.sniffer.scanned!=null?'Im letzten Lauf keine Kandidaten über der Schwelle.':'Kandidaten nicht verfügbar.'}</div>`;
 const l=$('#rlist');if(l._h!==h){l.innerHTML=h;l._h=h}
}
function radarSize(){rcv=$('#radar');if(!rcv)return;rDpr=Math.min(1.5,window.devicePixelRatio||1);rW=rcv.clientWidth;rH=rcv.clientHeight;if(!rW)return;rcv.width=rW*rDpr;rcv.height=rH*rDpr;rctx=rcv.getContext('2d')}
let rHover=null;
let rDrawAt=0;
function drawRadar(now){
 if(!rctx||!rW||HIDDEN||UI.page!=='ana'||UI.sec!=='scouts')return;if(now-rDrawAt<80)return;rDrawAt=now;
 const x=rctx;x.setTransform(rDpr,0,0,rDpr,0,0);x.clearRect(0,0,rW,rH);const cx=rW/2,cy=rH/2,R=Math.min(rW,rH)/2-8;
 x.strokeStyle='rgba(255,255,255,.14)';x.lineWidth=1;[.33,.66,1].forEach(f=>{x.beginPath();x.arc(cx,cy,R*f,0,7);x.stroke()});x.beginPath();x.moveTo(cx-R,cy);x.lineTo(cx+R,cy);x.moveTo(cx,cy-R);x.lineTo(cx,cy+R);x.stroke();
 const ang=(now/6000)%1*Math.PI*2;for(let i=0;i<12;i++){const a=ang-i*.05;x.strokeStyle=`rgba(255,255,255,${.45*(1-i/12)})`;x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);x.stroke()}
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
let ecgW=0,ecgDrawAt=0;
function ecgSize(){ecg=$('#ecg');if(!ecg)return;const d=Math.min(1.5,devicePixelRatio||1);ecgW=ecg.clientWidth||0;if(!ecgW)return;ecg.width=ecgW*d;ecg.height=46*d;ecgX=ecg.getContext('2d');ecgX.setTransform(d,0,0,d,0,0);while(ecgBuf.length<ecgW)ecgBuf.unshift(0);ecgBuf=ecgBuf.slice(-ecgW)}
function ecgKick(a){if(ecgQ.length>60)return;[0,.15,-.1,.9,-.8,.25,0,.12,.05,0].forEach(v=>{ecgQ.push(v*a,v*a,v*a)})}
function drawEcg(dt,now){
 if(!ecgX||HIDDEN||!ecgW)return;if(now&&now-ecgDrawAt<32)return;ecgDrawAt=now||performance.now();
 ecgAcc+=dt*55;while(ecgAcc>=1){ecgAcc--;ecgBuf.shift();ecgBuf.push(ecgQ.length?ecgQ.shift():0)}
 const w=ecgW,h=46,x=ecgX;x.clearRect(0,0,w,h);x.beginPath();for(let i=0;i<ecgBuf.length;i++){const Y=h/2-ecgBuf[i]*(h/2-4);i?x.lineTo(i,Y):x.moveTo(i,Y)}x.strokeStyle='rgba(255,255,255,.16)';x.lineWidth=4;x.stroke();x.strokeStyle='#fff';x.lineWidth=1.2;x.stroke();
 x.fillStyle='#fff';x.beginPath();x.arc(w-2,h/2-ecgBuf[w-1]*(h/2-4),2.2,0,7);x.fill();
}

/* ---------- System: Chips, Rail, Risiko, Health, Wallets, Quellen ---------- */
const a1Latest=()=>V4()?.a1?.list?.[0]||null;
function clarifyTransportChip(){const cb=$('#chipBot');if(!cb)return;const span=$('span',cb);if(!span)return;let t=span.textContent||'';t=t.replace('Bot-Daten LIVE','Export frisch').replace('Bot-Stream LIVE','Stream frisch');setT(span,t);const base=cb.dataset.tip||'';if(!base.includes('nicht, dass alle Bots'))cb.dataset.tip=('Nur der Export oder Stream ist frisch. Das sagt nicht, dass alle Bots aktiv sind. '+base).trim()}
function renderChips(){
 const n=Date.now(),st=D.stream,s=D.snap;const live=st.url&&st.open&&n-st.lastMsg<25000;
 const cb=$('#chipBot'),gen=s?.generatedAt;
 cb.dataset.s=(live||(D.ghLive&&Date.now()-D.ghLive<180000))?'live':'warn';
 setT($('span',cb),(!live&&D.ghLive&&Date.now()-D.ghLive<180000)?`Export frisch · ${ago(D.ghLive)}`:live?`Stream frisch · Änderung ${ago(st.lastState||gen)}`:`Bot-Stand ${gen?tmM(gen)+' Uhr (vor '+ago(gen).replace('vor ','')+')':'…'} · ${st.url?'Stream offline':'Snapshot'}`);
 clarifyTransportChip();
 const cp=$('#chipPx'),b=D.src.bin,wsOk=b.mode==='WebSocket'&&n-b.t<6000,hlOk=D.src.hl.ok&&n-D.src.hl.t<6000&&!wsOk;
 cp.dataset.s=wsOk||hlOk?'live':b.mode==='REST'?'warn':'off';
 setT($('span',cp),wsOk?`Kurse LIVE · Binance WS · ${nf(D.tps,0)}/s`:hlOk?'Kurse LIVE · Hyperliquid WS':b.mode==='REST'?'Kurse · REST alle 2 s':'Kurse verbinden …');
 const cs=$('#chipSol');const so=D.src.sol.mode==='WebSocket';cs.dataset.s=so?'live':D.src.sol.rpc?'warn':'off';setT($('span',cs),so?'Solana WSS LIVE':D.src.sol.rpc?'Solana RPC · 20 s':'Solana …');
 setT($('#pxSub'),wsOk?'WebSocket':hlOk?'Hyperliquid':b.mode==='REST'?'REST 2 s':'…');
 if(!s)return;
 const a=a1Latest(),ca=$('#chipA1');
 if(!a){ca.dataset.s='off';setT($('span',ca),'A1: keine Daten')}
 else{ca.dataset.s='warn';setT($('span',ca),`A1 zuletzt: ${a.symbol||'?'} ${short(a.mint)} · ${ago(a.t)}`)}
 const cm=$('#chipMode');const liveMode=s.mode==='LIVE'&&s.modeReady===true;const paperMode=s.mode==='PAPER';cm.dataset.s=liveMode||paperMode?'live':'off';setT($('span',cm),liveMode?'LIVE-Handel':paperMode?'PAPER · simuliert':'Modus: unbekannt');
 const h=s.health,ch=$('#chipHealth');ch.dataset.s=!h?'off':h.overall==='ok'?'live':'warn';setT($('span',ch),h?`Health ${h.overall}${h.alerts?` · ${h.alerts} Alarme`:''}`:'Health: keine Daten');
}
function renderRail(){
 const s=D.snap;if(!s)return;
 const hb=s.bots.map(b=>{const [st]=botSt(b);return `<button class="hb" data-act="bot" data-id="${b.id}" data-st="${st}" data-tip="${esc(b.id+' '+bName(b)+' · '+(b.lastT?ago(b.lastT):'keine Daten'))}">${esc(b.id)}</button>`}).join('');const hr=$('#hbrow');if(hr._h!==hb){hr.innerHTML=hb;hr._h=hb}
 const act=s.bots.filter(b=>botSt(b)[0]==='active').length;setT($('#pulsSub'),`${act}/${s.bots.length} aktiv`);
}
function renderRisk(){
 const s=D.snap;if(!s)return;const c=s.config||{},books=tradeReport(s),open=books.positions?books.positions.count:null,max=c.maxOpenPositions||0;const f=open==null||!max?0:Math.min(1,open/max),C=2*Math.PI*36;const openTxt=open==null?'–':String(open);
 const R=`<div class="gauge"><svg viewBox="0 0 92 92"><circle cx="46" cy="46" r="36" fill="none" stroke="#222" stroke-width="7"/><circle cx="46" cy="46" r="36" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(f*C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 46 46)" style="transition:stroke-dasharray 1s"/><text x="46" y="50" text-anchor="middle" fill="#fff" font-family="ui-monospace,monospace" font-size="17">${openTxt}/${max||'–'}</text></svg><div style="flex:1"><div class="sec" style="font-size:10.5px;margin-bottom:4px">Offene Positionen / Maximum</div><div class="kv"><span>Max. SOL pro Kauf</span><b class="mono">${c.maxBuySol??'–'}</b></div><div class="kv"><span>Tagesstopp</span><b class="mono">${c.dailyStopPct??'–'} %</b></div><div class="kv"><span>Wochenpause</span><b class="mono">${c.weeklyPausePct??'–'} %</b></div></div></div><div class="kv"><span>ATH-Stopp</span><b class="mono">${c.athStopPct??'–'} %</b></div><div class="kv"><span>Max. Signalalter</span><b class="mono">${c.maxSignalAgeMin??'–'} Min</b></div><div class="kv"><span>Modus</span><b class="mono">${esc((s.mode==='LIVE'&&s.modeReady===true)||s.mode==='PAPER'?s.mode:'unbekannt')}</b></div><div class="kv"><span>Paper-Ausführungen</span><b class="mono">${!books.paper?UNVERIFIED:books.paper.closed==null?'Keine Daten':countTxt(books.paper.closed)}</b></div><div class="kv"><span>Übersprungene Signale</span><b class="mono">${num(s.paper?.skips)==null?'–':countTxt(s.paper.skips)}</b></div><div style="padding-top:8px"><div class="sec" style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:3px">Pflicht-Gates vor jedem Kauf</div>${(c.requiredGates||[]).length?(c.requiredGates||[]).map(g=>`<span class="tag">${esc(g)}</span>`).join(''):'<span class="sec">nicht verfügbar</span>'}</div>${s.buyStatus?`<div class="sec" style="font-size:11px;padding-top:8px">${esc(s.buyStatus)}</div>`:''}<div class="sec" style="font-size:10.5px;padding-top:6px">Tages-/Wochen-Verlust wird vom Bot nicht exportiert – daher keine Auslastungsanzeige dafür.</div>`;
 const rk=$('#risk');if(rk._h!==R){rk.innerHTML=R;rk._h=R}
}
function renderHealth(){
 const s=D.snap;if(!s)return;const h=s.health;const el=$('#health');
 if(!h){el.innerHTML=NODATA;return}
 const H=`<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><span class="badge ${h.overall==='ok'?'hi':'lo'}">${esc(String(h.overall).toUpperCase())}</span><span class="sec">${h.alerts} Alarm${h.alerts===1?'':'e'} · geprüft ${h.at?dtM(Date.parse(h.at))+' Uhr':'–'}</span></div>${(h.sources||[]).map(x=>`<div class="src" data-s="${x.status==='ok'?'live':'warn'}"><i class="ld"></i><span>${esc(x.name)}</span><em>${esc(x.status)}${x.ms!=null?' · '+x.ms+' ms':''}</em></div>`).join('')||'<span class="sec">keine Quellen im Health-Status</span>'}`;
 if(el._h!==H){el.innerHTML=H;el._h=H}setT($('#healthSub'),h.at?ago(Date.parse(h.at)):'');
}
function renderWallets(){
 const s=D.snap;if(!s)return;const el=$('#wallets');
 const H=s.wallets.map(w=>`<div class="wal"><div class="wl"><b>${esc(w.label)}</b><span class="mono" data-w="${w.address}">–</span></div>${addrBlock(w.address)}</div>`).join('')+(s.evm?`<div class="wal"><div class="wl"><b>EVM-Adresse</b><span class="sec">ohne Live-Stand</span></div>${addrBlock(s.evm,{sol:false})}</div>`:'')+`<div class="sec" style="font-size:10.5px;padding-top:4px">Token-Bestände sind über öffentliche RPCs nicht abrufbar und werden nicht angezeigt.</div>`;
 if(el._h!==H){el.innerHTML=H;el._h=H}
 let tot=0,any=false;s.wallets.forEach(w=>{const d=D.wal[w.address];const e=$(`[data-w="${w.address}"]`,el);if(e)setT(e,d?nf(d.sol,4)+' SOL'+(d.via==='WSS'?' · live':''):'lädt …');if(d){tot+=d.sol;any=true}});
 setT($('#walSub'),any?nf(tot,4)+' SOL gesamt':'');
}
function renderSrcs(){
 const s=D.snap,st=D.stream,n=Date.now();const live=st.open&&n-st.lastMsg<25000;
 const L=[['Bot-Stream',st.url?(live?'live':'warn'):'off',st.url?(live?`verbunden · Ping ${ago(st.lastMsg)}`:'getrennt → Snapshot'):'nicht konfiguriert'],
 ['Bot-Snapshot',D.snap?'live':'warn',D.snap?'Stand '+tmM(D.snap.generatedAt):'–'],
 ['Binance',D.src.bin.mode==='WebSocket'&&n-D.src.bin.t<6000?'live':D.src.bin.mode==='REST'?'warn':'off',D.src.bin.mode==='WebSocket'&&n-D.src.bin.t<6000?'WebSocket · '+(D.src.bin.host||''):D.src.bin.mode==='REST'?'REST alle 2 s':D.src.bin.err?'nicht erreichbar':'verbinde …'],
 ['Hyperliquid',D.src.hl.ok&&n-D.src.hl.t<8000?'live':'off',D.src.hl.ok&&n-D.src.hl.t<8000?'WebSocket (Reserve)':'getrennt'],
 ['DexScreener',D.src.dex.ok?'live':D.src.dex.ok===false?'warn':'off',D.src.dex.ok?'alle 5 s · '+ago(D.src.dex.t):D.src.dex.err||'–'],
 ['Solana',D.src.sol.mode==='WebSocket'?'live':D.src.sol.rpc?'warn':'off',D.src.sol.mode==='WebSocket'?'WSS accountSubscribe':D.src.sol.rpc?'RPC alle 20 s':D.src.sol.err||'–']];
 const files=(s?.filePulse||[]).slice().sort((a,b)=>b.t-a.t).slice(0,8);
 const h=L.map(([a,b,c])=>`<div class="src" data-s="${b}"><i class="ld"></i><span>${a}</span><em>${esc(c)}</em></div>`).join('')+(files.length?`<div class="sec" style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:9px 0 3px">Bot-Dateien · letzte Änderung</div>${files.map(f=>`<div class="src" data-s="off"><span>${esc(f.f)}</span><em>${ago(f.t)}</em></div>`).join('')}`:'');
 const e=$('#srcs');if(e._h!==h){e.innerHTML=h;e._h=h}
}

/* ---------- Drawer ---------- */
const kv=(l,v,t)=>`<div ${t?`data-tip="${esc(t)}"`:''}><small>${esc(l)}</small><b>${v}</b></div>`;
const ulist=a=>a&&a.length?`<ul class="ul">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<div class="sec">–</div>';
function a1ForCoin(m){const l=a1List().filter(a=>a.mint===m);return l.length?`<div class="sec small" style="margin:10px 0 4px">Analysen von A1 zu diesem Coin</div>${l.slice(0,6).map(a=>`<button class="arow" data-act="a1open" data-id="${esc(a.id)}"><span class="at mono">${dtM(a.t)}</span>${vbadge(a.verdict)}<span class="mono sec">${a.confidence??'–'}</span><small>${esc(a.reasonCodes.map(reasonDe).join(', ')||'keine Blockgründe')} · Details ›</small></button>`).join('')}`:''}
function botExtra(b){const v=V4();if(b.id==='A1'&&v){const l=v.a1.list.slice(0,8);return `<div class="sec2"><h4>Letzte Analysen (Adressen)</h4>${l.map(a=>`<div class="dfe" data-act="a1open" data-id="${esc(a.id)}"><span class="tm">${dtM(a.t)}</span><span><b>${esc(a.symbol||'?')}</b> ${esc(a.verdict||'')} · Conf ${a.confidence??'–'}<br><span class="mono sec small">${esc(a.mint||'')}</span></span></div>`).join('')}<button class="btn" style="margin-top:8px" data-act="a1open">Komplette A1-Analyse öffnen ›</button></div>`}
 if(['C1','C2','C3'].includes(b.id))return `<div class="sec2"><h4>Scan-Liste</h4><button class="btn" data-act="goto" data-v="ana" data-sec="scouts" data-sc="${b.id}">Scan-Liste mit Adressen öffnen ›</button></div>`;return ''}
function botDrawer(b){
 const [st,stt]=botSt(b),r=b.reasoning,d=b.coin?.mint&&D.dex[b.coin.mint];
 const files=(b.files||[]).map(f=>{const fp=D.snap.filePulse.find(x=>x.f.replace(/\.(jsonl|json|md)$/,'')===f||x.f===f);return `<span class="tag">${esc(f)}${fp?' · '+ago(fp.t):''}</span>`}).join('');
 return [`${b.id} · ${bName(b)}`,`
 <div class="sec2"><div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="badge ${st==='active'?'hi':''}">${stt}</span><span class="sec">${b.lastT?`letzte Aktion ${ago(b.lastT)} · ${dtM(b.lastT)} Uhr`:'noch keine Aktion im Log'}</span></div>${b.note?`<div class="sec" style="margin-top:6px;font-size:11.5px">${esc(b.note)}</div>`:''}</div></div>
 <div class="sec2"><h4>Rolle</h4><div>${esc(b.title||'')}${b.role?' – '+esc(b.role):''}</div></div>
 <div class="sec2"><h4>Aktuelle Aufgabe</h4><div class="card">${esc(b.task||'Noch keine Aktivität im Log')}</div></div>
 ${b.coin&&b.coin.mint?`<div class="sec2"><h4>Beobachteter Coin</h4><div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn" data-act="coin" data-mint="${b.coin.mint}">${esc(b.coin.sym||short(b.coin.mint))} ›</button><span class="mono">${d&&!d.none?px(d.price):'–'}</span><span class="mono ${d&&!d.none?cls(d.c5):''}">${d&&!d.none&&d.c5!=null?pct(d.c5)+' (5 Min)':''}</span></div></div>`:''}
 <div class="sec2"><h4>Überlegung</h4><div class="card">${r?`<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><span class="badge ${vcls(r.verdict)}">${esc(r.verdict||'–')}</span>${r.badge?`<span class="badge">${esc(r.badge)}</span>`:''}${r.confidence!=null?`<span class="mono sec">Confidence ${r.confidence}/100</span>`:''}</div>${r.text?`<p style="margin-bottom:8px">${esc(r.text)}</p>`:''}${r.reasons?.length?`<div class="sec small" style="margin-bottom:4px">Gründe</div>${ulist(r.reasons.map(reasonDe))}`:''}${r.risks?.length?`<div class="sec small" style="margin:10px 0 4px">Risiken laut Analyse</div>${ulist(r.risks)}`:''}${!r.text&&!r.reasons?.length&&!r.risks?.length?'<span class="sec">Keine Begründung im Log.</span>':''}`:'<span class="sec">Dieser Bot hat noch keine Entscheidung geloggt – er wartet auf Signale.</span>'}</div></div>
 <div class="sec2"><h4>Kennzahlen</h4><div class="kvs">${(b.metrics||[]).map(([l,v])=>kv(l,esc(publicMetric(l,v)))).join('')||'<span class="sec">–</span>'}</div></div>
 <div class="sec2"><h4>Letzte Aktionen</h4>${(b.recent||[]).length?b.recent.slice(0,10).map(e=>`<div class="dfe" ${e.mint?`data-act="coin" data-mint="${e.mint}"`:''}><span class="tm">${dtM(e.t)}</span><span><b>${esc(e.sym||e.kind)}</b> ${esc(e.text)}</span></div>`).join(''):'<span class="sec">keine</span>'}</div>
 ${botExtra(b)}<div class="sec2"><h4>Datenquellen (Dateien)</h4>${files||'<span class="sec">–</span>'}</div>`]}
function coinDrawer(m){
 const s=D.snap,d=D.dex[m],v=s.verdicts?.[m],rd=s.radar.find(r=>r.mint===m);const sym=symOf(m);
 const vv=v?[v.signal&&`<div class="dfe" style="cursor:default"><span class="tm">Analyst</span><span><b>${esc(v.signal.verdict)}</b> · Conf ${v.signal.confidence??'–'} · ${(v.signal.reasons||[]).map(reasonDe).join(', ')||'–'} <span class="sec">(${ago(v.signal.t)})</span></span></div>`,v.sentiment&&`<div class="dfe" style="cursor:default"><span class="tm">Sentiment</span><span>${esc(JSON.stringify(v.sentiment).slice(0,160))}</span></div>`,v.whale&&`<div class="dfe" style="cursor:default"><span class="tm">Whale</span><span>${v.whale.n}× · zuletzt ${esc(v.whale.lastAction||'–')} $${cmp(v.whale.lastUsd)} <span class="sec">(${ago(v.whale.lastT)})</span></span></div>`,v.exec&&`<div class="dfe" style="cursor:default"><span class="tm">Sniper</span><span><b>${esc(v.exec.status)}</b> – ${esc(reasonDe(v.exec.reason||''))}</span></div>`].filter(Boolean).join(''):'';
 return [sym,`
 <div class="sec2"><div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="big" data-lv="p">–</span><span class="mono" data-lv="c1"></span></div><div style="margin-top:8px">${mintBlock(m)}</div></div>
 <div class="sec2"><div class="tfbar" id="tfbar"></div><div class="chart" id="chart"><div class="msg">Lade Chart …</div></div><div class="sec mono" id="chinfo" style="font-size:11px;margin-top:5px"></div></div>
 <div class="sec2"><h4>Markt (DexScreener, alle 5 s)</h4><div class="kvs" id="coinkv"></div></div>
 ${rd?`<div class="sec2"><h4>Im Signal-Radar</h4><div class="kvs">${kv('Bonding Curve',nf(rd.prog,1)+' %')}${kv('Market Cap','$'+cmp(rd.mc))}${kv('Volumen 5 Min','$'+cmp(rd.v5))}${kv('Käufe/Verkäufe',rd.buys+' / '+rd.sells)}${kv('Holder',rd.holders??'–')}${kv('Top-10',rd.top10!=null?nf(rd.top10,1)+' %':'–')}</div></div>`:''}
 <div class="sec2"><h4>Weg durch die Pipeline</h4>${journeyHTML(V4()?.journeys?.find(j=>j.mint===m))}${a1ForCoin(m)}</div>
 <div class="sec2"><h4>Was die Bots zu diesem Coin sagen</h4>${vv||'<span class="sec">Keine Bot-Einträge zu diesem Coin.</span>'}</div>
 <div class="sec2" style="display:flex;gap:8px;flex-wrap:wrap">${d&&d.url?`<a class="btn" href="${esc(d.url)}" target="_blank" rel="noopener">DexScreener ↗</a>`:''}<a class="btn" href="https://solscan.io/token/${esc(m)}" target="_blank" rel="noopener">Solscan ↗</a></div>`]}
function cexDrawer(k){
 const n=CEX.find(c=>c[0]===k)?.[1]||k;
 return [`${k} · ${n}`,`
 <div class="sec2"><div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="big" data-lv="p">–</span><span class="mono" data-lv="ch"></span></div><div class="sec" style="font-size:11px" data-lv="src"></div></div>
 <div class="sec2"><div class="tfbar" id="tfbar"></div><div class="chart" id="chart"><div class="msg">Lade Chart …</div></div><div class="sec mono" id="chinfo" style="font-size:11px;margin-top:5px"></div></div>
 <div class="sec2"><h4>24-Stunden-Werte</h4><div class="kvs" id="cexkv"></div></div>`]}
function openDrawer(type,id,noHash){
 if(!D.snap)return;if(type==='coin')D.extra.add(id);UI.drawer={type,id};
 let r;if(type==='bot'){const b=botById(id);if(!b)return;r=botDrawer(b);UI.drawer.sig=b.lastT+'|'+b.task+'|'+(b.reasoning&&b.reasoning.verdict)}else if(type==='coin')r=coinDrawer(id);else r=cexDrawer(id);
 CH_D.destroy();$('#dtitle').textContent=r[0];$('#dbody').innerHTML=r[1];$('#dbody').scrollTop=0;
 $('#drawer').hidden=false;$('#veil').hidden=false;document.body.style.overflow='hidden';
 $$('.dnav [data-act=prev],.dnav [data-act=next]').forEach(b=>b.style.visibility=type==='bot'?'visible':'hidden');
 if(type==='coin'){if(!D.dex[id]||D.dex[id].t<Date.now()-5000)pollDex(true);CH_D.open({type:'dex',mint:id})}else if(type==='cex')CH_D.open({type:'cex',sym:id});
 if(!noHash)setHash();drawerTick();
}
function closeDrawer(){UI.drawer=null;$('#drawer').hidden=true;$('#veil').hidden=true;document.body.style.overflow='';CH_D.destroy();setHash()}
function stepBot(d){if(UI.drawer?.type!=='bot')return;const a=D.snap.bots,i=a.findIndex(b=>b.id===UI.drawer.id);openDrawer('bot',a[(i+d+a.length)%a.length].id)}
function drawerTick(){
 const u=UI.drawer;if(!u||!D.snap)return;
 if(u.type==='bot'){const b=botById(u.id);if(b){const sig=b.lastT+'|'+b.task+'|'+(b.reasoning&&b.reasoning.verdict);if(sig!==u.sig){const r=botDrawer(b);const top=$('#dbody').scrollTop;$('#dbody').innerHTML=r[1];$('#dbody').scrollTop=top;u.sig=sig}}return}
 const set=(k,t,c)=>{const e=$(`[data-lv="${k}"]`);if(e){setT(e,t);if(c!=null)e.className='mono '+c}};
 if(u.type==='coin'){const d=D.dex[u.id];if(d&&!d.none){set('p',px(d.price));set('c1',pct(d.c1)+' (1 Std)',cls(d.c1));const h=$('#coinkv'),H=[['5 Min',pct(d.c5)],['1 Std',pct(d.c1)],['6 Std',pct(d.c6)],['24 Std',pct(d.c24)],['Liquidität','$'+cmp(d.liq)],['Market Cap','$'+cmp(d.mc)],['Vol. 5 Min','$'+cmp(d.v5)],['Vol. 1 Std','$'+cmp(d.v1)],['Vol. 24 Std','$'+cmp(d.v24)],['Txns 24 Std',d.tx?`${d.tx.buys} K / ${d.tx.sells} V`:'–'],['Alter',d.created?ago(d.created).replace('vor ',''):'–'],['DEX',d.dex||'–']].map(([l,v])=>kv(l,esc(v))).join('');if(h&&h._h!==H){h.innerHTML=H;h._h=H}}else if(d&&d.none)set('p','nicht bei DexScreener gefunden')}
 if(u.type==='cex'){const q=D.px[u.id]||{};set('p',px(q.p));set('ch',pct(q.ch)+' (24 Std)',cls(q.ch));setT($('[data-lv=src]'),q.src?'Quelle: '+q.src+(q.pt?' · letzter Tick '+ago(q.pt):''):'');const h=$('#cexkv'),H=[['24h Hoch',px(q.h)],['24h Tief',px(q.l)],['24h Eröffnung',px(q.o)],['24h Volumen','$'+cmp(q.q)]].map(([l,v])=>kv(l,esc(v))).join('');if(h&&h._h!==H){h.innerHTML=H;h._h=H}}
}

/* ---------- Charts (TradingView Lightweight Charts) – zwei Instanzen: Detail-Fenster + Kurse-Seite ---------- */
const TFS={cex:[['Live','1s',1],['1 Min','1m',60],['15 Min','15m',900],['1 Std','1h',3600],['1 Tag','1d',86400]],dex:[['1 Min','m1',60],['5 Min','m5',300],['15 Min','m15',900],['1 Std','h1',3600]]};
function mkChart(key,ids){
 const C={key,ids,chart:null,series:null,spec:null,tf:null,tok:0,last:null,first:null};
 C.destroy=()=>{C.tok++;if(C.chart){try{C.chart.remove()}catch{}}C.chart=C.series=C.spec=null;C.last=null};
 C.open=spec=>{
  C.destroy();const list=TFS[spec.type];C.spec=spec;C.tf=list[spec.type==='cex'?1:0];
  const bar=$(ids.tf);if(bar)bar.innerHTML=list.map(t=>`<button data-act="tf" data-c="${key}" data-v="${t[1]}">${t[0]}</button>`).join('');
  const el=$(ids.box);if(!el)return;let msg=$('.msg',el);if(!msg){msg=document.createElement('div');msg.className='msg';el.appendChild(msg)}
  if(!window.LightweightCharts){msg.textContent='Chart-Bibliothek nicht geladen';return}
  const ch=C.chart=LightweightCharts.createChart(el,{autoSize:true,layout:{background:{color:'transparent'},textColor:'#9a9a9a',fontFamily:'ui-monospace,Menlo,monospace',fontSize:11,attributionLogo:false},grid:{vertLines:{color:'rgba(255,255,255,.05)'},horzLines:{color:'rgba(255,255,255,.05)'}},rightPriceScale:{borderColor:'rgba(255,255,255,.15)'},crosshair:{mode:0,vertLine:{color:'#fff',labelBackgroundColor:'#222'},horzLine:{color:'#fff',labelBackgroundColor:'#222'}},timeScale:{borderColor:'rgba(255,255,255,.15)',timeVisible:true,secondsVisible:false,tickMarkFormatter:(t,ty)=>ty>=3?tmM(t*1000):ty===2?berlin(t*1000,{day:'2-digit',month:'2-digit'}):tmM(t*1000)},localization:{timeFormatter:t=>berlin(t*1000,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}),priceFormatter:p=>spec.type==='dex'?px(p).replace('$',''):nf(p,p>=100?2:p>=1?3:5)}});
  C.series=ch.addAreaSeries({lineColor:'#ffffff',topColor:'rgba(255,255,255,.22)',bottomColor:'rgba(255,255,255,0)',lineWidth:2,priceLineColor:'#fff',lastValueVisible:true,priceFormat:{type:'price',precision:spec.type==='dex'?8:4,minMove:spec.type==='dex'?1e-8:1e-4}});
  C.load();
 };
 C.load=async()=>{
  const sp=C.spec;if(!sp||!C.series)return;const tok=++C.tok,tf=C.tf;
  $$(ids.tf+' button').forEach(b=>b.classList.toggle('on',b.dataset.v===tf[1]));
  const box=$(ids.box);const msg=$('.msg',box)||(()=>{const m=document.createElement('div');m.className='msg';box.appendChild(m);return m})();msg.textContent='Lade Chart …';msg.hidden=false;
  try{let pts=[];
   if(sp.type==='cex'){let d,err;for(const h of['https://api.binance.com','https://data-api.binance.vision']){try{d=await jget(`${h}/api/v3/klines?symbol=${sp.sym}USDT&interval=${tf[1]}&limit=${tf[1]==='1s'?400:500}`);break}catch(e){err=e}}if(!d)throw err;pts=d.map(k=>({time:Math.floor(k[0]/1000),value:+k[4]}))}
   else{let pair=D.dex[sp.mint]?.pair;if(!pair){await pollDex(true);pair=D.dex[sp.mint]?.pair}if(!pair)throw new Error('Kein Handelspaar bei DexScreener');
    const [kind,agg]=tf[1][0]==='m'?['minute',+tf[1].slice(1)]:['hour',1];const d=await jget(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pair}/ohlcv/${kind}?aggregate=${agg}&limit=300&currency=usd`);
    pts=(d.data?.attributes?.ohlcv_list||[]).map(k=>({time:k[0],value:+k[4]})).reverse()}
   if(tok!==C.tok)return;
   const seen=new Set();pts=pts.filter(p=>isFinite(p.value)&&p.value>0&&!seen.has(p.time)&&seen.add(p.time)).sort((a,b)=>a.time-b.time);
   if(pts.length>6){const vs=pts.map(p=>p.value).sort((a,b)=>a-b),med=vs[vs.length>>1];pts=pts.filter(p=>p.value<med*25&&p.value>med/25)}
   if(!pts.length)throw new Error('Keine Kursdaten');
   C.series.setData(pts);C.chart.applyOptions({timeScale:{secondsVisible:tf[1]==='1s'}});C.chart.timeScale().fitContent();C.first=pts[0].value;C.last=pts[pts.length-1];msg.hidden=true;C.info();
  }catch(e){if(tok===C.tok){msg.hidden=false;msg.textContent='Kein Chart: '+(e.message||e)}}
 };
 C.live=()=>{
  const sp=C.spec;if(!sp||!C.series||!C.last||!C.tf)return;const v=sp.type==='cex'?D.px[sp.sym]?.p:(D.dex[sp.mint]&&!D.dex[sp.mint].none?D.dex[sp.mint].price:null);if(v==null||!isFinite(v))return;
  const sec=C.tf[2],t=Math.floor(Date.now()/1000/sec)*sec;if(t<C.last.time)return;
  if(sp.type==='dex'&&(v>C.last.value*25||v<C.last.value/25))return;
  C.last={time:t,value:v};try{C.series.update(C.last)}catch{}C.info();
 };
 C.info=()=>{const e=$(ids.info);if(!e||!C.last||!C.first)return;const c=(C.last.value-C.first)/C.first*100;e.innerHTML=`Zeitraum ${esc(C.tf[0])}: <span class="${cls(c)}">${pct(c)}</span> · Zeitzone Berlin · aktualisiert live`};
 return C;
}
const CH_D=mkChart('d',{box:'#chart',tf:'#tfbar',info:'#chinfo'}),CH_K=mkChart('k',{box:'#kchart',tf:'#ktf',info:'#kinfo'});

/* ---------- Tooltips, Hintergrund, Hauptschleife ---------- */
const tipEl=$('#tip');let tipT=0;
function showTip(el,x,y,text){const t=text||el?.dataset.tip;if(!t)return;tipEl.textContent=t;tipEl.hidden=false;const w=tipEl.offsetWidth,h=tipEl.offsetHeight;tipEl.style.left=Math.max(6,Math.min(innerWidth-w-6,x-w/2))+'px';tipEl.style.top=(y+18+h>innerHeight?y-h-14:y+18)+'px'}
document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const el=e.target.closest?.('[data-tip]');clearTimeout(tipT);if(!el){tipEl.hidden=true;return}tipT=setTimeout(()=>showTip(el,e.clientX,e.clientY),280)});
document.addEventListener('pointerdown',()=>{tipEl.hidden=true;clearTimeout(tipT)});
document.addEventListener('scroll',()=>{tipEl.hidden=true},true);
document.addEventListener('animationend',e=>{if(e.animationName==='fu'||e.animationName==='fd')e.target.classList.remove('fu','fd')});

const bgc=$('#bg'),bx=bgc.getContext('2d');let P=[],bgW=0,bgH=0,bgT=0;
function bgInit(){const d=Math.min(1.25,devicePixelRatio||1);bgW=innerWidth;bgH=innerHeight;bgc.width=bgW*d;bgc.height=bgH*d;bx.setTransform(d,0,0,d,0,0);const n=REDUCED?0:Math.min(28,Math.floor(bgW*bgH/45000));P=Array.from({length:n},()=>({x:Math.random()*bgW,y:Math.random()*bgH,vx:(Math.random()-.5)*.12,vy:(Math.random()-.5)*.12,r:Math.random()*1.1+.25}))}
function bgDraw(now){if(HIDDEN||REDUCED||!P.length)return;if(now-bgT<66)return;bgT=now;bx.clearRect(0,0,bgW,bgH);bx.fillStyle='rgba(255,255,255,.4)';for(const p of P){p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=bgW;if(p.x>bgW)p.x=0;if(p.y<0)p.y=bgH;if(p.y>bgH)p.y=0;bx.fillRect(p.x,p.y,p.r,p.r)}}

/* ================= Seite 1 · Übersicht ================= */
function renderNow(){
 const s=D.snap,v=V4(),host=$('#nowTiles');if(!s)return;
 const a=a1Latest(),fresh=a&&Date.now()-a.t<5*60000;
 const t1=a?`<button class="tile" data-act="a1open"><small>Analyse-Bot A1 · zuletzt analysiert</small><div class="tt"><b>${esc(a.symbol||'?')}</b>${vbadge(a.verdict)}<span class="mono sec">Conf ${a.confidence??'–'}</span></div><div class="mono tmint">${esc(a.mint||'')}</div><div class="sec">${tAgo(a.t)} · ${a.reasonCodes.length?esc(a.reasonCodes.map(reasonDe).join(', ')):'keine Blockgründe'}</div><span class="go">A1-Analyse öffnen ›</span></button>`:`<div class="tile"><small>Analyse-Bot A1</small>${NODATA}</div>`;
 const c1=v?.scouts.c1[0],c2=v?.scouts.c2[0],c3=v?.scouts.c3;
 const t2=`<button class="tile" data-act="goto" data-v="ana" data-sec="scouts"><small>Scouts · wer sucht was</small><div class="srows"><div><span class="bid">C1</span> ${c1?`<b>${esc(c1.symbol||short(c1.addr||''))}</b> ${esc(c1.aktion||c1.typ||'')}${c1.usd!=null?' $'+Math.round(c1.usd):''} ${tAgo(c1.t)}`:NODATA}</div><div><span class="bid">C2</span> ${c2?`<b>${esc((c2.token||'').replace('$',''))}</b> ${esc(c2.verdict||'')} ${c2.score??''} ${tAgo(c2.t)}`:NODATA}</div><div><span class="bid">C3</span> ${c3?.run?`Lauf ${tAgo(c3.run.t)}: ${c3.run.scanned??'–'} Pairs, <b>${c3.scanNow.length}</b> Kandidaten`:NODATA}</div></div><span class="go">Scan-Listen öffnen ›</span></button>`;
 const f=s.flow[0];
 const t3=f?`<button class="tile" data-act="goto" data-v="ana" data-sec="journey" data-mint="${esc(f.mint)}"><small>Letztes Signal in der Pipeline</small><div class="tt"><b>${esc(f.sym||short(f.mint))}</b>${vbadge(f.verdict)}<span class="mono sec">Conf ${f.confidence??'–'}</span></div><div class="sec">${f.stop?`gestoppt bei <b>${esc(f.stop.stage)}</b>: ${esc(f.stop.reason.split(', ').map(reasonDe).join(', '))}`:'bis zum Sniper gekommen'}</div><div class="sec">${tAgo(f.t)}</div><span class="go">Coin-Reise öffnen ›</span></button>`:`<div class="tile"><small>Letztes Signal</small>${NODATA}</div>`;
 const h=t1+t2+t3;if(host._h!==h){host.innerHTML=h;host._h=h}updAgo();
}
function renderUeb(first){const s=D.snap;if(!s)return;renderKpis();renderPipe();renderNow();renderFeed();if(first){measure();laneSize()}}

/* Swimlane „Wer macht gerade was“ */
const LANES=['C1','C2','C3','A1','A2','A3','A4','A5','D2','D4'];
let lcv,lctx,lW=0,lH=0,lpts=[],lT=0,lHover=null;
function laneSize(){lcv=$('#laneCv');if(!lcv||!lcv.offsetParent)return;const d=Math.min(2,devicePixelRatio||1);lW=lcv.parentElement.clientWidth;lH=LANES.length*30+28;lcv.style.height=lH+'px';lcv.width=lW*d;lcv.height=lH*d;lctx=lcv.getContext('2d');lctx.setTransform(d,0,0,d,0,0);lT=0}
function drawLanes(now){
 if(!lctx||!D.snap||!lW||HIDDEN||UI.page!=='ueb'||now-lT<200)return;lT=now;
 const lanes=V4()?.lanes||{},x=lctx;x.clearRect(0,0,lW,lH);
 const range=UI.lr*3600e3,t1=Date.now(),t0=t1-range,narrow=lW<560,L=narrow?92:178,R=12,top=22,rh=30;const X=t=>L+(t-t0)/range*(lW-L-R);
 x.font='10.5px ui-monospace,Menlo,monospace';x.textBaseline='middle';
 x.textAlign='center';for(let i=0;i<=6;i++){const t=t0+range*i/6,xx=X(t);x.strokeStyle='rgba(255,255,255,.07)';x.beginPath();x.moveTo(xx,top-4);x.lineTo(xx,lH-4);x.stroke();x.fillStyle='#777';if(!narrow||i%2===0)x.fillText(tmM(t),Math.min(lW-18,Math.max(L,xx)),9)}
 lpts=[];
 LANES.forEach((id,i)=>{const y=top+i*rh+rh/2,b=botById(id);const ev=(lanes[id]||[]).filter(e=>e.t>=t0);const recent=ev.length&&t1-ev[0].t<15*60000;
  if(i%2===0){x.fillStyle='rgba(255,255,255,.025)';x.fillRect(0,top+i*rh,lW,rh)}
  x.textAlign='left';x.fillStyle=recent?'#fff':'#8a8a8a';x.fillText(narrow?id:`${id} ${b?bName(b):''}`,10,y);
  x.textAlign='right';x.fillStyle='#666';x.fillText(String(ev.length),L-8,y);
  x.strokeStyle='rgba(255,255,255,.1)';x.setLineDash([2,4]);x.beginPath();x.moveTo(L,y);x.lineTo(lW-R,y);x.stroke();x.setLineDash([]);
  if(!ev.length){x.textAlign='center';x.fillStyle='#555';x.fillText('keine Einträge im Zeitraum',L+(lW-L-R)/2,y);return}
  for(const e of ev){const xx=X(e.t),age=t1-e.t;const hov=lHover&&lHover.e===e;
   x.fillStyle=`rgba(255,255,255,${hov?1:age<3600e3?.95:.6})`;x.beginPath();x.arc(xx,y,hov?5:3,0,7);x.fill();
   if(age<150e3){const ph=((now/900)+hash(String(e.t)))%1;x.strokeStyle=`rgba(255,255,255,${.6*(1-ph)})`;x.beginPath();x.arc(xx,y,4+ph*12,0,7);x.stroke()}
   lpts.push({x:xx,y,e,id})}});
 const nx=X(t1);const g=x.createLinearGradient(nx-14,0,nx,0);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(255,255,255,.2)');x.fillStyle=g;x.fillRect(nx-14,top-4,14,lH);x.strokeStyle='#fff';x.beginPath();x.moveTo(nx,top-6);x.lineTo(nx,lH-4);x.stroke();
 x.fillStyle='#fff';x.textAlign='right';x.fillText('jetzt',lW-4,9);
}

/* ================= Seite 2 · Analyse & Scouts ================= */
const a1List=()=>V4()?.a1?.list||[];
const a1Sel=()=>a1List().find(x=>x.id===UI.a1sel)||a1List()[0]||null;
function confRing(c){const C=2*Math.PI*40,f=c==null?0:Math.max(0,Math.min(100,c))/100;return `<svg viewBox="0 0 100 100" class="cring"><circle cx="50" cy="50" r="40" fill="none" stroke="#1d1d1d" stroke-width="8"/><circle cx="50" cy="50" r="40" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(f*C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)" style="transition:stroke-dasharray 1.2s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 0 4px rgba(255,255,255,.5))"/><text x="50" y="47" text-anchor="middle" fill="#fff" font-family="ui-monospace,monospace" font-size="22">${c==null?'–':c}</text><text x="50" y="63" text-anchor="middle" fill="#8d8d8d" font-size="8.5" letter-spacing="1.5">CONFIDENCE</text></svg>`}
function renderA1(){
 const v=V4(),L=a1List(),cur=$('#a1cur');
 if(!v||!L.length){cur.innerHTML='<div class="panel pbody">Der Analyse-Bot hat noch keine Signale im Log – <b>keine Daten</b>.</div>';$('#a1list').innerHTML='';$('#a1det').innerHTML='';return}
 const a=a1Sel(),latest=a===L[0],fresh=latest&&Date.now()-a.t<5*60000;D.extra.add(a.mint);
 const hero=`<section class="panel a1hero" data-f="${fresh?1:0}"><div class="ah-l"><small class="lbl"><i class="ld"></i>${latest?(fresh?'A1 analysiert gerade':'A1 hat zuletzt analysiert'):'Ausgewählte Analyse'} · ${tAgo(a.t)}</small><h2 class="coin">${esc(a.symbol||'?')} ${vbadge(a.verdict)}<span class="badge">${esc(a.status||'–')}</span></h2>${mintBlock(a.mint)}<div class="tags2">${a.route?`<span class="tag">Route ${esc(a.route)}</span>`:''}${a.side?`<span class="tag">${esc(a.side)}</span>`:''}${a.sizeTier?`<span class="tag">${esc(a.sizeTier)}</span>`:'<span class="tag dim">kein size_tier</span>'}${a.sizeSol!=null?`<span class="tag">${a.sizeSol} SOL</span>`:''}${a.severity?`<span class="tag">Schwere ${esc(a.severity)}</span>`:''}</div></div><div class="ah-r">${confRing(a.confidence)}<div class="kvs"><div><small>Analysiert</small><b>${dtM(a.t)}</b></div><div><small>Gültig bis</small><b data-exp2="${a.expires||''}">–</b></div><div><small>Preis jetzt</small><b data-lv="a1px">–</b></div><div><small>5 Min</small><b data-lv="a1c5">–</b></div><div><small>Market Cap jetzt</small><b data-lv="a1mc">–</b></div><div><small>Liquidität jetzt</small><b data-lv="a1lq">–</b></div></div></div></section>`;
 const key=a.id+'|'+L.length+'|'+L[0].id;if(cur._h!==hero){cur.innerHTML=hero;cur._h=hero}
 const lh=L.map(x=>`<button class="arow${x.id===a.id?' sel':''}" data-act="a1sel" data-id="${esc(x.id)}"><span class="at mono">${dtM(x.t)}</span><b>${esc(x.symbol||'?')}</b>${vbadge(x.verdict)}<span class="mono sec">${x.confidence??'–'}</span><i class="cbar"><u style="width:${x.confidence??0}%"></u></i><small>${esc(x.reasonCodes.map(reasonDe).join(', ')||'keine Blockgründe')}</small></button>`).join('');
 const le=$('#a1list');if(le._h!==lh){le.innerHTML=lh;le._h=lh}setT($('#a1sub'),`${L.length} von ${v.a1.total} Signalen`);
 const det=a1Detail(a);const de=$('#a1det');if(de._h!==det){de.innerHTML=det;de._h=det}setT($('#a1detSub'),a.id||'');
 updAgo();a1Tick();
}
const GT={Gate:'Kaufbedingungen (Gates laut Bot-Regeln)','Rug & Holder':'Rug-Check & Holder','Markt':'Markt','Momentum':'Momentum','Narrativ':'Narrativ & Listen'};
function a1Detail(a){
 const cs=a.criteria||[];const n=k=>cs.filter(c=>c.status===k).length;
 const sum=`<div class="csum"><span><b>${n('pass')}</b> bestanden</span><span class="f"><b>${n('fail')}</b> nicht bestanden</span><span><b>${n('unknown')}</b> ohne Daten</span><span><b>${n('info')}</b> Messwerte</span></div>`;
 const groups=Object.keys(GT).map(g=>{const r=cs.filter(c=>c.group===g);if(!r.length)return '';return `<div class="cg"><h4>${GT[g]}</h4>${r.map(c=>{const ic=stIcon[c.status]||stIcon.info;return `<div class="cr" data-st="${c.status}"${c.id==='age'&&c.group==='Gate'?` data-exp="${c.raw||''}"`:''}><span class="ci" data-tip="${esc(ic[1])}">${ic[0]}</span><div class="cm"><b>${esc(c.label)}</b>${c.rule?`<small>Regel: ${esc(c.rule)}</small>`:''}${c.note?`<small>${esc(c.note)}</small>`:''}</div><div class="cv2 mono" data-cv>${c.status==='live'?'–':c.status==='na'&&c.value==null?'<span class="nd0">nicht nötig (kein Kauf-Urteil)</span>':fmtVal(c)}</div><div class="cs2">${c.source?`<small>${esc(c.source)}${c.t?' · '+tmM(c.t):''}</small>`:''}</div></div>`}).join('')}</div>`}).join('');
 const hist=a1List().filter(x=>x.mint===a.mint&&x.id!==a.id);
 const ev=a.evidence||[];
 return `<div class="blk"><h4>Fazit</h4><div class="verd">${vbadge(a.verdict)}<span class="badge">${esc(a.status||'–')}</span><span class="mono sec">Confidence ${a.confidence??'–'}/100</span></div><div class="cols2"><div><div class="sec small">Blockgründe (Reason-Codes)</div>${a.reasonCodes.length?ulist(a.reasonCodes.map(reasonDe)):'<div class="sec">keine</div>'}</div><div><div class="sec small">Risiken laut Analyse</div>${a.risks.length?ulist(a.risks):'<div class="sec">keine genannt</div>'}</div></div>${a.narrative?`<div class="sec small" style="margin-top:8px">Narrativ-Alarm</div><div>${esc(typeof a.narrative==='string'?a.narrative:JSON.stringify(a.narrative))}</div>`:''}</div>
 <div class="blk"><h4>Geprüfte Kriterien</h4>${sum}${groups}</div>
 <div class="blk"><h4>Nicht verfügbare Felder (laut A1)</h4>${a.unknown.length?a.unknown.map(u=>`<span class="tag dim">${esc(u)}</span>`).join(''):'<span class="sec">keine genannt</span>'}<div class="sec small" style="margin-top:8px">Daten vollständig: <b class="mono">${esc(a.dataComplete??'keine Daten')}</b></div></div>
 <div class="blk"><h4>Weitergegeben an</h4>${a.sentTo.length?a.sentTo.map(u=>`<span class="tag">${esc(u)}</span>`).join(''):NODATA}<div class="sec small" style="margin-top:8px">Quelle: ${esc(a.source||'keine Daten')}</div></div>
 <details class="blk raw"><summary>Rohdaten · ${ev.length} Messwerte mit Quelle und Abrufzeit</summary><div class="rawt">${ev.map(e=>`<div><b>${esc(e.field)}</b><span class="mono">${e.value==null?NODATA:esc(String(e.value))}</span><small>${esc(e.source||'')}${e.t?' · '+tmM(e.t):''}</small></div>`).join('')||NODATA}</div></details>
 <div class="blk"><h4>Frühere Analysen dieses Coins</h4>${hist.length?hist.map(x=>`<button class="arow" data-act="a1sel" data-id="${esc(x.id)}"><span class="at mono">${dtM(x.t)}</span><b>${esc(x.symbol||'?')}</b>${vbadge(x.verdict)}<span class="mono sec">${x.confidence??'–'}</span><small>${esc(x.reasonCodes.map(reasonDe).join(', ')||'keine Blockgründe')}</small></button>`).join(''):'<span class="sec">keine weiteren Analysen im Log</span>'}</div>`;
}
function a1Tick(){
 const a=a1Sel();if(a&&$('#pg-ana')&&!$('#pg-ana').hidden){const d=D.dex[a.mint];const set=(k,t,c)=>{const e=$(`[data-lv="${k}"]`);if(e){setT(e,t);if(c!=null)e.className='mono '+c}};
  if(d&&!d.none){set('a1px',px(d.price));set('a1c5',pct(d.c5),cls(d.c5));set('a1mc',d.mc!=null?'$'+cmp(d.mc):'–');set('a1lq',d.liq!=null?'$'+cmp(d.liq):'–')}else if(d&&d.none){set('a1px','nicht bei DexScreener');set('a1c5','–');set('a1mc','–');set('a1lq','–')}
  const ex=$('[data-exp2]');if(ex){const t=+ex.dataset.exp2;if(t){const r=t-Date.now();setT(ex,r>0?`noch ${Math.floor(r/60000)}:${String(Math.floor(r%60000/1000)).padStart(2,'0')} Min`:`abgelaufen ${ago(t)}`)}else setT(ex,'keine Daten')}}
 $$('.cr[data-exp]').forEach(r=>{const t=+r.dataset.exp;const e=$('[data-cv]',r);if(!t){r.dataset.st='unknown';setT(e,'keine Daten');return}const rem=t-Date.now();r.dataset.st=rem>0?'pass':'fail';setT($('.ci',r),rem>0?'✓':'✕');setT(e,rem>0?`noch ${Math.floor(rem/60000)}:${String(Math.floor(rem%60000/1000)).padStart(2,'0')} Min gültig`:`abgelaufen ${ago(t)}`)});
}

/* Scouts */
function scItem(bot,sym,mint,addr,line,t,extra){return `<div class="sci"><div class="sct">${tAgo(t)}<small class="mono">${t?tmS(t):''}</small></div><div class="scm"><div class="scl"><b>${esc(sym||'?')}</b> ${line}</div>${mint?mintBlock(mint):(addr?`<div class="sec small">Adresse (keine Solana-Mint): <span class="mono">${esc(addr)}</span></div>`:NODATA)}${extra||''}</div></div>`}
function scoutCard(id,title,sub,items,note){const b=botById(id);const [st,stt]=b?botSt(b):['none','–'];return `<section class="panel sccard" data-st="${st}"><div class="ph"><span class="bid">${id}</span><h2>${esc(title)}</h2><span class="sub"><i class="ld"></i>${st==='active'?'scannt aktiv':b?.actionKind==='unverified_history'?'historisch, nicht bestätigt':'inaktiv'} · ${b?botAge(b):'nicht verfügbar'}</span></div><div class="pbody"><div class="sec small" style="margin-bottom:6px">${sub}</div>${items.length?items.join(''):NODATA}${note?`<div class="sec small" style="margin-top:6px">${note}</div>`:''}</div></section>`}
function renderScouts(){
 const v=V4(),sc=v?.scouts;if(!sc){$('#scNow').innerHTML='<div class="panel pbody">Keine Scout-Daten im Snapshot (alter state.json) – <b>keine Daten</b>.</div>';return}
 const c1=sc.c1.slice(0,2).map(e=>scItem('C1',e.symbol,e.mint,e.addr,`${esc(e.aktion||e.typ||'')}${e.usd!=null?' · $'+Math.round(e.usd):''}${e.supplyPct!=null?' · '+e.supplyPct+' % Supply':''}`,e.t));
 const c2=sc.c2.slice(0,2).map(e=>scItem('C2',(e.token||'').replace('$',''),e.mint,null,`${vbadge(e.verdict)} Score ${e.score??'–'}`,e.t));
 const c3=sc.c3.scanNow.slice(0,2).map(e=>scItem('C3',e.symbol||e.name,e.mint,null,`${vbadge(e.status)} Curve ${nf(e.prog,1)} % · MC $${cmp(e.mc)}`,e.seenT));
 const h=scoutCard('C1','Whale','Beobachtet große Wallet-Bewegungen. Zuletzt gefunden:',c1)+scoutCard('C2','Sentiment','Prüft Stimmung/Bot-Kampagnen auf X. Zuletzt geprüft:',c2)+scoutCard('C3','Launch Sniffer',sc.c3.run?`Letzter Lauf ${tAgo(sc.c3.run.t)}: ${sc.c3.run.scanned??'–'} Pairs geprüft, ${sc.c3.scanNow.length} Kandidaten ≥ ${sc.c3.run.minProgress??'–'} %. Aktuell im Blick:`:'Kein Lauf im Log.',c3,'');
 const el=$('#scNow');if(el._h!==h){el.innerHTML=h;el._h=h}
 const body=$('#scBody'),bh=scBodyHTML(sc);if(body._h!==bh){const top=body.scrollTop;body.innerHTML=bh;body._h=bh;body.scrollTop=top}
 $$('#scTabs button').forEach(b=>b.classList.toggle('on',b.dataset.v===UI.sc));
 renderRadarList();updAgo();
}
function scBodyHTML(sc){
 const note='<div class="sec small hint2">Das Log enthält nur abgeschlossene Scans – einzelne Scan-Schritte sind nicht live sichtbar. Die Zeit ist der Zeitpunkt des Log-Eintrags.</div>';
 if(UI.sc==='C1')return note+(sc.c1.length?sc.c1.map(e=>scItem('C1',e.symbol,e.mint,e.addr,`<span class="badge ${vcls(e.aktion)}">${esc(e.aktion||e.typ||'–')}</span> ${e.usd!=null?'$'+nf(e.usd,0):''} ${e.supplyPct!=null?'· '+e.supplyPct+' % Supply':''} ${e.level?`<span class="badge">${esc(e.level)}</span>`:''}${e.verified?`<span class="badge">${esc(e.verified)}</span>`:''}`,e.t,`<div class="mrow"><span>Wallet: <b>${esc(e.walletLabel||'–')}</b></span>${e.wallet?addrBlock(e.wallet):''}</div><div class="mrow"><span>Gegenpartei: <b>${esc(e.counterLabel||'–')}</b></span>${e.counter?addrBlock(e.counter):''}</div><div class="mrow sec small">${e.tx?lnk(solscanTx(e.tx),'Transaktion ansehen ↗')+' · ':''}Quelle: ${esc(e.source||'keine Daten')}${e.eventT?' · Ereignis '+dtM(e.eventT):''}</div>`)).join(''):NODATA);
 if(UI.sc==='C2')return note+(sc.c2.length?sc.c2.map(e=>scItem('C2',(e.token||'').replace('$',''),e.mint,null,`${vbadge(e.verdict)} Score <b>${e.score??'–'}</b>`,e.t,`<div class="sec" style="margin:5px 0">${esc(e.reason||'')}</div>${e.metrics?`<div class="kvs sm">${Object.entries(e.metrics).map(([k,x])=>`<div><small>${esc(k.replace(/_/g,' '))}</small><b>${x==null?'–':esc(String(x))}</b></div>`).join('')}</div>`:''}${e.findings.length?`<div class="sec small" style="margin-top:6px">Befunde</div>${ulist(e.findings.map(f=>f.text))}`:''}${e.gaps.length?`<div class="sec small" style="margin-top:6px">Datenlücken</div>${e.gaps.map(g=>`<span class="tag dim">${esc(g)}</span>`).join('')}`:''}`)).join(''):NODATA);
 const c3=sc.c3,r=c3.run;
 const run=r?`<div class="runhead"><span class="mono">Lauf ${dtM(r.t)} · ${tAgo(r.t)}</span><span><b>${r.scanned??'–'}</b> Pairs geprüft</span><span><b>${c3.scanNow.length}</b> Kandidaten ≥ ${r.minProgress??'–'} %</span><span>${r.runtimeS??'–'} s Laufzeit</span><span>${r.events??'–'} PumpPortal-Events</span>${r.warnings.length?`<span class="down">${esc(r.warnings.join('; '))}</span>`:''}</div>`:NODATA;
 const cand=c3.scanNow.length?c3.scanNow.map(e=>scItem('C3',e.symbol||e.name,e.mint,null,`${vbadge(e.status)} ${e.name&&e.name!==e.symbol?`<span class="sec">${esc(e.name)}</span>`:''}`,e.seenT,`<div class="cbarw"><i class="cbar wide"><u style="width:${Math.min(100,e.prog||0)}%"></u></i><span class="mono">${nf(e.prog,2)} % Bonding Curve</span></div><div class="kvs sm"><div><small>Market Cap (DexScreener)</small><b>${e.mc!=null?'$'+nf(e.mc,0):'–'}</b></div><div><small>Market Cap (Curve)</small><b>${e.mcCurve!=null?'$'+nf(e.mcCurve,0):'–'}</b></div><div><small>Holder</small><b>${e.holders??'–'}</b></div><div><small>Top 10 ohne Curve</small><b>${e.top10!=null?nf(e.top10,1)+' %':'–'}</b></div><div><small>Curve-Anteil</small><b>${e.curvePct!=null?nf(e.curvePct,1)+' %':'–'}</b></div><div><small>Vol. 1 Std / 5 Min</small><b>${e.vol?'$'+cmp(e.vol.h1)+' / $'+cmp(e.vol.m5):'–'}</b></div><div><small>Txns 24 Std</small><b>${e.tx24?e.tx24.buys+' K / '+e.tx24.sells+' V':'–'}</b></div><div><small>Erstellt</small><b>${e.createdT?dtM(e.createdT):'–'}</b></div><div><small>Letzte Transaktion</small><b>${e.lastTxT?tmS(e.lastTxT):'–'}</b></div></div><div class="mrow sec small">Datenqualität: <b>${esc(e.quality||'keine Daten')}</b> – ${esc(e.qualityNote||'')}${e.gaps.length?' · Lücken: '+esc(e.gaps.join(', ')):''}</div><div class="mrow">${e.creator?`<span class="sec small">Creator:</span>${addrBlock(e.creator)}`:''}${e.curveAcct?`<span class="sec small">Curve-Konto:</span>${addrBlock(e.curveAcct)}`:''}</div>${e.sig?`<div class="mrow sec small">${lnk(solscanTx(e.sig),'Letzte Transaktion ansehen ↗')}</div>`:''}`)).join(''):'<div class="sec">Im letzten Lauf lag kein Coin über der Schwelle.</div>';
 const runs=`<details class="blk raw"><summary>Letzte ${c3.runs.length} Läufe</summary><div class="rawt">${c3.runs.map(x=>`<div><b>${dtM(x.t)}</b><span class="mono">${x.scanned??'–'} Pairs → ${x.candidates} Kandidaten</span><small>${x.runtimeS??'–'} s${x.warnings.length?' · '+esc(x.warnings.join('; ')):''}</small></div>`).join('')||NODATA}</div></details>`;
 const lau=`<details class="blk raw"><summary>Neue Launches · ${c3.todayLaunches} heute (zuletzt ${c3.launches.length})</summary>${c3.launches.map(l=>scItem('C3',l.name,l.mint,null,`<span class="badge">${esc(l.state||'–')}</span> <span class="sec">${esc(l.dex||'')}</span>`,l.t,`<div class="mrow sec small">MC ${l.mc!=null?'$'+nf(l.mc,0):'–'} · Reserve ${l.reserveUsd!=null?'$'+nf(l.reserveUsd,0):'–'} · Vol. 24 Std ${l.vol24!=null?'$'+cmp(l.vol24):'–'} · Entdeckt nach ${l.lagS??'–'} s · Quelle ${esc(l.source||'–')}</div>`)).join('')||NODATA}</details>`;
 const gr=`<details class="blk raw"><summary>Graduationen · ${c3.todayGrads} heute (zuletzt ${c3.grads.length})</summary>${c3.grads.map(g=>scItem('C3','',g.mint,null,`<span class="badge">${esc(g.from)} → ${esc(g.to)}</span>`,g.t,`<div class="mrow sec small">MC ${g.mc!=null?'$'+nf(g.mc,0):'–'} · Liquidität ${g.liq!=null?'$'+nf(g.liq,0):'–'}${g.preObserved?' · vorher beobachtet':''}</div>`)).join('')||NODATA}</details>`;
 return note+run+cand+runs+lau+gr;
}

/* Coin-Reise */
const JST=[['scout','Scout','Scouts'],['analyst','Analyst','Analyse'],['filter','Filter','Filter'],['guard','Guard','Wächter'],['sniper','Sniper','Sniper']];
function journeyHTML(j){
 if(!j)return '<div class="sec">Zu diesem Coin gibt es keine Einträge in den Bot-Logs – <b>keine Daten</b>.</div>';
 let lastReached=-1;JST.forEach(([k],i)=>{if(j[k].length)lastReached=i});let prevT=null;
 const cols=JST.map(([k,name],i)=>{const e=j[k];const done=e.length>0,t=done?Math.min(...e.map(x=>x.t||Infinity)):null;
  const delta=done&&prevT&&isFinite(t)?(()=>{const d=(t-prevT)/1000;return d>=0?`+${d<90?Math.round(d)+' s':d<5400?Math.round(d/60)+' Min':nf(d/3600,1)+' Std'}`:''})():'';if(done&&isFinite(t))prevT=t;
  return `<div class="jst" data-st="${done?'done':i>lastReached?'skip':'gap'}"><div class="jh"><span class="jr">${i+1}</span><b>${name}</b>${delta?`<em>${delta}</em>`:''}</div>${done?e.map(x=>`<div class="jb"><div><span class="bid">${x.bot}</span> <b>${esc(x.botName.replace(/^[A-D]\d\s*/,''))}</b> ${vbadge(x.verdict)}${x.confidence!=null?`<span class="mono sec"> Conf ${x.confidence}</span>`:''}${x.kind==='derived'?'<span class="badge dim" data-tip="Kein eigener Log-Eintrag – abgeleitet aus dem A1-Signal">abgeleitet</span>':''}</div><div class="sec small">${esc(x.text||'')}</div><div class="mono small">${x.t?dtM(x.t)+' · '+tmS(x.t):'keine Zeit'}</div></div>`).join(''):`<div class="jb none">${i>lastReached?'nicht erreicht – kein Eintrag im Log':'kein Eintrag im Log (keine Daten)'}</div>`}</div>`}).join('');
 const stopped=lastReached<4?JST[lastReached+1]?.[1]:null;
 return `<div class="jtrace">${cols}</div><div class="jfoot">${lastReached<0?'Keine Stufe hat diesen Coin im Log.':`Weitester Schritt im Log: <b>${JST[lastReached][1]}</b>${lastReached<4?` · danach kein Eintrag (nächste Stufe: ${stopped})`:' · hat alle Stufen erreicht'}.`}</div>`;
}
function renderJourney(){
 const v=V4(),J=v?.journeys||[];const lst=$('#jlist');
 if(!J.length){lst.innerHTML='<div class="empty">Keine Coins mit Pipeline-Einträgen – keine Daten.</div>';$('#jdet').innerHTML='';return}
 const sel=J.find(x=>x.mint===UI.jsel)||J[0];
 const lh=J.map(j=>`<button class="arow jrow${j.mint===sel.mint?' sel':''}" data-act="jsel" data-id="${esc(j.mint)}"><b>${esc(j.symbol)}</b><span class="dots">${JST.map(([k])=>`<i class="${j[k].length?'on':''}"></i>`).join('')}</span><small class="mono">${esc(short(j.mint))} · ${j.last?dtM(j.last):''}</small></button>`).join('');
 if(lst._h!==lh){lst.innerHTML=lh;lst._h=lh}setT($('#jsub'),`${J.length} Coins`);
 const d=`<div class="jhead"><h2 class="coin">${esc(sel.symbol)}</h2>${mintBlock(sel.mint)}</div>${journeyHTML(sel)}`;
 const de=$('#jdet');if(de._h!==d){de.innerHTML=d;de._h=d}setT($('#jdetSub'),'Scout → Analyst → Filter → Guard → Sniper');updAgo();
}
function renderAna(){if(!D.snap)return;({a1:renderA1,scouts:renderScouts,journey:renderJourney})[UI.sec]();}
function setSec(sec,noHash){
 if(!['a1','scouts','journey'].includes(sec))sec='a1';const prev=UI.sec;UI.sec=sec;
 $$('#anaSeg button').forEach(b=>b.classList.toggle('on',b.dataset.v===sec));
 $$('#pg-ana .sect').forEach(s=>{const on=s.id==='sec-'+sec;if(on&&s.hidden){s.hidden=false;s.classList.remove('sin');void s.offsetWidth;s.classList.add('sin')}else if(!on)s.hidden=true});
 renderAna();if(sec==='scouts')radarSize();if(!noHash&&UI.page==='ana')setHash();
}

/* ================= Seite 3 · Bots & Risiko ================= */
function renderBotsPage(first){const s=D.snap;if(!s)return;renderBots(first);renderRisk();renderHealth();renderWallets();renderSrcs()}

/* ================= Seite 4 · Kurse ================= */
function kchSelect(spec){
 UI.kch=spec;markK();
 if(spec.type==='cex'){const n=CEX.find(c=>c[0]===spec.sym)?.[1]||spec.sym;setT($('#kchTitle'),`${spec.sym} · ${n} · Binance`);$('#kchDetail').dataset.type='cex';$('#kchDetail').dataset.id=spec.sym}
 else{D.extra.add(spec.mint);setT($('#kchTitle'),`${symOf(spec.mint)} · ${spec.mint} · DexScreener`);$('#kchDetail').dataset.type='coin';$('#kchDetail').dataset.id=spec.mint}
 CH_K.open(spec);
}
function renderKurse(first){
 if(!D.snap)return;buildKcards();buildMemes();updMemes();
 if(!CH_K.spec||first)kchSelect(UI.kch);
}

/* ================= Suche ================= */
function searchIndex(){
 const s=D.snap,v=V4(),m=new Map();if(!s)return m;
 const add=(mint,sym,tag)=>{if(!mint||mint.startsWith('0x'))return;const o=m.get(mint)||{mint,sym:null,tags:new Set()};if(sym&&!o.sym)o.sym=sym;if(tag)o.tags.add(tag);m.set(mint,o)};
 s.coins.forEach(c=>add(c.mint,c.symbol,'Bots'));s.radar.forEach(r=>add(r.mint,r.symbol,'Radar'));
 v?.a1?.list.forEach(a=>add(a.mint,a.symbol,'A1'));v?.scouts?.c1.forEach(e=>add(e.mint,e.symbol,'C1'));v?.scouts?.c2.forEach(e=>add(e.mint,(e.token||'').replace('$',''),'C2'));v?.scouts?.c3.scanNow.forEach(e=>add(e.mint,e.symbol,'C3'));v?.scouts?.c3.launches.forEach(e=>add(e.mint,e.name,'Launch'));
 return m;
}
function doSearch(){
 const q=$('#q').value.trim(),box=$('#qres');if(!q||!D.snap){box.hidden=true;return}
 const ql=q.toLowerCase();const out=[];
 D.snap.bots.forEach(b=>{if((b.id+' '+b.name+' '+(b.title||'')).toLowerCase().includes(ql))out.push(`<button class="qr" data-act="bot" data-id="${b.id}"><span class="bid">${b.id}</span><b>${esc(bName(b))}</b><small>Bot</small></button>`)});
 const idx=searchIndex();let n=0;for(const o of idx.values()){if(n>=8)break;if((o.sym||'').toLowerCase().includes(ql)||o.mint.toLowerCase().includes(ql)){n++;out.push(`<button class="qr" data-act="coin" data-mint="${o.mint}"><b>${esc(o.sym||short(o.mint))}</b><small class="mono">${esc(o.mint)}</small><em>${[...o.tags].join(' · ')}</em></button>`)}}
 CEX.forEach(([k,nm])=>{if((k+' '+nm).toLowerCase().includes(ql))out.push(`<button class="qr" data-act="cex" data-id="${k}"><b>${k}</b><small>${esc(nm)} · Kurs</small></button>`)});
 if(!n&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q))out.push(`<button class="qr" data-act="coin" data-mint="${esc(q)}"><b>Mint öffnen</b><small class="mono">${esc(q)}</small><em>Adresse direkt laden</em></button>`);
 box.innerHTML=out.length?out.slice(0,14).join(''):'<div class="empty">Nichts gefunden – keine Daten zu „'+esc(q)+'“.</div>';box.hidden=false;
}

/* ================= Seite 5 · Bilanz ================= */
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
function money(v){if(!(v<0)&&!(v>0))return '0,00 EUR';return (v>0?'+':'')+nf(v,2)+' EUR'}
function countTxt(v){return Number.isInteger(v)?nf(v,0):nf(v,2)}
function rateTxt(x){const p=x*100;const d=Math.abs(p-Math.round(p))<0.05?0:1;return nf(p,d)+' %'}
function holdTxt(ms){
 if(ms<1000)return Math.round(ms)+' ms';
 const s=ms/1000;if(s<90)return nf(s,s<10?1:0)+' s';
 const m=s/60;if(m<90)return nf(m,1)+' Min';
 const h=m/60;if(h<48)return nf(h,1)+' Std';
 return nf(h/24,1)+' Tage';
}
function grossFrom(rows,net,trades){
 if(!Array.isArray(rows))return {ok:false,why:'Feld pnlByToken fehlt.'};
 if(rows.some(r=>!r||typeof r!=='object'||num(r.eur)==null))return {ok:false,why:'pnlByToken enthält Einträge ohne EUR-Betrag.'};
 const sum=rows.reduce((a,r)=>a+r.eur,0);
 if(net!=null&&Math.abs(sum-net)>0.02)return {ok:false,why:'Summe pnlByToken.eur passt nicht zu perf.totalEur.'};
 if(!rows.length){
  if(trades>0)return {ok:false,why:'pnlByToken ist leer, obwohl Trades gezählt sind.'};
  if(net!=null&&Math.abs(net)>0.02)return {ok:false,why:'pnlByToken ist leer und widerspricht dem Netto.'};
  if(trades===0||net===0)return {ok:true,profit:0,loss:0};
  return {ok:false,why:'pnlByToken ist leer — Brutto ist nicht belegt.'};
 }
 return {ok:true,profit:rows.reduce((a,r)=>a+(r.eur>0?r.eur:0),0),loss:rows.reduce((a,r)=>a+(r.eur<0?r.eur:0),0)};
}
function holdInfo(s){
 const perf=s&&s.perf&&typeof s.perf==='object'?s.perf:{};
 const direct=[['avgHoldMs',1],['avgHoldingMs',1],['meanHoldMs',1],['avgHoldSec',1000],['avgHoldingSec',1000],['holdSec',1000],['avgHoldMin',60000]];
 for(const [k,mul] of direct){const v=num(perf[k]);if(v!=null&&v>=0)return {ms:v*mul,src:'perf.'+k}}
 const lists=[['closedTrades','closedTrades'],['realizedTrades','realizedTrades'],['trades','trades']];
 for(const [key,src] of lists){
  const arr=s[key];if(!Array.isArray(arr)||!arr.length)continue;
  const durs=[];let bad=false;
  for(const r of arr){
   if(!r||typeof r!=='object'){bad=true;break}
   const st=String(r.status||r.kind||r.action||'').toUpperCase();
   if(/SKIP|BLOCK|CANCEL|REJECT/.test(st))continue;
   let ms=num(r.holdMs);if(ms==null&&num(r.holdSec)!=null)ms=r.holdSec*1000;
   if(ms==null){
    const a=num(r.openedAt)??num(r.entryT)??num(r.openT);
    const b=num(r.closedAt)??num(r.exitT)??num(r.closeT);
    if(a==null||b==null||b<a){bad=true;break}
    ms=b-a;
   }
   if(ms<0){bad=true;break}
   durs.push(ms);
  }
  if(!bad&&durs.length)return {ms:durs.reduce((a,b)=>a+b,0)/durs.length,src};
 }
 if(Array.isArray(s.pnlByToken)&&s.pnlByToken.length){
  const durs=[];let saw=false,bad=false;
  for(const r of s.pnlByToken){
   let ms=num(r&&r.holdMs);if(r&&ms==null&&num(r.holdSec)!=null)ms=r.holdSec*1000;
   if(ms==null){
    const a=num(r&&(r.openedAt??r.entryT));const b=num(r&&(r.closedAt??r.exitT));
    if(a!=null||b!=null){saw=true;if(a==null||b==null||b<a)bad=true;else durs.push(b-a)}
   }else{saw=true;if(ms<0)bad=true;else durs.push(ms)}
  }
  if(saw&&!bad&&durs.length===s.pnlByToken.length)return {ms:durs.reduce((a,b)=>a+b,0)/durs.length,src:'pnlByToken'};
 }
 return null;
}
function bilanzMetrics(s){
 const out={mode:typeof s?.mode==='string'&&s.mode?s.mode:null,net:null,trades:null,wins:null,winRate:null,grossProfit:null,grossLoss:null,hold:null,reasons:{}};
 if(!s||typeof s!=='object'){out.reasons.net=out.reasons.trades=out.reasons.gross=out.reasons.winRate=out.reasons.hold='Kein Snapshot.';return out}
 const perf=s.perf&&typeof s.perf==='object'?s.perf:null;
 if(!perf){out.reasons.net='Feld perf.totalEur fehlt.';out.reasons.trades='Feld perf.trades fehlt.';out.reasons.wins='Feld perf.wins fehlt.'}
 else{
  out.net=num(perf.totalEur);out.trades=num(perf.trades);out.wins=num(perf.wins);
  if(out.net==null)out.reasons.net='Feld perf.totalEur fehlt oder ist keine Zahl.';
  if(out.trades==null||out.trades<0){if(out.trades<0)out.reasons.trades='perf.trades ist negativ.';else out.reasons.trades='Feld perf.trades fehlt oder ist keine Zahl.';out.trades=out.trades<0?null:out.trades}
  if(out.wins!=null&&out.wins<0){out.wins=null;out.reasons.wins='perf.wins ist negativ.'}
  else if(out.wins==null)out.reasons.wins='Feld perf.wins fehlt oder ist keine Zahl.';
 }
 const g=grossFrom(s.pnlByToken,out.net,out.trades);
 if(g.ok){out.grossProfit=g.profit;out.grossLoss=g.loss}else out.reasons.gross=g.why;
 if(out.wins!=null&&out.trades!=null&&out.trades>0&&out.wins<=out.trades)out.winRate=out.wins/out.trades;
 else if(out.trades===0)out.reasons.winRate='Keine realisierten Trades — Trefferquote nicht definiert.';
 else if(!out.reasons.winRate)out.reasons.winRate=out.reasons.wins||out.reasons.trades||'Trefferquote nicht belegt.';
 const h=holdInfo(s);if(h)out.hold=h;else out.reasons.hold='Keine Ein- und Ausstiegszeiten im Snapshot.';
 return out;
}
function botMetric(id,label){
 const b=D.snap?.bots?.find(x=>x.id===id);const row=(b?.metrics||[]).find(x=>Array.isArray(x)&&x[0]===label);
 return row?row[1]:null;
}
function bzCell(k,label,value,sub,tip,state){
 const empty=value==null;
 return `<article class="bzcell${empty?' is-empty':''}" data-k="${k}" data-state="${state}" data-tip="${esc(tip)}"><small>${label}</small><b class="${empty?'':'mono'} ${state==='pos'?'up':state==='neg'?'down':''}">${empty?'Keine Daten':esc(value)}</b><span>${esc(sub)}</span></article>`;
}
function signState(v){return v>0?'pos':v<0?'neg':'zero'}
const UNVERIFIED='Keine verifizierten Trade-Daten';
function publicMetric(label,value){return /realis|echte trades|pnl|gewinn|verlust|equity|gesamtwert|wallet\s*sol|offene position|ledger|fifo|\bnetto\b/i.test(String(label))?'nicht verifiziert':value}
function isoStamp(v){if(typeof v!=='string'||!v)return null;const t=Date.parse(v);return Number.isFinite(t)?v:null}
function pathOk(src,prefix){if(typeof src!=='string'||src.length<12||src.length>160)return false;if(src.startsWith('/')||src.includes('..')||src.includes('\\')||/home|tax|fifo|ledger|pnl|perf/i.test(src))return false;return src.startsWith(prefix)}
function countField(v){if(v==null)return {ok:true,v:null};const n=num(v);return n!=null&&n>=0&&n===Math.floor(n)?{ok:true,v:n}:{ok:false}}
function moneyField(v){if(v==null)return {ok:true,v:null};const n=num(v);return n==null?{ok:false}:{ok:true,v:n}}
function readBook(book,venue,prefix){
 if(!book||book.verified!==true||book.coverage!=='complete'||book.venue!==venue)return null;
 if(book.closure!=='validated'||book.fees!=='complete'||book.confirmation!==true)return null;
 if(venue==='REAL'&&(typeof book.signature!=='string'||book.signature.length<32||!isoStamp(book.blockTime)))return null;
 if(!pathOk(book.source,prefix))return null;
 const observedAt=isoStamp(book.observedAt);if(!observedAt)return null;
 if(!Object.prototype.hasOwnProperty.call(book,'lastActionAt'))return null;
 const lastActionAt=book.lastActionAt==null?null:isoStamp(book.lastActionAt);
 if(book.lastActionAt!=null&&!lastActionAt)return null;
 const closed=countField(book.closed),wins=countField(book.wins),hold=book.avgHoldMs==null?{ok:true,v:null}:num(book.avgHoldMs)!=null&&book.avgHoldMs>=0?{ok:true,v:book.avgHoldMs}:{ok:false};
 const gp=moneyField(book.grossProfitEur),gl=moneyField(book.grossLossEur),ne=moneyField(book.netEur),ns=moneyField(book.netSol);
 if(!closed.ok||!wins.ok||!hold.ok||!gp.ok||!gl.ok||!ne.ok||!ns.ok)return null;
 if(wins.v!=null&&closed.v!=null&&wins.v>closed.v)return null;
 return {venue,source:book.source,observedAt,lastActionAt,closed:closed.v,wins:wins.v,avgHoldMs:hold.v,grossProfitEur:gp.v,grossLossEur:gl.v,netEur:ne.v,netSol:ns.v};
}
function tradeReport(s){
 const ex=s&&s.schemaVersion===1?s.execution:null;
 const real=ex?readBook(ex.real,'REAL','trading/real/'):null;
 const paper=ex?readBook(ex.paper,'PAPER','trading/paper/'):null;
 let positions=null;const pb=s&&s.schemaVersion===1?s.positionBook:null;
 if(pb&&pb.verified===true&&pb.coverage==='complete'&&pb.confirmation===true&&pb.closure==='validated'&&pathOk(pb.source,'trading/positions/')&&isoStamp(pb.observedAt)){
  const count=countField(pb.count);
  if(count.ok)positions={count:count.v,observedAt:pb.observedAt,source:pb.source};
 }
 return {real,paper,positions};
}
function bookCard(book,venue){
 if(!book)return bzCell(venue,venue+' · ausgeführt',null,UNVERIFIED,UNVERIFIED,'empty');
 const title=book.venue==='REAL'?'REAL · ausgeführt':'PAPER · ausgeführt';
 const closed=book.closed==null?null:countTxt(book.closed);
 const net=book.venue==='REAL'?(book.netEur==null?null:money(book.netEur)):(book.netSol==null?null:nf(book.netSol,3)+' SOL');
 const hold=book.avgHoldMs==null?null:holdTxt(book.avgHoldMs);
 const win=book.closed>0&&book.wins!=null?rateTxt(book.wins/book.closed):null;
 const last=book.lastActionAt?`Letzte Ausführung ${dtM(Date.parse(book.lastActionAt))} Uhr`:book.closed===0?'Letzte Ausführung: keine':'Letzte Ausführung: Keine Daten';
 const gross=book.venue==='REAL'?[book.grossProfitEur==null?null:'Brutto-Gewinn '+money(book.grossProfitEur),book.grossLossEur==null?null:'Brutto-Verlust '+money(book.grossLossEur)].filter(Boolean).join(' · '):'';
 const extra=[net==null?'Netto: Keine Daten':'Netto '+net,hold==null?'Haltedauer: Keine Daten':'Haltedauer '+hold,win,gross].filter(Boolean).join(' · ');
 return bzCell(book.venue,title,closed,`Beobachtet ${dtM(Date.parse(book.observedAt))} Uhr · ${last} · ${extra}`,book.source,book.closed==null?'empty':'num');
}
function renderBilanz(){
 const host=$('#bilanz'),sub=$('#bilSub');if(!host)return;const s=D.snap;if(!s)return;
 const r=tradeReport(s);
 if(!r.real&&!r.paper){
  if(sub)setT(sub,'Keine verifizierten Trade-Daten');
  const html=`<div class="bzunverified" data-k="unverified"><b>Noch nicht angebunden / keine verifizierten Daten</b><p>Reale und Paper-Ausführungen sind nicht an ein geprüftes Buch angebunden. Historische Steuerzahlen und Freitext mit einer Null sind kein Ergebnis. Eine leere Datei ist keine Null.</p></div>`;
  if(host._h!==html){host.innerHTML=html;host._h=html}
  return;
 }
 if(sub)setT(sub,'Getrennte Bücher · Beobachtet ist nicht die letzte Ausführung');
 const html=`<div class="bzgrid bzsub">${bookCard(r.real,'REAL')}${bookCard(r.paper,'PAPER')}</div><p class="bznote">Noch nicht angebunden / keine verifizierten Daten, außer ein Buch ist ausdrücklich bestätigt. schemaVersion oder verified allein sind kein Ergebnis.</p>`;
 if(host._h!==html){host.innerHTML=html;host._h=html}
}

/* ================= Seiten-Wechsel ================= */
const PAGES={ueb:['uebersicht',renderUeb],ana:['analyse',renderAna],bots:['bots',renderBotsPage],kurse:['kurse',renderKurse],bil:['bilanz',renderBilanz]};
const PBYHASH=Object.fromEntries(Object.entries(PAGES).map(([k,v])=>[v[0],k]));
let pgTok=0;
function navBar(){const tp=$('#top');if(tp)document.documentElement.style.setProperty('--hh',tp.offsetHeight+'px');const on=$('#nav button.on'),u=$('#navbar');if(on&&u){u.style.width=on.offsetWidth+'px';u.style.transform=`translateX(${on.offsetLeft}px)`}}
function showPage(id,o={}){
 if(!PAGES[id])return;const from=$('.page.on'),to=$('#pg-'+id);
 if(from===to){if(o.hash!==false)setHash();return}
 const tok=++pgTok;UI.page=id;$$('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===id));navBar();
 $$('.page').forEach(p=>{if(p!==from&&p!==to){p.hidden=true;p.classList.remove('on','leave')}});
 if(from){from.classList.add('leave');from.classList.remove('on');setTimeout(()=>{if(tok===pgTok){from.hidden=true;from.classList.remove('leave')}},o.instant?0:260)}
 to.hidden=false;to.classList.remove('leave');void to.offsetWidth;to.classList.add('on');
 document.body.dataset.page=id;window.scrollTo({top:0});
 if(D.snap){PAGES[id][1](true);onShown(id)}
 if(o.hash!==false)setHash();
}
function onShown(id){requestAnimationFrame(()=>{if(id==='ueb'){measure();laneSize()}if(id==='ana'&&UI.sec==='scouts')radarSize();if(id==='kurse'){markK();if(CH_K.chart)try{CH_K.chart.timeScale().fitContent()}catch{}}})}
function setHash(){const p=PAGES[UI.page][0];let h='#'+p;if(UI.page==='ana'&&UI.sec!=='a1')h+='/'+UI.sec;if(UI.drawer)h='#'+p+'/'+UI.drawer.type+'/'+UI.drawer.id;history.replaceState(null,'',location.pathname+location.search+h)}

/* ---------- Hauptschleife ---------- */
const PERF={frames:0,slow:0,max:0,start:performance.now(),lastF:0};window.__perf=PERF;
let lastNow=0;
function loop(now){
 requestAnimationFrame(loop);
 if(HIDDEN){lastNow=now;return}
 const dt=lastNow?Math.min(.1,(now-lastNow)/1000):0;lastNow=now;
 if(PERF.lastF){const f=now-PERF.lastF;PERF.frames++;if(f>50)PERF.slow++;if(f>PERF.max)PERF.max=f}PERF.lastF=now;
 if(D.snap){const p=UI.page;if(p==='ueb'){animKpis(now);if(!REDUCED)animPipe(now);drawLanes(now)}flushPx(now);if(p==='ana'&&UI.sec==='scouts')drawRadar(now);if(p!=='kurse')drawEcg(dt,now)}
 bgDraw(now);
}
function renderAll(first){
 renderChips();renderRail();buildMini();
 PAGES[UI.page][1](first);
 if(first){ecgSize();navBar();route(true)}
}
function parseHash(){const h=location.hash.replace(/^#\/?/,'');if(!h)return{};const p=h.split('/').map(decodeURIComponent);const page=PBYHASH[p[0]];const rest=page?p.slice(1):p;const o={page};if(rest[0]&&['bot','coin','cex'].includes(rest[0])&&rest[1])o.drawer=[rest[0],rest.slice(1).join('/')];else if(rest[0]&&['a1','scouts','journey'].includes(rest[0]))o.sec=rest[0];return o}
function route(first){
 const o=parseHash();if(o.page&&o.page!==UI.page)showPage(o.page,{hash:false});
 if(o.sec&&o.sec!==UI.sec)setSec(o.sec,true);
 if(o.drawer&&D.snap&&(!UI.drawer||UI.drawer.id!==o.drawer[1]))openDrawer(o.drawer[0],o.drawer[1],true);
 else if(!o.drawer&&UI.drawer&&!first)closeDrawer();
}
addEventListener('hashchange',()=>route());
function initPage(){const o=parseHash();const p=o.page||'ueb';UI.page='ueb';if(p!=='ueb')showPage(p,{hash:false,instant:true});if(o.sec)setSec(o.sec,true);$$('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===UI.page));document.body.dataset.page=UI.page;navBar()}

/* ---------- Ereignisse ---------- */
function toBots(g){showPage('bots');setTimeout(()=>{const e=$('#g-'+g);if(e){e.classList.remove('closed');e.scrollIntoView({behavior:'smooth',block:'start'});e.querySelectorAll('.bot').forEach(b=>{b.classList.remove('flash');void b.offsetWidth;b.classList.add('flash')})}},300)}
function leaveDrawer(){if(UI.drawer)closeDrawer()}
document.addEventListener('click',e=>{
 if(!e.target.closest('.search'))$('#qres').hidden=true;
 const el=e.target.closest('[data-act]');if(!el)return;const a=el.dataset.act;
 if(a==='copy'){e.stopPropagation();e.preventDefault();copyText(el.dataset.v,el);return}
 if(el.closest('#qres')){$('#qres').hidden=true;$('#q').value='';$('#q').blur()}
 if(a==='bot')openDrawer('bot',el.dataset.id);
 else if(a==='coin'){e.stopPropagation();openDrawer('coin',el.dataset.mint)}
 else if(a==='cex')openDrawer('cex',el.dataset.id);
 else if(a==='evt'){if(el.dataset.mint)openDrawer('coin',el.dataset.mint);else{const b=D.snap.bots.find(b=>b.name===el.dataset.agent);if(b)openDrawer('bot',b.id)}}
 else if(a==='stage')toBots(el.dataset.v);
 else if(a==='page')showPage(el.dataset.v);
 else if(a==='goto'){leaveDrawer();if(el.dataset.sc)UI.sc=el.dataset.sc;if(el.dataset.mint)UI.jsel=el.dataset.mint;showPage(el.dataset.v);if(el.dataset.sec)setSec(el.dataset.sec)}
 else if(a==='a1open'){leaveDrawer();if(el.dataset.id)UI.a1sel=el.dataset.id;showPage('ana');setSec('a1')}
 else if(a==='sec')setSec(el.dataset.v);
 else if(a==='sctab'){UI.sc=el.dataset.v;renderScouts()}
 else if(a==='a1sel'){UI.a1sel=el.dataset.id;renderA1()}
 else if(a==='jsel'){UI.jsel=el.dataset.id;renderJourney()}
 else if(a==='lrange'){UI.lr=+el.dataset.v;$$('#laneRange button').forEach(b=>b.classList.toggle('on',b===el));lT=0}
 else if(a==='ksel')kchSelect(el.dataset.type==='cex'?{type:'cex',sym:el.dataset.id}:{type:'dex',mint:el.dataset.id});
 else if(a==='kdetail'){if(el.dataset.id)openDrawer(el.dataset.type,el.dataset.id)}
 else if(a==='minprices')$('#pPrices').classList.toggle('min');
 else if(a==='grp')el.parentElement.classList.toggle('closed');
 else if(a==='tf'){const C=el.dataset.c==='k'?CH_K:CH_D;if(!C.spec)return;C.tf=TFS[C.spec.type].find(t=>t[1]===el.dataset.v);C.load()}
 else if(a==='sound')toggleSound();
 else if(a==='help')$('#help').hidden=false;
 else if(a==='helpclose')$('#help').hidden=true;
 else if(a==='close')closeDrawer();
 else if(a==='prev')stepBot(-1);else if(a==='next')stepBot(1);
});
function toggleSound(){D.sound=!D.sound;$('#soundBtn').classList.toggle('on',D.sound);if(D.sound)beep(740)}
$('#q').addEventListener('input',doSearch);$('#q').addEventListener('focus',doSearch);
document.addEventListener('keydown',e=>{
 if(e.metaKey||e.ctrlKey||e.altKey)return;const k=e.key;
 if(e.target.id==='q'){if(k==='Escape'){$('#qres').hidden=true;e.target.blur()}else if(k==='Enter'){const f=$('#qres .qr');if(f)f.click()}return}
 if(e.target.matches?.('input,textarea,select'))return;
 if(k==='Escape'){if(!$('#help').hidden)$('#help').hidden=true;else if(UI.drawer)closeDrawer()}
 else if(k==='ArrowRight')stepBot(1);else if(k==='ArrowLeft')stepBot(-1);
 else if(k==='s'||k==='S')toggleSound();else if(k==='?')$('#help').hidden=!$('#help').hidden;
 else if(k==='/'){e.preventDefault();$('#q').focus()}
 else if(k>='1'&&k<='5'){leaveDrawer();showPage(['ueb','ana','bots','kurse','bil'][+k-1])}
 else if((k==='Enter'||k===' ')&&document.activeElement?.classList.contains('bot')){e.preventDefault();document.activeElement.click()}});
document.addEventListener('pointermove',e=>{
 if(e.target.id==='laneCv'){const r=e.target.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let b=null,bd=11*11;for(const p of lpts){const d=(p.x-x)**2+(p.y-y)**2;if(d<bd){bd=d;b=p}}lHover=b;e.target.style.cursor=b?'pointer':'default';if(b)showTip(null,e.clientX,e.clientY,`${b.id} · ${dtM(b.e.t)} Uhr (${ago(b.e.t)})\n${b.e.sym?b.e.sym+' · ':''}${b.e.txt}`);else tipEl.hidden=true;return}
 if(lHover)lHover=null;
 if(e.target.id!=='radar'){if(rHover){rHover=null}return}const r=e.target.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let b=null,bd=18*18;for(const p of rpts){const d=(p.x-x)**2+(p.y-y)**2;if(d<bd){bd=d;b=p}}rHover=b;e.target.style.cursor=b?'pointer':'crosshair';if(b)showTip(null,e.clientX,e.clientY,`${b.symbol} · ${nf(b.prog,1)} % Bonding Curve · MC $${cmp(b.mc)}`);else tipEl.hidden=true});
$('#radar').addEventListener('click',()=>{if(rHover)openDrawer('coin',rHover.mint)});
$('#laneCv').addEventListener('click',()=>{if(lHover){const e=lHover.e;if(e.mint)openDrawer('coin',e.mint);else openDrawer('bot',lHover.id)}});
addEventListener('resize',()=>{measure();radarSize();ecgSize();laneSize();bgInit();navBar()});
addEventListener('error',e=>console.warn('JS-Fehler:',e.message));

/* ---------- Takt-Timer ---------- */
let tickN=0;
setInterval(()=>{
 if(HIDDEN){D.tickCount=0;return}
 const n=Date.now();setT($('#clock'),tmS(n));const s=Math.floor((n-D.t0)/1000);setT($('#session'),[s/3600|0,s/60%60|0,s%60].map(x=>String(x).padStart(2,'0')).join(':'));
 D.tps=D.tickCount;D.tickCount=0;tickN++;
 if(!D.snap)return;
 renderChips();
 clarifyTransportChip();
 if(tickN%2===0){renderRail();updAgo()}
 a1Tick();drawerTick();CH_D.live();CH_K.live();
 const p=UI.page;
 if(p==='ueb'){renderKpis();if(tickN%2===0)renderNow();$$('#pipe .nd').forEach((nd,i)=>{const g=D.snap.stages[i],act=D.snap.bots.filter(b=>b.group===g&&botSt(b)[0]==='active').length;const v=act?1:0;if(+nd.dataset.a!==v)nd.dataset.a=v})}
 else if(p==='bots'){liveBots();renderWallets();if(tickN%3===0){renderSrcs();renderHealth()}}
 else if(p==='kurse')updMemes();
 else if(p==='ana'&&UI.sec==='scouts')setT($('#radSub'),D.snap.sniffer?`${D.snap.sniffer.scanned} gescannt · ${ago(D.snap.sniffer.at)}`:'');
},1000);

/* ---------- Start ---------- */
bgInit();ecgSize();buildMini();requestAnimationFrame(loop);
binConnect();hlConnect();hlChange();
if(innerWidth<1180)$('#pPrices').classList.add('min');
initPage();initBotData();
window.__bilanz=tradeReport;
window.__applyState=applyState;
window.__snap=()=>D.snap;
