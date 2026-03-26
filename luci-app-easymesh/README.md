# luci-app-easymesh

## 软件包描述

LuCI 管理界面 for EasyMesh。基于 LuCI 的 Batman-Adv mesh 网络配置界面，支持 802.11s，可在 OpenWrt 上实现无缝无线/有线回程 mesh 网络。

## 功能特性

<small>

- Batman-Adv mesh 网络配置
- 802.11s 无线 mesh 支持
- 有线/无线回程支持
- AP 模式，支持自定义 IP 配置
- K/V/R（802.11k/v/r）支持，优化漫游
- 与 DAWN 集成，实现动态漫游决策

</small>

## 依赖项

<small>

- `kmod-cfg80211`
- `kmod-batman-adv`
- `batctl-default`
- `wpad-mesh-openssl`
- `dawn`

</small>

## 硬件要求

<small>

- 支持 802.11s mesh 的无线网卡（如 MediaTek MT76、Qualcomm Atheros 等）
- 已加载 Batman-Adv 内核模块

</small>

## 软件包路径说明

这是原始 `kenzok8/openwrt-packages` 软件包的标准化修复版本，遵循标准 OpenWrt LuCI 应用布局。

## 修复的问题

<small>

- CBI 模型 `detect_Node()` 函数中的语法错误（括号不平衡）
- CBI 模型中的全局变量泄漏（Lua 全局变量 `v`、`s`、`apRadio`、`enable`）
- 控制器中缺少 `nixio` require
- 控制器中 `nixio.fs.access` 调用未 require `nixio.fs`
- init 脚本 shell 函数中缺少 `local` 声明
- shell 脚本中未引用的变量
- 脆弱的 `grep` 命令解析替换为健壮的 `uci show` 解析
- `add_wifi_mesh` 函数重构为接受 `apall` 参数，而不是依赖全局作用域
- `uci commit` 调用适当批处理
- `batctl n` 命令输出解析修复，使用正确的 `io.popen` 而不是 `util.execi`
- `tail -n +2` 与标题跳过逻辑一致
- `encryption` 字符串比较从数字修复为字符串
- `po/zh-cn` 目录已移除（`po/zh_Hans` 的重复）
- uci-defaults 脚本添加了 `IPKG_INSTROOT` 检查
- Makefile 添加了缺少的 `PKG_MAINTAINER` 和 `PKG_RELEASE` 字段

</small>

## 原始作者

dz &lt;dingzhong110@gmail.com&gt;
