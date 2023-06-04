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

<br>English | [简体中文](README.md)

# luci-theme-design

### luci-theme-design is an OpenWrt LuCI theme for immersive WebApp experience and optimization on mobile and PC
- **luci-theme-design** based on luci-theme-neobird, for [lede](https://github.com/coolsnowwolf/lede) / [OpenWrt](https://github.com/openwrt/ openwrt)
- The default branch only supports the lua version of the lede source code. If you use openwrt 21/22, please pull the [js](https://github.com/gngpp/luci-theme-design/tree/js) version (development stage).

- You can define some settings using [plugin](https://github.com/gngpp/luci-app-design-config)
   - Support changing theme dark/light mode
   - Support show/hide navigation bar
   - Support replacing commonly used proxy icons

### If you find it useful, please click a star, your support is the driving force for my long-term updates, thank you.
  
- Thanks for non-commercial open source development authorization by [JetBrains](https://www.jetbrains.com/)!
<a href="https://www.jetbrains.com/?from=gnet" target="_blank"><img src="https://raw.githubusercontent.com/panjf2000/illustrations/master/jetbrains/jetbrains-variant-4.png" width="250" align="middle"/></a>

### Release version

- Lua version select 5.x version
- JS version select 6.x version

### Features

- Adapt to the responsive optimization of the mobile terminal, suitable for use as a WebApp on the mobile terminal
- Modified and optimized the display of many plug-ins, improved icon icons, and unified visuals as much as possible
- Simple login interface, bottom navigation bar, immersive app-like experience
- Adapt to dark mode, adapt to system automatic switching, support custom mode
- Adapt to openwrt 21/22, lede

### Experience WebApp method

- Open the settings management in the mobile browser (iOS/iPadOS, Android Google) and add it to the home screen.
- If the SSL certificate is not used, iOS/iPadOS will display the menu bar at the top of the browser after opening a new page for security reasons.

### Optimization

- Optimize menu collapsing and zooming
- Optimized to display network port down state display icon
- Support QWRT (QSDK), iStore wizard navigation
- Adapt to OpenWrt 21/22
- Adapt to linkease series icons

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

### Preview

<details> <summary>iOS</summary>
<img src="./preview/webapp_home.PNG"/>
<img src="./preview/webapp_vssr.PNG"/>
</details>

<details> <summary>iPadOS</summary>
<img src="./preview/IMG_0328.PNG"/>
<img src="./preview/IMG_0329.PNG"/>
</details>

<img src="./preview/login.png"/>
<img src="./preview/login1.png"/>
<img src="./preview/page.png"/>
<img src="./preview/home.png"/>
<img src="./preview/light.png"/>
<img src="./preview/home1.png"/>
<img src="./preview/wifi.png"/>
<img src="./preview/iface.png"/>
<img src="./preview/firewall.png"/>
