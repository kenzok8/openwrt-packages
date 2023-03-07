<div align="center">
  <h1 align="center">
    LuCI design theme for OpenWrt
  </h1>
<a href="/LICENSE">
    <img src="https://img.shields.io/github/license/gngpp/luci-theme-design?style=flat&a=1" alt="">
  </a>
  <a href="https://github.com/gngpp/luci-theme-design/pulls">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="">
  </a><a href="https://github.com/gngpp/luci-theme-design/issues/new">
    <img src="https://img.shields.io/badge/Issues-welcome-brightgreen.svg?style=flat">
  </a><a href="https://github.com/gngpp/luci-theme-design/releases">
    <img src="https://img.shields.io/github/release/gngpp/luci-theme-design.svg?style=flat">
  </a><a href="hhttps://github.com/gngpp/luci-theme-design/releases">
    <img src="https://img.shields.io/github/downloads/gngpp/luci-theme-design/total?style=flat&?">
  </a>
</div>
<br>

<br>简体中文 | [English](README.md)

# luci-theme-design

luci-theme-design 是一个针对移动端和PC端的沉浸式WebApp体验和优化的OpenWrt LuCI主题

> **luci-theme-design**基于luci-theme-neobird, 适用于[lede](https://github.com/coolsnowwolf/lede) / [OpenWrt](https://github.com/openwrt/openwrt)
> 默认分支只支持lede源码的lua版本，若使用openwrt 21/22请拉取[js](https://github.com/gngpp/luci-theme-design/tree/js)版本(开发阶段)。

- 感谢 [JetBrains](https://www.jetbrains.com/) 提供的非商业开源软件开发授权！
<a href="https://www.jetbrains.com/?from=gnet" target="_blank"><img src="https://raw.githubusercontent.com/panjf2000/illustrations/master/jetbrains/jetbrains-variant-4.png" width="250" align="middle"/></a>

### 发布版本

- Lua 版本选择5.x版本
- JS 版本选择6.x版本

### 主要特点

- 针对移动端优化，特别适合手机端做为WebApp使用
- 修改和优化了很多插件显示，完善的icon图标，尽量视觉统一
- 简洁的登录界面，底部导航栏，类App的沉浸式体验；
- 适配深色模式，适配系统自动切换；
- 适配openwrt 21/22、lede

### 插件
link：https://github.com/gngpp/luci-app-design-config
- 支持更改主题深色/浅色模式
- 支持更换常用的代理图标

### 体验WebApp方法

- 在移动端(iOS/iPadOS、Android谷歌)浏览器打开设置管理，添加到主屏幕即可。
- 如果不使用SSL证书，基于安全原因，iOS/iPadOS 在打开新的页面后，将会显示浏览器顶部菜单栏。

### 优化

- 修复安装package提示信息背景泛白
- 优化菜单折叠和缩放
- 优化显示网口down状态显示图标
- 优化logo显示
- 新增各设备状态图标显示
- 更换logo显示为字体"OpenWrt"，支持以主机名显示logo
- 修复部分插件显示bug
- 修复vssr状态bar
- 修复诸多bug
- 修复兼容部分插件样式
- 修复aliyundrive-webdav样式
- 修复vssr在iOS/iPadOS WebApp模式下显示异常
- 修复openclash插件在iOS/iPadOS WebApp 模式下env(safe-area-inset-bottom) = 0
- 优化菜单hover action状态分辨
- 支持luci-app-wizard向导菜单
- Update header box-shadow style
- Update uci-change overflow
- Fix nlbw component
- 支持QWRT(QSDK)、iStore向导导航
- 适配OpenWrt 21/22

### 编译

```
git clone https://github.com/gngpp/luci-theme-design.git  package/luci-theme-design
make menuconfig # choose LUCI->Theme->Luci-theme-design  
make V=s
```

### Q&A

- 资源接口icon未完善，如果有能力画图的欢迎pr，但请确保跟现有icon颜色风格一致
- 有bug欢迎提issue
- 主题个人配色可能会不符合大众胃口，欢迎提配色建议

### 预览

<details> <summary>iOS</summary>
<img src="./preview/webapp_home.PNG"/>
<img src="./preview/webapp_vssr.PNG"/>
</details>

<details> <summary>iPadOS</summary>
<img src="./preview/IMG_0328.PNG"/>
<img src="./preview/IMG_0329.PNG"/>
</details>

<img src="./preview/login.png"/>
<img src="./preview/page.png"/>
<img src="./preview/home.png"/>
<img src="./preview/light.png"/>
<img src="./preview/home1.png"/>
<img src="./preview/wifi.png"/>
<img src="./preview/iface.png"/>
