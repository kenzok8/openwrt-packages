# Developing Argon 3.0

[简体中文](DEVELOPMENT_ZH.md) · [README](../README.md)

## Build with OpenWrt

From an OpenWrt build tree:

```sh
cd package
git clone https://github.com/jerrykuku/luci-theme-argon.git
cd ..
make menuconfig
# LuCI → Themes → luci-theme-argon
make package/luci-theme-argon/compile V=s
```

Theme settings are included. Select the nested `compat/luci-app-argon-config` package under LuCI applications only when building the migration package. Existing translation names remain `luci-i18n-argon-config-*`.

Release CI builds IPK with the OpenWrt 23.05.5 SDK and APK v3 with the 25.12.5 SDK. Ucode templates ship as source to avoid tying packages to one runtime's bytecode format.

Translations use `PKG_PO_VERSION` to follow the theme release, including `-r<revision>` for APK. IPK translations retain a `v` prefix (for example, `v3.0.1`) so ordinary installation upgrades the broken v3.0.0 `unknown` version. Keep that prefix in future IPK releases. CI reads each translation's internal package metadata and blocks artifact upload and publication if the version is wrong.

## Source map

| Location | Responsibility |
| --- | --- |
| `less/cascade.less` | Style entry point and import order |
| `less/theme.less` | Light/dark palette and semantic color tokens |
| `less/spacing.less`, `less/shape.less` | Spacing and corner tokens |
| `less/components/` | Shared controls, tables, tabs, dialogs and appearance menu |
| `less/pages/`, `less/page-fix.less` | LuCI/plugin adaptations and their import index |
| `less/responsive.less` | Viewport adaptations |
| `htdocs/luci-static/argon/` | Compiled CSS, images, fonts and SVG icons |
| `htdocs/luci-static/resources/` | Theme settings and LuCI JavaScript modules |
| `ucode/template/themes/argon/` | Login and application templates |
| `root/` | UCI defaults, RPC services, ACLs and integration files |
| `po/` | Argon Config translations |
| `tests/` | Behavior and integration checks |

## Styles

Edit LESS sources, then regenerate the committed stylesheet with LESS 4.1.3:

```sh
npm install --global less@4.1.3
lessc less/cascade.less htdocs/luci-static/argon/css/cascade.css
```

Light and dark modes share this one stylesheet. Each `@theme-palette` row in `theme.less` defines `role: light, dark;`; one value means both modes share it. Use semantic tokens for text, surfaces, borders and states. Legacy variable aliases exist for LuCI compatibility.

Imports run from tokens and base controls through login/application layout, shared components, page adaptations, and responsive rules. Add common behavior to its component module; keep plugin selectors in `pages/`. The `page-fix.less` file is an import index.

Maintain page/card insets and section, field, control and action gaps through spacing tokens. Small screens reduce outer and card insets to `1rem`. Keep long labels wrapping and let form controls shrink to their containers. Escape native CSS `min()` expressions when LESS would evaluate them prematurely.

Corner tokens cover labels, controls, panels, cards and dialogs. Keep the inside edges of joined controls square. Avoid clipping entire cards: dropdowns and tooltips can extend beyond them. Tables handle their own final-row corners and narrow-screen layout.

Preserve native LuCI structures and interactions. Tab bars join their following content containers; section content owns its vertical spacing. Modal actions wrap or stack as space requires, and long content scrolls through the overlay. Dropdown positioning and scrolling remain controlled by LuCI. Restrict hover effects to hover-capable devices and respect reduced motion.

## Templates

LuCI's `header`, `header_login`, `out_header_login`, `sysauth` and footer entry points remain available.

| Template | Responsibility |
| --- | --- |
| `head.ut` | Validated settings, metadata, styles and conditional application resources |
| `sysauth.ut` | Login layout and shared template assembly |
| `login_background.ut` | Wallpaper selection and image/video output |
| `login_form.ut` | Authentication fields, messages and plugin content |
| `page_scripts.ut` | Scripts shared by the footer entry points |

Pass local values through the second argument of `include`. Login pages do not load application LuCI modules. Only `classic` and `centered` are accepted as `login_style`; unknown values fall back to `classic`.

## Configuration and branding

Settings stay in `/etc/config/argon`; the settings route remains `/admin/system/argon-config`. Fresh installs use local backgrounds, classic login, 10px blur and 0.5 panel opacity. Existing options survive upgrades.

New installations derive dark colors from the primary seed. Existing explicit dark colors stay custom. Dark login glass settings can inherit the light values or keep independent overrides. Switching back to automatic/inherited settings retains custom values for later use.

The header appearance menu saves only its mode through `luci.argon_appearance`. The preference is device-wide and requires Argon write access. Keep this independent from pending form settings; failed saves reconcile with the stored mode.

Uploaded branding lives in `/www/luci-static/argon/branding/`; backgrounds live in `/www/luci-static/argon/background/`. Upload/reset operations apply immediately. Branding does not replace packaged images, and both directories are included in configuration-preserving upgrade backups. The browser icon also supplies the touch icon and manifest; existing home-screen shortcuts may need to be added again.

## Menu icons

Top-level menu nodes resolve `htdocs/luci-static/argon/icon/<node-name>.svg`, independently of translated titles. Filenames are case-sensitive and accept letters, digits, underscores and hyphens. Missing icons use `default.svg`.

Use monochrome SVGs with a `viewBox` and transparent background. CSS masks supply theme and interaction colors. Shared chevrons use the same 24×24 grid and 2px round strokes. See the [icon index](../htdocs/luci-static/argon/icon/README.md) for available assets. This mechanism is separate from uploaded browser icons and login logos.

## Checks

Use Node.js 22+, Python 3, LESS 4.1.3 and a Ucode build matching the supported OpenWrt runtime:

```sh
UCODE_BIN=/path/to/ucode sh .github/scripts/check_theme.sh
```

The script checks JavaScript, shell and Ucode syntax, verifies compiled CSS against LESS, and runs the Node/Python tests. CI's Ucode build is defined in [check.yml](../.github/workflows/check.yml).

For UI changes, check the actual affected LuCI pages in light/dark modes and desktop/mobile widths, including keyboard focus, long text and reduced motion where relevant. Network and hardware behavior still needs a suitable OpenWrt environment.
