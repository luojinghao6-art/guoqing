'use strict';
/* 冒烟测试：加载页面、抓 JS 错误、逐帧推进检查渲染 */
const { CDP, sleep } = require('./cdp');
const path = require('path');
const fs = require('fs');
const LOG = 'shots/_smoke.log';
fs.writeFileSync(LOG, '');
const say = (s) => { console.log(s); fs.appendFileSync(LOG, s + '\n'); };

const URL = 'file:///' + path.resolve('web/index.html').replace(/\\/g, '/');

(async () => {
  const c = await CDP.launch({ width: 1600, height: 900 });
  await c.init();
  await c.goto(URL + '?t=0.001', 2500);
  await c.waitReady();
  say('页面已就绪');

  const env = await c.evaluate(`JSON.stringify({
    W: innerWidth, H: innerHeight, dpr: devicePixelRatio,
    hasMap: !!window.CHINA_MAP,
    dots: window.CHINA_MAP ? window.CHINA_MAP.dots.length : 0,
    provs: window.CHINA_MAP ? window.CHINA_MAP.provinces.length : 0,
    cities: window.CHINA_MAP ? window.CHINA_MAP.cities.length : 0,
    insetRings: window.CHINA_MAP ? window.CHINA_MAP.inset.rings.length : 0,
    api: !!window.__api, total: window.__api ? window.__api.total : 0,
  })`);
  say('环境: ' + env);

  say('\n== 逐帧推进（每次只前进，模拟录屏）==');
  const marks = [1.5, 3.0, 6.0, 9.0, 12.0, 16.0, 20.0, 25.0, 30.0, 36.0, 42.0, 48.0, 53.0];
  const t0 = Date.now();
  for (const t of marks) {
    const info = await c.evaluate(`(() => {
      const t0 = performance.now();
      window.__api.seek(${t});
      const ms = performance.now() - t0;
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
        seekMs: Math.round(ms),
      });
    })()`);
    say('  t=' + String(t).padStart(5) + '  ' + info);
  }
  say('总耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

  say('\n== JS 错误 ==');
  say(c.errors.length ? c.errors.join('\n') : '  (无)');
  say('\n== 控制台 ==');
  say(c.logs.length ? c.logs.map((l) => '  [' + l.type + '] ' + l.text).join('\n') : '  (无)');

  await c.close();
  process.exit(0);
})().catch(async (e) => { say('测试失败: ' + e.message); process.exit(1); });