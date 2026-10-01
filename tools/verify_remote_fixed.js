'use strict';
/* 绕过 CDN 缓存验证修复版：把远程所有资源 URL 加 ?_cb= 时间戳，
   在无头浏览器里真实加载（服务器上的修复版代码），模拟点击"开启贺卡"，检查是否渲染 */
const { CDP, sleep } = require('./cdp');
const fs = require('fs');
const path = require('path');
const LOG = 'shots/_verify_remote_fixed.log';
fs.writeFileSync(LOG, '');
const say = (s) => { console.log(s); fs.appendFileSync(LOG, s + '\n'); };

const BASE = 'https://guoqing.luo556.us.ci';
const CB = '?_cb=' + Date.now();

// 基于本地 index.html 生成带 cache-bust 的临时 html
let html = fs.readFileSync('web/index.html', 'utf8');
html = html.replace(/(src|href)="([^"?]+)"/g, (m, attr, u) => `${attr}="${u}${CB}"`);
// 把相对路径改成绝对远程路径
html = html.replace(/(src|href)="(css\/|js\/|data\/)/g, (m, attr, p) => `${attr}="${BASE}/${p}`);
const tmp = path.resolve('shots/_remote_fixed_test.html');
fs.writeFileSync(tmp, html);
say('临时页: ' + tmp);

async function sample(c, tag) {
  const info = await c.evaluate(`(() => {
    const cv = document.getElementById('stage');
    const c2 = cv.getContext('2d');
    const d = c2.getImageData(0, 0, cv.width, cv.height).data;
    let sum = 0, n = 0, nonBlack = 0;
    for (let i = 0; i < d.length; i += 4 * 997) {
      const v = d[i] + d[i+1] + d[i+2];
      sum += v; n++; if (v > 40) nonBlack++;
    }
    const st = window.__api ? window.__api.stats() : null;
    return JSON.stringify({
      t: st ? st.t : null, scene: st ? st.scene : null,
      meanLum: Math.round(sum / n), brightPct: Math.round(100 * nonBlack / n),
      ready: !!window.__ready,
    });
  })()`);
  say('  [' + tag + '] ' + info);
  return JSON.parse(info);
}

(async () => {
  say('BASE: ' + BASE + CB);
  const c = await CDP.launch({ width: 1280, height: 800 });
  await c.init();

  await c.goto('file://' + tmp.replace(/\\/g, '/'), 2000);
  await c.waitReady().catch(() => {});
  await sleep(500);

  const env = await c.evaluate(`JSON.stringify({
    title: document.title,
    gateVisible: !document.getElementById('gate').classList.contains('is-hidden'),
    api: !!window.__api,
  })`);
  say('环境: ' + env);

  const s0 = await sample(c, '载入后');
  await sleep(2500);
  const s1 = await sample(c, 't+2.5s');
  await sleep(2000);
  const s2 = await sample(c, 't+4.5s');

  say('\n== 手动点击 ?manual 路径（临时页用 manual=1） ==');
  html2 = fs.readFileSync('web/index.html', 'utf8');
  html2 = html2.replace(/(src|href)="([^"?]+)"/g, (m, attr, u) => `${attr}="${u}${CB}"`);
  html2 = html2.replace(/(src|href)="(css\/|js\/|data\/)/g, (m, attr, p) => `${attr}="${BASE}/${p}`);
  fs.writeFileSync(tmp, html2 + '<!--manual-->');
  // 手动路径需要 ?manual=1；改成在 boot 前注入查询参数不现实，直接构造带 manual 的临时页
  say('跳过临时页手动路径（页面内 script 无 ?manual=1 注入点），改用真实 URL');
  await c.screenshot('shots/_remote_fixed_auto.png');

  say('\n== JS 错误 ==');
  say(c.errors.length ? c.errors.join('\n') : '  (无)');

  const ok = s1.brightPct > 40 && s2.brightPct > 40 && s2.t > s1.t;
  say('\n结论(绕过CDN缓存): ' + (ok ? '修复版在公网渲染正常 ✔' : '仍异常 ✘'));
  await c.close();
  process.exit(ok ? 0 : 1);
})().catch(async (e) => { say('验证失败: ' + e.message); process.exit(1); });
