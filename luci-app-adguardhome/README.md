# luci-app-adguardhome

适用于 OpenWrt/Lede 的 AdGuard Home LuCI 控制面板插件。

## 功能特性

- **基础配置**: 核心路径、配置文件路径、工作目录、日志路径、Web 管理端口等
- **多种重定向模式**: 无重定向、作为 dnsmasq 上游、重定向 53 端口、替换 dnsmasq
- **核心自动更新**: 支持从 GitHub releases 自动下载更新
- **UPX 压缩**: 下载后可自动使用 UPX 压缩二进制文件节省空间
- **GFW 列表管理**: 自动从 gfwlist 生成 AdGuard Home 规则
- **IPv6 主机同步**: 自动同步 LAN 中的 IPv6 设备到 hosts
- **计划任务**: 自动更新核心、GFW 列表、清理日志
- **备份与恢复**: 关机时自动备份工作目录文件
- **Web 管理**: 实时状态监控、日志查看、配置编辑

## 依赖

- `luci`
- `luci-base`
- `ca-certs`
- `curl`
- `wget-ssl`

## 安装

### OpenWrt Feed 方式

```bash
# 添加 feed
echo 'src-git adguardhome https://github.com/kenzok78/luci-app-adguardhome' >> feeds.conf.default
./scripts/feeds update -a
./scripts/feeds install -a -p adguardhome

# 编译
make package/luci-app-adguardhome/compile V=s
```

### 直接编译

```bash
# 克隆到 package 目录
git clone https://github.com/kenzok78/luci-app-adguardhome.git package/luci-app-adguardhome
make menuconfig  # 选择 LuCI -> Applications -> luci-app-adguardhome
make -j$(nproc) V=s
```

## 使用说明

### 基本配置

1. 访问 OpenWrt Web 管理界面 → 服务 → AdGuard Home
2. 启用插件
3. 设置核心路径（默认 `/usr/bin/AdGuardHome`）
4. 配置重定向模式

### 重定向模式说明

| 模式 | 说明 |
|------|------|
| 无 | 仅运行 AdGuard Home，不拦截任何 DNS 请求 |
| 作为 dnsmasq 上游 | 将 dnsmasq 的上游 DNS 指向 AdGuard Home |
| 重定向 53 端口 | 通过 iptables 重定向本机 53 端口到 AdGuard Home |
| 替换 dnsmasq | 使用 AdGuard Home 的 53 端口替换 dnsmasq |

### 更新核心

在基础设置页面点击"更新核心版本"，或通过定时任务自动更新。

### GFW 列表

点击"添加 GFW 列表"自动从 gfwlist 生成 AdGuard Home 规则。

## 配置示例

### /etc/config/AdGuardHome

```
config AdGuardHome 'AdGuardHome'
    option enabled '0'
    option httpport '3000'
    option redirect 'none'
    option configpath '/etc/AdGuardHome.yaml'
    option workdir '/etc/AdGuardHome'
    option logfile '/tmp/AdGuardHome.log'
    option binpath '/usr/bin/AdGuardHome'
```

### /etc/AdGuardHome.yaml

```yaml
bind_host: 0.0.0.0
bind_port: 3000
dns:
  bind_hosts:
    - 0.0.0.0
  port: 53
  upstream_dns:
    - 223.5.5.5
    - 119.29.29.29
```

## 目录结构

```
luci-app-adguardhome/
├──luasrc/
│  ├── controller/          # LuCI 控制器
│  ├── model/cbi/           # CBI 模型
│  └── view/                # HTML 视图模板
├── po/                     # 翻译文件
├── root/
│  ├── etc/
│  │   ├── config/         # UCI 配置
│  │   └── init.d/         # 启动脚本
│  └── usr/share/           # 辅助脚本
└── Makefile
```

## 常见问题

### Q: 更新核心失败怎么办？

检查网络连接，确保可以访问 GitHub。也可以手动下载核心并放置到指定路径。

### Q: 如何查看实时日志？

通过 LuCI 界面的日志页面查看，或：

```bash
logread -e AdGuardHome
```

### Q: 开机后 AdGuard Home 不自动启动？

检查"开机后网络就绪时重启"选项是否启用，或手动执行 `/etc/init.d/AdGuardHome enable`。

## 许可证

Apache-2.0

## 来源

- [AdGuard Home](https://github.com/AdguardTeam/AdGuardHome)
- 基于 [rufengsuixing/luci-app-adguardhome](https://github.com/rufengsuixing/luci-app-adguardhome) 维护
