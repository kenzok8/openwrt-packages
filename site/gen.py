#!/usr/bin/env python3
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIELDS = ("PKG_NAME", "PKG_VERSION", "LUCI_TITLE", "PKG_TITLE", "LUCI_DESCRIPTION", "PKG_DESCRIPTION", "PKG_LICENSE")

VAR = re.compile(r"\$\([^()]*(?:\([^()]*\)[^()]*)*\)")
SHELL_CAT = re.compile(r"\$\(shell cat \$\(CURDIR\)/([^)\s]+)")
CLEAN_VERSION = re.compile(r"^[0-9][0-9A-Za-z._~+\-]*$")


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", VAR.sub("", text)).strip()


def read_version(fields: dict, base: Path) -> str:
    raw = fields.get("PKG_VERSION", "")
    if "$(" in raw:
        match = SHELL_CAT.search(raw)
        if not match:
            return ""
        target = base / match.group(1)
        try:
            raw = target.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""
    version = clean(raw)
    return version if CLEAN_VERSION.match(version) else ""


def read_fields(makefile: Path) -> dict:
    try:
        text = makefile.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {}
    found = {}
    for key in FIELDS:
        match = re.search(rf"^{key}:=\s*(.+)$", text, re.M)
        if match and key not in found:
            found[key] = match.group(1).strip()
    return found

def collect():
    items = []
    for entry in sorted(ROOT.iterdir()):
        if not entry.is_dir() or entry.name.startswith(".") or entry.name == "site":
            continue
        makefile = entry / "Makefile"
        if not makefile.is_file():
            continue
        fields = read_fields(makefile)
        declared = fields.get("PKG_NAME", "")
        name = declared if declared and "$(" not in declared and " " not in declared else entry.name
        title = clean(fields.get("LUCI_TITLE") or fields.get("PKG_TITLE")
                      or fields.get("LUCI_DESCRIPTION") or fields.get("PKG_DESCRIPTION") or "")
        items.append({
            "dir": entry.name,
            "name": name,
            "version": read_version(fields, entry),
            "title": title,
            "license": clean(fields.get("PKG_LICENSE", "")),
        })
    return items

def group(name: str) -> str:
    if name.startswith("luci-app-"):
        return "apps"
    if name.startswith("luci-"):
        return "luci"
    return "core"

GROUPS = [("apps", "LuCI 应用"), ("luci", "LuCI 组件与主题"), ("core", "独立服务与工具")]

TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>openwrt-packages · OpenWrt 常用软件包</title>
<meta name="description" content="kenzok8 维护的 OpenWrt 常用软件包集合，{count} 个包，按源码目录浏览。">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📦</text></svg>">
<style>
:root {{
  --bg: #f6f7f9; --fg: #16181d; --muted: #666e7a; --card: #ffffff;
  --line: rgba(22, 24, 29, .09); --accent: #3f74d6; --pill: rgba(63, 116, 214, .1);
  --shadow: 0 1px 2px rgba(16, 20, 30, .05), 0 8px 24px -12px rgba(16, 20, 30, .18);
}}
@media (prefers-color-scheme: dark) {{
  :root {{
    --bg: #0f1115; --fg: #e7eaef; --muted: #949cab; --card: #171a21;
    --line: rgba(231, 234, 239, .1); --accent: #7aa2f7; --pill: rgba(122, 162, 247, .14);
    --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 12px 32px -16px rgba(0, 0, 0, .8);
  }}
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}}
a {{ color: inherit; text-decoration: none; }}
.wrap {{ max-width: 1080px; margin: 0 auto; padding: 0 20px; }}
header {{ padding: 72px 0 32px; text-align: center; }}
.logo {{ font-size: 44px; line-height: 1; }}
h1 {{ font-size: 30px; margin: 14px 0 8px; letter-spacing: -.01em; }}
.sub {{ color: var(--muted); margin: 0 auto; max-width: 620px; }}
.stats {{ display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 22px 0 0; }}
.stat {{ border: 1px solid var(--line); background: var(--card); border-radius: 999px; padding: 5px 14px; font-size: 13px; color: var(--muted); }}
.stat b {{ color: var(--fg); font-weight: 600; }}
.toolbar {{ position: sticky; top: 0; z-index: 5; padding: 14px 0; background: color-mix(in srgb, var(--bg) 86%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }}
.toolbar .wrap {{ display: flex; gap: 12px; align-items: center; }}
input[type=search] {{
  flex: 1; min-width: 0; height: 40px; padding: 0 14px; border-radius: 10px;
  border: 1px solid var(--line); background: var(--card); color: var(--fg); font-size: 14px; outline: none;
}}
input[type=search]:focus {{ border-color: var(--accent); box-shadow: 0 0 0 3px var(--pill); }}
.hint {{ color: var(--muted); font-size: 13px; white-space: nowrap; }}
section {{ padding: 26px 0 8px; }}
h2 {{ font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0 0 14px; font-weight: 600; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }}
.card {{
  display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; min-height: 132px;
  background: var(--card); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow);
  transition: transform .14s ease, border-color .14s ease;
}}
.card:hover {{ transform: translateY(-2px); border-color: var(--accent); }}
.name {{ display: flex; align-items: center; gap: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14.5px; font-weight: 600; }}
.ver {{ margin-left: auto; font-size: 11.5px; padding: 1px 8px; border-radius: 999px; background: var(--pill); color: var(--accent); font-weight: 600; }}
.desc {{ color: var(--muted); font-size: 13.5px; min-height: 20px; }}
.foot {{ display: flex; gap: 12px; align-items: center; margin-top: auto; padding-top: 10px; font-size: 12px; color: var(--muted); }}
.foot .lic {{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
.foot .src {{ margin-left: auto; color: var(--accent); font-weight: 500; }}
.empty {{ color: var(--muted); padding: 40px 0; text-align: center; display: none; }}
footer {{ border-top: 1px solid var(--line); margin-top: 44px; padding: 26px 0 56px; color: var(--muted); font-size: 13px; text-align: center; }}
footer a {{ color: var(--accent); }}
@media (max-width: 560px) {{
  header {{ padding: 48px 0 24px; }} h1 {{ font-size: 24px; }} .grid {{ grid-template-columns: 1fr; }}
  .hint {{ display: none; }}
}}
</style>
</head>
<body>
<header class="wrap">
  <div class="logo">📦</div>
  <h1>openwrt-packages</h1>
  <p class="sub">kenzok8 维护的 OpenWrt 常用软件包集合。下面按源码目录列出全部包，点卡片直接进对应仓库目录。</p>
  <div class="stats">
    <span class="stat">共 <b>{count}</b> 个包</span>
    <span class="stat">LuCI 应用 <b>{apps}</b></span>
    <span class="stat">独立服务 <b>{core}</b></span>
    <span class="stat">主题与组件 <b>{luci}</b></span>
    <span class="stat"><a href="https://github.com/kenzok8/openwrt-packages">GitHub</a></span>
  </div>
</header>

<div class="toolbar">
  <div class="wrap">
    <input type="search" id="q" placeholder="搜索包名或说明…" autocomplete="off">
    <span class="hint">共 {count} 个</span>
  </div>
</div>

<main class="wrap">
{sections}
  <p class="empty" id="empty">没有匹配的包</p>
</main>

<footer>
  <div>数据来自仓库内各包的 <code>Makefile</code>，由 <a href="https://github.com/kenzok8/AutoSync">AutoSync</a> 定时重建</div>
  <div><a href="https://github.com/kenzok8/openwrt-packages">源码仓库</a> · <a href="https://down.dllkids.xyz/">固件与插件下载</a></div>
</footer>

<script>
(function () {{
  var q = document.getElementById('q');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('section'));
  var empty = document.getElementById('empty');
  function apply() {{
    var term = q.value.trim().toLowerCase();
    var visible = 0;
    cards.forEach(function (card) {{
      var hit = !term || card.dataset.search.indexOf(term) !== -1;
      card.style.display = hit ? '' : 'none';
      if (hit) visible++;
    }});
    sections.forEach(function (section) {{
      var any = Array.prototype.some.call(section.querySelectorAll('.card'), function (card) {{
        return card.style.display !== 'none';
      }});
      section.style.display = any ? '' : 'none';
    }});
    empty.style.display = visible ? 'none' : 'block';
  }}
  q.addEventListener('input', apply);
}})();
</script>
</body>
</html>
"""

def card(item: dict, repo: str) -> str:
    search = " ".join([item["name"], item["title"], item["dir"]]).lower()
    title = html.escape(item["title"] or "—")
    license_text = html.escape(item["license"]) if item["license"] else ""
    version = f'<span class="ver">{html.escape(item["version"])}</span>' if item["version"] else ""
    return f"""      <a class="card" data-search="{html.escape(search)}" href="https://github.com/{repo}/tree/master/{item['dir']}">
        <div class="name">{html.escape(item["name"])}{version}</div>
        <div class="desc">{title}</div>
        <div class="foot"><span class="lic">{license_text}</span><span class="src">源码 ↗</span></div>
      </a>"""

def render(repo: str) -> str:
    items = collect()
    buckets = {key: [] for key, _ in GROUPS}
    for item in items:
        buckets[group(item["name"])].append(item)
    sections = []
    for key, label in GROUPS:
        if not buckets[key]:
            continue
        cards = "\n".join(card(item, repo) for item in buckets[key])
        sections.append(f'  <section>\n    <h2>{label} · {len(buckets[key])}</h2>\n    <div class="grid">\n{cards}\n    </div>\n  </section>')
    return TEMPLATE.format(
        count=len(items),
        apps=len(buckets["apps"]),
        core=len(buckets["core"]),
        luci=len(buckets["luci"]),
        sections="\n".join(sections),
    )

if __name__ == "__main__":
    output = ROOT / "index.html"
    output.write_text(render("kenzok8/openwrt-packages"), encoding="utf-8")
    print(output)
