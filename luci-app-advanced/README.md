# luci-app-advanced

[![license](https://img.shields.io/badge/license-Apache2-brightgreen.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/kenzok78/luci-app-advanced/pulls)
[![Lastest Release](https://img.shields.io/github/release/sirpdboy/luci-app-advanced.svg?style=flat)](https://github.com/kenzok78/luci-app-advanced/releases)

LuCI 高级设置插件，提供系统配置、网络设置、防火墙等功能的管理界面。

<small>

## 功能特性

- 系统高级设置
- 网络配置管理
- 防火墙规则配置
- DHCP 设置
- 文件浏览器
- 文件管理器

## 系统要求

- OpenWrt 23.* 或更高版本
- LuCI 23.* + Web 界面

## 安装

### 从源码编译

```bash
git clone https://github.com/kenzok78/luci-app-advanced.git
mv luci-app-advanced /path/to/openwrt/package/feeds/luci/
make package/luci-app-advanced/compile V=99
```

### 在线安装

```bash
opkg update
opkg install luci-app-advanced
```

## 配置

1. 登录 LuCI 管理界面
2. 进入 **系统 → 高级设置**
3. 根据需要进行配置
4. 保存并应用

## 代码优化

### 修复的问题

- uci-defaults 脚本：添加文件存在性检查，避免文件不存在时报错

## 目录结构

```
luci-app-advanced/
├── htdocs/
│   └── luci-static/
│       └── resources/
│           └── fileassistant/
│               ├── fb.js
│               ├── fb.css
│               ├── folder-icon.png
│               ├── file-icon.png
│               └── link-icon.png
├── luasrc/
│   ├── controller/
│   │   ├── advanced.lua
│   │   └── fileassistant.lua
│   ├── model/
│   │   └── cbi/
│   │       └── advanced.lua
│   └── view/
│       ├── filebrowser.htm
│       └── fileassistant.htm
├── root/
│   ├── bin/
│   │   ├── normalmode
│   │   ├── nuc
│   │   ├── ipmode4
│   │   └── ipmode6
│   ├── etc/
│   │   ├── config/
│   │   │   └── advanced
│   │   └── uci-defaults/
│   │       └── 40_luci-fb
│   └── usr/
│       └── share/
│           └── rpcd/
│               └── acl.d/
│                   └── luci-app-advanced.json
├── Makefile
└── README.md
```

## 许可证

Apache License 2.0

## 致谢

- 原始项目：[sirpdboy/luci-app-advanced](https://github.com/sirpdboy/luci-app-advanced)

## 更新日志

### v1.20 (2026-03-24)

- 标准化代码结构
- 修复 uci-defaults 脚本
- 添加中文 README

</small>
