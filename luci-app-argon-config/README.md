# Argon configuration compatibility package

English · [简体中文](README_ZH.md)

Argon 3.0 includes its settings page, backgrounds, branding and RPC services in [luci-theme-argon](https://github.com/jerrykuku/luci-theme-argon). This repository's master branch now supplies an **empty 3.0 migration package** under the existing `luci-app-argon-config` name. It no longer installs these files or separate translations.

New firmware only needs `luci-theme-argon`. Existing scripts that clone this repository can retain the package name after updating to the migration package. Keep exactly one package definition in the build tree; do not also include the theme repository's copy. The old 1.0 plugin conflicts with the integrated theme and causes `trying to overwrite ... owned by luci-theme-argon` errors.

On an existing router, upgrade to the empty migration package first, then install the 3.0 theme from the same release. The migration package backs up old settings for the theme to restore. Do not uninstall the old plugin first. See the [theme's migration instructions](https://github.com/jerrykuku/luci-theme-argon/blob/master/README.md#installation).

The theme repository supplies `luci-i18n-argon-config-*` translations. Argon 2.x and earlier themes should not use this empty package; the standalone plugin remains available at commit `445af53fbee6e00fa6efc0ae33f8b2854df65500`. The 18.06 branch retains its existing purpose.
