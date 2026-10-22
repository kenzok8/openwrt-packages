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

固件或 GitHub Actions 构建脚本应移除旧版独立 `luci-app-argon-config` 仓库的克隆步骤，并取消旧插件选项。旧版 `1.0-r20261008` 插件会重复安装主题已内置的配置、RPC、设置页及图标，导致 APK 报 `trying to overwrite ... owned by luci-theme-argon`。新固件只需选择主题；需要保留旧包名时，使用本仓库的空迁移包，整个构建树中只保留一份该包定义。已有构建缓存时，更新包定义后重新运行 `make defconfig`，并清理旧插件的编译产物再编译。

旧构建日志中的 `does not support ucode template precompilation` 是 LuCI 的跳过提示，不是上述文件冲突的原因。本包关闭模板预编译并保留 `.ut` 源码，避免 SDK 与目标设备的 ucode 字节码格式不一致；无需关闭其他 LuCI 包的预编译。

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

## 静态更新源部署

更新检查读取 `/updates/stable.json` 静态清单。路由器不调用 GitHub API；发布工作流使用自身的 `GITHUB_TOKEN` 读取正式 Release，核验主题包的 SHA256/大小后生成一份产物。GitHub Pages 直接发布该产物，Cloudflare Pages 从专用 `updates` 分支部署同一份文件。安装包继续从固定的 GitHub Release 版本下载，独立语言包仍单独安装。

首次启用需要仓库维护者完成以下配置：

1. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。`github-pages` 环境的部署规则需允许默认分支和正式发布标签；工作流需要 `contents: write` 权限来更新 `updates` 分支。
2. 本次代码进入默认分支后，在 Actions 手动运行 **Publish update feeds**。它会用当前最新正式版初始化 GitHub Pages，并创建 `updates` 分支，无需发布新版本，也无需先配置 CF。
3. 在 Cloudflare 创建 **Git 集成**类型的 Pages 项目，连接本 GitHub 仓库。生产分支选 `updates`，框架选 **None**，构建命令填 `exit 0`，输出目录填 `.`，预览分支选 **None**。记录实际分配的 `pages.dev` 地址，或绑定自己控制的域名。如果之前创建了 Direct Upload 项目，需要新建 Git 集成项目。
4. 在仓库 **Settings → Secrets and variables → Actions → Variables** 设置：

   | 仓库变量 | 值 |
   | --- | --- |
   | `ARGON_UPDATE_PRIMARY_URL` | 完整主源地址，例如 `https://<实际项目地址>/updates/stable.json` |
   | `ARGON_UPDATES_ENABLED` | `true`，启用正式发布后的自动同步 |
   | `ARGON_UPDATE_FALLBACK_URL` | 可选；默认 `https://jerrykuku.github.io/luci-theme-argon/updates/stable.json`。备用源绑定自有域名时设置。 |

5. 选择 CF 的触发方式。默认保留生产分支自动部署，发布工作流推送 `updates` 后 CF 自动构建，GitHub 无需 CF Secret。若要使用 Deploy Hook，在 CF 的 **Settings → Builds → Add deploy hook** 创建绑定 `updates` 分支的 Hook，将完整 URL 保存为 GitHub 仓库 Actions **Secret** `CF_PAGES_DEPLOY_HOOK`，并关闭 CF 的 **Enable automatic production branch deployments**，避免同一次发布构建两次。
6. 读取两端 `/updates/stable.json`，核对内容完全相同；在目标路由器网络验证主源读取、主源失败后的备用读取，以及真实包下载。配置生效后构建的新安装包会带上主源地址；设置仓库变量不会改变已经安装在设备上的主题。

此方案不再使用 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 或 `CLOUDFLARE_PAGES_PROJECT`。Hook URL 本身包含触发凭据，只存入 Secret。Hook 返回成功表示 CF 已接受构建请求，实际部署结果需在 CF Pages 查看。

发布工作流仅在正式 Release 成功后自动同步。预发布版本不进入稳定清单；延迟执行的旧版本任务发现自己已不是 Latest 时跳过。`updates` 分支只保存生成的静态文件，保留提交历史并拒绝冲突推送；如果同名分支已用于其他用途，脚本会停止而不覆盖。

重新运行 **Publish update feeds** 可再次发布 GitHub Pages；清单未变化时不重复创建分支提交。若配置了 Hook，即使分支内容未变化也会重新触发 CF，便于重试失败的部署；仅使用 Git 自动部署时，需要在 CF 中重试构建或新增清单提交。两端发布任务互相独立，一端失败不会阻止另一端发布。

清单字段包括 `schema`、`repository`、`tag`、`published_at`、`notes`，以及 `apk`/`ipk` 文件名和对应的 `_sha256`/`_size`。由最终发布包计算元数据，不从 master 的 Makefile 推断最新版。两种格式均须完整且属于同一版本；客户端拒绝损坏清单，并保留上一次成功记录。请求只在手动检查时发起，成功缓存五分钟，双源均失败后冷却一分钟。

源码构建默认不包含 CF 地址。需要自行指定时，在打包前执行：

```sh
python3 .github/scripts/generate_update_site.py sources \
  --primary 'https://YOUR_DOMAIN/updates/stable.json' \
  --output root/usr/share/argon/update-sources.json
```

主备地址须为完整 HTTPS URL，不含凭据、端口、查询参数或片段。路由器端配置位于 `/usr/share/argon/update-sources.json`；下载地址由安装器固定构造，清单不能指定任意包下载 URL。此目录的配置不属于 `/etc/config/argon` 用户设置，后续主题安装包会更新它。

参考：[Cloudflare GitHub 集成](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)、[Deploy Hooks](https://developers.cloudflare.com/pages/configuration/deploy-hooks/)、[分支部署控制](https://developers.cloudflare.com/pages/configuration/branch-build-controls/)、[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 检查

准备 Node.js 22+、Python 3、LESS 4.1.3，以及与目标 OpenWrt 运行时匹配的 Ucode：

```sh
UCODE_BIN=/path/to/ucode sh .github/scripts/check_theme.sh
```

脚本检查 JavaScript、Shell、Ucode 语法，核对 LESS 与 CSS 产物，并运行 Node / Python 测试。CI 的 Ucode 构建步骤见 [check.yml](../.github/workflows/check.yml)。

UI 改动应检查实际受影响页面的亮暗色、桌面与窄屏，以及相关的键盘焦点、长文本和减少动画场景。网络和硬件行为仍需相应 OpenWrt 环境验证。
