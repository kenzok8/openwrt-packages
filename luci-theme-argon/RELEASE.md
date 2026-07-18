# Update log for master branch

## v2.4.5 [ 2026.07.18 ]

### What's Changed
* 修复输入框显示不全 by @Rain-Maple in https://github.com/jerrykuku/luci-theme-argon/pull/684
* fix(apk): avoid replacing uclient-fetch with wget-nossl by @jelipo in https://github.com/jerrykuku/luci-theme-argon/pull/685
* fix(openclash): align CBI zebra row spacing by @Aethersailor in https://github.com/jerrykuku/luci-theme-argon/pull/686

### New Contributors
* @Rain-Maple made their first contribution in https://github.com/jerrykuku/luci-theme-argon/pull/684
* @jelipo made their first contribution in https://github.com/jerrykuku/luci-theme-argon/pull/685
* @Aethersailor made their first contribution in https://github.com/jerrykuku/luci-theme-argon/pull/686

**Full Changelog**: https://github.com/jerrykuku/luci-theme-argon/compare/v2.4.4...v2.4.5
## v2.4.4 [ 2026.07.16 ]

### What's Changed
* Dynlist indicate drop target by @jjm2473 in https://github.com/jerrykuku/luci-theme-argon/pull/590
* feat(online_wallpaper): get rid of curl by @1715173329 in https://github.com/jerrykuku/luci-theme-argon/pull/603
* chore(template): rewrite into ucode by @msylgj in https://github.com/jerrykuku/luci-theme-argon/pull/602
* fix some css style error by @msylgj in https://github.com/jerrykuku/luci-theme-argon/pull/607
* WIP: fix(css): fix some css issues by @msylgj in https://github.com/jerrykuku/luci-theme-argon/pull/617
* 修复luci-app-poweroffdevice、admin-system-reboot的按钮宽度问题，修复首页/状态页的 Hide、Show 按钮 by @yhl452493373 in https://github.com/jerrykuku/luci-theme-argon/pull/622
* 修复两处样式异常 by @guowenju in https://github.com/jerrykuku/luci-theme-argon/pull/632
* Wallhaven.cc loading fix by @AcidSlide in https://github.com/jerrykuku/luci-theme-argon/pull/634
* MWAN3 specific only - css fix by @AcidSlide in https://github.com/jerrykuku/luci-theme-argon/pull/633
* 优化openclash的公告栏边距 by @yhl452493373 in https://github.com/jerrykuku/luci-theme-argon/pull/637
* fix(nlbw): 修复`带宽监控`页面选择器并优化按钮布局 by @guowenju in https://github.com/jerrykuku/luci-theme-argon/pull/649
* fix: smartdns: fix padding loss in layout style by @sydnkj in https://github.com/jerrykuku/luci-theme-argon/pull/650
* luci-static/menu-argon: add missing ModeMenu handling by @feckert in https://github.com/jerrykuku/luci-theme-argon/pull/651
* fix(nftables): 修复`检测到旧版规则` `alert-message` 弹窗点击关闭按钮无效的问题 by @guowenju in https://github.com/jerrykuku/luci-theme-argon/pull/652
* 修复某些弹窗loading图标位置问题 by @yhl452493373 in https://github.com/jerrykuku/luci-theme-argon/pull/659
* Comment out X-Frame-Options meta tag by @yws112358 in https://github.com/jerrykuku/luci-theme-argon/pull/663
* 修复在最新openwrt上的一些问题 by @yhl452493373 in https://github.com/jerrykuku/luci-theme-argon/pull/666
* 修复OpenWrt 25.12主页样式异常 by @guowenju in https://github.com/jerrykuku/luci-theme-argon/pull/658
* 修复一些发现的问题 by @yhl452493373 in https://github.com/jerrykuku/luci-theme-argon/pull/668
* Fix Safari rendering issues on login and LuCI pages by @Nonosword in https://github.com/jerrykuku/luci-theme-argon/pull/670
* Update LUCI_DEPENDS to use wget-any by @1-1-2 in https://github.com/jerrykuku/luci-theme-argon/pull/671
* Revert "Update LUCI_DEPENDS to use wget-any" by @jerrykuku in https://github.com/jerrykuku/luci-theme-argon/pull/673
* 修复主页(dashboard)DHCP设备表格布局异常 by @guowenju in https://github.com/jerrykuku/luci-theme-argon/pull/674
* fix(css): remove transform on tooltip by @ckorber in https://github.com/jerrykuku/luci-theme-argon/pull/678

### New Contributors
* @1715173329 made their first contribution in https://github.com/jerrykuku/luci-theme-argon/pull/603
* @guowenju made their first contribution in https://github.com/jerrykuku/luci-theme-argon/pull/632
* @sydnkj made their first contribution in https://github.com/jerrykuku/luci-theme-argon/pull/650
* @feckert made their first contribution in https://github.com/jerrykuku/luci-theme-argon/pull/651
* @yws112358 made their first contribution in https://github.com/jerrykuku/luci-theme-argon/pull/663
* @Nonosword made their first contribution in https://github.com/jerrykuku/luci-theme-argon/pull/670
* @1-1-2 made their first contribution in https://github.com/jerrykuku/luci-theme-argon/pull/671
* @ckorber made their first contribution in https://github.com/jerrykuku/luci-theme-argon/pull/678

**Full Changelog**: https://github.com/jerrykuku/luci-theme-argon/compare/v2.4.3...v2.4.4
## v2.4.3 [ 2025.07.22 ]

- **Refactor**: Remove jQuery dependency, fully replace with vanilla JavaScript
- **Modernize**: Upgrade HTML meta tags for better security and compatibility
- **Security**: Add security-related HTTP headers (CSP, XSS protection, clickjacking protection, etc.)
- **Font System**: Modernize font system with Google Sans font support
- **Font Optimization**: Replace legacy font formats (eot/svg/ttf) with woff2 for better performance
- **CSS Upgrade**: Upgrade Pure CSS to v3.0.0
- **Menu Enhancement**: Improve menu animations, remove jQuery dependency and sync animation timing
- **Style Improvement**: Add dockerman related style support
- **Mobile Optimization**: Optimize mobile and PWA related meta tag configurations
- **Icon Organization**: Reorganize website icon links following modern standards
- **Accessibility**: Improve web accessibility by allowing user scaling
- **Code Structure**: Optimize code structure with logical grouping comments

## v2.3.1 [ 2023.04.20 ]

- Fixed the issue where the dropdown menu was being clipped.
- Fixed the problem where the exit icon was replaced with the app store icon.
- Fixed the issue where some colors were out of control in dark mode.
- Fixed the problem where the local startup script textarea could not be scrolled in the startup item.
- Fixed the problem where the Passwall node list button was misaligned.
- Fixed the text overflow problem in dynlist 
- Support wallpaper from Unsplashargon
- Fix menu style mis-match on macOS+Chrome
- Fixed the issue of the login page icon becoming larger
- Support wallpaper from wallhaven
  > open footer links in new tab
- Remake theme icon

## v2.3 [ 2023.04.03 ]

- Updated the style of Loading.
- Fixed a large number of CSS style errors and made the overall more uniform.
- Fixed the problem of uncontrolled individual colors in dark mode.

## v2.2.9

- Unify the settings of css spacing
- Refactored the code of the login page
- Fix the problem that the Minify Css option is turned on when compiling, which causes the
- Fix the problem that the menu could not pop up in mobile mode
- Unify the settings of css spacing
- Refactored the code of the login page

## v2.2.8

- Fix the problem that the Minify Css option is turned on when compiling, which causes the frosted glass effect to be invalid and the logo font is lost.

## v2.2.5

- New config app for argon theme. You can set the blur and transparency of the login page of argon theme, and manage the background pictures and videos.[Chrome is recommended] [Download](https://github.com/jerrykuku/luci-app-argon-config/releases/download/v0.8-beta/luci-app-argon-config_0.8-beta_all.ipk)
- Automatically set as the default theme when compiling.
- Modify the file structure to adapt to luci-app-argon-config. The old method of turning on dark mode is no longer applicable, please use it with luci-app-argon-config.
- Adapt to Koolshare lede 2.3.6。
- Fix some Bug。

## v2.2.4

- Fix the problem that the login background cannot be displayed on some phones.
- Remove the dependency of luasocket.

## v2.2.3

- Fix Firmware flash page display error in dark mode.
- Update font icon, add a default icon of undefined menu.

## v2.2.2

- Add custom login background,put your image (allow png jpg gif) or MP4 video into /www/luci-static/argon/background, random change.
- Add force dark mode, login ssh and type "touch /etc/dark" to open dark mode.
- Add a volume mute button for video background, default is muted.
- fix login page when keyboard show the bottom text overlay the button on mobile.
- fix select color in dark mode,and add a style for scrollbar.
- jquery update to v3.5.1.
- change request bing api method form wget to luasocket (DEPENDS).

## v2.2.1

- Add blur effect for login form.
- New login theme, Request background imge from bing.com, Auto change everyday.
- New theme icon.
- Add more menu category icon.
- Fix font-size and padding margin.
- Restructure css file.
- Auto adapt to dark mode.
