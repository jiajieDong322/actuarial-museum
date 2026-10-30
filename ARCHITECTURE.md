# 精算陈列馆 · 架构与验收标准

一个可双击打开的交互式精算博物馆。20 件展品，四座展厅，每件都能拖滑块实时算。

## 1. 为什么这么切

| 决策 | 选择 | 理由 |
|---|---|---|
| 交付形态 | 纯静态、多文件、**传统 `<script src>`** | `file://` 下 ES module 与 `fetch` 被 CORS 拦死；传统脚本能加载，双击即用 |
| 构建步骤 | **无** | 没有 bundle/npm，改一行刷新就见效 |
| 公式来源 | `js/math.js` 单一真源，`tools/reference.py` 逐函数镜像 | 两套实现互为对照，浏览器值与 Python 值对不上就算失败 |
| 依赖 | **零** | 无 CDN、无字体外链，断网也能开 |
| 图表 | 手写 SVG，`js/charts.js` | 三五种图型，引入图表库不值 |
| 展品注册 | `js/core.js` 里的全局注册表 + 每厅一个脚本文件 | 加展品 = 加一个对象，不改任何引擎代码 |

## 2. 目录

```
actuarial-museum/
├── index.html                  外壳：报头、左栏目录、展厅容器
├── assets/app.css              设计令牌 + 全部样式
├── js/
│   ├── math.js                 全部公式（唯一真源，无 DOM）
│   ├── charts.js               SVG 折线 / 柱状 / 直方图 / 区间图
│   ├── core.js                 注册表、路由、滑块绑定、KPI 渲染、滚动高亮
│   └── exhibits/
│       ├── hall1-interest.js   展厅一 利息理论    7 件
│       ├── hall2-survival.js   展厅二 生存模型    4 件
│       ├── hall3-life.js       展厅三 生命年金与寿险 5 件
│       └── hall4-risk.js       展厅四 风险理论    4 件
├── tools/
│   ├── reference.py            Python 参考实现（镜像 math.js）
│   ├── make_expected.py        导出 expected.json（固定参数点的期望值）
│   └── verify.py               无头浏览器比对 + 渲染检查
└── content/                    子 agent 产出的文案 JSON（录入前审核）
```

## 3. 展品清单（20 件）

### 展厅一 · 利息理论 (Interest Theory)
| # | slug | 标题 |
|---|---|---|
| 01 | accumulation | 累积与折现 |
| 02 | force | 利息力 |
| 03 | npv-irr | 净现值与内部收益率 |
| 04 | annuity | 年金现值 |
| 05 | frequency | 付款频率 |
| 06 | perpetuity | 永续年金 |
| 07 | return | 投资收益率：时间加权 vs 金额加权 |

### 展厅二 · 生存模型 (Survival Models)
| # | slug | 标题 |
|---|---|---|
| 08 | gompertz | Gompertz 死亡力 |
| 09 | lifetable | 生命表 |
| 10 | lifetime | 预期余命 |
| 11 | fractional | 分数年龄假设 |

### 展厅三 · 生命年金与寿险 (Life Contingencies)
| # | slug | 标题 |
|---|---|---|
| 12 | wholelife | 终身寿险 |
| 13 | term-endow | 定期寿险与两全保险 |
| 14 | lifeannuity | 生命年金 |
| 15 | premium | 净保费原理 |
| 16 | reserve | 前瞻准备金 |

### 展厅四 · 风险理论 (Risk Theory)
| # | slug | 标题 |
|---|---|---|
| 17 | principles | 保费原理 |
| 18 | aggregate | 聚合风险模型 |
| 19 | ruin | 破产概率与 Lundberg 界 |
| 20 | riskmeasure | 风险度量：VaR 与 TVaR |

## 4. 展品对象契约

每个展品是一个普通对象，压进 `MUSEUM.register({...})`：

```js
{
  id: '01',
  slug: 'accumulation',
  hall: 1,
  titleEn: 'Accumulation & Discount',
  titleZh: '累积与折现',
  oneLine: '一句话直觉，≤ 26 字',
  lead: '两到三句导览词，说清这件展品在问什么问题',
  formula: ['A(n)=(1+i)^n', 'v^n=(1+i)^{-n}', 'δ=ln(1+i)'],
  watch: ['拖动 i 时该注意什么', '把 n 拉大会怎样'],
  history: '来历 / 人物 / 年份，60–120 字',
  pitfall: '常见误解，一句话',

  // 以下由引擎消费
  controls: [ {key:'i', label:'年利率 i', min:0, max:0.2, step:0.001, value:0.05, fmt:'pct'} ],
  kpis: (s) => [ {label:'累积因子 A(n)', value:M.accum(s.i, s.n), fmt:'x4'} ],
  chart: (s, w, h) => [ {type:'line', series:[...], xLabel:'', yLabel:''} ],
  notes: (s) => '随参数变化的动态批注（可选）'
}
```

**`fmt` 取值**：`pct`（百分比两位）、`pct4`、`x4`（四位小数）、`x2`、`money`、`int`、`raw`。

## 5. 验收标准（硬性，全过才算完）

| 编号 | 检查项 | 通过条件 |
|---|---|---|
| **V1** | 公式正确性 | 20 件展品在 `expected.json` 的固定参数点上，浏览器计算值与 Python 参考值相对误差 **< 1e-9** |
| **V2** | 经典值对照 | Python 侧对每个展品至少 1 条对 CM1/CS1 公式表已知值的断言（如 a₁₀@5% = 7.721735） |
| **V3** | 边界安全 | i=0、n=0、m=∞、极值滑块下不出现 `NaN` / `Infinity` / 负的生存概率；除零走极限分支 |
| **V4** | 渲染完整 | 20 件在 1440×900 与 420×900 两个视口截图，无横向滚动条、无元素重叠、文字未被裁切 |
| **V5** | 交互有效 | 每件的每个滑块拖动后，至少一个 KPI 文本发生变化 |
| **V6** | 控制台干净 | 0 个 error、0 个 warning（含 404） |
| **V7** | 内容齐备 | 每件都有 oneLine / lead / formula / watch / history / pitfall 六项，中英术语一致 |
| **V8** | 离线可开 | `file://` 直开可用，DevTools 网络面板无外部请求 |
| **V9** | Slop 自检 | claude-design 十条 tell 评分 ≤ 2 |

`tools/verify.py` 负责 V1/V3/V5/V6/V8 的自动化部分；V4/V9 靠人眼过截图；V2 在 `reference.py` 里。

## 6. 内容生产分工

- **子 agent**：只写 `content/*.json`（文案六件套 + 公式串 + 观看要点）。不碰代码、不碰系统。
- **主脑**：`math.js` / `charts.js` / `core.js` / `app.css` / `index.html` 全部代码，以及最后的验收。
