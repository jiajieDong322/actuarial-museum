"""build_content.py — 把 content-hall*.json 合成 js/content.js，并校验六件套是否齐备。

    python tools/build_content.py           # 校验 + 写出
    python tools/build_content.py --show 07 # 打印某一件的全文供人眼审
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get("MUSEUM_CONTENT_SRC")
if not SRC:
    SRC = os.path.join(ROOT, "content", "source")
    if not os.path.isdir(SRC):
        SRC = "D:/Hermes/cache/scratch/actuarial-museum"
REQUIRED = ["oneLine", "lead", "formula", "watch", "history", "pitfall"]
LIMITS = {"oneLine": (0, 42), "lead": (60, 220), "history": (30, 160), "pitfall": (10, 110)}
ORDER = [f"{n:02d}" for n in range(1, 21)]


def load():
    items = {}
    for p in sorted(glob.glob(os.path.join(SRC, "content-hall*.json"))):
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        for ex in data:
            items[ex["id"]] = ex
        print(f"  读入 {os.path.basename(p)}: {len(data)} 件")
    return items


def validate(items):
    problems = []
    for eid in ORDER:
        if eid not in items:
            problems.append(f"{eid} 缺失")
            continue
        ex = items[eid]
        for k in REQUIRED:
            if k not in ex or ex[k] in ("", [], None):
                problems.append(f"{eid} 缺字段 {k}")
        for k, (lo, hi) in LIMITS.items():
            v = ex.get(k, "")
            if isinstance(v, str) and not (lo <= len(v) <= hi):
                problems.append(f"{eid}.{k} 长度 {len(v)} 超出 {lo}-{hi}")
        for k in ("formula", "watch"):
            v = ex.get(k)
            if not isinstance(v, list) or len(v) < 1:
                problems.append(f"{eid}.{k} 必须是非空数组")
        # 不做 LaTeX
        for f in ex.get("formula", []):
            if "$" in f or "\\frac" in f:
                problems.append(f"{eid}.formula 含 LaTeX 记号：{f[:30]}")
    return problems


def apply_overrides(items):
    """content/overrides.json 里是主脑对子 agent 文案的修正，带理由，便于追溯。"""
    p = os.path.join(ROOT, "content", "overrides.json")
    if not os.path.exists(p):
        return 0
    with open(p, encoding="utf-8") as f:
        ov = json.load(f)
    n = 0
    for eid, fields in ov.items():
        if eid.startswith("_"):
            continue
        for k, v in fields.items():
            items[eid][k] = v
            n += 1
    return n


def main():
    print(f"源目录 {SRC}")
    items = load()
    fixed = apply_overrides(items)
    if fixed:
        print(f"  应用 {fixed} 处修正（content/overrides.json）")
    problems = validate(items)
    if problems:
        print(f"\n{len(problems)} 处问题：")
        for p in problems:
            print("  -", p)
    else:
        print(f"\n{len(items)} 件全部通过结构校验")

    if "--show" in sys.argv:
        eid = sys.argv[sys.argv.index("--show") + 1]
        print(json.dumps(items.get(eid), ensure_ascii=False, indent=2))
        return

    out = {eid: {k: items[eid][k] for k in REQUIRED} for eid in ORDER if eid in items}
    path = os.path.join(ROOT, "js", "content.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write("/* content.js — 展品文案。由 tools/build_content.py 从子 agent 产出合成，手改会被覆盖。 */\n")
        f.write("var CONTENT = ")
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write(";\n")
    print(f"已写出 {path}（{len(out)} 件）")
    # 校验没通过就当失败返回，否则 CI 会看到「✓ 但有 N 处问题」这种自相矛盾的结果
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
