# Argon 配置兼容包

[English](README.md) · 简体中文

Argon 3.0 已将设置页、背景、Logo 和 RPC 服务集成到 [luci-theme-argon](https://github.com/jerrykuku/luci-theme-argon)。本仓库的 master 现在提供 **3.0 空迁移包**，沿用 `luci-app-argon-config` 包名，不再安装这些文件或独立语言包。

编译新固件只需选择 `luci-theme-argon`。已有构建脚本若仍克隆本仓库，更新到本次兼容包后可保留原包名；同一构建树中只保留一份包定义，不要同时引入主题仓库中的同名迁移包。旧版 1.0 插件与 3.0 主题同时安装会产生 `trying to overwrite ... owned by luci-theme-argon` 错误。

已有路由器从旧独立插件迁移时，先升级本空迁移包，再安装同次发行的 3.0 主题。迁移包先备份旧配置，主题恢复设置；无需先卸载旧插件。完整命令见[主题迁移说明](https://github.com/jerrykuku/luci-theme-argon/blob/master/README_ZH.md#安装)。

翻译包 `luci-i18n-argon-config-*` 由主题仓库提供。Argon 2.x 与更早的主题不应使用此空迁移包；旧独立插件源码保留在提交 `445af53fbee6e00fa6efc0ae33f8b2854df65500`，18.06 分支维持原有用途。
