#!/bin/sh
# Render the theme templates with OpenWrt's ucode (run inside an OpenWrt rootfs
# container with the repository mounted at /source).
set -eu
T=/source/ucode/template/themes/carbon
render() { ucode /source/tests/render-template.uc "$@"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

mkdir -p /www /usr/share/carbon
cp -R /source/htdocs/. /www/
cp /source/root/usr/share/carbon/version /usr/share/carbon/version
v=$(cat /usr/share/carbon/version)

out=$(render "$T/header.ut" zh-cn)
printf '%s' "$out" | grep -q "carbon.css?v=$v\"" || fail "css version"
printf '%s' "$out" | grep -q "carbon.js?v=$v\"" || fail "js version"
printf '%s' "$out" | grep -q "/luci-static/carbon/i18n/zh-cn.js?v=$v\"" || fail "zh-cn catalogue"
printf '%s' "$out" | grep -q 'id="topmenu"' || fail "app shell"
printf '%s' "$out" | grep -q '<b>' && fail "hostname not stripped"
render "$T/header.ut" zh_Hant | grep -q '/i18n/zh-tw.js' || fail "zh_Hant alias"
render "$T/header.ut" zh-hans | grep -q '/i18n/zh-cn.js' || fail "zh-hans alias"
render "$T/header.ut" en | grep -q '/i18n/' && fail "english loads no catalogue"
render "$T/header.ut" '../x' | grep -q '/i18n/' && fail "unsafe language code"
render "$T/header.ut" en login | grep -q 'cb-login-card' || fail "login layout"
render "$T/header.ut" en login | grep -q 'Test Router' && fail "login page shows the device model"
render "$T/header.ut" en | grep -q '<small>Test Router</small>' || fail "sidebar shows the device model"
render "$T/footer.ut" en | grep -q "L.require('menu-carbon')" || fail "footer"
render "$T/header.ut" en | grep -q 'src="/luci-static/carbon/logo.svg" alt="">' || fail "default logo"
mkdir -p /www/luci-static/carbon/custom
printf '\211PNG\r\n\032\n' > /www/luci-static/carbon/custom/logo.png
out=$(render "$T/header.ut" en)
printf '%s' "$out" | grep -q 'class="cb-brand-logo" src="/luci-static/carbon/custom/logo.png?v=[0-9]*" alt="" data-custom>' || fail "custom sidebar logo"
printf '%s' "$out" | grep -q 'rel="icon" href="/luci-static/carbon/custom/logo.png?v=' || fail "custom favicon"
render "$T/header.ut" en login | grep -q 'class="cb-login-logo" src="/luci-static/carbon/custom/logo.png?v=' || fail "custom login logo"
rm -r /www/luci-static/carbon/custom
rm /usr/share/carbon/version
render "$T/header.ut" en | grep -q 'carbon.js?v=dev"' || fail "missing version file falls back to dev"
echo "templates render OK ($v)"
