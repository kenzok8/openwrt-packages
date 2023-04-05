# Update log for master branch

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
