// Stand-in for LuCI's native luci.core module (template rendering tests only).
export function getuid() { return 0; };
export function getspnam(name) { return { pwdp: 'x' }; };
