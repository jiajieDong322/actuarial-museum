/* hall3-life.js — 展厅三 · 生命年金与寿险（5 件） */
(function () {
  'use strict';

  function C(id, obj) { return Object.assign({}, CONTENT[id] || {}, obj); }

  var AGE = [
    { key: 'B', label: '基准死亡力 B', min: 0.00002, max: 0.001, step: 0.000002, value: 0.00003, fmt: 'x6' },
    { key: 'c', label: '老化因子 c', min: 1.00, max: 1.20, step: 0.001, value: 1.10, fmt: 'x3' },
    { key: 'x', label: '投保年龄 x', min: 20, max: 90, step: 1, value: 40, fmt: 'int' },
    { key: 'd', label: '利息力 δ', min: 0.005, max: 0.15, step: 0.001, value: 0.05, fmt: 'pct1' }
  ];
  var TERM = { key: 'n', label: '保险期限 n（年）', min: 1, max: 40, step: 1, value: 20, fmt: 'int' };

  function ctrls(n) {
    var a = AGE.slice();
    if (n) a.push(TERM);
    return a;
  }

  // ---------- 12 终身寿险 ----------
  MUSEUM.add(C('12', {
    id: '12', slug: 'wholelife', hall: 3,
    titleEn: 'Whole Life Insurance', titleZh: '终身寿险',
    controls: ctrls(false),
    kpis: function (s) {
      var A = M.AxWhole(s.B, s.c, s.x, s.d);
      return [
        { label: 'Ā_x 终身寿险', value: A, fmt: 'x4' },
        { label: '常力闭式 μ/(μ+δ)（假设 μ 永不上升）', value: M.AxCF(M.muG(s.B, s.c, s.x), s.d), fmt: 'x4' },
        { label: '每 1000 元保额的保费', value: A * 1000, fmt: 'money' }
      ];
    },
    chart: function (s) {
      var cur = [], young = [];
      for (var d = 0.005; d <= 0.1501; d += 0.0025) {
        cur.push([d, M.AxWhole(s.B, s.c, s.x, d)]);
        young.push([d, M.AxWhole(s.B, s.c, Math.max(0, s.x - 30), d)]);
      }
      return {
        type: 'line', xDomain: [0.005, 0.15], xLabel: '利息力 δ', yLabel: 'Ā_x（每 1 元保额）',
        series: [
          { name: '投保年龄 ' + s.x, cls: 's0', points: cur },
          { name: '投保年龄 ' + Math.max(0, s.x - 30), cls: 's1', points: young }
        ],
        markers: [{ x: s.d, y: M.AxWhole(s.B, s.c, s.x, s.d), label: 'δ = ' + (s.d * 100).toFixed(1) + '%' }]
      };
    },
    notes: function (s) {
      var A = M.AxWhole(s.B, s.c, s.x, s.d);
      return '终身寿险必然赔付，所以 Ā_x 的极限是 1——只是折现把「迟早要赔」压成了现在的 ' + A.toFixed(4) +
        '。年龄越大越接近 1，利率越高越便宜。两条曲线的间距就是「晚投保 30 年」的价格。';
    }
  }));

  // ---------- 13 定期寿险与两全 ----------
  MUSEUM.add(C('13', {
    id: '13', slug: 'term-endow', hall: 3,
    titleEn: 'Term & Endowment', titleZh: '定期寿险与两全保险',
    controls: ctrls(true),
    kpis: function (s) {
      var T = M.AxTerm(s.B, s.c, s.x, s.d, s.n);
      var E = Math.exp(-s.d * s.n) * M.tpxG(s.B, s.c, s.x, s.n);
      return [
        { label: '定期寿险 Ā¹', value: T, fmt: 'x4' },
        { label: '纯生存保险 v^n·ₙpₓ', value: E, fmt: 'x4' },
        { label: '两全 Ā = 两者相加', value: T + E, fmt: 'x4' }
      ];
    },
    chart: function (s) {
      var term = [], pure = [], endow = [];
      for (var n = 1; n <= 40; n++) {
        var T = M.AxTerm(s.B, s.c, s.x, s.d, n);
        var E = Math.exp(-s.d * n) * M.tpxG(s.B, s.c, s.x, n);
        term.push([n, T]); pure.push([n, E]); endow.push([n, T + E]);
      }
      return {
        type: 'line', xDomain: [1, 40], xLabel: '保险期限 n（年）', yLabel: '每 1 元保额的精算现值',
        series: [
          { name: '定期寿险', cls: 's0', points: term },
          { name: '两全保险', cls: 's1', points: endow },
          { name: '纯生存保险', cls: 's2', points: pure, dash: true }
        ],
        markers: [{ x: s.n, y: M.AxEndow(s.B, s.c, s.x, s.d, s.n), label: 'n = ' + s.n }]
      };
    },
    notes: function (s) {
      var T = M.AxTerm(s.B, s.c, s.x, s.d, s.n);
      var E = Math.exp(-s.d * s.n) * M.tpxG(s.B, s.c, s.x, s.n);
      return '两者相加的两全险并不平——它随 n 单调下降：短期限时几乎全在买「活到期满」，期限拉长后死亡保障的比重才升上来，' +
        'n 再大又会回落到终身寿险的水平。当前期限下，保费里 ' + (T / (T + E) * 100).toFixed(1) +
        '% 在买死亡保障，' + (E / (T + E) * 100).toFixed(1) + '% 在买生存给付。';
    }
  }));

  // ---------- 14 生命年金 ----------
  MUSEUM.add(C('14', {
    id: '14', slug: 'lifeannuity', hall: 3,
    titleEn: 'Life Annuities', titleZh: '生命年金',
    controls: ctrls(true),
    kpis: function (s) {
      var ax = M.annWhole(s.B, s.c, s.x, s.d), Ax = M.AxWhole(s.B, s.c, s.x, s.d);
      return [
        { label: '定期年金 ā_{x:n}', value: M.annTerm(s.B, s.c, s.x, s.d, s.n), fmt: 'x4' },
        { label: '终身年金 ā_x', value: ax, fmt: 'x4' },
        { label: '简单年金 a_n（无视死亡）', value: M.aNM(s.d ? Math.exp(s.d) - 1 : 0, s.n, Infinity), fmt: 'x4' },
        { label: '恒等式 Ā_x + δ·ā_x（应为 1）', value: Ax + s.d * ax, fmt: 'x6' }
      ];
    },
    chart: function (s) {
      var pts = [];
      for (var n = 1; n <= 40; n++) pts.push([n, M.annTerm(s.B, s.c, s.x, s.d, n)]);
      var whole = M.annWhole(s.B, s.c, s.x, s.d);
      return {
        type: 'line', xDomain: [1, 40], yDomain: [0, Math.max(whole * 1.15, 5)],
        xLabel: '定期期限 n（年）', yLabel: '每期 1 元的现值',
        series: [{ name: 'ā_{x:n}', cls: 's0', points: pts }],
        hlines: [{ y: whole, label: '终身年金 ā_x = ' + whole.toFixed(3) }],
        markers: [{ x: s.n, y: M.annTerm(s.B, s.c, s.x, s.d, s.n), label: 'n = ' + s.n }]
      };
    },
    notes: function (s) {
      var whole = M.annWhole(s.B, s.c, s.x, s.d);
      var term = M.annTerm(s.B, s.c, s.x, s.d, s.n);
      return '生命年金永远不会涨到「简单年金」的水平，因为死亡在替你省钱——付得越久的人越少。' +
        '当前设置下，' + s.n + ' 年定期年金拿到了终身年金的 ' + (term / whole * 100).toFixed(1) + '%。';
    }
  }));

  // ---------- 15 净保费 ----------
  MUSEUM.add(C('15', {
    id: '15', slug: 'premium', hall: 3,
    titleEn: 'The Equivalence Principle', titleZh: '净保费原理',
    controls: ctrls(true),
    kpis: function (s) {
      var T = M.AxTerm(s.B, s.c, s.x, s.d, s.n);
      var ann = M.annTerm(s.B, s.c, s.x, s.d, s.n);
      var P = M.premium(T, ann);
      return [
        { label: '净保费率 P', value: P, fmt: 'x6' },
        { label: '每千元保额的年缴费率（连续缴费）', value: P * 1000, fmt: 'money' },
        { label: '精算现值 Ā¹_{x:n}', value: T, fmt: 'x4' },
        { label: '期初损失期望 Ā¹ − P·ā（应为 0）', value: T - P * ann, fmt: 'x6' }
      ];
    },
    chart: function (s) {
      var pts = [];
      for (var x = 20; x <= 90; x++) {
        var T = M.AxTerm(s.B, s.c, x, s.d, s.n);
        var ann = M.annTerm(s.B, s.c, x, s.d, s.n);
        pts.push([x, M.premium(T, ann)]);
      }
      return {
        type: 'line', xDomain: [20, 90], xLabel: '投保年龄 x', yLabel: '净保费率 P（每 1 元保额）',
        series: [{ name: 'P(x)，' + s.n + ' 年定期', cls: 's0', points: pts }],
        markers: [{ x: s.x, y: M.premium(M.AxTerm(s.B, s.c, s.x, s.d, s.n), M.annTerm(s.B, s.c, s.x, s.d, s.n)), label: 'P = ' + M.premium(M.AxTerm(s.B, s.c, s.x, s.d, s.n), M.annTerm(s.B, s.c, s.x, s.d, s.n)).toFixed(4) }]
      };
    },
    notes: function (s) {
      var P40 = M.premium(M.AxTerm(s.B, s.c, 40, s.d, s.n), M.annTerm(s.B, s.c, 40, s.d, s.n));
      var P60 = M.premium(M.AxTerm(s.B, s.c, 60, s.d, s.n), M.annTerm(s.B, s.c, 60, s.d, s.n));
      return '从 40 岁投保换到 60 岁，同样是 ' + s.n + ' 年定期，保费从 ' + P40.toFixed(4) + ' 涨到 ' +
        P60.toFixed(4) + '，是 ' + (P60 / P40).toFixed(1) + ' 倍。等价原理的全部含义只有一句：让投保那一刻的损失期望为零。';
    }
  }));

  // ---------- 16 前瞻准备金 ----------
  MUSEUM.add(C('16', {
    id: '16', slug: 'reserve', hall: 3,
    titleEn: 'Prospective Reserves', titleZh: '前瞻准备金',
    controls: ctrls(true),
    kpis: function (s) {
      var P = M.premium(M.AxTerm(s.B, s.c, s.x, s.d, s.n), M.annTerm(s.B, s.c, s.x, s.d, s.n));
      var mid = Math.round(s.n / 2);
      return [
        { label: '净保费 P', value: P, fmt: 'x6' },
        { label: 'V_0 期初', value: M.reserveTerm(s.B, s.c, s.x, s.d, P, 0, s.n), fmt: 'x6' },
        { label: 'V_' + mid + ' 中期', value: M.reserveTerm(s.B, s.c, s.x, s.d, P, mid, s.n), fmt: 'x4' }
      ];
    },
    chart: function (s) {
      var P = M.premium(M.AxTerm(s.B, s.c, s.x, s.d, s.n), M.annTerm(s.B, s.c, s.x, s.d, s.n));
      var pts = [];
      for (var t = 0; t <= s.n; t++) pts.push([t, M.reserveTerm(s.B, s.c, s.x, s.d, P, t, s.n)]);
      var peak = pts.reduce(function (a, b) { return b[1] > a[1] ? b : a; }, pts[0]);
      return {
        type: 'line', xDomain: [0, s.n], xLabel: '已过保单年度 t', yLabel: '前瞻准备金 V_t',
        series: [{ name: 'V_t', cls: 's0', points: pts, area: true }],
        hlines: [{ y: 0, label: 'V = 0' }],
        markers: [{ x: peak[0], y: peak[1], label: '峰值 ' + peak[1].toFixed(4) }]
      };
    },
    notes: function (s) {
      var P = M.premium(M.AxTerm(s.B, s.c, s.x, s.d, s.n), M.annTerm(s.B, s.c, s.x, s.d, s.n));
      var peak = 0, at = 0;
      for (var t = 0; t <= s.n; t++) {
        var v = M.reserveTerm(s.B, s.c, s.x, s.d, P, t, s.n);
        if (v > peak) { peak = v; at = t; }
      }
      return '准备金是驼峰不是直线：期初为零（等价原理），中途升到 ' + peak.toFixed(4) + '（第 ' + at +
        ' 年见顶），到期又归零——因为定期寿险到期没赔就什么都不剩。终身寿险没有这个回落，它会一路爬到 1。' +
        '这也是为什么「把准备金当成储蓄」在定期寿险上是错的。';
    }
  }));

})();
