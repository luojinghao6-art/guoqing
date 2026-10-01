'use strict';
/**
 * landmark.js —— 天安门城楼 + 华表（剪影式矢量绘制）
 *
 * 用归一化坐标绘制（x: 0..1 横跨建筑，y: 0..1 从上到下），再整体缩放平移，
 * 所以同一份路径可以画成任意大小。
 *
 * 结构自下而上：
 *   须弥座 → 城台(五个券门) → 城楼墙身 → 下层重檐 → 上层墙身 → 上层重檐 → 正脊宝顶
 */
const Landmarks = (() => {
  const TAU = Math.PI * 2;

  /** 歇山顶屋檐：正脊 + 两坡 + 檐口两端起翘 */
  function eavePath(ctx, x0, x1, yRidge, yEave, o = {}) {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    const ridgeHalf = w * (o.ridgeHalf ?? 0.18);
    const flare = w * (o.flare ?? 0.075);
    const sag = w * (o.sag ?? 0.05);
    ctx.beginPath();
    ctx.moveTo(cx - ridgeHalf, yRidge);
    ctx.lineTo(cx + ridgeHalf, yRidge);
    ctx.quadraticCurveTo(x1 - w * 0.15, yEave - flare * 0.3, x1, yEave - flare);
    ctx.quadraticCurveTo(cx, yEave + sag, x0, yEave - flare);
    ctx.quadraticCurveTo(x0 + w * 0.15, yEave - flare * 0.3, cx - ridgeHalf, yRidge);
    ctx.closePath();
  }

  /** 券门（拱门）：矩形 + 半圆顶 */
  function archPath(ctx, cx, w, yBottom, h) {
    const r = w / 2;
    ctx.beginPath();
    ctx.moveTo(cx - r, yBottom);
    ctx.lineTo(cx - r, yBottom - h + r);
    ctx.arc(cx, yBottom - h + r, r, Math.PI, 0);
    ctx.lineTo(cx + r, yBottom);
    ctx.closePath();
  }

  /** 华表：柱身 + 云板 + 承露盘 + 蹲兽 */
  function drawHuabiao(ctx, x, yTop, yBottom, w, o = {}) {
    const col = o.color ?? '#2a0f0a';
    const edge = o.edge ?? 'rgba(255,170,90,0.55)';
    const bodyW = w;
    ctx.fillStyle = col;
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(0.6, w * 0.09);

    /* 柱身：略带收分 */
    ctx.beginPath();
    ctx.moveTo(x - bodyW * 0.5, yBottom);
    ctx.lineTo(x - bodyW * 0.42, yTop + w * 1.5);
    ctx.lineTo(x + bodyW * 0.42, yTop + w * 1.5);
    ctx.lineTo(x + bodyW * 0.5, yBottom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    /* 云板（横向的云形板） */
    const by = yTop + w * 2.3;
    ctx.beginPath();
    ctx.moveTo(x - bodyW * 2.15, by);
    ctx.quadraticCurveTo(x - bodyW * 1.5, by - w * 0.85, x - bodyW * 0.5, by - w * 0.15);
    ctx.lineTo(x + bodyW * 0.5, by - w * 0.15);
    ctx.quadraticCurveTo(x + bodyW * 1.5, by - w * 0.85, x + bodyW * 2.15, by);
    ctx.quadraticCurveTo(x + bodyW * 1.4, by + w * 0.55, x, by + w * 0.4);
    ctx.quadraticCurveTo(x - bodyW * 1.4, by + w * 0.55, x - bodyW * 2.15, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    /* 承露盘 + 蹲兽 */
    ctx.beginPath();
    ctx.ellipse(x, yTop + w * 1.35, bodyW * 0.95, w * 0.34, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, yTop + w * 0.62, bodyW * 0.6, w * 0.52, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    /* 顶端小尖 */
    ctx.beginPath();
    ctx.moveTo(x, yTop - w * 0.5);
    ctx.lineTo(x + bodyW * 0.26, yTop + w * 0.5);
    ctx.lineTo(x - bodyW * 0.26, yTop + w * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * 绘制天安门
   * @param cx     水平中心
   * @param baseY  地面线 y
   * @param width  建筑总宽（含华表）
   * @param o      { alpha, warm, glow }
   */
  function drawTiananmen(ctx, cx, baseY, width, o = {}) {
    const a = o.alpha ?? 1;
    if (a <= 0.001) return;
    const H = width * 0.62;                 // 建筑总高
    const x = (u) => cx - width / 2 + u * width;
    const y = (v) => baseY - (1 - v) * H;   // v: 0 顶 → 1 底

    const wall = o.wall ?? '#4a0f08';
    const wallHi = o.wallHi ?? '#7d1a0c';
    const roof = o.roof ?? '#c9a227';
    const roofHi = o.roofHi ?? '#f2d670';
    const dark = o.dark ?? '#1a0704';

    ctx.save();
    ctx.globalAlpha *= a;   /* 叠乘：这样外层可以整体调暗（用于水面倒影） */

    /* ---- 华表（左右各一，画在城楼之后） ---- */
    const hbW = width * 0.028;
    drawHuabiao(ctx, x(-0.075), y(0.30), y(1.0), hbW, { color: '#3a1008', edge: 'rgba(255,180,100,0.5)' });
    drawHuabiao(ctx, x(1.075), y(0.30), y(1.0), hbW, { color: '#3a1008', edge: 'rgba(255,180,100,0.5)' });

    /* ---- 须弥座 ---- */
    let g = ctx.createLinearGradient(0, y(1.0), 0, y(0.88));
    g.addColorStop(0, '#2b0d06');
    g.addColorStop(1, '#5a1a0c');
    ctx.fillStyle = g;
    ctx.fillRect(x(-0.02), y(1.0), width * 1.04, y(0.88) - y(1.0));

    /* ---- 城台（红墙 + 五个券门） ---- */
    g = ctx.createLinearGradient(0, y(0.88), 0, y(0.55));
    g.addColorStop(0, wall);
    g.addColorStop(0.45, wallHi);
    g.addColorStop(1, wall);
    ctx.fillStyle = g;
    ctx.fillRect(x(0.05), y(0.88), width * 0.90, y(0.55) - y(0.88));

    /* 券门 */
    const arches = [
      [0.5, 0.088, 0.30],
      [0.5 - 0.138, 0.064, 0.245], [0.5 + 0.138, 0.064, 0.245],
      [0.5 - 0.252, 0.052, 0.205], [0.5 + 0.252, 0.052, 0.205],
    ];
    for (const [ax, aw, ah] of arches) {
      ctx.fillStyle = '#160604';
      archPath(ctx, x(ax), width * aw, y(0.88), H * ah);
      ctx.fill();
      /* 门洞暖光 */
      ctx.save();
      ctx.clip();
      const gg = ctx.createLinearGradient(0, y(0.88), 0, y(0.88) - H * ah);
      gg.addColorStop(0, 'rgba(255,170,70,0.55)');
      gg.addColorStop(1, 'rgba(255,120,20,0.05)');
      ctx.fillStyle = gg;
      ctx.fillRect(x(ax - aw), y(0.9), width * aw * 2, H * ah);
      ctx.restore();
    }

    /* ---- 下层重檐 ---- */
    g = ctx.createLinearGradient(0, y(0.42), 0, y(0.26));
    g.addColorStop(0, roofHi);
    g.addColorStop(0.55, roof);
    g.addColorStop(1, '#8a6a12');
    ctx.fillStyle = g;
    eavePath(ctx, x(0.115), x(0.885), y(0.265), y(0.415), { flare: 0.085, sag: 0.06 });
    ctx.fill();
    /* 檐口阴影线 */
    ctx.strokeStyle = 'rgba(60,30,0,0.55)';
    ctx.lineWidth = Math.max(0.8, width * 0.0035);
    ctx.stroke();

    /* ---- 城楼墙身（红墙 + 八根廊柱 + 门窗） ---- */
    g = ctx.createLinearGradient(0, y(0.55), 0, y(0.36));
    g.addColorStop(0, '#3d0c06');
    g.addColorStop(0.5, wallHi);
    g.addColorStop(1, '#3d0c06');
    ctx.fillStyle = g;
    ctx.fillRect(x(0.215), y(0.55), width * 0.57, y(0.365) - y(0.55));

    /* 门窗 */
    ctx.fillStyle = '#200806';
    const doorW = width * 0.036;
    for (let i = 0; i < 8; i++) {
      const dx = x(0.245 + i * 0.073);
      const isDoor = i === 3 || i === 4;
      const dh = H * (isDoor ? 0.115 : 0.075);
      ctx.fillRect(dx, y(0.55) - dh, doorW, dh);
      ctx.fillStyle = 'rgba(255,190,90,0.20)';
      ctx.fillRect(dx, y(0.55) - dh, doorW, dh * 0.35);
      ctx.fillStyle = '#200806';
    }
    /* 廊柱 */
    ctx.fillStyle = 'rgba(255,205,130,0.55)';
    for (let i = 0; i <= 8; i++) {
      ctx.fillRect(x(0.228 + i * 0.0678), y(0.55), width * 0.0048, y(0.365) - y(0.55));
    }
    /* 檐下额枋（彩画带） */
    ctx.fillStyle = 'rgba(60,120,140,0.55)';
    ctx.fillRect(x(0.215), y(0.375), width * 0.57, H * 0.022);
    ctx.fillStyle = 'rgba(220,170,60,0.65)';
    ctx.fillRect(x(0.215), y(0.377), width * 0.57, H * 0.007);

    /* ---- 上层重檐 ---- */
    g = ctx.createLinearGradient(0, y(0.20), 0, y(0.055));
    g.addColorStop(0, roofHi);
    g.addColorStop(0.5, roof);
    g.addColorStop(1, '#7d5f10');
    ctx.fillStyle = g;
    eavePath(ctx, x(0.175), x(0.825), y(0.055), y(0.205), { flare: 0.095, sag: 0.062 });
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,30,0,0.5)';
    ctx.stroke();

    /* ---- 上层墙身 ---- */
    ctx.fillStyle = '#5e1409';
    ctx.fillRect(x(0.265), y(0.30), width * 0.47, y(0.20) - y(0.30));
    ctx.fillStyle = 'rgba(255,190,90,0.35)';
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(x(0.283 + i * 0.0657), y(0.30), width * 0.03, H * 0.06);
    }
    ctx.fillStyle = 'rgba(60,120,140,0.5)';
    ctx.fillRect(x(0.265), y(0.212), width * 0.47, H * 0.02);

    /* ---- 正脊 + 宝顶 ---- */
    ctx.fillStyle = '#e8c95a';
    ctx.fillRect(x(0.375), y(0.055), width * 0.25, H * 0.026);
    ctx.beginPath();
    ctx.moveTo(x(0.5), y(0.0));
    ctx.lineTo(x(0.525), y(0.055));
    ctx.lineTo(x(0.475), y(0.055));
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  /** 祥云：装饰性云纹 */
  function drawCloud(ctx, cx, cy, w, o = {}) {
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 0.5;
    ctx.fillStyle = o.color ?? 'rgba(255,200,120,0.35)';
    ctx.beginPath();
    ctx.arc(cx - w * 0.34, cy, w * 0.20, 0, TAU);
    ctx.arc(cx - w * 0.08, cy - w * 0.10, w * 0.26, 0, TAU);
    ctx.arc(cx + w * 0.22, cy - w * 0.02, w * 0.22, 0, TAU);
    ctx.arc(cx + w * 0.44, cy + w * 0.08, w * 0.15, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  return { drawTiananmen, drawHuabiao, drawCloud, eavePath };
})();