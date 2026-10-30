/* verify_math.js — 在 Node 里跑 js/math.js，与 Python 参考值对账（V1），
   再把 20 件展品的滑块打到极值跑一遍，抓 NaN / 抛错 / 曲线全空（V3）。
   用法：node tools/verify_math.js [--json]
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---- 载入 math.js ----
const mathSrc = read('js/math.js');
const M = eval(mathSrc + '\n;M');

// ---- 载入展品（stub 掉注册表与文案）----
const MUSEUM = { items: [], add(e) { this.items.push(e); } };
const sandbox = { MUSEUM, CONTENT: {}, M, Math, Object, Array, JSON, isFinite, isNaN, Infinity, NaN, console };
vm.createContext(sandbox);
for (const f of ['js/exhibits/hall1-interest.js', 'js/exhibits/hall2-survival.js',
                 'js/exhibits/hall3-life.js', 'js/exhibits/hall4-risk.js']) {
  vm.runInContext(read(f), sandbox, { filename: f });
}
const EX = sandbox.MUSEUM.items;

// ---- 与 tools/reference.py 的 build_expected() 逐键对应 ----
const B = 0.0003, C = 1.1, X = 40, OMEGA = 130;
const P20 = M.premium(M.AxTerm(B, C, X, .05, 20), M.annTerm(B, C, X, .05, 20));
const ex = (x) => M.integrate((t) => M.tpxG(B, C, x, t), 0, Math.max(0, OMEGA - x), 600);
const flows07 = [{ t: 0, v: -1000 }, { t: 1, v: -500 }, { t: 3, v: 1641.60 }];
const flows03 = [{ t: 0, v: -1000 }].concat([1,2,3,4,5,6,7,8].map(k => ({ t: k, v: 200 })));
const LAM = 100, MM = 900, CC = 100000;

const actual = {
  '01': { accum: M.accum(.05, 10), disc: M.disc(.05, 10), force: M.forceOfInterest(.05) },
  '02': { equiv_i: M.effectiveFromForce(.05), v10: Math.exp(-.05 * 10) },
  '03': { npv: M.npv(.06, flows03), irr: M.irr(flows03) },
  '04': { aN: M.aN(.05, 10), sN: M.sN(.05, 10), aDue: M.aDue(.05, 10) },
  '05': { m1: M.aNM(.05, 10, 1), m4: M.aNM(.05, 10, 4), m12: M.aNM(.05, 10, 12), minf: M.aNM(.05, 10, Infinity) },
  '06': { perp: M.perpetuity(.04), growing: M.growingPerpetuity(.04, .02) },
  '07': { mwrr: M.irr(flows07), twrr: Math.pow(1.10 * 0.95 * 1.08, 1 / 3) - 1 },
  '08': { mu40: M.muG(B, C, X), p10: M.tpxG(B, C, X, 10), p30: M.tpxG(B, C, X, 30) },
  '09': { l40: M.lxG(B, C, X), q40: M.qxG(B, C, X), l80: M.lxG(B, C, 80) },
  '10': { e40: ex(40), e60: ex(60) },
  '11': { udd: M.tpxFrac(.98, .5, 'udd'), cfm: M.tpxFrac(.98, .5, 'cfm'), balducci: M.tpxFrac(.98, .5, 'balducci') },
  '12': { AxWhole: M.AxWhole(B, C, X, .05), AxCF: M.AxCF(.02, .05) },
  '13': { AxTerm20: M.AxTerm(B, C, X, .05, 20), AxEndow20: M.AxEndow(B, C, X, .05, 20) },
  '14': { annWhole: M.annWhole(B, C, X, .05), annTerm20: M.annTerm(B, C, X, .05, 20) },
  '15': { P: P20, AxWhole: M.AxWhole(B, C, X, .05), annWhole: M.annWhole(B, C, X, .05), PCF: M.premiumCF(.02, .05) },
  '16': { P: P20, V0: M.reserveTerm(B, C, X, .05, P20, 0, 20), V10: M.reserveTerm(B, C, X, .05, P20, 10, 20), V20: M.reserveTerm(B, C, X, .05, P20, 20, 20) },
  '17': { ev: M.premEV(1000), var: M.premVar(1000, 400, .05), sd: M.premSD(1000, 400, .05), exp: M.premExp(1000, 400, .05) },
  '18': { mean: M.compoundMean(100, 900), var: M.compoundVar(100, 900 ** 2 + 400 ** 2), cv: M.compoundCV(100, 900, 900 ** 2 + 400 ** 2) },
  '19': { R: M.lundbergR(LAM, MM, CC), psi1000: M.ruinProb(1000, LAM, MM, CC), psi5000: M.ruinProb(5000, LAM, MM, CC) },
  '20': { var99: M.lnVaR(1000, 400, .99), tvar99: M.lnTVaR(1000, 400, .99) }
};

const expected = JSON.parse(read('tools/expected.json'));

// ---- V1 ----
let pass = 0, fail = [];
const TOL = 1e-9;
for (const id of Object.keys(expected)) {
  for (const k of Object.keys(expected[id])) {
    const e = expected[id][k], a = (actual[id] || {})[k];
    if (typeof a !== 'number') { fail.push(`${id}.${k}: 缺实现（got ${a}）`); continue; }
    if (Number.isNaN(e) && Number.isNaN(a)) { pass++; continue; }
    const rel = Math.abs(a - e) / Math.max(1, Math.abs(e));
    if (rel <= TOL) pass++;
    else fail.push(`${id}.${k}: 期望 ${e} / 实得 ${a}（相对差 ${rel.toExponential(2)}）`);
  }
}

// ---- V3 边界扫描 ----
const edgeFails = [];

// ---- 默认参数一致性：同一个人口学参数在各展厅必须是同一个默认值，
//      否则读者跨展品对照时数值对不上（曾经出现过 hall3 的 B 被静默改成 1/10）----
const DEFAULTS = {};
EX.forEach((ex) => {
  (ex.controls || []).forEach((c) => {
    if (c.key === 'B' || c.key === 'c' || c.key === 'x' || c.key === 'd') {
      DEFAULTS[c.key] = DEFAULTS[c.key] || new Set();
      DEFAULTS[c.key].add(String(c.value));
    }
  });
});
Object.keys(DEFAULTS).forEach((k) => {
  if (DEFAULTS[k].size > 1) {
    edgeFails.push(`默认值不一致：参数 ${k} 在各展品里取了 ${[...DEFAULTS[k]].join(' / ')}，应统一`);
  }
});

const totalEx = EX.length;
EX.forEach((ex) => {
  if (!ex.controls || !ex.kpis || !ex.chart) { edgeFails.push(`${ex.id}: 缺少 controls/kpis/chart`); return; }
  const base = {};
  ex.controls.forEach(c => { base[c.key] = typeof c.value === 'string' ? c.value : c.value; });

  const states = [Object.assign({}, base)];
  ex.controls.forEach(c => {
    if (c.options) return;
    const lo = Object.assign({}, base), hi = Object.assign({}, base);
    lo[c.key] = c.min; hi[c.key] = c.max;
    states.push(lo, hi);
  });
  const allLo = {}, allHi = {};
  ex.controls.forEach(c => {
    if (c.options) { allLo[c.key] = allHi[c.key] = c.value; return; }
    allLo[c.key] = c.min; allHi[c.key] = c.max;
  });
  states.push(allLo, allHi);

  states.forEach((st, i) => {
    const label = `${ex.id}#${i}`;
    try {
      const kp = ex.kpis(st) || [];
      kp.forEach(k => {
        if (typeof k.value === 'number' && Number.isNaN(k.value)) {
          edgeFails.push(`${label} KPI「${k.label}」= NaN  参数 ${JSON.stringify(st)}`);
        }
      });
    } catch (err) { edgeFails.push(`${label} kpis() 抛错: ${err.message}`); }
    try {
      const spec = ex.chart(st);
      if (!spec || !spec.series || !spec.series.length) {
        edgeFails.push(`${label} chart() 没返回曲线`);
      } else {
        spec.series.forEach(s => {
          const finite = s.points.filter(p => p && isFinite(p[0]) && isFinite(p[1])).length;
          if (s.points.length >= 5 && finite / s.points.length < 0.3) {
            edgeFails.push(`${label} 曲线「${s.name}」八成点无效（${finite}/${s.points.length}） 参数 ${JSON.stringify(st)}`);
          }
        });
      }
    } catch (err) { edgeFails.push(`${label} chart() 抛错: ${err.message}`); }
  });
});

// ---- V7 展品数量 ----
if (totalEx !== 20) edgeFails.push(`展品数量 ${totalEx}，应为 20`);

const report = {
  V1: { passed: pass, failed: fail.length, details: fail },
  V3: { exhibits: totalEx, problems: edgeFails.length, details: edgeFails }
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`V1 公式对账：${pass} 项通过，${fail.length} 项失败`);
  fail.forEach(f => console.log('   ✗', f));
  console.log(`V3 边界扫描：${totalEx} 件展品，${edgeFails.length} 处问题`);
  edgeFails.forEach(f => console.log('   ✗', f));
}

process.exit(fail.length || edgeFails.length ? 1 : 0);
