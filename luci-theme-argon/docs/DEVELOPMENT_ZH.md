# Argon 3.0 开发说明

[English](DEVELOPMENT.md) · [返回 README](../README_ZH.md)

## 源码构建

在 OpenWrt 构建目录中执行：

```sh
cd package
git clone https://github.com/jerrykuku/luci-theme-argon.git
cd ..
make menuconfig
# LuCI → Themes → luci-theme-argon
make package/luci-theme-argon/compile V=s
```

主题设置已内置。仅在需要构建旧插件迁移包时，在 LuCI 应用中额外选择嵌套的 `compat/luci-app-argon-config` 包。语言包继续使用 `luci-i18n-argon-config-*` 名称。

发行 CI 使用 OpenWrt 23.05.5 SDK 构建 IPK、25.12.5 SDK 构建 APK v3。Ucode 模板保留源码，避免绑定某个运行时的字节码格式。

语言包通过 `PKG_PO_VERSION` 跟随主题发行版本，APK 包含 `-r<修订号>`。IPK 语言包固定使用 `v` 前缀（如 `v3.0.1`），使已安装的 v3.0.0 `unknown` 语言包可以直接正常升级；后续版本须保留该前缀。发布前会逐个读取语言包内部元数据，版本不符时阻止上传和发布。

## 目录

| 位置 | 用途 |
| --- | --- |
| `less/cascade.less` | 样式入口及导入顺序 |
| `less/theme.less` | 亮暗配色和语义颜色 token |
| `less/spacing.less`、`less/shape.less` | 间距及圆角 |
| `less/components/` | 通用控件、表格、标签页、弹窗、外观菜单 |
| `less/pages/`、`less/page-fix.less` | LuCI / 插件适配及导入索引 |
| `less/responsive.less` | 视口适配 |
| `htdocs/luci-static/argon/` | 编译后的 CSS、图片、字体和 SVG |
| `htdocs/luci-static/resources/` | 设置页与 LuCI JavaScript 模块 |
| `ucode/template/themes/argon/` | 登录页和后台模板 |
| `root/` | UCI 默认配置、RPC、ACL 及系统集成文件 |
| `po/` | Argon Config 翻译 |
| `tests/` | 行为与集成检查 |

## 样式

修改 LESS 源码后，使用 LESS 4.1.3 重新生成并一同提交 CSS：

```sh
npm install --global less@4.1.3
lessc less/cascade.less htdocs/luci-static/argon/css/cascade.css
```

亮暗色共用一份样式。`theme.less` 中 `@theme-palette` 每行以 `角色: 亮色, 暗色;` 定义颜色；单值表示两种模式共用。文字、背景、边框和状态使用各自语义 token；旧变量别名仅用于 LuCI 兼容。

导入顺序为 token、基础控件、登录与后台布局、共享组件、页面适配、响应式规则。通用行为放入对应组件模块，插件选择器放在 `pages/`；`page-fix.less` 只维护导入索引。

页面及卡片内缩、section、字段、控件与操作间距使用统一 token；小屏外边距及卡片内缩为 `1rem`。长文案允许换行，控件可收缩到容器宽度。LESS 会提前求值的原生 CSS `min()` 表达式需转义。

圆角 token 覆盖标签、控件、面板、卡片和弹窗；组合控件的内部接缝保持直角。不要裁切整个卡片，避免截断下拉菜单与提示框；表格自行处理末行圆角和窄屏布局。

保留 LuCI 原生结构和交互：标签栏与相邻内容容器衔接，section 内容负责纵向间距；弹窗操作随空间换行或堆叠，长正文通过覆盖层滚动。下拉位置和滚动继续由 LuCI 控制。悬浮效果仅用于支持 hover 的设备，并尊重减少动画偏好。

## 模板

保留 LuCI 的 `header`、`header_login`、`out_header_login`、`sysauth` 和页脚入口。

| 模板 | 用途 |
| --- | --- |
| `head.ut` | 配置校验、元信息、样式及后台资源加载 |
| `sysauth.ut` | 登录布局和模板组装 |
| `login_background.ut` | 壁纸选择及图片 / 视频输出 |
| `login_form.ut` | 认证字段、提示和插件内容 |
| `page_scripts.ut` | 页脚共用脚本 |

通过 `include` 的第二个参数传递局部数据。登录页不加载后台 LuCI 模块。`login_style` 仅接受 `classic`、`centered`，其他值回退为 `classic`。

## 配置与品牌资源

配置保存在 `/etc/config/argon`，设置地址仍为 `/admin/system/argon-config`。首次安装采用本地背景、经典登录、10px 模糊和 0.5 透明度；升级保留已有选项。

新安装根据主色自动生成暗色配色，已有独立暗色主色保留为自定义。暗色登录面板可跟随亮色或单独配置；切回自动 / 跟随时仍保留自定义值。

顶部外观菜单通过 `luci.argon_appearance` 单独保存模式，对整个设备生效，需要 Argon 写权限。保持与未保存表单设置独立；保存失败时核对服务端已保存值。

自定义图标位于 `/www/luci-static/argon/branding/`，背景位于 `/www/luci-static/argon/background/`。上传 / 恢复立即生效，不覆盖内置文件；两个目录均纳入保留配置升级的备份。网站图标也用于 touch icon 和 manifest，已有手机桌面快捷方式可能需要重新添加。

## 菜单图标

一级菜单按节点名查找 `htdocs/luci-static/argon/icon/<节点名>.svg`，与翻译后的标题无关。文件名区分大小写，支持字母、数字、下划线和连字符；缺失时使用 `default.svg`。

使用透明背景、带 `viewBox` 的单色 SVG，CSS mask 负责主题与交互颜色。共享箭头使用 24×24 网格、2px 圆角描边。资源见 [SVG 图标索引](../htdocs/luci-static/argon/icon/README.md)，与用户上传的网站图标 / 登录 Logo 独立。

## 检查

准备 Node.js 22+、Python 3、LESS 4.1.3，以及与目标 OpenWrt 运行时匹配的 Ucode：

```sh
UCODE_BIN=/path/to/ucode sh .github/scripts/check_theme.sh
```

脚本检查 JavaScript、Shell、Ucode 语法，核对 LESS 与 CSS 产物，并运行 Node / Python 测试。CI 的 Ucode 构建步骤见 [check.yml](../.github/workflows/check.yml)。

UI 改动应检查实际受影响页面的亮暗色、桌面与窄屏，以及相关的键盘焦点、长文本和减少动画场景。网络和硬件行为仍需相应 OpenWrt 环境验证。
