#!/usr/bin/env python3
"""Package the static preview and the actual theme assets for GitHub Pages."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "dist" / "demo"
THEME_PREFIX = "../htdocs/luci-static/carbon/"
VERSION = (ROOT / "root" / "usr" / "share" / "carbon" / "version").read_text(encoding="utf-8").strip()


def build():
    # Clean only the generated demo directory, never a symlink or an external path.
    if OUTPUT.is_symlink() or OUTPUT.resolve() != ROOT.resolve() / "dist" / "demo":
        raise RuntimeError(f"Unsafe demo output directory: {OUTPUT}")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True)
    for name in ("index.html", "login.html", "form.html", "lang.js", "mock.js", "demo.js", "demo.css"):
        content = (ROOT / "preview" / name).read_text(encoding="utf-8")
        if name.endswith(".html"):
            content = content.replace(THEME_PREFIX, "assets/carbon/")
            # Same cache-busting version parameter the theme header adds.
            content = content.replace('assets/carbon/carbon.js"', f'assets/carbon/carbon.js?v={VERSION}"')
        (OUTPUT / name).write_text(content, encoding="utf-8")
    assets = OUTPUT / "assets" / "carbon"
    assets.mkdir(parents=True)
    for name in ("carbon.css", "carbon.js", "brands.js", "logo.svg"):
        shutil.copyfile(ROOT / "htdocs" / "luci-static" / "carbon" / name, assets / name)
    shutil.copytree(ROOT / "htdocs" / "luci-static" / "carbon" / "i18n", assets / "i18n")
    shutil.copyfile(ROOT / "LICENSE", OUTPUT / "LICENSE")
    (OUTPUT / ".nojekyll").touch()
    print(f"Built Carbon demo: {OUTPUT}")


if __name__ == "__main__":
    build()
