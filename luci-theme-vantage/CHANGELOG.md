# Changelog

User-visible changes per release, newest first. Dates are the tag dates.
Each release ships both packages, `luci-theme-vantage` and
`luci-app-vantage`, at the same version; the packages are listed at
<https://github.com/anothaDev/luci-theme-vantage/releases> and in the
[signed repositories](https://anothadev.github.io/luci-theme-vantage/).

## 1.0.20 - 2026-11-12

- **rpcd no longer crashes on MediaTek mtwifi routers** (#124,
  [@zy912172991-cell](https://github.com/zy912172991-cell)). 1.0.19's
  dashboard asked rpcd for the radios' channel survey on every refresh,
  and rpcd calls a function that only libiwinfo's nl80211 backend has:
  on any other, such as MediaTek's mtwifi in the mt798x builds, each
  refresh crashed rpcd and took LuCI down with it. Vantage's own plugin
  now reads the survey from the kernel, and only for interfaces that
  cfg80211 drives. The dashboard's read permission (`luci-app-vantage`)
  no longer grants `iwinfo survey` and grants `luci.vantage survey`
  instead; the app now depends on `ucode-mod-nl80211`. **If 1.0.19 took
  LuCI down on your router, close every LuCI tab and upgrade over SSH:**
  `apk update && apk add --upgrade luci-app-vantage luci-theme-vantage`
  (24.10: `opkg update && opkg upgrade luci-app-vantage
  luci-theme-vantage`), then `/etc/init.d/rpcd restart`.
- **Dashboard: radio cards wide enough for their channel** (#122,
  [@VIKINGYFY](https://github.com/VIKINGYFY)). The radio cards widen
  together, up to 240 px, when a label such as "Ch 128 · 160 MHz" needs
  it, instead of cutting it off.
- **Dashboard: the uplink's link rate on a line of its own when needed**
  (#122). When the uplink card's line does not fit, the link rate moves
  whole to the next line instead of breaking after "Gbit/" or inside
  "链路".
- **Wireless: a tidier list** (#122). No empty band above the first
  radio, a network's second line starts under its name, radios are
  separated by one line instead of two, and the signal in a network's
  status keeps one width, so the details beside it no longer move.

## 1.0.19 - 2026-11-11

- **Dashboard: less router work again** (#101,
  [@Groupguanfang](https://github.com/Groupguanfang)). Radio details
  (16-22 ms a radio on an access point) are asked every 30 seconds, or
  at once when a radio's channel or state changes; the noise floor still
  comes every poll, from the radio's channel survey (1.5-2 ms); device
  names from the DHCP leases every 30 seconds, and right after a device
  appears. On a 4-core access point a minute of polling went from about
  850 ms of CPU to 490 ms. The dashboard's read permission
  (`luci-app-vantage`) now also grants `iwinfo survey` (read-only).
- **Dashboard: wired devices on routers with a switch chip** (#101). The
  full read of the bridges' device table also has the switch driver read
  its chip's own table (29 ms on a MediaTek MT7981); it now runs only
  when a device joins, leaves or changes port, or every 30 seconds, and
  most refreshes read the kernel's own copy (0.1 ms).
- **Dashboard: the CPU card no longer says "Measuring"** (#101). Until
  its first reading, about a second after the page opens, it shows this
  browser's last reading of the router (under ten minutes old) or 0%.
- **Dashboard: Wi-Fi clients on a router keep their IPv4 address**
  (#110, [@MohdMusab](https://github.com/MohdMusab)). They were filtered
  by the internet line's subnet, so they showed only an IPv6 address and
  reverse DNS and mDNS could not name them.
- **Lighter motion.** The pulses (the status circle's ring, the Live
  beat, the top bar's refresh dot on every refreshing page) and the
  network path's backdrop move 15-20 times a second instead of 60, and
  look the same: the browser draws far fewer frames for them.
- **Appearance: options of equal width**; "Grid packets" is now "Grid".

## 1.0.18 - 2026-11-10

- **Dashboard: much less work for the router** (#101,
  [@Groupguanfang](https://github.com/Groupguanfang)). The dashboard's
  server side rebuilt its text patterns on every check, which cost
  milliseconds each on a router, and radio details were asked once a
  network instead of once a radio: on a 4-core access point a whole
  5-second poll went from about 180 ms of CPU to 70 ms (the dashboard's
  own calls from about 120 ms to 15 ms), with the same answers. A reload
  no longer polls twice or reads the page's own build as the CPU load, so
  the CPU card stops jumping to 100% on every refresh.
- **Dashboard: Low-power router** (#101). Appearance → Low-power router
  (with the dashboard; off by default) keeps the live numbers but asks
  for the slow parts (Wi-Fi state, radio details, temperatures, wired
  hosts) every 30 seconds, drops the network path's backdrop and moving
  dots and the login page's particles, and after 5 minutes without input
  refreshes every 30 seconds until you touch the page again.
- **Dashboard: a far-away device needn't warn** (#110,
  [@MohdMusab](https://github.com/MohdMusab)). A device's details have
  "Don't warn about its signal": its weak signal then stays out of the
  Signal warning, for every browser. It is kept beside the names in
  `/etc/config/vantage`, through the dashboard's names permission
  (`luci-app-vantage-names` now also grants `luci.vantage set_quiet`).
- **Dashboard: a radio you switched off is no warning** (#110). The Wi-Fi
  card still says it is off.
- **Theme: a one-click light/dark switch and a gear for Appearance**
  (#109, [@Gimenz](https://github.com/Gimenz)). The sun/moon cycles
  automatic, the look your system doesn't use, the one it does; the gear
  next to it opens Appearance. The hostname · model chip opens Status →
  Overview.
- **Check for updates works.** The package build's minifier changed one
  pattern, so the check could never read the list on a router (#109).
- **Theme: wide screens** (#113,
  [@smallprogram](https://github.com/smallprogram)). Past about 1920
  pixels the content column grows with the window, up to 2400 pixels,
  instead of leaving most of a 2K or 4K screen empty.
- **Theme: PassWall's node list is opaque again** (#112,
  [@trosh2023](https://github.com/trosh2023)). Since Chrome 135 it copied
  a see-through colour from the selected option.
- **Theme: logins with a second factor** (#114,
  [@yipush](https://github.com/yipush)). With LuCI's authentication
  plugins (luci-plugin-2fa, after 25.12) the login page shows their
  fields, guidance and errors, and their own content.
- **Motion stops while you're in another window**: the dashboard's
  moving parts and the top bar's refresh dot stand still until the window
  has the focus again; the numbers keep updating.

## 1.0.17 - 2026-11-08

- **Install commands stop when a check fails.** Each pasted block now
  chains its steps, so a key or file that doesn't match its published
  SHA-256 stops it before anything is trusted or installed. On 24.10 the
  key is checked by its file's SHA-256: the `usign -F` fingerprint is
  stored in the key itself and proved nothing. Files are fetched into a
  private `/tmp/vantage` folder, and Uninstall now also removes the
  signing key and the feed line, on both package managers.
- **Theme: the pulse is back** (#100,
  [@smallprogram](https://github.com/smallprogram)). The dashboard's
  status circle pulses slowly while all is fine and faster when something
  needs attention, and the top bar's refresh dot does the same: soft green
  while refreshing, amber and faster on a warning or while reconnecting,
  red on an error. The login page has no dot.
- **Theme: the login page shows the router's hostname** instead of
  "Authorization Required" (#100).
- **Theme: a name next to the logo** (#100). Appearance → Next to the
  logo shows the hostname or the model beside the logo; the default stays
  the logo only.
- **Installed version and a Check for updates button** (#102,
  [@bakaranadnan-a11y](https://github.com/bakaranadnan-a11y)). The
  dashboard's System tile and Appearance show the version. Check for
  updates reads the project's package list from your browser, only when
  you click it, without cookies or a referrer; nothing installs by itself.
- **Theme: the memory meter on Kwrt** (#103,
  [@keriesli](https://github.com/keriesli)). Status → Overview showed
  100% available and 0 B in use with luci-mod-status builds that have no
  "Total Available" row; those are read too now, swap included.
- **Dashboard: on routers without Wi-Fi the network path shows the Wired
  branch** (#98, [@VIKINGYFY](https://github.com/VIKINGYFY)), with its
  hosts, as on Wi-Fi devices.
- **Theme: text fields in tables keep their width** (#106,
  [@elonnzhang](https://github.com/elonnzhang)). A column with a short
  header, such as Name and Path in Network Shares, shrank to a sliver
  and hid its value.
- **Dashboard: pausing stops the motion.** Paused from the top bar's
  refresh pill, the status ring, the flow dots and the backdrop stand
  still; the CPU reading starts over on resume.
- **Dashboard: history stays with one login.** The charts' history kept
  in the browser tab is dropped at logout and ignored by another login in
  the same tab.

## 1.0.16 - 2026-11-06

- **Theme: Appearance is saved on the router** (#89,
  [@smallprogram](https://github.com/smallprogram)). The colour mode
  (auto, light or dark), the login page's background and the dashboard's
  network path background were kept in each browser, so another computer
  showed the defaults. They are now saved in `/etc/config/vantage_theme`
  and the same in every browser, the login page included, from the first
  paint. With the theme installed, the dashboard's layout and chart style
  are saved there too, when you press Done under Customize; each screen
  size keeps its own layout. A browser keeps its earlier picks until
  someone changes the setting. Saving needs the theme's new rpcd group,
  `luci-theme-vantage` (root has it), which may write that one config
  only; without it a
  change stays in that browser, as before, and Appearance says so. Logins
  already open get the group too, when the install reloads rpcd.
- **Dashboard: right download rate on PPPoE with flow offloading** (#92,
  [@Omoinemie](https://github.com/Omoinemie)). Offloaded downloads skip
  `pppoe-wan`'s counters, so the uplink read a few kbit/s during a speed
  test. A PPPoE line now counts on the port under it.
- **Dashboard: the network path at medium widths.** Between about 860 and
  1050 pixels the rates slid under the device card and a long tag ran out
  of its card.
- **Esc in the Ctrl K search stays there.** It also closed a drawer behind
  the search.
- **Dashboard: every line to the internet in the network path** (#88,
  [@Bryce199805](https://github.com/Bryce199805)). With two or more WANs
  (failover by metric, or mwan3) the path showed one, and on a router
  without Wi-Fi the others appeared among the local networks. Every up
  interface with a default route of its own now sits on the internet
  side (the main one and up to four more), each with its own wire into the
  device and its live rates, and opens its own details; the one whose
  default route has the lowest metric is marked "default route", and on a
  tie the one the kernel takes (with mwan3, its own rules decide where
  traffic goes). IPv6 on the same device, on the port under a PPPoE
  session (`wan6`), or through 6rd, 6in4 or 6to4 stays part of its line. The throughput chart has a row
  per line, and each line keeps its own history across a failover. A WAN
  that is down shows nowhere until it comes up again. With one line the
  path is as before.
- **A full-tunnel VPN is drawn as a tunnel through the line.** When
  ordinary traffic goes through a VPN (WireGuard, OpenVPN, GRE, ...), the
  path shows the line it leaves by with the tunnel on its wire: a lock and
  the VPN's name under the line's rates, "default route via vpn" beside
  other lines, and the tunnel and its own rates in the line's details. The
  VPN no longer stands in for the line, and it shows on routers with
  Wi-Fi too, where the networks are not listed. Which route wins comes
  from the kernel (a new read-only `luci.vantage routes` asks it which
  route it takes to the internet, as `ip route get` does, one lookup for
  IPv4 and one for IPv6): with a VPN and a WAN of the same metric, as
  WireGuard and DHCP leave them, the kernel keeps the route added last,
  which netifd's list cannot tell, and OpenVPN adds its own. Without that
  answer, only a VPN with a lower metric than the line's counts. An IPv4
  VPN over an IPv6-only line rides it too. A VPN that holds the only
  default route is still the uplink; a backup VPN, one in its own routing
  table, and OpenVPN's `redirect-gateway def1` stay among the networks.
  With several lines the tunnel is drawn on the main one.
- **The throughput chart stops flipping to "collecting".** With five
  minutes of history, its subtitle kept switching between "last 5 min" and
  "collecting · 4 min of data", because the oldest sample kept is usually a
  few seconds short of five minutes.

## 1.0.15 - 2026-11-04

- **The dashboard and LuCI's pages look like one product.** The dashboard
  takes the theme's buttons, focus ring, tabs (the Wi-Fi/Wired switch),
  tables, menus and phone sheet, the same status colours on every
  Firewall tab and one blue meter for memory and storage, with one scale
  of weights and corners in both packages.
- **Vantage's dashboard goes with Vantage's theme** (#83,
  [@smallprogram](https://github.com/smallprogram)). With both packages
  installed and another theme selected, such as Argon, the dashboard
  still opened after login and looked broken in that theme. Dashboard
  and the page after login now open LuCI's own: Status → Dashboard when
  `luci-mod-dashboard` is installed, otherwise Status → Overview.
  Installed without the theme, the dashboard still works under any
  theme.
- **Health cards with their own icons and a picture each.** The six
  cards above the network path all carried the same check mark. Each now
  has its own icon in the corner (port, CPU, memory, Wi-Fi, signal,
  storage), coloured only when it needs attention, and a picture along
  its bottom edge: the last minutes of download and CPU, how full memory
  and storage are, the Wi-Fi clients by band (or each radio's airtime
  where the driver reports it), and how the clients' signals spread.
  Signal shows the weakest client instead of "All good".
- **Uplink traffic and CPU update every 2 seconds** instead of every 5,
  on the cards, the network path and the throughput chart. They are two
  small reads of their own (CPU times and the uplink's counters); the
  rest of the dashboard still refreshes every 5 seconds, and nothing
  polls while the tab is hidden.
- **The throughput chart's minute labels stay put** (#71,
  [@HyperdrivzZ](https://github.com/HyperdrivzZ)). While the five minutes
  of history filled, the time axis stretched with it and "−2 min" slid
  into "3 min ago" on a phone. The axis is now always five minutes, and
  the lines start part way across until the history is full.
- **The network path's background is under Appearance**, next to the
  login page's, instead of in the dashboard's Customize bar. A dashboard
  installed without the theme keeps it under Customize.
- **Less repetition on the dashboard.** The four numbers under the network
  path, which repeated the cards, are gone, and so are the hints and the
  "which is fine" notes. A device without a name is "Private device" next
  to its MAC address and "Private device 53:0F" where it has one line.
  Rates in rows carry their unit, link speeds read "2.5 Gbit/s" on the
  cards and in the details, and only open or weak networks show a lock. Noise and
  airtime rows appear only where the driver reports them. Nothing pulses
  while everything is fine, and under the Vantage theme the dashboard's
  own Live pill shows only when updates pause or fail.
- **The network path is open on phones.** It used to start folded, with
  the four numbers that are now gone as its summary. I'd like feedback on
  this one: tell me in an
  [issue](https://github.com/anothaDev/luci-theme-vantage/issues) if
  you'd rather it started folded. A fold you choose is still remembered.
- **Firewall:** reject and drop are no longer painted red, on Overview or
  in General Settings' policies; only an internet zone that accepts input
  is, in red on both. Overview's admin warning names the service and port
  it lets in (SSH, Telnet, HTTP, HTTPS), and addresses wrap instead of
  losing their port on a phone.
- **Less repetition in the shell.** A breadcrumb title shows once
  ("System", not "System › System"), the palette names each category
  once and "wire" finds the Wireless pages rather than eight firewall
  pages, the rail's flyouts drop their counts and Ctrl K footer, the host
  chip leaves out a name the other contains, and the word "Vantage" is
  gone from the rail and the login page. Storage bars label their total.
- **The shell's dots stay still.** The auto-refresh pill has a still
  dot (a pause or play sign on narrow screens), and Status → Overview
  marks only boxes that are down, not every one that is up.
- **File Manager in dark mode** (#84, [@QiuSimons](https://github.com/QiuSimons)).
  `luci-app-filemanager` brings a light palette of its own, so its status
  bar was a white band with unreadable text and a hovered row washed out;
  they take the theme's colours now.
- **Fixes:** theme buttons render at their intended weight, pages before
  login are titled "LuCI" instead of "LuCI · LuCI", a page that does not
  exist says "Not found" instead of "Administration", the memory bar
  clears when memory stops being reported, switching Clients between
  Wi-Fi and Wired no longer leaves a tall empty tile for 30 s, and the
  address follows when you open a client from a radio's details.

## 1.0.14 - 2026-11-03

- **The spinner while changes are applied turns smoothly** (#71,
  [@HyperdrivzZ](https://github.com/HyperdrivzZ)). LuCI rebuilds the
  "Applying configuration changes… 89s" notice every second, and the
  spinner started over from the top each time.
- **Software on a phone** (#71). The Actions buttons wrap instead of
  running past the card, which made the page wider than the screen and
  pushed its dialogs off the right edge, and a package's dependency tree
  wraps inside its dialog instead of cutting off the status labels.
- **"Signal · 3 weak" lists all three** (#71). With more than one weak
  client, the dashboard's Signal check opens the clients list on its Weak
  signal filter instead of only the weakest client's details.
- **Wireless's Associated Stations stay in their card** (#74,
  [@kylesean](https://github.com/kylesean)). LuCI 25.12 now puts the list
  in a section of its own, and with names and addresses in Host it ran
  past the card's edge on narrower desktop windows. The rate lines wrap
  when space runs short, and on 25.12 the card scrolls if it still
  doesn't fit.
- **Vantage's dashboard and `luci-mod-dashboard` side by side** (#77,
  [@smallprogram](https://github.com/smallprogram)). Both use the
  `admin/dashboard` menu entry, and LuCI showed its own dashboard there.
  Vantage's now opens after login, and LuCI's is under Status →
  Dashboard.
- **Dashboard: its stylesheet comes from the browser's cache** until a
  package changes, versioned the way LuCI versions its scripts, instead
  of being rechecked with the device on every page load.
- **LuCI 25.12's apply warnings read again.** "Connectivity change",
  "Configuration changes have been rolled back!" and "Device
  unreachable!" put their title, text and any buttons side by side, the
  text squeezed into a narrow column; they stack now, the buttons on the
  right.

## 1.0.13 - 2026-11-02

- **Dashboard: a port's traffic on its node** (#67,
  [@bakaranadnan-a11y](https://github.com/bakaranadnan-a11y)). Each port
  node in the network path's Wired branch shows the port's live traffic,
  and a device on a shared port (a switch or another access point behind
  it) shows the port's total in its details, under "Not counted per
  device". It stays the port's: no device gets a share of it.
- **Dashboard: the switch ports behind a swconfig VLAN** (#67). Where a
  port is a VLAN on a swconfig switch (`eth1.1` on routers with a
  hardware switch), a device's details list the VLAN's switch ports and
  their links, from LuCI's own switch port state, asked at most every
  30 seconds. Ports are named as swconfig numbers them ("Port 1") unless
  the board description numbers them per role ("LAN 2"). When only one of them has a link, the devices behind it get
  that port's speed instead of the switch's link to the CPU. Which port
  each device is on stays unknown otherwise. The app's read permission
  gains `luci getSwconfigPortState`.

## 1.0.12 - 2026-11-01

- **Dashboard: an animated network path.** The path's dot grid carries
  packets now, the login page's "Grid packets": downloads run from the
  gateway's side, uploads back, more and faster with the live uplink
  rate. Under Customize, "Network path background" switches to the
  login page's starfield, streaming out of the device's node, or turns
  it off. It runs at 20 frames a second on a quiet uplink and up to 30
  on a busy one, pauses while another window has the focus, the tab is
  hidden or the tile is out of view, and stands still with reduced
  motion.
- **Dashboard: a jump from the network path stops below the top bar.**
  Clicking an SSID, Wired or port node scrolled the Clients tile's head
  under the sticky top bar.
- **Dashboard: the numbers under the network path stay in their cells**
  on a phone; a long line such as the clients per band ends with "…"
  instead of running into the next cell.
- **Dashboard: wired devices** (#62,
  [@HyperdrivzZ](https://github.com/HyperdrivzZ)). The Clients tile now
  lists the devices on Ethernet ports too, with a Wi-Fi/Wired switch
  where a device has both: name, address, vendor, port, link speed and
  live traffic for a device alone on its port, and when each was last
  heard. Routers without Wi-Fi get the Clients tile for them, and the
  network path shows a Wired branch with a node per port. The quick
  filters moved into a menu at the end of the search box, so the tile
  fits on a phone. Wired devices get reverse DNS names and vendors like
  Wi-Fi clients, and those on a bridge VLAN their network and address;
  devices reached through the uplink port are tagged Upstream. At most
  128 are listed per port, and none when the bridges have learned 4,096
  addresses or more, so a flood of made-up addresses cannot exhaust the
  device's memory.
- **Dashboard: the right uplink port on a bridge with several.** An
  access point whose LAN bridge has more than one Ethernet port took the
  first one as its uplink, for the uplink's traffic, link speed and
  "No link" check. It now takes the port the bridge learned the gateway
  on (also over IPv6, and through a VLAN on the bridge), else one with a
  link.
- **Dashboard: Wi-Fi on firmware without netifd's wireless status** (#60,
  [@bakaranadnan-a11y](https://github.com/bakaranadnan-a11y)). Vendor
  drivers that bypass netifd, such as MediaTek's mtkwifi on GL.iNet
  firmware, left the Wi-Fi section empty. The radios and networks now
  come from the wireless configuration there, with run state from
  iwinfo, and a configured Wi-Fi 7 (EHT) mode is shown even when the
  driver reports Wi-Fi 6, also where netifd answers but lists no radio.
  OpenWrt's own drivers are read as before.
- **Firmware upload: the progress bar fills its dialog** (#59,
  [@VIKINGYFY](https://github.com/VIKINGYFY)), and the upload dialog's
  Cancel and Upload buttons sit on the line with Browse….
- **Realtime Graphs on a phone:** the current, average and peak values
  of each line get a row each instead of running into each other.

## 1.0.11 - 2026-10-30

- **Dashboard: the uplink in use when there are several** (#56,
  [@wolvth](https://github.com/wolvth)). With two WANs the dashboard
  showed the one named wan, even when traffic left through the other,
  preferred by its lower metric. It now picks as the kernel does for
  ordinary traffic: a default route in the main table, IPv4 before IPv6,
  then the lowest metric; the name only breaks a tie. With DS-Lite or
  MAP-E it shows the IPv6 line, not the tunnel.
- **Dashboard: temperature** (#56). The CPU check and the System tile
  show the hottest temperature sensor, and the tile's tooltip lists each
  one. A new read-only plugin method, `luci.vantage thermal`, reads the
  thermal zones in `/sys/class/thermal` and nothing else; LuCI grants it
  at login, so the reading appears after your next login. A device
  without thermal zones shows none.
- **Theme: login page backgrounds and an Appearance menu.** Behind the
  login form, lime packets run along the grid lines (the default) or a
  starfield flies past, and logging in speeds them up. One canvas and no
  libraries; it pauses while the window is in the background and stays
  still with reduced motion. The colour-scheme button in the header now
  opens an Appearance menu: colour (auto, light or dark) and login
  background (grid packets, starfield or none), kept per browser; the
  command palette (Ctrl+K) offers both.
- **Theme: field help.** Descriptions use the full width of the form
  (#51, [@VIKINGYFY](https://github.com/VIKINGYFY)). Help that needs
  more than one line folds to its first line, ending after the first
  sentence where that fits, and the ⓘ beside it opens the whole text.
- **Theme: dropdowns.** In Chrome, Edge and other Chromium browsers,
  plain dropdowns such as Language and Design open a themed list; on
  them ↓ opens the list instead of stepping to the next value, as
  Chromium handles styled lists, and Escape in a dialog closes only the
  list. Firefox and Safari keep their own list, now with readable
  colours. LuCI's dropdowns in a card that scrolls sideways open at full
  height below the field (DHCP and DNS → Log facility, Firewall →
  offloading), Save & Apply's menu reaches "Apply unchecked" by
  keyboard, and lists on touch screens stay on screen. The Network →
  Diagnostics dropdowns open past their card and no longer jump while
  they open (#55, [@VIKINGYFY](https://github.com/VIKINGYFY)).
- **Theme: phones.** The bottom bar brings a clipped active entry into
  view after every page load (#47, #48,
  [@LianXia233](https://github.com/LianXia233)).
- **Theme: layout fixes** ([@VIKINGYFY](https://github.com/VIKINGYFY)):
  no extra gap under a status card header above a table (#49);
  multi-line editors such as Scheduled Tasks fill their form column
  (#50); progress bar labels stay clear of the heading above at larger
  font sizes (#52); read-only log dialogs widen to 1080 px (#53); wide
  tables such as DHCP leases scroll inside their card instead of being
  cut off (#54).

## 1.0.10 - 2026-10-28

- **Simplified Chinese for the theme**, shipped as
  `luci-i18n-vantage-theme-zh-cn`, and a reworked, complete dashboard
  catalogue (#40, [@ntbowen](https://github.com/ntbowen)). Words another
  package translates differently, such as luci-app-oaf's "Free" (a free
  tier), have a context of their own, so the dashboard keeps its own
  wording; words LuCI itself translates still come from LuCI in every
  language. The Status → Firewall flow chart's labels can now be
  translated; before, none of them could.
- **Larger text no longer breaks a few layouts** (#39), as with
  Firefox's minimum font size, common for Chinese:
  - Status → Overview, Port status: the boxes fill their column and
    share one height, so a counter no longer wraps and pushes its box
    above the others on ImmortalWrt.
  - Folded field help and page intros show their whole first line;
    the bottom was cut off.
  - A table card that scrolls sideways no longer scrolls up and down by
    a few pixels, and a table in a nested section (HomeProxy's
    subscriptions) keeps the bottom of its last row (#43,
    [@VIKINGYFY](https://github.com/VIKINGYFY)).
- **Theme: a card ending in a paragraph** (HomeProxy's status) has the
  same space below the text as above it (#44,
  [@VIKINGYFY](https://github.com/VIKINGYFY)).
- **Theme: buttons and tabs** (#42, [@VIKINGYFY](https://github.com/VIKINGYFY)).
  LuCI's plain action, reload, edit, find, link and download buttons
  (Open, Restart and Refresh in add-ons such as AxonHub) are outlined in
  the accent, as Bootstrap outlines them; in table rows only Edit is, so
  rows of buttons (System → Startup) stay plain. The selected tab
  carries the accent in its text and ring.
- **Theme: Status → Overview, Port status.** Each port shows a link dot
  by its name and its speed as the figure; a port without link is
  muted. The ▲ sent and ▼ received arrows take the dashboard's upload
  and download colours, the zone is a plain bar, and LuCI's port
  picture, which only repeated the link state, is hidden. A PoE port's
  power line is readable in dark mode; it was black on black.

## 1.0.9 - 2026-10-20

- **Status → Firewall as a flow chart.** A Flow / Rules table switch over
  LuCI's page; LuCI's tables are one click away. One chart shows the way
  a packet takes (prerouting, then input, this device and output, or
  forward, then postrouting), which steps drop unmatched packets or have
  rules that drop some, and ingress, bridge and egress chains where a
  packet meets them. A second row shows traffic bridged between ports,
  such as Wi-Fi and LAN on an access point, which never reaches the
  forward chain, and says when no bridge chain filters it; a note says
  when flow offloading lets established connections skip the chains.
  Below, each chain lists its rules as steps: fw4's rule name, the
  conditions as LuCI words them, the verdict and the traffic matched; a
  jump opens the chain it jumps to in place, and a return or the end of
  a chain names where the packet goes next. It reads the ruleset with
  the command and permission LuCI's page already uses.
- **Dashboard: Top talkers keeps its height.** It shows the top three,
  always three rows tall, names on one line; before, it grew with every
  extra talker or long name and took long to shrink back.
- **Dashboard: the throughput chart picker's open list** is drawn like
  the theme's dropdowns in Chromium (rounded, themed, current choice
  marked) and keeps one width whatever is chosen.
- **Dashboard: the uplink is the interface carrying the default route.**
  Interfaces named `wan`, `wan6` or `*wan*` still win among those, so
  routers are unchanged. An access point whose WAN port was bridged into
  LAN and kept an up, unmanaged `wan` interface no longer shows "No
  default route" and keeps its gateway, DNS and management address. A
  router whose WAN has no default route of its own, with all traffic
  routed through a VPN tunnel, now shows the tunnel as the uplink, with
  its counters and addresses, labelled Gateway instead of Internet.
  (#32, [@ronger-x](https://github.com/ronger-x))
- **Tooling:** the device recorder is no longer part of the repository.
  The replay's README describes the recording format instead; the request
  policy it shared with the replay moved to `dev/replay/policy.js`.

## 1.0.8 - 2026-10-15

- **OpenWrt 24.10.** Signed `.ipk` packages and an opkg repository next
  to the 25.12 apk one, built with the pinned 24.10.8 SDK. The 24.10
  signing key is in `keys/vantage-24.10.usign.pub`; its fingerprint is in
  the [install guide](docs/INSTALL.md#openwrt-2410). Tested on a 24.10.8
  router without Wi-Fi: install, upgrade, removal, tampered index refused.
- **Theme:** an opkg upgrade keeps Vantage selected; before, the theme's
  removal script could switch LuCI back to Bootstrap during the upgrade.
- **Security:** fixes for the Low findings of the 1.0.7 review. The
  dashboard prunes per-client signal history and reverse-DNS results it
  no longer needs and caps the addresses kept per host hint; the name
  plugin's `set_alias` reverts its staged change after a failed commit;
  the spec states that DHCP, mDNS and WPS names are self-reported by the
  client and that an alias always wins.
- **Release signing** runs only in the approved `release-signing`
  environment and only for `v*` tags.

## 1.0.7 - 2026-10-15

- **Firewall overview reads the config the way firewall4 does.** Zones
  match on devices, not network names (a modem's dynamic `wan_4` is no
  longer "in no zone"); a redirect to any of the router's own addresses
  is local; an ipset restricts the source only when it matches the
  source; every zone option fw4 parses is validated and a value fw4
  refuses skips the zone; disabled zones do not exist; IKE/ESP/AH to the
  router is an opening; a ubus error is a failed read, never "Nothing is
  open". When a setup is beyond what the page checks (shared internet
  devices, covered subnets, sets a service defines) it says so and lists
  the settings to check instead of guessing (#28).
- **Theme, row action menus:** a row folds its buttons into a ⋯ menu
  only when it has a main action (Edit, else the highlighted one) and at
  least two others; Add, highlighted and an app's own buttons stay
  visible, so Wake on LAN, Startup, Processes and radio rows are back to
  their 1.0.5 layout. The menu shows LuCI's busy state, closes on Escape
  and Tab, follows label and disabled changes, and never covers its own
  button.
- **Theme, firewall pages:** badge text keeps 4.5:1 contrast on hovered
  rows; switched-off rules are greyed instead of faded; the zones table
  fits down to about 880 px and wide tables show a scroll shade; the
  rule on/off box has a 44 px target on phones; port status tooltips are
  no longer clipped (#26).
- **Theme, other LuCI versions:** Status → Firewall (nftables) and the
  log filters of LuCI 26.x are styled; OpenWrt 24.10's Status overview
  and its firewall tables (which render no name cell) display correctly;
  fixes from a sweep of OpenWrt 25.12.5 (Interfaces tooltip, crumb caret,
  phone cards, Diagnostics, Software, Connections, Repo Public Keys,
  forms).
- **Dashboard:** lane charts label each lane at its top; the chart
  picker spans the bar on phones; links to pages the router lacks are
  hidden; narrow tiles get a one-row handle bar; the CPU sparkline moves
  under the numbers when narrow; restored history is bounded to the
  rate ceiling.
- **Docs:** the install guide and security policy describe 24.10. The
  Simplified Chinese catalogue covers the new strings.

## 1.0.6 - 2026-10-14

- **Dashboard: five throughput chart styles** under Customize: overlaid,
  log scale, mirrored, separate lanes and the previous one (the chart
  part of #7).
- **New Network → Firewall → Overview tab** (`luci-app-vantage`): what is
  open from the internet, which zone reaches which, what is switched off
  or ignored, and warnings for the risky cases, each item linking to the
  LuCI page that changes it. Read-only; shown only to sessions that hold
  LuCI's `luci-app-firewall` group. The app grants nothing new.
- **Theme, firewall pages:** verdicts and policies are coloured badges,
  with a warning colour where the internet-facing zone accepts traffic;
  rules that are off are dimmed; table rows with three or more actions
  put the extra ones under a ⋯ menu.

## 1.0.5 - 2026-10-13

- **Theme: one tab style at every level** (a segmented control that
  wraps instead of scrolling tabs out of sight); page tabs sit at the top
  of the content and the current breadcrumb becomes a page switcher, a
  dropdown or the bottom sheet on phones (#21).
- **Theme, phones and add-ons:** the bottom bar reaches every category
  and keeps its layout; phone cards keep their names and grow with their
  content; modal tables become cards; adblock and banIP follow the theme
  toggle; Save & Apply opens upwards; wide tables no longer scroll the
  page; visible focus on fields; log viewers take the full width;
  contrast fixes; tabs, crumbs and top-bar buttons meet 36/44 px (#22).
- **Lighter polling:** the "Refreshing" and "Live" pulses animate on the
  compositor; the dashboard updates in place and no longer forces a
  layout per poll (idle frames per 11 s: 637 → 12).
- **Dev tooling:** `dev/replay/addons.sh` renders 15 official LuCI
  add-ons with fixture data; `check_dom_sinks.js` also checks
  `el.animate()` keyframes.

## 1.0.4 - 2026-10-12

- **Theme: calmer forms.** One control height for fields, buttons, tabs
  and chips, 36 px with a mouse and 44 px on touch, with 16 px text in
  touch fields; a 180 px label column and fields up to 360 px; one look
  per tab level; a type scale shared with the dashboard. Field help and
  long page or section intros fold to their first line with an (i)
  button; a heading that only repeats the breadcrumb is hidden visually
  and kept for screen readers (#18).
- **Theme, Channel Analysis:** the device's own network is drawn in the
  accent colour.
- **Fixes:** "Generate QR" was a blank tile; tables in nested sections
  had a stray scrollbar.
- Screenshots retaken for the new sizes and tabs.

## 1.0.3 - 2026-10-12

- **Fix stale dashboard styles after an upgrade:** the app stylesheet is
  revalidated on every load, so a browser no longer keeps the 1.0.1
  sheet after upgrading (broken layout controls, overlapping scale
  labels).
- **Throughput chart:** download and upload in their own colours in
  every row, a legend, coloured arrows in the readouts and a tooltip
  with one row per direction (#14).
- Simplified Chinese: "Uplink" translated as the link, not as upload.
- Install guide: reload with Ctrl+Shift+R after an upgrade.

## 1.0.2 - 2026-10-11

- **Wired-only layout** for devices without radios: no empty Radios
  tile or Wi-Fi checks; the device's other interfaces show in the
  network path with live rates (#9, from #7). The replay gets `--wired`.
- **Mirrored throughput chart:** download above the middle line, upload
  below, each with its own scale, instead of a Download/Upload toggle
  (#10). The network path spans the row; System heads the right column.
- **Arrange the dashboard:** a Layout button lets you drag tiles, change
  their width or hide them; saved in the browser per screen size, with a
  reset to the default. Nothing is written to the device (#11).

## 1.0.1-r3 - 2026-10-01

- **Simplified Chinese** translation of the dashboard, shipped as
  `luci-i18n-vantage-zh-cn` (#1, [@ntbowen](https://github.com/ntbowen)).
- **Translation support:** each `po/<lang>/` becomes a language package
  (`luci-i18n-vantage-<lang>`, `luci-i18n-vantage-theme-<lang>`);
  `dev/i18n/update.sh` maintains the templates and catalogues with
  LuCI's own tools; CI checks they are current; the replay previews a
  language with `--lang` (#2).

## 1.0.1-r2 - 2026-09-28

- **Signed apk repository** published from CI to GitHub Pages, so the
  packages install and upgrade with `apk` without `--allow-untrusted`.
  Releases also carry `packages.adb`. The install guide documents the
  repository, the key fingerprint and upgrades; `docs/ROADMAP.md` added.

## 1.0.1 - 2026-09-28

First public release.

- **`luci-theme-vantage`:** icon rail with flyouts, bottom bar on phones,
  breadcrumb and page tabs, Ctrl+K command palette, light, dark and auto
  modes without a flash, host chip and indicator pills, its own login
  page, restyled stock pages, forms, tables, charts and status icons;
  system fonts and self-drawn icons, no CDNs.
- **`luci-app-vantage`:** the dashboard at `admin/dashboard` with health
  checks, the network path, live throughput, radio cards, clients with
  human names and an experience score, the client inspector, top
  talkers, wireless networks and the system tile. Read-only rpcd ACL;
  wireless data comes from the app's own rpcd plugin without keys; device
  names are the one write, through the plugin, into
  `/etc/config/vantage`.
- **Tooling:** read-only recorder, offline replay with a pseudonymising
  demo mode, reproducible SDK builds verified against the source, the
  test suite and the four security checks, GitHub Actions CI publishing
  releases only when the build matches the committed manifest.
