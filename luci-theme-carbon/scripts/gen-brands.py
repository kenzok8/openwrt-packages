#!/usr/bin/env python3
"""
Generate htdocs/luci-static/carbon/brands.js — brand icons + device
recognition data for the dashboard's "Connected Devices" list.

Sources (downloaded into a cache dir, nothing is executed from them):
  * Simple Icons  (CC0 1.0)  https://simpleicons.org  — brand glyph paths
  * IEEE MA-L OUI registry   https://standards-oui.ieee.org/oui/oui.csv

Usage:  python3 -I scripts/gen-brands.py [cache-dir]
"""
import base64
import csv
import json
import os
import re
import sys
import urllib.request

SI_VERSION = "16.37.0"
SI_BASE = f"https://cdn.jsdelivr.net/npm/simple-icons@{SI_VERSION}"
OUI_URL = "https://standards-oui.ieee.org/oui/oui.csv"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "htdocs", "luci-static", "carbon", "brands.js")
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".cache", "brands")

# key: (display name, avatar style, OUI organisation regex or None)
#   avatar style: ("icon", simple-icons slug, bg, fg)
#                 ("mono", letter, bg, fg)
#                 ("glyph", carbon icon name, bg)
# bg/fg may be CSS values; "INV" = inverted neutral (dark on light theme,
# light on dark theme) for brands whose colour is black or white.
BRANDS = {
    "apple":       ("Apple",        ("icon", "apple", "INV"),                 r"^Apple, Inc"),
    "xiaomi":      ("Xiaomi",       ("icon", "xiaomi", "#FF6900"),           r"Xiaomi"),
    "huawei":      ("Huawei",       ("icon", "huawei", "#FF0000"),           r"Huawei|HUAWEI"),
    "honor":       ("Honor",        ("mono", "H", "INV"),                    r"Honor Device"),
    "samsung":     ("Samsung",      ("mono", "S", "#1428A0"),                r"^Samsung Electronics"),
    "oppo":        ("OPPO",         ("mono", "O", "#2D683D"),                r"Oppo|OPPO"),
    "vivo":        ("vivo",         ("mono", "v", "#415FFF"),                r"vivo Mobile"),
    "oneplus":     ("OnePlus",      ("icon", "oneplus", "#F5010C"),          r"OnePlus"),
    "realme":      ("realme",       ("mono", "r", "#FFC915", "#1d1d1f"),     r"Realme"),
    "meizu":       ("Meizu",        ("icon", "meizu", "#FF4132"),            None),
    "google":      ("Google",       ("icon", "google", "#4285F4"),           r"^Google"),
    "android":     ("Android",      ("icon", "android", "#3DDC84"),          None),
    "amazon":      ("Amazon",       ("glyph", "speaker", "#FF9900"),         r"^Amazon"),
    "nintendo":    ("Nintendo",     ("glyph", "gamepad", "#E60012"),         r"Nintendo"),
    "playstation": ("PlayStation",  ("icon", "playstation", "#0070D1"),      r"Sony Interactive"),
    "sony":        ("Sony",         ("mono", "S", "INV"),                    r"^Sony"),
    "microsoft":   ("Microsoft",    ("glyph", "pc", "#737373"),              r"^Microsoft"),
    "windows":     ("Windows",      ("glyph", "pc", "#0078D4"),              None),
    "lenovo":      ("Lenovo",       ("mono", "L", "#E2231A"),                r"Lenovo"),
    "dell":        ("Dell",         ("icon", "dell", "#007DB8"),             r"^Dell"),
    "hp":          ("HP",           ("icon", "hp", "#0096D6"),               r"^HP |^Hewlett Packard|^HP Inc"),
    "asus":        ("ASUS",         ("mono", "A", "INV"),                    r"ASUSTek"),
    "tplink":      ("TP-Link",      ("icon", "tplink", "#4ACBD6"),           r"TP-LINK|TP-Link"),
    "raspberrypi": ("Raspberry Pi", ("icon", "raspberrypi", "#A22846"),      r"Raspberry Pi"),
    "synology":    ("Synology",     ("mono", "S", "#3A3A3C"),                r"Synology"),
    "espressif":   ("Espressif",    ("icon", "espressif", "#E7352C"),        r"Espressif"),
    "lg":          ("LG",           ("icon", "lg", "#A50034"),               r"^LG Electronics"),
    "roku":        ("Roku",         ("mono", "R", "#662D91"),                r"^Roku"),
    "dji":         ("DJI",          ("icon", "dji", "INV"),                  r"DJI"),
    "ubiquiti":    ("Ubiquiti",     ("icon", "ubiquiti", "#0559C9"),         r"Ubiquiti"),
    "philipshue":  ("Philips Hue",  ("icon", "philipshue", "#0065D3"),       r"Signify|Philips Lighting"),
    "zte":         ("ZTE",          ("mono", "Z", "#0081CC"),                r"^zte|ZTE Corporation"),
    "tcl":         ("TCL",          ("mono", "T", "#E4002B"),                r"^TCL"),
    "hisense":     ("Hisense",      ("mono", "H", "#00A99D"),                r"Hisense"),
    "midea":       ("Midea",        ("mono", "M", "#03B0EF"),                r"Midea (Group|Air|Electric)"),
    "haier":       ("Haier",        ("mono", "H", "#005AAB"),                r"Haier"),
    # Wi-Fi chip vendors: no brand shown, only a "computer" hint
    "_pc":         (None,           ("glyph", "pc", None),                   r"^Intel Corporate|^Liteon|^AzureWave|^Realtek"),
}

# Hostname rules, first match wins: (regex, brand key or None, device type)
HOST_RULES = [
    (r"iphone", "apple", "phone"),
    (r"ipad", "apple", "tablet"),
    (r"macbook|imac|mac-?mini|mac-?pro|mac-?studio|^mac\b", "apple", "pc"),
    (r"apple-?tv|appletv", "apple", "tv"),
    (r"homepod", "apple", "speaker"),
    (r"apple-?watch|ipod|airport|apple", "apple", None),
    (r"redmi|xiaomi|^mi[-_ ]|^mi\d|poco|mijia|miwifi|xiaoai|zhimi|chuangmi|yeelink|lumi-|roborock|dreame|viomi|mibox|mitv", "xiaomi", None),
    (r"honor", "honor", "phone"),
    (r"huawei|matebook|matepad|harmony", "huawei", None),
    (r"samsung|galaxy|^sm-[a-z]\d", "samsung", None),
    (r"oneplus", "oneplus", "phone"),
    (r"realme|^rmx\d", "realme", "phone"),
    (r"oppo|^cph\d|^pd[a-z]m\d", "oppo", "phone"),
    (r"vivo|iqoo", "vivo", "phone"),
    (r"meizu", "meizu", "phone"),
    (r"pixel|chromecast|google|nest-?(hub|mini|audio|wifi)", "google", None),
    (r"echo|kindle|fire-?tv|amazon|alexa", "amazon", None),
    (r"nintendo", "nintendo", "game"),
    (r"playstation|^ps[345]\b|^ps[345]-", "playstation", "game"),
    (r"xbox", "microsoft", "game"),
    (r"^desktop-|^laptop-|^win-|windows|surface", "windows", "pc"),
    (r"bravia", "sony", "tv"),
    (r"lenovo|thinkpad|thinkbook|legion|yoga", "lenovo", "pc"),
    (r"dell|xps|inspiron|latitude|optiplex", "dell", "pc"),
    (r"^hp[-_]|hewlett|laserjet|deskjet|officejet|envy|pavilion|elitebook", "hp", None),
    (r"asus|rog-|zenbook|vivobook", "asus", None),
    (r"tp-?link|^tl-|deco", "tplink", None),
    (r"raspberry|^rpi|raspi", "raspberrypi", "pc"),
    (r"synology|diskstation|^ds\d{3}", "synology", "nas"),
    (r"^esp[-_]|esp32|esp8266|tasmota|espressif", "espressif", "iot"),
    (r"lgwebos|^lg[-_]", "lg", "tv"),
    (r"roku", "roku", "tv"),
    (r"dji", "dji", None),
    (r"unifi|ubnt|ubiquiti", "ubiquiti", None),
    (r"hue-?bridge|philips-?hue", "philipshue", "iot"),
    (r"hisense|vidaa", "hisense", "tv"),
    (r"tcl", "tcl", "tv"),
    (r"midea", "midea", "iot"),
    (r"haier", "haier", "iot"),
    (r"zte", "zte", None),
    (r"^android|android-", "android", "phone"),
    # brandless device types
    (r"printer|epson|canon|brother", None, "printer"),
    (r"camera|ipcam|^ipc|ezviz|hikvision|imou|xiaovv", None, "camera"),
    (r"tv\b|-tv|tv-|电视", None, "tv"),
    (r"speaker|sonos", None, "speaker"),
    (r"phone|手机", None, "phone"),
    (r"pad\b|tablet|平板", None, "tablet"),
    (r"nas\b", None, "nas"),
    (r"pc\b|desktop|laptop|notebook|电脑", None, "pc"),
]


def fetch(url, dest):
    if os.path.exists(dest):
        return dest
    req = urllib.request.Request(url, headers={"User-Agent": "carbon-theme-build"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def main():
    os.makedirs(CACHE, exist_ok=True)

    # --- icons -----------------------------------------------------------
    paths = {}
    for key, (_, style, _) in BRANDS.items():
        if style[0] != "icon":
            continue
        slug = style[1]
        svg = open(fetch(f"{SI_BASE}/icons/{slug}.svg", os.path.join(CACHE, slug + ".svg")), encoding="utf-8").read()
        m = re.search(r'<path d="([^"]+)"', svg)
        if not m:
            sys.exit(f"no path in {slug}.svg")
        paths[key] = m.group(1)

    # --- OUI -------------------------------------------------------------
    oui_csv = fetch(OUI_URL, os.path.join(CACHE, "oui.csv"))
    rules = [(k, re.compile(v[2])) for k, v in BRANDS.items() if v[2]]
    prefixes = {k: set() for k, _ in rules}
    with open(oui_csv, encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            if row.get("Registry") != "MA-L":
                continue
            org = row.get("Organization Name", "")
            for k, rx in rules:
                if rx.search(org):
                    prefixes[k].add(row["Assignment"].strip().upper())
                    break

    oui = {}
    for k, s in prefixes.items():
        if not s:
            continue
        raw = b"".join(bytes.fromhex(p) for p in sorted(s))
        oui[k] = base64.b64encode(raw).decode("ascii")

    # --- emit ------------------------------------------------------------
    brands = {}
    for key, (name, style, _) in BRANDS.items():
        b = {"n": name}
        kind = style[0]
        bg = style[2] if len(style) > 2 else None
        if bg == "INV":
            b["inv"] = 1
        elif bg:
            b["bg"] = bg
        if kind == "icon":
            b["p"] = paths[key]
        elif kind == "mono":
            b["m"] = style[1]
            if len(style) > 3:
                b["fg"] = style[3]
        else:
            b["g"] = style[1]
        brands[key] = b

    host = [[rx, k, t] for rx, k, t in HOST_RULES]

    js = (
        "/*!\n"
        " * Carbon — brand data for the connected-devices list (generated by scripts/gen-brands.py).\n"
        f" * Brand glyphs: Simple Icons {SI_VERSION} (CC0 1.0). All trademarks belong to their owners.\n"
        " * MAC prefixes: IEEE Registration Authority MA-L registry.\n"
        " */\n"
        "(function (C) {\n"
        "\t'use strict';\n"
        f"\tC.BRAND_DATA = {json.dumps({'brands': brands, 'host': host, 'oui': oui}, separators=(',', ':'), ensure_ascii=False)};\n"
        "\tif (typeof C.onBrands === 'function') C.onBrands();\n"
        "})(window.Carbon = window.Carbon || {});\n"
    )
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)

    total = sum(len(s) for s in prefixes.values())
    print(f"wrote {OUT}: {len(js) // 1024} KB, {len(brands)} brands, {len(paths)} icons, {total} OUI prefixes")


if __name__ == "__main__":
    main()
