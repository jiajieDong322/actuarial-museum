/* charts.js — 手写 SVG 图表。三种图：折线、柱、直方。零依赖。
   所有颜色走 CSS 变量，跟着主题走。返回字符串，由 core.js 注入。 */
var Chart = (function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 刻度取整：把任意区间的刻度落成 1/2/5×10^k，避免出现 0.3333 这种刻度。 */
  function niceNum(x, round) {
    if (x === 0) return 0;
    var exp = Math.floor(Math.log(Math.abs(x)) / Math.LN10);
    var f = Math.abs(x) / Math.pow(10, exp);
    var nf;
    if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return Math.sign(x) * nf * Math.pow(10, exp);
  }

  function ticks(min, max, count) {
    if (!isFinite(min) || !isFinite(max) || max <= min) return { values: [min], lo: min, hi: max, step: 1 };
    var step = niceNum((max - min) / Math.max(1, count - 1), true);
    if (step === 0) step = 1;
    var lo = Math.floor(min / step) * step;
    var hi = Math.ceil(max / step) * step;
    var out = [];
    for (var v = lo; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(12));
    return { values: out, lo: lo, hi: hi, step: step };
  }

  function fmtAxis(v, step) {
    var a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1000) return (v / 1000).toFixed(a >= 10000 ? 0 : 1) + 'k';
    if (a >= 0.01) return String(+v.toFixed(2));
    // 小于 0.01 走科学计数，且保留一位尾数——否则 0.0008 与 0.0012 会同时印成 1e-3
    var exp = Math.floor(Math.log(a) / Math.LN10);
    var mant = v / Math.pow(10, exp);
    return mant.toFixed(1) + 'e' + exp;
  }

  function pathFrom(points) {
    var d = '', pen = false;
    for (var k = 0; k < points.length; k++) {
      var p = points[k];
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2);
      d += ' ';
      pen = true;
    }
    return d.trim();
  }

  var clipSeq = 0;

  /* 主渲染。spec 见 ARCHITECTURE.md；返回完整 <svg>。 */
  function render(spec) {
    var W = 720, H = spec.height || 330;
    var m = { l: 70, r: 20, t: 18, b: 52 };
    if (spec.xLabel === false) m.b = 20;
    var pw = W - m.l - m.r, ph = H - m.t - m.b;

    var xs = spec.xDomain, ys = spec.yDomain;
    if (!xs) {
      var lo = Infinity, hi = -Infinity;
      (spec.series || []).forEach(function (s) {
        s.points.forEach(function (p) {
          if (isFinite(p[0])) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); }
        });
      });
      xs = [lo, hi];
    }
    if (!ys) {
      var ly = Infinity, hy = -Infinity;
      (spec.series || []).forEach(function (s) {
        s.points.forEach(function (p) {
          if (isFinite(p[1])) { ly = Math.min(ly, p[1]); hy = Math.max(hy, p[1]); }
        });
      });
      (spec.hlines || []).forEach(function (h) {
        if (isFinite(h.y)) { ly = Math.min(ly, h.y); hy = Math.max(hy, h.y); }
      });
      if (!isFinite(ly)) { ly = 0; hy = 1; }
      var pad = (hy - ly) * 0.08 || 1;
      // 全为正且下半区很空时，下界直接压到 0，免得无意义的负值区白占一块图
      var lo = (ly >= 0 && ly <= hy * 0.35) ? 0 : ly - pad;
      ys = [lo, hy + pad];
    }

    var tx = ticks(xs[0], xs[1], 7), ty = ticks(ys[0], ys[1], 6);
    var X = function (v) { return m.l + (v - tx.lo) / (tx.hi - tx.lo || 1) * pw; };
    var Y = function (v) { return m.t + ph - (v - ty.lo) / (ty.hi - ty.lo || 1) * ph; };

    var s = [];
    s.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' +
      esc(spec.aria || spec.yLabel || 'chart') + '">');
    // 绘图区裁剪：曲线冲出 y 轴区间时（如 g→i 时 (1+g)/(i−g) 发散）只画到框边，
    // 不靠 svg 的 overflow 兜——.chart-svg 是 overflow:visible，越界会直接画到卡片外。
    var clipId = 'clip' + (++clipSeq);
    s.push('<defs><clipPath id="' + clipId + '"><rect x="' + m.l + '" y="' + m.t +
      '" width="' + pw + '" height="' + ph + '"/></clipPath></defs>');

    // 网格 + y 轴刻度
    ty.values.forEach(function (v) {
      var y = Y(v);
      if (y < m.t - 1 || y > m.t + ph + 1) return;
      s.push('<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>');
      s.push('<text class="tick" x="' + (m.l - 8) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' +
        fmtAxis(v, ty.step) + '</text>');
    });
    // x 轴刻度
    tx.values.forEach(function (v) {
      var x = X(v);
      if (x < m.l - 1 || x > W - m.r + 1) return;
      s.push('<line class="grid grid-x" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + m.t + '" y2="' + (m.t + ph) + '"/>');
      s.push('<text class="tick" x="' + x.toFixed(1) + '" y="' + (m.t + ph + 18) + '" text-anchor="middle">' +
        fmtAxis(v, tx.step) + '</text>');
    });

    // 阴影带（VaR/TVaR 用）
    (spec.bands || []).forEach(function (b) {
      var x0 = Math.max(X(b.x0), m.l), x1 = Math.min(X(b.x1), W - m.r);
      if (x1 <= x0) return;
      s.push('<rect class="band ' + (b.cls || '') + '" x="' + x0.toFixed(1) + '" y="' + m.t + '" width="' +
        (x1 - x0).toFixed(1) + '" height="' + ph + '"/>');
    });

    // 零线
    if (ty.lo < 0 && ty.hi > 0) {
      var y0 = Y(0);
      s.push('<line class="axis" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '"/>');
    }

    // 水平参考线
    (spec.hlines || []).forEach(function (h) {
      if (!isFinite(h.y)) return;
      var y = Y(h.y);
      if (y < m.t || y > m.t + ph) return;
      s.push('<line class="ref" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"' +
        (h.dash === false ? '' : ' stroke-dasharray="4 4"') + '/>');
      if (h.label) {
        s.push('<text class="ref-label" x="' + (W - m.r - 6) + '" y="' + (y - 7).toFixed(1) + '" text-anchor="end">' + esc(h.label) + '</text>');
      }
    });

    // 垂直参考线
    (spec.vlines || []).forEach(function (v) {
      if (!isFinite(v.x)) return;
      var x = X(v.x);
      if (x < m.l || x > W - m.r) return;
      s.push('<line class="ref" x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + m.t + '" y2="' + (m.t + ph) + '"/>');
      if (v.label) {
        s.push('<text class="ref-label" x="' + (x + 5).toFixed(1) + '" y="' + (m.t + 12) + '">' + esc(v.label) + '</text>');
      }
    });

    s.push('<g clip-path="url(#' + clipId + ')">');

    // 柱状 / 直方
    if (spec.type === 'bar' || spec.type === 'hist') {
      var pts = spec.series[0].points; // [x, y, widthPx?]
      var bw = spec.barWidth || (pw / pts.length) * 0.72;
      pts.forEach(function (p, i) {
        if (!isFinite(p[1])) return;
        var cx = spec.type === 'hist' ? X(p[0]) : X(p[0]);
        var y1 = Y(Math.max(0, p[1])), y0 = Y(Math.min(0, p[1]));
        // 同面积的毛病：纵向区间不含 0 时 Y(0) 在框外，柱子会画出去
        y1 = Math.max(m.t, Math.min(m.t + ph, y1));
        y0 = Math.max(m.t, Math.min(m.t + ph, y0));
        var hgt = Math.max(1, Math.abs(y0 - y1));
        var x0 = cx - bw / 2;
        s.push('<rect class="bar ' + (spec.series[0].cls || '') + '" x="' + x0.toFixed(1) + '" y="' + Math.min(y0, y1).toFixed(1) +
          '" width="' + bw.toFixed(1) + '" height="' + hgt.toFixed(1) + '"><title>' +
          esc(fmtAxis(p[0], tx.step) + ' → ' + fmtAxis(p[1], ty.step)) + '</title></rect>');
      });
    }

    // 折线
    if (spec.type !== 'bar' && spec.type !== 'hist') {
      (spec.series || []).forEach(function (ser) {
        var mapped = ser.points.map(function (p) { return [X(p[0]), Y(p[1])]; });
        var d = pathFrom(mapped);
        if (!d) return;
        if (ser.area) {
          var first = null, last = null;
          for (var k = 0; k < ser.points.length; k++) {
            if (isFinite(ser.points[k][1])) { if (first === null) first = k; last = k; }
          }
          if (first !== null) {
            // 填充基线：y=0 在绘图区内就用它，否则夹到绘图区边缘。
            // 不夹的话，纵轴区间不含 0 时（如账户价值 900–1700）面积会画到框外，
            // 加上 .chart-svg{overflow:visible} 就压在下面的滑块和下一件展品上。
            var yBase = Y(0);
            if (!isFinite(yBase)) yBase = m.t + ph;
            yBase = Math.max(m.t, Math.min(m.t + ph, yBase));
            var darea = d + ' L' + X(ser.points[last][0]).toFixed(2) + ' ' + yBase.toFixed(2) +
              ' L' + X(ser.points[first][0]).toFixed(2) + ' ' + yBase.toFixed(2) + ' Z';
            s.push('<path class="area ' + (ser.cls || '') + '" d="' + darea + '"/>');
          }
        }
        s.push('<path class="line ' + (ser.cls || '') + '" d="' + d + '"' +
          (ser.dash ? ' stroke-dasharray="5 4"' : '') + '/>');
      });
    }

    // 标记点
    (spec.markers || []).forEach(function (mk) {
      if (!isFinite(mk.x) || !isFinite(mk.y)) return;
      var x = X(mk.x), y = Y(mk.y);
      if (x < m.l || x > W - m.r) return;
      s.push('<circle class="dot ' + (mk.cls || '') + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.5"/>');
      if (mk.label) {
        s.push('<text class="dot-label" x="' + (x + 8).toFixed(1) + '" y="' + (y - 8).toFixed(1) + '">' + esc(mk.label) + '</text>');
      }
    });

    s.push('</g>');

    // 轴标签
    if (spec.xLabel) {
      s.push('<text class="axis-label" x="' + (m.l + pw / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + esc(spec.xLabel) + '</text>');
    }
    if (spec.yLabel) {
      s.push('<text class="axis-label" transform="translate(13,' + (m.t + ph / 2) + ') rotate(-90)" text-anchor="middle">' + esc(spec.yLabel) + '</text>');
    }

    s.push('</svg>');
    return s.join('');
  }

  /* 图例单独渲染，放在图上方，方便 CSS 控制 */
  function legend(spec) {
    var items = (spec.series || []).filter(function (x) { return x.name; });
    if (!items.length) return '';
    return '<div class="legend">' + items.map(function (x) {
      return '<span class="legend-item ' + (x.cls || '') + '"><i></i>' + esc(x.name) + '</span>';
    }).join('') + '</div>';
  }

  return { render: render, legend: legend, ticks: ticks };
})();
