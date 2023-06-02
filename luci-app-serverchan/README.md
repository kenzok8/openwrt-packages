## 简介

[![Lastest Release](https://img.shields.io/github/release/tty228/luci-app-wechatpush.svg?style=flat)](https://github.com/tty228/luci-app-wechatpush/releases)
[![GitHub All Releases](https://img.shields.io/github/downloads/tty228/luci-app-wechatpush/total)](https://github.com/tty228/luci-app-wechatpush/releases)

[中文文档](README.md) | [English](README_en.md)

这是一款用于 OpenWRT 路由器上进行 微信/Telegram 推送的插件

推送服务支持列表：

| 推送应用 | 方式 | 接口说明 |
| :-------- | :----- | :----- |
| 微信 | Server酱 | https://sct.ftqq.com/
| 微信 | 推送加 | http://www.pushplus.plus/
| 微信 | WxPusher | https://wxpusher.zjiecode.com/docs
| 企业微信 | 应用推送 | https://work.weixin.qq.com/api/doc/90000/90135/90248
| Telegram | bot | https://t.me/BotFather

精力有限，如需要钉钉推送、飞书推送、Bark 推送等请尝试另一个分支 https://github.com/zzsj0928/luci-app-pushbot ，或使用自定义 API 设置


## 主要功能

- [x] 路由 IP、IPv6 变动推送
- [x] 设备 上线、离线 推送
- [x] 设备在线列表及流量使用情况
- [x] CPU 负载、温度监视、PVE 宿主机温度监控
- [x] 路由运行状态定时推送
- [x] 路由 Web、SSH 登录提示，自动拉黑、端口敲门
- [x] 无人值守任务


## 说明

**关于安装：**

插件依赖 iputils-arping + curl + jq ，对于内存有限的路由器，请酌情安装，**在安装之前，请先运行 `opkg update` 命令，以便在安装过程中安装依赖。**

基于 X86 OpenWrt v23.05.0 制作，不同系统不同设备，可能会遇到各种问题，**如获取到错误的温度信息、页面显示错误、报错等，自行适配**

**关于主机名：**

对于设备未宣告主机名、光猫拨号上网、OpenWrt 作为旁路网关等各类情况导致的获取主机名失败，可以通过以下方式设置主机名

- 使用设备名备注
- 在高级设置处配置从光猫获取
- 开启 MAC 设备数据库


**关于设备在线状态：**

默认使用 ping/arping 来主动探测设备在线状态，以对抗 Wi-Fi 休眠机制，主动探测较为耗时但可以获得较为精准的设备在线状态

- 如遇设备休眠频繁，请在高级设置处自行调整超时设置
- 如果不需要太过精准的设备在线信息，只需要其余功能，可以在高级设置中关闭主动探测


**关于流量统计信息：**

流量统计功能依赖 wrtbwmon ，需自行选装或编译，**该插件与 Routing/NAT 、Flow Offloading 、代理上网等插件冲突，开启后将会无法获取流量，请自行选择**


**关于 bug 提交：**

提交 bug 时请尽量带上以下信息

- 设备信息及插件版本号
- 执行 `/usr/share/wechatpush/wechatpush` 后的提示信息
- 报错后的日志信息、`/tmp/wechatpush/` 目录下的文件信息
- `sh -x /usr/share/wechatpush/wechatpush t1` 的详细运行信息


## 下载

| 支持的 OpenWrt 版本 | 下载地址 |
| :-------- | :----- |
| openwrt-19.07.0 ... latest | [![Lastest Release](https://img.shields.io/github/release/tty228/luci-app-wechatpush.svg?style=flat)](https://github.com/tty228/luci-app-wechatpush/releases)
| openwrt-18.06 | [![Release v2.06.2](https://img.shields.io/badge/release-v2.06.2-lightgrey.svg)](https://github.com/tty228/luci-app-wechatpush/releases/tag/v2.06.2)


## 捐赠

如果你觉得此项目对你有帮助，请捐助我们，使项目能持续发展和更加完善。

![image](https://github.com/tty228/Python-100-Days/blob/master/res/WX.jpg)
