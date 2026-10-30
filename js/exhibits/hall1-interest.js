/* hall1-interest.js — 展厅一 · 利息理论（7 件） */
(function () {
  'use strict';

  function C(id, obj) { return Object.assign({}, CONTENT[id] || {}, obj); }

  // ---------- 01 累积与折现 ----------
  MUSEUM.add(C('01', {
    id: '01', slug: 'accumulation', hall: 1,
    titleEn: 'Accumulation & Discount', titleZh: '累积与折现',
    controls: [
      { key: 'i', label: '年利率 i', min: 0.001, max: 0.20, step: 0.001, value: 0.05, fmt: 'pct1' },
      { key: 'n', label: '年数 n', min: 1, max: 50, step: 1, value: 10, fmt: 'int' }
    ],
    kpis: function (s) {
      return [
        { label: '累积因子 A(n)', value: M.accum(s.i, s.n), fmt: 'x4' },
        { label: '折现因子 v^n', value: M.disc(s.i, s.n), fmt: 'x4' },
        { label: '利息力 δ', value: M.forceOfInterest(s.i), fmt: 'x4' }
      ];
    },
    chart: function (s) {
      var up = [], dn = [];
      for (var t = 0; t <= s.n; t++) {
        up.push([t, M.accum(s.i, t)]);
        dn.push([t, M.disc(s.i, t)]);
      }
      return {
        type: 'line', xDomain: [0, s.n], xLabel: '年数 t', yLabel: '1 元的倍数',
        series: [
          { name: '累积 (1+i)^t', cls: 's0', points: up },
          { name: '折现 v^t', cls: 's1', points: dn }
        ],
        hlines: [{ y: 1, label: '本金 1' }]
      };
    },
    notes: function (s) {
      return '同样一笔 1 元：往前推 ' + s.n + ' 年会变成 ' + (1 + s.i === 0 ? 1 : M.accum(s.i, s.n)).toFixed(2) +
        ' 元；往后折 ' + s.n + ' 年只值 ' + M.disc(s.i, s.n).toFixed(4) + ' 元。两个方向的倍数互为倒数。';
    }
  }));

  // ---------- 02 利息力 ----------
  MUSEUM.add(C('02', {
    id: '02', slug: 'force', hall: 1,
    titleEn: 'Force of Interest', titleZh: '利息力',
    controls: [
      { key: 'd', label: '利息力 δ', min: 0.001, max: 0.15, step: 0.001, value: 0.05, fmt: 'pct1' },
      { key: 't', label: '观察期 t（年）', min: 0, max: 40, step: 1, value: 10, fmt: 'int' }
    ],
    kpis: function (s) {
      return [
        { label: '等效年利率 i', value: M.effectiveFromForce(s.d), fmt: 'pct' },
        { label: '折现因子 v^t', value: Math.exp(-s.d * s.t), fmt: 'x4' },
        { label: '累积 e^(δt)', value: Math.exp(s.d * s.t), fmt: 'x4' }
      ];
    },
    chart: function (s) {
      function curve(delta) {
        var pts = [];
        for (var t = 0; t <= 40; t++) pts.push([t, Math.exp(-delta * t)]);
        return pts;
      }
      return {
        type: 'line', xDomain: [0, 40], yDomain: [0, 1.02],
        xLabel: '时间 t（年）', yLabel: '折现因子 v^t',
        series: [
          { name: 'δ = ' + (s.d * 100).toFixed(1) + '%', cls: 's0', points: curve(s.d) },
          { name: 'δ 减半', cls: 's3', points: curve(s.d / 2), dash: true },
          { name: 'δ 翻倍', cls: 's2', points: curve(Math.min(0.4, s.d * 2)), dash: true }
        ],
        markers: [{ x: s.t, y: Math.exp(-s.d * s.t), label: s.t + ' 年' }]
      };
    },
    notes: function (s) {
      return '利息力是「连续复利下的瞬时利率」。δ 翻倍不等于 i 翻倍——δ=' + (s.d * 100).toFixed(1) +
        '% 相当于年利率 ' + (M.effectiveFromForce(s.d) * 100).toFixed(2) + '%，而 δ=' +
        (Math.min(0.4, s.d * 2) * 100).toFixed(1) + '% 相当于 ' +
        (M.effectiveFromForce(Math.min(0.4, s.d * 2)) * 100).toFixed(2) + '%。';
    }
  }));

  // ---------- 03 净现值与内部收益率 ----------
  MUSEUM.add(C('03', {
    id: '03', slug: 'npv-irr', hall: 1,
    titleEn: 'NPV & IRR', titleZh: '净现值与内部收益率',
    controls: [
      { key: 'P', label: '初始投入 P', min: 200, max: 3000, step: 50, value: 1000, fmt: 'money' },
      { key: 'cf', label: '每年收入 C', min: 0, max: 600, step: 10, value: 200, fmt: 'money' },
      { key: 'n', label: '期数 n', min: 1, max: 20, step: 1, value: 8, fmt: 'int' },
      { key: 'i', label: '折现率 i', min: 0.001, max: 0.25, step: 0.001, value: 0.06, fmt: 'pct1' }
    ],
    flows: function (s) {
      var f = [{ t: 0, v: -s.P }];
      for (var k = 1; k <= s.n; k++) f.push({ t: k, v: s.cf });
      return f;
    },
    kpis: function (s) {
      var f = this.flows(s);
      var irr = M.irr(f);
      var irrKpi = isFinite(irr)
        ? { label: '内部收益率 IRR', value: irr, fmt: 'pct' }
        : { label: '内部收益率 IRR', text: '不存在', weak: true };
      return [
        { label: 'NPV @ ' + (s.i * 100).toFixed(1) + '%', value: M.npv(s.i, f), fmt: 'money' },
        irrKpi,
        { label: '名义总回报', value: s.cf * s.n - s.P, fmt: 'money' }
      ];
    },
    chart: function (s) {
      var f = this.flows(s), pts = [];
      for (var r = -0.05; r <= 0.30001; r += 0.005) pts.push([r, M.npv(r, f)]);
      var irr = M.irr(f);
      return {
        type: 'line', xDomain: [-0.05, 0.30], xLabel: '折现率', yLabel: '净现值 NPV',
        series: [{ name: 'NPV(折现率)', cls: 's0', points: pts }],
        hlines: [{ y: 0, label: 'NPV = 0' }],
        markers: [
          { x: s.i, y: M.npv(s.i, f), label: '当前' },
          { x: irr, y: 0, label: 'IRR', cls: 's1' }
        ]
      };
    },
    notes: function (s) {
      var irr = M.irr(this.flows(s));
      if (!isFinite(irr)) return '这套现金流在任何正折现率下都收不回本金——IRR 不存在。把年收入 C 调高或把 n 拉长。';
      return '曲线与零轴的交点就是 IRR。折现率低于 IRR 时 NPV 为正，项目值得做；高于 IRR 就该放弃。';
    }
  }));

  // ---------- 04 年金现值 ----------
  MUSEUM.add(C('04', {
    id: '04', slug: 'annuity', hall: 1,
    titleEn: 'Annuity-Immediate', titleZh: '年金现值',
    controls: [
      { key: 'i', label: '年利率 i', min: 0.005, max: 0.20, step: 0.001, value: 0.05, fmt: 'pct1' },
      { key: 'n', label: '付款年数 n', min: 0, max: 50, step: 1, value: 10, fmt: 'int' }
    ],
    kpis: function (s) {
      return [
        { label: 'a_n 年金现值', value: M.aN(s.i, s.n), fmt: 'x4' },
        { label: 's_n 年金终值', value: M.sN(s.i, s.n), fmt: 'x4' },
        { label: '上限 1/i', value: M.perpetuity(s.i), fmt: 'x4' }
      ];
    },
    chart: function (s) {
      var pts = [];
      for (var t = 0; t <= 50; t++) pts.push([t, M.aN(s.i, t)]);
      return {
        type: 'line', xDomain: [0, 50], xLabel: '付款年数 n', yLabel: '每期 1 元的现值',
        series: [{ name: 'a_n', cls: 's0', points: pts }],
        hlines: [{ y: M.perpetuity(s.i), label: '极限 1/i = ' + M.perpetuity(s.i).toFixed(2) }],
        markers: [{ x: s.n, y: M.aN(s.i, s.n), label: 'a_' + s.n }]
      };
    },
    notes: function (s) {
      var pct = M.aN(s.i, s.n) / M.perpetuity(s.i);
      return '第 ' + s.n + ' 期时已经拿到永续年金上限的 ' + (pct * 100).toFixed(1) +
        '%。利率越高，收敛越快——这就是为什么高利率环境下长期年金不值钱。';
    }
  }));

  // ---------- 05 付款频率 ----------
  MUSEUM.add(C('05', {
    id: '05', slug: 'frequency', hall: 1,
    titleEn: 'Payment Frequency', titleZh: '付款频率',
    controls: [
      { key: 'i', label: '年利率 i', min: 0.005, max: 0.20, step: 0.001, value: 0.05, fmt: 'pct1' },
      { key: 'n', label: '年数 n', min: 1, max: 40, step: 1, value: 10, fmt: 'int' },
      {
        key: 'm', label: '每年付款次数 m', value: 12,
        options: [
          { value: 1, label: '1 次 · 年付' },
          { value: 2, label: '2 次 · 半年' },
          { value: 4, label: '4 次 · 季付' },
          { value: 12, label: '12 次 · 月付' },
          { value: 52, label: '52 次 · 周付' },
          { value: 'Infinity', label: '∞ · 连续付款' }
        ],
        parse: function (v) { return v === 'Infinity' ? Infinity : parseFloat(v); }
      }
    ],
    kpis: function (s) {
      return [
        { label: 'a_n^(m) 现值', value: M.aNM(s.i, s.n, s.m), fmt: 'x4' },
        { label: '名义利率 i^(m)', value: M.iM(s.i, s.m), fmt: 'pct' },
        { label: '连续年金 ā_n', value: M.aNM(s.i, s.n, Infinity), fmt: 'x4' }
      ];
    },
    chart: function (s) {
      var pts = [];
      for (var m = 1; m <= 52; m++) pts.push([m, M.aNM(s.i, s.n, m)]);
      var cont = M.aNM(s.i, s.n, Infinity);
      var marker = [{ x: s.m === Infinity ? 52 : s.m, y: M.aNM(s.i, s.n, s.m), label: 'm = ' + (s.m === Infinity ? '∞' : s.m) }];
      return {
        type: 'line', xDomain: [1, 52], xLabel: '每年付款次数 m', yLabel: '每期 1/ m 元、共 mn 期的现值',
        series: [{ name: 'a_n^(m)', cls: 's0', points: pts }],
        hlines: [{ y: cont, label: '连续付款上限 ' + cont.toFixed(4) }],
        markers: marker
      };
    },
    notes: function (s) {
      var diff = M.aNM(s.i, s.n, Infinity) - M.aNM(s.i, s.n, 1);
      return '从年付改成年内连续付款，同一笔现金流的总现值只多出 ' + diff.toFixed(4) +
        '（约 ' + (diff / M.aNM(s.i, s.n, 1) * 100).toFixed(2) + '%）。付款越频繁，钱到手越早，现值越高，但增幅递减。';
    }
  }));

  // ---------- 06 永续年金 ----------
  MUSEUM.add(C('06', {
    id: '06', slug: 'perpetuity', hall: 1,
    titleEn: 'Perpetuity', titleZh: '永续年金',
    controls: [
      { key: 'i', label: '利率 i', min: 0.01, max: 0.20, step: 0.001, value: 0.04, fmt: 'pct1' },
      { key: 'g', label: '年增长率 g', min: -0.02, max: 0.09, step: 0.001, value: 0.02, fmt: 'pct1' }
    ],
    kpis: function (s) {
      return [
        { label: '永续年金 1/i', value: M.perpetuity(s.i), fmt: 'x4' },
        { label: '增长型 (1+g)/(i−g)', value: M.growingPerpetuity(s.i, s.g), fmt: 'x4' },
        { label: '安全差 i − g', value: s.i - s.g, fmt: 'pct' }
      ];
    },
    chart: function (s) {
      var flat = [], grow = [];
      for (var i = 0.01; i <= 0.2001; i += 0.002) {
        flat.push([i, M.perpetuity(i)]);
        var v = M.growingPerpetuity(i, s.g);
        grow.push([i, v > 60 ? NaN : v]);
      }
      return {
        type: 'line', xDomain: [0.01, 0.20], yDomain: [0, Math.min(60, Math.max(8, M.perpetuity(s.i) * 1.15))],
        xLabel: '利率 i', yLabel: '每期 1 元的现值',
        series: [
          { name: '永续年金 1/i', cls: 's0', points: flat },
          { name: '增长型 g = ' + (s.g * 100).toFixed(1) + '%', cls: 's1', points: grow }
        ],
        markers: [{ x: s.i, y: Math.min(M.perpetuity(s.i), 60), label: '当前 i' }],
        vlines: s.g > 0.01 ? [{ x: s.g, label: 'i = g' }] : []
      };
    },
    notes: function (s) {
      if (s.i <= s.g) return '利率不高于增长率时，增长型永续年金的现值发散为无穷——戈登模型在这个区间失效，不是算术出错。';
      return '增长率每往上抬一点，分母 i − g 就薄一点，现值就爆一截。当 g 逼近 i，估值先于数学失效：一个小数点级的分歧就能让「合理价格」差上数倍。';
    }
  }));

  // ---------- 07 投资收益率 ----------
  MUSEUM.add(C('07', {
    id: '07', slug: 'return', hall: 1,
    titleEn: 'TWRR vs MWRR', titleZh: '投资收益率：时间加权与金额加权',
    controls: [
      { key: 'r1', label: '第 1 年收益', min: -0.30, max: 0.50, step: 0.01, value: 0.10, fmt: 'pct1' },
      { key: 'r2', label: '第 2 年收益', min: -0.30, max: 0.50, step: 0.01, value: -0.05, fmt: 'pct1' },
      { key: 'r3', label: '第 3 年收益', min: -0.30, max: 0.50, step: 0.01, value: 0.08, fmt: 'pct1' },
      { key: 'D', label: '第 1 年末追加投入', min: 0, max: 3000, step: 50, value: 500, fmt: 'money' }
    ],
    vals: function (s) {
      var v0 = 1000;
      var v1 = v0 * (1 + s.r1);
      var v2 = (v1 + s.D) * (1 + s.r2);
      var v3 = v2 * (1 + s.r3);
      return { v0: v0, v1: v1, v2: v2, v3: v3 };
    },
    kpis: function (s) {
      var v = this.vals(s);
      var sp = (v.v3 / v.v0);
      var tw = Math.pow(sp, 1 / 3) - 1; // 近似：未考虑中途投入对本金基数的影响
      var flows = [{ t: 0, v: -v.v0 }, { t: 1, v: -s.D }, { t: 3, v: v.v3 }];
      return [
        { label: 'TWRR 时间加权', value: Math.pow((1 + s.r1) * (1 + s.r2) * (1 + s.r3), 1 / 3) - 1, fmt: 'pct' },
        { label: 'MWRR 金额加权', value: M.irr(flows), fmt: 'pct' },
        { label: '期末总额', value: v.v3, fmt: 'money' }
      ];
    },
    chart: function (s) {
      var v = this.vals(s);
      return {
        type: 'line', xDomain: [0, 3], xLabel: '年', yLabel: '账户价值',
        series: [{
          name: '账户价值', cls: 's0', area: true,
          points: [[0, v.v0], [1, v.v1 + s.D], [2, v.v2], [3, v.v3]]
        }],
        markers: [{ x: 1, y: v.v1 + s.D, label: '追加 ' + s.D }]
      };
    },
    notes: function (s) {
      var flows = [{ t: 0, v: -1000 }, { t: 1, v: -s.D }, { t: 3, v: this.vals(s).v3 }];
      var tw = Math.pow((1 + s.r1) * (1 + s.r2) * (1 + s.r3), 1 / 3) - 1;
      var mw = M.irr(flows);
      var gap = mw - tw;
      return 'TWRR 只问「这三年的市场表现折算成年化是多少」，与投入多少无关；MWRR 把追加投入的资金量也算了进去。这里两者差 ' +
        (gap * 100).toFixed(2) + ' 个百分点——差距的来源是你追加投入的时点，而不是市场本身。' +
        (gap < -0.0001 ? '在下跌的第 2 年之前追加，钱买在了高位，金额加权被拖低。' : '');
    }
  }));

})();
