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

## 登录页样式

进入 **系统 → Argon 主题设置**，选择默认的**经典侧栏**或**居中卡片**。切换选项时会更新预览缩略图；保存后，重新打开登录页即可看到变化。两种布局共用壁纸、深浅色、模糊度和透明度设置。

此功能需要支持 `login_style` 的主题版本，请同时更新主题和本插件。已有配置未设置该选项时，继续使用经典布局。

## 自定义网站图标与登录 Logo

在 **系统 → Argon 主题设置 → 自定义图标** 中，可以分别上传网站图标和登录页 Logo，也可以将同一张图片同时用于两处；每项都可恢复默认。支持 PNG 格式，每边 16–1024 像素，最大 1 MiB。网站图标需为正方形；登录 Logo 按原比例缩放，兼容经典侧栏和居中卡片。

请同时更新主题和配置插件。上传或恢复后立即生效，无需保存其他设置；已打开的页面需要刷新才能更新图标。自定义网站图标也用于手机桌面图标和 manifest，已添加到桌面的快捷方式可能需要重新添加。

自定义文件保存在 `/www/luci-static/argon/branding/`，不会覆盖主题内置图标。配置插件通过 `keep.d` 将此目录纳入保留配置升级的备份；不保留配置时不会保留自定义图标。

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
- [openwrt-package](https://github.com/jerrykuku/openwrt-package): My OpenWrt package
- [CasaOS](https://github.com/IceWhaleTech/CasaOS): A simple, easy-to-use, elegant open-source Personal Cloud system (My current main project)
