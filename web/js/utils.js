'use strict';
/**
 * utils.js —— 数学 / 缓动 / 随机 / 颜色 小工具
 *
 * 这里的随机数用的是"可播种伪随机发生器"(mulberry32)，而不是 Math.random()。
 * 好处：同一个 ?t= 时刻渲染出来的画面完全一致，方便用无头浏览器批量截图与录屏，
 *       录视频时"烟花在哪里炸开"也能复现。
 */
const U = (() => {
  let seed = 0x2f6e2b1;
  const srand = (s) => { seed = (s >>> 0) || 1; };
  function R() {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rand = (a = 1, b) => (b === undefined ? R() * a : a + R() * (b - a));
  const randInt = (a, b) => Math.floor(a + R() * (b - a + 1));
  const pick = (arr) => arr[Math.min(arr.length - 1, Math.floor(R() * arr.length))];
  const chance = (p) => R() < p;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const TAU = Math.PI * 2;
  const D2R = Math.PI / 180;

  /* 缓动函数 */
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInCubic = (t) => t * t * t;
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
  const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easeOutBack = (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
  const easeOutElastic = (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const c = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
  };

  /* 颜色 */
  const rgba = (r, g, b, a = 1) => 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + a + ')';
  const hsl = (h, s, l, a = 1) => 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')';

  return {
    srand, R, rand, randInt, pick, chance,
    clamp, lerp, smooth, TAU, D2R,
    easeOutCubic, easeInCubic, easeInOutCubic, easeOutQuint, easeOutExpo, easeOutBack, easeOutElastic,
    rgba, hsl,
  };
})();