'use strict';
/**
 * shot.js —— 无头 Chrome 截图工具
 * 用法：node tools/shot.js <url> <out.png> [--w 1600] [--h 900] [--wait 2500]
 * 说明：作品页面支持 ?t=<秒> 参数用"虚拟时钟"确定性渲染某一帧，
 *       因此这里的 --wait 只需等待页面加载完成即可。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const url = process.argv[2];
  const out = path.resolve(process.argv[3]);
  const W = parseInt(arg('w', '1600'), 10);
  const H = parseInt(arg('h', '900'), 10);
  const wait = parseInt(arg('wait', '2500'), 10);
  if (!url || !out) { console.error('用法: node tools/shot.js <url> <out.png> [--w N] [--h N] [--wait ms]'); process.exit(2); }
  if (!CHROME) { console.error('找不到 Chrome/Edge'); process.exit(2); }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'));
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--force-device-scale-factor=1',
    '--user-data-dir=' + profile,
    '--window-size=' + W + ',' + H,
    '--virtual-time-budget=' + wait,
    '--screenshot=' + out,
    '--allow-file-access-from-files',
    url,
  ];

  await new Promise((resolve, reject) => {
    const p = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('chrome exit ' + code + '\n' + err.slice(-1500)))));
  });

  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  const st = fs.statSync(out);
  console.log('已保存 ' + out + '  (' + st.size + ' bytes, ' + W + 'x' + H + ')');
}

main().catch((e) => { console.error('截图失败:', e.message); process.exit(1); });