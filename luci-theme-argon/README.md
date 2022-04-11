<div align="center">
  <img src="https://raw.githubusercontent.com/jerrykuku/staff/master/argon_title2.png"  >
  <h1 align="center">
    A new LuCI theme for OpenWrt
  </h1>
    <h3 align="center">
    Argon is a clean HTML5 theme for LuCI. Users may<br>setup their own favorite logins, including beautiful<br>pics and customized mp4 videos.<br><br>
  </h3>
<a href="/LICENSE">
    <img src="https://img.shields.io/github/license/jerrykuku/luci-theme-argon?style=flat-square&a=1" alt="">
  </a>
  <a href="https://github.com/jerrykuku/luci-theme-argon/pulls">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="">
  </a><a href="https://github.com/jerrykuku/luci-theme-argon/issues/new">
    <img src="https://img.shields.io/badge/Issues-welcome-brightgreen.svg?style=flat-square">
  </a><a href="https://github.com/jerrykuku/luci-theme-argon/releases">
    <img src="https://img.shields.io/github/release/jerrykuku/luci-theme-argon.svg?style=flat-square">
  </a><a href="hhttps://github.com/jerrykuku/luci-theme-argon/releases">
    <img src="https://img.shields.io/github/downloads/jerrykuku/luci-theme-argon/total?style=flat-square">
  </a><a href="https://t.me/jerryk6">
    <img src="https://img.shields.io/badge/Contact-telegram-blue?style=flat-square">
  </a> 
</div>
<br>
<div align="center">
  <img src="https://raw.githubusercontent.com/jerrykuku/staff/master/argon2.gif">
</div>

<br>English | [简体中文](README_ZH.md)

## Notice 
It is strongly recommended to use the Chrome browser. Some new css3 features are used in the theme, and currently only Chrome has the best compatibility.
The mainline version of IE series currently has bugs to be resolved.
FireFox does not enable the backdrop-filter by default, see here for the opening method: https://developer.mozilla.org/zh-CN/docs/Web/CSS/backdrop-filter

v2.x.x Adapt to official mainline snapshot.  
You can checkout branch 18.06 for OpenWRT 18.06 or lean 19.07.

## Update Log 2021.10.16 v2.2.9

- 【v2.2.9】Fix the problem that the menu could not pop up in mobile mode  
- 【v2.2.9】Unify the settings of css spacing  
- 【v2.2.9】Refactored the code of the login page  
- 【v2.2.8】Fix the problem that the Minify Css option is turned on when compiling, which causes the frosted glass effect to be invalid and the logo font is lost.  
- 【v2.2.5】New config app for argon theme. You can set the blur and transparency of the login page of argon theme, and manage the background pictures and videos.[Chrome is recommended] [Download](https://github.com/jerrykuku/luci-app-argon-config/releases/download/v0.8-beta/luci-app-argon-config_0.8-beta_all.ipk)
- 【v2.2.5】Automatically set as the default theme when compiling.
- 【v2.2.5】Modify the file structure to adapt to luci-app-argon-config. The old method of turning on dark mode is no longer applicable, please use it with luci-app-argon-config.
- 【v2.2.5】Adapt to Koolshare lede 2.3.6。
- 【v2.2.5】Fix some Bug。
- 【v2.2.4】Fix the problem that the login background cannot be displayed on some phones.
- 【v2.2.4】Remove the dependency of luasocket.
- 【v2.2.3】Fix Firmware flash page display error in dark mode.
- 【v2.2.3】Update font icon, add a default icon of undefined menu.
- 【v2.2.2】Add custom login background,put your image (allow png jpg gif) or MP4 video into /www/luci-static/argon/background, random change.
- 【v2.2.2】Add force dark mode, login ssh and type "touch /etc/dark" to open dark mode.
- 【v2.2.2】Add a volume mute button for video background, default is muted.
- 【v2.2.2】fix login page when keyboard show the bottom text overlay the button on mobile.
- 【v2.2.2】fix select color in dark mode,and add a style for scrollbar.
- 【v2.2.2】jquery update to v3.5.1.
- 【v2.2.2】change request bing api method form wget to luasocket (DEPENDS).
- 【v2.2.1】Add blur effect for login form.
- 【v2.2.1】New login theme, Request background imge from bing.com, Auto change everyday.
- 【v2.2.1】New theme icon.
- 【v2.2.1】Add more menu category  icon.
- 【v2.2.1】Fix font-size and padding margin.
- 【v2.2.1】Restructure css file.
- 【v2.2.1】Auto adapt to dark mode.

## How to build

Enter in your openwrt/package/lean or other

### Lean lede

```
cd lede/package/lean  
rm -rf luci-theme-argon  
git clone -b 18.06 https://github.com/jerrykuku/luci-theme-argon.git  
make menuconfig #choose LUCI->Theme->Luci-theme-argon  
make -j1 V=s  
```

### Openwrt official SnapShots

```
cd openwrt/package
git clone https://github.com/jerrykuku/luci-theme-argon.git  
make menuconfig #choose LUCI->Theme->Luci-theme-argon  
make -j1 V=s  
```

## How to Install 

### For Lean openwrt 18.06 LuCI

```
wget --no-check-certificate https://github.com/jerrykuku/luci-theme-argon/releases/download/v1.7.0/luci-theme-argon_1.7.0-20200909_all.ipk
opkg install luci-theme-argon*.ipk
```

### For openwrt official 19.07 Snapshots LuCI master

```
opkg install luci-compat
wget --no-check-certificate https://github.com/jerrykuku/luci-theme-argon/releases/download/v2.2.5/luci-theme-argon_2.2.5-20200914_all.ipk
opkg install luci-theme-argon*.ipk
```
![](/Screenshots/screenshot_pc.jpg)
![](/Screenshots/screenshot_phone.jpg)

## Thanks to

luci-theme-material: https://github.com/LuttyYang/luci-theme-material/
