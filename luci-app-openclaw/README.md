# luci-app-openclaw

OpenWrt LuCI 插件，为 [OpenClaw AI Gateway](https://openclaw.ai) 提供 Web 管理界面。

[![Release](https://img.shields.io/github/v/release/kenzok8/luci-app-openclaw)](https://github.com/kenzok8/luci-app-openclaw/releases)
[![Build IPK](https://img.shields.io/github/actions/workflow/status/kenzok8/luci-app-openclaw/build-ipk.yml?label=build-ipk)](https://github.com/kenzok8/luci-app-openclaw/actions/workflows/build-ipk.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

## 功能特性

- **一键安装**：自动下载 Node.js musl 版本 + 安装 OpenClaw，适配 OpenWrt/ImmortalWrt
- **Web 管理界面**：概况、设置、Web 控制台、配置终端 全中文 UI
- **配置终端**：内嵌 xterm.js + WebSocket PTY，支持完整交互式配置
- **资源自适应**：根据设备内存自动限制 Node.js 堆大小，防止 OOM
- **磁盘空间优化**：安装前预检空间，双 registry 重试（npmmirror → npmjs.org）
- **BusyBox 兼容**：完整适配 OpenWrt BusyBox 环境（无 `usleep`、`stat`、`ldd` 等）
- **libstdc++ 自动修复**：opkg 失败时从 Alpine 镜像自动提取安装
- **OpenWrt 安全**：LuCI 鉴权保护，跳过 Gemini CLI（防止资源耗尽崩溃）

## 支持架构

| 架构 | 说明 |
|------|------|
| x86_64 | 主要测试平台（ImmortalWrt x86_64）|
| aarch64 | 树莓派、R4S、R5S 等 ARM64 设备 |

---

## 安装（推荐）

在 OpenWrt 路由器上执行一条命令即可完成安装：

```sh
sh -c "$(wget -qO- https://cdn.jsdelivr.net/gh/kenzok8/luci-app-openclaw@main/scripts/install.sh)"
```

> 脚本会自动下载最新版 `.ipk`，通过 `opkg` 安装，并清除 LuCI 缓存。

---

### 方式二：手动下载 IPK

```sh
wget -O /tmp/luci-app-openclaw.ipk \
  https://github.com/kenzok8/luci-app-openclaw/releases/latest/download/luci-app-openclaw_2026.03.30_all.ipk
opkg install --force-reinstall /tmp/luci-app-openclaw.ipk
```

### 方式三：作为 OpenWrt feeds

```bash
# 在 feeds.conf.default 中添加
src-git openclaw https://github.com/kenzok8/luci-app-openclaw.git

# 更新并安装
./scripts/feeds update openclaw
./scripts/feeds install luci-app-openclaw
make package/luci-app-openclaw/compile V=s
```

---

## 安装后配置

1. 打开 LuCI → **服务** → **OpenClaw AI Gateway**
2. 点击 **更多** → **重装环境**，等待 Node.js + OpenClaw 安装完成（约 5~15 分钟）
3. 启用服务后在 **Web 控制台** 中配置 AI 模型和消息渠道

## 磁盘空间不足解决方案

OpenWrt 设备 root 分区通常只有 1GB 以下，OpenClaw 安装包约 600MB。

**解决方案：bind mount tmpfs**

```bash
# 在 /etc/rc.local 中添加（开机自动执行）
mkdir -p /tmp/openclaw
mount --bind /tmp/openclaw /opt/openclaw
```

> `/tmp` 通常挂载为 tmpfs，大小约为物理内存的 50%，重启后数据丢失，需重新安装

---

## 目录结构

```
luci-app-openclaw/
├── .github/workflows/
│   ├── build-ipk.yml        # 自动编译 IPK，推送 tag 时触发
│   └── node-bins.yml        # 同步 Node.js musl 二进制到 node-bins release
├── htdocs/
│   └── luci-static/resources/view/
│       └── openclaw.js      # LuCI JS 视图（主 UI）
├── luasrc/
│   ├── controller/openclaw.lua  # LuCI 路由控制器
│   ├── model/cbi/openclaw.lua   # CBI 配置模型（兼容旧版 LuCI）
│   └── view/openclaw/           # Lua 视图模板
├── root/
│   ├── etc/
│   │   ├── config/openclaw      # UCI 默认配置
│   │   ├── init.d/openclaw      # procd 服务脚本
│   │   └── uci-defaults/        # 首次安装初始化
│   └── usr/
│       ├── bin/openclaw-env     # 安装/管理脚本（核心）
│       └── share/openclaw/
│           ├── luci-helper      # LuCI RPC 辅助脚本
│           ├── oc-config.sh     # 配置终端交互脚本
│           ├── web-pty.js       # WebSocket PTY 服务器
│           └── ui/              # 配置终端 Web UI
├── scripts/
│   └── install.sh               # 一键安装脚本
├── po/zh_Hans/openclaw.po       # 中文翻译
├── Makefile
└── VERSION
```

---

## Node.js 二进制

Node.js musl 静态编译版本托管在：
- [kenzok8/luci-app-openclaw/releases/tag/node-bins](https://github.com/kenzok8/luci-app-openclaw/releases/tag/node-bins)

| 文件 | 架构 | 说明 |
|------|------|------|
| `node-v22.16.0-linux-x64-musl.tar.gz` | x86_64 | musl libc 静态编译 |
| `node-v22.16.0-linux-arm64-musl.tar.gz` | aarch64 | musl libc 静态编译 |

由 [node-bins.yml](.github/workflows/node-bins.yml) 每周自动同步最新 LTS 版本。

---

## 常见问题

**Q: 安装时提示 libstdc++.so.6 找不到**
A: 插件会自动从 Alpine Linux 镜像下载安装，无需手动操作。

**Q: opkg update 失败，提示格式不兼容**
A: ImmortalWrt 新版仓库已切换为 apk v3 格式，与 opkg 不兼容。libstdc++ 走 Alpine 回退路径安装。

**Q: 安装完成后 Gateway 不启动**
A: 检查磁盘空间：`df -h /opt`，若已满需配置 bind mount 到 tmpfs。

**Q: 内存不足设备如何使用**
A: 插件自动根据内存设置 Node.js 堆限制（512MB RAM → 限制 256MB 堆），无需手动配置。

**Q: npm 安装时 ENOSPC 错误**
A: openclaw-env 已将 npm logs 和 cache 全部重定向到 `/tmp`，避免写满根分区。如仍出现，手动执行 `df -h` 确认 `/tmp` 空间充足（建议 > 300MB）。

**Q: 配置终端无法输入**
A: 确保点击终端区域使其获得焦点，然后输入数字并按 Enter。路由器不需要安装额外的 `script` 包，插件已内置 sh 模式兼容。

---

## 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| 2026.03.30 | 2026-03-30 | 终端输入修复（server-side echo）、npm ENOSPC 修复、双 registry 重试、磁盘空间预检、Box 对齐修复、菜单文字优化 |
| 2026.03.29 | 2026-03-29 | 初始发布，支持 x86_64/aarch64 musl |

---

## 致谢

- [OpenClaw AI Gateway](https://openclaw.ai) — AI 网关核心
- [ImmortalWrt](https://immortalwrt.org) — 主要测试平台
- [unofficial-builds.nodejs.org](https://unofficial-builds.nodejs.org/) — Node.js musl 二进制

## License

GPL-3.0 © [kenzok8](https://github.com/kenzok8)
