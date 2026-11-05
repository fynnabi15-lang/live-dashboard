const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build, contentHash, resolvePeer } = require('./export-state-safe');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-export-'));
  const put = (rel, body) => {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, typeof body === 'string' ? body : JSON.stringify(body));
  };
  put('trading/signals-analyse.jsonl', JSON.stringify({
    ts: '2026-11-05T18:00:00Z', symbol: 'DNUT', mint: 'MintMintMintMintMintMintMintMintMint',
    verdict: 'MONITOR', status: 'BLOCK', confidence: 30, reason_codes: ['LIQUIDITY_TOO_LOW'], test: false
  }) + '\n');
  put('trading/backtests/paper-trades.jsonl', JSON.stringify({
    ts_utc: '2026-11-05T18:10:00Z', symbol: 'PAPER', mint: 'MintMintMintMintMintMintMintMintMint', status: 'SKIPPED', reason: 'VERDICT_NOT_BUY'
  }) + '\n');
  put('trading/backtests/runner-heartbeat.json', { updated_utc: '2026-11-05T18:20:00Z', cycle_no: 9, last_cycle_ok: true });
  put('tax/tax-ledger.csv', 'realized_result_eur,mint_address,symbol\n-0.67,MintMintMintMintMintMintMintMintMint,USDC\n');
  put('tax/fifo-lots.json', { open_lots: { w: { TOK: [{ remaining: 5, cost_eur_per_unit: 2, mint: 'MintMintMintMintMintMintMintMintMint' }] } } });
  put('tax/sync-status.json', { last_updated: '2026-11-04T20:15:08Z', completeness: 'INCOMPLETE', open_issues: 84, wallets: [{ wallet_label: 'Phantom', signatures_in_scope: 90 }] });
  put('dashboard-telemetry/A2.json', { botId: 'A2', status: 'IDLE', actionKind: 'status_check', observedAt: '2026-11-05T18:30:00Z', lastActionAt: null, summary: 'idle' });
  put('dashboard-telemetry/11111111-1111-4111-8111-111111111111.json', { botId: 'D5', status: 'ACTIVE', actionKind: 'analysis', lastActionAt: '2026-11-05T18:40:00Z', summary: 'should not attach' });
  put('dashboard-telemetry/D5.json', { botId: 'D5', status: 'IDLE', actionKind: 'status_check', observedAt: '2026-11-05T18:34:00Z', lastActionAt: '2026-11-04T18:29:12Z', summary: 'status only' });
  put('dashboard-telemetry/A5.json', { botId: 'A5', status: 'IDLE', actionKind: 'test', observedAt: '2026-11-05T18:34:52Z', lastActionAt: '2026-11-05T18:32:31Z', summary: 'ghp_notARealTokenButLooksSecret' });
  put('telemetry/A3.json', { botId: 'A3', status: 'ACTIVE', actionKind: 'analysis', lastActionAt: '2026-11-05T18:41:00Z', summary: 'wrong directory' });
  return dir;
}

const A1U = '241d7e32-e446-4528-b814-ecfe08d3501f';
const D5U = '07ab2ce6-4a25-4c6c-86ac-1cef1569c335';

test('trusted filename and uuid must name the same peer', () => {
  assert.equal(resolvePeer('A1', { botId: 'A1', uuid: A1U }), 'A1');
  assert.equal(resolvePeer(A1U, { botId: 'A1', peerUuid: A1U }), 'A1');
  assert.equal(resolvePeer('Main', { botId: 'Main' }), 'MAIN');
  assert.equal(resolvePeer('trades', { botId: 'trades' }), 'TRADES');
  assert.equal(resolvePeer('A1', { botId: 'A1', uuid: D5U }), null);
  assert.equal(resolvePeer(A1U, { botId: 'A3' }), null);
  assert.equal(resolvePeer('notes', { botId: 'A1', uuid: A1U }), null);
  assert.equal(resolvePeer('A2', { botId: 'A1' }), null);
  assert.equal(resolvePeer('11111111-1111-4111-8111-111111111111', { botId: 'D5' }), null);
});

test('projection does not invent or leak', () => {
  const state = build(fixture(), { now: Date.parse('2026-11-05T19:00:00Z') });
  const by = Object.fromEntries(state.bots.map(b => [b.id, b]));
  assert.equal(state.bots.length, 18);
  assert.equal(by.A1.lastActionAt, '2026-11-05T18:00:00.000Z');
  assert.equal(by.A1.actionKind, 'analysis');
  assert.equal(by.A2.lastActionAt, null);
  assert.notEqual(by.A2.lastActionAt, by.A1.lastActionAt);
  assert.equal(by.A2.actionKind, 'status_check');
  assert.equal(by.A3.lastActionAt, null);
  assert.equal(by.A3.task, null);
  assert.equal(by.A5.lastT, null);
  assert.equal(by.A5.actionKind, 'test');
  assert.equal(by.A5.lastT, null);
  assert.notEqual(by.A5.lastActionAt, '2026-11-05T18:20:00.000Z');
  assert.equal(by.D3.actionKind, 'harvest');
  assert.equal(by.D3.lastActionAt, '2026-11-05T18:20:00.000Z');
  assert.equal(by.D3.running, false);
  assert.equal(by.MAIN.status, 'UNKNOWN');
  assert.equal(by.MAIN.task, null);
  assert.equal(by.MAIN.lastActionAt, null);
  assert.equal(by.TRADES.status, 'UNKNOWN');
  assert.equal(by.B1.status === 'UNKNOWN' || by.B1.actionKind === 'status_check', true);
  assert.equal(by.D5.lastT, null);
  assert.equal(by.D5.actionKind, 'status_check');
  assert.equal(by.D5.lastActionAt, null);
  assert.equal(by.A5.task, null);
  assert.equal(by.A1.coin, null);
  assert.equal(by.A1.running, false);
  assert.equal(state.perf, null);
  assert.deepEqual(state.pnlByToken, []);
  assert.deepEqual(state.positions, []);
  assert.equal(state.execution.real.closed, null);
  assert.equal(state.execution.real.verified, false);
  assert.equal(state.execution.real.coverage, 'unknown');
  assert.equal(state.tax.completeness, 'incomplete');
  assert.equal(state.tax.openIssues, 84);
  const blob = JSON.stringify(state);
  assert.equal(blob.includes('realized_result'), false);
  assert.equal(blob.includes('cost_eur'), false);
  assert.equal(blob.includes('fifo'), false);
  assert.equal(blob.includes('/home/'), false);
  assert.equal(blob.includes('ghp_'), false);
  assert.equal(blob.includes('Phantom'), false);
  const dir = fixture();
  const first = build(dir, { now: Date.parse('2026-11-05T19:00:00Z') });
  const again = build(dir, { now: Date.parse('2026-11-05T19:05:00Z') });
  assert.notEqual(first.generatedAt, again.generatedAt);
  assert.equal(contentHash(first), contentHash(again));
});

test('raw telemetry without actionKind does not become an action', () => {
  const dir = fixture();
  const raw = {
    A1: { schemaVersion: 1, botId: 'A1', uuid: A1U, observedAt: '2026-11-05T19:44:28Z', lastActionAt: '2026-11-05T19:44:28Z', sourceUpdatedAt: '2026-11-05T19:33:26Z', status: 'SCANNING', summary: ['scan claimed', 'not a target'], coin: { symbol: 'DNUT', mint: 'MintMintMintMintMintMintMintMintMint' }, sourceRefs: ['/home/box/private'] },
    A3: { schemaVersion: 1, botId: 'A3', observedAt: '2026-11-05T19:35:21Z', lastActionAt: '2026-11-05T19:35:21Z', sourceUpdatedAt: '2026-11-04T21:15:21Z', status: 'idle', summary: 'status only' },
    A4: { schemaVersion: 1, botId: 'A4', observedAt: '2026-11-05T19:34:08Z', lastActionAt: '2026-11-05T18:49:38Z', sourceUpdatedAt: '2026-11-05T19:31:14Z', status: 'WAITING', summary: 'prep' },
    A5: { schemaVersion: 1, botId: 'A5', observedAt: '2026-11-05T19:34:52Z', lastActionAt: '2026-11-05T19:32:31Z', sourceUpdatedAt: '2026-11-05T19:32:31Z', status: 'idle', summary: 'test alarm' },
    C3: { schemaVersion: 1, botId: 'C3', observedAt: '2026-11-05T19:39:30Z', lastActionAt: '2026-11-05T19:37:32Z', sourceUpdatedAt: '2026-11-05T19:37:53Z', status: 'idle', summary: ['completed run', { secret: true }] },
    D1: { schemaVersion: 1, botId: 'D1', observedAt: '2026-11-05T19:15:30Z', lastActionAt: '2026-11-05T19:15:30Z', sourceUpdatedAt: '2026-11-05T19:15:30Z', status: 'monitoring_idle', summary: 'check start' },
    A2: { schemaVersion: 1, botId: 'A2', observedAt: '2026-11-05T19:34:50Z', lastActionAt: null, sourceUpdatedAt: '2026-11-04T18:11:53Z', status: 'wartend', summary: 'no rug action' }
  };
  for (const [id, body] of Object.entries(raw)) fs.writeFileSync(path.join(dir, 'dashboard-telemetry', id + '.json'), JSON.stringify(body));
  const by = Object.fromEntries(build(dir, { now: Date.parse('2026-11-05T19:46:00Z') }).bots.map(b => [b.id, b]));
  for (const id of ['A3', 'A4', 'A5', 'D1', 'C3']) assert.equal(by[id].lastT, null, id);
  assert.equal(by.A3.actionKind, null);
  assert.equal(by.A4.actionKind, null);
  assert.equal(by.A5.actionKind, null);
  assert.equal(by.A1.status, 'SCANNING');
  assert.equal(by.A1.coin, null);
  assert.equal(by.A1.lastActionAt, '2026-11-05T18:00:00.000Z');
  assert.equal(by.A1.running, false);
  assert.equal(by.A2.status, 'WAITING');
  assert.equal(by.D1.status, 'MONITORING_IDLE');
  assert.equal(by.C3.task.includes('secret'), false);
  assert.equal(by.MAIN.status, 'UNKNOWN');
  assert.equal(by.B3.status, 'UNKNOWN');
  assert.equal(by.TRADES.lastActionAt, null);
});

const UUIDS = {
  A1: '241d7e32-e446-4528-b814-ecfe08d3501f',
  A2: '1648ef7a-6ad7-4704-a362-b11c901e4ebb',
  A3: '895ed8ca-e176-4828-b483-2f78e29425b2',
  A4: 'e90209bd-abe4-4fae-a172-a7301a3e8bda',
  A5: '3dc22641-d6c2-466a-ab7f-f91ef973695d',
  B2: '8f501974-5d4a-41b9-98ed-25477340882f',
  C2: 'e55514c7-aed4-44a1-b9af-4c34397706c4',
  C3: '09aa8032-2f1e-4041-9c84-07f714946395',
  D1: '8e52d2a5-05fa-424f-abca-a87d386000bb',
  D5: '07ab2ce6-4a25-4c6c-86ac-1cef1569c335'
};

test('entrypoint reads dashboard-telemetry and real wallet files', () => {
  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-shared-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-work-'));
  const put = (rel, body) => {
    const dest = path.join(shared, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, typeof body === 'string' ? body : JSON.stringify(body));
  };
  const mint = 'MintMintMintMintMintMintMintMintMint';
  put('trading/wallet-monitor/wallet-state.json', {
    wallets: {
      main: { address: '11111111111111111111111111111112', sol: 12.345678 },
      trading: { address: '11111111111111111111111111111113', lamports: 999 }
    }
  });
  put('trading/signals-analyse.jsonl', JSON.stringify({
    ts: '2026-11-05T18:00:00Z', symbol: 'DNUT', mint, verdict: 'MONITOR', confidence: 30, reason_codes: ['LIQUIDITY_TOO_LOW']
  }) + '\n');
  put('trading/liquidity-checks.jsonl', '');
  put('trading/risk-decisions.jsonl', '');
  put('trading/execution-events.jsonl', '');
  put('trading/real/closed-trades.jsonl', '');
  put('trading/paper/paper-trades.jsonl', '');
  put('trading/portfolio-state.json', { sol: 4.25, updated_at: null });
  put('tax/tax-ledger.csv', 'realized_result_eur\n-0.67\n');
  put('tax/fifo-lots.json', { open_lots: { cost_eur_per_unit: 2 } });
  put('telemetry/A3.json', { botId: UUIDS.A3, status: 'ACTIVE', actionKind: 'trade', lastActionAt: '2026-11-05T19:35:21Z', summary: 'wrong directory' });
  const rows = {
    A1: { status: 'SCANNING', observedAt: '2026-11-05T19:44:28Z', lastActionAt: '2026-11-05T19:44:28Z', sourceUpdatedAt: '2026-11-05T19:33:26Z', summary: ['scan claimed'], coin: { symbol: 'DNUT', mint } },
    A2: { status: 'wartend', observedAt: '2026-11-05T19:34:50Z', lastActionAt: null, sourceUpdatedAt: '2026-11-04T18:11:53Z', summary: 'waiting' },
    A3: { status: 'idle', observedAt: '2026-11-05T19:35:21Z', lastActionAt: '2026-11-05T19:35:21Z', sourceUpdatedAt: '2026-11-04T21:15:21Z', summary: 'status only' },
    A4: { status: 'WAITING', observedAt: '2026-11-05T19:34:08Z', lastActionAt: '2026-11-05T18:49:38Z', sourceUpdatedAt: '2026-11-05T19:31:14Z', summary: 'prep' },
    A5: { status: 'idle', observedAt: '2026-11-05T19:34:52Z', lastActionAt: '2026-11-05T19:32:31Z', sourceUpdatedAt: '2026-11-05T19:32:31Z', summary: 'test alarm' },
    B2: { status: 'IDLE', observedAt: '2026-11-05T19:35:02Z', lastActionAt: '2026-11-04T19:45:00Z', sourceUpdatedAt: '2026-11-04T21:03:35Z', summary: 'journal' },
    C2: { status: 'idle', observedAt: '2026-11-05T18:34:50Z', lastActionAt: null, sourceUpdatedAt: '2026-11-04T17:17:43Z', summary: 'sentiment' },
    C3: { status: 'idle', observedAt: '2026-11-05T19:39:30Z', lastActionAt: '2026-11-05T19:37:32Z', sourceUpdatedAt: '2026-11-05T19:37:53Z', summary: ['completed run', { secret: true }] },
    D1: { status: 'monitoring_idle', observedAt: '2026-11-05T19:15:30Z', lastActionAt: '2026-11-05T19:15:30Z', sourceUpdatedAt: '2026-11-05T19:15:30Z', summary: 'check start' },
    D5: { status: 'idle', observedAt: '2026-11-05T18:34:03Z', lastActionAt: '2026-11-04T17:29:12Z', sourceUpdatedAt: null, summary: 'historical' }
  };
  for (const [id, body] of Object.entries(rows)) {
    put('dashboard-telemetry/' + UUIDS[id] + '.json', Object.assign({ schemaVersion: 1, botId: UUIDS[id], sourceRefs: ['/home/box/private'] }, body));
  }
  put('dashboard-telemetry/notes.json', { botId: UUIDS.A1, status: 'ACTIVE', actionKind: 'trade', summary: 'unrelated filename' });
  const ran = spawnSync(process.execPath, [path.join(__dirname, 'export-state-safe.js')], {
    cwd: work,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, SHARED_DIR: shared, OUT_DIR: 'scratch' },
    encoding: 'utf8'
  });
  assert.equal(ran.status, 0, ran.stderr || ran.stdout);
  const state = JSON.parse(fs.readFileSync(path.join(work, 'scratch', 'state.json'), 'utf8'));
  const by = Object.fromEntries(state.bots.map(b => [b.id, b]));
  assert.equal(state.bots.length, 18);
  assert.equal(Object.keys(UUIDS).filter(id => by[id].observedAt).length, 10);
  assert.deepEqual(state.wallets.map(w => w.address).sort(), ['11111111111111111111111111111112', '11111111111111111111111111111113']);
  assert.equal(state.wallets.every(w => typeof w.label === 'string' && typeof w.address === 'string'), true);
  assert.equal(by.A1.coin, null);
  assert.equal(by.A1.running, false);
  assert.equal(by.A1.status, 'SCANNING');
  assert.equal(by.A1.lastActionAt, '2026-11-05T18:00:00.000Z');
  assert.equal(by.A1.reportedLastActionAt, '2026-11-05T19:44:28.000Z');
  for (const id of ['A3', 'A4', 'A5']) {
    assert.equal(by[id].lastT, null, id);
    assert.equal(by[id].actionKind, null, id);
    assert.equal(by[id].lastActionAt, null, id);
  }
  assert.equal(by.A3.reportedLastActionAt, '2026-11-05T19:35:21.000Z');
  assert.equal(by.A3.status, 'IDLE');
  assert.notEqual(by.A3.task, 'wrong directory');
  for (const id of ['MAIN', 'B1', 'B3', 'C1', 'D2', 'D3', 'D4', 'TRADES']) assert.equal(by[id].status, 'UNKNOWN', id);
  assert.equal(state.execution.real.verified, false);
  assert.equal(state.execution.real.closed, null);
  assert.equal(state.execution.real.coverage, 'unknown');
  assert.equal(state.execution.paper.verified, false);
  assert.equal(state.execution.paper.netSol, null);
  assert.equal(state.perf, null);
  assert.equal(state.paper, null);
  assert.equal(state.pf, null);
  assert.deepEqual(state.pnlByToken, []);
  assert.deepEqual(state.positions, []);
  assert.equal(typeof state.generatedAt, 'string');
  assert.equal(Array.isArray(state.events), true);
  assert.equal(Array.isArray(state.flow), true);
  assert.equal(Array.isArray(state.stages), true);
  assert.equal(Array.isArray(state.radar), true);
  assert.equal(typeof state.sniffer.scanned === 'number' || state.sniffer.scanned === null, true);
  assert.equal('minProgress' in state.sniffer, true);
  assert.equal(Array.isArray(state.v4.a1.list), true);
  assert.equal(Array.isArray(state.counts.skipBy) || typeof state.counts.skipBy === 'object', true);
  const blob = JSON.stringify(state);
  assert.equal(blob.includes('12.345678'), false);
  assert.equal(blob.includes('realized_result'), false);
  assert.equal(blob.includes('cost_eur'), false);
  assert.equal(blob.includes('/home/'), false);
  assert.equal(blob.includes('wrong directory'), false);
});
