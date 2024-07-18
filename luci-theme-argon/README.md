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
[release-badge]: https://img.shields.io/badge/release-v1.8.3-blue.svg?
[download]: https://github.com/jerrykuku/luci-theme-argon/releases
[download-badge]: https://img.shields.io/github/downloads/jerrykuku/luci-theme-argon/total?style=flat-square
[contact]: https://t.me/jerryk6
[contact-badge]: https://img.shields.io/badge/Contact-telegram-blue?style=flat-square
[en-us-link]: /README.md
[zh-cn-link]: /README_ZH.md
[en-us-release-log]: /RELEASE.md
[zh-cn-release-log]: /RELEASE_ZH.md
[config-link]: https://github.com/jerrykuku/luci-app-argon-config/releases
[lede]: https://github.com/coolsnowwolf/lede
[official-luci-18.06]: https://github.com/openwrt/luci/tree/openwrt-18.06
[immortalwrt]: https://github.com/immortalwrt/immortalwrt

<div align="center">
<img src="https://raw.githubusercontent.com/jerrykuku/staff/master/argon_title4.svg">

# A brand new OpenWrt LuCI theme
### • This branch only matches [Lean's LEDE][lede] / [OpenWrt LuCI 18.06][official-luci-18.06] •
  
Argon is **a clean and tidy OpenWrt LuCI theme** that allows<br/>
users to customize their login interface with images or videos.  
It also supports automatic and manual switching between light and dark modes.

[![license][license-badge]][license]
[![prs][prs-badge]][prs]
[![议题][issues-badge]][issues]
[![release][release-badge]][release]
[![download][download-badge]][download]
[![contact][contact-badge]][contact]

**English** |
[简体中文][zh-cn-link]

[Key Features](#key-features) •
[Getting started](#getting-started) •
[Screenshots](#screenshots) •
[Contributors](#contributors) •
[Credits](#credits)

<img src="https://raw.githubusercontent.com/jerrykuku/staff/master/argon2.gif">
</div>

## Key Features

- Clean Layout.
- Adapted to mobile display.
- Customizable theme colors.
- Support for using Bing images as login background.
- Support for custom uploading of images or videos as login background.
- Automatically switch between light and dark modes with the system, and can also be set to a fixed mode.
- Settings plugin with extensions [luci-app-argon-config][config-link]

## Notice
- Chrome & Edge browser is highly recommended. There are some new css3 features used in this theme, currently only Chrome & Edge has the best compatibility.
- FireFox does not enable the backdrop-filter by default, [see here](https://developer.mozilla.org/zh-CN/docs/Web/CSS/backdrop-filter) for the opening method.

## Getting started

### Build for Lean's LEDE project

```bash
cd lede
rm -rf feeds/luci/themes/luci-theme-argon
git clone -b 18.06 https://github.com/jerrykuku/luci-theme-argon.git package/downloads/luci-theme-argon
make menuconfig #choose LuCI->Themes->luci-theme-argon
make -j1 V=s
```

### Install for LuCI 18.06 ( Lean's LEDE )

```bash
wget --no-check-certificate https://github.com/jerrykuku/luci-theme-argon/releases/download/v1.8.3/luci-theme-argon_1.8.3-20230710_all.ipk
opkg install luci-theme-argon*.ipk
```

### Install luci-app-argon-config

```bash
wget --no-check-certificate https://github.com/jerrykuku/luci-app-argon-config/releases/download/v0.9/luci-app-argon-config_0.9_all.ipk
opkg install luci-app-argon-config*.ipk
```

## Screenshots

![desktop](/Screenshots/screenshot_pc.jpg)
![mobile](/Screenshots/screenshot_phone.jpg)

## Contributors

<a href="https://github.com/jerrykuku/luci-theme-argon/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jerrykuku/luci-theme-argon" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

## Related Projects

- [luci-app-argon-config](https://github.com/jerrykuku/luci-app-argon-config): Argon theme config plugin
- [luci-app-vssr](https://github.com/jerrykuku/luci-app-vssr): An OpenWrt internet surfing plugin
- [openwrt-package](https://github.com/jerrykuku/openwrt-package): My OpenWrt package
- [CasaOS](https://github.com/IceWhaleTech/CasaOS): A simple, easy-to-use, elegant open-source Personal Cloud system (My current main project)

## Credits

[luci-theme-material](https://github.com/LuttyYang/luci-theme-material/)
