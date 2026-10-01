# vps-radar

基于 **Cloudflare Workers + D1** 的轻量 VPS 监控面板：一个 Worker、一个数据库、一行命令装探针，零服务器成本。

## 功能

- 仪表盘：CPU / 内存 / 磁盘 / 实时网速 / 累计流量 / 在线状态，10 秒自动刷新
- 点击任意机器查看 24 小时历史曲线（CPU、内存、上下行流量）
- 探针：纯 bash + /proc，systemd 常驻，资源占用可忽略
- 管理：网页内添加/删除服务器，添加后直接给出该机的**一键安装命令**
- 数据保留期、离线判定阈值均可配置

## 部署

```bash
npm i -g wrangler
wrangler login

# 1. 建库，把返回的 database_id 填进 wrangler.toml
npx wrangler d1 create vps-radar

# 2. 初始化表结构
npx wrangler d1 execute vps-radar --remote --file=schema.sql

# 3. 设置管理令牌（仪表盘登录 + 管理 API）
npx wrangler secret put ADMIN_TOKEN

# 4. 发布
npx wrangler deploy
```

打开 `https://vps-radar.<你的子域>.workers.dev`，右上角「+ 添加服务器」，复制给出的一键命令到目标 VPS 执行：

```bash
bash <(curl -fsSL https://你的域名/agent.sh) https://你的域名 <SERVER_ID> <TOKEN>
```

## 配置（wrangler.toml `[vars]`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PUBLIC_DASHBOARD` | `"1"` | `"1"` 公开只读仪表盘；设 `"0"` 则需 ADMIN_TOKEN 登录 |
| `RETENTION_DAYS` | `"30"` | 历史数据保留天数 |
| `OFFLINE_AFTER` | `"120"` | 超过该秒数未上报判定离线 |
| `SITE_TITLE` | `VPS Radar` | 页面标题 |

历史清理：在 `wrangler.toml` 追加 `[triggers]` 段开启定时清理（可选，不开则只增不删）：

```toml
[triggers]
crons = ["0 * * * *"]
```

## API

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/report` | 机器 token | 探针上报 |
| GET | `/api/servers` | 视配置 | 所有机器最新状态 |
| GET | `/api/history/:id?hours=24` | 视配置 | 历史曲线 |
| POST | `/api/servers` | Admin | 创建机器，返回 id+token |
| DELETE | `/api/servers/:id` | Admin | 删除机器及历史 |
| PATCH | `/api/servers/:id` | Admin | 改名 `{name}` |
| POST | `/api/login` | — | `{token}` 换取管理 cookie |

## 卸载探针

```bash
systemctl disable --now vps-radar-agent
rm -f /etc/systemd/system/vps-radar-agent.service /usr/local/bin/vps-radar-agent /etc/vps-radar.conf
systemctl daemon-reload
```

## License

MIT
