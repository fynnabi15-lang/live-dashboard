// Safe public projection. Reads SHARED_DIR. Does not read tax ledgers, FIFO lots,
// private stores, or absolute paths. Empty files stay null, not zero.
const fs = require('fs');
const path = require('path');
const MAP = require('./peer-map.json');

const PEERS = [
  ['MAIN', 'Main', 'Infra', 'Steuerung', 'Kein eigener Aktionsnachweis, bis eine Telemetrie-Datei dieser ID existiert.'],
  ['A1', 'A1 Analyse', 'Analyst', 'Analyse', 'Signale nur aus der eigenen Signaldatei.'],
  ['A2', 'A2 Rug Check', 'Filter', 'Rug-Check', 'Nur eigene Rug-Checks. Nicht aus A1 abgeleitet.'],
  ['A3', 'A3 Liquidität', 'Filter', 'Liquidität', 'Nur eigene Liquiditäts-Checks. Nicht aus A1 abgeleitet.'],
  ['A4', 'A4 Risk Manager', 'Guard', 'Risiko', 'Nur eigene Risk-Entscheide. Konfiguration ist keine Entscheidung.'],
  ['A5', 'A5 Execution', 'Sniper', 'Ausführung', 'Nur eigene Ausführungsdateien. Keine D3-Backtests.'],
  ['B1', 'B1 Positions', 'Support', 'Positionen', 'Statusprüfung, keine bewertete Performance.'],
  ['B2', 'B2 Journal', 'Support', 'Journal', 'Dateiänderung ist keine Ausführung.'],
  ['B3', 'B3 Tax', 'Support', 'Steuer-Status', 'Nur Sync-Metadaten. Keine Beträge.'],
  ['C1', 'C1 Whale', 'Scout', 'Whale', 'Ereignisse aus der Whale-Datei.'],
  ['C2', 'C2 Sentiment', 'Scout', 'Sentiment', 'Nur eigene Sentiment-Checks.'],
  ['C3', 'C3 Launch Sniffer', 'Scout', 'Sniffer', 'Nur abgeschlossene Sniffer-Läufe.'],
  ['D1', 'D1 Wallet Funding', 'Infra', 'Guthaben-Check', 'Check ist keine Funding-Aktion.'],
  ['D2', 'D2 Health', 'Infra', 'Health', 'Quellenstatus, keine Agenten-Aktion.'],
  ['D3', 'D3 Backtest', 'Infra', 'Harvest', 'Runner-Zyklus, keine A5-Ausführung.'],
  ['D4', 'D4 Streitschlichter', 'Infra', 'Entscheid', 'Nur das Urteil, keine Begründung.'],
  ['D5', 'D5', 'Infra', 'D5', 'Unbekannt, bis eine eigene Telemetrie-Datei existiert.'],
  ['TRADES', 'Trades', 'Support', 'Ausführungen', 'Kein Sammelergebnis aus der Steuer. Nur ein geprüftes Buch.']
];
const ACTION = new Set(['analysis', 'risk', 'trade', 'scan', 'health', 'harvest', 'arbitration', 'journal', 'status_check', 'config_prep', 'test']);
const KIND_ALIAS = { status_read: 'status_check', config_preparation: 'config_prep', wallet_check_start: 'status_check', scan_start_reported: 'status_check', none: null, unverified_historical_action: null };
const PASSIVE = new Set(['status_check', 'config_prep', 'test', 'journal']);
const FILE_ACTION = new Set(['analysis', 'risk', 'trade', 'scan', 'health', 'harvest', 'arbitration']);
const VERDICT = new Set(['BUY', 'STRONG_BUY', 'MONITOR', 'SKIP', 'BLOCK', 'PASS', 'OK', 'ERROR']);
const STATUS = {
  waiting: 'WAITING', wartend: 'WAITING', waiting_rate_limit: 'WAITING_RATE_LIMIT', idle: 'IDLE',
  scanning: 'SCANNING', active: 'ACTIVE', degraded: 'DEGRADED', ok: 'OK', unknown: 'UNKNOWN',
  error: 'ERROR', monitoring_idle: 'MONITORING_IDLE'
};
const SECRET = /api[_-]?key|secret|token|bearer|ghp_|github_pat_|private[_-]?key|BEGIN |sk-|xox[baprs]-|\/home\/|eyJ[A-Za-z0-9_-]{8,}/i;

function build(shared, opt = {}) {
  const now = opt.now || Date.now();
  const read = f => { try { return fs.readFileSync(path.join(shared, f), 'utf8'); } catch { return null; } };
  const rows = f => (read(f) || '').split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const json = f => { try { return JSON.parse(read(f)); } catch { return null; } };
  const mtime = f => { try { return new Date(fs.statSync(path.join(shared, f)).mtimeMs).toISOString(); } catch { return null; } };
  const ms = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
  const iso = v => { const t = ms(v); return t == null ? null : new Date(t).toISOString(); };
  const screen = (s, n = 140) => {
    const t = String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || SECRET.test(t)) return null;
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  };
  const codes = a => (Array.isArray(a) ? a : []).filter(x => /^[A-Z0-9_]{1,40}$/.test(x)).slice(0, 3);
  const mintOk = m => typeof m === 'string' && m.length >= 32 && m.length <= 44 && !m.startsWith('0x');
  const coinOf = (mint, sym) => mintOk(mint) ? { mint, sym: screen(sym, 16) } : null;
  const verdictOf = v => VERDICT.has(v) ? v : null;

  const signals = rows('trading/signals-analyse.jsonl').filter(s => !s.test);
  const rug = rows('trading/rug-checks.jsonl').filter(x => !x.test);
  const liq = rows('trading/liquidity-checks.jsonl').filter(x => !x.test);
  const risk = rows('trading/risk-decisions.jsonl').filter(x => !x.test);
  const execEv = rows('trading/execution-events.jsonl');
  const execTr = rows('trading/real/closed-trades.jsonl');
  const paperTr = rows('trading/paper/paper-trades.jsonl');
  const whales = rows('trading/whale-events.jsonl');
  const sent = rows('trading/sentiment-checks.jsonl');
  const healthLog = rows('trading/health/health-log.jsonl');
  const health = json('trading/health/health-status.json');
  const hb = json('trading/backtests/runner-heartbeat.json');
  const runs = rows('trading/backtests/data/harvest/run-log.jsonl');
  const arb = rows('trading/arbitration-decisions.jsonl');
  const mon = rows('trading/monitor-events.jsonl');
  const pf = json('trading/portfolio-state.json');
  const wst = json('trading/wallet-monitor/wallet-state.json');
  const tax = json('tax/sync-status.json');
  const paperState = json('trading/backtests/paper-state.json') || {};
  const tel = loadTelemetry(shared);

  const bots = Object.fromEntries(PEERS.map(([id, name, group, title, role]) => [id, {
    id, botId: id, name, title, group, role,
    lastT: null, lastActionAt: null, observedAt: null, sourceUpdatedAt: null,
    actionKind: null, origin: null, status: 'UNKNOWN', verified: false, running: false,
    reportedLastActionAt: null,
    task: null, coin: null, reasoning: null, metrics: [], recent: [], files: []
  }]));
  const events = [];
  const pushEv = (t, bot, kind, sym, text, mint) => {
    const line = screen(text, 120);
    if (!t || !line) return;
    events.push({ t, agent: bots[bot].name, kind, sym: screen(sym, 16) || '', text: line, level: 'info', mint: mintOk(mint) ? mint : null, actionKind: kind });
  };
  const act = (id, t, kind, task, coin, file) => {
    const b = bots[id];
    if (!t) return;
    b.lastActionAt = new Date(t).toISOString();
    b.actionKind = kind;
    b.origin = 'file_event';
    b.task = screen(task, 140);
    b.coin = coin;
    b.files = file ? [file] : b.files;
    if (!PASSIVE.has(kind)) b.lastT = t;
  };

  const sA = signals.slice().sort((a, b) => (ms(b.ts) || 0) - (ms(a.ts) || 0))[0];
    if (sA && ms(sA.ts)) {
    const v = verdictOf(sA.verdict) || verdictOf(sA.status);
    act('A1', ms(sA.ts), 'analysis', `Letztes Signal ${screen(sA.symbol, 16) || 'Coin'}: ${v || 'ohne Urteil'}`, null, 'trading/signals-analyse.jsonl');
    bots.A1.reasoning = { verdict: v, badge: null, confidence: typeof sA.confidence === 'number' ? sA.confidence : null, reasons: codes(sA.reason_codes), risks: [], text: null };
    bots.A1.sourceUpdatedAt = mtime('trading/signals-analyse.jsonl');
    signals.slice(-8).reverse().forEach(s => pushEv(ms(s.ts), 'A1', 'analysis', s.symbol, `${verdictOf(s.verdict) || 'Signal'} ${codes(s.reason_codes).join(' ')}`.trim(), s.mint));
  }
  const lastRug = rug.slice().sort((a, b) => (ms(b.ts) || 0) - (ms(a.ts) || 0))[0];
  if (lastRug && ms(lastRug.ts)) {
    act('A2', ms(lastRug.ts), 'risk', `Rug-Check ${screen(lastRug.symbol, 16) || 'Coin'}: ${verdictOf(lastRug.status) || 'ohne Status'}`, coinOf(lastRug.mint, lastRug.symbol), 'trading/rug-checks.jsonl');
    bots.A2.sourceUpdatedAt = mtime('trading/rug-checks.jsonl');
  } else bots.A2.files = ['trading/rug-checks.jsonl'];
  const lastLiq = liq.slice().sort((a, b) => (ms(b.ts) || 0) - (ms(a.ts) || 0))[0];
  if (lastLiq && ms(lastLiq.ts)) {
    act('A3', ms(lastLiq.ts), 'risk', `Liquiditäts-Check ${screen(lastLiq.symbol, 16) || 'Coin'}: ${verdictOf(lastLiq.status) || 'ohne Status'}`, coinOf(lastLiq.mint, lastLiq.symbol), 'trading/liquidity-checks.jsonl');
    bots.A3.sourceUpdatedAt = mtime('trading/liquidity-checks.jsonl');
  } else bots.A3.files = ['trading/liquidity-checks.jsonl'];
  const lastRisk = risk.slice().sort((a, b) => (ms(b.ts) || 0) - (ms(a.ts) || 0))[0];
  if (lastRisk && ms(lastRisk.ts)) {
    act('A4', ms(lastRisk.ts), 'risk', `Risk-Entscheid ${screen(lastRisk.symbol, 16) || ''}`.trim(), coinOf(lastRisk.mint, lastRisk.symbol), 'trading/risk-decisions.jsonl');
    bots.A4.reasoning = { verdict: verdictOf(lastRisk.status) || verdictOf(lastRisk.decision), badge: null, confidence: null, reasons: codes(lastRisk.reason_codes), risks: [], text: null };
  } else bots.A4.files = ['trading/risk-decisions.jsonl'];

  const a5Times = [
    ...execEv.map(e => ms(e.ts)),
    ...execTr.map(e => ms(e.block_time || e.submitted_at_utc || e.ts)),
    ...paperTr.map(e => ms(e.ts_utc || e.ts))
  ].filter(Boolean);
  if (a5Times.length) {
    const t = Math.max(...a5Times);
    const kind = execEv.some(e => e.actionKind === 'test' || e.test) && !execTr.length && !paperTr.length ? 'test' : 'trade';
    act('A5', t, kind, kind === 'test' ? 'Testmarkierung, keine Ausführung' : 'Ausführungsdatei gelesen', null, 'trading/real/closed-trades.jsonl');
  } else {
    bots.A5.files = ['trading/real/closed-trades.jsonl', 'trading/paper/paper-trades.jsonl', 'trading/execution-events.jsonl'];
  }

  whales.slice(-8).reverse().forEach(w => pushEv(ms(w.logged_at_utc), 'C1', 'scan', (w.coin || '').split('@')[0], `${screen(w.aktion, 24) || screen(w.typ, 24) || 'Ereignis'}`, w.mint));
  const lastW = whales.slice().sort((a, b) => (ms(b.logged_at_utc) || 0) - (ms(a.logged_at_utc) || 0))[0];
  if (lastW && ms(lastW.logged_at_utc)) act('C1', ms(lastW.logged_at_utc), 'scan', `Whale-Ereignis ${screen((lastW.coin || '').split('@')[0], 16) || ''}`.trim(), coinOf(lastW.mint, (lastW.coin || '').split('@')[0]), 'trading/whale-events.jsonl');
  const lastS = sent.slice().sort((a, b) => (ms(b.ts_utc) || 0) - (ms(a.ts_utc) || 0))[0];
  if (lastS && ms(lastS.ts_utc)) act('C2', ms(lastS.ts_utc), 'scan', `Sentiment ${screen((lastS.token || '').replace('$', ''), 16) || 'Coin'}: ${verdictOf(lastS.verdict) || 'ohne Urteil'}`, coinOf(lastS.mint, lastS.token), 'trading/sentiment-checks.jsonl');

  let run = null;
  try {
    const dir = path.join(shared, 'trading/launch-sniffer/runs');
    const file = fs.readdirSync(dir).filter(f => /^\d{8}-\d{6}\.json$/.test(f)).sort().pop();
    if (file) run = json('trading/launch-sniffer/runs/' + file);
  } catch {}
  if (run && ms(run.abruf && run.abruf.utc)) {
    act('C3', ms(run.abruf.utc), 'scan', `Lauf beendet: ${Number.isFinite(+run.scanned_pairs) ? +run.scanned_pairs : '–'} Pairs`, null, 'trading/launch-sniffer/runs');
    bots.C3.metrics = [['Pairs im Lauf', Number.isFinite(+run.scanned_pairs) ? +run.scanned_pairs : null]];
  }
  if (wst && iso(wst.updated_at)) {
    bots.D1.observedAt = iso(wst.updated_at);
    bots.D1.actionKind = 'status_check';
    bots.D1.origin = 'file_event';
    bots.D1.task = 'Guthaben gelesen, keine Funding-Aktion';
    bots.D1.sourceUpdatedAt = mtime('trading/wallet-monitor/wallet-state.json');
    bots.D1.files = ['trading/wallet-monitor/wallet-state.json'];
  }
  if (health && iso(health.checked_at_utc)) {
    act('D2', ms(health.checked_at_utc), 'health', `Health ${String(health.overall || '').toLowerCase() === 'ok' ? 'ok' : 'degraded'}`, null, 'trading/health/health-status.json');
    bots.D2.metrics = [['Alarme', Array.isArray(health.alerts) ? health.alerts.length : null]];
  }
  const d3t = ms(hb && (hb.updated_utc || hb.last_cycle_end_utc)) || ms(runs.length ? runs[runs.length - 1].run_utc : null);
  if (d3t) act('D3', d3t, 'harvest', hb && hb.cycle_no != null ? `Zyklus ${hb.cycle_no}` : 'Harvest-Lauf', null, 'trading/backtests/runner-heartbeat.json');
  const lastArb = arb.slice().sort((a, b) => (ms(b.ts) || 0) - (ms(a.ts) || 0))[0];
  if (lastArb && ms(lastArb.ts)) {
    act('D4', ms(lastArb.ts), 'arbitration', `Urteil ${verdictOf(lastArb.final_signal) || 'ohne Signal'}`, coinOf(lastArb.mint, lastArb.token), 'trading/arbitration-decisions.jsonl');
    bots.D4.reasoning = { verdict: verdictOf(lastArb.final_signal), badge: null, confidence: null, reasons: [], risks: [], text: null };
  }
  if (pf && iso(pf.updated_at)) {
    bots.B1.observedAt = iso(pf.updated_at);
    bots.B1.actionKind = 'status_check';
    bots.B1.origin = 'file_event';
    bots.B1.task = 'Portfolio-Status gelesen';
    bots.B1.sourceUpdatedAt = mtime('trading/portfolio-state.json');
    bots.B1.files = ['trading/portfolio-state.json'];
  }
  bots.B1.metrics = [['Monitor-Events', mon.length]];
  bots.B2.sourceUpdatedAt = mtime('trading/journal/events.jsonl');
  bots.B2.files = ['trading/journal/events.jsonl'];
  const comp = completeness(tax && tax.completeness);
  if (tax) {
    bots.B3.observedAt = iso(tax.last_updated || tax.lastUpdated);
    bots.B3.actionKind = 'status_check';
    bots.B3.origin = 'file_event';
    bots.B3.task = 'Steuer-Sync gelesen, keine Beträge';
    bots.B3.files = ['tax/sync-status.json'];
  }
  bots.B3.metrics = [['Vollständigkeit', comp], ['Offene Punkte', tax && Number.isFinite(+tax.open_issues) ? +tax.open_issues : tax && Number.isFinite(+tax.openIssues) ? +tax.openIssues : null]];

  for (const [id, raw] of Object.entries(tel)) {
    const b = bots[id];
    if (!b || !raw) continue;
    b.observedAt = raw.observedAt || b.observedAt;
    if (raw.sourceUpdatedAt) b.sourceUpdatedAt = raw.sourceUpdatedAt;
    if (raw.reportedLastActionAt) b.reportedLastActionAt = raw.reportedLastActionAt;
    if (raw.status && raw.status !== 'UNKNOWN') b.status = raw.status;
    if (!b.origin) b.origin = 'self_report';
    if (raw.actionKind && b.origin !== 'file_event') b.actionKind = raw.actionKind;
    if (raw.summary && !b.task) b.task = (kindPrefix(raw.actionKind) + raw.summary).trim();
    if ((b.status === 'SCANNING' || b.status === 'WAITING_RATE_LIMIT') && id === 'A1') b.coin = null;
    b.verified = false;
    b.running = false;
  }
  for (const b of Object.values(bots)) {
    if (!b.status || b.status === 'UNKNOWN') b.status = 'UNKNOWN';
    b.recent = events.filter(e => e.agent === b.name).slice(0, 8).map(e => ({ t: e.t, kind: e.kind, sym: e.sym, mint: e.mint, text: e.text, level: e.level }));
  }

  const mode = paperState.mode === 'PAPER' || paperState.mode === 'LIVE' ? paperState.mode : null;
  const radar = ((run && run.eintraege) || []).slice(0, 14).map(e => ({
    mint: e.mint, symbol: screen(e.symbol, 16), status: screen(e.status, 24), prog: typeof e.curve?.bonding_curve_progress_pct === 'number' ? e.curve.bonding_curve_progress_pct : null
  })).filter(e => mintOk(e.mint));
  const filePulse = ['trading/signals-analyse.jsonl', 'trading/rug-checks.jsonl', 'trading/liquidity-checks.jsonl', 'trading/risk-decisions.jsonl', 'trading/execution-events.jsonl', 'trading/health/health-status.json', 'tax/sync-status.json']
    .map(f => ({ f: path.basename(f), t: ms(mtime(f)) })).filter(x => x.t);

  return {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    mode,
    execution: {
      real: { venue: 'REAL', verified: false, coverage: 'unknown', source: 'trading/real/closed-trades.jsonl', observedAt: mtime('trading/real/closed-trades.jsonl'), lastActionAt: null, closed: null, wins: null, avgHoldMs: null, grossProfitEur: null, grossLossEur: null, netEur: null },
      paper: { venue: 'PAPER', verified: false, coverage: 'unknown', source: 'trading/paper/paper-trades.jsonl', observedAt: mtime('trading/paper/paper-trades.jsonl'), lastActionAt: null, closed: null, wins: null, avgHoldMs: null, netSol: null }
    },
    positionBook: { verified: false, coverage: 'unknown', source: 'trading/positions/open.json', observedAt: mtime('trading/portfolio-state.json'), count: null },
    tax: { observedAt: iso(tax && (tax.last_updated || tax.lastUpdated)), completeness: comp, openIssues: Number.isFinite(+tax?.open_issues) ? +tax.open_issues : Number.isFinite(+tax?.openIssues) ? +tax.openIssues : null },
    perf: null,
    pnlByToken: [],
    positions: [],
    paper: null,
    pf: null,
    bots: PEERS.map(([id]) => bots[id]),
    events: events.sort((a, b) => b.t - a.t).slice(0, 160),
    flow: [],
    stages: ['Scout', 'Analyst', 'Filter', 'Guard', 'Sniper'],
    radar,
    sniffer: { scanned: run && Number.isFinite(+run.scanned_pairs) ? +run.scanned_pairs : null, at: run ? ms(run.abruf && run.abruf.utc) : null, minProgress: null },
    health: health ? { overall: String(health.overall || '').toLowerCase() === 'ok' ? 'ok' : 'degraded', at: iso(health.checked_at_utc), alerts: Array.isArray(health.alerts) ? health.alerts.length : null, sources: [] } : null,
    coins: [],
    wallets: walletAddrs(wst),
    config: {},
    counts: { signals: signals.length, blocked: signals.filter(s => s.status === 'BLOCK').length, monitor: signals.filter(s => s.verdict === 'MONITOR').length, skipBy: {} },
    filePulse,
    v4: { builtAt: now, a1: { total: signals.length, list: signals.slice(-12).reverse().map(s => ({ id: screen(s.signal_id, 40), mint: mintOk(s.mint) ? s.mint : null, symbol: screen(s.symbol, 16), t: ms(s.ts), verdict: verdictOf(s.verdict), status: verdictOf(s.status), confidence: typeof s.confidence === 'number' ? s.confidence : null, reasonCodes: codes(s.reason_codes) })) }, scouts: { c1: [], c2: [], c3: { scanNow: radar, launches: [], run: run ? { t: ms(run.abruf.utc), scanned: Number.isFinite(+run.scanned_pairs) ? +run.scanned_pairs : null } : null } }, lanes: { A1: events.filter(e => e.agent === bots.A1.name).map(e => ({ t: e.t, sym: e.sym, mint: e.mint, txt: e.text })), A2: [], A3: [], A5: events.filter(e => e.agent === bots.A5.name).map(e => ({ t: e.t, sym: e.sym, mint: e.mint, txt: e.text })) }, journeys: [] }
  };
}

function kindPrefix(kind) {
  if (kind === 'test') return 'Test: ';
  if (kind === 'status_check') return 'Status gelesen: ';
  if (kind === 'config_prep') return 'Vorbereitung: ';
  return '';
}
function completeness(v) {
  const s = String(v || '').toLowerCase();
  return s === 'complete' || s === 'partial' || s === 'incomplete' ? s : 'unknown';
}
function walletAddrs(wst) {
  const out = [];
  const take = (label, addr) => { if (typeof addr === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) out.push({ label: screenText(label) || 'Wallet', address: addr }); };
  if (wst && wst.wallets) { take('Haupt-Wallet', wst.wallets.main && wst.wallets.main.address); take('Trading-Wallet', wst.wallets.trading && wst.wallets.trading.address); }
  return out;
}
function canonId(value) {
  if (typeof value !== 'string' || !value) return null;
  const key = value.trim();
  return MAP.aliases[key] || MAP.uuids[key.toLowerCase()] || null;
}
function resolvePeer(stem, raw) {
  const fileId = canonId(stem);
  if (!fileId) return null;
  const body = raw && typeof raw === 'object' ? raw : {};
  const name = body.botId || body.peer || null;
  if (typeof name === 'string' && name.trim()) {
    const declared = canonId(name);
    if (declared !== fileId) return null;
  }
  const uuid = body.uuid || body.peerUuid || (isUuid(body.id) ? body.id : null);
  if (uuid) {
    if (canonId(uuid) !== fileId) return null;
    if (MAP.uuids[String(stem).toLowerCase()] && String(stem).toLowerCase() !== String(uuid).toLowerCase()) return null;
  }
  return fileId;
}
function isUuid(v) { return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }
function loadTelemetry(shared) {
  const dir = path.join(shared, 'dashboard-telemetry');
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return {}; }
  const out = {};
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const stem = name.slice(0, -5);
    let raw; try { raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); } catch { continue; }
    const id = resolvePeer(stem, raw);
    if (!id) continue;
    const status = mapStatus(raw.status);
    const actionKind = mapKind(raw.actionKind);
    out[id] = {
      observedAt: isoOrNull(raw.observedAt),
      sourceUpdatedAt: isoOrNull(raw.sourceUpdatedAt),
      status, actionKind,
      reportedLastActionAt: isoOrNull(raw.lastActionAt),
      summary: screenSummary(raw.summary),
      verdict: VERDICT.has(raw.verdict) ? raw.verdict : null
    };
  }
  return out;
}
function mapStatus(v) {
  const s = String(v || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return STATUS[s] || 'UNKNOWN';
}
function mapKind(v) {
  if (v == null || v === '') return null;
  if (Object.prototype.hasOwnProperty.call(KIND_ALIAS, v) && KIND_ALIAS[v] == null) return null;
  const k = KIND_ALIAS[v] || v;
  return ACTION.has(k) ? k : null;
}
function screenSummary(v) {
  if (Array.isArray(v)) return screenText(v.filter(x => typeof x === 'string').join(' · '));
  return typeof v === 'string' ? screenText(v) : null;
}
function isoOrNull(v) { const t = Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; }
function screenText(s) {
  const t = String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || SECRET.test(t)) return null;
  return t.length > 140 ? t.slice(0, 139) + '…' : t;
}
function contentHash(state) {
  const drop = new Set(['generatedAt', 'builtAt', 'receivedAt', 'uploadAt', 'ageMin']);
  const strip = o => Array.isArray(o) ? o.map(strip) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).filter(k => !drop.has(k)).sort().map(k => [k, strip(o[k])])) : o;
  return require('crypto').createHash('sha256').update(JSON.stringify(strip(state))).digest('hex');
}

if (require.main === module) {
  const shared = process.env.SHARED_DIR;
  if (!shared) { console.error('SHARED_DIR fehlt'); process.exit(1); }
  const outDir = process.env.OUT_DIR || path.join(__dirname, 'site');
  const state = build(shared);
  const raw = JSON.stringify(state);
  JSON.parse(raw);
  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, 'state.json');
  const tmp = dest + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  fs.writeFileSync(fd, raw);
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tmp, dest);
  console.log('state.json', state.generatedAt, state.bots.length);
}
module.exports = { build, contentHash, resolvePeer, PEERS };
