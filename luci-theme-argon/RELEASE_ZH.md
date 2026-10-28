# Master 分支的更新日志

## v3.1.1 [ 2026.10.28 ]

### 修复

- 修复手机侧栏菜单可能无法打开的问题，包括 Chrome 浏览器下的点击响应。
- 改善概览端口收发计数与 Wi-Fi 信号／噪声显示，兼顾窄屏和大字号。
- 修复无线客户端 Disconnect 菜单按钮文字竖排，优化网络名称、MAC 地址与主机信息布局。
- CSS 更新时自动变更缓存标识，覆盖使用相同包版本号重新编译的情况。
- 修正系统日志、进程、软件包管理、计划任务、SSH 管理、公钥、网络诊断及重启页面的卡片布局和间距。
- 改善 OpenClash 更新／日志、网络唤醒设置／输出及 Tailscale 状态／设备表格，兼容 Services 与 VPN 两种菜单路径。

### 升级说明

v3.1.0 用户可通过**系统 → Argon 配置 → 主题更新**升级。v3.0.0 及更早版本用户需先手动安装一次 v3.1.1。在线安装更新主题主包并保留设置；独立语言包仍按原方式安装。

[完整发布说明](https://github.com/jerrykuku/luci-theme-argon/releases/tag/v3.1.1)

## v3.1.0 [ 2026.10.22 ]

### 新功能

- 新增稳定版检查与在线安装，可通过固件原生 APK 或 OPKG 包管理器升级，并保留 Argon 设置。
- 新增安装包校验、降级保护、安装进度和日志，刷新页面后可继续跟踪安装状态。

### 改进

- 改善稳定版 OpenWrt 固件上的兼容性。

### 修复

- 修复 Dashboard 操作区间距和概览布局。
- 修复动态列表控件及自定义 IP/MAC 输入框边框，兼顾窄屏、亮暗色和 RTL 布局。

### 升级说明

v3.0.0 及更早版本用户需先手动安装一次 v3.1.0，之后可使用在线升级。在线安装仅更新主题主包，独立语言包仍按原方式安装。

[完整发布说明](https://github.com/jerrykuku/luci-theme-argon/releases/tag/v3.1.0)

## v3.0.0 [ 2026.10.16 ]

- GitHub Release: https://github.com/jerrykuku/luci-theme-argon/releases/tag/v3.0.0
- 详细更新内容请以 Release 页面为准。

## v2.4.8 [ 2026.10.08 ]

- GitHub Release: https://github.com/jerrykuku/luci-theme-argon/releases/tag/v2.4.8
- 详细更新内容请以 Release 页面为准。

## v2.4.7 [ 2026.08.24 ]

- GitHub Release: https://github.com/jerrykuku/luci-theme-argon/releases/tag/v2.4.7
- 详细更新内容请以 Release 页面为准。
## v2.4.6 [ 2026.07.31 ]

- GitHub Release: https://github.com/jerrykuku/luci-theme-argon/releases/tag/v2.4.6
- 详细更新内容请以 Release 页面为准。
## v2.4.5 [ 2026.07.18 ]

- GitHub Release: https://github.com/jerrykuku/luci-theme-argon/releases/tag/v2.4.5
- 详细更新内容请以 Release 页面为准。
## v2.4.4 [ 2026.07.16 ]

- GitHub Release: https://github.com/jerrykuku/luci-theme-argon/releases/tag/v2.4.4
- 详细更新内容请以 Release 页面为准。
## v2.4.3 [ 2025.07.22 ]

- **重构**: 移除了对 jQuery 库的依赖，全面使用原生 JavaScript 替代
- **现代化**: 升级 HTML meta 标签，提升网页安全性和兼容性
- **安全增强**: 添加安全相关的 HTTP 头信息（CSP、XSS 防护、点击劫持防护等）
- **字体系统**: 现代化字体系统，新增 Google Sans 字体支持
- **字体优化**: 替换过时的字体格式（eot/svg/ttf）为 woff2，提升加载性能
- **CSS升级**: Pure CSS 升级到 v3.0.0 版本
- **菜单优化**: 改进菜单动画，移除 jQuery 依赖并同步动画时序
- **样式改进**: 新增 dockerman 相关样式支持
- **移动端优化**: 优化移动端和 PWA 相关的 meta 标签配置
- **图标整理**: 重新整理网站图标链接，按现代标准排序
- **无障碍性**: 改善网页无障碍性，允许用户缩放页面
- **代码结构**: 优化代码结构，添加逻辑分组注释

## v2.3.1 [ 2023.04.20 ]

- 修复了下拉菜单被裁切的问题
- 修复了退出图标变成了应用商店图标的问题
- 修复了暗色模式下个别颜色不受控制的问题
- 修复了启动项--本地启动脚本文本框不能滑动的问题
- 修复了Passwall节点列表按钮错位的问题
- 修复在dynlist中的文本溢出问题
- 登录页面 支持自来 Unsplash 的在线壁纸
- 修复在macOS的Chrome中,菜单的style异常
- 修复在登录页面中,主题图标变大的问题
- 登录页面 支持自来 wallhaven 的在线壁纸
  > 打开页脚链接时使用新标签页
- 重制主题图标

## v2.3 [ 2023.04.03 ]

- 更新了 Loading 的样式
- 修复了大量的 CSS 样式错误，整体更加统一
- 修复了暗色模式下个别颜色不受控制的问题

## v2.2.9

- 修复了在手机模式下无法弹出菜单的 bug
- 统一 css 间距的设置
- 重构了登录页面的代码
- 为导航菜单添加滑动效果

## v2.2.8

- 【v2.2.8】修复编译时打开 Minify Css 选项，导致磨砂玻璃效果无效，logo 字体丢失的问题

## v2.2.5

- 全新的设置 app.你可以设置 argon 主题的登录页面的模糊和透明度，并管理背景图片与视频。[建议使用 Chrome][点击下载](https://github.com/jerrykuku/luci-app-argon-config/releases/download/v0.8-beta/luci-app-argon-config_0.8-beta_all.ipk)
- 当编译固件时，将自动设置为默认主题。
- 修改文件结构，以适应 luci-app-argon-config，旧的开启暗色模式方法将不再适用，请搭配 luci-app-argon-config 使用。
- 适配 Koolshare lede 2.3.6。
- 修复了一些 Bug。

## v2.2.4

- 修复了在某些手机下图片背景第一次加载不能显示的问题。
- 取消 luasocket 的依赖，无需再担心依赖问题。

## v2.2.3

- 修正了在暗色模式下，固件刷写弹窗内的显示错误。
- 更新了图标库，为未定义的菜单增加了一个默认的图标。

## v2.2.2

- 背景文件策略调整为，同时接受 jpg png gif mp4, 自行上传文件至 /www/luci-static/argon/background 图片和视频同时随机。
- 增加强制暗色模式，进入 ssh 输入 "touch /etc/dark" 进行开启。
- 视频背景加了一个音量开关，喜欢带声音的可以自行点击开启，默认为静音模式。
- 修复了手机模式下，登录页面出现键盘时，文字覆盖按钮的问题。
- 修正了暗黑模式下下拉选项的背景颜色，同时修改了滚动条的样式。
- jquery 更新到 v3.5.1。
- 获取 Bing Api 的方法从 wget 更新到 luasocket 并添加依赖。

## v2.2.1

- 登录背景添加毛玻璃效果。
- 全新的登录界面,图片背景跟随 Bing.com，每天自动切换。
- 全新的主题 icon。
- 增加多个导航 icon。
- 细致的微调了 字号大小边距等等。
- 重构了 css 文件。
- 自动适应的暗黑模式。
