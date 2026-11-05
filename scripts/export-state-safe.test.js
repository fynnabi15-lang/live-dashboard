const test = require('node:test');
const assert = require('node:assert/strict');
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
  put('telemetry/A2.json', { botId: 'A2', status: 'IDLE', actionKind: 'status_check', observedAt: '2026-11-05T18:30:00Z', lastActionAt: null, summary: 'idle' });
  put('telemetry/11111111-1111-4111-8111-111111111111.json', { botId: 'D5', status: 'ACTIVE', actionKind: 'analysis', lastActionAt: '2026-11-05T18:40:00Z', summary: 'should not attach' });
  put('telemetry/D5.json', { botId: 'D5', status: 'IDLE', actionKind: 'status_check', observedAt: '2026-11-05T18:34:00Z', lastActionAt: '2026-11-04T18:29:12Z', summary: 'status only' });
  put('telemetry/A5.json', { botId: 'A5', status: 'IDLE', actionKind: 'test', observedAt: '2026-11-05T18:34:52Z', lastActionAt: '2026-11-05T18:32:31Z', summary: 'ghp_notARealTokenButLooksSecret' });
  return dir;
}

test('aliases and unknown uuids', () => {
  assert.equal(resolvePeer('A1'), 'A1');
  assert.equal(resolvePeer('Umsätzte'), 'TRADES');
  assert.equal(resolvePeer('11111111-1111-4111-8111-111111111111'), null);
  assert.equal(resolvePeer('A2', 'A1'), null);
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
  assert.notEqual(by.A5.lastActionAt, '2026-11-05T18:20:00.000Z');
  assert.equal(by.D3.actionKind, 'harvest');
  assert.equal(by.D3.lastActionAt, '2026-11-05T18:20:00.000Z');
  assert.equal(by.MAIN.status, 'UNKNOWN');
  assert.equal(by.MAIN.task, null);
  assert.equal(by.MAIN.lastActionAt, null);
  assert.equal(by.TRADES.status, 'UNKNOWN');
  assert.equal(by.D5.actionKind, 'status_check');
  assert.equal(by.D5.lastT, null);
  assert.equal(by.D5.lastActionAt, '2026-11-04T18:29:12.000Z');
  assert.equal(by.A5.task, null);
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
