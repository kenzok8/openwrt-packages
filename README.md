![Anurag's GitHub stats](https://github-readme-stats.vercel.app/api?username=kenzok8&show_icons=true&theme=radical)
<div align="center">
<h1 align="center"openwrt-packages</h1>
<img src="https://img.shields.io/github/issues/kenzok8/openwrt-packages?color=green">
<img src="https://img.shields.io/github/stars/kenzok8/openwrt-packages?color=yellow">
<img src="https://img.shields.io/github/forks/kenzok8/openwrt-packages?color=orange">
<img src="https://img.shields.io/github/license/kenzok8/openwrt-packages?color=ff69b4">
<img src="https://img.shields.io/github/languages/code-size/kenzok8/openwrt-packages?color=blueviolet">
</div>

<img src="https://v2.jinrishici.com/one.svg?font-size=24&spacing=2&color=Black">

#### 说明 

<br>中文 | [English](README_en.md)

* 喜欢追新的可以去下载small-package，该仓库每天自动同步更新

* [small-package仓库地址](https://github.com/kenzok8/small-package) 

* 软件不定期同步大神库更新，适合一键下载用于openwrt编译


##### 插件每日更新下载:
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/kenzok8/compile-package?style=for-the-badge&label=插件更新下载)](https://github.com/kenzok8/compile-package/releases/latest)

+ [passwall依赖](https://github.com/kenzok8/small)

+ [xiaorouji仓库](https://github.com/xiaorouji/openwrt-passwall)

+ 谢谢 **kiddin9珠玉在前**[openwrt固件与插件下载](https://op.dllkids.xyz/op/firmware/)

#### 使用
一键命令
```yaml
sed -i '$a src-git kenzo https://github.com/kenzok8/openwrt-packages' feeds.conf.default
sed -i '$a src-git small https://github.com/kenzok8/small' feeds.conf.default
git pull
./scripts/feeds update -a
./scripts/feeds install -a
make menuconfig
```

- openwrt 固件编译自定义主题与软件

| 软件名                       | 说明                   | 中文说明    |
| -----------------------------|------------------------| ------------|
| luci-app-vssr                | vssr proxy                 | vssr老竭力代理软件        |
| luci-app-dnsfilter           | dns ad filtering            | 基于DNS的广告过滤        |
| luci-app-openclash           | openclash proxy            |  clash的图形代理软件      |
| luci-app-advanced            | System advanced settings               | 系统高级设置        |
| luci-app-pushbot             | WeChat/DingTalk Pushed plugins    |   微信/钉钉推送        |
| luci-theme-atmaterial_new    | atmaterial theme (adapted to luci-18.06) | Atmaterial 三合一主题        |
| luci-app-aliddns             | aliyunddns         |   阿里云ddns插件      |
| luci-app-eqos                | Speed ​​limit by IP address       | 依IP地址限速      |
| luci-app-gost                | https proxy      | 隐蔽的https代理   |
| luci-app-adguardhome         | Block ads          |  AdG去广告      |
| luci-app-smartdns            | smartdns dns pollution prevention     |  smartdns DNS防污染       |
| luci-app-passwall            | passwall proxy      | passwall代理软件        |
| luci-theme-argonne           | argonne theme           | 修改老竭力主题名     |
| luci-app-argonne-config      | argonne theme settings            |  argonne主题设置      |
| luci-app-ssr-plus            | ssr-plus proxy              | ssr-plus 代理软件       |
| luci-theme-mcat              | Modify topic name          |   mcat主题        |
| luci-theme-tomato            | Modify topic name             |  tomato主题        |
| luci-theme-neobird           | neobird theme          | neobird主题        |
| luci-app-mosdns              | moddns dns offload            |DNS 国内外分流解析与广告过滤        |
| luci-app-store               | store software repository            |  应用商店   |
| luci-app-unblockneteasemusic | Unlock NetEase Cloud Music         | 解锁网易云音乐   |
| luci-app-gpsysupgrade        | kiddin9 custom firmware upgrade plugin           |kiddin9自定义固件升级 |
| luci-app-aliyundrive-webdav  | Aliyun Disk WebDAV Service            |  阿里云盘 WebDAV 服务   |

* 修改argon为argonne，包括argonne-config，为防止同名argon，而影响编译

![暗黄主题](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/sshot-9.jpg)
![暗黄主题](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/sshot-10.jpg)
![暗黄主题](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/sshot-11.jpg)
![暗黑红主题](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/sshot-5.jpg)
![暗黑红主题](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/sshot-6.jpg)
![暗黑红主题](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/sshot-7.jpg)
![暗黑红主题](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/sshot-8.jpg)
![抹茶绿主题](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/sshot-12.jpg)
![抹茶绿主题](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/sshot-13.jpg)
![抹茶绿主题](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/sshot-14.jpg)
![argon主题](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/sshot-1.png)
![argon主题](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/sshot-2.png)
![修复tomto不能修改主机名的bug](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/%E5%B0%8F%E7%8C%AA%E5%AE%B6-719.png)
![修复tomto不能修改主机名的bug](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/%E5%B0%8F%E7%8C%AA%E5%AE%B6-722.png)
![修复cat不能修改主机名的bug](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/%E5%B0%8F%E7%8C%AA%E5%AE%B6-720.png)
![修复cat不能修改主机名的bug](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/%E5%B0%8F%E7%8C%AA%E5%AE%B6-721.png)

