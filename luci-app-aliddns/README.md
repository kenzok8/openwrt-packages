# luci-app-aliddns

适用于 OpenWrt/LuCI 的阿里云 AliDDNS 动态域名服务插件。

## 功能特性

- **IPv4/IPv6 双栈支持**: 同时支持 A 记录和 AAAA 记录的动态更新
- **多WAN接口支持**: 可选择通过哪个网络接口获取公网IP
- **自动清理旧记录**: 更新前可选择清除同名DNS记录
- **定时任务**: 支持自定义检查间隔（1-59分钟）
- **阿里云API签名**: 使用HMAC-SHA1签名验证请求

## 依赖

- `luci`
- `luci-base`
- `openssl-util`
- `curl`

## 安装

```bash
# 添加 feed
echo 'src-git aliddns https://github.com/kenzok78/luci-app-aliddns' >> feeds.conf.default
./scripts/feeds update -a
./scripts/feeds install -a -p aliddns

# 编译
make package/luci-app-aliddns/compile V=s
```

## 使用说明

1. 访问 OpenWrt Web 管理界面 → 服务 → AliDDNS
2. 启用插件
3. 填写阿里云 Access Key ID 和 Access Key Secret
4. 填写主域名和子域名
5. 选择WAN接口和IP类型（IPv4/IPv6）
6. 保存并应用

## 配置说明

| 选项 | 说明 |
|------|------|
| 启用 | 是否启用 AliDDNS |
| 清除所有同名记录 | 更新前清除DNS记录 |
| 启用 IPv4 | 启用IPv4 A记录更新 |
| 启用 IPv6 | 启用IPv6 AAAA记录更新 |
| Access Key ID | 阿里云 Access Key ID |
| Access Key Secret | 阿里云 Access Key Secret |
| WAN-IP来源 | 获取公网IP的接口 |
| WAN6-IP来源 | 获取IPv6地址的接口 |
| 主域名 | 顶级域名（如 example.com） |
| 子域名 | 子域名（如 www） |
| 检查时间 | 间隔时间（分钟） |

## 工作原理

AliDDNS 通过阿里云 DNS API 实现动态域名更新：

1. 获取 WAN 口公网 IP（IPv4 或 IPv6）
2. 查询当前 DNS 记录值
3. 对比是否发生变化
4. 如有变化，调用阿里云 API 更新 DNS 记录
5. 支持自动添加新记录或更新已有记录

## 目录结构

```
luci-app-aliddns/
├── Makefile
├── luasrc/
│   ├── controller/           # LuCI 控制器
│   ├── model/cbi/          # CBI 模型
│   └── view/               # 视图模板
├── po/                     # 翻译文件
├── root/
│   ├── etc/
│   │   ├── config/         # UCI 配置
│   │   ├── init.d/         # 启动脚本
│   │   └── uci-defaults/  # 初始化脚本
│   └── usr/sbin/           # 主程序脚本
└── README.md
```

## 常见问题

### Q: 更新失败怎么办？

- 检查 Access Key ID/Secret 是否正确
- 检查域名是否已在阿里云 DNS 中添加
- 检查网络连接是否正常
- 查看 `/var/log/aliddns.log` 获取详细错误信息

### Q: 如何手动触发更新？

```bash
/usr/sbin/aliddns
```

## 许可证

MIT

## 来源

- 基于 honwen/luci-app-aliddns 维护
- AliDNS API: https://help.aliyun.com/document_detail/29774.html
