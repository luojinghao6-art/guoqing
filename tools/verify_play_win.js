 'use strict';
/* 验证 Windows 二进制：默认 URL -> 点击"开启贺卡" -> 逐帧推进渲染是否正常 */
const { CDP, sleep } = require('./cdp');
const path = require('path');
const fs = require('fs');
const LOG = 'shots/_verify_play_win.log';
fs.writeFileSync(LOG, '');
const say = (s) => { console.log(s); fs.appendFileSync(LOG, s + '\n'); };

const URL = 'http://127.0.0.1:55633/';

(async () => {
  const c = await CDP.launch({ width: 1280, height: 800 });
  await c.init();
  await c.goto(URL, 1500);
  await c.waitReady();

  const before = await c.evaluate(`JSON.stringify({
    gateVisible: !document.getElementById('gate').classList.contains('is-hidden'),
    hasBtn: !!document.getElementById('gateBtn'),
    hudOn: document.getElementById('hud').classList.contains('is-on'),
  })`);
  say('点击前: ' + before);

  // 点击"开启贺卡"
  await c.evaluate(`document.getElementById('gateBtn').click()`);
  await sleep(600);
  const after = await c.evaluate(`JSON.stringify({
    gateHidden: document.getElementById('gate').classList.contains('is-hidden'),
    hudOn: document.getElementById('hud').classList.contains('is-on'),
  })`);
  say('点击后: ' + after);

  say('\n== 逐帧推进像素检查 ==');
  const marks = [0.5, 3.0, 6.5, 9.5, 13.0, 18.0, 24.0, 30.0, 36.0, 42.0, 48.0, 53.0];
  for (const t of marks) {
    const info = await c.evaluate(`(() => {
      window.__api.seek(${t});
      const cv = document.getElementById('stage');
      const c2 = cv.getContext('2d');
      const d = c2.getImageData(0, 0, cv.width, cv.height).data;
      let sum = 0, n = 0, nonBlack = 0;
      for (let i = 0; i < d.length; i += 4 * 997) {
        const v = d[i] + d[i+1] + d[i+2];
        sum += v; n++; if (v > 40) nonBlack++;
      }
      const st = window.__api.stats();
      return JSON.stringify({
        scene: st.scene, particles: st.particles, shells: st.shells,
        meanLum: Math.round(sum / n), brightPct: Math.round(100 * nonBlack / n),
      });
    })()`);
    say('  t=' + String(t).padStart(5) + 's  ' + info);
    await c.screenshot('shots/_win_t' + String(t).replace('.', '_') + '.png');
  }

  say('\n== JS 错误 ==');
  say(c.errors.length ? c.errors.join('\n') : '  (无)');
  say('\n== 控制台 ==');
  say(c.logs.length ? c.logs.map((l) => '  [' + l.type + '] ' + l.text).join('\n') : '  (无)');

  await c.close();
  process.exit(0);
})().catch(async (e) => { say('验证失败: ' + e.message); process.exit(1); });
