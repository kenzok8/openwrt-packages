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

# 一个全新的 OpenWrt 主题

Argon 是**一款干净整洁的 OpenWrt LuCI 主题**，  
允许用户使用图片或视频自定义其登录界面。  
它还支持在浅色模式和深色模式之间自动或手动切换。

[![license][license-badge]][license]
[![prs][prs-badge]][prs]
[![issues][issues-badge]][issues]
[![release][release-badge]][release]
[![download][download-badge]][download]
[![contact][contact-badge]][contact]

[English][en-us-link] |
**简体中文**

[特色](#特色) •
[兼容性](#兼容性) •
[版本历史](#版本历史) •
[快速开始](#快速开始) •
[屏幕截图](#屏幕截图) •
[贡献者](#贡献者) •
[鸣谢](#鸣谢)

<img src="https://raw.githubusercontent.com/jerrykuku/staff/master/argon2.gif">
</div>

## 特色

- 简洁清爽的 Argon 风格界面设计。
- 完整适配桌面端与移动端显示。
- 支持浅色 / 深色模式自动或手动切换。
- 支持自定义主题主色，以及毛玻璃的模糊与透明度。
- 登录页支持本地图片、视频和在线壁纸背景。
- 可搭配 [luci-app-argon-config][config-link] 实现更完整的主题设置体验。

## 兼容性

目前仅维护 `master` 分支。  
当前主要面向 [官方 OpenWrt][official] 和 [ImmortalWrt][immortalwrt] 的较新版本 LuCI 环境。

## 版本历史

当前最新的版本为 v2.4.5 [点击这里][zh-cn-release-log]查看完整的版本历史日志.

## 快速开始

### 从源码编译

```bash
cd openwrt/package
git clone https://github.com/jerrykuku/luci-theme-argon.git
make menuconfig #choose LUCI->Theme->Luci-theme-argon
make -j1 V=s
```

### 安装 release 包 (`ipk`)

```bash
wget https://github.com/jerrykuku/luci-theme-argon/releases/download/v2.4.5/luci-theme-argon_2.4.5-1_all.ipk
wget https://github.com/jerrykuku/luci-theme-argon/releases/download/v2.4.5/luci-app-argon-config_2.4.5-1_all.ipk
opkg install ./luci-theme-argon_2.4.5-1_all.ipk ./luci-app-argon-config_2.4.5-1_all.ipk
```

### 安装 release 包 (`apk`)

```bash
wget https://github.com/jerrykuku/luci-theme-argon/releases/download/v2.4.5/luci-theme-argon-2.4.5-r1.apk
wget https://github.com/jerrykuku/luci-theme-argon/releases/download/v2.4.5/luci-app-argon-config-2.4.5-r1.apk
apk add --allow-untrusted ./luci-theme-argon-2.4.5-r1.apk ./luci-app-argon-config-2.4.5-r1.apk
```

请将上面的 `v2.4.5` 和文件名替换为目标 [Release][release] 页面中的实际附件名称。

## 屏幕截图

![desktop](/Screenshots/screenshot_pc.jpg)
![mobile](/Screenshots/screenshot_phone.jpg)

## 贡献者

<a href="https://github.com/jerrykuku/luci-theme-argon/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=jerrykuku/luci-theme-argon" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

## 相关项目

- [luci-app-argon-config](https://github.com/jerrykuku/luci-app-argon-config): Argon 主题设置插件
- [openwrt-package](https://github.com/jerrykuku/openwrt-package): 我的 OpenWrt 软件包集合
- [CasaOS](https://github.com/IceWhaleTech/CasaOS): 一个简单、易用且优雅的开源个人云系统，也是我目前主要投入的项目

## 鸣谢

[luci-theme-material](https://github.com/LuttyYang/luci-theme-material/)
