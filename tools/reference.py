"""reference.py — math.js 的逐函数镜像，同时是 ground truth。

两个用途：
  1) 跑经典值断言（对 CM1/CS1 公式表），证公式本身没错；
  2) 导出 expected.json —— 一组固定参数点上的期望值，供 verify.py 拿去和浏览器里的
     JS 计算结果对账（V1）。

    python reference.py            # 只跑断言
    python reference.py --json     # 断言 + 导出 expected.json
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
FAILS = []


def check(cond, msg):
    if cond:
        print(f"  PASS  {msg}")
    else:
        FAILS.append(msg)
        print(f"  FAIL  {msg}")


def close(a, b, tol=1e-6):
    return abs(a - b) <= tol * max(1.0, abs(b))


# ==================== 通用 ====================
def _simpson(f, a, b, steps):
    if steps % 2:
        steps += 1
    h = (b - a) / steps
    s = f(a) + f(b)
    for k in range(1, steps):
        s += (4 if k % 2 else 2) * f(a + k * h)
    return s * h / 3


def integrate(f, a, b, steps=400):
    """自动加密到相邻两次结果相对差 < 1e-10，与 js/math.js 逐行等价。"""
    if b <= a:
        return 0.0
    prev = _simpson(f, a, b, steps)
    for _ in range(8):
        steps *= 2
        cur = _simpson(f, a, b, steps)
        if abs(cur - prev) <= 1e-10 * max(1e-30, abs(cur)):
            return cur
        prev = cur
    return prev


def _erf(x):
    t = 1 / (1 + 0.3275911 * abs(x))
    y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
              - 0.284496736) * t + 0.254829592) * t * math.exp(-x * x)
    return y if x >= 0 else -y


def norm_cdf(z):
    return 0.5 * (1 + _erf(z / math.sqrt(2)))


def norm_inv(p):
    if p <= 0:
        return -math.inf
    if p >= 1:
        return math.inf
    lo, hi = -10.0, 10.0
    for _ in range(100):
        mid = (lo + hi) / 2
        if norm_cdf(mid) < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# ==================== 一 · 利息理论 ====================
def accum(i, n): return (1 + i) ** n
def disc(i, n): return (1 + i) ** (-n)
def force_of_interest(i): return math.log(1 + i)
def effective_from_force(d): return math.exp(d) - 1
def discount_rate(i): return i / (1 + i)


def a_n(i, n): return n if i == 0 else (1 - disc(i, n)) / i
def s_n(i, n): return n if i == 0 else (accum(i, n) - 1) / i
def a_due(i, n): return a_n(i, n) * (1 + i)


def i_m(i, m):
    if m == math.inf:
        return force_of_interest(i)
    if i == 0:
        return 0.0
    return m * ((1 + i) ** (1 / m) - 1)


def a_nm(i, n, m):
    d = i_m(i, m)
    return n if d == 0 else (1 - disc(i, n)) / d


def perpetuity(i): return math.inf if i <= 0 else 1 / i
def growing_perpetuity(i, g): return math.inf if i - g <= 0 else (1 + g) / (i - g)


def npv(rate, flows):
    return sum(v * (1 + rate) ** (-t) for t, v in flows)


def irr(flows):
    lo, hi = -0.99, 10.0
    flo, fhi = npv(lo, flows), npv(hi, flows)
    if not (math.isfinite(flo) and math.isfinite(fhi)) or (flo < 0) == (fhi < 0):
        return math.nan
    for _ in range(200):
        mid = (lo + hi) / 2
        fm = npv(mid, flows)
        if (flo < 0) == (fm < 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return (lo + hi) / 2


# ==================== 二 · 生存模型 ====================
def mu_g(B, c, x): return B * (c ** x)


def tpx_g(B, c, x, t):
    if abs(c - 1) < 1e-12:
        return math.exp(-B * (c ** x) * t)
    return math.exp(-mu_g(B, c, x) * (c ** t - 1) / math.log(c))


def lx_g(B, c, x):
    if abs(c - 1) < 1e-12:
        return math.exp(-B * x)
    return math.exp(-B * (c ** x - 1) / math.log(c))


def qx_g(B, c, x): return 1 - tpx_g(B, c, x, 1)


def tpx_frac(px, t, assump):
    qx = 1 - px
    if assump == 'udd':
        return 1 - t * qx
    if assump == 'cfm':
        return px ** t
    if assump == 'balducci':
        return px / (px + t * qx)
    return px ** t


# ==================== 三 · 生命年金与寿险 ====================
OMEGA = 130


def ax_term(B, c, x, delta, n):
    return integrate(lambda t: math.exp(-delta * t) * tpx_g(B, c, x, t) * mu_g(B, c, x + t),
                     0, n, 400)


def ax_endow(B, c, x, delta, n):
    return ax_term(B, c, x, delta, n) + math.exp(-delta * n) * tpx_g(B, c, x, n)


def ax_whole(B, c, x, delta):
    return ax_term(B, c, x, delta, max(0.0, OMEGA - x))


def ann_term(B, c, x, delta, n):
    return integrate(lambda t: math.exp(-delta * t) * tpx_g(B, c, x, t), 0, n, 400)


def ann_whole(B, c, x, delta):
    return ann_term(B, c, x, delta, max(0.0, OMEGA - x))


def ax_cf(mu, delta): return mu / (mu + delta)
def ann_cf(mu, delta): return (1 - ax_cf(mu, delta)) / delta
def premium_cf(mu, delta): return ax_cf(mu, delta) / ann_cf(mu, delta)
def premium(A, ann): return math.nan if ann <= 0 else A / ann


def reserve_term(B, c, x, delta, P, t, n):
    A = ax_term(B, c, x + t, delta, n - t)
    a = ann_term(B, c, x + t, delta, n - t)
    return A - P * a


# ==================== 四 · 风险理论 ====================
def ln_params(mean, sd):
    s2 = math.log(1 + (sd / mean) ** 2)
    return {"mu": math.log(mean) - s2 / 2, "sigma2": s2, "sigma": math.sqrt(s2)}


def prem_ev(mean): return mean
def prem_var(mean, sd, a): return mean + a * sd * sd / mean
def prem_sd(mean, sd, a): return mean + a * sd
def prem_exp(mean, sd, a): return mean + 0.5 * a * sd * sd / mean


def compound_mean(lam, m): return lam * m
def compound_var(lam, m2): return lam * m2
def compound_cv(lam, m, m2):
    mu = compound_mean(lam, m)
    return math.inf if mu <= 0 else math.sqrt(compound_var(lam, m2)) / mu


def lundberg_r(lam, m, c):
    return math.nan if c <= lam * m else (c - lam * m) / (c * m)


def ruin_prob(u, lam, m, c):
    R = lundberg_r(lam, m, c)
    if not math.isfinite(R):
        return 1.0
    return min(1.0, (lam * m / c) * math.exp(-R * u))


def ln_var(mean, sd, p):
    q = ln_params(mean, sd)
    return math.exp(q["mu"] + q["sigma"] * norm_inv(p))


def ln_tvar(mean, sd, p):
    if p >= 1 - 1e-12:
        return math.inf
    q = ln_params(mean, sd)
    zp = norm_inv(p)
    return math.exp(q["mu"] + q["sigma2"] / 2) * norm_cdf(q["sigma"] - zp) / (1 - p)


def ln_pdf(x, mean, sd):
    if x <= 0:
        return 0.0
    q = ln_params(mean, sd)
    z = (math.log(x) - q["mu"]) / q["sigma"]
    return math.exp(-z * z / 2) / (x * q["sigma"] * math.sqrt(2 * math.pi))


def e_x(B, c, x):
    """预期余命 ė_x = ∫₀^(ω-x) tpx dt"""
    return integrate(lambda t: tpx_g(B, c, x, t), 0, max(0.0, OMEGA - x), 600)


# ==================== 断言 ====================
def run_checks():
    print("== V2 经典公式表对照 ==")
    check(close(disc(.05, 10), 0.613913, 1e-6), "v^10 @5% = 0.613913")
    check(close(accum(.05, 10), 1.628895, 1e-6), "A(10) @5% = 1.628895")
    check(close(a_n(.05, 10), 7.721735, 1e-7), "a_10 @5% = 7.721735")
    check(close(s_n(.05, 10), 12.577893, 1e-7), "s_10 @5% = 12.577893")
    check(close(a_due(.05, 10), a_n(.05, 10) * 1.05, 1e-12), "ä_n = a_n·(1+i)")
    check(close(perpetuity(.05), 20.0, 1e-12), "a_∞ @5% = 20")
    check(close(force_of_interest(.05), 0.048790, 1e-6), "δ @i=5% = 0.048790")

    # 频率单调：m 越大现值越高，且以连续年金为上界
    seq = [a_nm(.05, 10, m) for m in (1, 4, 12, 52, math.inf)]
    check(all(seq[k] < seq[k + 1] for k in range(len(seq) - 1)),
          "a_n^(m) 随 m 单调递增（付款越频繁现值越高）")
    check(close(seq[-1], (1 - disc(.05, 10)) / force_of_interest(.05), 1e-12),
          "m=∞ 等于连续年金 ā_n")

    # 常力模型闭式
    check(close(ax_cf(.01, .05), 1 / 6, 1e-12), "Ā_x = μ/(μ+δ) = 1/6")
    check(close(premium_cf(.01, .05), 0.01, 1e-12), "常力模型净保费 P = μ")

    # Gompertz
    B, c, x = 0.0003, 1.1, 40
    check(close(tpx_g(B, c, x, 0), 1.0, 1e-12), "₀p_x = 1")
    check(0 < tpx_g(B, c, x, 30) < tpx_g(B, c, x, 10) < 1, "生存概率随 t 递减且 < 1")
    check(close(tpx_g(0.01, 1.0, 50, 3), math.exp(-0.03), 1e-12), "c=1 退化为常力")
    check(close(tpx_frac(0.98, 1.0, 'udd'), 0.98, 1e-12), "分数年龄 t=1 三种假设同值(udd)")
    check(close(tpx_frac(0.98, 1.0, 'balducci'), 0.98, 1e-12), "分数年龄 t=1 同值(balducci)")

    # 生命寿险：连续型 A 在 (0,1)，且 n 增大趋近终身
    A20 = ax_term(B, c, x, .05, 20)
    check(0 < A20 < 1, "Ā¹_{x:20} ∈ (0,1)")
    check(ax_endow(B, c, x, .05, 20) > A20, "两全 > 定期")
    check(ax_whole(B, c, x, .05) > A20, "终身 > 20 年定期")

    # 准备金驼峰：期初为 0，期末趋近 0，中间为正
    P = premium(ax_term(B, c, x, .05, 20), ann_term(B, c, x, .05, 20))
    V = [reserve_term(B, c, x, .05, P, t, 20) for t in (0, 5, 10, 15, 20)]
    check(abs(V[0]) < 1e-12, "V_0 = 0（等价原理）")
    check(abs(V[-1]) < 1e-10, "V_n = 0（定期寿险期末无准备金）")
    check(max(V) > 0 and V[2] > V[1], "准备金先升后降（驼峰）")

    # 保费原理
    mean, sd, a = 1000.0, 400.0, 0.05
    check(close(prem_ev(mean), 1000.0, 1e-12), "期望值原理 = 均值")
    check(close(prem_sd(mean, sd, a), 1000.0 + a * sd, 1e-12), "标准差原理 = E + ασ")
    check(close(prem_var(mean, sd, a), 1000.0 + a * sd * sd / mean, 1e-12), "方差原理 = E + ασ²/E")
    check(prem_sd(mean, sd, a) > prem_ev(mean), "标准差原理 > 均值")
    check(prem_var(mean, sd, a) > prem_ev(mean), "方差原理 > 均值")
    check(prem_exp(mean, sd, a) > prem_ev(mean), "指数原理 > 均值（有安全加成）")
    check(prem_sd(mean, sd, a) > prem_var(mean, sd, a) > prem_exp(mean, sd, a),
          "CV<1 时：标准差原理 > 方差原理 > 指数原理")
    check(close(prem_exp(mean, sd, .1) - mean, 2 * (prem_exp(mean, sd, .05) - mean), 1e-9),
          "指数原理加载与 α 成正比")
    # 正态损失下指数原理的解析式：(1/α)·ln E[e^{αX}] = E + α·Var/2（α 还原为原始量纲）
    m_, v_ = 1000.0, 160000.0
    a_raw = a / m_
    mgf_premium = (a_raw * m_ + 0.5 * a_raw ** 2 * v_) / a_raw
    check(close(prem_exp(m_, math.sqrt(v_), a), mgf_premium, 1e-9),
          "指数原理 = (1/α)ln E[e^{αX}]（正态，α 已还原）")
    check(close(prem_exp(mean, sd, 0), mean, 1e-12), "指数原理 a=0 退化为均值")

    # 聚合风险：CV 按 1/√λ 衰减
    cv1 = compound_cv(1, 900, 900 ** 2 + 400 ** 2)
    cv100 = compound_cv(100, 900, 900 ** 2 + 400 ** 2)
    check(close(cv1 / cv100, 10.0, 1e-9), "池子放大 100 倍 → CV 降 10 倍")

    # Lundberg
    lam, m, c_ = 100.0, 900.0, 100000.0
    R = lundberg_r(lam, m, c_)
    check(R > 0, "安全加载为正 → 调节系数 R > 0")
    check(ruin_prob(0, lam, m, c_) <= 1, "ψ(0) ≤ 1")
    check(ruin_prob(5000, lam, m, c_) < ruin_prob(1000, lam, m, c_), "初始盈余越高破产概率越低")

    # 风险度量
    check(ln_var(1000, 400, .5) < 1000 < ln_var(1000, 400, .99), "VaR_50% < 均值 < VaR_99%")
    check(ln_tvar(1000, 400, .99) > ln_var(1000, 400, .99), "TVaR > VaR（尾部更重）")


# ==================== 导出期望值 ====================
B, C, X = 0.0003, 1.1, 40
FLOWS = [(0, -1000.0), (1, -500.0), (3, 1641.60)]


def build_expected():
    d = {}
    d["01"] = {"accum": accum(.05, 10), "disc": disc(.05, 10), "force": force_of_interest(.05)}
    d["02"] = {"equiv_i": effective_from_force(.05), "v10": math.exp(-.05 * 10)}
    d["03"] = {"npv": npv(.06, [(0, -1000.0), (1, 200.0), (2, 200.0), (3, 200.0),
                                (4, 200.0), (5, 200.0), (6, 200.0), (7, 200.0), (8, 200.0)]),
               "irr": irr([(0, -1000.0)] + [(k, 200.0) for k in range(1, 9)])}
    d["04"] = {"aN": a_n(.05, 10), "sN": s_n(.05, 10), "aDue": a_due(.05, 10)}
    d["05"] = {"m1": a_nm(.05, 10, 1), "m4": a_nm(.05, 10, 4),
               "m12": a_nm(.05, 10, 12), "minf": a_nm(.05, 10, math.inf)}
    d["06"] = {"perp": perpetuity(.04), "growing": growing_perpetuity(.04, .02)}
    d["07"] = {"mwrr": irr(FLOWS),
               "twrr": (1.10 * 0.95 * 1.08) ** (1 / 3) - 1}
    d["08"] = {"mu40": mu_g(B, C, X), "p10": tpx_g(B, C, X, 10), "p30": tpx_g(B, C, X, 30)}
    d["09"] = {"l40": lx_g(B, C, X), "q40": qx_g(B, C, X), "l80": lx_g(B, C, 80)}
    d["10"] = {"e40": e_x(B, C, 40), "e60": e_x(B, C, 60)}
    d["11"] = {"udd": tpx_frac(.98, .5, 'udd'), "cfm": tpx_frac(.98, .5, 'cfm'),
               "balducci": tpx_frac(.98, .5, 'balducci')}
    d["12"] = {"AxWhole": ax_whole(B, C, X, .05), "AxCF": ax_cf(.02, .05)}
    d["13"] = {"AxTerm20": ax_term(B, C, X, .05, 20), "AxEndow20": ax_endow(B, C, X, .05, 20)}
    d["14"] = {"annWhole": ann_whole(B, C, X, .05), "annTerm20": ann_term(B, C, X, .05, 20)}
    P20 = premium(ax_term(B, C, X, .05, 20), ann_term(B, C, X, .05, 20))
    d["15"] = {"P": P20, "AxWhole": ax_whole(B, C, X, .05),
               "annWhole": ann_whole(B, C, X, .05),
               "PCF": premium_cf(.02, .05)}
    d["16"] = {"P": P20, "V0": reserve_term(B, C, X, .05, P20, 0, 20),
               "V10": reserve_term(B, C, X, .05, P20, 10, 20),
               "V20": reserve_term(B, C, X, .05, P20, 20, 20)}
    d["17"] = {"ev": prem_ev(1000), "var": prem_var(1000, 400, .05),
               "sd": prem_sd(1000, 400, .05), "exp": prem_exp(1000, 400, .05)}
    d["18"] = {"mean": compound_mean(100, 900), "var": compound_var(100, 900 ** 2 + 400 ** 2),
               "cv": compound_cv(100, 900, 900 ** 2 + 400 ** 2)}
    lam, m, cc = 100.0, 900.0, 100000.0
    d["19"] = {"R": lundberg_r(lam, m, cc), "psi1000": ruin_prob(1000, lam, m, cc),
               "psi5000": ruin_prob(5000, lam, m, cc)}
    d["20"] = {"var99": ln_var(1000, 400, .99), "tvar99": ln_tvar(1000, 400, .99)}
    return d


if __name__ == "__main__":
    run_checks()
    if FAILS:
        print(f"\n{len(FAILS)} 项断言失败")
        sys.exit(1)
    print("\n全部断言通过")
    if "--json" in sys.argv:
        out = build_expected()
        p = os.path.join(ROOT, "expected.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2, ensure_ascii=False)
        print(f"已导出 {p}")
