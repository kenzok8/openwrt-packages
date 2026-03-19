#!/bin/sh
# ============================================================================
# luci-app-openclaw — 全局环境变量
# 仅在 Node.js 已安装时生效，为 SSH 登录用户提供正确的运行环境
# 解决 Issue #42: 统一配置文件路径，避免 /root/.openclaw 与 /opt/openclaw/data/.openclaw 混乱
# ============================================================================

NODE_BASE="/opt/openclaw/node"
OC_GLOBAL="/opt/openclaw/global"
OC_DATA="/opt/openclaw/data"

# 检查 Node.js 是否已安装
[ -x "${NODE_BASE}/bin/node" ] || return 0

# 添加 Node.js 和 OpenClaw 到 PATH (非侵入式，检查是否已存在)
case ":$PATH:" in
  *":${NODE_BASE}/bin:"*) ;;
  *) export PATH="${NODE_BASE}/bin:${OC_GLOBAL}/bin:$PATH" ;;
esac

# 设置 Node.js ICU 数据路径
export NODE_ICU_DATA="${NODE_BASE}/share/icu"

# 设置 OpenClaw 核心环境变量
# 这些变量确保 openclaw 命令使用正确的配置路径
export OPENCLAW_HOME="$OC_DATA"
export OPENCLAW_STATE_DIR="${OC_DATA}/.openclaw"
export OPENCLAW_CONFIG_PATH="${OC_DATA}/.openclaw/openclaw.json"

# 设置 HOME 为 OpenClaw 数据目录
# 这是解决 Issue #42 的关键：确保 OpenClaw CLI 使用正确的配置路径
# 注意：这会影响 cd ~ 等行为，但为了配置一致性是必要的
export HOME="$OC_DATA"

# 创建便捷别名：用户可直接运行 openclaw 命令
if [ -x "${OC_GLOBAL}/bin/openclaw" ] || [ -x "${NODE_BASE}/bin/openclaw" ]; then
  # openclaw 已在 PATH 中，无需别名
  :
else
  # 尝试查找 openclaw 入口并创建别名
  for _oc_dir in "${OC_GLOBAL}/lib/node_modules/openclaw" "${OC_GLOBAL}/node_modules/openclaw" "${NODE_BASE}/lib/node_modules/openclaw"; do
    if [ -f "${_oc_dir}/openclaw.mjs" ]; then
      alias openclaw="${NODE_BASE}/bin/node ${_oc_dir}/openclaw.mjs"
      break
    elif [ -f "${_oc_dir}/dist/cli.js" ]; then
      alias openclaw="${NODE_BASE}/bin/node ${_oc_dir}/dist/cli.js"
      break
    fi
  done
fi
