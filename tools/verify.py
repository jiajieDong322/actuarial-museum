"""verify.py — 一次跑完全部自动验收，打印 V 表。

    python tools/verify.py

覆盖 ARCHITECTURE.md 的 V1/V2/V3/V5/V6/V7/V8；
V4（渲染完整）与 V9（Slop 自检）需要人眼看 tools/shots/ 下的截图。
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable


def run(cmd, label):
    print(f"\n──── {label} ────")
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    out = (r.stdout or "") + (r.stderr or "")
    lines = out.strip().splitlines()
    for ln in lines:
        print("  " + ln)
    return r.returncode == 0, out


def main():
    results = {}

    ok, out = run([PY, "tools/reference.py", "--json"], "V2 经典公式表断言（Python 参考实现）")
    results["V2"] = (ok, f"{out.count('PASS')} 条断言通过" if ok else "有断言失败")

    ok, out = run(["node", "tools/verify_math.js"], "V1/V3 浏览器公式对账 + 边界扫描")
    v1 = [l for l in out.splitlines() if l.startswith("V1")]
    v3 = [l for l in out.splitlines() if l.startswith("V3")]
    results["V1"] = (ok, v1[0] if v1 else "未运行")
    results["V3"] = (ok, v3[0] if v3 else "未运行")

    ok, out = run([PY, "tools/build_content.py"], "V7 文案结构校验")
    summary = [l for l in out.splitlines() if "问题" in l or "通过结构校验" in l]
    results["V7"] = (ok, summary[-1].strip() if summary else ("通过" if ok else "未通过"))

    ok, out = run(["node", "tools/verify_browser.mjs"], "V4/V5/V6/V8 无头浏览器验收")
    results["V5"] = ("KPI 随滑块变化" in out and "KPI 没变" not in out,
                     f"{out.count('KPI 随滑块变化')} / 20 件交互有效")
    results["V6"] = ("0 error / 0 warn / 0 未捕获异常" in out,
                     "控制台干净" if "0 error / 0 warn / 0 未捕获异常" in out else "控制台有输出")
    results["V8"] = ("外部请求 []" in out or '"external":[]' in out.replace(" ", ""),
                     "无外部请求" if "外部请求 []" in out else "见上方清单")
    results["V4"] = (ok, "两视口渲染 + 截图（需人眼复核 tools/shots/）")

    print("\n════════ 验收总表 ════════")
    labels = {
        "V1": "公式对账（JS vs Python，<1e-9）",
        "V2": "经典公式表断言",
        "V3": "边界安全（极值滑块无 NaN）",
        "V4": "渲染完整（两视口）",
        "V5": "交互有效（滑块改 KPI）",
        "V6": "控制台干净",
        "V7": "内容六件套齐备",
        "V8": "离线可开（无外部请求）",
        "V9": "Slop 自检 ≤2 分",
    }
    allok = True
    for k in ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"]:
        ok, msg = results.get(k, (False, "未运行"))
        allok = allok and ok
        print(f"  {'✓' if ok else '✗'} {k}  {labels[k]:<32} {msg}")
    print(f"  ·  V9  {labels['V9']:<32} 需人眼（见 README 的自检记录）")
    print("════════════════════════\n")
    print("全部自动项通过" if allok else "存在未通过项")
    return 0 if allok else 1


if __name__ == "__main__":
    sys.exit(main())
