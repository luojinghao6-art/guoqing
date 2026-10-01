 'use strict';
/* 验证公网部署版：真实访问远端 URL，模拟点击"开启贺卡"，检查帧循环是否真实渲染 */
const { CDP, sleep } = require('./cdp');
const fs = require('fs');
const LOG = 'shots/_verify_remote.log';
fs.writeFileSync(LOG, '');
const say = (s) => { console.log(s); fs.appendFileSync(LOG, s + '\n'); };

const URL = process.argv[2] || 'https://guoqing.luo556.us.ci/';

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
      w: cv.width, h: cv.height,
    });
  })()`);
  say('  [' + tag + '] ' + info);
  return JSON.parse(info);
}

(async () => {
  say('URL: ' + URL);
  const c = await CDP.launch({ width: 1280, height: 800 });
  await c.init();

  await c.goto(URL, 1500);
  await c.waitReady();

  const env = await c.evaluate(`JSON.stringify({
    title: document.title,
    hasBtn: !!document.getElementById('gateBtn'),
    gateVisible: !document.getElementById('gate').classList.contains('is-hidden'),
    hudOn: document.getElementById('hud').classList.contains('is-on'),
    api: !!window.__api,
  })`);
  say('环境: ' + env);

  const s0 = await sample(c, '载入后');
  await sleep(2500);
  const s1 = await sample(c, 't+2.5s');
  await sleep(2000);
  const s2 = await sample(c, 't+4.5s');
  await c.screenshot('shots/_remote_auto.png');

  say('\n== 手动点击 ?manual=1 ==');
  await c.goto(URL + '?manual=1', 1500);
  await c.waitReady();
  await sleep(1200);
  await sample(c, '点击前');
  await c.evaluate(`document.getElementById('gateBtn').click()`);
  await sleep(2000);
  const m1 = await sample(c, '点击后+2s');
  await sleep(1500);
  const m2 = await sample(c, '点击后+3.5s');
  await c.screenshot('shots/_remote_manual.png');

  say('\n== JS 错误 ==');
  say(c.errors.length ? c.errors.join('\n') : '  (无)');

  const ok = s1.brightPct > 40 && s2.brightPct > 40 && s2.t > s1.t && m1.brightPct > 40 && m2.t > m1.t;
  say('\n结论: ' + (ok ? '渲染正常 ✔' : '仍异常 ✘'));
  await c.close();
  process.exit(ok ? 0 : 1);
})().catch(async (e) => { say('验证失败: ' + e.message); process.exit(1); });
