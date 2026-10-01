'use strict';
/**
 * cdp.js —— 一个极简的 Chrome DevTools Protocol 客户端
 *
 * 为什么要自己写：命令行 --screenshot 只能"盲拍"，抓不到 JS 报错、也没法逐帧精确控制。
 * 用 CDP 就能：① 监听 console/异常 ② 调用页面里的 __api.seek(t) 精确跳帧
 *             ③ 逐帧截图 ④ Page.startScreencast 直接录屏。
 * 只依赖 Node 内置的 WebSocket，不需要 puppeteer。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws, proc, profile) {
    this.ws = ws;
    this.proc = proc;
    this.profile = profile;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.logs = [];
    this.errors = [];
  }

  static async launch(opts = {}) {
    if (!CHROME) throw new Error('找不到 Chrome/Edge');
    const W = opts.width || 1600;
    const H = opts.height || 900;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
    const args = [
      '--headless=new',
      '--remote-debugging-port=0',
      '--user-data-dir=' + profile,
      '--no-first-run', '--no-default-browser-check', '--disable-gpu',
      '--hide-scrollbars', '--mute-audio',
      '--force-device-scale-factor=1',
      '--window-size=' + W + ',' + H,
      '--allow-file-access-from-files',
      '--autoplay-policy=no-user-gesture-required',
      'about:blank',
    ];
    const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });

    /* 等 DevToolsActivePort 文件出现 */
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port = 0;
    for (let i = 0; i < 200; i++) {
      if (fs.existsSync(portFile)) {
        const txt = fs.readFileSync(portFile, 'utf8').split('\n');
        port = parseInt(txt[0], 10);
        if (port) break;
      }
      if (proc.exitCode !== null) throw new Error('Chrome 提前退出: ' + stderr.slice(-800));
      await sleep(50);
    }
    if (!port) throw new Error('拿不到调试端口\n' + stderr.slice(-800));

    /* 建一个页面 */
    const r = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' });
    const target = await r.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    const c = new CDP(ws, proc, profile);
    c.W = W;
    c.H = H;
    c.port = port;
    ws.onmessage = (ev) => c._onMessage(ev.data);
    return c;
  }

  _onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message + ' ' + JSON.stringify(msg.error.data || '')));
        else p.resolve(msg.result);
      }
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
      this.logs.push({ type: msg.params.type, text });
      if (msg.params.type === 'error') this.errors.push('[console] ' + text);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      this.errors.push('[exception] ' + (d.exception?.description || d.text));
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      this.logs.push({ type: e.level, text: e.text });
      if (e.level === 'error') this.errors.push('[log] ' + e.text + ' @' + (e.url || ''));
    }
    const hs = this.handlers.get(msg.method);
    if (hs) hs.forEach((h) => h(msg.params));
  }

  on(method, cb) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(cb);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP 超时: ' + method)); }
      }, 45000);
    });
  }

  async init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.W, height: this.H, deviceScaleFactor: 1, mobile: false,
    });
    return this;
  }

  async goto(url, waitMs = 1500) {
    await this.send('Page.navigate', { url });
    /* 轮询文档状态，比监听 loadEventFired 稳（事件可能在 enable 之前就发过了） */
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      try {
        const st = await this.evaluate('document.readyState');
        if (st === 'complete') break;
      } catch (_) { /* 导航过程中上下文会被销毁，忽略 */ }
      await sleep(100);
    }
    await sleep(waitMs);
    return this;
  }

  /** 在页面里执行表达式并取回 JSON 结果 */
  async evaluate(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error('页面内异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }

  /** 等到页面把 window.__ready 置位 */
  async waitReady(timeout = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        const ok = await this.evaluate('!!window.__ready');
        if (ok) return true;
      } catch (_) {}
      await sleep(120);
    }
    throw new Error('等待 __ready 超时；页面错误: ' + this.errors.join(' | '));
  }

  async screenshot(out) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    return fs.statSync(out).size;
  }

  async setSize(w, h) {
    await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(320);
  }

  async close() {
    try { this.ws.close(); } catch (_) {}
    try { this.proc.kill(); } catch (_) {}
    await sleep(220);
    try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { CDP, sleep, CHROME };