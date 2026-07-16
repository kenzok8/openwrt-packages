<!-- markdownlint-configure-file {
  "MD013": {
    "code_blocks": false,
    "tables": false,
    "line_length":200
  },
  "MD033": false,
  "MD041": false
} -->

[license]: /LICENSE
[license-badge]: https://img.shields.io/github/license/jerrykuku/luci-theme-argon?style=flat-square&a=1
[prs]: https://github.com/jerrykuku/luci-theme-argon/pulls
[prs-badge]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square
[issues]: https://github.com/jerrykuku/luci-theme-argon/issues/new
[issues-badge]: https://img.shields.io/badge/Issues-welcome-brightgreen.svg?style=flat-square
[release]: https://github.com/jerrykuku/luci-theme-argon/releases
[release-badge]: https://img.shields.io/github/v/release/jerrykuku/luci-theme-argon?style=flat-square
[download]: https://github.com/jerrykuku/luci-theme-argon/releases
[download-badge]: https://img.shields.io/github/downloads/jerrykuku/luci-theme-argon/total?style=flat-square
[contact]: https://t.me/jerryk6
[contact-badge]: https://img.shields.io/badge/Contact-telegram-blue?style=flat-square
[en-us-link]: /README.md
[zh-cn-link]: /README_ZH.md
[en-us-release-log]: /RELEASE.md
[zh-cn-release-log]: /RELEASE_ZH.md
[config-link]: https://github.com/jerrykuku/luci-app-argon-config/releases
[official]: https://github.com/openwrt/openwrt
[immortalwrt]: https://github.com/immortalwrt/immortalwrt

<div align="center">
<img src="https://raw.githubusercontent.com/jerrykuku/staff/master/argon_title4.svg">

# A brand new OpenWrt LuCI theme

Argon is **a clean and tidy OpenWrt LuCI theme** that allows<br/>
users to customize their login interface with images or videos.  
It also supports automatic and manual switching between light and dark modes.

[![license][license-badge]][license]
[![prs][prs-badge]][prs]
[![issues][issues-badge]][issues]
[![release][release-badge]][release]
[![download][download-badge]][download]
[![contact][contact-badge]][contact]

**English** |
[简体中文][zh-cn-link]

[Key Features](#key-features) •
[Compatibility](#compatibility) •
[Version History](#version-history) •
[Getting started](#getting-started) •
[Screenshots](#screenshots) •
[Contributors](#contributors) •
[Credits](#credits)

<img src="https://raw.githubusercontent.com/jerrykuku/staff/master/argon2.gif">
</div>

## Key Features

- Clean and modern Argon-style interface design.
- Fully adapted for both desktop and mobile displays.
- Supports automatic or manual switching between light and dark modes.
- Supports custom theme colors, along with adjustable blur and transparency effects.
- The login page supports local images, videos, and online wallpapers as backgrounds.
- Works with [luci-app-argon-config][config-link] for a more complete theme configuration experience.

## Compatibility

Only the `master` branch is maintained now.  
Support is focused on modern LuCI environments based on [Official OpenWrt][official] and [ImmortalWrt][immortalwrt].

## Version History

The latest version is v2.4.4 [Click here][en-us-release-log] to view the full version history record.

## Getting started

### Build from source

```bash
cd openwrt/package
git clone https://github.com/jerrykuku/luci-theme-argon.git
make menuconfig #choose LUCI->Theme->Luci-theme-argon
make -j1 V=s
```

### Install release packages (`ipk`)

```bash
wget https://github.com/jerrykuku/luci-theme-argon/releases/download/v2.4.4/luci-theme-argon_2.4.4-1_all.ipk
wget https://github.com/jerrykuku/luci-theme-argon/releases/download/v2.4.4/luci-app-argon-config_2.4.4-1_all.ipk
opkg install ./luci-theme-argon_2.4.3-1_all.ipk ./luci-app-argon-config_2.4.3-1_all.ipk
```

### Install release packages (`apk`)

```bash
wget https://github.com/jerrykuku/luci-theme-argon/releases/download/v2.4.4/luci-theme-argon-2.4.4-r1.apk
wget https://github.com/jerrykuku/luci-theme-argon/releases/download/v2.4.4/luci-app-argon-config-2.4.4-r1.apk
apk add --allow-untrusted ./luci-theme-argon-2.4.3-r1.apk ./luci-app-argon-config-2.4.3-r1.apk
```

Replace `v2.4.3` and the package filenames above with the assets from the target [Release][release].

## Screenshots

![desktop](/Screenshots/screenshot_pc.jpg)
![mobile](/Screenshots/screenshot_phone.jpg)

## Contributors

<a href="https://github.com/jerrykuku/luci-theme-argon/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jerrykuku/luci-theme-argon&v=2" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

## Related Projects

- [luci-app-argon-config](https://github.com/jerrykuku/luci-app-argon-config): Configuration plugin for the Argon theme
- [openwrt-package](https://github.com/jerrykuku/openwrt-package): My OpenWrt package collection
- [CasaOS](https://github.com/IceWhaleTech/CasaOS): A simple, elegant open-source personal cloud system and my current primary project

## Credits

[luci-theme-material](https://github.com/LuttyYang/luci-theme-material/)
