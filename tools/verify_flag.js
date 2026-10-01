'use strict';
// 纯逻辑校验：在 vm 沙箱里加载 flag.js，核对国标几何
const vm = require('vm');
const fs = require('fs');
const sandbox = {
  Math, console, JSON,
  U: { clamp: (v, a, b) => (v < a ? a : v > b ? b : v) },
  document: { createElement: () => ({ getContext: () => ({}) }) },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('web/js/flag.js', 'utf8') + '\n;globalThis.__F = Flag;', sandbox);
const F = sandbox.__F;

let fails = 0;
const ok = (cond, msg, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + msg + (extra !== undefined ? '   [' + extra + ']' : ''));
  if (!cond) fails++;
};

const W = 900, u = W / 30;
const L = F.layout(W);
console.log('== 旗面 ==');
ok(Math.abs(L.W / L.H - 1.5) < 1e-12, '长宽比 = 3:2', (L.W / L.H).toFixed(6));
ok(Math.abs(L.u - 30) < 1e-12, '格边长 u = W/30', L.u);

console.log('== 大五角星 ==');
ok(Math.abs(L.big.x / u - 5) < 1e-12 && Math.abs(L.big.y / u - 5) < 1e-12, '中心在 (5,5) 格', (L.big.x / u) + ',' + (L.big.y / u));
ok(Math.abs(L.big.R / u - 3) < 1e-12, '外接圆半径 = 3u', L.big.R / u);

console.log('== 四颗小五角星 ==');
const want = [[10, 2], [12, 4], [12, 7], [10, 9]];
L.small.forEach((s, i) => {
  ok(Math.abs(s.x / u - want[i][0]) < 1e-12 && Math.abs(s.y / u - want[i][1]) < 1e-12,
    '小星' + (i + 1) + ' 中心 (' + want[i][0] + ',' + want[i][1] + ')', (s.x / u) + ',' + (s.y / u));
  ok(Math.abs(s.R / u - 1) < 1e-12, '小星' + (i + 1) + ' 半径 = 1u', s.R / u);
});

console.log('== 五角星几何 ==');
const pts = F.starPoints(100, -90);
const rs = pts.map((p) => Math.hypot(p[0], p[1]));
const rmax = Math.max(...rs), rmin = Math.min(...rs);
ok(pts.length === 10, '10 个顶点', pts.length);
ok(Math.abs(rmin / rmax - F.RHO) < 1e-12, '内/外半径比 = (3-√5)/2', (rmin / rmax).toFixed(12));
ok(Math.abs(rmin / rmax - 0.381966011250105) < 1e-9, '与理论值 ρ 吻合', F.RHO.toFixed(12));
// 角尖正上方
const tip = F.starPoints(100, -90)[0];
ok(Math.abs(tip[0]) < 1e-12 && tip[1] < 0, '角尖指向正上方', tip.map((v) => v.toFixed(9)).join(','));

console.log('== 小星角尖必须正对大星中心 ==');
L.small.forEach((s, i) => {
  const wantDeg = (Math.atan2(L.big.y - s.y, L.big.x - s.x) * 180) / Math.PI;
  const tipPt = F.starPoints(s.R, s.rot)[0];
  const gotDeg = (Math.atan2(tipPt[1], tipPt[0]) * 180) / Math.PI;
  let diff = Math.abs(gotDeg - wantDeg) % 360;
  if (diff > 180) diff = 360 - diff;
  ok(diff < 1e-9, '小星' + (i + 1) + ' 角尖指向大星中心', '误差 ' + diff.toExponential(2) + '°');
});

console.log('\n' + (fails ? '!! 失败 ' + fails + ' 项' : '全部通过 ✔'));
process.exit(fails ? 1 : 0);