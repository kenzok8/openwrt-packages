<div align="center">

<img src="htdocs/luci-static/carbon/logo.svg" width="72" height="72" alt="Carbon">

# luci-theme-carbon

A clean, glass-style LuCI theme for OpenWrt — built for everyday users.

**English** · [简体中文](README.zh-CN.md)

[![Build](https://github.com/mrjoechen/luci-theme-carbon/actions/workflows/build.yml/badge.svg)](https://github.com/mrjoechen/luci-theme-carbon/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/mrjoechen/luci-theme-carbon)](https://github.com/mrjoechen/luci-theme-carbon/releases/latest)
[![License](https://img.shields.io/github/license/mrjoechen/luci-theme-carbon)](LICENSE)
[![Download](https://img.shields.io/github/downloads/mrjoechen/luci-theme-carbon/total?style=flat)](https://github.com/mrjoechen/luci-theme-carbon/releases/latest)
[![Star](https://img.shields.io/github/stars/mrjoechen/luci-theme-carbon)](https://github.com/mrjoechen/ShowcaseApp/stargazers)


**[Live demo](https://mrjoechen.github.io/luci-theme-carbon/) · [English demo](https://mrjoechen.github.io/luci-theme-carbon/?lang=en)**

</div>

## Screenshots


<p align="center"><img src=".github/screenshots/overview-light.jpg" alt="Light" width="100%"></p>

<p align="center"><img src=".github/screenshots/overview-dark.jpg" alt="Dark" width="100%"></p>

## Features

- **Dashboard** on *Status → Overview*: live traffic chart for any interface, CPU / memory / storage rings, memory breakdown, load sparkline, connection count, uptime, temperature sensors (thermal zones and hwmon), WAN IPv4/IPv6, connected devices and interface status. LuCI's original status widgets are kept behind *Show detailed status* and stop polling while collapsed.
- **Connected devices** — DHCPv4/v6 leases, Wi‑Fi stations (band and signal) and ARP neighbours are merged, so static-IP clients show up too. Devices are recognised by hostname and MAC vendor prefix (35 brands, ~9,200 IEEE OUI prefixes).
- **Simple / Pro navigation** — *Simple* shows only the pages most people need (overview, internet, Wi‑Fi, software, password, backup, reboot); *Pro* shows the full LuCI menu with an icon for every page.
- **Frosted-glass sidebar** that collapses into an icon rail (button on the sidebar edge or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>\\</kbd>); hovering a rail icon opens its sub-menu.
- **Light / dark / auto** theme switch (top-right) and a **language switch** (bottom-left) for every installed LuCI language. Theme strings ship in English, Simplified and Traditional Chinese, German, Spanish, French, Italian, Japanese, Korean, Brazilian Portuguese, Russian, Turkish and Vietnamese; more can be added as gettext files in `po/`.
- **Keyboard and touch friendly** — arrow keys in segmented controls, a focus-managed phone drawer, and rail sub-menus that open with a tap, <kbd>Enter</kbd> or <kbd>→</kbd>.
- **Mobile friendly** — drawer navigation and tables that reflow into cards.
- **Custom logo** — upload a PNG, JPEG, WebP, GIF or SVG in *System → Carbon Theme Settings*. It replaces the sidebar, login, overview and browser-tab logo, and is kept across theme and firmware upgrades. SVGs with scripts or embedded content are rejected.
- **Online updates** — check and install stable releases from *System → Carbon Theme Settings*, optionally through an HTTPS download mirror. APK signatures remain verified; download size and SHA-256 are checked against GitHub before installation.
- Existing LuCI pages and plugins keep working;
- Architecture independent: one theme package for every router.

## Installation & Usage

### Compatibility

| Firmware | Package manager | Package |
|---|---|---|
| OpenWrt / ImmortalWrt 23.05, 24.10 | opkg | `.ipk` or install script |
| OpenWrt / ImmortalWrt 25.x, snapshot | apk | `.apk` or install script |

Requires the ucode-based LuCI (23.05 or newer).

All files are on the [Releases](https://github.com/mrjoechen/luci-theme-carbon/releases/latest) page.

### Option 1 — install script (any firmware)

Run on the router (SSH):

```bash
wget -O /tmp/carbon-install.sh https://github.com/mrjoechen/luci-theme-carbon/releases/latest/download/carbon-install.sh && sh /tmp/carbon-install.sh
```

The script embeds the release's signed `.apk`, its `.ipk` and Carbon's public key, and installs through the system package manager — so online updates work and **no key import is needed**. The APK signature is checked with the embedded key in a private key directory; `/etc/apk/keys` is left alone. Missing dependencies (`curl`, `ca-bundle`, `flock`) come from your firmware's feeds. Options:

| Command | Effect |
|---|---|
| `sh carbon-install.sh --trust-key` | also add Carbon's key to `/etc/apk/keys`, so later LuCI uploads of Carbon APKs work |
| `sh carbon-install.sh --files` | only copy files (no package record, no online updates) |

Running the script again upgrades in place, and turns an older script-only install into a registered package. If a native install is impossible (for example offline with missing dependencies), it falls back to copying files and says so.

If the router has no internet access, download `carbon-install.sh` on your computer and copy it over (`-O` is needed because OpenWrt's SSH server has no SFTP):

```bash
scp -O carbon-install.sh root@192.168.1.1:/tmp/
```

```bash
ssh root@192.168.1.1 "sh /tmp/carbon-install.sh"
```

### Option 2 — opkg (`.ipk`, 23.05 / 24.10)

Upload `luci-theme-carbon_*_all.ipk` in *System → Software → Upload Package*, or:

```bash
opkg install /tmp/luci-theme-carbon_*_all.ipk
```

### Option 3 — apk (`.apk`, 25.x / snapshot)

**v1.0.1 and newer Release APKs are signed.** Import `carbon-apk.pem` once per device, then install or upgrade directly in LuCI:

1. Download the public key and APK from [Releases](https://github.com/mrjoechen/luci-theme-carbon/releases/latest).
2. In Pro mode, open **System → Administration → Repo Public Keys**, paste the full public key and click **Add key** (if your firmware provides this page).
3. Open **System → Software → Upload Package**, upload the APK and install.

Older LuCI needs a one-time SSH key import. See [APK configuration and troubleshooting](docs/apk-install.md) for the verified key fingerprint, commands and preserving the key across firmware upgrades. The old v1.0.0 APK is unsigned; download a new version. Repository `wget` / `packages.adb` errors are separate network/feed problems and still need fixing for reliable web installs.

### After installing

Carbon becomes the default theme. Refresh the page, then **log out and log in once** so the dashboard gets its read-only permissions. Switch themes any time in *System → System → Language and Style*.

### Usage

| What | Where |
|---|---|
| Simple / Pro menu | segmented control at the top of the sidebar |
| Collapse sidebar | round button on the sidebar edge, or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>\\</kbd> |
| Light / dark / auto | top-right of the toolbar |
| Language | bottom-left of the sidebar (changes LuCI's language, same as *System → Language*; a list when more than two are installed) |
| Live traffic interface | picker in the *Live Traffic* card: *Auto* follows the WAN; any interface or network device (e.g. an xPON port such as `pon0` that also carries IPTV) can be picked, remembered per browser |
| Check and install theme updates | System → Carbon Theme Settings (Simple and Pro modes) |
| Custom logo | System → Carbon Theme Settings → Logo (*Restore default* undoes it) |
| LuCI's original status page | *Show detailed status* under the dashboard |

### Online upgrades (v1.1.0+)

Install v1.1.0 or newer through the native package manager once. Open **System → Carbon Theme Settings** (**Carbon Update** in v1.1.0), click **Check for updates**, then **Install update** and confirm. The page shows release notes, progress and installation logs; refreshing it resumes monitoring. Theme preferences and router configuration are retained. Same-version installs, downgrades and expired update requests are rejected.

APK updates verify the bundled Carbon public key, then use APK's normal signature verification again during installation. They use already-installed dependencies without fetching firmware indexes. This does not change `/etc/apk/keys`; standard LuCI package uploads still need the one-time key import above. IPK updates use HTTPS plus the release asset's SHA-256 and size checks. Update checks need router access to GitHub and correct system time. See [online update details](docs/online-update.md).

If GitHub downloads are slow or blocked, enter an HTTPS **Download mirror** prefix on the same page. Only the package bytes use the mirror; version, size and SHA-256 still come from GitHub, and the updater falls back to GitHub if the mirror fails.

Required packages: `curl`, `ca-bundle`, `flock` (installed as native package dependencies). Installs made with `--files` or with installers before v1.1.3 are not registered with apk/opkg; run the current `carbon-install.sh` once to enable online updates.

### Uninstall

```bash
sh /tmp/carbon-install.sh uninstall
```

or remove the package with `opkg remove luci-theme-carbon` / `apk del luci-theme-carbon`. The previous theme is restored automatically.

## Build from source

**Without the SDK** (produces the install script and an `.ipk`):

```bash
sh scripts/build-installer.sh
```

```bash
sh scripts/build-ipk.sh
```

**With the OpenWrt SDK**: put this directory under `package/` and run `make package/luci-theme-carbon/compile`.

**APK signing**: raw SDK APKs are unsigned. See [signing setup and validation](docs/apk-signing.md) for local signing and the `APK_SIGNING_KEY` Actions secret required for releases.

**Brand data** (`brands.js`) is regenerated with `python3 -I scripts/gen-brands.py`.

### Development

| Source | Generated | Command |
|---|---|---|
| `styles/NN-*.css` (one file per section) | `htdocs/luci-static/carbon/carbon.css` | `python3 -I scripts/build-css.py` |
| `po/<lang>/carbon.po` (gettext) | `po/templates/carbon.pot`, `htdocs/luci-static/carbon/i18n/<lang>.js` | `python3 -I scripts/gen-i18n.py` |
| `Makefile` `PKG_VERSION` / `PKG_RELEASE` | `root/usr/share/carbon/version` (keep in sync) | `sh scripts/check-version.sh` |

Generated files are committed so every install path works without a build step; CI fails if they are stale (`--check`). The version file is the only version source: the theme template appends it to asset URLs and `carbon.js` reads it from there.

To add a language, create `po/<lang>/carbon.po` (copy the template), translate it and run `gen-i18n.py`. The SDK also builds it into a `luci-i18n-carbon-<lang>` package.

Release notes: write `docs/releases/vX.Y.Z.md` (copy the layout of the previous one) with a `## English` and a `## 简体中文` section. The release job (`scripts/release-notes.sh`) appends the matching section of `docs/releases/install.md` to each, so every language reads through once.

Release packages ship minified CSS/JS (`node scripts/minify.mjs`, run by CI on a disposable checkout). Tests:

```bash
npm ci && npm test
```

```bash
npx playwright install chromium && npm run test:browser
```

See [tests/README.md](tests/README.md) for the Docker-based updater and template tests.

## Notices

- Brand glyphs: [Simple Icons](https://simpleicons.org) (CC0 1.0). All trademarks belong to their respective owners.
- MAC vendor prefixes: IEEE Registration Authority MA-L registry.
- Widget behaviour follows the official `luci-theme-bootstrap`.

Licensed under [Apache License 2.0](LICENSE).
