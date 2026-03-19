# luci-app-openclaw

[![Bilibili](https://img.shields.io/badge/B%E7%AB%99-59438380-00a1d6?logo=bilibili)](https://space.bilibili.com/59438380)
[![Blog](https://img.shields.io/badge/Blog-910501.xyz-orange)](https://blog.910501.xyz/)
[![Build & Release](https://github.com/10000ge10000/luci-app-openclaw/actions/workflows/build.yml/badge.svg)](https://github.com/10000ge10000/luci-app-openclaw/actions/workflows/build.yml)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)

[OpenClaw](https://github.com/nicepkg/openclaw) AI 网关的 OpenWrt LuCI 管理插件。

在路由器上运行 OpenClaw，通过 LuCI 管理界面完成安装、配置和服务管理。

<div align="center">
  <img src="docs/images/2.png" alt="OpenClaw LuCI 管理界面" width="800" style="border-radius:8px;" />
</div>

**系统要求**

| 项目 | 要求 |
|------|------|
| 架构 | x86_64 或 aarch64 (ARM64) |
| C 库 | musl（自动检测；离线包仅支持 musl） |
| 依赖 | luci-compat, luci-base, curl, openssl-util |
| 存储 | **1.5GB 以上可用空间** |
| 内存 | 推荐 1GB 及以上 |

## 📦 安装

### 方式一：.run 自解压包（推荐）

无需 SDK，适用于已安装好的系统。

```bash
wget https://github.com/10000ge10000/luci-app-openclaw/releases/latest/download/luci-app-openclaw.run
sh luci-app-openclaw.run
```

### 方式二：.ipk 安装

```bash
wget https://github.com/10000ge10000/luci-app-openclaw/releases/latest/download/luci-app-openclaw.ipk
opkg install luci-app-openclaw.ipk
```

### 方式三：集成到固件编译

适用于自行编译固件或使用在线编译平台的用户。

```bash
cd /path/to/openwrt

# 添加 feeds
echo "src-git openclaw https://github.com/10000ge10000/luci-app-openclaw.git" >> feeds.conf.default

# 更新安装
./scripts/feeds update -a
./scripts/feeds install -a

# 选择插件
make menuconfig
# LuCI → Applications → luci-app-openclaw

# 编译
make package/luci-app-openclaw/compile V=s
```

使用 OpenWrt SDK 单独编译：

```bash
git clone https://github.com/10000ge10000/luci-app-openclaw.git package/luci-app-openclaw
make defconfig
make package/luci-app-openclaw/compile V=s
find bin/ -name "luci-app-openclaw*.ipk"
```

### 方式四：手动安装

```bash
git clone https://github.com/10000ge10000/luci-app-openclaw.git
cd luci-app-openclaw

cp -r root/* /
mkdir -p /usr/lib/lua/luci/controller /usr/lib/lua/luci/model/cbi/openclaw /usr/lib/lua/luci/view/openclaw
cp luasrc/controller/openclaw.lua /usr/lib/lua/luci/controller/
cp luasrc/model/cbi/openclaw/*.lua /usr/lib/lua/luci/model/cbi/openclaw/
cp luasrc/view/openclaw/*.htm /usr/lib/lua/luci/view/openclaw/

chmod +x /etc/init.d/openclaw /usr/bin/openclaw-env /usr/share/openclaw/oc-config.sh
sh /etc/uci-defaults/99-openclaw
rm -f /tmp/luci-indexcache /tmp/luci-modulecache/*
```


## 🔰 首次使用

1. 打开 LuCI → 服务 → OpenClaw，点击「安装运行环境」
2. 安装完成后服务会自动启动，点击「刷新页面」查看状态
3. 进入「Web 控制台」添加 AI 模型和 API Key
4. 进入「配置管理」可使用向导配置消息渠道

## 📂 目录结构

```
luci-app-openclaw/
├── Makefile                          # OpenWrt 包定义
├── luasrc/
│   ├── controller/openclaw.lua       # LuCI 路由和 API
│   ├── model/cbi/openclaw/basic.lua  # 主页面
│   └── view/openclaw/
│       ├── status.htm                # 状态面板
│       ├── advanced.htm              # 配置管理（终端）
│       └── console.htm               # Web 控制台
├── root/
│   ├── etc/
│   │   ├── config/openclaw           # UCI 配置
│   │   ├── init.d/openclaw           # 服务脚本
│   │   └── uci-defaults/99-openclaw  # 初始化脚本
│   └── usr/
│       ├── bin/openclaw-env          # 环境管理工具
│       └── share/openclaw/           # 配置终端资源
├── scripts/
│   ├── build_ipk.sh                  # 本地 IPK 构建
│   ├── build_run.sh                  # .run 安装包构建
│   ├── download_deps.sh              # 下载离线依赖 (Node.js + OpenClaw)
│   ├── upload_openlist.sh            # 上传到网盘 (OpenList)
│   └── build-node-musl.sh            # 编译 Node.js musl 静态链接版本
└── .github/workflows/
    ├── build.yml                     # 在线构建 + 发布
    └── build-node-musl.yml           # Node.js musl 构建
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

[GPL-3.0](LICENSE)
