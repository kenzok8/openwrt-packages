<div align="center">

<img src="htdocs/luci-static/vantage/logo.svg" width="88" height="88" alt="Vantage logo">

# Vantage

**A theme and live dashboard for LuCI, OpenWrt's web interface. Log in and see who's connected, how busy your connection is, and what needs fixing. For OpenWrt 25.12 and 24.10.**

![OpenWrt 25.12 and 24.10](https://img.shields.io/badge/OpenWrt-25.12%20%7C%2024.10-00B5E2?style=flat-square) ![LuCI theme + app](https://img.shields.io/badge/LuCI-theme%20%2B%20app-5a6472?style=flat-square) ![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-3d8b40?style=flat-square)

[Website](https://anothadev.github.io/luci-theme-vantage/) · [Install](#install) · [Screenshots](#screenshots) · [Changelog](CHANGELOG.md)

</div>

<br>

<p align="center">
  <a href="https://anothadev.github.io/luci-theme-vantage/"><img src="docs/screenshots/vantage-promo.webp" alt="A twenty-second tour of Vantage: the live dashboard, a warning and the client behind it, a router with its access points, WireGuard peers and ports, the firewall overview, Ctrl K search, restyled LuCI pages, dark and light, and the phone layout" width="100%"></a>
</p>

<p align="center"><sub>The video and screenshots use recorded data with addresses and names
replaced. The router and the larger access point are generated.</sub></p>

## What you get

Two packages that work together or alone: the theme doesn't need the
dashboard, and the dashboard on its own works under any LuCI theme. A
third, optional one adds your other access points to the dashboard, and
a fourth, optional and experimental, the traffic of devices that share a
port.

**The dashboard** (`luci-app-vantage`) is the page you land on after login.

- **Health at a glance.** Six checks: uplink, CPU, memory, Wi-Fi, client
  signal and storage. Each gives a one-line reason, and clicking it opens
  the details.
- **A live network path.** Your internet lines, this device, its radios
  and SSIDs, and its wired ports, with packets that move at the real
  uplink rate. Click anything for details. On a big network, **Compact**
  under Customize makes every network, port and access point one line.
- **Your other access points too** (optional add-on,
  `luci-app-vantage-aps`). Pair each access point once and the router's
  dashboard shows its SSIDs, clients and wired devices beside its own.
  The router reads them over SSH with a key that can only fetch that
  report; nothing is shared until you pair.
- **Traffic per device, also behind a switch** (optional add-on
  `luci-app-vantage-traffic`, experimental). On a router, devices that
  share a port get the traffic that passes the router for each of them,
  from the router's own connection tracking. No firewall rules.
- **Every client, by name.** Your alias, a name from DHCP, mDNS, WPS or
  reverse DNS, or else the vendor. You get signal, link rate, Wi-Fi
  generation, live traffic and an experience score that explains itself.
  Wired devices are listed too, with their port and link speed, and a
  device you named stays in the list while it's offline.
- **Live charts.** Five minutes of throughput for the uplink and every
  radio, in the chart style you choose, plus radio cards, top talkers
  (Wi-Fi clients, and wired devices that have a port to themselves, so a
  router without Wi-Fi has them too) and a system tile.
- **WireGuard peers.** Where a tunnel is up, a tile lists its peers by
  name, with the time since their last handshake and their live traffic.
  For logins that may open LuCI's own WireGuard status.
- **Every port.** On a device with two Ethernet ports or more, a tile
  shows each one: link and speed, live traffic, the wired devices behind
  it and which port your internet line leaves through. Errors and drops
  show up only where there are any. With `ethtool` installed, the ports
  of a switch chip (DSA) also count what the chip forwards by itself.
- **Firewall overview.** What's open from the internet, which zones reach
  which, and warnings for risky setups. Every item links to the LuCI page
  that changes it.
- **Your own layout.** Drag, resize or hide tiles, with one layout per
  screen size. With the Vantage theme, your layout and chart style are
  saved on the router, so every browser matches.
- **Tiles from other packages** (experimental). Another package can add a
  read-only tile of its own. The dashboard draws it in its own look and
  marks it with the package's id; see [`docs/TILES.md`](docs/TILES.md).
- **Settings that fit your router.** With the Vantage theme, Appearance
  shows traffic in bits or bytes per second, and its Low-power router
  mode asks for the slow parts only every 30 seconds and stops the
  motion.

**The theme** (`luci-theme-vantage`) restyles every LuCI page.

- **Quick to get around.** An icon rail, breadcrumbs, and
  <kbd>Ctrl</kbd>+<kbd>K</kbd> or <kbd>/</kbd> to search every page you
  can open. On the dashboard the search also finds clients, radios, Wi-Fi
  networks and interfaces.
- **Good on phones.** A bottom bar replaces the rail, and tables become
  cards.
- **Light, dark or auto**, with no flash on load. Your choice and your
  background picks are saved on the router, so every browser matches.
- **Tidier stock pages.** One control size, one tab style, field help
  folded to its first line, spare row actions tucked into a ⋯ menu,
  coloured firewall verdicts, and Status → Firewall as a flow chart of
  the way a packet takes.
- **Its own login page**, with moving packets, a starfield or nothing.

Nothing loads from the internet: Vantage uses system fonts and its own
icons, with no CDNs or frameworks. The one exception is **Check for
updates** under Appearance, and only when you click it, or once a day in
a browser where you switch **Daily update check** on (off by default; it
shows GitHub Pages your computer's IP address and the address you opened
LuCI at). The dashboard's only writes are the names you give devices
and their "Don't warn about its signal" marks, and it never reads Wi-Fi
keys. See [Security](#security).

## Install

These steps are for OpenWrt 25.12 (apk). On 24.10, follow the
[24.10 steps](docs/INSTALL.md#openwrt-2410). Both packages are
architecture-independent, so the same files install on any router.

**From the signed repository.** Run this on the router. It stops before
installing anything if the key's hash doesn't match. You only need to do it
once; later versions come with `apk upgrade`.

```sh
key=$(mktemp) &&
wget -O "$key" https://anothadev.github.io/luci-theme-vantage/vantage-signing.pem &&
echo "c8a6c83eeb49ca2407932fb5e95785776128cef87db75ebaea0fe4171eee2157  $key" | sha256sum -c - &&
cp "$key" /etc/apk/keys/vantage-signing.pem &&
echo 'https://anothadev.github.io/luci-theme-vantage/25.12/packages.adb' >> /etc/apk/repositories.d/customfeeds.list &&
apk update &&
apk add luci-theme-vantage luci-app-vantage
```

**From release files.** Download them from a
[release](https://github.com/anothaDev/luci-theme-vantage/releases) or
[build your own](#build), then run this in the same folder. `192.0.2.1`
stands for your router's address.

```sh
f=$(awk '/ luci-(theme|app)-vantage-[0-9].*\.apk$/ {print $2}' SHA256SUMS) &&
grep -E ' luci-(theme|app)-vantage-[0-9].*\.apk$' SHA256SUMS | sha256sum -c - &&
ssh root@192.0.2.1 'mkdir -m 700 /tmp/vantage' &&
scp -O $f root@192.0.2.1:/tmp/vantage/ &&
ssh root@192.0.2.1 'apk add --no-network --allow-untrusted /tmp/vantage/*.apk; s=$?; rm -r /tmp/vantage; exit $s'
```

Log out of LuCI and back in, and the dashboard is your landing page. A
fresh install switches to the theme for you. An upgrade keeps the theme
you chose, and removing the theme switches LuCI back to Bootstrap.

**[The install guide](docs/INSTALL.md)** covers the rest: requirements,
verifying packages, installing just one of them, upgrades, uninstalling,
building Vantage into your own firmware, troubleshooting, and a
ready-made prompt for installing with a coding agent.

## Screenshots

<p align="center">
  <img src="docs/screenshots/dashboard-dark.png" alt="The Vantage dashboard in dark mode: six health cards with their own icons and edge charts, the signal card flagging a weak client, the network path from the gateway through the access point to its radios and SSIDs, live throughput in download and upload colours, and radio cards" width="100%">
</p>

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/dashboard-light.png" alt="Dashboard in light mode with every check passing"></td>
    <td width="50%"><img src="docs/screenshots/client-drawer.png" alt="Client inspector drawer open over the clients table"></td>
  </tr>
  <tr>
    <td align="center"><sub>Light mode: health checks, network path and live throughput</sub></td>
    <td align="center"><sub>Client details: experience score, signal and link info</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="middle"><img src="docs/screenshots/network-path.png" alt="Network path of a quad-radio access point with ten SSIDs and a Wired branch of six ports"></td>
    <td width="50%"><img src="docs/screenshots/router.png" alt="Dashboard of a router without Wi-Fi: two internet lines, its own networks and switch ports, and three paired access points with their Wi-Fi networks, clients and wired devices"></td>
  </tr>
  <tr>
    <td align="center"><sub>A larger access point (generated): four radios, ten networks, six wired ports</sub></td>
    <td align="center"><sub>A router (generated): two internet lines and its paired access points</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="middle"><img src="docs/screenshots/compact-path.png" alt="The same quad-radio access point with the compact network path: every radio, network and port is one line with its clients and rates"></td>
    <td width="50%"><img src="docs/screenshots/wireguard-ports.png" alt="Lower part of the router's dashboard: the WireGuard tile with two tunnels and their peers, and the Ports tile with two internet ports and two switch ports"></td>
  </tr>
  <tr>
    <td align="center"><sub>That access point's path in compact form: one line each</sub></td>
    <td align="center"><sub>Further down the router's dashboard: WireGuard peers and every port</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/firewall-overview.png" alt="Firewall overview of the router: a warning that SSH is open to the internet, what is open on the router and forwarded into the network, the zones with where each forwards, and a port forward that is switched off"></td>
    <td width="50%"><img src="docs/screenshots/firewall-flow.png" alt="LuCI's Status Firewall page as a flow chart of the chains a packet passes, with the input and forward chains' rules below"></td>
  </tr>
  <tr>
    <td align="center"><sub>Firewall overview of that router: what's open from the internet, the zones, and a warning</sub></td>
    <td align="center"><sub>LuCI's Status → Firewall page as a flow chart</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/palette.png" alt="Command palette listing the Wi-Fi networks, clients, pages and Appearance options that match a search"></td>
    <td width="50%"><img src="docs/screenshots/status-overview.png" alt="LuCI Status Overview page restyled by the theme"></td>
  </tr>
  <tr>
    <td align="center"><sub><kbd>Ctrl</kbd>+<kbd>K</kbd> search over networks, clients, pages and Appearance options</sub></td>
    <td align="center"><sub>LuCI's Status page under the theme, with a combined memory bar</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/channel-analysis.png" alt="Channel Analysis page showing neighbouring networks"></td>
    <td width="50%" valign="middle"><img src="docs/screenshots/login.png" alt="The theme's login page with moving packet traces on a dark grid"></td>
  </tr>
  <tr>
    <td align="center"><sub>LuCI's Channel Analysis page (neighbouring networks are generated)</sub></td>
    <td align="center"><sub>Login page with grid packets, a starfield or nothing</sub></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/screenshots/mobile.png" alt="Dashboard on a phone-sized screen" width="20%"></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub>Phone layout with the bottom bar and Wi-Fi/Wired switch</sub></td>
  </tr>
</table>

## Security

Vantage is built to read your router, not change it. The full rules are in
the [spec](docs/SPEC.md#6-security-requirements).

- **The dashboard only reads.** Its permissions cover read methods. The
  one program they can start is `ethtool -S` for the device's own DSA
  switch ports, where `ethtool` is installed, with nothing from the
  browser on its command line. Its only writes are device names and a
  device's "Don't warn about its signal" mark, both stored in
  `/etc/config/vantage`, and an empty lock file in RAM while it reads
  those counters.
- **Wi-Fi keys stay out.** Wireless settings come through Vantage's own
  plugin, which leaves out Wi-Fi keys, SAE passwords and RADIUS secrets.
- **The theme writes one file.** Appearance, and the dashboard's layout
  and chart style, go to `/etc/config/vantage_theme` and nowhere else. A
  user without that permission keeps their picks in their own browser.
- **Other access points are opt-in.** The optional `luci-app-vantage-aps`
  is the one part that does more than read: pairing creates the router's
  own SSH key and, on an access point, adds that key to Dropbear limited
  to one read-only report command (and lets no router in while an SSH
  listener there runs a command of its own in its place). It has its own
  permission (`luci-app-vantage-aps`), meant for administrators. Seeing the paired
  access points on the dashboard is a second one
  (`luci-app-vantage-aps-view`), since asking for their reports makes the
  router log in to them with that key; the dashboard's own read
  permission does not include it.
- **Per-device traffic is opt-in.** The experimental
  `luci-app-vantage-traffic` reads the router's connection table and
  neighbour tables, in a process of its own, never changing a setting;
  it keeps its counters in RAM, readable by root alone. Its answer is a
  MAC address and two byte counts per device, and it has its own permission
  (`luci-app-vantage-traffic`), since it shows how much each device
  sends and receives.
- **Extras are separate permissions.** Naming devices and silencing a
  device's signal warning (`luci-app-vantage-names`) and reverse DNS
  (`luci-app-vantage-rdns`) are their own groups, so you can leave them
  out. The firewall overview only
  appears for users who already hold LuCI's firewall permission, and the
  WireGuard tile for those who hold LuCI's WireGuard one.
- **Tiles from other packages are text.** A package may add a read-only
  tile (experimental, [`docs/TILES.md`](docs/TILES.md)). The dashboard
  asks it one fixed question, only for logins that hold that package's
  own permission, and draws the answer itself, as text, with the
  package's id beside the tile's name.
- **Checked by tests.** They reject HTML built from data, render the
  theme's templates with hostile input, confirm the permissions match what
  the code calls, and keep real addresses, MACs and SSIDs out of the
  repository.

One known exception: LuCI's own header adds its `L.env` script to every
page, including the menu tree on logged-out 404 pages. That's upstream
behaviour, tracked in [`docs/luci-contract.md`](docs/luci-contract.md).

## Compatibility

| OpenWrt | Status |
|---|---|
| 25.12 | Built with the 25.12 SDK and tested |
| 24.10 | Signed `.ipk` packages, built with the 24.10 SDK and tested on a 24.10.8 router without Wi-Fi ([install](docs/INSTALL.md#openwrt-2410)) |

## Languages

Vantage is available in English, Simplified Chinese (dashboard
translation by [@ntbowen](https://github.com/ntbowen)), Russian
([@akorshun](https://github.com/akorshun)) and German
([@bakaranadnan-a11y](https://github.com/bakaranadnan-a11y)). Each language
installs as its own packages, for example
`apk add luci-i18n-vantage-zh-cn luci-i18n-vantage-theme-zh-cn`; see
[Languages](docs/INSTALL.md#languages) in the install guide.

Translations are very welcome. In a fork, run
`dev/i18n/update.sh --add <lang>`, translate the new `.po` files and
open a pull request that touches only `po/` files.
[Translations](CONTRIBUTING.md#translations) has the details.

## Build

With podman and the official OpenWrt SDK image:

```sh
dev/build/sdk-build.sh 25.12.6          # builds HEAD into dist/25.12.6/
```

The same commit and SDK always produce byte-identical packages, and each
package is checked against the source before it reaches `dist/`. Signing
and the other details are in the
[install guide](docs/INSTALL.md#build-from-source).

## Develop

You don't need a router to work on Vantage. The replay in `dev/replay/`
serves the full LuCI interface from a recording or hand-written fixtures,
with the theme and app loaded from this repository, so you can reload to
see an edit. `--demo` swaps real addresses and names for documentation
values, which is how the screenshots were made.

```sh
node dev/replay/server.js --mirror ../vantage-mirror --port 8106 --demo \
    --theme-dir luci-theme-vantage/htdocs/luci-static/vantage --theme vantage \
    --app-dir luci-app-vantage
```

[`CONTRIBUTING.md`](CONTRIBUTING.md) has the setup and the checks to run,
[`docs/SPEC.md`](docs/SPEC.md) describes the product, and
[`docs/luci-contract.md`](docs/luci-contract.md) lists what LuCI expects
from a theme. Coding agents should read [`AGENTS.md`](AGENTS.md).
To put a tile of your own package on the dashboard, see
[`docs/TILES.md`](docs/TILES.md) (experimental).

## Contributing

Issues and pull requests are welcome; see
[`CONTRIBUTING.md`](CONTRIBUTING.md). For a bug report, include your
OpenWrt version (`cat /etc/openwrt_release`), your browser, and screenshots
with personal data removed: no real IP addresses, MACs or SSIDs. Report
security problems privately as described in [`SECURITY.md`](SECURITY.md),
not in a public issue.

Past releases are in [`CHANGELOG.md`](CHANGELOG.md), and planned work is in
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## License

GPL-3.0-or-later. See [`LICENSE`](LICENSE) and
[`luci-theme-vantage/NOTICE`](NOTICE).
