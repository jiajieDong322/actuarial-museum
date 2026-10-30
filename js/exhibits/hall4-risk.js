/* hall4-risk.js — 展厅四 · 风险理论（4 件） */
(function () {
  'use strict';

  function C(id, obj) { return Object.assign({}, CONTENT[id] || {}, obj); }

  // ---------- 17 保费原理 ----------
  MUSEUM.add(C('17', {
    id: '17', slug: 'principles', hall: 4,
    titleEn: 'Premium Principles', titleZh: '保费原理',
    controls: [
      { key: 'mean', label: '损失均值 E[X]', min: 200, max: 5000, step: 50, value: 1000, fmt: 'money' },
      { key: 'sd', label: '损失标准差 σ', min: 50, max: 2000, step: 25, value: 400, fmt: 'money' },
      { key: 'a', label: '风险厌恶 α', min: 0, max: 2, step: 0.01, value: 0.5, fmt: 'x2' }
    ],
    kpis: function (s) {
      return [
        { label: '期望值原理', value: M.premEV(s.mean), fmt: 'money' },
        { label: '标准差原理', value: M.premSD(s.mean, s.sd, s.a), fmt: 'money' },
        { label: '方差原理', value: M.premVar(s.mean, s.sd, s.a), fmt: 'money' },
        { label: '指数原理', value: M.premExp(s.mean, s.sd, s.a), fmt: 'money' }
      ];
    },
    chart: function (s) {
      function series(fn, cls, name) {
        var pts = [];
        for (var a = 0; a <= 2.0001; a += 0.02) pts.push([a, fn(s.mean, s.sd, a)]);
        return { name: name, cls: cls, points: pts };
      }
      return {
        type: 'line', xDomain: [0, 2], xLabel: '风险厌恶 α', yLabel: '保费 Π',
        series: [
          { name: '期望值原理 E[X]', cls: 's3', points: [[0, s.mean], [2, s.mean]], dash: true },
          series(M.premSD, 's0', '标准差原理 E + ασ'),
          series(M.premVar, 's1', '方差原理 E + ασ²/E'),
          series(M.premExp, 's2', '指数原理 E + ασ²/2E')
        ],
        markers: [{ x: s.a, y: M.premSD(s.mean, s.sd, s.a), label: 'α = ' + s.a.toFixed(2) }]
      };
    },
    notes: function (s) {
      var cv = s.sd / s.mean;
      return '四条线在 α=0 处全部塌回均值——没有风险厌恶，就不该收任何附加。随着 α 上升，标准差原理涨得最快（斜率 σ=' +
        s.sd.toFixed(0) + '），方差原理只有它的一半不到（斜率 σ²/E=' + (s.sd * s.sd / s.mean).toFixed(0) +
        '）。当前变异系数 CV=' + cv.toFixed(2) + (cv > 1 ? '，已超过 1，方差原理的安全性被压缩得厉害。' : '。');
    }
  }));

  // ---------- 18 聚合风险模型 ----------
  MUSEUM.add(C('18', {
    id: '18', slug: 'aggregate', hall: 4,
    titleEn: 'The Collective Risk Model', titleZh: '聚合风险模型',
    controls: [
      { key: 'lam', label: '组合规模 λ（年索赔次数）', min: 1, max: 40, step: 1, value: 10, fmt: 'int' },
      { key: 'm', label: '单次索赔均值 m', min: 100, max: 2000, step: 50, value: 900, fmt: 'money' },
      { key: 'sd', label: '单次索赔标准差', min: 50, max: 800, step: 25, value: 400, fmt: 'money' }
    ],
    m2: function (s) { return s.m * s.m + s.sd * s.sd; },
    kpis: function (s) {
      var m2 = this.m2(s);
      return [
        { label: 'E[S] 聚合均值', value: M.compoundMean(s.lam, s.m), fmt: 'money' },
        { label: 'SD(S) 聚合标准差', value: Math.sqrt(M.compoundVar(s.lam, m2)), fmt: 'money' },
        { label: 'CV(S) 变异系数', value: M.compoundCV(s.lam, s.m, m2), fmt: 'x4' }
      ];
    },
    chart: function (s) {
      var m2 = this.m2(s), pts = [];
      for (var lam = 1; lam <= 40; lam++) pts.push([lam, M.compoundCV(lam, s.m, m2)]);
      return {
        type: 'line', xDomain: [1, 40], xLabel: '组合规模 λ', yLabel: 'CV(S) 相对波动',
        series: [{ name: 'CV(S)', cls: 's0', points: pts, area: true }],
        markers: [{ x: s.lam, y: M.compoundCV(s.lam, s.m, m2), label: 'CV = ' + M.compoundCV(s.lam, s.m, m2).toFixed(4) }]
      };
    },
    notes: function (s) {
      var m2 = this.m2(s);
      var cv1 = M.compoundCV(1, s.m, m2), cvNow = M.compoundCV(s.lam, s.m, m2);
      return '从 1 单做到 ' + s.lam + ' 单，相对波动 CV 从 ' + cv1.toFixed(3) + ' 掉到 ' + cvNow.toFixed(3) +
        '，缩小的倍数接近 √' + s.lam + ' = ' + Math.sqrt(s.lam).toFixed(2) +
        '。这张图就是大数定律的保险版：规模每翻四倍，相对波动减半；但要把它减到十分之一，需要一百倍的规模。';
    }
  }));

  // ---------- 19 破产概率 ----------
  MUSEUM.add(C('19', {
    id: '19', slug: 'ruin', hall: 4,
    titleEn: 'Ruin Probability', titleZh: '破产概率与 Lundberg 界',
    controls: [
      { key: 'lam', label: '索赔强度 λ（次/年）', min: 10, max: 200, step: 1, value: 100, fmt: 'int' },
      { key: 'm', label: '平均索赔额 m', min: 100, max: 2000, step: 50, value: 900, fmt: 'money' },
      { key: 'th', label: '安全加载 θ', min: 0.02, max: 0.60, step: 0.01, value: 0.11, fmt: 'pct1' },
      { key: 'u', label: '初始盈余 u', min: 0, max: 20000, step: 100, value: 2000, fmt: 'money' }
    ],
    rate: function (s) { return s.lam * s.m * (1 + s.th); },
    kpis: function (s) {
      var c = this.rate(s);
      return [
        { label: '保费率 c', value: c, fmt: 'money' },
        { label: '调节系数 R', value: M.lundbergR(s.lam, s.m, c), fmt: 'x6' },
        { label: '破产概率 ψ(u)', value: M.ruinProb(s.u, s.lam, s.m, c), fmt: 'x6' }
      ];
    },
    chart: function (s) {
      var c = this.rate(s), cHalf = s.lam * s.m * (1 + s.th / 2);
      var cur = [], half = [];
      for (var u = 0; u <= 20000; u += 250) {
        cur.push([u, M.ruinProb(u, s.lam, s.m, c)]);
        half.push([u, M.ruinProb(u, s.lam, s.m, cHalf)]);
      }
      return {
        type: 'line', xDomain: [0, 20000], xLabel: '初始盈余 u', yLabel: '破产概率 ψ(u)',
        series: [
          { name: 'θ = ' + (s.th * 100).toFixed(1) + '%', cls: 's0', points: cur },
          { name: 'θ 减半 = ' + (s.th * 50).toFixed(1) + '%', cls: 's1', points: half, dash: true }
        ],
        markers: [{ x: s.u, y: M.ruinProb(s.u, s.lam, s.m, c), label: 'ψ = ' + M.ruinProb(s.u, s.lam, s.m, c).toFixed(5) }]
      };
    },
    notes: function (s) {
      var c = this.rate(s), cHalf = s.lam * s.m * (1 + s.th / 2);
      var p0 = M.ruinProb(0, s.lam, s.m, c), p0h = M.ruinProb(0, s.lam, s.m, cHalf);
      var pHi = M.ruinProb(10000, s.lam, s.m, c), pHih = M.ruinProb(10000, s.lam, s.m, cHalf);
      return '安全加载砍半之后，u=0 处的破产概率几乎不动（' + p0.toFixed(4) + ' → ' + p0h.toFixed(4) +
        '，那一端只由 λm/c 决定），但在 u=10000 处从 ' + pHi.toFixed(4) + ' 抬到 ' + pHih.toFixed(4) +
        '，放大约 ' + (pHih / Math.max(pHi, 1e-12)).toFixed(1) +
        ' 倍。加载买的不是起点那一点，而是「盈余堆得再多也翻不了身」的那一整段。';
    }
  }));

  // ---------- 20 风险度量 ----------
  MUSEUM.add(C('20', {
    id: '20', slug: 'riskmeasure', hall: 4,
    titleEn: 'VaR & TVaR', titleZh: '风险度量：VaR 与 TVaR',
    controls: [
      { key: 'mean', label: '损失均值', min: 200, max: 5000, step: 50, value: 1000, fmt: 'money' },
      { key: 'sd', label: '损失标准差', min: 50, max: 2000, step: 25, value: 400, fmt: 'money' },
      { key: 'p', label: '置信水平 p', min: 0.90, max: 0.999, step: 0.001, value: 0.99, fmt: 'pct1' }
    ],
    kpis: function (s) {
      return [
        { label: 'VaR_' + (s.p * 100).toFixed(1) + '%', value: M.lnVaR(s.mean, s.sd, s.p), fmt: 'money' },
        { label: 'TVaR 尾部均值', value: M.lnTVaR(s.mean, s.sd, s.p), fmt: 'money' },
        { label: '尾部 / VaR 倍数', value: M.lnTVaR(s.mean, s.sd, s.p) / M.lnVaR(s.mean, s.sd, s.p), fmt: 'x3' }
      ];
    },
    chart: function (s) {
      var xMax = M.lnVaR(s.mean, s.sd, 0.9995);
      var vaR = M.lnVaR(s.mean, s.sd, s.p);
      var tv = M.lnTVaR(s.mean, s.sd, s.p);
      var pts = [];
      for (var k = 0; k <= 240; k++) {
        var x = xMax * k / 240 + 1;
        pts.push([x, M.lnPdf(x, s.mean, s.sd)]);
      }
      return {
        type: 'line', xDomain: [0, xMax], xLabel: '损失金额', yLabel: '概率密度',
        series: [{ name: '损失分布（对数正态）', cls: 's0', points: pts }],
        bands: [{ x0: vaR, x1: xMax, cls: 'warn' }],
        vlines: [
          { x: vaR, label: 'VaR ' + vaR.toFixed(0) },
          { x: Math.min(tv, xMax * 0.999), label: 'TVaR ' + tv.toFixed(0) }
        ],
        markers: [{ x: s.mean, y: M.lnPdf(s.mean, s.mean, s.sd), label: '均值' }]
      };
    },
    notes: function (s) {
      var v = M.lnVaR(s.mean, s.sd, s.p), t = M.lnTVaR(s.mean, s.sd, s.p);
      var r90 = M.lnTVaR(s.mean, s.sd, 0.90) / M.lnVaR(s.mean, s.sd, 0.90);
      var r999 = M.lnTVaR(s.mean, s.sd, 0.999) / M.lnVaR(s.mean, s.sd, 0.999);
      return 'VaR 只切一刀：' + (s.p * 100).toFixed(1) + '% 的日子里损失不超过 ' + v.toFixed(0) +
        '，但它对刀口右侧那一小撮灾难毫无感知。TVaR 是那把刀右侧的均值——' + t.toFixed(0) +
        '，是 VaR 的 ' + (t / v).toFixed(2) + ' 倍。注意抬高置信水平并不能把这层差距拉开：本分布下比值反而从 1.22 收窄到 1.12（当前 ' +
        (t / v).toFixed(3) + '，p=90% 时 ' + r90.toFixed(3) + '，p=99.9% 时 ' + r999.toFixed(3) +
        '）。真正放大差距的是尾部厚度——把损失标准差拉大，倍数才明显上升。';
    }
  }));

})();
