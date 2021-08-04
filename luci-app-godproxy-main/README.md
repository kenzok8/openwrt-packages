## 更新：2021年3月23日：
感谢 [maple's sky](https://github.com/maplesky) 大佬提供技术支持，修复状态栏不动态问题。

## 更新：2021年3月4日：
感谢 [xiaoqi2020](https://github.com/xiaoqi2020) 提供，选择规则托管国内。

## 更新：2021年2月26日（元宵）：
原来的码云以及coding规则已经无法获取（被封）了。现在托管在github上。

## 更名声明：
原ledeproxy，于2021年1月23日更名为 GodProxy。特此知晓，以前的规则更新链接会失效！

## 整理声明：
GodProxy是基于koolproxyR Plus+重新整理而来。主要参考：

1、以前Ameykyl大神的 [KoolProxyR Plus+](https://github.com/Ameykyl/luci-app-koolproxyR) (源码已经2020年4月删除）。源码来源于 [project-openwrt](https://github.com/project-openwrt/luci-app-koolproxyR) 收录的ameykyl的2020年3月最后一次更新。 

2、新的目录来源 [Beginner-Go](https://github.com/Beginner-Go/luci-app-koolproxyR)  

3、感谢koolproxy官方组、shaoxia、Ameykyl、immortalwrt组、Beginner-Go等的无私奉献！

4、规则来源于 [GodProxy](https://github.com/godros/GodProxy) 。

## 本来是完全没有必要再造一个的，因为浪费时间。但各位大神都好久没有更新了，有些规则更新需要翻墙，有些名字是KP，有些是KPR，KPR Plus，KPR Plus+。所以没有办法，只能暂且叫GodProxy。望理解！


## 免责声明：
KoolProxy 是一个免费软件，著作权归属 KoolProxy.com，用户可以非商业性地复制和使用 KoolProxy，但禁止将 KoolProxy 用于商业用途。
KoolProxy 可以对 https 网络数据进行识别代理，使用 https 功能的用户需要自己提供相关证书，本程序提供的证书生成脚本仅供用户参考，证书的保密工作由用户自行负责。
使用本软件的风险由用户自行承担，在适用法律允许的最大范围内，对因使用本产品所产生的损害及风险，包括但不限于直接或间接的个人损害、商业赢利的丧失、贸易中断、商业信息的丢失或任何其它经济损失，KoolProxy.com 不承担任何责任。

## 1、前言
感謝 koolshare.cn 提供 KoolProxy, 使用风险由用户自行承担
本程序运行需要联网下载最新的 KoolProxy 到内存中运行, 也正因此本程序大小可以忽略不计.为了区分，暂且更名为：GodProxy

## 2、简介
本软件包是 KoolProxy 的 LuCI 控制界面,

## 3、软件包文件结构:
 省

## 4、依赖
软件包的正常使用需要依赖 curl, dnsmasq-full, iptables, ipset 和 dnsmasq-extra, openssl-util, diffutils, iptables-mod-nat-extra, wget, ca-bundle, ca-certificates, libustream-openssl

手动安装：在终端运行：
opkg install openssl-util ipset dnsmasq-full diffutils iptables-mod-nat-extra wget ca-bundle ca-certificates libustream-openssl

如果没有 openssl ，就不能正常生成证书，导致https过滤失败！

如果没有 ipset, dnsmasq-full, diffutils，黑名单模式也会出现问题！（ipset 需要版本6）,如果你的固件的busybox带有支持diff支持，那么diffutils包可以不安装

如果没有 iptables-mod-nat-extra ，会导致mac过滤失效！

如果没有 wget, ca-bundle, ca-certificates, libustream-openssl，lua-openssl，会导致规则文件更新失败，host规则条数变为0,如果你的固件的busybox带有支持https的wget，那么这几个包可以不安装。


懒人版本，在.config文件里添加如下代码：

#koolproxy支持

CONFIG_PACKAGE_iptables-mod-nat-extra=y

CONFIG_PACKAGE_kmod-ipt-extra=y

CONFIG_PACKAGE_diffutils=y

CONFIG_PACKAGE_openssl-util=y

CONFIG_PACKAGE_dnsmasq-full=y

CONFIG_PACKAGE_ca-bundle=y

CONFIG_PACKAGE_ca-certificates=y

CONFIG_PACKAGE_libustream-openssl=y

CONFIG_PACKAGE_lua-openssl=y


## 5、配置, 
软件包的配置文件路径: /etc/config/koolproxy
此文件为 UCI 配置文件, 配置方式可参考 Wiki -> Use-UCI-system 和 OpenWrt Wiki

## 6、编译
git clone https://github.com/godros/luci-app-godproxy.git package/luci-app-godproxy

make && sudo make install

选择要编译的包 LuCI -> 3. Applications 

make menuconfig

开始编译

make package/feeds/luci-app-godproxy/compile V=s

# 7、关于IPv6支持(基于透明代理一刀切)
需要在防火墙添加一条规则：

ip6tables -t nat -I PREROUTING -p tcp -j REDIRECT --to-ports 3000

```
#已知副作用:
#一刀切劫持内网所以设备的IPv6 TCP流量.
#无法使用IPv6建立主动传入连接.
#如果未安装证书,打开启用HTTPS的网站会报错.
```

**NOTE:**

如果出现国外流量无法去广告(IPv4),请修改所使用代理的防火墙规则,必须让KP的规则在代理规则之上,检测命令:

``` bash
iptables -t nat -L PREROUTING
```

观察**KOOLPROXY**规则是否在所使用的代理的规则之上.

### 8、内置规则列表

[静态规则]   [每日规则]   [视频规则]   [ipse]   [adblock]

### 9、第三方规则（已做了转换，koolproxy能识别，不要用乘风大神的通用规则，会导致koolproxy停止运行）

[ABP规则]
（ABP规则是CJX's Annoyance List+China+EasyList的二合一规则） 注：CJX's Annoyance List (反自我推广,移除anti adblock,防跟踪规则列表)是"EasyList China+EasyList" & "EasyPrivacy"的补充）

[Yhosts规则]

[Fanboy规则]

[AntiAD规则]

[乘风视频]

### 10、订阅规则（user1121114685大神和某位大神（忘记名字了）整合而成，能过滤youtube等）

[订阅规则]

### 首次运行koolproxy的时候，保存并提交速度较慢，因为会生成证书。
