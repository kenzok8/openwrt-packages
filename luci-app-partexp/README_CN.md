![hello](https://views.whatilearened.today/views/github/sirpdboy/deplives.svg) [![](https://img.shields.io/badge/TG群-点击加入-FFFFFF.svg)](https://t.me/joinchat/AAAAAEpRF88NfOK5vBXGBQ)

<h1 align="center">
  <br>Partexp<br>
</h1>

  <p align="center">

  <a target="_blank" href="https://github.com/sirpdboy/luci-app-partexp/releases">
    <img src="https://img.shields.io/github/release/sirpdboy/luci-app-partexp.svg?style=flat-square&label=partexp&colorB=green">
  </a>
</p>

[中文] | [English](README.md) 

![screenshots](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/说明1.jpg)


[luci-app-partexp](https://github.com/sirpdboy/luci-app-partexp) 一键自动格式化分区、扩容、自动挂载插件


请 **认真阅读完毕** 本页面，本页面包含注意事项和如何使用。

## 功能说明：


#### 一键自动格式化分区、扩容、自动挂载插件，专为OPENWRT设计，简化OPENWRT在分区挂载上烦锁的操作。本插件是sirpdboy耗费大量精力制作测试，请勿删除制作者信息！！

<!-- TOC -->

- [partexp](#luci-app-partexp)
  - [特性](#特性)
  - [使用方法](#使用方法)
  - [说明](#说明)
  - [界面](#界面)
  - [捐助](#捐助)

<!-- /TOC -->

## 版本

- 最新更新版本号： V1.3.1
- 更新日期：2025年3月26日
- 更新内容：
- 重新整理分区扩容代码，解决一些不合理的地方。
- 加入对目标分区的格式，可以指定格式化为ext4,ntfs和Btrfs以及不格式化。
- 当做为根目录 /或者 /overlay时，密然会格式化为ext4格式。
- 目前在X86的机器上测试完全正常，其它路由设备上未测试。有问题请提交硬盘分区情况和错误提示。

 
## 特性
 luci-app-partexp 自动获格式化分区扩容，自动挂载插件

## 使用方法

- 将luci-app-partexp添加至 LEDE/OpenWRT 源码的方法。

### 下载源码方法：

 ```Brach
 
    # 下载源码
	
    git clone https://github.com/sirpdboy/luci-app-partexp.git package/luci-app-partexp
    make menuconfig
	
 ``` 
### 配置菜单

 ```Brach
    make menuconfig
	# 找到 LuCI -> Applications, 选择 luci-app-partexp, 保存后退出。
 ``` 
 
### 编译

 ```Brach 
    # 编译固件
    make package/luci-app-partexp/compile V=s
 ```

## 说明

![screenshots](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/说明2.jpg)

## 界面

![screenshots](./doc/partexp1.png)

![screenshots](./doc/partexp2.png)



## 使用与授权相关说明
 
- 本人开源的所有源码，任何引用需注明本处出处，如需修改二次发布必告之本人，未经许可不得做于任何商用用途。




# My other project

- 路由安全看门狗 ：https://github.com/sirpdboy/luci-app-watchdog
- 网络速度测试 ：https://github.com/sirpdboy/luci-app-netspeedtest
- 计划任务插件（原定时设置） : https://github.com/sirpdboy/luci-app-taskplan
- 关机功能插件 : https://github.com/sirpdboy/luci-app-poweroffdevice
- opentopd主题 : https://github.com/sirpdboy/luci-theme-opentopd
- kucat酷猫主题: https://github.com/sirpdboy/luci-theme-kucat
- kucat酷猫主题设置工具: https://github.com/sirpdboy/luci-app-kucat-config
- NFT版上网时间控制插件: https://github.com/sirpdboy/luci-app-timecontrol
- 家长控制: https://github.com/sirpdboy/luci-theme-parentcontrol
- 定时限速: https://github.com/sirpdboy/luci-app-eqosplus
- 系统高级设置 : https://github.com/sirpdboy/luci-app-advanced
- ddns-go动态域名: https://github.com/sirpdboy/luci-app-ddns-go
- 进阶设置（系统高级设置+主题设置kucat/agron/opentopd）: https://github.com/sirpdboy/luci-app-advancedplus
- 网络设置向导: https://github.com/sirpdboy/luci-app-netwizard
- 一键分区扩容: https://github.com/sirpdboy/luci-app-partexp
- lukcy大吉: https://github.com/sirpdboy/luci-app-lukcy

## 捐助

![screenshots](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/说明3.jpg)

|     <img src="https://img.shields.io/badge/-支付宝-F5F5F5.svg" href="#赞助支持本项目-" height="25" alt="图飞了"/>  |  <img src="https://img.shields.io/badge/-微信-F5F5F5.svg" height="25" alt="图飞了" href="#赞助支持本项目-"/>  | 
| :-----------------: | :-------------: |
|![xm1](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/支付宝.png) | ![xm1](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/微信.png) |

<a href="#readme">
    <img src="https://img.shields.io/badge/-返回顶部-orange.svg" alt="图飞了" title="返回顶部" align="right"/>
</a>

![](https://visitor-badge-deno.deno.dev/sirpdboy.sirpdboy.svg)  [![](https://img.shields.io/badge/TG群-点击加入-FFFFFF.svg)](https://t.me/joinchat/AAAAAEpRF88NfOK5vBXGBQ)

