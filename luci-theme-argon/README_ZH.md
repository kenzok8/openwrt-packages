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

# 一个全新的 OpenWrt 主题
### • 该分支只适配 [Lean's LEDE][lede] / [OpenWrt LuCI 18.06][official-luci-18.06] •
  
Argon 是**一款干净整洁的 OpenWrt LuCI 主题**，  
允许用户使用图片或视频自定义其登录界面。  
它还支持在浅色模式和深色模式之间自动或手动切换。

[![license][license-badge]][license]
[![prs][prs-badge]][prs]
[![议题][issues-badge]][issues]
[![release][release-badge]][release]
[![download][download-badge]][download]
[![contact][contact-badge]][contact]

[English][en-us-link] |
**简体中文**

[特色](#特色) •
[快速开始](#快速开始) •
[屏幕截图](#屏幕截图) •
[贡献者](#贡献者) •
[鸣谢](#鸣谢)

<img src="https://raw.githubusercontent.com/jerrykuku/staff/master/argon2.gif">
</div>

## 特色

- 干净整洁的布局。
- 适配移动端显示。
- 可自定义主题颜色。
- 支持使用 Bing 图片作为登录背景。
- 支持自定义上传图片或视频作为登录背景。
- 通过系统自动在明暗模式之间切换，也可设置为固定模式。
- 带有扩展功能的设置插件 [luci-app-argon-config][config-link]

## 注意

- 强烈建议使用 Chrome 和 Edge 浏览器。该主题中使用了一些新的 css3 功能，目前只有 Chrome 和 Edge 浏览器有最好的兼容性。
- FireFox 默认不启用 backdrop-filter，[见这里](https://developer.mozilla.org/zh-CN/docs/Web/CSS/backdrop-filter)的打开方法。

## 快速开始

### 使用 Lean's LEDE 构建

```bash
cd lede
rm -rf feeds/luci/themes/luci-theme-argon
git clone -b 18.06 https://github.com/jerrykuku/luci-theme-argon.git package/downloads/luci-theme-argon
make menuconfig #选择 LuCI->Themes->luci-theme-argon
make -j1 V=s
```

### 在 18.06 的 LuCI 上安装 ( Lean's LEDE )

```bash
wget --no-check-certificate https://github.com/jerrykuku/luci-theme-argon/releases/download/v1.8.3/luci-theme-argon_1.8.3-20230710_all.ipk
opkg install luci-theme-argon*.ipk
```

### 安装 luci-app-argon-config

```bash
wget --no-check-certificate https://github.com/jerrykuku/luci-app-argon-config/releases/download/v0.9/luci-app-argon-config_0.9_all.ipk
wget --no-check-certificate https://github.com/jerrykuku/luci-app-argon-config/releases/download/v0.9/luci-i18n-argon-config-zh-cn_git-22.114.24542-d1474ba_all.ipk
opkg install luci-app-argon-config*.ipk
opkg install luci-i18n-argon-config*.ipk
```

## 屏幕截图

![desktop](/Screenshots/screenshot_pc.jpg)
![mobile](/Screenshots/screenshot_phone.jpg)

## 贡献者

<a href="https://github.com/jerrykuku/luci-theme-argon/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jerrykuku/luci-theme-argon" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

## 相关项目

- [luci-app-argon-config](https://github.com/jerrykuku/luci-app-argon-config): Argon 主题的设置插件
- [luci-app-vssr](https://github.com/jerrykuku/luci-app-vssr): 一个 OpenWrt 的互联网冲浪插件
- [openwrt-package](https://github.com/jerrykuku/openwrt-package): 我的 OpenWrt Package
- [CasaOS](https://github.com/IceWhaleTech/CasaOS): 一个简单、易用且优雅的开源个人家庭云系统（我目前主要开发的项目）

## 鸣谢

[luci-theme-material](https://github.com/LuttyYang/luci-theme-material/)
