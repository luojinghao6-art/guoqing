 'use strict';
/* 验证"真实帧循环"路径（不调用 seek）：
   1) 默认 URL：gate 1.1s 后自动开始，动画应随时间推进且画面非黑
   2) ?manual=1：必须点击"开启贺卡"才进入，点击后画面应非黑且时钟推进 */
const { CDP, sleep } = require('./cdp');
const fs = require('fs');
const LOG = 'shots/_verify_frame.log';
fs.writeFileSync(LOG, '');
const say = (s) => { console.log(s); fs.appendFileSync(LOG, s + '\n'); };

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
    const st = window.__api.stats();
    return JSON.stringify({
      t: st.t, scene: st.scene, particles: st.particles,
      meanLum: Math.round(sum / n), brightPct: Math.round(100 * nonBlack / n),
    });
  })()`);
  say('  [' + tag + '] ' + info);
  return JSON.parse(info);
}

(async () => {
  const c = await CDP.launch({ width: 1280, height: 800 });
  await c.init();

  say('== 1) 默认 URL：自动播放 ==');
  await c.goto('http://127.0.0.1:55633/', 500);
  await c.waitReady();
  const s0 = await sample(c, 't0 (加载后)');
  await sleep(2500);          // 真实等待，让 rAF 循环跑
  const s1 = await sample(c, 't+2.5s');
  await sleep(2000);
  const s2 = await sample(c, 't+4.5s');
  const okAuto = s0.brightPct > 40 && s1.brightPct > 40 && s2.brightPct > 40 && s2.t > s1.t && s1.t > s0.t;
  say(okAuto ? '  自动播放路径: 画面有内容且时钟推进 ✔' : '  自动播放路径: 异常 ✘');
  await c.screenshot('shots/_auto_frame.png');

  say('\n== 2) ?manual=1：手动点击 ==');
  await c.goto('http://127.0.0.1:55633/?manual=1', 500);
  await c.waitReady();
  await sleep(1500);
  const m0 = await c.evaluate(`JSON.stringify({
    gateVisible: !document.getElementById('gate').classList.contains('is-hidden'),
    hudOn: document.getElementById('hud').classList.contains('is-on'),
  })`);
  say('  点击前: ' + m0);
  const b0 = await sample(c, '点击前');
  await c.evaluate(`document.getElementById('gateBtn').click()`);
  await sleep(1800);          // 真实等待动画跑起来
  const m1 = await sample(c, '点击后+1.8s');
  await sleep(1500);
  const m2 = await sample(c, '点击后+3.3s');
  const okManual = m1.brightPct > 40 && m2.brightPct > 40 && m2.t > m1.t;
  say(okManual ? '  手动点击路径: 画面有内容且时钟推进 ✔' : '  手动点击路径: 异常 ✘');
  await c.screenshot('shots/_manual_frame.png');

  say('\n== JS 错误 ==');
  say(c.errors.length ? c.errors.join('\n') : '  (无)');

  await c.close();
  process.exit(okAuto && okManual ? 0 : 1);
})().catch(async (e) => { say('验证失败: ' + e.message); process.exit(1); });
