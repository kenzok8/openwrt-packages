# luci-app-smartdns

## 软件包描述

LuCI 管理界面 for SmartDNS。SmartDNS 是一个本地高性能 DNS 服务器，支持 DNS 加速、广告过滤和防止 DNS 污染。

## 功能特性

<small>

- 本地 DNS 服务器，带速度优化
- 上游 DNS 服务器配置（UDP、TCP、TLS、HTTPS）
- 备用 DNS 服务器
- DNS64 服务器支持
- 代理服务器支持上游查询
- 基于域名的转发和拦截
- 基于 IP 的规则和黑名单
- 持久化缓存
- 基于证书的 DNS（DoT、DoH）
- DNSCrypt 支持
- 自动更新域名列表

</small>

## 依赖项

<small>

- `smartdns`
- `luci-compat`

</small>

## 软件包路径说明

这是原始 `kenzok8/openwrt-packages` 软件包的标准化修复版本，遵循标准 OpenWrt LuCI 应用布局。

## 修复的问题

<small>

- 控制器：`nixio.fs.access` 调用时缺少本地 `require "nixio.fs"`（缺少 `local fs` 声明）
- 控制器：`luci.sys.call` 和 `luci.http` 使用时缺少本地 requires
- 控制器：全局变量泄漏（`e`、`ipv6_server`、`str`）
- 模型：重复的 `require("nixio.fs")` 调用已移除
- 模型：未使用的 `require("luci.http")` 和 `require("luci.dispatcher")` 已移除
- 模型：`return m` 引用未定义的 `m` 变量已移除
- 模型：未使用的 `local uci` 变量保留用于 `get_config_option` 函数
- CBI 模型：重复的 `require("nixio.fs")` 调用已移除
- CBI 模型：未使用的 `require("luci.http")` 和 `require("luci.dispatcher")` 已移除
- upstream.lua：第 19 行语法错误（`%{` 替换为 `string.format`）
- uci-defaults 脚本：缺少 `IPKG_INSTROOT` 检查已添加
- po/zh-cn 目录重命名为 po/zh_Hans

</small>

## 原始作者

Nick Peng (Ruilin Peng) &lt;pymumu@gmail.com&gt;
