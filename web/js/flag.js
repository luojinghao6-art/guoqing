'use strict';
/**
 * flag.js —— 中华人民共和国国旗（严格按国标几何绘制）
 *
 * 国标（1949 年 9 月 27 日全国政协一届会议通过，GB 12982）：
 *   · 旗面长宽比 3:2；把旗面横分 30 格、纵分 20 格，每格边长 u
 *   · 大五角星：中心在"上 5 格、左 5 格"处，外接圆半径 3u，一角尖正上方
 *   · 小五角星：外接圆半径 1u，中心分别在 (10,2) (12,4) (12,7) (10,9)
 *   · 四颗小星的各一个角尖，正对大五角星中心
 *   · 红色 #DE2910，黄色 #FFDE00
 *
 * 五角星的顶点公式：正五角星由 10 个顶点构成，
 *   外顶点半径 R，内顶点半径 R·ρ，ρ = (3-√5)/2 ≈ 0.381966
 */
const Flag = (() => {
  const RED = '#DE2910';
  const YELLOW = '#FFDE00';
  const RHO = (3 - Math.sqrt(5)) / 2;
  const D2R = Math.PI / 180;

  /** 生成五角星的 10 个顶点（相对中心，一个角尖指向 rotDeg 方向） */
  function starPoints(R, rotDeg) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? R * RHO : R;
      const a = (rotDeg + i * 36) * D2R;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }

  /** 五角星中心（以"格"为单位，原点在旗面左上角，x 向右 y 向下） */
  const BIG = { gx: 5, gy: 5, R: 3 };
  const SMALL = [
    { gx: 10, gy: 2 },
    { gx: 12, gy: 4 },
    { gx: 12, gy: 7 },
    { gx: 10, gy: 9 },
  ];

  /** 计算每颗星在像素坐标下的中心与指向角 */
  function layout(W) {
    const u = W / 30;
    const H = u * 20;
    const cx = (g) => g * u;
    const cy = (g) => g * u;
    const big = { x: cx(BIG.gx), y: cy(BIG.gy), R: BIG.R * u };
    const small = SMALL.map((s) => {
      const x = cx(s.gx), y = cy(s.gy);
      /* 角尖指向大星中心：注意 canvas 的 y 轴向下 */
      const rot = Math.atan2(big.y - y, big.x - x) / D2R;
      return { x, y, R: 1 * u, rot };
    });
    return { u, W, H, big, small };
  }

  /** 画一颗五角星（可传入进度 progress 做"逐颗画出"的动画） */
  function drawStar(ctx, x, y, R, rotDeg, color, progress = 1) {
    if (progress <= 0) return;
    const pts = starPoints(R, rotDeg);
    const n = pts.length;
    const total = n;
    const drawn = Math.max(2, Math.ceil(total * progress));
    ctx.beginPath();
    ctx.moveTo(x + pts[0][0], y + pts[0][1]);
    for (let i = 1; i < drawn; i++) {
      ctx.lineTo(x + pts[i][0], y + pts[i][1]);
    }
    if (progress >= 1) {
      ctx.closePath();
    } else {
      /* 动画中：最后一个点沿边插值，看起来像"笔尖在走" */
      const k = total * progress - (drawn - 1);
      const a = pts[drawn - 1], b = pts[drawn % n];
      ctx.lineTo(x + a[0] + (b[0] - a[0]) * k, y + a[1] + (b[1] - a[1]) * k);
    }
    ctx.fillStyle = color;
    ctx.fill();
  }

  /**
   * 绘制国旗
   * @param {number} reveal 0..1 旗面揭幕进度
   * @param {number} starP  0..1 五角星绘制总进度
   */
  function draw(ctx, x, y, W, reveal = 1, starP = 1) {
    const L = layout(W);
    const H = L.H;

    ctx.save();
    /* 旗面：从左向右揭开 */
    const rw = W * U.clamp(reveal, 0, 1);
    if (rw > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, rw, H);
      ctx.clip();
      ctx.fillStyle = RED;
      ctx.fillRect(x, y, W, H);
      /* 轻微立体感：底部压暗 */
      const g = ctx.createLinearGradient(0, y, 0, y + H);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.55, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, W, H);
      ctx.restore();
    }

    /* 五颗星：按国标位置，依次绘制 */
    const starBudget = starP * 5;
    const stars = [{ ...L.big, rot: -90 }, ...L.small];
    for (let i = 0; i < stars.length; i++) {
      const p = U.clamp(starBudget - i, 0, 1);
      if (p <= 0) break;
      const s = stars[i];
      drawStar(ctx, x + s.x, y + s.y, s.R, s.rot, YELLOW, p);
    }
    ctx.restore();
    return L;
  }

  return { RED, YELLOW, RHO, starPoints, layout, drawStar, draw, BIG, SMALL };
})();