'use strict';
/**
 * look.js —— 把画布降采样成字符画，用于在无图形环境下检查构图
 * 用法：node tools/look.js <t1,t2,...> [--w 150] [--h 46]
 */
const { CDP, sleep } = require('./cdp');
const path = require('path');
const fs = require('fs');

const URL = 'file:///' + path.resolve('web/index.html').replace(/\\/g, '/');
const times = (process.argv[2] || '3').split(',').map(Number);
const CW = parseInt(process.argv.includes('--w') ? process.argv[process.argv.indexOf('--w') + 1] : '148', 10);
const CH = parseInt(process.argv.includes('--h') ? process.argv[process.argv.indexOf('--h') + 1] : '44', 10);
const MODE = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'mean';
const BOX = process.argv.includes('--box') ? process.argv[process.argv.indexOf('--box') + 1].split(',').map(Number) : [0, 0, 1, 1];

/* 颜色 → 字符：按色相/亮度挑选最贴切的符号 */
const RAMP = ' .:-=+*#%@';

(async () => {
  const c = await CDP.launch({ width: 1600, height: 900 });
  await c.init();
  await c.goto(URL + '?t=0.001', 2200);
  await c.waitReady();

  const out = [];
  for (const t of times) {
    const art = await c.evaluate(`(() => {
      window.__api.seek(${t});
      const cv = document.getElementById('stage');
      const ctx2 = cv.getContext('2d');
      const CW = ${CW}, CH = ${CH}, __MODE__ = "${MODE}";
      const RAMP = ' .:-=+*#%@';
      
      const d = ctx2.getImageData(0, 0, cv.width, cv.height).data;
      const rows = [];
      for (let gy = 0; gy < CH; gy++) {
        let line = '';
        for (let gx = 0; gx < CW; gx++) {
          let r = 0, g = 0, b = 0, n = 0, br = 0, bg = 0, bb = 0, bl = -1;
          const x0 = Math.floor((${BOX[0]} + (gx / CW) * (${BOX[2]} - ${BOX[0]})) * cv.width);
          const x1 = Math.max(x0 + 1, Math.floor((${BOX[0]} + ((gx + 1) / CW) * (${BOX[2]} - ${BOX[0]})) * cv.width));
          const y0 = Math.floor((${BOX[1]} + (gy / CH) * (${BOX[3]} - ${BOX[1]})) * cv.height);
          const y1 = Math.max(y0 + 1, Math.floor((${BOX[1]} + ((gy + 1) / CH) * (${BOX[3]} - ${BOX[1]})) * cv.height));
          for (let y = y0; y < y1; y += 2) {
            for (let x = x0; x < x1; x += 2) {
              const i = (y * cv.width + x) * 4;
              r += d[i]; g += d[i+1]; b += d[i+2]; n++;
              const l = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
              if (l > bl) { bl = l; br = d[i]; bg = d[i+1]; bb = d[i+2]; }
            }
          }
          r /= n; g /= n; b /= n;
          if (__MODE__ === 'max') { r = br; g = bg; b = bb; }
          const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const sat = mx > 0 ? (mx - mn) / mx : 0;
          let ch;
          const gr = g / Math.max(1, r);
          if (lum < 0.05) ch = ' ';
          else if (sat > 0.42 && r > b * 1.4 && gr < 0.55) ch = lum > 0.42 ? 'R' : 'r';        // 红（g/r 小）
          else if (sat > 0.42 && r > b * 1.4 && gr >= 0.55) ch = lum > 0.5 ? 'Y' : 'y';          // 金/黄（g/r 大）
          else if (sat > 0.30 && b > r && b > g) ch = lum > 0.4 ? 'B' : 'b';           // 蓝
          else if (sat > 0.30 && g > r && g > b) ch = lum > 0.4 ? 'G' : 'g';           // 绿
          else ch = RAMP[Math.min(RAMP.length - 1, Math.round(lum * (RAMP.length - 1)))];
          line += ch;
        }
        rows.push(line);
      }
      return rows.join('\\n');
    })()`);
    out.push('════════ t = ' + t + 's  (' + (await c.evaluate('window.__api.stats().scene')) + ') ════════\n' + art);
  }

  const text = out.join('\n\n');
  console.log(text);
  fs.writeFileSync('shots/_look.txt', text, 'utf8');
  console.log('\n== JS 错误 ==\n' + (c.errors.length ? c.errors.join('\n') : '(无)'));
  await c.close();
  process.exit(0);
})().catch((e) => { console.error('失败: ' + e.message); process.exit(1); });