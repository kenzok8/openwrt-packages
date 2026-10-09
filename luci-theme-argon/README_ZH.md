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

在 **系统 → Argon 主题设置 → 登录页样式** 中，可选择默认的**经典侧栏**或**居中卡片**。两种布局共用壁纸、配色和认证设置。请同时更新主题和配置插件以使用此选项；未配置或不支持的 `login_style` 值会回退到 `classic`。

Unsplash 在线壁纸需要 Unsplash API Access Key。当前 `luci-app-argon-config` 界面尚未提供此设置；选择 Unsplash 后，可通过 UCI 配置：

```sh
uci set 'argon.@global[0].use_api_key=你的_UNSPLASH_ACCESS_KEY'
uci commit argon
```

未配置密钥时，登录页会使用本地背景。Bing 和 Wallhaven 壁纸选项不受影响。

## 自定义网站图标与登录 Logo

在 **系统 → Argon 主题设置 → 自定义图标** 中，可以分别上传网站图标和登录页 Logo，也可以将同一张图片同时用于两处；每项都可恢复默认。支持 PNG 格式，每边 16–1024 像素，最大 1 MiB。网站图标需为正方形；登录 Logo 按原比例缩放，兼容经典侧栏和居中卡片。

请同时更新主题和配置插件。上传或恢复后立即生效，无需保存其他设置；已打开的页面需要刷新才能更新图标。自定义网站图标也用于手机桌面图标和 manifest，已添加到桌面的快捷方式可能需要重新添加。

自定义文件保存在 `/www/luci-static/argon/branding/`，不会覆盖主题内置图标。配置插件通过 `keep.d` 将此目录纳入保留配置升级的备份；不保留配置时不会保留自定义图标。

## 兼容性

目前仅维护 `master` 分支。  
当前主要面向 [官方 OpenWrt][official] 和 [ImmortalWrt][immortalwrt] 的较新版本 LuCI 环境。

## 版本历史

当前最新的版本为 v2.4.8 [点击这里][zh-cn-release-log]查看完整的版本历史日志.

## 快速开始

### 从源码编译

```bash
cd openwrt/package
git clone https://github.com/jerrykuku/luci-theme-argon.git
make menuconfig #choose LUCI->Theme->Luci-theme-argon
make -j1 V=s
```

### 选择安装包

请按固件原生使用的包管理器选择格式，不能仅根据系统中是否有 `apk` 命令判断：

| 固件的包管理器 | Release 附件 | 安装命令 |
| --- | --- | --- |
| `opkg`（如 OpenWrt 23.05、24.10，以及基于这些版本的 GL.iNet 固件） | `.ipk` | `opkg install` |
| 原生使用 APK v3 的 OpenWrt / ImmortalWrt（`apk-tools 3.x`） | `.apk` | `apk add --allow-untrusted` |

本项目的 APK 使用 **APK v3 格式**，`apk-tools 2.x`（包括 `2.14.0`）无法读取。`--allow-untrusted` 只跳过签名信任检查，不能解决格式不兼容；`apk` 也不能安装 IPK。

APK 构建使用 OpenWrt **25.12.5 稳定版 SDK**，主题模板保留源码以兼容目标运行时。原始 v2.4.8 APK 使用 snapshot SDK 构建，要求 `ucode>=2026.02.27`，而 OpenWrt 25.12.5 不提供该版本（[#715](https://github.com/jerrykuku/luci-theme-argon/issues/715)）。该附件需要包含本次修复后重新构建；更新仓库代码不会替换已经发布的安装包。请勿绕过依赖检查安装不兼容的字节码。

对于 [#705](https://github.com/jerrykuku/luci-theme-argon/issues/705) 中的 GL.iNet / OpenWrt 23.05 环境，应下载 IPK 并使用固件原有的 `opkg` 安装，无需替换系统包管理器。

从 [Release][release] 下载主题包 `luci-theme-argon`、配置插件包 `luci-app-argon-config`，以及需要的 `luci-i18n-argon-config-<语言>` 语言包。所有包必须选择相同格式，以附件的实际文件名为准，不要自行拼接版本号或修改扩展名。

将文件放在同一个空目录中，每个包只保留一个版本，然后在该目录执行下面对应的命令。

### 安装 release 包 (`ipk`)

```bash
opkg update
opkg install ./luci-theme-argon_*.ipk ./luci-app-argon-config_*.ipk
```

如已下载相同格式的语言包，再执行：

```bash
opkg install ./luci-i18n-argon-config-*.ipk
```

### 安装 release 包 (`apk`)

仅适用于固件原生使用 `apk-tools 3.x` 的环境，可用 `apk --version` 查看版本。

```bash
apk update
apk add --allow-untrusted ./luci-theme-argon-*.apk ./luci-app-argon-config-*.apk
```

如已下载相同格式的语言包，再执行：

```bash
apk add --allow-untrusted ./luci-i18n-argon-config-*.apk
```

遇到 `IO ERROR` 时，先用 `ls -l ./*.apk` 核对文件确实存在、名称正确且下载完整，再检查 `apk --version`；不要通过强制安装绕过包格式或依赖问题。


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
