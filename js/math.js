/* math.js — 精确到函数名的唯一公式真源。
   tools/reference.py 逐函数镜像本文件；两边对不上就算失败（V1）。
   纯函数，不碰 DOM，不依赖任何库。 */
var M = (function () {
  'use strict';

  // ========== 通用 ==========

  /* Simpson 复合积分，自动加密到相邻两次结果相对差 < 1e-10。
     固定 400 步不够：x≥65、B 大、c 大时死亡力在 t=0 形成薄边界层，
     终身型积分实测误差可达 3.5%（108 个参数点里 26 个超 1e-9）。 */
  function integrate(f, a, b, steps) {
    if (b <= a) return 0;
    var n = steps || 400;
    var prev = simpson(f, a, b, n);
    for (var k = 0; k < 8; k++) {
      n *= 2;
      var cur = simpson(f, a, b, n);
      if (Math.abs(cur - prev) <= 1e-10 * Math.max(1e-30, Math.abs(cur))) return cur;
      prev = cur;
    }
    return prev;
  }

  function simpson(f, a, b, steps) {
    if (steps % 2) steps++;
    var h = (b - a) / steps, s = f(a) + f(b);
    for (var k = 1; k < steps; k++) s += (k % 2 ? 4 : 2) * f(a + k * h);
    return s * h / 3;
  }

  /* 确定性 LCG，用于模拟类展品——不用 Math.random，保证截图可复现。 */
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* 标准正态 CDF（Abramowitz & Stegun 7.1.26 误差函数，绝对误差 < 1.5e-7）。 */
  function normCdf(z) {
    var x = Math.abs(z) / Math.SQRT2;
    var t = 1 / (1 + 0.3275911 * x);
    var erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
      - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + (z >= 0 ? erf : -erf));
  }

  /* 逆正态：对 normCdf 二分，100 次收敛到机器精度。比反查表省事且更准。 */
  function normInv(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var lo = -10, hi = 10;
    for (var k = 0; k < 100; k++) {
      var mid = (lo + hi) / 2;
      if (normCdf(mid) < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* 单调函数的根：二分。fp 为 f'(符号引导)，这里只需要区间内有变号。 */
  function bisect(f, lo, hi, iters) {
    iters = iters || 200;
    var flo = f(lo);
    for (var k = 0; k < iters; k++) {
      var mid = (lo + hi) / 2, fm = f(mid);
      if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else { hi = mid; }
    }
    return (lo + hi) / 2;
  }

  // ========== 一 · 利息理论 ==========

  function accum(i, n) { return Math.pow(1 + i, n); }
  function disc(i, n) { return Math.pow(1 + i, -n); }
  function forceOfInterest(i) { return Math.log(1 + i); }
  function effectiveFromForce(d) { return Math.exp(d) - 1; }
  function discountRate(i) { return i / (1 + i); }

  /* 年金现值。i=0 时取极限 n（连续复利下无利息累积/折现）。 */
  function aN(i, n) { return i === 0 ? n : (1 - disc(i, n)) / i; }
  function sN(i, n) { return i === 0 ? n : (accum(i, n) - 1) / i; }
  function aDue(i, n) { return aN(i, n) * (1 + i); }

  /* 名义利率 i^(m)：m 期/年。m=Infinity 名义力即利息力。 */
  function iM(i, m) {
    if (m === Infinity) return forceOfInterest(i);
    if (i === 0) return 0;
    return m * (Math.pow(1 + i, 1 / m) - 1);
  }
  function aNM(i, n, m) {
    var d = iM(i, m);
    return d === 0 ? n : (1 - disc(i, n)) / d;
  }

  function perpetuity(i) { return i <= 0 ? Infinity : 1 / i; }
  function growingPerpetuity(i, g) { return i - g <= 0 ? Infinity : (1 + g) / (i - g); }

  function npv(rate, flows) {
    var s = 0;
    for (var k = 0; k < flows.length; k++) s += flows[k].v * Math.pow(1 + rate, -flows[k].t);
    return s;
  }

  /* IRR：在 [-0.99, 10] 内找 NPV 变号点。找不到返回 NaN（多项 IRR 场景不处理）。 */
  function irr(flows) {
    var lo = -0.99, hi = 10;
    var flo = npv(lo, flows), fhi = npv(hi, flows);
    if (!isFinite(flo) || !isFinite(fhi) || (flo < 0) === (fhi < 0)) return NaN;
    for (var k = 0; k < 200; k++) {
      var mid = (lo + hi) / 2, fm = npv(mid, flows);
      if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else { hi = mid; }
    }
    return (lo + hi) / 2;
  }

  // ========== 二 · 生存模型 ==========

  /* Gompertz: μ(x) = B·c^x。B 是基准死亡力，c 是老化因子（通常 1.08–1.12）。 */
  function muG(B, c, x) { return B * Math.pow(c, x); }

  /* _t p_x = exp(-μ(x)·(c^t - 1)/ln c)。c→1 时退化为常力，单独走分支。 */
  function tpxG(B, c, x, t) {
    if (Math.abs(c - 1) < 1e-12) return Math.exp(-B * Math.pow(c, x) * t);
    return Math.exp(-muG(B, c, x) * (Math.pow(c, t) - 1) / Math.log(c));
  }

  /* 生命表 l(x)，归一化 l(0)=1。 */
  function lxG(B, c, x) {
    if (Math.abs(c - 1) < 1e-12) return Math.exp(-B * x);
    return Math.exp(-B * (Math.pow(c, x) - 1) / Math.log(c));
  }

  function qxG(B, c, x) { return 1 - tpxG(B, c, x, 1); }

  /* 分数年龄假设，t ∈ [0,1]，px = 1 年内生存概率。
     udd      : t·qx 线性插值死亡
     cfm      : 常力（几何插值）
     balducci : 调和插值 */
  function tpxFrac(px, t, assump) {
    var qx = 1 - px;
    if (assump === 'udd') return 1 - t * qx;
    if (assump === 'cfm') return Math.pow(px, t);
    if (assump === 'balducci') return px / (px + t * qx);
    return Math.pow(px, t);
  }

  /* ========== 三 · 生命年金与寿险 ==========
     全部连续型，上限取 130 岁截断。依据是 μ(130) 已达每年数倍、剩余期望寿命 <0.3 岁，
     不是「生存概率 < 1e-15」——那句只在 B≥3e-4 时成立，B 调到 3e-5 时 l(130)≈0.93。 */
  var OMEGA = 130;

  /* 定期寿险 Ā¹_{x:n} = ∫₀ⁿ v^t · tpx · μ(x+t) dt */
  function AxTerm(B, c, x, delta, n) {
    return integrate(function (t) {
      return Math.exp(-delta * t) * tpxG(B, c, x, t) * muG(B, c, x + t);
    }, 0, n, 400);
  }

  /* 两全保险 Ā_{x:n} = 定期寿险 + 纯生存保险 v^n·npx */
  function AxEndow(B, c, x, delta, n) {
    return AxTerm(B, c, x, delta, n) + Math.exp(-delta * n) * tpxG(B, c, x, n);
  }

  /* 终身寿险 Ā_x = 定期寿险取 n→∞ */
  function AxWhole(B, c, x, delta) {
    return AxTerm(B, c, x, delta, Math.max(0, OMEGA - x));
  }

  /* 连续生命年金 ā_{x:n} = ∫₀ⁿ v^t · tpx dt */
  function annTerm(B, c, x, delta, n) {
    return integrate(function (t) {
      return Math.exp(-delta * t) * tpxG(B, c, x, t);
    }, 0, n, 400);
  }

  function annWhole(B, c, x, delta) {
    return annTerm(B, c, x, delta, Math.max(0, OMEGA - x));
  }

  /* 常力模型闭式：Ā = μ/(μ+δ)，ā = (1-Ā)/δ。用作对照直线。 */
  function AxCF(mu, delta) { return mu / (mu + delta); }
  function annCF(mu, delta) { return (1 - AxCF(mu, delta)) / delta; }
  function premiumCF(mu, delta) { return AxCF(mu, delta) / annCF(mu, delta); }

  /* 等价原理净保费：P = A / ä。 */
  function premium(A, ann) { return ann <= 0 ? NaN : A / ann; }

  /* 前瞻准备金 V_t = A_{x+t} - P·ä_{x+t}（剩余期限 n-t），只适用定期寿险。
     两全在 t=n 时准备金应为 1，这里会算成 0——所以名字里带 Term，别拿去算两全。 */
  function reserveTerm(B, c, x, delta, P, t, n) {
    var A = AxTerm(B, c, x + t, delta, n - t);
    var a = annTerm(B, c, x + t, delta, n - t);
    return A - P * a;
  }

  // ========== 四 · 风险理论 ==========

  /* 对数正态参数：给定均值与标准差。 */
  function lnParams(mean, sd) {
    var s2 = Math.log(1 + (sd / mean) * (sd / mean));
    return { mu: Math.log(mean) - s2 / 2, sigma2: s2, sigma: Math.sqrt(s2) };
  }

  /* 保费原理。α 一律归一化成「每单位均值」的加载系数，四条原理才能同轴比较：
       标准差原理  Π = E + α·σ        （系数 α_sd = α）
       方差原理    Π = E + α·σ²/E     （系数 α_var = α/E）
       指数原理    Π = E + α·σ²/(2E)  （正态损失下 Π=(1/α)ln E[e^{αX}] = E + α·Var/2）
     不做归一化的话方差原理会随 σ² 爆到另一个量级，四条线没法画在一起。 */
  function premEV(mean) { return mean; }
  function premVar(mean, sd, a) { return mean + a * sd * sd / mean; }
  function premSD(mean, sd, a) { return mean + a * sd; }
  function premExp(mean, sd, a) { return mean + 0.5 * a * sd * sd / mean; }


  /* 聚合风险：S ~ 复合泊松，N~Poi(λ)，单次损失均值 m、二阶矩 m2。
     E[S]=λm，Var[S]=λ·E[X²]。 */
  function compoundMean(lam, m) { return lam * m; }
  function compoundVar(lam, m2) { return lam * m2; }
  function compoundCV(lam, m, m2) {
    var mu = compoundMean(lam, m);
    return mu <= 0 ? Infinity : Math.sqrt(compoundVar(lam, m2)) / mu;
  }

  /* 模拟聚合损失的样本（指数索赔，均值 m），返回 {sums:[], max:} */
  function simulateCompound(lam, m, years, seed) {
    var r = rng(seed || 7), out = [];
    for (var y = 0; y < years; y++) {
      var n = poissonSample(lam, r), s = 0;
      for (var k = 0; k < n; k++) s += -m * Math.log(1 - r());
      out.push(s);
    }
    return out;
  }

  /* Knuth 泊松抽样，λ < 40 有效；本项目 λ 上限 40。 */
  function poissonSample(lam, r) {
    var L = Math.exp(-lam), k = 0, p = 1;
    do { k++; p *= r(); } while (p > L && k < 200);
    return k - 1;
  }

  /* Cramér–Lundberg：指数索赔（均值 m）、泊松强度 λ、保费率 c。
     安全加载 θ = c/(λm) - 1 > 0。
     调节系数 R 解 λ + Rc = λ/(1 - mR)  =>  R = (c - λm)/(cm)。 */
  function lundbergR(lam, m, c) {
    if (c <= lam * m) return NaN;
    return (c - lam * m) / (c * m);
  }
  /* 破产概率 ψ(u) = (λm/c)·exp(-R·u)。 */
  function ruinProb(u, lam, m, c) {
    var R = lundbergR(lam, m, c);
    if (!isFinite(R)) return 1;
    return Math.min(1, (lam * m / c) * Math.exp(-R * u));
  }

  /* 对数正态的 VaR 与 TVaR。q=exp(μ+σz_p)；TVaR=exp(μ+σ²/2)·Φ(σ-z_p)/(1-p)。 */
  function lnVaR(mean, sd, p) {
    var q = lnParams(mean, sd);
    return Math.exp(q.mu + q.sigma * normInv(p));
  }
  function lnTVaR(mean, sd, p) {
    if (p >= 1 - 1e-12) return Infinity;
    var q = lnParams(mean, sd);
    var zp = normInv(p);
    return Math.exp(q.mu + q.sigma2 / 2) * normCdf(q.sigma - zp) / (1 - p);
  }
  /* 对数正态 pdf，供画分布用。 */
  function lnPdf(x, mean, sd) {
    if (x <= 0) return 0;
    var q = lnParams(mean, sd);
    var z = (Math.log(x) - q.mu) / q.sigma;
    return Math.exp(-z * z / 2) / (x * q.sigma * Math.sqrt(2 * Math.PI));
  }

  return {
    integrate: integrate, rng: rng, normCdf: normCdf, normInv: normInv, bisect: bisect,
    accum: accum, disc: disc, forceOfInterest: forceOfInterest,
    effectiveFromForce: effectiveFromForce, discountRate: discountRate,
    aN: aN, sN: sN, aDue: aDue, iM: iM, aNM: aNM,
    perpetuity: perpetuity, growingPerpetuity: growingPerpetuity,
    npv: npv, irr: irr,
    muG: muG, tpxG: tpxG, lxG: lxG, qxG: qxG, tpxFrac: tpxFrac,
    AxTerm: AxTerm, AxEndow: AxEndow, AxWhole: AxWhole,
    annTerm: annTerm, annWhole: annWhole,
    AxCF: AxCF, annCF: annCF, premiumCF: premiumCF,
    premium: premium, reserveTerm: reserveTerm,
    lnParams: lnParams, premEV: premEV, premVar: premVar, premSD: premSD, premExp: premExp,
    compoundMean: compoundMean, compoundVar: compoundVar, compoundCV: compoundCV,
    simulateCompound: simulateCompound, poissonSample: poissonSample,
    lundbergR: lundbergR, ruinProb: ruinProb,
    lnVaR: lnVaR, lnTVaR: lnTVaR, lnPdf: lnPdf,
    OMEGA: OMEGA
  };
})();
