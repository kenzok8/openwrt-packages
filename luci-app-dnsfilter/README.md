本插件是small_5在我的TG群的时候主导开发的.经过他同意上传到我的github并命名为luci-app-dnsfilter,我只是按照自己需求去掉了默认的主规则Easylist以及后续的维护工作,本仓库上传于2021年1月22号,从第一天上传,Makefile维护名单里第一个就是他,他4月1号因为在我群里乱T人,我说了他两句,他就自己主动退了群

<img src="https://i.ibb.co/Mg4bk68/phphknu-AR.png" width = "350"/>
如果没有经过他同意他在群里当群主几个月可能不提出异议么, 其实如果知道他后来也有开源出来,我根本就不会上传本项目了, 这个确实是我失误了,我账号下那么多仓库只要是基于别人的代码都是直接fork的.

但我现在不会关闭本仓库,就是为了气他,

更多关于那疯狗的事感兴趣的小伙伴可以在这里当个乐子看看 https://github.com/garypang13/openwrt-bypass#readme


# 基于DNS的广告过滤 for OpenWrt
## 功能

- 支持 AdGuardHome/Host/DNSMASQ/Domain 格式的规则订阅

- 规则自动识别, 自动去重, 定时更新

- 自定义黑白名单

- 短视频APP拦截

- 安全搜索

## 编译说明

本app依赖于```dnsmasq-full```，与OpenWrt默认的```dnsmasq```冲突，所以编译时请确保已经取消勾选```base-system -> dnsmasq```
