/* hall2-survival.js — 展厅二 · 生存模型（4 件） */
(function () {
  'use strict';

  function C(id, obj) { return Object.assign({}, CONTENT[id] || {}, obj); }

  // ---------- 08 Gompertz 死亡力 ----------
  MUSEUM.add(C('08', {
    id: '08', slug: 'gompertz', hall: 2,
    titleEn: 'The Gompertz Law', titleZh: 'Gompertz 死亡力',
    controls: [
      { key: 'B', label: '基准死亡力 B', min: 0.00002, max: 0.001, step: 0.000002, value: 0.00003, fmt: 'x6' },
      { key: 'c', label: '老化因子 c', min: 1.00, max: 1.20, step: 0.001, value: 1.10, fmt: 'x3' },
      { key: 'x', label: '当前年龄 x', min: 0, max: 100, step: 1, value: 40, fmt: 'int' }
    ],
    kpis: function (s) {
      return [
        { label: 'μ(' + s.x + ') 死亡力', value: M.muG(s.B, s.c, s.x), fmt: 'x6' },
        { label: '10 年生存概率', value: M.tpxG(s.B, s.c, s.x, 10), fmt: 'x4' },
        { label: '当年死亡率 q_x', value: M.qxG(s.B, s.c, s.x), fmt: 'x4' }
      ];
    },
    chart: function (s) {
      var pts = [];
      for (var a = 0; a <= 110; a++) pts.push([a, M.muG(s.B, s.c, a)]);
      var cur = M.muG(s.B, s.c, s.x);
      return {
        type: 'line', xDomain: [0, 110], xLabel: '年龄', yLabel: '死亡力 μ(年龄)',
        series: [{ name: 'μ(x) = B·c^x', cls: 's0', points: pts }],
        markers: [{ x: s.x, y: cur, label: 'μ(' + s.x + ') = ' + cur.toFixed(5) }]
      };
    },
    notes: function (s) {
      var ratio = M.tpxG(s.B, s.c, s.x, 1) === 0 ? Infinity : M.muG(s.B, s.c, s.x + 10) / M.muG(s.B, s.c, s.x);
      return '死亡力每过 10 年就乘上 c¹⁰ ≈ ' + ratio.toFixed(3) + ' 倍，这是一个等比数列——所以 μ(x) 在图上是一条指数墙，' +
        '前半段几乎贴地，后半段陡直插上。Gompertz 的全部狡猾都在这个「前期骗人」里。';
    }
  }));

  // ---------- 09 生命表 ----------
  MUSEUM.add(C('09', {
    id: '09', slug: 'lifetable', hall: 2,
    titleEn: 'The Life Table', titleZh: '生命表',
    controls: [
      { key: 'B', label: '基准死亡力 B', min: 0.00002, max: 0.001, step: 0.000002, value: 0.00003, fmt: 'x6' },
      { key: 'c', label: '老化因子 c', min: 1.00, max: 1.20, step: 0.001, value: 1.10, fmt: 'x3' },
      { key: 'x', label: '查询年龄 x', min: 0, max: 100, step: 1, value: 40, fmt: 'int' }
    ],
    kpis: function (s) {
      return [
        { label: 'l(' + s.x + ') 存活比例', value: M.lxG(s.B, s.c, s.x), fmt: 'x4' },
        { label: 'q_' + s.x + ' 当年死亡率', value: M.qxG(s.B, s.c, s.x), fmt: 'x4' },
        { label: '活到 80 岁', value: M.tpxG(s.B, s.c, 0, 80), fmt: 'x4' }
      ];
    },
    chart: function (s) {
      var pts = [];
      for (var a = 0; a <= 110; a++) pts.push([a, M.lxG(s.B, s.c, a)]);
      return {
        type: 'line', xDomain: [0, 110], yDomain: [0, 1.02],
        xLabel: '年龄', yLabel: 'l(x) 存活比例',
        series: [{ name: 'l(x)', cls: 's1', points: pts, area: true }],
        hlines: [{ y: 0.5, label: '半数存活' }],
        markers: [{ x: s.x, y: M.lxG(s.B, s.c, s.x), label: 'l(' + s.x + ')' }]
      };
    },
    notes: function (s) {
      return 'l(x) 从 1 出发缓慢下滑，到某个年龄突然塌方。中间那条 0.5 线与曲线相交的年龄就是「中位寿命」——' +
        '它比预期余命更能说明这批人真实能活多久，因为它对个别超级长寿者不敏感。';
    }
  }));

  // ---------- 10 预期余命 ----------
  MUSEUM.add(C('10', {
    id: '10', slug: 'lifetime', hall: 2,
    titleEn: 'Expected Future Lifetime', titleZh: '预期余命',
    controls: [
      { key: 'B', label: '基准死亡力 B', min: 0.00002, max: 0.001, step: 0.000002, value: 0.00003, fmt: 'x6' },
      { key: 'c', label: '老化因子 c', min: 1.00, max: 1.20, step: 0.001, value: 1.10, fmt: 'x3' },
      { key: 'x', label: '当前年龄 x', min: 0, max: 100, step: 1, value: 40, fmt: 'int' }
    ],
    kpis: function (s) {
      return [
        { label: '余命 ė_' + s.x, value: exAt(s.B, s.c, s.x), fmt: 'years' },
        { label: '预期死亡年龄', value: s.x + exAt(s.B, s.c, s.x), fmt: 'years' },
        { label: '下一年存活 p_x', value: M.tpxG(s.B, s.c, s.x, 1), fmt: 'x4' }
      ];
    },
    chart: function (s) {
      var pts = [];
      for (var a = 0; a <= 100; a += 2) pts.push([a, exAt(s.B, s.c, a)]);
      return {
        type: 'line', xDomain: [0, 100], xLabel: '当前年龄 x', yLabel: '预期余命 e_x（年）',
        series: [{ name: 'e_x', cls: 's0', points: pts }],
        markers: [{ x: s.x, y: exAt(s.B, s.c, s.x), label: 'e_' + s.x + ' = ' + exAt(s.B, s.c, s.x).toFixed(1) }]
      };
    },
    notes: function (s) {
      var e0 = exAt(s.B, s.c, 0), ex = exAt(s.B, s.c, s.x);
      var drop = ex - exAt(s.B, s.c, s.x + 1);
      return '每多活一年，余命只下降 ' + drop.toFixed(3) + ' 年——所以「预期死亡年龄」几乎不动，现在算出来是 ' +
        (s.x + ex).toFixed(1) + ' 岁，和出生时算的 ' + e0.toFixed(1) + ' 岁差不了多少。' +
        'Gompertz 的死亡力越往后越陡：新赚到的一年，恰好被后面更高的死亡风险抵消掉了。';
    }
  }));

  // ---------- 11 分数年龄假设 ----------
  MUSEUM.add(C('11', {
    id: '11', slug: 'fractional', hall: 2,
    titleEn: 'Fractional Age Assumptions', titleZh: '分数年龄假设',
    controls: [
      { key: 'p', label: '一年生存概率 p_x', min: 0.90, max: 0.999, step: 0.001, value: 0.98, fmt: 'x4' },
      { key: 't', label: '年内时点 t', min: 0, max: 1, step: 0.01, value: 0.5, fmt: 'x2' },
      {
        key: 'a', label: '假设', value: 'udd',
        options: [
          { value: 'udd', label: 'UDD · 死亡均匀分布' },
          { value: 'cfm', label: '常数死亡力 · 几何插值' },
          { value: 'balducci', label: 'Balducci · 调和插值' }
        ]
      }
    ],
    kpis: function (s) {
      var udd = M.tpxFrac(s.p, s.t, 'udd');
      var cur = M.tpxFrac(s.p, s.t, s.a);
      return [
        { label: 'ₜp_x 当前假设', value: cur, fmt: 'x6' },
        { label: 'ₜq_x 当前假设', value: 1 - cur, fmt: 'x6' },
        { label: '与 UDD 之差', value: cur - udd, fmt: 'x6' }
      ];
    },
    chart: function (s) {
      function curve(which) {
        var pts = [];
        for (var t = 0; t <= 1.0001; t += 0.02) pts.push([t, M.tpxFrac(s.p, t, which)]);
        return pts;
      }
      return {
        type: 'line', xDomain: [0, 1], yDomain: [s.p - 0.01, 1.005],
        xLabel: '年内时点 t', yLabel: 'ₜp_x 存活概率',
        series: [
          { name: 'UDD（直）', cls: 's0', points: curve('udd') },
          { name: '常数死亡力（凸）', cls: 's1', points: curve('cfm') },
          { name: 'Balducci（凹）', cls: 's2', points: curve('balducci') }
        ],
        markers: [{ x: s.t, y: M.tpxFrac(s.p, s.t, s.a), label: 't = ' + s.t.toFixed(2) }]
      };
    },
    notes: function (s) {
      var udd = M.tpxFrac(s.p, s.t, 'udd');
      var cfm = M.tpxFrac(s.p, s.t, 'cfm');
      var bal = M.tpxFrac(s.p, s.t, 'balducci');
      return '三条曲线在 t=0 和 t=1 处必定重合，中间才分家：UDD ' + udd.toFixed(5) +
        '，常数死亡力 ' + cfm.toFixed(5) + '，Balducci ' + bal.toFixed(5) +
        '。差在小数第四位上看起来无所谓，但精算里它会被乘上成千上万份保单。';
    }
  }));

  /* e_x：对 t p_x 从 0 积到生命表上限 */
  function exAt(B, c, x) {
    return M.integrate(function (t) { return M.tpxG(B, c, x, t); }, 0, Math.max(0, 130 - x), 300);
  }

})();
