# Introduction

[![Lastest Release](https://img.shields.io/github/release/tty228/luci-app-wechatpush.svg?style=flat)](https://github.com/tty228/luci-app-wechatpush/releases)
[![GitHub All Releases](https://img.shields.io/github/downloads/tty228/luci-app-wechatpush/total)](https://github.com/tty228/luci-app-wechatpush/releases)

[中文文档](README.md) | [English](README_en.md)

- A tool that can push device messages from OpenWrt to a mobile phone via WeChat or Telegram.
- Supported services:
- WeChat: Server Chan                       https://sct.ftqq.com/
- WeChat for Enterprise: Application Push   https://work.weixin.qq.com/api/doc/90000/90135/90248
- WeChat: WxPusher                          https://wxpusher.zjiecode.com/docs
- WeChat: PushPlus                          http://www.pushplus.plus/
- Telegram bot                              https://t.me/BotFather
- Due to limited resources, if you need DingTalk push, Feishu push, Bark push, etc., please try https://github.com/zzsj0928/luci-app-pushbot.
- Dependencies: iputils-arping + curl + jq commands. Before installing, please run opkg update. Be cautious when installing on routers with limited memory.

## Main Features

- Push notifications for changes in router IP and IPv6.
- Push notifications for device online/offline status.
- Device online list and traffic usage.
- CPU load and temperature monitoring, PVE host temperature monitoring.
- Periodic push notifications for router status.
- Web and SSH login prompts for the router, automatic blacklist and port knocking.
- Unattended tasks.

## Known Issues

- Developed based on X86 OpenWrt v23.05.0 Different systems and devices may encounter various problems. If you encounter errors in temperature information retrieval, display errors, or other issues, please adapt accordingly.
- Some devices may not have device names available. The script uses the `cat /tmp/dhcp.leases` command to read device names. If the device name is not present in DHCP (e.g., for relay router devices, devices with static IP, or when OpenWrt is used as a bypass gateway), the device name cannot be read. Please use device name remarks or configure to obtain it from the optical modem in advanced settings.
- Device online status is detected using active device connection probing to avoid Wi-Fi sleep mechanism. Active probing takes time. If devices frequently go into sleep mode, please adjust the timeout settings accordingly.
- Traffic statistics functionality depends on wrtbwmon. Install or compile it yourself. This plugin conflicts with Routing/NAT, Flow Offloading, and other plugins. Enabling them will result in no traffic statistics. Please choose accordingly.

## PS

- When submitting a bug, please provide device information, logs, descriptions such as the output and log information after executing `/usr/share/wechatpush/wechatpush`, and file information in the `/tmp/wechatpush/` directory. Please also include detailed execution information of `sh -x /usr/share/wechatpush/wechatpush t1`.

## DownLoad

* `openwrt-19.07.0 ... latest`: [release-v2.06.2](https://github.com/tty228/luci-app-wechatpush/releases/tag/v2.06.2)
* `openwrt-18.06`: [release-v2.06.2](https://github.com/tty228/luci-app-wechatpush/releases/tag/v2.06.2)

## Donate

If you feel that this project is helpful to you, please donate to us so that the project can continue to develop and be more perfect.

![image](https://github.com/tty228/Python-100-Days/blob/master/res/WX.jpg)

