// Browser check: a real config, an API 403, and the public raw file.
// The bundled state.json is the old tax snapshot, so a passing run cannot
// be explained by only replacing that file.
import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const puppeteer = createRequire('/tmp/ppt/package.json')('puppeteer-core');
const oldBundled = readFileSync('/tmp/repo-e033/state.json');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  if (path === '/state.json') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=600' });
    res.end(oldBundled);
    return;
  }
  const file = join(root, path === '/' ? 'index.html' : path.replace(/^\//, '').split('?')[0]);
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('missing');
  }
});
await new Promise(resolve => server.listen(8774, '127.0.0.1', resolve));

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
const hits = [];
let rawMode = 'live';
let newer = null;
await page.setRequestInterception(true);
page.on('request', req => {
  const u = req.url();
  if (u.includes('api.github.com') && u.includes('/contents/state.json')) {
    hits.push({ kind: 'api', t: Date.now() });
    req.respond({
      status: 403,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600)
      },
      body: JSON.stringify({ message: 'API rate limit exceeded' })
    }).catch(() => {});
    return;
  }
  if (u.includes('raw.githubusercontent.com') && u.includes('/data/state.json')) {
    hits.push({ kind: 'raw', t: Date.now(), mode: rawMode });
    if (rawMode === 'live') { req.continue().catch(() => {}); return; }
    req.respond({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }, body: newer }).catch(() => {});
    return;
  }
  if (/solana|binance|hyperliquid|dexscreener/.test(u)) { req.abort().catch(() => {}); return; }
  req.continue().catch(() => {});
});

const fail = [];
try {
  await page.goto('http://127.0.0.1:8774/#bots', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const s = window.__snap && window.__snap();
    return s && s.bots && s.bots.length === 18 && (s.wallets || []).some(w => w.address && w.address.startsWith('5rmheY'));
  }, { timeout: 20000 });
  await page.click('#nav button[data-v=bil]');
  await page.waitForSelector('#bilanz [data-k=unverified]');
  const first = await page.evaluate(() => {
    const s = window.__snap();
    const by = Object.fromEntries(s.bots.map(b => [b.id, b]));
    return {
      chip: document.querySelector('#chipBot span').textContent,
      at: s.generatedAt,
      n: document.querySelectorAll('.bot').length,
      trading: s.wallets.find(w => w.label.startsWith('Trading')).address,
      walletText: document.querySelector('[data-w]') ? [...document.querySelectorAll('[data-w]')].map(e => e.textContent) : [],
      a1: document.querySelector('.bot[data-id="A1"] .ago')?.textContent || '',
      activeMissing: ['MAIN', 'B1', 'B3', 'C1', 'D2', 'D3', 'D4', 'TRADES'].filter(id => (document.querySelector(`.bot[data-id="${id}"] .stt`)?.textContent || '') === 'AKTIV'),
      running: s.bots.filter(b => b.running === true).length,
      bilanz: document.querySelector('#bilanz')?.innerText || '',
      script: [...document.scripts].some(x => x.src.includes('app.js?v=8'))
    };
  });
  if (!first.script) fail.push('cache key is not v=8');
  if (first.at === '2026-11-05T17:17:10.042Z') fail.push('still the bundled 18:17 snapshot');
  if (!first.chip.includes('Export frisch')) fail.push('chip ' + first.chip);
  if (first.chip.includes('Bot-Daten LIVE')) fail.push('bots labeled live');
  if (first.n !== 18) fail.push('cards ' + first.n);
  if (!first.trading.startsWith('5rmheY')) fail.push('wallet ' + first.trading);
  if (first.trading.includes('GgSy')) fail.push('old wallet kept');
  if (first.walletText.some(t => /^0[,.]0000/.test(t))) fail.push('zero balance before a reading ' + first.walletText.join('|'));
  if (!/beobachtet|Aktion|Quelle|gemeldet|historisch/.test(first.a1)) fail.push('A1 clocks ' + first.a1);
  if (first.activeMissing.length || first.running !== 0) fail.push('missing peers shown active');
  if (first.bilanz.includes('-0,67') || first.bilanz.includes('-0.67')) fail.push('tax amount visible');
  const liveAt = first.at;
  const live = JSON.parse(await (await fetch('https://raw.githubusercontent.com/fynnabi15-lang/live-dashboard/data/state.json')).text());
  newer = JSON.stringify(Object.assign({}, live, { generatedAt: new Date(Date.now() - 20000).toISOString() }));
  rawMode = 'next';
  const started = Date.now();
  await page.waitForFunction(stamp => window.__snap().generatedAt !== stamp, { timeout: 80000 }, liveAt);
  const waited = Date.now() - started;
  const after = await page.evaluate(() => ({ at: window.__snap().generatedAt, chip: document.querySelector('#chipBot span').textContent, trading: window.__snap().wallets.find(w => w.label.startsWith('Trading')).address }));
  const api = hits.filter(h => h.kind === 'api').length;
  const raw = hits.filter(h => h.kind === 'raw').length;
  if (api !== 1) fail.push('api calls ' + api + ' (a 403 must not be retried inside the pause)');
  if (raw < 2) fail.push('raw calls ' + raw);
  if (after.at === liveAt) fail.push('newer raw body was not applied after ' + waited + 'ms');
  if (!after.trading.startsWith('5rmheY')) fail.push('wallet lost after refresh');
  if (!after.chip.includes('Export frisch') && !after.chip.includes('Stream frisch')) fail.push('chip after refresh ' + after.chip);
  const firstRaw = hits.find(h => h.kind === 'raw').t;
  const remain = 76000 - (Date.now() - firstRaw);
  if (remain > 0) await new Promise(r => setTimeout(r, remain));
  const lateRaw = hits.filter(h => h.kind === 'raw' && h.t - firstRaw >= 70000).length;
  const lateApi = hits.filter(h => h.kind === 'api').length;
  const held = await page.evaluate(() => ({ at: window.__snap().generatedAt, trading: window.__snap().wallets.find(w => w.label.startsWith('Trading')).address, n: window.__snap().bots.length }));
  if (lateRaw < 1) fail.push('no raw fetch after 70s; the tab stayed on the cached response');
  if (lateApi !== 1) fail.push('API was called again during the rate-limit pause: ' + lateApi);
  if (!held.trading.startsWith('5rmheY') || held.n !== 18 || held.at === '2026-11-05T17:17:10.042Z') fail.push('tab fell back to the bundled snapshot ' + JSON.stringify(held));
  console.log(JSON.stringify({ first, after, waited, api, raw, lateRaw, held, hits: hits.map(h => h.kind + ':' + (h.mode || '')) }, null, 2));
} catch (e) {
  fail.push(e.stack || e.message);
} finally {
  await browser.close();
  server.close();
}
if (fail.length) {
  console.error(fail.join('\n'));
  process.exit(1);
}
console.log('raw fallback ok');
