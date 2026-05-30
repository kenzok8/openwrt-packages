# luci-app-adguardhome

适用于 OpenWrt / ImmortalWrt 的 AdGuard Home LuCI 控制面板。

> 基于 [rufengsuixing/luci-app-adguardhome](https://github.com/rufengsuixing/luci-app-adguardhome) 维护，
> 针对 **ImmortalWrt 24.10+** 进行了大量 UI 重构和 Bug 修复。

## 兼容性

| 系统 | 状态 |
|------|------|
| ImmortalWrt 24.10 / 25.12 | 主要测试目标，完全兼容 |
| OpenWrt 23.05 | 兼容 |
| OpenWrt 21.02 / 22.03 | 兼容 |
| OpenWrt 19.07 | 兼容（jail 字段回退为 TextValue） |
| OpenWrt 18.06 | 基本兼容（DynamicList 自动回退） |

## 截图

### 概览

![概览](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/adguardhome/01-overview.png)

### 基础设置

![基础设置](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/adguardhome/02-base-setting.png)

### 运维

![运维](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/adguardhome/03-tools.png)

### 日志

![日志](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/adguardhome/04-log.png)

### 手动配置

![手动配置](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/adguardhome/05-manual.png)

## 功能

- **概览面板**：服务状态、重定向模式、核心版本、一键启停 + Web 控制台快捷入口
- **基础设置**：启用开关、管理端口、核心更新、5553 重定向（4 种模式）、路径配置、进程参数
- **工具与任务**：改密、sysupgrade 保留文件、关机备份、Crontab 计划任务
- **日志查看**：实时轮询、反向/本地时区切换、下载、清空
- **手动配置**：YAML 编辑器（CodeMirror 可选），保存前二次确认
- **核心自动更新**：GitHub/AdGuard 多源下载 → UPX 压缩 → 重启服务
- **UPX 压缩**：>8MB 二进制自动压缩（支持 x86_64 / arm64 / mips 等架构）
- **计划任务**：自动更新核心、切割日志、IPv6 hosts 同步
- **升级保护**：sysupgrade 保留文件 + 关机备份

## 安装

### Feed 方式

```bash
echo 'src-git adguardhome https://github.com/kenzok78/luci-app-adguardhome' >> feeds.conf.default
./scripts/feeds update -a && ./scripts/feeds install -a -p adguardhome
make package/luci-app-adguardhome/compile V=s
```

### 直接编译

```bash
git clone https://github.com/kenzok78/luci-app-adguardhome.git package/luci-app-adguardhome
make menuconfig  # LuCI → Applications → luci-app-adguardhome
make -j$(nproc) V=s
```

## 重定向模式

| 模式 | 说明 |
|------|------|
| 不启用 | 仅运行，不拦截 DNS |
| 作为 dnsmasq 上游 | dnsmasq 转发到 AGH |
| 53 端口劫持 | iptables 重定向到 AGH |
| 替代 dnsmasq | AGH 直接监听 53 |

## 许可证

Apache-2.0
