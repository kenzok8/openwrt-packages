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
    <img src="https://img.shields.io/github/downloads/gngpp/luci-theme-design/total?style=flat">
  </a>
</div>
<br>

<br>English | [简体中文](README_zh.md)

# luci-theme-design

luci-theme-design is an OpenWrt LuCI theme for immersive WebApp experience and optimization on mobile and PC

> **luci-theme-design** based on luci-theme-neobird, suitable for [lede](https://github.com/coolsnowwolf/lede) / [OpenWrt](https://github.com/openwrt/openwrt ).
> The default branch only supports the lua version of the lede source code. If you use openwrt 21/22, please pull the [js](https://github.com/gngpp/luci-theme-design/tree/js) version(Development stage).

- Thanks for non-commercial open source development authorization by [JetBrains](https://www.jetbrains.com/)!
<a href="https://www.jetbrains.com/?from=gnet" target="_blank"><img src="https://raw.githubusercontent.com/panjf2000/illustrations/master/jetbrains/jetbrains-variant-4.png" width="250" align="middle"/></a>

### Release version

- Lua version select 5.x version
- JS version select 6.x version

### Features

- Optimized for the mobile terminal, especially suitable for the mobile terminal as a WebApp
- Modified and optimized the display of many plug-ins, improved icon icons, and unified visuals as much as possible
- Simple login interface, bottom navigation bar, immersive app-like experience;
- Adapt to dark mode, adapt to automatic switching of the system;
- Adapt to openwrt 21/22, lede

### Plugins
link: https://github.com/gngpp/luci-app-design-config
- Support changing theme dark/light mode
- Support for replacing commonly used proxy icons

### Experience WebApp method

- Open the settings management in the mobile browser (iOS/iPadOS, Android Google) and add it to the home screen.
- If the SSL certificate is not used, iOS/iPadOS will display the menu bar at the top of the browser after opening a new page for security reasons.

### Optimization

- Fix the white background of the installation package prompt information
- Optimize menu collapsing and zooming
- Optimized to display network port down state display icon
- Optimize logo display
- Added the status icon display of each device
- Replace the logo display with the font "OpenWrt", and support displaying the logo with the host name
- Fix some plug-in display bugs
- Fix vssr status bar
- Fixed many bugs
- Fix compatibility with some plug-in styles
- Fix aliyundrive-webdav style
- Fixed the abnormal display of vssr in iOS/iPadOS WebApp mode
- Fix openclash plugin env(safe-area-inset-bottom) = 0 in iOS/iPadOS WebApp mode
- Optimize menu hover action state resolution
- Support luci-app-wizard wizard menu
- Update header box-shadow style
-Update uci-change overflow
- Fix nlbw component
- Support QWRT (QSDK), iStore wizard navigation
- Adapt to OpenWrt 21/22

### Compile

```
git clone https://github.com/gngpp/luci-theme-design.git package/luci-theme-design
make menuconfig # choose LUCI->Theme->Luci-theme-design
make V=s
```

### Q&A

- The resource interface icon is not perfect. If you have the ability to draw a picture, you are welcome to pr, but please make sure it is consistent with the existing icon color style
- If there is a bug, please raise an issue
- The theme's personal color matching may not meet the public's appetite, welcome to provide color matching suggestions

### preview

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
