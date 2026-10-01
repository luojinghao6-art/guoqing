'use strict';
/**
 * effects.js —— 粒子与烟花引擎
 *
 * 结构：
 *   Sprite       : 预渲染的"发光圆点"贴图（比每帧画渐变快得多）
 *   Particle     : 单个粒子，支持弹道飞行 / 定点聚合两种运动模式
 *   Shell        : 升空的弹体，飞到最高点炸开
 *   Fireworks    : 管理器，负责发射、更新、绘制
 *
 * 所有随机数都走 U.rand（可播种），所以同一时刻的画面可复现。
 */
const FX = (() => {
  const { rand, randInt, pick, chance, clamp, lerp, TAU, easeOutCubic, easeOutQuint, easeOutExpo } = U;

  /* ================= 发光贴图缓存 ================= */
  const spriteCache = new Map();
  function glow(hue, sat, light) {
    const key = (hue | 0) + '_' + (sat | 0) + '_' + (light | 0);
    let s = spriteCache.get(key);
    if (s) return s;
    const S = 64;
    s = document.createElement('canvas');
    s.width = s.height = S;
    const c = s.getContext('2d');
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'hsla(' + hue + ',' + sat + '%,' + Math.min(96, light + 26) + '%,0.95)');
    g.addColorStop(0.45, 'hsla(' + hue + ',' + sat + '%,' + light + '%,0.45)');
    g.addColorStop(1, 'hsla(' + hue + ',' + sat + '%,' + light + '%,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    spriteCache.set(key, s);
    return s;
  }

  /* ================= 图形采样（心形 / 五角星 / 文字） ================= */
  const shapeCache = new Map();

  /** 从离屏画布上按一定间距采样不透明像素，得到点集（以中心为原点） */
  function sampleCanvas(cv, gap) {
    const c = cv.getContext('2d');
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    const pts = [];
    for (let y = 0; y < cv.height; y += gap) {
      for (let x = 0; x < cv.width; x += gap) {
        if (d[(y * cv.width + x) * 4 + 3] > 128) {
          pts.push([x - cv.width / 2, y - cv.height / 2]);
        }
      }
    }
    return pts;
  }

  /** 五角星点集（外半径 R，rot 为弧度） */
  function starPoints(R, rot) {
    const pts = [];
    const rho = (3 - Math.sqrt(5)) / 2;
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? R * rho : R;
      const a = rot + (i * Math.PI) / 5;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }

  /** 取文字点集，缓存之 */
  function textPoints(text, fontPx, gap) {
    const key = text + '|' + fontPx + '|' + gap;
    if (shapeCache.has(key)) return shapeCache.get(key);
    const pad = Math.round(fontPx * 0.35);
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = '900 ' + fontPx + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
    const w = Math.ceil(meas.measureText(text).width) + pad * 2;
    const h = Math.ceil(fontPx * 1.45) + pad;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    c.font = meas.font;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#fff';
    c.fillText(text, w / 2, h / 2);
    const pts = sampleCanvas(cv, gap);
    shapeCache.set(key, pts);
    return pts;
  }

  /* ================= 粒子 ================= */
  class Particle {
    constructor() { this.alive = false; }

    init(o) {
      this.x = o.x; this.y = o.y;
      this.px = o.x; this.py = o.y;
      this.vx = o.vx; this.vy = o.vy;
      this.hue = o.hue; this.sat = o.sat; this.light = o.light;
      this.size = o.size;
      this.drag = o.drag ?? 0.965;
      this.grav = o.grav ?? 42;
      this.life = 0;
      this.maxLife = o.maxLife;
      this.flicker = o.flicker ?? 0;
      this.trail = o.trail ?? 0;          // 拖尾点数
      this.tape = o.trail ? new Float32Array(o.trail * 2) : null;
      this.tapeN = 0;
      this.tapeHead = 0;
      this.tick = 0;

      /* 聚合模式：飞到 target 位置拼成图形 */
      this.tx = o.tx ?? null; this.ty = o.ty ?? null;
      this.morphAt = o.morphAt ?? 0;
      this.morphDur = o.morphDur ?? 1.1;
      this.morphFrom = null;
      this.alphaMul = o.alphaMul ?? 1;
      this.alive = true;
      return this;
    }

    step(dt, t) {
      this.life += dt;
      if (this.life >= this.maxLife) { this.alive = false; return; }

      /* 记录拖尾 */
      if (this.tape) {
        this.tape[this.tapeHead * 2] = this.x;
        this.tape[this.tapeHead * 2 + 1] = this.y;
        this.tapeHead = (this.tapeHead + 1) % this.trail;
        if (this.tapeN < this.trail) this.tapeN++;
      }

      /* 聚合阶段：缓动飞向目标点 */
      if (this.tx !== null && this.life >= this.morphAt) {
        if (!this.morphFrom) {
          this.morphFrom = [this.x, this.y];
        }
        const u = clamp((this.life - this.morphAt) / this.morphDur, 0, 1);
        const e = easeOutQuint(u);
        this.px = this.x; this.py = this.y;
        this.x = lerp(this.morphFrom[0], this.tx, e);
        this.y = lerp(this.morphFrom[1], this.ty, e);
        return;
      }

      this.px = this.x; this.py = this.y;
      const d = Math.pow(this.drag, dt * 60);
      this.vx *= d;
      this.vy = this.vy * d + this.grav * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    /** 剩余生命比例 */
    get k() { return 1 - this.life / this.maxLife; }

    draw(ctx, glowScale) {
      let a = this.k;
      /* 头部快速衰减，尾部慢衰减，看起来更"耐看" */
      a = a < 0.35 ? a / 0.35 : 1;
      a *= this.alphaMul;
      if (this.flicker) a *= 1 - this.flicker * Math.abs(Math.sin(this.life * 34 + this.hue));
      if (a <= 0.01) return;

      /* 拖尾 */
      if (this.tape && this.tapeN > 2) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'hsla(' + this.hue + ',' + this.sat + '%,' + this.light + '%,' + (a * 0.32).toFixed(3) + ')';
        ctx.lineWidth = Math.max(0.7, this.size * 0.42);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < this.tapeN; i++) {
          const idx = (this.tapeHead - 1 - i + this.trail * 2) % this.trail;
          const px = this.tape[idx * 2], py = this.tape[idx * 2 + 1];
          if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      const s = this.size * glowScale * (0.55 + 0.45 * a);
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(glow(this.hue, this.sat, this.light), this.x - s, this.y - s, s * 2, s * 2);
      ctx.globalAlpha = 1;
    }
  }

  /* ================= 烟花弹体 ================= */
  class Shell {
    constructor(o) {
      this.x = o.x; this.y = o.y;
      this.vx = o.vx; this.vy = o.vy;
      this.grav = o.grav ?? 46;
      this.fuse = o.fuse;                  // 引信时间：到点炸开
      this.age = 0;
      this.spec = o.spec;                  // 花型参数
      this.trailT = 0;
      this.dead = false;
      this.hue = o.spec.hue ?? 45;
      this.sparkles = [];
    }

    step(dt, t, fw) {
      this.age += dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += this.grav * dt;

      /* 尾迹火星 */
      this.trailT += dt;
      while (this.trailT > 0.012) {
        this.trailT -= 0.012;
        fw.emit({
          x: this.x + rand(-1.5, 1.5), y: this.y + rand(-1.5, 1.5),
          vx: rand(-9, 9), vy: rand(-6, 16),
          hue: this.hue, sat: 100, light: rand(58, 78),
          size: rand(0.7, 1.5), maxLife: rand(0.25, 0.6),
          grav: 30, drag: 0.9, flicker: 0.5,
        });
      }

      if (this.age >= this.fuse || this.vy >= 0 && this.age > this.fuse * 0.55) {
        this.dead = true;
        return this.spec;
      }
      return null;
    }

    draw(ctx, glowScale) {
      const s = 2.6 * glowScale;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      ctx.drawImage(glow(this.hue, 100, 82), this.x - s, this.y - s, s * 2, s * 2);
      ctx.globalAlpha = 1;
    }
  }

  /* ================= 花型 ================= */
  /* 每种花型返回一组粒子初始化参数 */
  const KINDS = {
    /* 牡丹：最经典的球形炸开，单色 */
    peony(x, y, o) {
      const n = o.n ?? 150;
      const hue = o.hue ?? 45;
      const spd = o.spd ?? 250;
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand(-0.03, 0.03);
        const v = spd * Math.sqrt(rand(0.35, 1)) * rand(0.86, 1.14);
        out.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          hue: hue + rand(-6, 6), sat: 100, light: rand(56, 74),
          size: rand(1.5, 3.1), maxLife: rand(1.0, 1.9),
          grav: 46, drag: 0.955, flicker: 0.22,
        });
      }
      return out;
    },

    /* 菊花：带长拖尾，下落感强 */
    chrysanthemum(x, y, o) {
      const n = o.n ?? 120;
      const hue = o.hue ?? 45;
      const spd = o.spd ?? 230;
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const v = spd * rand(0.72, 1.05);
        out.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          hue: hue + rand(-10, 10), sat: 100, light: rand(60, 80),
          size: rand(1.6, 2.6), maxLife: rand(1.6, 2.6),
          grav: 62, drag: 0.975, trail: 9, flicker: 0.3,
        });
      }
      return out;
    },

    /* 柳枝：细长下垂，金色 */
    willow(x, y, o) {
      const n = o.n ?? 90;
      const hue = o.hue ?? 44;
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand(-0.05, 0.05);
        const v = rand(60, 165);
        out.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20,
          hue: hue + rand(-8, 8), sat: 100, light: rand(62, 82),
          size: rand(1.2, 2.0), maxLife: rand(2.2, 3.4),
          grav: 52, drag: 0.985, trail: 13, flicker: 0.42,
        });
      }
      return out;
    },

    /* 环形：粒子均匀分布在一个倾斜的圆环上 */
    ring(x, y, o) {
      const n = o.n ?? 110;
      const hue = o.hue ?? 0;
      const spd = o.spd ?? 190;
      const tilt = o.tilt ?? rand(0.25, 0.6);
      const rot = o.rot ?? rand(0, TAU);
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const ca = Math.cos(a + rot), sa = Math.sin(a + rot);
        out.push({
          x, y,
          vx: ca * spd,
          vy: sa * spd * tilt,
          hue: hue + rand(-5, 5), sat: 100, light: rand(58, 78),
          size: rand(1.5, 2.6), maxLife: rand(1.2, 2.0),
          grav: 40, drag: 0.958, flicker: 0.25,
        });
      }
      return out;
    },

    /* 双色环 */
    doubleRing(x, y, o) {
      return [
        ...KINDS.ring(x, y, { n: 70, hue: o.hue ?? 0, spd: 200, tilt: 0.35 }),
        ...KINDS.ring(x, y, { n: 70, hue: (o.hue ?? 0) + 55, spd: 140, tilt: 0.9 }),
      ];
    },

    /* 棕榈：粗壮的几条金色射线 */
    palm(x, y, o) {
      const n = o.n ?? 14;
      const hue = o.hue ?? 45;
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand(-0.06, 0.06);
        const v = rand(190, 275);
        for (let k = 0; k < 7; k++) {
          const vv = v * (1 - k * 0.055) * rand(0.97, 1.03);
          out.push({
            x, y, vx: Math.cos(a) * vv, vy: Math.sin(a) * vv,
            hue: hue + rand(-4, 4), sat: 100, light: rand(66, 86),
            size: rand(1.8, 3.0), maxLife: rand(1.5, 2.4),
            grav: 58, drag: 0.972, trail: 8, flicker: 0.3,
          });
        }
      }
      return out;
    },

    /* 五角星：粒子按五角星轮廓分布后向外炸开 */
    star(x, y, o) {
      const R = o.R ?? 190;
      const rot = o.rot ?? -Math.PI / 2;
      const pts = [];
      const rho = (3 - Math.sqrt(5)) / 2;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? R * rho : R;
        const a = rot + (i * Math.PI) / 5;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(4, Math.round(seg / 9));
        for (let s = 0; s < steps; s++) {
          const u = s / steps;
          const px = lerp(a[0], b[0], u), py = lerp(a[1], b[1], u);
          const d = Math.hypot(px, py) || 1;
          const sp = 150 + rand(0, 90);
          out.push({
            x, y,
            vx: (px / d) * sp + rand(-16, 16),
            vy: (py / d) * sp + rand(-16, 16),
            hue: o.hue ?? 45, sat: 100, light: rand(64, 84),
            size: rand(1.5, 2.7), maxLife: rand(1.2, 2.1),
            grav: 46, drag: 0.96, flicker: 0.2,
          });
        }
      }
      return out;
    },

    /* 心形 */
    heart(x, y, o) {
      const n = o.n ?? 130;
      const S = o.S ?? 165;
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        /* 心形参数方程 */
        const hx = 16 * Math.pow(Math.sin(a), 3);
        const hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
        const ux = (hx / 17) * S, uy = (hy / 17) * S;
        const d = Math.hypot(ux, uy) || 1;
        const sp = 160 + rand(0, 80);
        out.push({
          x, y, vx: (ux / d) * sp, vy: (uy / d) * sp,
          hue: o.hue ?? 350, sat: 100, light: rand(60, 80),
          size: rand(1.6, 2.8), maxLife: rand(1.4, 2.3),
          grav: 44, drag: 0.96, flicker: 0.2,
        });
      }
      return out;
    },

    /* 文字：先炸开，再汇聚成文字（"我爱你中国"） */
    text(x, y, o) {
      const text = o.text ?? '我爱你中国';
      const fontPx = o.fontPx ?? 110;
      const gap = o.gap ?? 9;
      const pts = textPoints(text, fontPx, gap);
      const out = [];
      const total = pts.length;
      for (let i = 0; i < total; i++) {
        const a = rand(0, TAU);
        const v = rand(70, 260);
        out.push({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          hue: o.hue ?? 45, sat: 100, light: rand(62, 86),
          size: rand(1.5, 2.6), maxLife: o.maxLife ?? 3.6,
          grav: 40, drag: 0.945, flicker: 0.12,
          tx: x + pts[i][0] * (o.scale ?? 1), ty: y + pts[i][1] * (o.scale ?? 1),
          morphAt: o.morphAt ?? 0.75, morphDur: o.morphDur ?? 1.0,
        });
      }
      return out;
    },
  };

  /* ================= 管理器 ================= */
  class Fireworks {
    constructor(max = 6000) {
      this.pool = [];
      for (let i = 0; i < max; i++) this.pool.push(new Particle());
      this.head = 0;
      this.active = [];
      this.shells = [];
      this.launched = 0;
      this.bursts = 0;
      this.shake = 0;
      this.flashes = [];
    }

    /** 从对象池取一个粒子并加入活动列表 */
    emit(o) {
      const p = this.pool[this.head];
      this.head = (this.head + 1) % this.pool.length;
      if (p.alive) {
        const i = this.active.indexOf(p);
        if (i >= 0) this.active.splice(i, 1);
      }
      p.init(o);
      this.active.push(p);
      return p;
    }

    /** 发射一枚烟花 */
    launch(x, y, spec) {
      const kind = spec.kind ?? 'peony';
      const fuse = spec.fuse ?? rand(0.75, 1.15);
      const vy = spec.vy ?? -(rand(330, 430));
      const vx = spec.vx ?? rand(-38, 38);
      this.shells.push(new Shell({
        x, y, vx, vy, fuse,
        spec: { ...spec, kind },
      }));
      this.launched++;
    }

    /** 直接在某点炸开（不升空） */
    burst(x, y, spec) {
      const kind = spec.kind ?? 'peony';
      const fn = KINDS[kind] || KINDS.peony;
      const list = fn(x, y, spec);
      for (const o of list) this.emit(o);
      this.bursts++;
      this.flashes.push({ x, y, r: 0, max: spec.flash ?? 210, life: 0, dur: 0.34 });
      if (spec.shake) this.shake = Math.max(this.shake, spec.shake);
      return list.length;
    }

    update(dt, t) {
      /* 弹体 */
      for (let i = this.shells.length - 1; i >= 0; i--) {
        const s = this.shells[i];
        const spec = s.step(dt, t, this);
        if (spec) {
          this.shells.splice(i, 1);
          const merged = { ...spec };
          delete merged.fuse;
          this.burst(s.x, s.y, merged);
        } else if (s.y > 1e9) {
          this.shells.splice(i, 1);
        }
      }
      /* 粒子 */
      const a = this.active;
      for (let i = a.length - 1; i >= 0; i--) {
        const p = a[i];
        p.step(dt, t);
        if (!p.alive) { a.splice(i, 1); }
      }
      /* 爆闪 */
      for (let i = this.flashes.length - 1; i >= 0; i--) {
        const f = this.flashes[i];
        f.life += dt;
        if (f.life >= f.dur) this.flashes.splice(i, 1);
        else f.r = f.max * easeOutExpo(f.life / f.dur);
      }
      this.shake *= Math.pow(0.001, dt);
    }

    render(ctx, glowScale) {
      ctx.globalCompositeOperation = 'lighter';
      for (const f of this.flashes) {
        const k = 1 - f.life / f.dur;
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, 'rgba(255,238,190,' + (0.5 * k).toFixed(3) + ')');
        g.addColorStop(0.4, 'rgba(255,180,80,' + (0.16 * k).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,120,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, TAU);
        ctx.fill();
      }
      for (const s of this.shells) s.draw(ctx, glowScale);
      for (const p of this.active) p.draw(ctx, glowScale);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    get count() { return this.active.length + this.shells.length; }
  }

  return { Fireworks, KINDS, glow, textPoints, starPoints, sampleCanvas };
})();