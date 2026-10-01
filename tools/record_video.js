'use strict';
/**
 * record_video.js —— 用确定性逐帧渲染，把整部作品录成 MP4
 *
 * 原理：页面支持 ?t= 确定性渲染；每帧先 __api.seek(t)（只往前推进，确定性一致），
 *       再 Page.captureScreenshot 抓 JPEG，逐帧写入 ffmpeg 的 image2pipe 合成 MP4。
 *
 * 用法：node tools/record_video.js [--out shots/国庆祝福_作品视频.mp4]
 *                                 [--w 1920] [--h 1080] [--fps 30] [--q 90]
 *                                 [--frames N]（调试用，抓前 N 帧）
 */
const { CDP } = require('./cdp');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const OUT = path.resolve(arg('out', 'shots/国庆祝福_作品视频.mp4'));
const W = parseInt(arg('w', '1920'), 10);
const H = parseInt(arg('h', '1080'), 10);
const FPS = parseInt(arg('fps', '30'), 10);
const Q = parseInt(arg('q', '90'), 10);
const LIMIT = parseInt(arg('frames', '0'), 10);
const START = 0.02;

const FFMPEG =
  process.env.FFMPEG_PATH ||
  (fs.existsSync('build/node_modules/ffmpeg-static/ffmpeg.exe')
    ? path.resolve('build/node_modules/ffmpeg-static/ffmpeg.exe')
    : 'C:/Users/罗靖皓/AppData/Roaming/TunePat Netflix Video Downloader/com.tunepat.netflix/native/win64/ffmpeg.exe');
if (!fs.existsSync(FFMPEG)) throw new Error('找不到可用的 ffmpeg，请设置 FFMPEG_PATH: ' + FFMPEG);

const URL = 'file:///' + path.resolve('web/index.html').replace(/\\/g, '/') + '?t=0.001&hud=0';

function progress(n, total, ms) {
  const pct = ((n / total) * 100).toFixed(1);
  const eta = n ? Math.round((ms / n) * (total - n) / 1000) : 0;
  process.stderr.write(`帧 ${n}/${total} (${pct}%)  用时 ${(ms / 1000).toFixed(0)}s  预计剩 ${eta}s\n`);
}

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const c = await CDP.launch({ width: W, height: H });
  await c.init();
  await c.goto(URL, 2200);
  await c.waitReady();

  const total = await c.evaluate('window.__api.total');
  const frames = LIMIT || Math.ceil((total - START) * FPS);
  process.stderr.write(`作品时长 ${total.toFixed(1)}s，${frames} 帧 @ ${W}x${H} ${FPS}fps → ${OUT}\n`);

  const ff = spawn(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let ferr = '';
  ff.stderr.on('data', (d) => { ferr += d; });

  const t0 = Date.now();
  let lastErr = null;
  for (let i = 0; i < frames; i++) {
    const t = Math.min(START + i / FPS, total);
    try {
      const clock = await c.evaluate('window.__api.seek(' + t.toFixed(4) + ')');
      const r = await c.send('Page.captureScreenshot', {
        format: 'jpeg', quality: Q, fromSurface: true, captureBeyondViewport: false,
      });
      const buf = Buffer.from(r.data, 'base64');
      if (!ff.stdin.write(buf)) await new Promise((res) => ff.stdin.once('drain', res));
      if ((i + 1) % 150 === 0) progress(i + 1, frames, Date.now() - t0);
    } catch (e) {
      lastErr = e;
      process.stderr.write(`第 ${i} 帧出错: ${e.message}\n`);
      break;
    }
  }

  ff.stdin.end();
  const code = await new Promise((res) => ff.on('close', res));
  await c.close();

  if (lastErr) throw lastErr;
  if (code !== 0) throw new Error('ffmpeg 退出码 ' + code + '\n' + ferr.slice(-1200));
  const size = fs.statSync(OUT).size;
  process.stderr.write(`完成：${frames} 帧，${((Date.now() - t0) / 1000).toFixed(0)}s，文件 ${(size / 1048576).toFixed(1)} MB\n`);
})().catch((e) => { console.error('录制失败: ' + e.message); process.exit(1); });
