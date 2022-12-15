### 访问数：[![](https://visitor-badge.glitch.me/badge?page_id=sirpdboy-visitor-badge)] [![](https://img.shields.io/badge/TG群-点击加入-FFFFFF.svg)](https://t.me/joinchat/AAAAAEpRF88NfOK5vBXGBQ)

欢迎来到sirpdboy的源码仓库！
=
# Lucky(大吉)

luci-app-lucky 动态域名ddns-go服务,替代socat主要用于公网IPv6 tcp/udp转内网ipv4,http/https反向代理

[![若部分图片无法正常显示，请挂上机场浏览或点这里到末尾看修复教程](https://visitor-badge.glitch.me/badge?page_id=sirpdboy-visitor-badge)](#解决-github-网页上图片显示失败的问题) [![](https://img.shields.io/badge/TG群-点击加入-FFFFFF.svg)](https://t.me/joinchat/AAAAAEpRF88NfOK5vBXGBQ)

[luci-app-lucky Lucky(大吉)](https://github.com/sirpdboy/luci-app-lucky)
======================


请 **认真阅读完毕** 本页面，本页面包含注意事项和如何使用。

## 功能说明：

### Lucky(大吉)

#### 动态域名ddns-go服务,替代socat主要用于公网IPv6 tcp/udp转内网ipv4,http/https反向代理

#### 在LUCI中可以配置访问端口和增加是否允许外网访问设置。

<!-- TOC -->

- [lucky](#lucky)
  - [特性](#特性)
  - [使用方法](#使用方法)
  - [说明](#说明)
  - [问题](#常见问题)
  - [界面](#界面)
  - [捐助](#捐助)
 

<!-- /TOC -->

## 特性

- 目前已经实现的功能有
    - 1.替代socat,主要用于公网IPv6 tcp/udp转 内网ipv4
        - 支持界面化(web后台)管理转发规则,单条转发规则支持设置多个转发端口,一键开关指定转发规则
        - 单条规则支持黑白名单安全模式切换,白名单模式可以让没有安全验证的内网服务端口稍微安全一丢丢暴露到公网
        - Web后台支持查看最新100条日志
        - 另有精简版不带后台,支持命令行快捷设置转发规则,有利于空间有限的嵌入式设备运行.(不再提供编译版本,如有需求可以自己编译)
    - 2.动态域名服务
        - 参考和部分代码来自 https://github.com/jeessy2/ddns-go
        - 在ddns-go的基础上主要改进/增加的功能有
            - 1.同时支持接入多个不同的DNS服务商
            - 2.支持http/https/socks5代理设置
            - 3.自定义(Callback)和Webhook支持自定义headers
            - 4.支持BasicAuth
            - 5.DDNS任务列表即可了解全部信息(包含错误信息),无需单独查看日志.
            - 6.调用DNS服务商接口更新域名信息前可以先通过DNS解析域名比较IP,减少对服务商接口调用.
            - 其它细节功能自己慢慢发现...
            - 没有文档,后台各处的提示信息已经足够多.
            - 支持的DNS服务商和DDNS-GO一样,有Alidns(阿里云),百度云,Cloudflare,Dnspod(腾讯云),华为云.自定义(Callback)内置有每步,No-IP,Dynv6,Dynu模版,一键填充,仅需修改相应用户密码或者token即可快速接入.
    - 3.http/https反向代理
        - 特点
            - 设置简单
            - 支持HttpBasic认证  
            - 支持IP黑白名单
            - 支持UserAgent黑白名单
            - 日志记录最近访问情况
            - 一键开关子规则
            - 前端域名与后端地址 支持一对一,一对多(均衡负载),多对多(下一级反向代理)
    - 4.网络唤醒
        - 特点
            - 支持远程控制唤醒和关机操作
                - 远程唤醒需要 待唤醒端所在局域网内有开启中继唤醒指令的lucky唤醒客户端
                - 远程关机需要 待关机端运行有luck唤醒客户端
            - 支持接入第三方物联网平台(点灯科技 巴法云),可通过各大平台的语音助手控制设备唤醒和关机.
                - 点灯科技支持 小爱同学 小度 天猫精灵
                - 巴法云支持小爱同学 小度 天猫精灵 google语音 AmazonAlexa
            - 具备但一般用不上的功能:支持一个设备设置多组网卡mac和多个广播地址,实现批量控制设备.

## 使用方法

- 将luci-app-lucky添加至 LEDE/OpenWRT 源码的方法。

### 下载源码方法:

 ```Brach
 
    # 下载源码
	
    git clone https://github.com/sirpdboy/luci-app-lucky.git package/lucky
    make menuconfig
	
 ``` 
### 配置菜单

 ```Brach
    make menuconfig
	# 找到 LuCI -> Applications, 选择 luci-app-lucky, 保存后退出。
 ``` 
 
### 编译

 ```Brach 
    # 编译固件
    make package/lucky/luci-app-lucky/compile V=s
 ```

## 说明

- 源码来源：https://github.com/gdy666/lucky
- 源码来源：https://github.com/sirpdboy/luci-app-lucky
- 你可以随意使用其中的源码，但请注明出处。

## 常见问题

 - 不同于防火墙端口转发规则,不要设置没有用上的端口,会增加内存的使用.
 - 小米路由 ipv4 类型的80和443端口被占用,但只设置监听tcp6(ipv6)的80/443端口转发规则完全没问题.
 - 如果需要使用白名单模式,请根据自身需求打开外网访问后台管理页面开关.
 - 转发规则启用异常,端口转发没有生效时请登录后台查看日志.
 - 开启外网访问可以直接修改配置文件中的"AllowInternetaccess": false, 将false改为true


## 界面

![screenshots](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/lucky1.jpg)

![screenshots](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/lucky2.jpg)

![screenshots](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/lucky3.jpg)


# My other project

网络速度测试 ：https://github.com/sirpdboy/NetSpeedTest

定时设置插件 : https://github.com/sirpdboy/luci-app-autotimeset

关机功能插件 : https://github.com/sirpdboy/luci-app-poweroffdevice

opentopd主题 : https://github.com/sirpdboy/luci-theme-opentopd

opentoks 主题: https://github.com/sirpdboy/luci-theme-opentoks [仿KOOLSAHRE主题]

btmob 主题: https://github.com/sirpdboy/luci-theme-btmob

系统高级设置 : https://github.com/sirpdboy/luci-app-advanced

DDNS-GO动态域名: https://github.com/sirpdboy/luci-app-DDNS-GO

Lucky(大吉): https://github.com/sirpdboy/luci-app-lucky 


## 捐助

-如果你觉得此项目对你有帮助，请捐助我们，以使项目能持续发展，更加完善。··请作者喝杯咖啡~~~**
-你们的支持就是我的动力！**

|     <img src="https://img.shields.io/badge/-支付宝-F5F5F5.svg" href="#赞助支持本项目-" height="25" alt="图飞了😂"/>  |  <img src="https://img.shields.io/badge/-微信-F5F5F5.svg" height="25" alt="图飞了😂" href="#赞助支持本项目-"/>  | 
| :-----------------: | :-------------: |
|![xm1](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/支付宝.png) | ![xm1](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/微信.png) |

<a href="#readme">
    <img src="https://img.shields.io/badge/-返回顶部-orange.svg" alt="图飞了😂" title="返回顶部" align="right"/>
</a>

