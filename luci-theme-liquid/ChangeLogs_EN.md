# Changelog

> Full history of the entries from **[README_EN.md](README_EN.md)**; the README body only keeps the latest one.
> 中文版本：**[ChangeLogs.md](ChangeLogs.md)**

- **2026-09-28 · v1.0 (major release)**: opacity slider + online update + lock screen polish + wide-table adaptivity
  - **Glass opacity slider**: drag 0–100 in the top-bar color area for an instant preview, click the tick to reset; menus, buttons and accent backgrounds follow along, with separate light / dark defaults; also on the lock screen, and the setting stays on your router across devices
  - **Online update check**: click the footer version to check and install a new release; checking / up to date / update available / failed are all clearly shown, and failures report an error instead of hanging; mobile footers show the version too, with bigger buttons
  - **Lock screen**: mode, accent and opacity picked before signing in are offered with one click after login (30-second countdown, dismissible); the logo gets a frosted glass glow; fixed mode-switch flicker and accidental submits
  - **Dropdowns**: refreshed glass look — width follows the longest option, menus flip up near the edge, no flash on click; clearer highlights in dark mode; previously broken dropdowns (e.g. wireless settings) work again
  - **Notifications**: success messages (e.g. "password changed") now show as a centered glass dialog that closes after 6 seconds; buttons wrap on phones instead of overflowing
  - **Wide tables**: when a table no longer fits the screen, action buttons stack one per line so text keeps its width — no more squeezed or clipped columns; on phones the table stays on screen with no sideways scrolling
  - **Fixes**: the sidebar slider no longer sticks to the previous category; OpenClash no longer flashes dark on open; the selected tab uses a high-contrast color for dark mode

- **2026-08-18 · v0.7**: mobile UX polish + general UX polish
  - **Mobile**
    - Toolbar / address bar auto-collapses on scroll, giving a larger view on phones
    - Bottom banner clears the fullscreen gesture bar
    - EasyTier restart / refresh-version dialogs center on mobile
  - **General**
    - Fixed button borders not hugging rounded corners / edge seams (plain buttons, Save & Apply, split-select)
- **2026-08-15 · v0.6**: menu search + UX polish
  - **Menu search**: new search entry in the color area — opens a search box that filters menu items in real time, matching Chinese and English titles
  - **UX polish**: multi-instance configs (e.g. Dropbear) show as separate cards; refresh button gets a frosted glass look; iStoreOS page tabs adopt the theme tab style
- **2026-08-13 · v0.5**: centered modals + status-bar style polish
  - **Centered modals**: apply-progress toasts (applying / applied / nothing to apply) and the pending-changes dialog are now properly centered on mobile; tall form modals (e.g. add DHCP) keep normal scrolling
  - **Status bars**: disk / memory usage bars get a deeper accent color with a glass gradient, showing used / total inline
- **2026-08-08 · v0.3**: custom accent color + color-switch polish + mobile / dark-mode improvements
  - **Custom accent color**: beyond the 5 presets — click the rainbow dot to drop a hex input (`#RRGGBB`); leaving the field saves and applies instantly; invalid values fall back to default blue (custom mode stays enabled); persisted via uci across clients
  - **Color switch**: pill fixed at 35px; a selected custom dot shows its color inside with a rainbow ring for instant recognition; the Bing wallpaper button gets a square outline hugging its icon and a single white ring when active
  - **Mobile**: no first-load menu flash (desktop entry animation disabled so the drawer starts closed and usable immediately); footer height trimmed
  - **Dark mode**: mode-switch icons (external svg) inverted to light so they stay visible on dark backgrounds
  - **Fixes**: custom-color persistence (controller whitelist accepts `accent=custom` / `accent_custom`), login-page color-switch position, pill height

- **2026-08-08 · v0.2-r52**: mobile UX & dropdown improvements
  - **Mobile interfaces page**: ifacebox aligned 4px from its row card's left edge for a cleaner look
  - **Mobile nested-card insets**: modal at 95% width, each nested layer steps in 2px, giving a larger usable area
  - **Mobile menu**: tapping outside closes the menu
  - **Desktop modal / nested cards**: improved display (modal at 80% width, nested layers width-constrained to prevent overflow)
  - **Dropdowns**: single-select & multi-select interaction and display polish

- **2026-08-07 · v0.2**: persistent config (uci) + Bing daily wallpaper + fixes
  - **Persistent config (uci)**: light/dark/auto mode, the 5 accent colors and the Bing switch are stored in `uci /etc/config/liquid`, so the settings follow the router across clients (browsers / devices); changes are committed through the theme's own ucode endpoint and take effect immediately with no "pending apply" entries or save prompts.
  - **Bing daily wallpaper (lock screen)**: a Bing toggle button (letter-b logo) sits before the five accent colors; when enabled, the lock screen shows Bing's picture of the day (cached per device in `/tmp/liquid/`); when offline or disabled it falls back to the default wallpaper (per mode).
  - **Lock screen read-only**: the login page only previews locally and never writes configuration.
  - **uci wins**: fixed stale localStorage overriding the uci config — every reload applies the router-wide config.
  - **Interfaces page fix**: the head bar of interfaces not assigned to any firewall zone is now gray (light: light gray / dark: near-black) so the interface name stays readable in dark mode.
  - **CI**: GitHub Actions build & release on two platforms (x86 + MT798x) × two formats (ipk / apk).
  - Version bumped to 0.2-r1.

- **2026-08-07 · v0.1 (initial release)**: a brand-new macOS-style Liquid Glass LuCI theme
  - **Liquid glass design language**: frosted glass (blur + highlight + theme glow) across sidebar, content cards, login page and footer
  - **Three-way mode**: light / dark / auto from the top bar, persisted, no flash on load
  - **Accent colors**: 5 themes driving menus, buttons, tabs and logo
  - **Menu**: collapsed by default, hover-tracking slider, selected glass capsule, mobile slide-out menu
  - **Dropdowns**: gradient capsule (body + divider + arrow, same as "Save & Apply"), auto-flip at viewport edges
  - **Tooltips**: frosted glass, top-level display, edge avoidance
  - **Tables**: equal-height rows, horizontal scroll on mobile (no long-column overlap)
  - **Interfaces / Devices**: uniform SVG icons, link state told by the icon file
  - **Lock screen**: macOS-style frosted login card + Monterey wallpaper + accent-colored waterdrop logo
  - **Compatibility**: LuCI ≥ 23 (OpenWrt 23.05 / 24.10 / master)
