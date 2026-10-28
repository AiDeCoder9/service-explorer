import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// Browser checks over the Chrome DevTools protocol. No test framework or browser download needed.
// Start the app first (npm run build && npm start -- -p 3100), then: npm run e2e
// Env: BASE_URL (default http://localhost:3100), CHROME_PATH (default: macOS Google Chrome).
const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const chrome = spawn(process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--remote-debugging-port=9333', '--user-data-dir=/tmp/e2e-profile-' + Date.now(), '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });

let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch('http://127.0.0.1:9333/json')).json(); if (targets.find((t) => t.type === 'page')) break; } catch {}
  await sleep(250);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails)); return r.result.result.value; };
const waitFor = async (expr, label, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(expr)) return Date.now() - t; await sleep(40); } throw new Error('timeout: ' + label); };
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const nav = async (path) => { await send('Page.navigate', { url: BASE + path }); await sleep(300); };
const countText = () => ev(`document.querySelector('.count-line')?.textContent ?? ''`);
const ready = (label = 'ready') => waitFor(`/services/.test(document.querySelector('.count-line')?.textContent ?? '')`, label);
const clickLabel = (text, scope = '.sidebar') => ev(`(() => { const l = [...document.querySelectorAll(${JSON.stringify(scope + ' .opt label')})].find((x) => x.querySelector('.opt-label')?.childNodes[0]?.textContent.trim() === ${JSON.stringify(text)}); if (!l) return false; l.querySelector('input').click(); return true; })()`);

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });` });

// A. initial load from URL
await nav('/?place=city:Bangkok&type=package');
const skeleton = await ev(`!!document.querySelector('.skeleton')`);
const t = await ready();
const first = await countText();
check('A1 loads filtered view from URL (skeleton first, then results)', skeleton && /31 services/.test(first), `${first.trim()} after ${t}ms`);
check('A2 no horizontal overflow at 1280', await ev(`document.documentElement.scrollWidth <= innerWidth`));

// B. filter click -> URL -> back/forward restore
const t0 = await ev(`(async () => { const before = document.querySelector('.count-line').textContent; const s = performance.now(); [...document.querySelectorAll('.sidebar .opt label')].find((x) => x.textContent.startsWith('Lab tests')).querySelector('input').click(); while (document.querySelector('.count-line').textContent === before) await new Promise((r) => requestAnimationFrame(r)); return performance.now() - s; })()`);
await sleep(300);
const url1 = await ev('location.search');
const afterLab = await countText();
check('B1 filter updates URL and results', /type=lab_test%2Cpackage|type=package%2Clab_test|type=lab_test/.test(url1) && afterLab !== first, `${url1}  -> ${afterLab.trim()}`);
check('B2 filter click to updated results under 100ms', t0 < 100, `${t0.toFixed(1)}ms`);
await ev('history.back()'); await sleep(500);
check('B3 back button restores previous view', (await countText()) === first && !(await ev('location.search')).includes('lab_test'));
await ev('history.forward()'); await sleep(500);
check('B4 forward button restores next view', (await countText()) === afterLab);

// C. typing
await nav('/'); await ready();
await ev(`document.getElementById('q').focus()`);
const typed = await ev(`(async () => { const i = document.getElementById('q'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const s = performance.now(); let worst = 0; for (const ch of 'thyroid') { const a = performance.now(); set.call(i, i.value + ch); i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); worst = Math.max(worst, performance.now() - a); } return worst; })()`);
await waitFor(`location.search.includes('q=thyroid')`, 'q in url');
check('C1 typing: worst per-keystroke time', typed < 50, `${typed.toFixed(1)}ms; URL follows: ${await ev('location.search')}`);
check('C2 search results change', /services/.test(await countText()) && (await countText()) !== first);

// D. empty state
await nav('/?q=zzzzzz'); await ready();
const emptyTitle = await ev(`document.querySelector('.state h2')?.textContent`);
const suggest = await ev(`[...document.querySelectorAll('.suggest .btn')].map((b) => b.textContent.trim())`);
check('D1 empty state offers a way out', /No services match/.test(emptyTitle) && suggest.length >= 2, JSON.stringify(suggest));
await ev(`document.querySelector('.suggest .btn').click()`); await sleep(500);
check('D2 removing the filter restores results', (await ev('location.search')) === '' && /services/.test(await countText()) && !/^0 /.test(await countText()));

// E. error + retry
await send('Network.setCookie', { name: 'mock-fail', value: '1', url: BASE });
await nav('/');
await waitFor(`!!document.querySelector('.state[role=alert]')`, 'error state');
check('E1 API failure shows error state with retry', await ev(`!!document.querySelector('.state .btn.primary')`));
await send('Network.deleteCookies', { name: 'mock-fail', url: BASE });
await ev(`document.querySelector('.state .btn.primary').click()`);
await ready('after retry');
check('E2 retry recovers', /services/.test(await countText()));

// F. mobile drawer
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await nav('/'); await ready();
check('F1 mobile: sidebar hidden, filters button shown', await ev(`getComputedStyle(document.querySelector('.sidebar')).display === 'none' && getComputedStyle(document.querySelector('.filters-btn')).display !== 'none'`));
check('F2 mobile: no horizontal overflow at 390', await ev(`document.documentElement.scrollWidth <= innerWidth`), `scrollWidth ${await ev('document.documentElement.scrollWidth')} vs ${await ev('innerWidth')}`);
await ev(`document.querySelector('.filters-btn').click()`);
await waitFor(`!!document.querySelector('.drawer[open]')`, 'drawer open');
const btn0 = await ev(`document.querySelector('.drawer-foot .btn').textContent`);
await clickLabel('Lab tests', '.drawer[open]'); await sleep(200);
const btn1 = await ev(`document.querySelector('.drawer-foot .btn').textContent`);
check('F3 drawer button shows pending count before applying', /Show [\d,]+ results/.test(btn1) && btn0 !== btn1, `${btn0} -> ${btn1}; URL still "${await ev('location.search')}"`);
await ev(`document.querySelector('.drawer-foot .btn').click()`); await sleep(600);
check('F4 apply updates URL and closes drawer', (await ev('location.search')).includes('lab_test') && !(await ev(`!!document.querySelector('.drawer[open]')`)));
await send('Emulation.clearDeviceMetricsOverride');

// G. layout shift over the session
const cls = await ev('window.__cls');
check('G1 cumulative layout shift stays tiny', cls < 0.1, `CLS ${cls.toFixed(4)}`);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
ws.close(); chrome.kill(); process.exit(results.every(Boolean) ? 0 : 1);
