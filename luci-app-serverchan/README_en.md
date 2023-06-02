# Introduction

[![Lastest Release](https://img.shields.io/github/release/tty228/luci-app-wechatpush.svg?style=flat)](https://github.com/tty228/luci-app-wechatpush/releases)
[![GitHub All Releases](https://img.shields.io/github/downloads/tty228/luci-app-wechatpush/total)](https://github.com/tty228/luci-app-wechatpush/releases)

[中文文档](README.md) | [English](README_en.md)

A plugin for OpenWRT routers to push various information to a mobile phone via WeChat or Telegram.
Supported services:
| Push application | Method | description |
| :-------- | :----- | :----- |
| WeChat | Server Chan | https://sct.ftqq.com/
| WeChat | PushPlus | http://www.pushplus.plus/
| WeChat | WxPusher | https://wxpusher.zjiecode.com/docs
| WeChat for Enterprise | Application Push | https://work.weixin.qq.com/api/doc/90000/90135/90248
| Telegram | bot | https://t.me/BotFather

Limited resources are available. If you need services such as DingTalk push, Feishu push, Bark push, etc., please try another branch at https://github.com/zzsj0928/luci-app-pushbot, or use custom API settings.

## Main Features

- [x] Push notifications for changes in router IP and IPv6.
- [x] Push notifications for device online/offline status.
- [x] Device online list and traffic usage.
- [x] CPU load and temperature monitoring, PVE host temperature monitoring.
- [x] Periodic push notifications for router status.
- [x] Web and SSH login prompts for the router, automatic blacklist and port knocking.
- [x] Unattended tasks.

## Instructions

**Regarding Installation:**

The plugin requires dependencies on iputils-arping + curl + jq. For routers with limited memory, please consider the installation carefully. **Before installing, please run the opkg update command to install dependencies during the installation process.**

Developed based on X86 OpenWrt v23.05.0, different systems and devices may encounter various issues. **If you encounter errors in temperature information retrieval, display errors, or other issues, please adapt accordingly.**

**Regarding Hostnames:**

For devices that do not declare hostnames, devices connected via optical modem dial-up, OpenWrt used as a bypass gateway, and other scenarios where hostname retrieval fails, you can set the hostname using the following methods:

- Use device name remarks.
- Configure to obtain the hostname from the optical modem in advanced settings.
- Enable MAC device database.


**Regarding Device Online Status:**

By default, ping/arping is used to actively detect device online status to counter Wi-Fi sleep mechanism. Active detection takes more time but provides more accurate device online status.

- If devices frequently go into sleep mode, please adjust the timeout settings in advanced settings.
- If you don't require highly precise device online information and only need other features, you can disable active detection in advanced settings.


**Regarding Traffic Statistics:**

Traffic statistics functionality depends on `wrtbwmon`. Please install or compile it yourself. **Enabling this plugin will conflict with Routing/NAT, Flow Offloading, proxy internet access, and other plugins, resulting in the inability to obtain traffic statistics. Please choose accordingly.**


**Regarding Bug Submissions:**

When submitting a bug, please provide the following information if possible:

- Device information and plugin version number.
- Prompt information after executing `/usr/share/wechatpush/wechatpush`.
- Log information and file information in the `/tmp/wechatpush/` directory after encountering an error.
- Detailed execution information of `sh -x /usr/share/wechatpush/wechatpush t1`.

## DownLoad

| Supported OpenWrt Versions | Download Link |
| :-------- | :----- |
| openwrt-19.07.0 ... latest | [![Lastest Release](https://img.shields.io/github/release/tty228/luci-app-wechatpush.svg?style=flat)](https://github.com/tty228/luci-app-wechatpush/releases)
| openwrt-18.06 | [![Release v2.06.2](https://img.shields.io/badge/release-v2.06.2-lightgrey.svg)](https://github.com/tty228/luci-app-wechatpush/releases/tag/v2.06.2)

## Donate

If you feel that this project is helpful to you, please donate to us so that the project can continue to develop and be more perfect.

![image](https://github.com/tty228/Python-100-Days/blob/master/res/WX.jpg)

