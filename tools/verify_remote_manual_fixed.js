'use strict';
/* 绕过 CDN 缓存验证修复版（手动点击路径）：临时页 + ?manual=1 走真实点击 */
const { CDP, sleep } = require('./cdp');
const fs = require('fs');
const path = require('path');
const LOG = 'shots/_verify_remote_fixed.log';
fs.writeFileSync(LOG, '');
const say = (s) => { console.log(s); fs.appendFileSync(LOG, s + '\n'); };

const BASE = 'https://guoqing.luo556.us.ci';
const CB = '?_cb=' + Date.now();

let html = fs.readFileSync('web/index.html', 'utf8');
html = html.replace(/(src|href)="([^"?]+)"/g, (m, attr, u) => `${attr}="${u}${CB}"`);
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
  const c = await CDP.launch({ width: 1280, height: 800 });
  await c.init();

  // 手动路径：file:// 支持查询串 ?manual=1
  await c.goto('file://' + tmp.replace(/\\/g, '/') + '?manual=1', 2000);
  await c.waitReady().catch(() => {});
  await sleep(1200);

  const env = await c.evaluate(`JSON.stringify({
    gateVisible: !document.getElementById('gate').classList.contains('is-hidden'),
    api: !!window.__api,
  })`);
  say('环境(点击前): ' + env);
  const b0 = await sample(c, '点击前');

  await c.evaluate(`document.getElementById('gateBtn').click()`);
  await sleep(1800);
  const m1 = await sample(c, '点击后+1.8s');
  await sleep(1500);
  const m2 = await sample(c, '点击后+3.3s');
  await c.screenshot('shots/_remote_fixed_manual.png');

  say('\n== JS 错误 ==');
  say(c.errors.length ? c.errors.join('\n') : '  (无)');

  const ok = m1.brightPct > 40 && m2.brightPct > 40 && m2.t > m1.t;
  say('\n结论(绕过CDN缓存·手动路径): ' + (ok ? '修复版渲染正常 ✔' : '仍异常 ✘'));
  await c.close();
  process.exit(ok ? 0 : 1);
})().catch(async (e) => { say('验证失败: ' + e.message); process.exit(1); });
