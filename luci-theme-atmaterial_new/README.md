# luci-theme-atmaterial_new

OpenWrt LuCI Material 主题，提供三种配色方案：atmaterial、atmaterial_Brown、atmaterial_red。

## 功能特性

- **Material Design 风格**: 现代简洁的界面设计
- **三种配色方案**: 
  - atmaterial (默认抹茶绿)
  - atmaterial_Brown (棕色系)
  - atmaterial_red (红色系)
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
git clone https://github.com/kenzok78/luci-theme-atmaterial_new.git

# 移动到 packages 目录
mv luci-theme-atmaterial_new /path/to/openwrt/package/feeds/luci/

# 编译
make package/luci-theme-atmaterial_new/compile V=99
```

### 在线安装

通过 OpenWrt Web 界面或命令行:

```bash
opkg update
opkg install luci-theme-atmaterial_new
```

## 配置

### 切换主题

1. 登录 LuCI 管理界面
2. 进入 **系统 → 系统属性** 或 **系统 → 设置**
3. 在"界面"选项卡中选择主题
4. 保存并应用

### 主题目录结构

```
luci-theme-atmaterial_new/
├── htdocs/
│   └── luci-static/
│       ├── atmaterial/           # 默认绿色主题
│       │   ├── css/style.css
│       │   ├── fonts/
│       │   ├── js/
│       │   └── logo.png
│       ├── atmaterial_Brown/      # 棕色主题
│       │   └── ...
│       └── atmaterial_red/        # 红色主题
│           └── ...
├── luasrc/
│   └── view/
│       └── themes/
│           ├── atmaterial/
│           │   ├── header.htm
│           │   └── footer.htm
│           ├── atmaterial_Brown/
│           │   └── ...
│           └── atmaterial_red/
│               └── ...
├── root/
│   └── etc/
│       └── uci-defaults/
│           └── 30_luci-theme-atmaterial_new
└── Makefile
```

## 更新日志

### v1.2-4 (2026-03-24)

- 添加 LuCI 18.06/24.10 双版本兼容
- 优化代码结构
- 修复 boardinfo 初始化

### v1.2-3 (2026-03-24)

- 代码优化，移除死代码
- 移除未使用变量

### 之前版本

- 初始版本发布

## 许可证

Apache License 2.0

## 致谢

- 原始项目: [luci-theme-material](https://github.com/LuttyYang/luci-theme-material)
- 基于 MUI: https://github.com/muicss/mui

## 反馈

- Issue: [GitHub Issues](https://github.com/kenzok78/luci-theme-atmaterial_new/issues)
