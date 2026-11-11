<div align="center">

<img src="htdocs/luci-static/carbon/logo.svg" width="72" height="72" alt="Carbon">

# luci-theme-carbon

简洁的毛玻璃风格 OpenWrt LuCI 主题，为每一个人设计。

[English](README.md) · **简体中文**

[![Build](https://github.com/mrjoechen/luci-theme-carbon/actions/workflows/build.yml/badge.svg)](https://github.com/mrjoechen/luci-theme-carbon/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/mrjoechen/luci-theme-carbon)](https://github.com/mrjoechen/luci-theme-carbon/releases/latest)
[![License](https://img.shields.io/github/license/mrjoechen/luci-theme-carbon)](LICENSE)
[![Download](https://img.shields.io/github/downloads/mrjoechen/luci-theme-carbon/total?style=flat)](https://github.com/mrjoechen/luci-theme-carbon/releases/latest)
[![Star](https://img.shields.io/github/stars/mrjoechen/luci-theme-carbon)](https://github.com/mrjoechen/ShowcaseApp/stargazers)

**[在线演示](https://mrjoechen.github.io/luci-theme-carbon/) · [English demo](https://mrjoechen.github.io/luci-theme-carbon/?lang=en)**

</div>

## 界面预览

<p align="center"><img src=".github/screenshots/overview-light.jpg" alt="浅色" width="100%"></p>

<p align="center"><img src=".github/screenshots/overview-dark.jpg" alt="深色" width="100%"></p>

## 功能

- **仪表盘**（状态 → 概览）：可选接口的实时流量图、CPU / 内存 / 存储圆环、内存构成条、负载迷你图、连接数、运行时间、温度传感器（热区与 hwmon）、外网 IPv4/IPv6、在线设备和网络接口状态。LuCI 原有的状态信息保留在「显示详细状态」里，收起时停止轮询。
- **在线设备**：合并 DHCPv4/v6 租约、Wi‑Fi 关联列表（频段和信号）与 ARP 邻居，固定 IP 设备也能显示；根据主机名和 MAC 厂商前缀识别品牌（35 个品牌，约 9200 条 IEEE OUI 前缀）。
- **简洁 / 专业双模式**：简洁模式只显示常用功能（概览、上网、Wi‑Fi、软件包、密码、备份、重启）；专业模式显示完整 LuCI 菜单，每个页面都有对应图标。
- **毛玻璃侧栏**，可收起为只显示图标的窄栏（点侧栏边缘的圆形按钮，或按 <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>\\</kbd>），鼠标悬停图标弹出子菜单。
- 右上角切换**浅色 / 深色 / 跟随系统**，左下角**切换语言**（列出所有已安装的 LuCI 语言）。主题文案内置英文、简体中文、繁体中文、德语、西班牙语、法语、意大利语、日语、韩语、巴西葡萄牙语、俄语、土耳其语和越南语，其他语言可在 `po/` 中以 gettext 文件补充。
- **键盘与触屏友好**：分段按钮支持方向键，手机抽屉菜单管理焦点，收起的侧栏可点按、<kbd>Enter</kbd> 或 <kbd>→</kbd> 打开子菜单。
- **适配手机**：侧栏变为抽屉，表格自动变成卡片。
- **自定义 Logo**：在「系统 → Carbon 主题」上传 PNG、JPEG、WebP、GIF 或 SVG，替换侧栏、登录页、概览页和浏览器标签上的 Logo；主题升级和保留配置的固件升级后仍然保留。含脚本或嵌入内容的 SVG 会被拒绝。
- **网页在线升级**：在「系统 → Carbon 主题」检查并安装稳定版，可选 HTTPS 下载镜像；APK 保留签名校验，安装前按 GitHub 公布的信息核对文件大小和 SHA-256。
- 所有 LuCI 页面和插件照常使用；更新器仅安装 Carbon 主题包。
- 与架构无关，所有路由器通用一个主题包。

## 安装与使用

### 兼容性

| 固件 | 包管理器 | 安装包 |
|---|---|---|
| OpenWrt / ImmortalWrt 23.05、24.10 | opkg | `.ipk` 或安装脚本 |
| OpenWrt / ImmortalWrt 25.x、snapshot | apk | `.apk` 或安装脚本 |

需要 ucode 版 LuCI（23.05 及以后）。

所有文件都在 [Releases](https://github.com/mrjoechen/luci-theme-carbon/releases/latest) 页面。

### 方式一：安装脚本（所有固件通用）

在路由器上执行（SSH 登录后）：

```bash
wget -O /tmp/carbon-install.sh https://github.com/mrjoechen/luci-theme-carbon/releases/latest/download/carbon-install.sh && sh /tmp/carbon-install.sh
```

脚本内置当前 Release 的已签名 `.apk`、`.ipk` 和 Carbon 公钥，通过系统包管理器安装，因此在线升级可用，**无需手动导入公钥**。APK 签名用内置公钥在独立目录中校验，不修改 `/etc/apk/keys`。缺少的依赖（`curl`、`ca-bundle`、`flock`）从固件自带软件源安装。可选参数：

| 命令 | 作用 |
|---|---|
| `sh carbon-install.sh --trust-key` | 同时把 Carbon 公钥加入 `/etc/apk/keys`，之后可在 LuCI 直接上传 Carbon 的 APK |
| `sh carbon-install.sh --files` | 只复制文件（不登记到包管理器，无法在线升级） |

再次运行脚本即可原地升级，也会把旧版脚本安装的主题转为包管理器登记的安装。无法通过包管理器安装时（例如离线且缺少依赖），会自动改为复制文件并给出提示。

如果路由器不能上网，先在电脑上下载 `carbon-install.sh` 再传过去（`-O` 不能省，OpenWrt 的 SSH 服务没有 SFTP）：

```bash
scp -O carbon-install.sh root@192.168.1.1:/tmp/
```

```bash
ssh root@192.168.1.1 "sh /tmp/carbon-install.sh"
```

### 方式二：opkg（`.ipk`，23.05 / 24.10）

在「系统 → 软件包 → 上传软件包」上传 `luci-theme-carbon_*_all.ipk`，或执行：

```bash
opkg install /tmp/luci-theme-carbon_*_all.ipk
```

### 方式三：apk（`.apk`，25.x / snapshot）

**从 v1.0.1 开始，Release 中的 APK 已签名。** 每台设备只需导入一次 `carbon-apk.pem`，后续直接通过 LuCI 上传安装或升级：

1. 从 [Releases](https://github.com/mrjoechen/luci-theme-carbon/releases/latest) 下载公钥和 APK。
2. 切换到专业模式，在 **系统 → 管理权 → 软件源公钥（Repo Public Keys）** 中粘贴完整公钥并添加（需固件提供此页面）。
3. 在 **系统 → 软件包 → 上传软件包** 中上传 APK 并安装。

旧版 LuCI 没有公钥管理页时，只需一次 SSH 导入。公钥指纹、导入命令、刷机保留配置及排错见 [APK 配置说明](docs/apk-install.md)。旧 v1.0.0 APK 未签名，请重新下载新版。`wget` / `packages.adb` 报错属于独立的软件源或网络问题，要稳定通过网页安装仍需修复软件源。

### 安装之后

Carbon 会自动设为默认主题。刷新页面，然后**退出并重新登录一次**，仪表盘才能读取 CPU、连接数等数据。随时可以在「系统 → 系统 → 语言和界面」切换回其他主题。

### 使用

| 功能 | 位置 |
|---|---|
| 简洁 / 专业菜单 | 侧栏顶部的分段按钮 |
| 收起侧栏 | 侧栏边缘的圆形按钮，或 <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>\\</kbd> |
| 浅色 / 深色 / 自动 | 工具栏右上角 |
| 语言 | 侧栏左下角（修改的是 LuCI 的界面语言，等同「系统 → 语言」；安装超过两种语言时显示下拉框） |
| 实时流量统计接口 | 「实时流量」卡片右上角的选择框：「自动」跟随 WAN；也可选任意接口或网络设备（如同时承载 IPTV 的光口 `pon0`），按浏览器记住 |
| 检查更新与一键升级 | 系统 → Carbon 主题（简洁、专业模式均可见） |
| 自定义 Logo | 系统 → Carbon 主题 → Logo（「恢复默认」可撤销） |
| LuCI 原版状态页 | 仪表盘下方「显示详细状态」 |

### 网页在线升级（v1.1.0 起）

首次通过系统包管理器安装 v1.1.0 或更新版本，然后打开 **系统 → Carbon 主题**（v1.1.0 中名为「Carbon 更新」），点击「检查更新」，再点击「一键升级」并确认。页面显示更新说明、后台进度和安装日志；刷新页面后可继续查看进度。主题偏好与路由器配置会保留，不允许同版本重复安装、降级或使用过期的更新信息。

APK 在线更新先使用包内固定的 Carbon 公钥验证，再由 APK 包管理器验签安装；使用已安装依赖，不读取固件软件源索引。此过程不修改 `/etc/apk/keys`，LuCI 标准「上传软件包」仍需前面的一次性公钥导入。IPK 更新通过 HTTPS 下载并核对发布附件的 SHA-256 与大小。检查更新需要路由器能访问 GitHub，且系统时间正确。详见 [在线升级说明](docs/online-update.md)。

GitHub 下载缓慢或无法访问时，可在同一页面填写 HTTPS **下载镜像**前缀。镜像只用于下载安装包，版本、大小和 SHA-256 仍以 GitHub 为准；镜像失败时自动改用 GitHub。

依赖 `curl`、`ca-bundle`、`flock`，使用原生包安装时自动处理。使用 `--files` 或 v1.1.3 之前的安装脚本安装的主题没有登记到 apk/opkg，重新运行一次当前的 `carbon-install.sh` 即可启用在线升级。

### 卸载

```bash
sh /tmp/carbon-install.sh uninstall
```

或使用 `opkg remove luci-theme-carbon` / `apk del luci-theme-carbon`。卸载后会自动切回原来的主题。

## 自行构建

**不需要 SDK**（生成安装脚本和 `.ipk`）：

```bash
sh scripts/build-installer.sh
```

```bash
sh scripts/build-ipk.sh
```

**使用 OpenWrt SDK**：把本目录放到 SDK 的 `package/` 下，执行 `make package/luci-theme-carbon/compile`。

**APK 签名**：SDK 原始 APK 未签名；本地签名方法、验证步骤和发布所需的 `APK_SIGNING_KEY` Actions Secret 见 [签名构建说明](docs/apk-signing.md)。

**品牌数据**（`brands.js`）可用 `python3 -I scripts/gen-brands.py` 重新生成。

### 开发

| 源文件 | 生成文件 | 命令 |
|---|---|---|
| `styles/NN-*.css`（每个章节一个文件） | `htdocs/luci-static/carbon/carbon.css` | `python3 -I scripts/build-css.py` |
| `po/<语言>/carbon.po`（gettext） | `po/templates/carbon.pot`、`htdocs/luci-static/carbon/i18n/<语言>.js` | `python3 -I scripts/gen-i18n.py` |
| `Makefile` 的 `PKG_VERSION` / `PKG_RELEASE` | `root/usr/share/carbon/version`（保持一致） | `sh scripts/check-version.sh` |

生成文件随仓库提交，各种安装方式都无需构建步骤；文件过期时 CI（`--check`）会失败。version 文件是唯一的版本来源：主题模板把它加到资源链接上，`carbon.js` 从链接中读取。

新增语言：复制模板为 `po/<语言>/carbon.po`，翻译后运行 `gen-i18n.py`。使用 SDK 构建时还会生成 `luci-i18n-carbon-<语言>` 语言包。

发布说明：编写 `docs/releases/vX.Y.Z.md`（参照上一版的格式），文件中分为 `## English` 和 `## 简体中文` 两节。发布任务（`scripts/release-notes.sh`）会把 `docs/releases/install.md` 中对应语言的安装说明接在各自一节后面，每种语言从头到尾连续阅读。

发布包中的 CSS/JS 会被压缩（`node scripts/minify.mjs`，由 CI 在临时检出目录中执行）。测试：

```bash
npm ci && npm test
```

```bash
npx playwright install chromium && npm run test:browser
```

基于 Docker 的更新器和模板测试见 [tests/README.md](tests/README.md)。

## 声明

- 品牌图标：[Simple Icons](https://simpleicons.org)（CC0 1.0），所有商标归各自所有者。
- MAC 厂商前缀：IEEE Registration Authority MA-L 注册表。
- 组件行为参照官方 `luci-theme-bootstrap`。

本项目采用 [Apache License 2.0](LICENSE) 许可。
