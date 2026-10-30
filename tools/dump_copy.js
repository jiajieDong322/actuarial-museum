/* dump_copy.js — 把每件展品在默认参数下「用户真正看到的全部文字」导出成一份可审文本。
   含：文案六件套 + KPI 实际数值 + 动态批注 + 图表轴/图例/参考线标签。
   用法：node tools/dump_copy.js > content/review-dump.md
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const HALLS = {
  1: '利息理论 Interest Theory',
  2: '生存模型 Survival Models',
  3: '生命年金与寿险 Life Contingencies',
  4: '风险理论 Risk Theory'
};

const sandbox = { console, Math, Object, Array, JSON, isFinite, isNaN, Infinity, NaN };
vm.createContext(sandbox);
vm.runInContext(read('js/math.js'), sandbox, { filename: 'math.js' });
sandbox.M = sandbox.M;
{
  // 把 CONTENT 塞进沙箱
  vm.runInContext(read('js/content.js'), sandbox, { filename: 'content.js' });
  sandbox.MUSEUM = { items: [], add(e) { this.items.push(e); } };
  for (const f of ['js/exhibits/hall1-interest.js', 'js/exhibits/hall2-survival.js',
                   'js/exhibits/hall3-life.js', 'js/exhibits/hall4-risk.js']) {
    vm.runInContext(read(f), sandbox, { filename: f });
  }
}

const M = sandbox.M;
const EX = sandbox.MUSEUM.items;
const out = [];

function fmtVal(v, f) {
  const F = (x, d) => (v === Infinity ? '∞' : (!isFinite(x) ? '—' : x.toFixed(d)));
  switch (f) {
    case 'pct': return F(v * 100, 2) + '%';
    case 'pct1': return F(v * 100, 1) + '%';
    case 'x2': case 'money': return F(v, 2);
    case 'x3': return F(v, 3);
    case 'x4': return F(v, 4);
    case 'x6': return F(v, 6);
    case 'int': return String(Math.round(v));
    case 'years': return F(v, 2) + ' 年';
    default: return F(v, 4);
  }
}

out.push('# 精算陈列馆 · 教学叙述审校稿\n');
out.push('> 由 `node tools/dump_copy.js` 生成。每件展品列出用户实际看到的全部文字与默认参数下的数值，供逐条核对。\n');

let cur = null;
EX.forEach((ex) => {
  if (ex.hall !== cur) {
    cur = ex.hall;
    out.push(`\n# 展厅 ${cur} · ${HALLS[cur]}\n`);
  }
  const state = {};
  ex.controls.forEach(c => { state[c.key] = c.value; });

  out.push(`\n## ${ex.id} ${ex.titleEn} / ${ex.titleZh}\n`);
  out.push(`**一句话**：${ex.oneLine || '（缺失）'}\n`);
  out.push(`**导览**：${ex.lead || '（缺失）'}\n`);

  out.push(`**公式块**：`);
  (ex.formula || []).forEach(f => out.push(`- \`${f}\``));
  out.push('');

  out.push(`**默认参数**：` + ex.controls.map(c => {
    if (c.options) {
      const o = c.options.find(o => String(o.value) === String(c.value));
      return `${c.label} = ${o ? o.label : c.value}`;
    }
    return `${c.label} = ${fmtVal(c.value, c.fmt)}`;
  }).join(' · ') + '\n');

  let kp = [];
  try { kp = ex.kpis(state) || []; } catch (e) { kp = []; }
  out.push(`**KPI 实算**：` + kp.map(k => `${k.label} = ${k.text !== undefined ? k.text : fmtVal(k.value, k.fmt)}`).join(' · ') + '\n');

  let nt = '';
  try { nt = ex.notes ? (ex.notes(state) || '') : ''; } catch (e) { nt = '（notes 抛错：' + e.message + '）'; }
  out.push(`**动态批注**：${nt || '（无）'}\n`);

  let spec = null;
  try { spec = ex.chart(state); } catch (e) { spec = null; }
  if (spec) {
    const bits = [];
    if (spec.xLabel) bits.push(`x 轴「${spec.xLabel}」`);
    if (spec.yLabel) bits.push(`y 轴「${spec.yLabel}」`);
    (spec.series || []).forEach(s => { if (s.name) bits.push(`系列「${s.name}」`); });
    (spec.hlines || []).forEach(h => { if (h.label) bits.push(`参考线「${h.label}」`); });
    (spec.vlines || []).forEach(v => { if (v.label) bits.push(`竖线「${v.label}」`); });
    (spec.markers || []).forEach(m => { if (m.label) bits.push(`标记「${m.label}」`); });
    out.push(`**图表文字**：` + bits.join(' · ') + '\n');
  }

  out.push(`**该看什么**：`);
  (ex.watch || []).forEach(w => out.push(`- ${w}`));
  out.push('');

  out.push(`**来历**：${ex.history || '（缺失）'}\n`);
  out.push(`**常见误解**：${ex.pitfall || '（缺失）'}\n`);
  out.push('---\n');
});

process.stdout.write(out.join('\n'));
