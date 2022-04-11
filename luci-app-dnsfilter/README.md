基于 [small_5](https://github.com/small-5) 的 luci-app-adblock-plus 修改

# 基于DNS的广告过滤 for OpenWrt
## 功能

- 支持 AdGuardHome/Host/DNSMASQ/Domain 格式的规则订阅

- 规则自动识别, 自动去重, 定时更新

- 自定义黑白名单

- 短视频APP拦截

- 安全搜索

## 编译说明

本app依赖于```dnsmasq-full```，与OpenWrt默认的```dnsmasq```冲突，所以编译时请确保已经取消勾选```base-system -> dnsmasq```
