# luci-theme-tomato

OpenWrt LuCI Tomato 主题，经典路由器风格界面。

## 功能特性

- **经典 Tomato 风格**: 还原经典 Tomato 路由器界面
- **简洁设计**: 清晰的导航和布局
- **响应式设计**: 支持移动端和平板设备
- **暗色主题支持**: 适配深色模式
- **双版本兼容**: 支持 LuCI 18.06 和 OpenWrt 24.10

## 系统要求

- OpenWrt 18.06 或更高版本
- LuCI Web 界面

## 安装

### 从源码编译

```bash
# 克隆到 OpenWrt packages 目录
git clone https://github.com/kenzok78/luci-theme-tomato.git

# 移动到 packages 目录
mv luci-theme-tomato /path/to/openwrt/package/feeds/luci/

# 编译
make package/luci-theme-tomato/compile V=99
```

### 在线安装

通过 OpenWrt Web 界面或命令行:

```bash
opkg update
opkg install luci-theme-tomato
```

## 配置

### 切换主题

1. 登录 LuCI 管理界面
2. 进入 **系统 → 系统属性** 或 **系统 → 设置**
3. 在"界面"选项卡中选择 Tomato 主题
4. 保存并应用

### 主题目录结构

```
luci-theme-tomato/
├── htdocs/
│   └── luci-static/
│       └── tomato/
│           ├── cascade.css        # 主题样式
│           ├── fonts/
│           ├── icons/
│           ├── js/
│           └── logo.png
├── luasrc/
│   └── view/
│       └── themes/
│           └── tomato/
│               ├── header.htm
│               └── footer.htm
├── root/
│   └── etc/
│       └── uci-defaults/
│           └── 30_luci-theme-tomato
└── Makefile
```

## 更新日志

### v1.0-3 (2026-03-24)

- 添加 LuCI 18.06/24.10 双版本兼容
- 优化代码结构
- 修复 boardinfo 初始化

### v1.0-2 (2026-03-24)

- 代码优化，移除死代码
- 移除未使用变量

### 之前版本

- 初始版本发布

## 许可证

Apache License 2.0

## 致谢

- 灵感来源: Tomato 路由器固件界面

## 反馈

- Issue: [GitHub Issues](https://github.com/kenzok78/luci-theme-tomato/issues)
