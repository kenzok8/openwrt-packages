<div align="center">
  <img src="https://raw.githubusercontent.com/jerrykuku/staff/master/argon_title2.png"  >
  <h1 align="center">
   全新的 Openwrt 主题
  </h1>
    <h3 align="center">
    Argon 是一个干净整洁的Openwrt主题，用户可以自定义登录界面，<br>包含图片或者视频，同时支持深色浅色的自动与手动切换
  </h3>

  <a href="/LICENSE">
    <img src="https://img.shields.io/github/license/jerrykuku/luci-theme-argon?style=flat-square&a=1" alt="">
  </a><a href="https://github.com/jerrykuku/luci-theme-argon/pulls">
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

![](/Screenshots/screenshot_pc.jpg)
![](/Screenshots/screenshot_phone.jpg)


## 注意

强烈建议使用Chrome 浏览器。主题中使用了一些新的css3特性，目前只有Chrome有最佳的兼容性。
主线版本 IE 系列目前还有Bug有待解决。
FireFox 默认不开启backdrop-filter，开启方法见这里：https://developer.mozilla.org/zh-CN/docs/Web/CSS/backdrop-filter
当前master版本基于官方 OpenWrt 19.07.1  稳定版固件进行移植适配。  
v2.x.x 适配主线快照版本。  
v1.x.x 适配18.06 和 Lean Openwrt [如果你是lean代码 请选择这个版本]

## 更新日志 2023.04.03 v2.3

- 【v2.3】更新了Loading的样式
- 【v2.3】修复了大量的CSS样式错误，整体更加统一
- 【v2.3】修复了暗色模式下个别颜色不受控制的问题
- 【v2.2.9】修复了在手机模式下无法弹出菜单的bug  
- 【v2.2.9】统一css间距的设置  
- 【v2.2.9】重构了登录页面的代码  
- 【v2.2.9】为导航菜单添加滑动效果  
- 【v2.2.8】修复编译时打开Minify Css选项，导致磨砂玻璃效果无效，logo字体丢失的问题  
- 【v2.2.5】全新的设置app.你可以设置argon 主题的登录页面的模糊和透明度，并管理背景图片与视频。[建议使用 Chrome][点击下载](https://github.com/jerrykuku/luci-app-argon-config/releases/download/v0.8-beta/luci-app-argon-config_0.8-beta_all.ipk)
- 【v2.2.5】当编译固件时，将自动设置为默认主题。
- 【v2.2.5】修改文件结构，以适应luci-app-argon-config，旧的开启暗色模式方法将不再适用，请搭配luci-app-argon-config使用。
- 【v2.2.5】适配Koolshare lede 2.3.6。
- 【v2.2.5】修复了一些Bug。
- 【v2.2.4】修复了在某些手机下图片背景第一次加载不能显示的问题。
- 【v2.2.4】取消 luasocket 的依赖，无需再担心依赖问题。
- 【v2.2.3】修正了在暗色模式下，固件刷写弹窗内的显示错误。
- 【v2.2.3】更新了图标库，为未定义的菜单增加了一个默认的图标。
- 【v2.2.2】背景文件策略调整为，同时接受 jpg png gif mp4, 自行上传文件至 /www/luci-static/argon/background 图片和视频同时随机。
- 【v2.2.2】增加强制暗色模式，进入ssh 输入 "touch /etc/dark" 进行开启。
- 【v2.2.2】视频背景加了一个音量开关，喜欢带声音的可以自行点击开启，默认为静音模式。
- 【v2.2.2】修复了手机模式下，登录页面出现键盘时，文字覆盖按钮的问题。
- 【v2.2.2】修正了暗黑模式下下拉选项的背景颜色，同时修改了滚动条的样式。
- 【v2.2.2】jquery 更新到 v3.5.1。
- 【v2.2.2】获取Bing Api 的方法从wget 更新到luasocket 并添加依赖。
- 【v2.2.1】登录背景添加毛玻璃效果。
- 【v2.2.1】全新的登录界面,图片背景跟随Bing.com，每天自动切换。
- 【v2.2.1】全新的主题icon。
- 【v2.2.1】增加多个导航icon。
- 【v2.2.1】细致的微调了 字号大小边距等等。
- 【v2.2.1】重构了css文件。
- 【v2.2.1】自动适应的暗黑模式。

## 如何编译

进入 openwrt/package/lean  或者其他目录

### Lean源码

```
cd lede/package/lean  
rm -rf luci-theme-argon  
git clone -b 18.06 https://github.com/jerrykuku/luci-theme-argon.git  
make menuconfig #choose LUCI->Theme->Luci-theme-argon  
make -j1 V=s  
```

### Openwrt 官方源码

```
cd openwrt/package
git clone https://github.com/jerrykuku/luci-theme-argon.git  
make menuconfig #choose LUCI->Theme->Luci-theme-argon  
make -j1 V=s  
```

## 如何安装

### Lean源码

```
wget --no-check-certificate https://github.com/jerrykuku/luci-theme-argon/releases/download/v1.7.0/luci-theme-argon_1.7.0-20200909_all.ipk
opkg install luci-theme-argon*.ipk
```

### For openwrt official 19.07 Snapshots LuCI master 

```
wget --no-check-certificate https://github.com/jerrykuku/luci-theme-argon/releases/download/v2.2.5/luci-theme-argon_2.2.5-20200914_all.ipk
opkg install luci-theme-argon*.ipk
```

## 感谢

luci-theme-material: https://github.com/LuttyYang/luci-theme-material/
