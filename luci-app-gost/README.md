# luci-app-gost

适用于 OpenWrt/Lede 的 GOST 隧道 LuCI 控制面板插件。

## 简介

GOST (GO Simple Tunnel) 是一个用 Go 语言编写的简单安全隧道工具，支持多种协议和转发方式。

## 功能特性

- **隧道服务**: 支持多种协议的隧道转发
- **配置管理**: 支持配置文件和命令行参数两种方式
- **状态监控**: 实时显示服务运行状态
- **动态参数**: 支持自定义启动参数

## 依赖

- `luci`
- `luci-base`
- `gost` (主程序)

## 安装

### OpenWrt Feed 方式

```bash
# 添加 feed
echo 'src-git gost https://github.com/kenzok78/luci-app-gost' >> feeds.conf.default
./scripts/feeds update -a
./scripts/feeds install -a -p gost

# 编译
make package/luci-app-gost/compile V=s
```

### 直接编译

```bash
git clone https://github.com/kenzok78/luci-app-gost.git package/luci-app-gost
make menuconfig  # 选择 LuCI -> Applications -> luci-app-gost
make -j$(nproc) V=s
```

## 使用说明

### 基本配置

1. 访问 OpenWrt Web 管理界面 → 服务 → GOST
2. 启用插件
3. 选择配置方式：
   - **配置文件**: 指定 `gost.json` 配置文件路径
   - **命令行参数**: 添加启动参数
4. 保存并应用配置

### 配置说明

| 选项 | 说明 | 默认值 |
|------|------|--------|
| 启用 | 开启/关闭 GOST 服务 | 关闭 |
| 配置文件 | GOST 配置文件路径 | /etc/gost/gost.json |
| 参数 | 启动命令行参数 | 无 |

### 配置文件示例

`/etc/gost/gost.json`:

```json
{
  " Serve": [
    {
      "chain": "/tcp:0.0.0.0:8080"
    }
  ]
}
```

## 目录结构

```
luci-app-gost/
├── htdocs/                      # Web 静态资源
│   └── luci-static/
│       └── resources/
│           └── view/           # 视图模板
│               └── gost.js
├── root/                        # 文件系统文件
│   ├── etc/
│   │   ├── config/             # UCI 配置
│   │   └── init.d/            # 启动脚本
│   └── usr/
│       └── share/
│           ├── luci/
│           │   └── menu.d/    # 菜单定义
│           └── rpcd/
│               └── acl.d/     # ACL 权限
├── po/                          # 翻译文件
│   ├── zh-cn/
│   └── zh_Hans/
└── Makefile
```

## 常见问题

### Q: 启动失败怎么办？

检查 gost 二进制文件是否已安装，以及配置文件路径是否正确。

### Q: 如何查看日志？

```bash
logread -e gost
```

### Q: 如何手动启动？

```bash
/etc/init.d/gost start
```

## 许可证

Apache-2.0

## 来源

- [GOST](https://gost.run/)
- [go-gost/gost](https://github.com/go-gost/gost)