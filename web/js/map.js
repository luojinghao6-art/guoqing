'use strict';
/**
 * map.js —— 中国地图模块
 *
 * 数据：阿里云 DataV 公开地理数据（34 个省级行政区 + 南海诸岛九段线），
 *       经 tools/build_map.js 做 Albers 等积圆锥投影 + 扫描线取点后生成 web/data/china-map.js。
 *
 * 性能设计：点阵有 2.3 万个，逐帧画会卡。这里把点阵按"到起点的距离"排好序分成 72 批，
 *           预先画到离屏画布上，每帧只做一次 drawImage —— 汇聚动画就是"分批补齐缓存"。
 */
const ChinaMap = (() => {
  const { clamp, TAU, easeOutCubic, easeOutQuint, rand } = U;

  let DATA = null;
  let cache = null;        // 点阵离屏缓存
  let buckets = null;      // 分批后的点阵
  let cacheDrawn = 0;      // 已画入缓存的批数
  const BATCHES = 72;

  function load() {
    if (!DATA) {
      DATA = window.CHINA_MAP;
      if (!DATA) throw new Error('缺少地图数据：请先执行 node tools/build_map.js');
    }
    return DATA;
  }

  function viewSize() { const d = load(); return [d.box[2], d.box[3]]; }

  /* ---------- 点阵分批：从地图下方中心向外扩散 ---------- */
  function buildBuckets() {
    if (buckets) return buckets;
    const d = load();
    const ox = d.box[2] * 0.5, oy = d.box[3] * 1.12;
    const items = d.dots.map((p, i) => ({
      i,
      key: Math.hypot(p[0] - ox, p[1] - oy) * 0.85 + U.rand(0, 150) + p[1] * 0.25,
    }));
    items.sort((a, b) => a.key - b.key);
    buckets = [];
    for (let k = 0; k < BATCHES; k++) buckets.push([]);
    for (let n = 0; n < items.length; n++) {
      buckets[Math.min(BATCHES - 1, Math.floor((n / items.length) * BATCHES))].push(d.dots[items[n].i]);
    }
    return buckets;
  }

  function paintBatch(c, list, col, size) {
    c.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0.92)';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      c.fillRect(p[0] - size, p[1] - size, size * 2, size * 2);
    }
  }

  function ensureCache(col, size) {
    if (cache) return cache;
    const d = load();
    cache = document.createElement('canvas');
    cache.width = Math.ceil(d.box[2]);
    cache.height = Math.ceil(d.box[3]);
    buckets = buildBuckets();
    cacheDrawn = 0;
    return cache;
  }

  /** 重置汇聚进度（重播时用） */
  function resetDots() {
    if (cache) { cache.getContext('2d').clearRect(0, 0, cache.width, cache.height); cacheDrawn = 0; }
  }

  /* ---------- 1. 省界轮廓 ---------- */
  function traceProvinces(ctx, d) {
    for (const p of d.provinces) {
      ctx.beginPath();
      for (const ring of p.rings) {
        ctx.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
        ctx.closePath();
      }
    }
  }

  function drawOutline(ctx, x, y, scale, o = {}) {
    const d = load();
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.strokeStyle = o.stroke ?? 'rgba(255,206,96,0.85)';
    ctx.lineWidth = (o.lineWidth ?? 1.3) / scale;
    traceProvinces(ctx, d);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- 2. 点阵成图 ---------- */
  function drawDots(ctx, x, y, scale, progress, t, o = {}) {
    const d = load();
    const col = o.color ?? [255, 206, 84];
    const size = o.dotSize ?? 1.75;
    const c = ensureCache(col, size);

    const want = Math.ceil(clamp(progress, 0, 1) * BATCHES);
    if (want < cacheDrawn) resetDots();
    if (want > cacheDrawn) {
      const c2 = c.getContext('2d');
      for (let k = cacheDrawn; k < want; k++) paintBatch(c2, buckets[k], col, size);
      cacheDrawn = want;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalCompositeOperation = 'lighter';

    /* 柔光层：把点阵放大一点点模糊叠加，形成"发光国土" */
    if (progress > 0.02) {
      ctx.globalAlpha = 0.42;
      ctx.filter = 'blur(3.2px)';
      ctx.drawImage(c, 0, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(c, 0, 0);
    ctx.restore();
    return { total: d.dots.length, drawn: Math.floor(clamp(progress, 0, 1) * d.dots.length) };
  }

  /* ---------- 3. 省份依次点亮（山河染红） ---------- */
  function drawProvincesGlow(ctx, x, y, scale, k, t, o = {}) {
    const d = load();
    const list = d.provinces;
    const n = list.length;
    const head = k * n;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    for (let i = 0; i < n; i++) {
      const appear = clamp(head - i, 0, 1);
      if (appear <= 0) break;
      const fade = clamp(1 - (head - i - 1) / 7, 0, 1);
      const a = appear * (o.base ?? 0.10) + appear * fade * (o.peak ?? 0.34);
      const p = list[i];
      ctx.beginPath();
      for (const ring of p.rings) {
        ctx.moveTo(ring[0][0], ring[0][1]);
        for (let j = 1; j < ring.length; j++) ctx.lineTo(ring[j][0], ring[j][1]);
        ctx.closePath();
      }
      ctx.fillStyle = 'rgba(226,52,26,' + a.toFixed(3) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,152,86,' + (a * 2.2).toFixed(3) + ')';
      ctx.lineWidth = 1.0 / scale;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- 4. 城市点亮 ---------- */
  function drawCities(ctx, x, y, scale, k, t, o = {}) {
    const d = load();
    const list = d.cities;
    const n = list.length;
    const head = k * n;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    for (let i = 0; i < n; i++) {
      const appear = clamp(head - i, 0, 1);
      if (appear <= 0) break;
      const age = Math.max(0, head - i - 1);
      const c = list[i];
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 0.85);
      const r = (9 + 6 * pulse) * (0.35 + 0.65 * appear);
      const g = ctx.createRadialGradient(c.p[0], c.p[1], 0, c.p[0], c.p[1], r);
      g.addColorStop(0, 'rgba(255,244,206,' + (0.95 * appear).toFixed(3) + ')');
      g.addColorStop(0.3, 'rgba(255,196,74,' + (0.55 * appear).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,140,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.p[0], c.p[1], r, 0, TAU);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,253,240,' + appear.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(c.p[0], c.p[1], 2.4 * appear, 0, TAU);
      ctx.fill();

      if (age < 1.5) {
        const u = age / 1.5;
        ctx.strokeStyle = 'rgba(255,214,102,' + (0.6 * (1 - u)).toFixed(3) + ')';
        ctx.lineWidth = 1.5 / scale;
        ctx.beginPath();
        ctx.arc(c.p[0], c.p[1], 4 + 30 * easeOutCubic(u), 0, TAU);
        ctx.stroke();
      }
      if (o.labels !== false && appear > 0.45) {
        const a = clamp((appear - 0.45) / 0.55, 0, 1);
        ctx.font = '600 ' + 12 + 'px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillText(c.name, c.p[0] + 0.8, c.p[1] + 7.8);
        ctx.fillStyle = 'rgba(255,240,200,' + (0.95 * a).toFixed(3) + ')';
        ctx.fillText(c.name, c.p[0], c.p[1] + 7);
      }
    }
    ctx.restore();
  }

  /* ---------- 5. 南海诸岛小窗 ---------- */
  function drawInset(ctx, x, y, scale, o = {}) {
    const d = load();
    const ins = d.inset;
    const a = o.alpha ?? 1;
    if (a <= 0.01) return;
    const bx = x + ins.box[0] * scale, by = y + ins.box[1] * scale;
    const bw = ins.box[2] * scale, bh = ins.box[3] * scale;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = o.border ?? 'rgba(255,206,96,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = o.stroke ?? 'rgba(255,206,96,0.9)';
    ctx.lineWidth = 1.9 / scale;
    for (const ring of ins.rings) {
      ctx.beginPath();
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 地标：在指定省份中心画一个标记 */
  function provinceCenter(name) {
    const d = load();
    const p = d.provinces.find((q) => q.name.indexOf(name) === 0);
    return p ? p.label : null;
  }

  return { load, viewSize, drawOutline, drawDots, drawCities, drawProvincesGlow, drawInset, resetDots, provinceCenter };
})();