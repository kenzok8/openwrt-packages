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
[license-badge]: https://img.shields.io/github/license/jerrykuku/luci-app-argon-config?style=flat-square&a=1
[prs]: https://github.com/jerrykuku/luci-app-argon-config/pulls
[prs-badge]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square
[issues]: https://github.com/jerrykuku/luci-app-argon-config/issues/new
[issues-badge]: https://img.shields.io/badge/Issues-welcome-brightgreen.svg?style=flat-square
[release]: https://github.com/jerrykuku/luci-app-argon-config/releases
[release-badge]: https://img.shields.io/github/v/release/jerrykuku/luci-app-argon-config?include_prereleases&style=flat-square
[download]: https://github.com/jerrykuku/luci-app-argon-config/releases
[download-badge]: https://img.shields.io/github/downloads/jerrykuku/luci-app-argon-config/total?style=flat-square
[contact]: https://t.me/jerryk6
[contact-badge]: https://img.shields.io/badge/Contact-telegram-blue?style=flat-square
[en-us-link]: /README.md
[zh-cn-link]: /README_ZH.md
[en-us-release-log]: /RELEASE.md
[zh-cn-release-log]: /RELEASE_ZH.md
[config-link]: https://github.com/jerrykuku/luci-app-argon-config/releases
[lede]: https://github.com/coolsnowwolf/lede
[official]: https://github.com/openwrt/openwrt
[immortalwrt]: https://github.com/immortalwrt/immortalwrt

<div align="center">
<img src="https://raw.githubusercontent.com/jerrykuku/staff/master/argon_title4.svg">

# Argon 主题设置插件

您可以设置 Argon 主题登录页面的模糊度和透明度，并管理背景图片和视频。

[![license][license-badge]][license]
[![prs][prs-badge]][prs]
[![issues][issues-badge]][issues]
[![release][release-badge]][release]
[![download][download-badge]][download]
[![contact][contact-badge]][contact]

[Engilish][en-us-link] |
**简体中文**

<img src="https://raw.githubusercontent.com/jerrykuku/staff/master/argon2.gif">
</div>

## Branch Introduction

目前有两个主要的分支，适应于不同版本的**OpenWrt**源代码。  
下表为详细的介绍：


| 分支   | 版本   | 介绍                        | 匹配源码                                              |
| ------ | ------ | --------------------------- | ----------------------------------------------------- |
| master | v1.x.x | 支持最新和比较新版本的 LuCI | [官方 OpenWrt][official] • [ImmortalWrt][immortalwrt] |
| 18.06  | v0.9.x | 支持 18.06 版本的 LuCI      | [Lean's LEDE][lede]                                                 |

## G快速开始

### 使用 Lean's LEDE 构建

```bash
cd lede/package/lean
rm -rf luci-app-argon-config # if have
git clone -b 18.06 https://github.com/jerrykuku/luci-app-argon-config.git luci-app-argon-config
make menuconfig #choose LUCI->Application->Luci-app-argon-config
make -j1 V=s
```

### 使用官方 OpenWrt SnapShots 和 ImmortalWrt 构建

```bash
cd openwrt/package
git clone https://github.com/jerrykuku/luci-app-argon-config.git
make menuconfig #choose LUCI->Application->Luci-app-argon-config
make -j1 V=s
```

## 贡献者

<a href="https://github.com/jerrykuku/luci-app-argon-config/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jerrykuku/luci-app-argon-config" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

## 相关项目

- [luci-theme-argon](https://github.com/jerrykuku/luci-theme-argon): Argon theme
- [luci-app-vssr](https://github.com/jerrykuku/luci-app-vssr): An OpenWrt internet surfing plugin
- [openwrt-package](https://github.com/jerrykuku/openwrt-package): My OpenWrt package
- [CasaOS](https://github.com/IceWhaleTech/CasaOS): A simple, easy-to-use, elegant open-source Personal Cloud system (My current main project)