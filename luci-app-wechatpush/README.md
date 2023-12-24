# 简介
- 用于 OpenWRT 路由器上进行 微信/Telegram 推送的插件
- 支持列表：
- 微信推送/Server酱    https://sct.ftqq.com/
- 企业微信/应用推送    https://work.weixin.qq.com/api/doc/90000/90135/90248
- 微信推送/WxPusher    https://wxpusher.zjiecode.com/docs
- 微信推送/推送加      http://www.pushplus.plus/
- Telegram/BotFather  https://t.me/BotFather
- 精力有限，如需要钉钉推送、飞书推送、Bark推送等请尝试 https://github.com/zzsj0928/luci-app-pushbot
- 依赖 iputils-arping + curl + jq 命令，安装前请 `opkg update`，小内存路由谨慎安装


#### 主要功能
- 路由 IP、IPv6 变动推送
- 设备 上线、离线 推送
- 设备在线列表及流量使用情况
- CPU 负载、温度监视、PVE 宿主机温度监控
- 路由运行状态定时推送
- 路由 Web、SSH 登录提示，自动拉黑、端口敲门
- 无人值守任务

#### 已知问题
- 基于 X86 OpenWrt v19.07.10 制作，不同系统不同设备，可能会遇到各种问题，**如获取到错误的温度信息、页面显示错误、报错等，自行适配**
- 部分设备无法读取到设备名，脚本使用 `cat /tmp/dhcp.leases` 命令读取设备名，**如果 DHCP 中不存在设备名，则无法读取设备名**（如二级路由设备、静态IP设备、OpenWrt 作为旁路网关等情况），请使用设备名备注，或在高级设置处设置从光猫获取
- 使用主动探测设备连接的方式检测设备在线状态，以避免 Wi-Fi 休眠机制，主动探测较为耗时，**如遇设备休眠频繁，请自行调整超时设置**
- 流量统计功能依赖 wrtbwmon ，自行选装或编译，**该插件与 Routing/NAT 、Flow Offloading 冲突，开启无法获取流量，自行选择**

#### PS
- 新功能看情况开发，忙得头晕眼花
- 欢迎各种代码提交
- 审美无能，推送样式将就用吧
- 提交bug时请尽量带上设备信息，日志与描述如执行 /usr/share/serverchan/serverchan 后的提示、日志信息、/tmp/serverchan/ 目录下的文件信息，**并附上 sh -x /usr/share/serverchan/serverchan t1 的详细运行信息** ）
- 三言两句恕我无能为力

#### Download
- [luci-app-serverchan](https://github.com/tty228/luci-app-serverchan/releases)
- [wrtbwmon](https://github.com/brvphoenix/wrtbwmon)
- [luci-app-wrtbwmon](https://github.com/brvphoenix/luci-app-wrtbwmon) 
- **L大版本直接编译 luci-app-wrtbwmon ，非原版 LuCI 如使用以上 wrtbwmon，请注意安装版本号**

#### Donate
如果你觉得此项目对你有帮助，请捐助我们，以使项目能持续发展，更加完善。

![image](https://github.com/tty228/Python-100-Days/blob/master/res/WX.jpg)

