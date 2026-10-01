'use strict';
/* batch_shot.js —— 一次 Chrome 会话连续截多帧（确定性 ?t= 渲染）
   用法: node tools/batch_shot.js "out1.png@t1;out2.png@t2;..." [--w 1920] [--h 1080] */
const { CDP } = require('./cdp');
const path = require('path');
const fs = require('fs');

const spec = (process.argv[2] || '').split(';').filter(Boolean).map((s) => {
  const [out, t] = s.split('@');
  return { out: path.resolve(out), t: parseFloat(t) };
});
const W = parseInt(process.argv.includes('--w') ? process.argv[process.argv.indexOf('--w') + 1] : '1920', 10);
const H = parseInt(process.argv.includes('--h') ? process.argv[process.argv.indexOf('--h') + 1] : '1080', 10);
if (!spec.length) { console.error('用法: node tools/batch_shot.js "a.png@3;b.png@9" [--w 1920] [--h 1080]'); process.exit(2); }

const URL = 'file:///' + path.resolve('web/index.html').replace(/\\/g, '/');

(async () => {
  const c = await CDP.launch({ width: W, height: H });
  await c.init();
  await c.goto(URL + '?t=0.001&hud=0', 2200);
  await c.waitReady();
  for (const s of spec) {
    await c.evaluate(`window.__api.seek(${s.t})`);
    // 等一帧让画布完成（确定性渲染也可能有下一帧的合成）
    await new Promise((r) => setTimeout(r, 120));
    const bytes = await c.screenshot(s.out);
    const st = await c.evaluate(`JSON.stringify(window.__api.stats())`);
    console.log('t=' + s.t + '  ' + st + '  -> ' + s.out + ' (' + bytes + ' B)');
  }
  console.log('JS 错误:', c.errors.length ? c.errors.join(' | ') : '(无)');
  await c.close();
  process.exit(0);
})().catch((e) => { console.error('失败:', e.message); process.exit(1); });
