/* core.js — 注册表、渲染、交互。展品文件只声明对象，引擎负责其余。 */
var MUSEUM = (function () {
  'use strict';

  var HALLS = {
    1: { zh: '利息理论', en: 'Interest Theory', note: '钱在时间里的换算率。所有精算估值的地基。' },
    2: { zh: '生存模型', en: 'Survival Models', note: '把「还能活多久」写成一条可积分的曲线。' },
    3: { zh: '生命年金与寿险', en: 'Life Contingencies', note: '生存概率与利息折现相乘，就是保险的价格。' },
    4: { zh: '风险理论', en: 'Risk Theory', note: '单笔损失不可预测，但一万笔的分布很听话。' }
  };

  var items = [];

  // ---------- 数值格式 ----------
  var FMT = {
    pct: function (v) { return fmtNum(v * 100, 2) + '%'; },
    pct1: function (v) { return fmtNum(v * 100, 1) + '%'; },
    pct3: function (v) { return fmtNum(v * 100, 3) + '%'; },
    x2: function (v) { return fmtNum(v, 2); },
    x3: function (v) { return fmtNum(v, 3); },
    x4: function (v) { return fmtNum(v, 4); },
    x6: function (v) { return fmtNum(v, 6); },
    money: function (v) { return fmtNum(v, 2); },
    int: function (v) { return fmtNum(Math.round(v), 0); },
    years: function (v) { return fmtNum(v, 2) + ' 年'; },
    raw: function (v) { return String(v); }
  };

  function fmtNum(v, d) {
    if (v === Infinity) return '∞';
    if (v === -Infinity) return '−∞';
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    var s = Math.abs(v) >= 1e7 ? v.toExponential(2) : v.toFixed(d);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '−' : '') + parts.join('.').replace(/^-/, '');
  }

  function fmt(v, f) {
    if (v === '—' || f === 'text') return String(v);
    var fn = FMT[f] || FMT.x4;
    return fn(v);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------- 注册 ----------
  function add(ex) {
    if (!ex || !ex.id) throw new Error('展品缺少 id');
    items.push(ex);
  }

  // ---------- 渲染单个展品 ----------
  function buildSection(ex) {
    var el = document.createElement('article');
    el.className = 'exhibit';
    el.id = 'ex-' + ex.id;
    el.dataset.hall = ex.hall;

    var state = {};
    ex.controls.forEach(function (c) { state[c.key] = c.value; });

    var formulas = (ex.formula || []).map(function (f) {
      return '<div class="formula-line">' + esc(f) + '</div>';
    }).join('');

    var watch = (ex.watch || []).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('');

    el.innerHTML =
      '<header class="ex-head">' +
        '<span class="ex-num">' + esc(ex.id) + '</span>' +
        '<h2 class="ex-title">' + esc(ex.titleEn) + '</h2>' +
        '<span class="ex-zh">' + esc(ex.titleZh) + '</span>' +
      '</header>' +
      '<p class="ex-oneline">' + esc(ex.oneLine) + '</p>' +
      '<div class="ex-grid">' +
        '<div class="ex-stage">' +
          '<div class="kpis"></div>' +
          '<div class="chart-wrap"></div>' +
          '<div class="controls"></div>' +
          '<div class="ex-notes"></div>' +
        '</div>' +
        '<div class="ex-prose">' +
          '<p class="ex-lead">' + esc(ex.lead) + '</p>' +
          (formulas ? '<div class="formula">' + formulas + '</div>' : '') +
          (watch ? '<div class="watch"><h3>该看什么</h3><ul>' + watch + '</ul></div>' : '') +
          (ex.history ? '<div class="aside"><h3>来历</h3><p>' + esc(ex.history) + '</p></div>' : '') +
          (ex.pitfall ? '<div class="pitfall"><h3>常见误解</h3><p>' + esc(ex.pitfall) + '</p></div>' : '') +
        '</div>' +
      '</div>';

    var kpiBox = el.querySelector('.kpis');
    var chartBox = el.querySelector('.chart-wrap');
    var ctrlBox = el.querySelector('.controls');
    var notesBox = el.querySelector('.ex-notes');

    // 滑块
    ex.controls.forEach(function (c) {
      var wrap = document.createElement('label');
      wrap.className = 'ctrl';
      var display = c.options
        ? ''
        : '<output class="ctrl-val">' + fmt(c.value, c.disp || c.fmt || 'x4') + '</output>';
      wrap.innerHTML = '<span class="ctrl-label">' + esc(c.label) + '</span>' + display +
        (c.hint ? '<span class="ctrl-hint">' + esc(c.hint) + '</span>' : '');

      var input;
      if (c.options) {
        input = document.createElement('select');
        input.className = 'ctrl-select';
        c.options.forEach(function (o) {
          var op = document.createElement('option');
          op.value = o.value;
          op.textContent = o.label;
          if (String(o.value) === String(c.value)) op.selected = true;
          input.appendChild(op);
        });
        input.addEventListener('change', function () {
          state[c.key] = c.parse ? c.parse(input.value) : parseFloat(input.value);
          schedule();
        });
      } else {
        input = document.createElement('input');
        input.type = 'range';
        input.min = c.min; input.max = c.max; input.step = c.step; input.value = c.value;
        input.setAttribute('aria-label', c.label);
        input.addEventListener('input', function () {
          var v = parseFloat(input.value);
          state[c.key] = v;
          var out = wrap.querySelector('.ctrl-val');
          if (out) out.textContent = fmt(v, c.disp || c.fmt || 'x4');
          schedule();
        });
      }
      wrap.appendChild(input);
      ctrlBox.appendChild(wrap);
    });

    var pending = false;
    function schedule() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; update(); });
    }

    function update() {
      // KPI
      var kp = ex.kpis(state) || [];
      kpiBox.innerHTML = kp.map(function (k) {
        return '<div class="kpi"><span class="kpi-label">' + esc(k.label) + '</span>' +
          '<span class="kpi-value' + (k.weak ? ' weak' : '') + '">' +
          esc(k.text !== undefined ? k.text : fmt(k.value, k.fmt)) + '</span></div>';
      }).join('');

      // 图表
      var spec = ex.chart(state);
      chartBox.innerHTML = (spec ? Chart.legend(spec) + Chart.render(spec) : '');

      // 动态批注
      if (notesBox) {
        var nt = ex.notes ? ex.notes(state) : '';
        notesBox.innerHTML = nt ? '<p>' + esc(nt) + '</p>' : '';
      }
    }

    el._update = update;
    update();
    return el;
  }

  // ---------- 导航 ----------
  function buildNav() {
    var nav = document.getElementById('nav-list');
    var halls = {};
    items.forEach(function (ex) { (halls[ex.hall] = halls[ex.hall] || []).push(ex); });

    Object.keys(halls).sort().forEach(function (h) {
      var hd = HALLS[h] || { zh: '展厅 ' + h, en: '' };
      var group = document.createElement('div');
      group.className = 'nav-hall';
      group.innerHTML = '<div class="nav-hall-name">' + esc(hd.zh) + '</div>' +
        '<div class="nav-hall-en">' + esc(hd.en) + '</div>';
      var list = document.createElement('div');
      list.className = 'nav-items';
      halls[h].forEach(function (ex) {
        var a = document.createElement('a');
        a.className = 'nav-item';
        a.href = '#ex-' + ex.id;
        a.innerHTML = '<span class="nav-num">' + ex.id + '</span><span class="nav-txt">' + esc(ex.titleZh) + '</span>';
        a.addEventListener('click', function (e) {
          e.preventDefault();
          document.getElementById('ex-' + ex.id).scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        list.appendChild(a);
      });
      group.appendChild(list);
      nav.appendChild(group);
    });
  }

  function buildBody() {
    var root = document.getElementById('hall-root');
    var halls = {};
    items.forEach(function (ex) { (halls[ex.hall] = halls[ex.hall] || []).push(ex); });

    Object.keys(halls).sort().forEach(function (h) {
      var hd = HALLS[h] || { zh: '展厅 ' + h, en: '' };
      var sec = document.createElement('section');
      sec.className = 'hall';
      sec.id = 'hall-' + h;
      sec.innerHTML = '<div class="hall-head"><span class="hall-idx">展厅 ' +
        ['一', '二', '三', '四', '五'][h - 1] + '</span>' +
        '<h2>' + esc(hd.zh) + '<span class="hall-en">' + esc(hd.en) + '</span></h2>' +
        '<p class="hall-note">' + esc(hd.note || '') + '</p></div>';
      halls[h].forEach(function (ex) { sec.appendChild(buildSection(ex)); });
      root.appendChild(sec);
    });
  }

  // ---------- 滚动高亮 ----------
  function spy() {
    var links = {};
    document.querySelectorAll('.nav-item').forEach(function (a) {
      links[a.getAttribute('href').slice(1)] = a;
    });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id;
        Object.keys(links).forEach(function (k) { links[k].classList.toggle('on', k === id); });
      });
    }, { rootMargin: '-20% 0px -65% 0px', threshold: 0 });
    document.querySelectorAll('.exhibit').forEach(function (s) { obs.observe(s); });
  }

  // ---------- 启动 ----------
  function start() {
    buildNav();
    buildBody();
    spy();
    document.getElementById('total').textContent = items.length;
    document.body.classList.add('ready');
  }

  return { add: add, start: start, items: items, FMT: FMT, fmt: fmt };
})();
