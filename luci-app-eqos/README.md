# luci-app-eqos

[![license](https://img.shields.io/badge/license-GPLv2-brightgreen.svg)](LICENSE)

EQOS (Easy QoS) for OpenWrt LuCI - 基于IP限速的流量控制工具

## 特性

- 支持基于IP地址限速
- 支持自定义WAN设备
- 不使用iptables MARK，更高效
- 提供直观的LuCI Web界面
- 支持IPv4地址自动发现

## 系统要求

- OpenWrt 18.06 或更高版本
- LuCI Web 界面
- kmod-sched-core
- kmod-ifb
- tc (iproute2)

## 安装

### 编译安装

```bash
# 克隆到 OpenWrt SDK
git clone https://github.com/kenzok78/luci-app-eqos.git

# 放入 packages 目录
mv luci-app-eqos /path/to/openwrt/package/feeds/luci/

# 编译
make package/luci-app-eqos/compile V=s
```

### 在线安装

```bash
opkg update
opkg install luci-app-eqos
```

## 配置

1. 登录 LuCI 管理界面
2. 进入 **网络 → EQOS**
3. 启用 EQOS 并设置总带宽
4. 添加需要限速的 IP 地址及带宽

## 命令行用法

```bash
# 启动
eqos start

# 停止
eqos stop

# 重启
eqos restart

# 添加规则
eqos add 192.168.1.100 10 5

# 查看状态
eqos show

# 清除所有规则
eqos flush
```

## 目录结构

```
luci-app-eqos/
├── Makefile
├── luasrc/
│   ├── controller/eqos.lua
│   └── model/cbi/eqos.lua
├── po/
│   └── zh_Hans/eqos.po
├── root/
│   ├── etc/
│   │   ├── config/eqos
│   │   ├── init.d/eqos
│   │   └── hotplug.d/iface/10-eqos
│   └── usr/
│       ├── sbin/eqos
│       └── share/rpcd/acl.d/luci-app-eqos.json
└── README.md
```

## 工作原理

1. 使用 HTB (Hierarchical Token Bucket) 队列规则
2. 下载流量通过 ifb (Intermediate Functional Block) 设备控制
3. 上传流量直接在 WAN 接口控制

## 许可证

GPL-2.0

## 致谢

- 原始项目: [luci-app-eqos](https://github.com/garypang13/luci-app-eqos) by GaryPang

## 更新日志

### v2.0.0 (2026-03-22)

- 重构 Lua CBI 模型，修复全局变量泄漏
- 添加输入验证 (IP 地址、速度)
- 添加日志记录
- 支持自定义 WAN 设备
- 添加 flush/show 命令
- 完善中文翻译
