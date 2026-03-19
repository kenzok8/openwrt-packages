# OpenClaw 版本升级推进流程文档

## 概述

本文档详细记录了从 OpenClaw v2026.3.8 升级到 v2026.3.13 的完整分析和推进流程。

| 项目 | 当前版本 | 目标版本 |
|------|----------|----------|
| OpenClaw | v2026.3.8 | v2026.3.13 |
| 发布日期 | 2026-03-09 | 2026-03-14 |
| Node.js 要求 | >= 22.x | >= 22.16.0 |

---

## 一、版本差异分析报告

### 1.1 版本发布时间线

| 版本 | 发布日期 | 类型 |
|------|----------|------|
| v2026.3.8 | 2026-03-09 | 稳定版 (当前) |
| v2026.3.11 | 2026-03-12 | 稳定版 |
| v2026.3.12 | 2026-03-13 | 稳定版 |
| v2026.3.13 | 2026-03-14 | 稳定版 (目标) |

### 1.2 关键变更摘要

#### 🔴 重大变更 (Breaking Changes)

1. **Node.js 最低版本要求提升**
   - 旧版本: Node.js >= 22.x
   - 新版本: Node.js >= 22.16.0
   - **影响**: 当前项目 `NODE_VERSION="22.15.1"` 不满足要求，必须升级

2. **Cron/主动投递收紧 (v2026.3.11)**
   - 孤立的直接 cron 发送不再通过临时 agent 发送或主会话摘要通知
   - 需要运行 `openclaw doctor --fix` 迁移旧版 cron 存储

3. **插件安全策略变更 (v2026.3.12)**
   - 禁用隐式工作区插件自动加载
   - 克隆的仓库不能执行工作区插件代码，需要显式信任决策

#### 🟡 安全修复

| 编号 | 描述 | 影响范围 |
|------|------|----------|
| GHSA-5wcw-8jjv-m286 | WebSocket 跨站劫持漏洞修复 | Gateway 模式 |
| GHSA-99qw-6mr3-36qr | 设备配对安全：切换到短期引导令牌 | 配对流程 |
| GHSA-pcqg-f7rg-xfvv | 执行审批：Unicode 不可见字符转义 | 命令审批 |
| GHSA-9r3v-37xh-2cf6 | 执行检测：Unicode 规范化 | 命令检测 |
| GHSA-f8r2-vg7x-gh8m | 执行白名单：POSIX 大小写敏感 | 命令白名单 |
| GHSA-r7vr-gr74-94p8 | 命令权限：/config 和 /debug 需所有者权限 | 权限控制 |
| GHSA-rqpp-rjj8-7wv8 | Gateway 认证：清除未绑定客户端声明范围 | 认证安全 |
| GHSA-vmhq-cqm9-6p7q | 浏览器请求：阻止持久化配置文件变更 | 浏览器控制 |
| GHSA-2rqg-gjgv-84jm | Agent 安全：拒绝公共生成运行血统字段 | Agent 安全 |
| GHSA-wcxr-59v9-rxr8 | 会话状态：沙箱会话树可见性强制执行 | 会话隔离 |
| GHSA-2pwv-x786-56f8 | 设备配对：限制令牌范围 | 令牌安全 |
| GHSA-jv4g-m82p-2j93 | WebSocket 预认证：缩短握手保留时间 | 连接安全 |
| GHSA-6rph-mmhp-h7h9 | 代理附件：恢复媒体存储大小限制 | 文件上传 |
| GHSA-jf5v-pqgw-gm5m | 主机环境：阻止继承 GIT_EXEC_PATH | 环境隔离 |
| GHSA-g353-mgv3-8pcj | 飞书 Webhook：要求加密密钥 | 飞书渠道 |
| GHSA-m69h-jm2f-2pv8 | 飞书反应：群组授权和提及门控 | 飞书渠道 |
| GHSA-mhxh-9pjm-w7q5 | LINE Webhook：空事件也需要签名 | LINE 渠道 |
| GHSA-5m9r-p9g7-679c | Zalo Webhook：限制无效密钥猜测速率 | Zalo 渠道 |

#### 🟢 新增功能

1. **Control UI/Dashboard-v2 重构** (v2026.3.12)
   - 模块化概览、聊天、配置、agent 和会话视图
   - 命令面板、移动端底部标签
   - 斜杠命令、搜索、导出、固定消息等聊天工具

2. **OpenAI/GPT-5.4 Fast Mode** (v2026.3.12)
   - 可配置的会话级快速切换
   - 跨 `/fast`、TUI、Control UI 和 ACP 支持
   - 每模型配置默认值和 OpenAI/Codex 请求整形

3. **Anthropic/Claude Fast Mode** (v2026.3.12)
   - 映射共享 `/fast` 切换到 Anthropic API `service_tier` 请求
   - Anthropic 和 OpenAI fast-mode 层级的实时验证

4. **提供商插件架构** (v2026.3.12)
   - Ollama、vLLM、SGLang 迁移到提供商插件架构
   - 提供商拥有的引导、发现、模型选择器设置

5. **Kubernetes 部署支持** (v2026.3.12)
   - 原始清单、Kind 设置、部署文档

6. **Ollama 本地模式向导** (v2026.3.11)
   - 本地或云端+本地模式的首选 Ollama 设置
   - 基于浏览器的云端登录
   - 精选模型建议

7. **Docker 时区支持** (v2026.3.13)
   - 新增 `OPENCLAW_TZ` 环境变量

8. **iOS/macOS UI 改进**
   - iOS: 欢迎屏幕、停靠工具栏、聊天模型选择器
   - macOS: 聊天模型选择器、思考级别选择持久化

#### 🔵 Bug 修复 (精选)

| 类别 | 修复内容 |
|------|----------|
| 模型支持 | Kimi Coding 工具调用格式修复、OpenRouter 模型 ID 规范化 |
| Telegram | HTML 消息分块、最终预览投递、IPv4 回退重试 |
| Discord | 回复分块、自动线程归档时长配置 |
| 飞书 | 本地图片自动转换、非 ASCII 文件名保留 |
| Mattermost | 块流重复消息修复、Markdown 格式保留 |
| 会话管理 | 重置模型重新计算、会话发现、ACP 会话别名 |
| 性能 | 构建内存回归修复 (~2x)、插件 SDK 块去重 |

### 1.3 配置文件格式变化

#### 新增配置项

```json
{
  "agents": {
    "defaults": {
      "compaction": {
        "postIndexSync": true
      },
      "memorySearch": {
        "sync": {
          "sessions": {
            "postCompactionForce": false
          }
        }
      }
    }
  },
  "channels": {
    "discord": {
      "autoArchiveDuration": 60  // 60, 1440, 4320, 10080 分钟
    }
  }
}
```

#### Fast Mode 使用说明

Fast Mode 是 OpenClaw v2026.3.12 新增的功能，用于启用 OpenAI/Anthropic 的快速响应模式。

**注意**: Fast Mode 不是通过配置文件直接设置的，而是通过以下方式启用：

1. **TUI 界面**: 使用 `/fast` 命令切换
2. **Control UI**: 在聊天界面中切换 Fast Mode 开关
3. **API 调用**: 在请求参数中设置 `fastMode: true`

**配置示例** (通过 CLI 设置):
```bash
# 在会话中切换 Fast Mode
openclaw tui
# 然后输入 /fast 命令

# 或通过 Control UI (http://<设备IP>:18789) 在聊天设置中启用
```

**支持的模型**:
- OpenAI: GPT-4/5 系列 (需要 API 支持 fast tier)
- Anthropic: Claude 系列 (需要 API 支持 service_tier)

#### 废弃/变更配置项

- `channels.zalouser.dangerouslyAllowNameMatching` - 新增危险选项
- `channels.slack.dangerouslyAllowNameMatching` - 新增危险选项
- `channels.teams.dangerouslyAllowNameMatching` - 新增危险选项

### 1.4 API 接口变动

| 接口 | 变化类型 | 描述 |
|------|----------|------|
| `/pair` | 安全增强 | 使用短期引导令牌替代共享凭证 |
| `sessions_spawn` | 新增 | 支持 `resumeSessionId` 参数 |
| `sessions.patch` | 新增字段 | 支持 `spawnedBy`、`spawnDepth` 血统字段 |
| `node.pending.*` | 新增 | 内存中待处理工作队列原语 |

### 1.5 依赖项变更

#### Node.js 版本要求

```
旧版本: "engines": { "node": ">=22.x" }
新版本: "engines": { "node": ">=22.16.0" }
```

#### 包管理器

```
pnpm@10.23.0 (无变化)
```

#### 核心依赖更新 (精选)

| 包名 | 变化 |
|------|------|
| `@agentclientprotocol/sdk` | 升级到 0.16.1 |
| `playwright-core` | 升级到 1.58.2 |
| `sharp` | 升级到 ^0.34.5 |
| `hono` | 升级到 4.12.7 |
| `zod` | 升级到 ^4.3.6 |

### 1.6 二进制文件大小变化

| 指标 | v2026.3.8 | v2026.3.13 | 变化 |
|------|-----------|------------|------|
| npm 包解压大小 | ~90MB | ~95MB | +5MB |
| 文件数量 | ~4500 | ~4730 | +230 |

---

## 二、需要修改的文件清单及具体修改内容

### 2.1 必须修改的文件

#### 2.1.1 `root/usr/bin/openclaw-env`

**修改原因**: Node.js 版本要求提升

```diff
- NODE_VERSION="${NODE_VERSION:-22.15.1}"
+ NODE_VERSION="${NODE_VERSION:-22.16.0}"

- # 经过验证的 OpenClaw 稳定版本 (更新此值需同步测试)
- OC_TESTED_VERSION="2026.3.8"
+ # 经过验证的 OpenClaw 稳定版本 (更新此值需同步测试)
+ OC_TESTED_VERSION="2026.3.13"
```

#### 2.1.2 `CHANGELOG.md`

**新增内容**:

```markdown
## [2.1.0] - 2026-03-XX

### 适配 OpenClaw v2026.3.13

#### 升级说明
- **Node.js 版本升级**: 从 22.15.1 升级到 22.16.0 (OpenClaw 最低要求)
- **OpenClaw 版本升级**: 从 v2026.3.8 升级到 v2026.3.13

#### 重要变更
- 安全修复: WebSocket 跨站劫持漏洞、设备配对安全增强
- 新功能: Control UI 重构、Fast Mode 支持、Ollama 本地向导
- 插件安全: 禁用隐式工作区插件自动加载

#### 配置迁移
- 升级后建议运行 `openclaw doctor --fix` 迁移旧版 cron 存储
```

#### 2.1.3 `VERSION`

```diff
- 2.0.0
+ 2.1.0
```

### 2.2 建议修改的文件

#### 2.2.1 `root/usr/share/openclaw/oc-config.sh`

**检查点**:
1. 确认 `openclaw doctor --fix` 命令在升级后可用
2. 检查是否有新增的配置项需要在菜单中展示
3. 确认 Fast Mode 配置是否需要 UI 入口

**建议新增菜单项**:

```bash
# 在模型配置菜单中新增 Fast Mode 开关
configure_fast_mode() {
    local current
    current=$(get_config ".params.fastMode // false")
    
    if [ "$current" = "true" ]; then
        status="已启用"
    else
        status="已禁用"
    fi
    
    echo ""
    echo "=== Fast Mode 配置 ==="
    echo "当前状态: $status"
    echo ""
    echo "Fast Mode 可启用 OpenAI/Anthropic 的快速响应模式"
    echo "需要 API 密钥支持相应的服务层级"
    echo ""
    echo "1) 启用"
    echo "2) 禁用"
    echo "0) 返回"
    echo ""
    read -p "请选择: " choice
    
    case $choice in
        1) set_config ".params.fastMode = true" ;;
        2) set_config ".params.fastMode = false" ;;
        0) return ;;
    esac
}
```

#### 2.2.2 `luasrc/model/cbi/openclaw/basic.lua`

**检查点**:
1. 确认配置项与新版 OpenClaw 兼容
2. 考虑新增 Fast Mode 配置 UI

#### 2.2.3 `README.md`

**更新内容**:
- 更新版本号引用
- 添加升级注意事项
- 更新 Node.js 版本要求说明

### 2.3 需要验证的文件

| 文件 | 验证内容 |
|------|----------|
| `root/etc/init.d/openclaw` | 启动脚本兼容性 |
| `scripts/build_run.sh` | 构建脚本 Node.js 版本 |
| `scripts/build_ipk.sh` | IPK 构建脚本 |

---

## 三、升级测试方案

### 3.1 测试环境准备

#### 3.1.1 测试矩阵

| 环境 | 架构 | libc | 固件 |
|------|------|------|------|
| x86_64-glibc | x86_64 | glibc | Debian/Ubuntu |
| x86_64-musl | x86_64 | musl | OpenWrt/iStoreOS |
| aarch64-musl | aarch64 | musl | OpenWrt/iStoreOS |

#### 3.1.2 测试前准备

```bash
# 1. 备份当前配置
cp -r /opt/openclaw/data/.openclaw /tmp/openclaw-backup

# 2. 记录当前版本
openclaw --version

# 3. 检查 Node.js 版本
node --version
```

### 3.2 升级测试步骤

#### 3.2.1 全新安装测试

```bash
# 1. 清理旧环境
rm -rf /opt/openclaw

# 2. 安装新版本
openclaw-env setup

# 3. 验证版本
openclaw --version  # 应显示 2026.3.13
node --version      # 应显示 v22.16.0 或更高

# 4. 运行引导
openclaw onboard

# 5. 基础功能测试
openclaw doctor
```

#### 3.2.2 升级安装测试

```bash
# 1. 从 v2026.3.8 升级
export OC_VERSION=2026.3.13
openclaw-env upgrade

# 2. 验证版本
openclaw --version

# 3. 运行迁移
openclaw doctor --fix

# 4. 验证配置
openclaw config list
```

#### 3.2.3 配置兼容性测试

```bash
# 1. 恢复旧配置
cp -r /tmp/openclaw-backup/* /opt/openclaw/data/.openclaw/

# 2. 重启服务
/etc/init.d/openclaw restart

# 3. 检查日志
logread -f | grep -i openclaw

# 4. 验证渠道
openclaw channels list
```

### 3.3 功能回归测试清单

| 测试项 | 测试内容 | 预期结果 | 状态 |
|--------|----------|----------|------|
| 基础启动 | Gateway 启动 | 正常启动 | [ ] |
| 模型配置 | 设置活动模型 | 配置保存成功 | [ ] |
| Telegram | 消息收发 | 双向通信正常 | [ ] |
| QQ Bot | 消息收发 | 双向通信正常 | [ ] |
| 飞书 | 消息收发 | 双向通信正常 | [ ] |
| Discord | 消息收发 | 双向通信正常 | [ ] |
| Doctor | 健康检查 | 无错误报告 | [ ] |
| Doctor --fix | 迁移修复 | 成功执行 | [ ] |
| Fast Mode | 开关切换 | 配置生效 | [ ] |
| LuCI 界面 | 页面加载 | 正常显示 | [ ] |
| 日志查看 | 日志输出 | 正常显示 | [ ] |
| 备份恢复 | 配置备份/恢复 | 功能正常 | [ ] |

### 3.4 性能测试

```bash
# 1. 内存占用
ps aux | grep node

# 2. 启动时间
time /etc/init.d/openclaw start

# 3. 响应延迟
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/health
```

### 3.5 回滚策略

#### 3.5.1 自动回滚脚本

```bash
#!/bin/sh
# rollback.sh - OpenClaw 版本回滚脚本

echo "=== OpenClaw 版本回滚 ==="

# 1. 停止服务
/etc/init.d/openclaw stop

# 2. 备份当前状态
cp -r /opt/openclaw/data/.openclaw /tmp/openclaw-failed-upgrade

# 3. 恢复旧版本
export OC_VERSION=2026.3.8
openclaw-env upgrade

# 4. 恢复配置
cp -r /tmp/openclaw-backup/* /opt/openclaw/data/.openclaw/

# 5. 重启服务
/etc/init.d/openclaw start

# 6. 验证
openclaw --version
echo "回滚完成"
```

#### 3.5.2 手动回滚步骤

```bash
# 1. 停止服务
/etc/init.d/openclaw stop

# 2. 卸载新版本
npm uninstall -g openclaw --prefix /opt/openclaw/global

# 3. 安装旧版本
npm install -g openclaw@2026.3.8 --prefix /opt/openclaw/global

# 4. 恢复 Node.js (如需要)
# 重新运行 openclaw-env node 安装 22.15.1

# 5. 恢复配置
cp -r /tmp/openclaw-backup/* /opt/openclaw/data/.openclaw/

# 6. 重启服务
/etc/init.d/openclaw start
```

---

## 四、发布前检查清单

### 4.1 代码检查

- [ ] 所有文件修改已提交
- [ ] CHANGELOG.md 已更新
- [ ] VERSION 文件已更新
- [ ] README.md 已更新

### 4.2 测试检查

- [ ] x86_64-glibc 环境测试通过
- [ ] x86_64-musl 环境测试通过
- [ ] aarch64-musl 环境测试通过
- [ ] 全新安装测试通过
- [ ] 升级安装测试通过
- [ ] 配置兼容性测试通过
- [ ] 功能回归测试通过
- [ ] 性能测试无退化

### 4.3 文档检查

- [ ] 升级指南已更新
- [ ] 用户文档已更新
- [ ] API 文档已更新 (如有变化)

### 4.4 构建检查

- [ ] IPK 构建成功
- [ ] 离线安装包构建成功
- [ ] 文件大小合理

### 4.5 安全检查

- [ ] 无已知安全漏洞
- [ ] 敏感信息已清理
- [ ] 权限设置正确

---

## 五、用户升级指南草稿

### OpenClaw v2026.3.13 升级指南

#### 升级前须知

1. **Node.js 版本要求**: 本次升级要求 Node.js >= 22.16.0
2. **配置兼容性**: 现有配置文件兼容，无需手动迁移
3. **建议备份**: 升级前建议备份当前配置

#### 升级方式

##### 方式一：通过 LuCI 界面升级

1. 登录 LuCI 管理界面
2. 进入「服务」→「OpenClaw」
3. 点击「系统管理」→「升级 OpenClaw」
4. 等待升级完成
5. 验证版本号已更新

##### 方式二：通过命令行升级

```bash
# SSH 登录后执行
openclaw-env upgrade

# 升级后运行迁移
openclaw doctor --fix

# 验证版本
openclaw --version
```

##### 方式三：指定版本升级

```bash
# 指定升级到 v2026.3.13
export OC_VERSION=2026.3.13
openclaw-env upgrade
```

#### 升级后验证

```bash
# 1. 检查服务状态
/etc/init.d/openclaw status

# 2. 检查版本
openclaw --version

# 3. 运行健康检查
openclaw doctor

# 4. 检查日志
logread | grep -i openclaw | tail -20
```

#### 新功能体验

1. **Fast Mode**: 在模型配置中启用快速响应模式
2. **Control UI**: 访问 `http://<设备IP>:3000` 体验新版控制面板
3. **Ollama 本地向导**: 运行 `openclaw onboard` 配置本地模型

#### 常见问题

**Q: 升级后服务无法启动？**

A: 检查 Node.js 版本是否满足要求：
```bash
node --version  # 应显示 v22.16.0 或更高
```

**Q: 升级后配置丢失？**

A: 配置文件位于 `/opt/openclaw/data/.openclaw/`，检查是否正确恢复。

**Q: 如何回滚到旧版本？**

A: 执行以下命令：
```bash
export OC_VERSION=2026.3.8
openclaw-env upgrade
```

#### 安全改进说明

本次升级包含多项安全修复，建议所有用户尽快升级：

- WebSocket 跨站劫持漏洞修复
- 设备配对安全增强
- 命令审批安全加固
- 多个渠道 Webhook 安全增强

---

## 六、附录

### A. 版本发布说明链接

- [v2026.3.13 Release Notes](https://github.com/openclaw/openclaw/releases/tag/v2026.3.13-1)
- [v2026.3.12 Release Notes](https://github.com/openclaw/openclaw/releases/tag/v2026.3.12)
- [v2026.3.11 Release Notes](https://github.com/openclaw/openclaw/releases/tag/v2026.3.11)

### B. 相关 Issue 和 PR

本次升级涉及的主要变更：
- Node.js 最低版本要求: #45640
- Fast Mode 支持: 多个 PR
- 安全修复: 多个 GHSA 编号

### C. 联系方式

如有问题，请通过以下方式反馈：
- GitHub Issues: https://github.com/10000ge10000/luci-app-openclaw/issues
- OpenClaw 官方: https://github.com/openclaw/openclaw/issues

---

**文档版本**: 1.0
**创建日期**: 2026-03-16
**最后更新**: 2026-03-16
