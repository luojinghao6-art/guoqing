'use strict';
/**
 * app.js —— 主程序：场景时间轴 + 渲染循环 + 交互
 *
 * 设计要点
 * ─────────
 * 1) 时间轴驱动：整部作品被切成 6 个场景，每个场景只管画"自己那一段"。
 *    所有动画都由"当前时刻 t"算出，不做自增状态 —— 这样任意时刻都能跳过去。
 * 2) 确定性渲染：URL 加 ?t=12.5 就能直接渲染第 12.5 秒的画面（配合可播种随机数），
 *    因此可以用无头浏览器逐帧截图、合成演示视频，画面和实时播放完全一致。
 * 3) 交互：点击任意位置放一朵烟花；空格暂停；R 重播；G 看国标网格；F 全屏。
 */
(() => {
  const { clamp, lerp, TAU, rand, randInt, pick, easeOutCubic, easeOutQuint, easeOutExpo, easeOutBack, easeInOutCubic } = U;

  const qs = new URLSearchParams(location.search);
  const FIXED_T = qs.has('t') ? parseFloat(qs.get('t')) : null;
  const FIXED_SCENE = qs.has('scene') ? parseInt(qs.get('scene'), 10) : null;
  const SHOW_HUD = qs.get('hud') !== '0';
  const SHOW_GRID_DEFAULT = qs.get('grid') === '1';

  /* ==================== 画布 ==================== */
  const cv = document.getElementById('stage');
  const ctx = cv.getContext('2d', { alpha: false });
  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildStars();
  }

  /* ==================== 场景时间轴 ==================== */
  const SCENES = [
    { id: 'open',   name: '启幕',     dur: 5.5 },
    { id: 'flag',   name: '五星红旗', dur: 8.5 },
    { id: 'map',    name: '锦绣山河', dur: 10.5 },
    { id: 'words',  name: '深情告白', dur: 9.0 },
    { id: 'show',   name: '烟花盛典', dur: 12.0 },
    { id: 'finale', name: '祝福祖国', dur: 9.0 },
  ];
  const TOTAL = SCENES.reduce((s, x) => s + x.dur, 0);

  function locate(t) {
    let acc = 0;
    for (let i = 0; i < SCENES.length; i++) {
      if (t < acc + SCENES[i].dur) return { i, local: t - acc, dur: SCENES[i].dur, s: SCENES[i] };
      acc += SCENES[i].dur;
    }
    const last = SCENES.length - 1;
    return { i: last, local: SCENES[last].dur, dur: SCENES[last].dur, s: SCENES[last] };
  }
  function sceneStart(i) { let a = 0; for (let k = 0; k < i; k++) a += SCENES[k].dur; return a; }

  /* ==================== 背景：星空 ==================== */
  let stars = [];
  function buildStars() {
    U.srand(20261001);
    stars = [];
    const n = Math.round((W * H) / 9000);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: rand(0, W), y: rand(0, H * 0.94),
        r: rand(0.35, 1.5) * (rand() < 0.08 ? 1.9 : 1),
        a: rand(0.18, 0.85),
        ph: rand(0, TAU),
        sp: rand(0.6, 2.4),
      });
    }
  }

  function drawSky(t) {
    /* 夜空渐变 */
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1024');
    g.addColorStop(0.42, '#121a36');
    g.addColorStop(0.78, '#1c1428');
    g.addColorStop(1, '#2a0f14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* 星点 */
    ctx.globalCompositeOperation = 'lighter';
    for (const s of stars) {
      const a = s.a * (0.55 + 0.45 * Math.sin(t * s.sp + s.ph));
      ctx.fillStyle = 'rgba(255,248,225,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    /* 底部一抹极淡的暖光，暗示远方灯火；真正的"地面"由场景自己画 */
    const hy = H * 0.94;
    const hg = ctx.createLinearGradient(0, hy - H * 0.22, 0, hy);
    hg.addColorStop(0, 'rgba(0,0,0,0)');
    hg.addColorStop(1, 'rgba(150,50,24,0.13)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, hy - H * 0.22, W, H * 0.22);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** 广场地面：一条地平线 + 向下渐隐的暗色 + 地面反光 */
  function drawGround(hy) {
    const gg = ctx.createLinearGradient(0, hy, 0, H);
    gg.addColorStop(0, 'rgba(38,16,20,0.75)');
    gg.addColorStop(0.35, 'rgba(20,9,14,0.88)');
    gg.addColorStop(1, 'rgba(6,4,9,0.97)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, hy, W, H - hy);

    /* 地平线暖光带（贴着地面线，向上渐隐） */
    const hg = ctx.createLinearGradient(0, hy - H * 0.16, 0, hy);
    hg.addColorStop(0, 'rgba(0,0,0,0)');
    hg.addColorStop(1, 'rgba(255,132,52,0.22)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, hy - H * 0.16, W, H * 0.16);

    /* 地平线亮线 */
    ctx.strokeStyle = 'rgba(255,170,90,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, hy + 0.5);
    ctx.lineTo(W, hy + 0.5);
    ctx.stroke();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ==================== 灯笼 ==================== */
  const lanterns = [];
  function spawnLanterns(n) {
    for (let i = 0; i < n; i++) {
      lanterns.push({
        x: rand(W * 0.06, W * 0.94),
        y: rand(H * 1.05, H * 1.5),
        vy: rand(-26, -13),
        sway: rand(0.4, 1.1),
        ph: rand(0, TAU),
        s: rand(0.5, 1.15),
        hue: rand(2, 16),
      });
    }
  }
  function drawLanterns(dt, t) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = lanterns.length - 1; i >= 0; i--) {
      const L = lanterns[i];
      L.y += L.vy * dt;
      const x = L.x + Math.sin(t * L.sway + L.ph) * 22;
      if (L.y < -80) { lanterns.splice(i, 1); continue; }
      const s = 13 * L.s;
      const g = ctx.createRadialGradient(x, L.y, 0, x, L.y, s * 3.2);
      g.addColorStop(0, 'rgba(255,228,150,0.55)');
      g.addColorStop(0.3, 'rgba(255,120,40,0.28)');
      g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, L.y, s * 3.2, 0, TAU);
      ctx.fill();
      /* 灯体 */
      ctx.fillStyle = 'hsla(' + L.hue + ',92%,52%,0.9)';
      ctx.beginPath();
      ctx.ellipse(x, L.y, s * 0.62, s * 0.82, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,235,170,0.75)';
      ctx.fillRect(x - s * 0.34, L.y - s * 0.94, s * 0.68, s * 0.14);
      ctx.fillRect(x - s * 0.34, L.y + s * 0.8, s * 0.68, s * 0.14);
      /* 流苏 */
      ctx.strokeStyle = 'rgba(255,200,90,0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, L.y + s * 0.94);
      ctx.lineTo(x + Math.sin(t * 2 + L.ph) * 3, L.y + s * 1.7);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ==================== 烟花管理器 ==================== */
  const fw = new FX.Fireworks(7000);
  const PALETTE = [0, 12, 28, 45, 52, 300, 330, 200, 165, 96];

  function randSpec(scale = 1) {
    const kinds = ['peony', 'peony', 'chrysanthemum', 'willow', 'ring', 'doubleRing', 'palm', 'star', 'heart'];
    const kind = pick(kinds);
    return {
      kind,
      hue: pick(PALETTE),
      n: Math.round(randInt(80, 170) * scale),
      spd: rand(200, 330) * scale,
      shake: rand(0, 7),
      flash: rand(140, 260),
    };
  }

  /** 在指定位置发射一朵烟花 */
  function launchAt(x, y, spec) {
    const s = spec || randSpec();
    const targetY = y;
    const vy = -Math.sqrt(Math.max(1, 2 * 46 * (H - targetY)));
    fw.launch(x, H * 0.99, { ...s, vy, vx: rand(-30, 30), fuse: 10 });
  }

  /** 点哪儿炸哪儿 */
  function burstAt(x, y, spec) {
    fw.burst(x, y, { ...(spec || randSpec()), shake: rand(3, 8) });
  }

  /* ==================== 场景绘制 ==================== */
  const capEl = document.getElementById('caption');
  let capNow = '';
  function caption(text) {
    if (text === capNow) return;
    capNow = text;
    if (!text) { capEl.classList.remove('is-on'); return; }
    capEl.textContent = text;
    capEl.classList.add('is-on');
  }

  const gridOn = { v: SHOW_GRID_DEFAULT };

  /* ---------- 场景 1：启幕 ---------- */
  function sceneOpen(t, local, dur) {
    const p = clamp(local / dur, 0, 1);
    const rise = easeOutCubic(clamp(local / 2.2, 0, 1));

    /* 祥云 */
    for (let i = 0; i < 5; i++) {
      const cx = ((t * (8 + i * 5) + i * W * 0.24) % (W + 520)) - 260;
      Landmarks.drawCloud(ctx, cx, H * (0.30 + i * 0.075), 150 + i * 34, { alpha: 0.20 - i * 0.022 });
    }

    /* 天安门 */
    const bw = Math.min(W * 0.82, H * 1.45);
    const baseY = H * (0.93 - 0.05 * (1 - rise));
    drawGround(baseY);
    ctx.save();
    ctx.globalAlpha = clamp(local / 1.6, 0, 1);
    /* 建筑背后的光晕 */
    const gl = ctx.createRadialGradient(W / 2, baseY - bw * 0.2, 0, W / 2, baseY - bw * 0.2, bw * 0.75);
    gl.addColorStop(0, 'rgba(255,150,60,0.24)');
    gl.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);
    Landmarks.drawTiananmen(ctx, W / 2, baseY, bw, {
      alpha: clamp(local / 1.4, 0, 1),
      glow: true,
    });
    ctx.restore();

    /* 地面倒影：以地面线为轴上下翻转，并裁掉越界部分 */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, baseY, W, H - baseY);
    ctx.clip();
    ctx.globalAlpha = 0.16 * clamp(local / 2, 0, 1);
    ctx.translate(0, baseY * 2);
    ctx.scale(1, -1);
    Landmarks.drawTiananmen(ctx, W / 2, baseY, bw, { alpha: 0.5 });
    ctx.restore();

    caption('1949 — 2026 ｜ 庆祝中华人民共和国成立 77 周年');

    /* 尾声来两朵烟花 */
    if (local > 3.2 && local < 4.4) {
      if (rand() < 0.06) launchAt(rand(W * 0.16, W * 0.84), rand(H * 0.16, H * 0.34), randSpec(0.8));
    }
  }

  /* ---------- 场景 2：五星红旗 ---------- */
  function sceneFlag(t, local, dur) {
    const p = clamp(local / dur, 0, 1);
    const reveal = clamp(local / 1.5, 0, 1);
    const starP = clamp((local - 1.3) / 2.6, 0, 1);

    const fw2 = Math.min(W * 0.72, H * 1.02);
    const L = Flag.layout(fw2);
    const fx = (W - fw2) / 2;
    const fy = H * 0.5 - L.H * 0.5 - H * 0.03;

    /* 背后光晕 */
    const gl = ctx.createRadialGradient(W / 2, fy + L.H / 2, 0, W / 2, fy + L.H / 2, fw2 * 0.85);
    gl.addColorStop(0, 'rgba(222,41,16,0.30)');
    gl.addColorStop(1, 'rgba(222,41,16,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);

    /* 国标网格：30 × 20 */
    if (gridOn.v) {
      ctx.save();
      ctx.globalAlpha = clamp((local - 0.35) / 0.8, 0, 1) * 0.55;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      for (let i = 0; i <= 30; i++) {
        const x = fx + i * L.u;
        ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x, fy + L.H); ctx.stroke();
      }
      for (let j = 0; j <= 20; j++) {
        const y = fy + j * L.u;
        ctx.beginPath(); ctx.moveTo(fx, y); ctx.lineTo(fx + fw2, y); ctx.stroke();
      }
      ctx.setLineDash([]);
      /* 星心标记 */
      ctx.fillStyle = 'rgba(120,220,255,0.95)';
      const marks = [[5, 5], [10, 2], [12, 4], [12, 7], [10, 9]];
      for (const [gx, gy] of marks) {
        const x = fx + gx * L.u, y = fy + gy * L.u;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(120,220,255,0.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke();
      }
      /* 尺寸标注 */
      ctx.fillStyle = 'rgba(150,235,255,0.95)';
      ctx.font = '600 12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('3u', fx + 5 * L.u, fy + 5 * L.u - L.big.R - 8);
      ctx.fillText('u', fx + 12 * L.u, fy + 4 * L.u - L.u - 7);
      ctx.restore();
    }

    /* 国旗本体 */
    ctx.save();
    ctx.shadowColor = 'rgba(255,90,40,0.55)';
    ctx.shadowBlur = 46;
    Flag.draw(ctx, fx, fy, fw2, reveal, starP);
    ctx.restore();

    /* 旗杆 */
    ctx.save();
    ctx.globalAlpha = clamp(local / 0.8, 0, 1);
    const px = fx - 6;
    const pg = ctx.createLinearGradient(px - 5, 0, px + 5, 0);
    pg.addColorStop(0, '#6b6f78'); pg.addColorStop(0.45, '#e6ebf2'); pg.addColorStop(1, '#7d828c');
    ctx.fillStyle = pg;
    ctx.fillRect(px - 4, fy - 26, 8, L.H + 60);
    ctx.beginPath();
    ctx.arc(px, fy - 30, 7, 0, TAU);
    ctx.fillStyle = '#ffde00';
    ctx.fill();
    ctx.restore();

    /* 飘落的金色粒子 */
    if (rand() < 0.5) {
      fw.emit({
        x: rand(fx, fx + fw2), y: fy + L.H + rand(0, 40),
        vx: rand(-14, 14), vy: rand(-42, -14),
        hue: 46, sat: 100, light: rand(62, 84),
        size: rand(1, 2.2), maxLife: rand(1.6, 3.2), grav: 16, drag: 0.99, flicker: 0.35,
      });
    }

    /* 字幕分三句讲清国标 */
    if (local < 3.0) caption('国旗长宽比 3 : 2 ｜ 旗面等分 30 × 20 格，每格边长 u');
    else if (local < 5.6) caption('大五角星：中心 (5, 5)，外接圆半径 3u，一角尖正上方');
    else if (local < 7.6) caption('四颗小星：半径 1u，各有一个角尖正对大五角星中心');
    else caption('中华人民共和国国旗 · 五星红旗 ｜ 严格按国标几何绘制');
  }

  /* ---------- 场景 3：锦绣山河 ---------- */
  let mapInited = false;
  function sceneMap(t, local, dur) {
    const d = ChinaMap.load();
    const conv = clamp((local - 0.4) / 5.2, 0, 1);      // 点阵汇聚
    const provK = clamp((local - 4.6) / 4.0, 0, 1);     // 省份染红
    const cityK = clamp((local - 5.4) / 4.4, 0, 1);     // 城市点亮

    /* 视口：地图放右侧，左侧留给文字 */
    const availH = H * 0.80;
    const scale = Math.min(availH / d.box[3], (W * 0.60) / d.box[2]);
    const mw = d.box[2] * scale, mh = d.box[3] * scale;
    const mx = W * 0.5 - mw * 0.5 + (1 - easeOutCubic(conv)) * W * 0.02;
    const my = H * 0.5 - mh * 0.5 + H * 0.01;

    /* 汇聚起点：地图下方 */
    const gl = ctx.createRadialGradient(mx + mw / 2, my + mh * 0.62, 0, mx + mw / 2, my + mh * 0.62, mw * 0.85);
    gl.addColorStop(0, 'rgba(255,170,60,' + (0.16 * conv).toFixed(3) + ')');
    gl.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, H);

    /* 先描轮廓（淡淡的） */
    ChinaMap.drawOutline(ctx, mx, my, scale, {
      alpha: 0.16 + 0.34 * clamp((conv - 0.55) / 0.45, 0, 1),
      stroke: 'rgba(255,196,80,0.9)',
      lineWidth: 1.25,
    });

    /* 省份染红 */
    if (provK > 0) ChinaMap.drawProvincesGlow(ctx, mx, my, scale, provK, t, { base: 0.09, peak: 0.32 });

    /* 点阵 */
    ChinaMap.drawDots(ctx, mx, my, scale, conv, t, { color: [255, 205, 82], dotSize: 1.85 });

    /* 轮廓再次叠加，让边界清晰 */
    ChinaMap.drawOutline(ctx, mx, my, scale, {
      alpha: 0.30 + 0.55 * clamp((conv - 0.7) / 0.3, 0, 1),
      stroke: 'rgba(255,214,110,0.95)',
      lineWidth: 1.35,
    });

    /* 城市 */
    if (cityK > 0) ChinaMap.drawCities(ctx, mx, my, scale, cityK, t, { labels: scale > 0.45 });

    /* 南海诸岛 */
    ChinaMap.drawInset(ctx, mx, my, scale, { alpha: clamp((local - 2.2) / 1.2, 0, 1) });

    /* 汇聚阶段：从下方飞出的光点 */
    if (conv < 0.96 && rand() < 0.75) {
      const a = rand(0, TAU);
      const r = rand(60, Math.max(W, H) * 0.6);
      fw.emit({
        x: mx + mw / 2 + Math.cos(a) * r * 1.3,
        y: my + mh * 1.15 + rand(0, 140),
        vx: -Math.cos(a) * r * 0.35, vy: -rand(180, 420),
        hue: 44, sat: 100, light: rand(60, 82),
        size: rand(1, 2.0), maxLife: rand(0.9, 1.7), grav: 60, drag: 0.965, trail: 5, flicker: 0.3,
      });
    }

    /* 全部成型后来几朵烟花 */
    if (local > 8.0 && rand() < 0.10) launchAt(rand(W * 0.14, W * 0.86), rand(H * 0.12, H * 0.30), randSpec(0.85));

    if (local < 2.4) caption('用 23000 个光点，拼出这片锦绣山河');
    else if (local < 4.6) caption('省级行政区依次点亮 ｜ 一点都不能少');
    else if (local < 7.0) caption('主要城市依次亮起，如星河洒落人间');
    else caption('中国 · 34 个省级行政区 ｜ 含南海诸岛及九段线');
  }

  /* ---------- 场景 4：深情告白（文字烟花） ---------- */
  let wordFired = [false, false];
  function sceneWords(t, local, dur) {
    const fw2 = Math.min(W * 0.72, H * 1.02);

    if (!wordFired[0] && local > 0.9) {
      wordFired[0] = true;
      fw.burst(W / 2, H * 0.44, {
        kind: 'text', text: '我爱你中国', fontPx: Math.round(Math.min(W * 0.11, H * 0.185)),
        hue: 45, scale: 1, morphAt: 0.85, morphDur: 1.15, maxLife: 5.2, flash: 260, shake: 6,
      });
    }
    if (!wordFired[1] && local > 5.0) {
      wordFired[1] = true;
      fw.burst(W / 2, H * 0.40, {
        kind: 'text', text: '祖国万岁', fontPx: Math.round(Math.min(W * 0.085, H * 0.15)),
        hue: 0, scale: 1, morphAt: 0.8, morphDur: 1.0, maxLife: 3.6, flash: 200,
      });
    }

    /* 持续的烟花烘托 */
    if (rand() < 0.11) launchAt(rand(W * 0.10, W * 0.90), rand(H * 0.10, H * 0.30), randSpec(0.9));
    if (local > 1.2 && local < 3.2 && rand() < 0.06) launchAt(rand(W * 0.15, W * 0.85), rand(H * 0.16, H * 0.34), randSpec(1.0));

    if (local < 4.4) caption('把心里的话，炸成漫天花火');
    else caption('我爱你，中国');
  }

  /* ---------- 场景 5：烟花盛典 ---------- */
  let showT = 0;
  function sceneShow(t, local, dur) {
    /* 由密到疏的编排 */
    const dens = local < 5 ? 0.20 : local < 9 ? 0.14 : 0.10;
    if (rand() < dens) launchAt(rand(W * 0.06, W * 0.94), rand(H * 0.08, H * 0.36), randSpec(rand(0.85, 1.25)));
    /* 齐射 */
    if (Math.abs(local - 2.0) < 0.05 || Math.abs(local - 6.5) < 0.05 || Math.abs(local - 10.0) < 0.05) {
      for (let i = 0; i < 6; i++) {
        launchAt(W * (0.10 + i * 0.16), rand(H * 0.10, H * 0.28), randSpec(1.15));
      }
    }
    /* 心形烟花（祝福） */
    if (Math.abs(local - 4.2) < 0.04) {
      fw.burst(W * 0.5, H * 0.40, { kind: 'heart', hue: 348, S: H * 0.26, n: 150, maxLife: 2.4, flash: 240, shake: 5 });
    }
    /* 五角星烟花（国庆） */
    if (Math.abs(local - 8.2) < 0.04) {
      fw.burst(W * 0.5, H * 0.40, { kind: 'star', hue: 46, R: H * 0.28, maxLife: 2.2, flash: 250, shake: 5 });
    }
    /* 灯笼 */
    if (local < 0.6 && lanterns.length < 26) spawnLanterns(26);
    drawLanterns(1 / 60, t);

    caption(local < 5 ? '花火璀璨，为你而燃' : local < 9 ? '繁荣昌盛 · 国泰民安' : '愿山河无恙 · 愿家国同安');
  }

  /* ---------- 场景 6：祝福祖国（大合影） ---------- */
  function sceneFinale(t, local, dur) {
    const d = ChinaMap.load();
    const k = clamp(local / 1.8, 0, 1);
    const e = easeOutCubic(k);

    /* 国旗在左，地图在右 */
    const fw2 = Math.min(W * 0.34, H * 0.52);
    const L = Flag.layout(fw2);
    const fx = W * 0.5 - fw2 * 0.5 - W * 0.19 * e;
    const fy = H * 0.42 - L.H * 0.5 - H * 0.02 * e;

    ctx.save();
    ctx.globalAlpha = e;
    ctx.shadowColor = 'rgba(255,90,40,0.5)';
    ctx.shadowBlur = 34;
    Flag.draw(ctx, fx, fy, fw2, 1, 1);
    ctx.restore();

    const scale = Math.min((H * 0.52) / d.box[3], (W * 0.30) / d.box[2]);
    const mw = d.box[2] * scale, mh = d.box[3] * scale;
    const mx = W * 0.5 + W * 0.05 * e + (W * 0.30 - mw) * 0.5 * e + W * 0.085;
    const my = H * 0.42 - mh * 0.5;

    ctx.save();
    ctx.globalAlpha = e;
    ChinaMap.drawDots(ctx, mx, my, scale, 1, t, { color: [255, 205, 82], dotSize: 1.7 });
    ChinaMap.drawOutline(ctx, mx, my, scale, { alpha: 0.85 * e, stroke: 'rgba(255,214,110,0.95)', lineWidth: 1.2 });
    ChinaMap.drawInset(ctx, mx, my, scale, { alpha: 0.9 * e });
    ctx.restore();

    /* 持续烟花 */
    if (rand() < 0.16) launchAt(rand(W * 0.05, W * 0.95), rand(H * 0.06, H * 0.30), randSpec(rand(0.9, 1.3)));
    if (Math.abs(local - 0.5) < 0.05 || Math.abs(local - 4.0) < 0.05) {
      for (let i = 0; i < 8; i++) launchAt(W * (0.08 + i * 0.12), rand(H * 0.08, H * 0.26), randSpec(1.2));
    }

    /* 大字祝福 */
    if (local > 1.6) {
      const a = clamp((local - 1.6) / 1.0, 0, 1);
      const pop = easeOutBack(clamp((local - 1.6) / 0.9, 0, 1));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fs = Math.min(W * 0.115, H * 0.15) * (0.9 + 0.1 * pop);
      ctx.font = '900 ' + fs.toFixed(1) + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
      const g = ctx.createLinearGradient(0, H * 0.72 - fs * 0.6, 0, H * 0.72 + fs * 0.6);
      g.addColorStop(0, '#fff8d8');
      g.addColorStop(0.42, '#ffde00');
      g.addColorStop(0.72, '#ffab1f');
      g.addColorStop(1, '#fff0b8');
      ctx.shadowColor = 'rgba(255,140,20,0.85)';
      ctx.shadowBlur = 40;
      ctx.fillStyle = g;
      ctx.fillText('祝 福 祖 国', W / 2, H * 0.755);
      ctx.restore();
    }

    caption(local < 1.6 ? '山河为证，岁月为名' : '祝愿伟大祖国繁荣昌盛 · 国泰民安');
  }

  /* ==================== 主循环 ==================== */
  let clock = 0;         // 作品内时间（秒）
  let playing = true;
  let last = 0;
  let ready = false;

  function resetAll() {
    clock = 0;
    wordFired = [false, false];
    fw.active.length = 0;
    fw.shells.length = 0;
    fw.flashes.length = 0;
    fw.launched = 0; fw.bursts = 0; fw.shake = 0;
    lanterns.length = 0;
    ChinaMap.resetDots();
    capNow = '__';
    caption('');
    U.srand(20261001);
    buildStars();
  }

  /** 推进到指定时刻（用于确定性渲染 / 跳转） */
  function seekTo(target) {
    if (target < clock) resetAll();
    const step = 1 / 60;
    let guard = 0;
    while (clock < target - 1e-9 && guard++ < 20000) {
      stepSim(Math.min(step, target - clock));
    }
  }

  function stepSim(dt) {
    clock += dt;
    const loc = locate(clock);
    updateFor(loc, dt);
    fw.update(dt, clock);
  }

  /** 场景内需要"逐帧推进"的逻辑（发射烟花等） */
  function updateFor(loc, dt) {
    const { s, local, dur } = loc;
    switch (s.id) {
      case 'open':
        if (local > 3.2 && local < 4.6 && U.R() < 0.035) launchAt(U.rand(W * 0.16, W * 0.84), U.rand(H * 0.16, H * 0.34), randSpec(0.8));
        break;
      case 'flag':
        if (U.R() < 0.28) fw.emit({
          x: U.rand(W * 0.18, W * 0.82), y: U.rand(H * 0.72, H * 0.98),
          vx: U.rand(-12, 12), vy: U.rand(-46, -16), hue: 46, sat: 100, light: U.rand(62, 84),
          size: U.rand(1, 2.2), maxLife: U.rand(1.6, 3.2), grav: 14, drag: 0.99, flicker: 0.35,
        });
        break;
      case 'map':
        if (local < 5.6 && U.R() < 0.5) {
          const a = U.rand(0, U.TAU), r = U.rand(60, Math.max(W, H) * 0.6);
          fw.emit({
            x: W * 0.5 + Math.cos(a) * r * 1.3, y: H * 0.62 + H * 0.55 + U.rand(0, 140),
            vx: -Math.cos(a) * r * 0.35, vy: -U.rand(180, 420), hue: 44, sat: 100, light: U.rand(60, 82),
            size: U.rand(1, 2.0), maxLife: U.rand(0.9, 1.7), grav: 60, drag: 0.965, trail: 5, flicker: 0.3,
          });
        }
        if (local > 8.0 && U.R() < 0.035) launchAt(U.rand(W * 0.14, W * 0.86), U.rand(H * 0.12, H * 0.30), randSpec(0.85));
        break;
      case 'words':
        if (U.R() < 0.045) launchAt(U.rand(W * 0.10, W * 0.90), U.rand(H * 0.10, H * 0.30), randSpec(0.9));
        break;
      case 'show':
        {
          const dens = local < 5 ? 0.075 : local < 9 ? 0.052 : 0.038;
          if (U.R() < dens) launchAt(U.rand(W * 0.06, W * 0.94), U.rand(H * 0.08, H * 0.36), randSpec(U.rand(0.85, 1.25)));
          if (Math.abs(local - 2.0) < dt || Math.abs(local - 6.5) < dt || Math.abs(local - 10.0) < dt) {
            for (let i = 0; i < 6; i++) launchAt(W * (0.10 + i * 0.16), U.rand(H * 0.10, H * 0.28), randSpec(1.15));
          }
          if (Math.abs(local - 4.2) < dt) fw.burst(W * 0.5, H * 0.40, { kind: 'heart', hue: 348, S: H * 0.26, n: 150, maxLife: 2.4, flash: 240, shake: 5 });
          if (Math.abs(local - 8.2) < dt) fw.burst(W * 0.5, H * 0.40, { kind: 'star', hue: 46, R: H * 0.28, maxLife: 2.2, flash: 250, shake: 5 });
          if (local < 0.6 && lanterns.length < 26) spawnLanterns(26);
        }
        break;
      case 'finale':
        if (U.R() < 0.055) launchAt(U.rand(W * 0.05, U.rand(W * 0.5, W * 0.95)), U.rand(H * 0.06, H * 0.30), randSpec(U.rand(0.9, 1.3)));
        if (Math.abs(local - 0.5) < dt || Math.abs(local - 4.0) < dt) {
          for (let i = 0; i < 8; i++) launchAt(W * (0.08 + i * 0.12), U.rand(H * 0.08, H * 0.26), randSpec(1.2));
        }
        break;
    }
    /* 文字烟花：在场景内只触发一次，这里用 clock 判断 */
    if (s.id === 'words') {
      const st = sceneStart(3);
      if (!wordFired[0] && clock - st > 0.9) {
        wordFired[0] = true;
        fw.burst(W / 2, H * 0.44, {
          kind: 'text', text: '我爱你中国', fontPx: Math.round(Math.min(W * 0.11, H * 0.185)),
          hue: 45, scale: 1, morphAt: 0.85, morphDur: 1.15, maxLife: 5.2, flash: 260, shake: 6,
        });
      }
      if (!wordFired[1] && clock - st > 5.0) {
        wordFired[1] = true;
        fw.burst(W / 2, H * 0.40, {
          kind: 'text', text: '祖国万岁', fontPx: Math.round(Math.min(W * 0.085, H * 0.15)),
          hue: 0, scale: 1, morphAt: 0.8, morphDur: 1.0, maxLife: 3.6, flash: 200,
        });
      }
    }
  }

  function render() {
    const loc = locate(clock);
    /* 抖动 */
    const sh = fw.shake;
    ctx.save();
    if (sh > 0.2) ctx.translate(rand(-sh, sh), rand(-sh, sh));

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawSky(clock);

    /* 场景绘制 */
    ctx.save();
    switch (loc.s.id) {
      case 'open':   sceneOpen(clock, loc.local, loc.dur); break;
      case 'flag':   sceneFlag(clock, loc.local, loc.dur); break;
      case 'map':    sceneMap(clock, loc.local, loc.dur); break;
      case 'words':  sceneWords(clock, loc.local, loc.dur); break;
      case 'show':   sceneShow(clock, loc.local, loc.dur); break;
      case 'finale': sceneFinale(clock, loc.local, loc.dur); break;
    }
    ctx.restore();

    /* 烟花层 */
    fw.render(ctx, 1);
    ctx.restore();

    drawVignette();

    /* 场景切换淡入淡出 */
    const fadeIn = clamp(loc.local / 0.55, 0, 1);
    const fadeOut = clamp((loc.dur - loc.local) / 0.55, 0, 1);
    const dark = 1 - Math.min(fadeIn, fadeOut);
    if (dark > 0.001) {
      ctx.fillStyle = 'rgba(5,7,14,' + (dark * 0.85).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function frame(now) {
    if (!ready) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (playing && clock < TOTAL) {
      stepSim(dt);
      if (clock >= TOTAL) clock = TOTAL;
    }
    render();
    updateHud();
    requestAnimationFrame(frame);
  }

  /* ==================== HUD ==================== */
  const hud = document.getElementById('hud');
  const btnPlay = document.getElementById('btnPlay');
  const btnReplay = document.getElementById('btnReplay');
  const btnGrid = document.getElementById('btnGrid');
  const btnFull = document.getElementById('btnFull');
  const scenesEl = document.getElementById('scenes');
  const progressEl = document.getElementById('progress');

  SCENES.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s.name;
    b.addEventListener('click', () => { resetAll(); clock = sceneStart(i) + 0.001; render(); });
    scenesEl.appendChild(b);
  });

  let hudTick = 0;
  function updateHud() {
    if (!SHOW_HUD) return;
    const loc = locate(clock);
    progressEl.style.width = ((clock / TOTAL) * 100).toFixed(2) + '%';
    if (hudTick++ % 12 === 0) {
      [...scenesEl.children].forEach((b, i) => b.classList.toggle('is-active', i === loc.i));
    }
  }

  btnPlay.addEventListener('click', () => {
    playing = !playing;
    btnPlay.textContent = playing ? '⏸' : '▶';
    btnPlay.title = playing ? '暂停 (空格)' : '播放 (空格)';
  });
  btnReplay.addEventListener('click', () => { resetAll(); playing = true; btnPlay.textContent = '⏸'; });
  btnGrid.addEventListener('click', () => {
    gridOn.v = !gridOn.v;
    btnGrid.classList.toggle('is-active', gridOn.v);
  });
  btnFull.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
  btnGrid.classList.toggle('is-active', gridOn.v);

  /* ==================== 交互：点击放烟花 ==================== */
  function onPointer(e) {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX ?? 0) - r.left;
    const y = (e.clientY ?? 0) - r.top;
    burstAt(x, y, { ...randSpec(rand(0.85, 1.15)), shake: 6 });
  }
  cv.addEventListener('pointerdown', onPointer);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); btnPlay.click(); }
    else if (e.key === 'r' || e.key === 'R') btnReplay.click();
    else if (e.key === 'g' || e.key === 'G') btnGrid.click();
    else if (e.key === 'f' || e.key === 'F') btnFull.click();
  });

  window.addEventListener('resize', () => { resize(); render(); });

  /* ==================== 启动 ==================== */
  const gate = document.getElementById('gate');
  const gateBtn = document.getElementById('gateBtn');

  function start() {
    gate.classList.add('is-hidden');
    if (SHOW_HUD) hud.classList.add('is-on');
    playing = true;
    last = 0;
    if (!FIXED_T) requestAnimationFrame(frame);
  }

  function boot() {
    ready = true;          // 关键：放行帧循环，否则 frame() 永远 return，画面黑屏
    resize();
    resetAll();
    if (FIXED_T !== null) {
      /* 确定性渲染：直接推进到指定时刻 */
      clock = 0;
      seekTo(clamp(FIXED_T, 0, TOTAL));
      render();
      gate.classList.add('is-hidden');
      window.__t = clock;
      window.__scene = locate(clock).s.id;
      window.__ready = true;
      window.__dbg = window.__api;
      document.title = '[帧 ' + FIXED_T.toFixed(2) + 's] ' + document.title;
      return;
    }
    if (FIXED_SCENE !== null && FIXED_SCENE >= 0 && FIXED_SCENE < SCENES.length) {
      clock = sceneStart(FIXED_SCENE) + 0.001;
    }
    render();
    /* 遮罩：默认打开后约 1.1 秒自动进入动画（也可立即点击"开启贺卡"），
       传 ?manual=1 可关闭自动播放，保留手动点击开场。 */
    const auto = qs.get('auto') !== '0' && qs.get('manual') !== '1';
    if (auto) setTimeout(start, 1100);
    gateBtn.addEventListener('click', start, { once: true });
    gate.addEventListener('click', (e) => { if (e.target === gate) start(); });
    window.__ready = true;
    window.__dbg = window.__api;
    requestAnimationFrame(frame);
  }

  /* 供外部（录屏脚本）调用的接口 */
  window.__api = {
    /** 跳到 t 秒：若目标在当前位置之后则只推进（避免每次重算，录屏时总开销降到一次模拟） */
    seek(t) {
      if (t < clock) resetAll();
      seekTo(t);
      render();
      updateHud();
      return clock;
    },
    rewind() { resetAll(); render(); return clock; },
    total: TOTAL,
    scenes: SCENES,
    play() { playing = true; },
    pause() { playing = false; },
    stats() { return { t: clock, scene: locate(clock).s.id, particles: fw.active.length, shells: fw.shells.length }; },
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
