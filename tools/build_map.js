'use strict';
/**
 * build_map.js —— 把中国 GeoJSON 预处理成网页可直接用的轻量数据
 *
 * 三步：
 *   1) 投影：Albers 等积圆锥投影（中国标准参数：双标准纬线 25°N / 47°N，中央经线 105°E）
 *   2) 抽稀：Douglas–Peucker 简化轮廓，保留形状特征
 *   3) 点阵：扫描线算法求出省界内的交错网格点（用于"点阵成图"动画）
 *
 * 输入：assets/china_full.json   （阿里云 DataV，含 34 个省级行政区 + 南海诸岛/九段线）
 * 输出：assets/china-map.js      （挂载 window.CHINA_MAP）
 * 用法：node tools/build_map.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'china_full.json');
const OUT = path.join(ROOT, 'web', 'data', 'china-map.js');

/* ============ 1. 投影 ============ */
const D2R = Math.PI / 180;
const P1 = 25 * D2R, P2 = 47 * D2R, LON0 = 105 * D2R, PHI0 = 0;

const N_ = (Math.sin(P1) + Math.sin(P2)) / 2;
const CC = Math.cos(P1) ** 2 + 2 * N_ * Math.sin(P1);
const RHO0 = Math.sqrt(CC - 2 * N_ * Math.sin(PHI0)) / N_;

function project(lon, lat) {
  const rho = Math.sqrt(CC - 2 * N_ * Math.sin(lat * D2R)) / N_;
  const th = N_ * (lon * D2R - LON0);
  return [rho * Math.sin(th), -(RHO0 - rho * Math.cos(th))];
}

/* ============ 2. 工具 ============ */
function bboxOf(pts) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of pts) {
    if (p[0] < a) a = p[0];
    if (p[0] > c) c = p[0];
    if (p[1] < b) b = p[1];
    if (p[1] > d) d = p[1];
  }
  return [a, b, c, d];
}

/** Douglas–Peucker 抽稀 */
/** 闭合环抽稀：首尾点重合会让 DP 的基线退化，先按最远点切成两条开放折线 */
function simplifyRing(pts, eps) {
  if (pts.length < 4) return pts.slice();
  const a = pts[0];
  let far = 1, fd = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = (pts[i][0] - a[0]) ** 2 + (pts[i][1] - a[1]) ** 2;
    if (d > fd) { fd = d; far = i; }
  }
  return simplify(pts.slice(0, far + 1), eps).slice(0, -1).concat(simplify(pts.slice(far), eps));
}

/** Douglas-Peucker 抽稀（开放折线） */
function simplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let best = -1, bestD = eps;
    const ax = pts[s][0], ay = pts[s][1], bx = pts[e][0], by = pts[e][1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([s, best], [best, e]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/** 扫描线填充：在闭合环内部按交错网格取点 */
function fillDots(rings, step) {
  const edges = [];
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (a[1] !== b[1]) edges.push(a, b);
      if (a[1] < minY) minY = a[1];
      if (a[1] > maxY) maxY = a[1];
      if (a[0] < minX) minX = a[0];
      if (a[0] > maxX) maxX = a[0];
    }
  }
  const dots = [];
  let row = 0;
  const y0 = Math.ceil(minY / step) * step;
  for (let y = y0; y <= maxY; y += step, row++) {
    const xs = [];
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e], b = edges[e + 1];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    const shift = row % 2 ? step / 2 : 0;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      let x = Math.ceil((xs[k] - shift) / step) * step + shift;
      for (; x < xs[k + 1]; x += step) {
        if (x >= minX && x <= maxX) dots.push([x, y]);
      }
    }
  }
  return dots;
}

/* ============ 3. 读入 + 投影 ============ */
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const geo = JSON.parse(fs.readFileSync(SRC, 'utf8'));

const provinces = [];
const jdRings = [];           // 南海诸岛 / 九段线

for (const f of geo.features) {
  const isJD = f.properties.adchar === 'JD';
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  for (const poly of polys) for (const ring of poly) rings.push(ring.map((c) => project(c[0], c[1])));
  if (isJD) { jdRings.push(...rings); continue; }
  const meta = f.properties;
  provinces.push({ name: meta.name, raw: rings, meta });
}

/* 主图范围：只由省级行政区决定（南海放小窗，符合中国地图规范） */
let allMain = [];
for (const p of provinces) for (const r of p.raw) allMain = allMain.concat(r);
const mainBB = bboxOf(allMain);
const W = 1000;
const pad = 12;
const scale = (W - pad * 2) / (mainBB[2] - mainBB[0]);
const H = Math.round((mainBB[3] - mainBB[1]) * scale + pad * 2);

function normMain(p) { return [(p[0] - mainBB[0]) * scale + pad, (p[1] - mainBB[1]) * scale + pad]; }

/* ============ 4. 生成输出 ============ */
const STEP = 4.1;   // 点阵间距（归一化单位）
const outProvinces = [];
const dotMap = new Map();

provinces.forEach((p, idx) => {
  const rings = p.raw.map((r) => r.map(normMain));
  // 抽稀后再生成点阵，保证边界与点阵同源
  const simp = rings.map((r) => simplifyRing(r, 0.55)).filter((r) => r.length >= 3);
  if (!simp.length) return;

  let label = null;
  if (p.meta.centroid || p.meta.center) {
    label = normMain(project(...(p.meta.centroid || p.meta.center)));
  } else {
    let big = simp[0];
    for (const r of simp) if (r.length > big.length) big = r;
    let sx = 0, sy = 0;
    for (const q of big) { sx += q[0]; sy += q[1]; }
    label = [sx / big.length, sy / big.length];
  }

  const bb = bboxOf(simp.flat());
  outProvinces.push({
    name: p.name,
    short: p.name.replace(/(省|市|自治区|特别行政区|壮族|回族|维吾尔|自治)/g, '').slice(0, 4) || p.name,
    label: [Math.round(label[0] * 10) / 10, Math.round(label[1] * 10) / 10],
    bb: bb.map((v) => Math.round(v * 10) / 10),
    rings: simp.map((r) => r.map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10])),
  });

  for (const d of fillDots(simp, STEP)) {
    const key = Math.round(d[0] / 1.5) + ':' + Math.round(d[1] / 1.5);
    if (!dotMap.has(key)) dotMap.set(key, [Math.round(d[0] * 10) / 10, Math.round(d[1] * 10) / 10, idx]);
  }
});

const dots = [...dotMap.values()];

/* 南海小窗：把九段线 + 南海诸岛单独投影到右下角一个小方框里 */
const jdBB = bboxOf(jdRings.flat());
const insetW = 132, insetH = Math.round(((jdBB[3] - jdBB[1]) / (jdBB[2] - jdBB[0])) * insetW);
const insetX = W - insetW - 16, insetY = H - insetH - 16;
const iScale = insetW / (jdBB[2] - jdBB[0]);
const insetRings = jdRings.map((r) =>
  simplifyRing(r.map((q) => [(q[0] - jdBB[0]) * iScale + insetX, (q[1] - jdBB[1]) * iScale + insetY]), 0.35)
);

/* 主要城市（经纬度 → 图上坐标），用于"城市依次点亮" */
const CITIES = [
  ['北京', 116.41, 39.90], ['上海', 121.47, 31.23], ['广州', 113.26, 23.13],
  ['深圳', 114.06, 22.55], ['西安', 108.94, 34.34], ['成都', 104.07, 30.57],
  ['哈尔滨', 126.53, 45.80], ['乌鲁木齐', 87.62, 43.82], ['拉萨', 91.14, 29.65],
  ['三亚', 109.51, 18.25], ['香港', 114.17, 22.32], ['台北', 121.52, 25.03],
  ['武汉', 114.31, 30.59], ['杭州', 120.15, 30.27], ['重庆', 106.55, 29.56],
  ['昆明', 102.83, 24.88], ['沈阳', 123.43, 41.80], ['郑州', 113.62, 34.75],
];
const cities = CITIES.map(([n, lo, la]) => {
  const q = normMain(project(lo, la));
  return { name: n, p: [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10] };
});

const payload = {
  v: 1,
  box: [0, 0, W, H],
  dotStep: STEP,
  provinces: outProvinces,
  dots,
  inset: {
    box: [insetX, insetY, insetW, insetH],
    rings: insetRings.map((r) => r.map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10])),
  },
  cities,
};

fs.writeFileSync(
  OUT,
  '/* 自动生成，请勿手改：node tools/build_map.js */\nwindow.CHINA_MAP = ' + JSON.stringify(payload) + ';\n',
  'utf8'
);

console.log('主图视口 :', W, 'x', H);
console.log('省级行政区:', outProvinces.length);
console.log('点阵数量 :', dots.length);
console.log('南海小窗 :', insetW, 'x', insetH, '@', insetX, insetY, '| 九段线环:', insetRings.length);
console.log('输出     :', OUT, (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB');
if (!outProvinces.length || !dots.length) { console.error('!! 自检失败：省/点阵为空'); process.exit(1); }
console.log('省名抽查 :', outProvinces.slice(0, 4).map((p) => p.short).join(' / '), '...', outProvinces.slice(-3).map((p) => p.short).join(' / '));