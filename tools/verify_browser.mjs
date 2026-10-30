/* verify_browser.mjs — 无头 Edge + CDP 驱动，做渲染与交互验收。
   V4 渲染完整（两视口无横向溢出）、V5 交互有效（拖滑块 KPI 必变）、
   V6 控制台干净、V8 离线可开（无外部请求）。
   用法：node tools/verify_browser.mjs
*/
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SHOTS = path.join(ROOT, 'tools', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const userDir = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'museum-cdp-' + Date.now());
fs.mkdirSync(userDir, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- 启动无头 Edge ----------
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars=false', '--window-size=1440,900',
  `--user-data-dir=${userDir}`, '--remote-debugging-port=0', 'about:blank'
], { stdio: 'ignore' });

async function waitPort() {
  const f = path.join(userDir, 'DevToolsActivePort');
  for (let i = 0; i < 150; i++) {
    if (fs.existsSync(f)) {
      const txt = fs.readFileSync(f, 'utf8').trim().split('\n');
      if (txt[0]) return parseInt(txt[0], 10);
    }
    await sleep(100);
  }
  throw new Error('DevToolsActivePort 没出现');
}

// ---------- 极简 CDP 客户端（Node 24 自带 WebSocket）----------
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = {};
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method) {
        (this.handlers[m.method] || []).forEach(f => f(m.params));
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) { (this.handlers[method] = this.handlers[method] || []).push(fn); }
}

const report = { V4: [], V5: [], V6: [], V8: null, shots: [] };
let browser;

try {
  const port = await waitPort();
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  if (!page) throw new Error('没有 page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new CDP(ws);
  browser = { ws, cdp, port };

  const consoleErrors = [], consoleWarns = [], exceptions = [], netUrls = [];
  cdp.on('Runtime.consoleAPICalled', (p) => {
    const txt = (p.args || []).map(a => a.value ?? a.description ?? '').join(' ');
    if (p.type === 'error') consoleErrors.push(txt);
    if (p.type === 'warning') consoleWarns.push(txt);
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    exceptions.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
  });
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error') consoleErrors.push(p.entry.text + ' ' + (p.entry.url || ''));
  });
  cdp.on('Network.requestWillBeSent', (p) => netUrls.push(p.request.url));

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const loaded = new Promise(res => cdp.on('Page.loadEventFired', res));
  await cdp.send('Page.navigate', { url: PAGE_URL });
  await loaded;
  await sleep(1200);

  const evalJs = async (expression, awaitPromise = false) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error('页面执行出错: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };

  // ---------- 结构 ----------
  const shape = JSON.parse(await evalJs(`JSON.stringify({
    exhibits: document.querySelectorAll('.exhibit').length,
    halls: document.querySelectorAll('.hall').length,
    charts: document.querySelectorAll('.chart-svg').length,
    bodyReady: document.body.classList.contains('ready'),
    total: document.getElementById('total').textContent
  })`));
  if (shape.exhibits !== 20) report.V4.push(`展品数 ${shape.exhibits} ≠ 20`);
  if (shape.charts !== 20) report.V4.push(`图表数 ${shape.charts} ≠ 20`);
  if (!shape.bodyReady) report.V4.push('body 未进入 ready 状态（初始化可能中断）');

  // ---------- V4 渲染：两视口无横向溢出、无元素越界 ----------
  async function checkViewport(w, h, tag) {
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    await sleep(400);
    const r = JSON.parse(await evalJs(`(() => {
      const de = document.documentElement;
      const over = de.scrollWidth - window.innerWidth;
      const clipped = [];
      document.querySelectorAll('.exhibit').forEach(e => {
        const eb = e.getBoundingClientRect();
        if (eb.right > window.innerWidth + 2) clipped.push(e.id + ' 右溢 ' + Math.round(eb.right - window.innerWidth));
        const c = e.querySelector('.chart-svg');
        if (c) { const cb = c.getBoundingClientRect(); if (cb.width < 40 || cb.height < 30) clipped.push(e.id + ' 图表被压扁'); }
      });
      return JSON.stringify({ over, clipped, w: window.innerWidth });
    })()`));
    if (r.over > 1) report.V4.push(`${tag}: 横向溢出 ${r.over}px`);
    r.clipped.forEach(c => report.V4.push(`${tag}: ${c}`));
    report.V4.push(`✓ ${tag} 视口 ${w}×${h} 检查完成（溢出 ${r.over}px）`);
  }

  await checkViewport(1440, 900, '桌面');
  await checkViewport(420, 900, '手机');
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);

  // ---------- V5 交互：每件展品拖第一个滑块，KPI 必变 ----------
  const interact = JSON.parse(await evalJs(`(async () => {
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out = [];
    for (const e of document.querySelectorAll('.exhibit')) {
      const id = e.id.replace('ex-','');
      const inp = e.querySelector('input[type=range]');
      const sel = e.querySelector('select');
      const kpiText = () => [...e.querySelectorAll('.kpi-value')].map(x => x.textContent.trim()).join('|');
      const before = kpiText();
      const ctl = inp || sel;
      if (!ctl) { out.push({id, changed: false, why: '无控件'}); continue; }
      if (inp) {
        const prev = inp.value;
        const target = (parseFloat(inp.value) === parseFloat(inp.max)) ? inp.min : inp.max;
        inp.value = target;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        await frame();
        const after = kpiText();
        inp.value = prev; inp.dispatchEvent(new Event('input', { bubbles: true }));
        await frame();
        out.push({ id, changed: before !== after, before, after });
      } else {
        const prev = sel.value;
        const opt = [...sel.options].find(o => o.value !== prev);
        sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
        await frame();
        const after = kpiText();
        sel.value = prev; sel.dispatchEvent(new Event('change', { bubbles: true }));
        await frame();
        out.push({ id, changed: before !== after, before, after });
      }
    }
    return JSON.stringify(out);
  })()`, true));

  interact.forEach(r => {
    if (!r.changed) report.V5.push(`${r.id}: 拖动滑块后 KPI 没变`);
    else report.V5.push(`✓ ${r.id} KPI 随滑块变化`);
  });

  // ---------- 截图 ----------
  const shots = [
    { name: 'desktop-top', w: 1440, h: 900, scroll: 0 },
    { name: 'desktop-ex01', w: 1440, h: 900, sel: '#ex-01' },
    { name: 'desktop-ex07', w: 1440, h: 900, sel: '#ex-07' },
    { name: 'desktop-ex08', w: 1440, h: 900, sel: '#ex-08' },
    { name: 'desktop-ex16', w: 1440, h: 900, sel: '#ex-16' },
    { name: 'desktop-ex14', w: 1440, h: 900, sel: '#ex-14' },
    { name: 'desktop-ex15', w: 1440, h: 900, sel: '#ex-15' },
    { name: 'desktop-ex20', w: 1440, h: 900, sel: '#ex-20' },
    { name: 'mobile-top', w: 420, h: 900, scroll: 0 },
    { name: 'mobile-ex12', w: 420, h: 900, sel: '#ex-12' }
  ];
  for (const s of shots) {
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: s.w < 600 });
    await sleep(350);
    // 用即时滚动，smooth 会让截图落在半路上
    if (s.sel) {
      await evalJs(`(() => { const el = document.querySelector('${s.sel}');
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 8, behavior: 'instant' }); })()`);
    } else {
      await evalJs(`window.scrollTo({ top: ${s.scroll || 0}, behavior: 'instant' })`);
    }
    await sleep(700);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const f = path.join(SHOTS, s.name + '.png');
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    report.shots.push(f);
  }

  // ---------- V6 / V8 ----------
  exceptions.forEach(e => report.V6.push('未捕获异常: ' + e));
  consoleErrors.forEach(e => report.V6.push('console.error: ' + e));
  consoleWarns.forEach(e => report.V6.push('console.warn: ' + e));

  const external = [...new Set(netUrls)].filter(u => !u.startsWith('file://') && !u.startsWith('data:'));
  report.V8 = {
    totalRequests: netUrls.length,
    uniqueAssets: [...new Set(netUrls)].map(u => u.replace(PAGE_URL.replace('index.html', ''), '')),
    external
  };
  if (external.length) report.V6.push('存在外部网络请求: ' + external.join(', '));

} catch (err) {
  report.V6.push('驱动异常: ' + err.message);
} finally {
  try { browser?.ws?.close(); } catch {}
  try { child.kill(); } catch {}
  await sleep(300);
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {}
}

// ---------- 汇总 ----------
const bad = report.V4.filter(x => !x.startsWith('✓')).length
  + report.V5.filter(x => !x.startsWith('✓')).length
  + report.V6.length
  + (report.V8?.external?.length ? 1 : 0);

console.log('=== V4 渲染 ===');
report.V4.forEach(x => console.log(' ', x));
console.log('=== V5 交互 ===');
report.V5.forEach(x => console.log(' ', x));
console.log('=== V6 控制台 ===');
if (!report.V6.length) console.log('  ✓ 0 error / 0 warn / 0 未捕获异常');
report.V6.forEach(x => console.log('  ✗', x));
console.log('=== V8 离线 ===');
console.log('  请求总数', report.V8?.totalRequests, '｜外部请求', JSON.stringify(report.V8?.external || []));
console.log('  资源清单', JSON.stringify(report.V8?.uniqueAssets || []));
console.log('=== 截图 ===');
report.shots.forEach(s => console.log(' ', s));
console.log(bad === 0 ? '\n全部通过' : `\n${bad} 处未通过`);
process.exit(bad === 0 ? 0 : 1);
