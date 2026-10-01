# vps-radar

基于 **Cloudflare Workers + D1** 的轻量 VPS 监控面板：一个 Worker、一个数据库、一行命令装探针，零服务器成本。

**免费**：Cloudflare 免费套餐即可跑 10 台以内的 VPS，无需信用卡。

## 🚀 一键部署（手机上 5 分钟搞定）

不需要电脑、不需要装任何软件，全部在浏览器里点：

### 第 1 步：Fork 本仓库

点本页右上角 **Fork** → **Create fork**，把仓库复制到你自己的账号下。

### 第 2 步：拿两个 Cloudflare 凭证

需要提前注册好 [Cloudflare](https://dash.cloudflare.com/sign-up) 账号（免费）。

1. **API Token**：打开 <https://dash.cloudflare.com/profile/api-tokens>
   → **Create Token** → 找到 **Edit Cloudflare Workers** 模板点 **Use template**
   → 权限里确认有 **Account → D1 → Edit**（没有就点 *+ Add additional* 补上）
   → **Continue to summary** → **Create Token** → 复制保存。
2. **Account ID**：打开 <https://dash.cloudflare.com> → 点进 **Workers & Pages**
   → 右侧栏复制 **Account ID**。

### 第 3 步：在 Fork 的仓库里填 Secrets

进你 Fork 的仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**，添加三条：

| Name | 内容 |
|---|---|
| `CF_API_TOKEN` | 第 2 步的 API Token |
| `CF_ACCOUNT_ID` | 第 2 步的 Account ID |
| `ADMIN_TOKEN` | 自己编一个强密码，用来登录仪表盘和加机器 |

**可选**（不配就没有通知功能，其余一切正常）：

| Name | 内容 |
|---|---|
| `TG_BOT_TOKEN` | Telegram 机器人 Token：TG 里找 @BotFather → /newbot 拿到 |
| `TG_CHAT_ID` | 接收通知的聊天 ID：先给你的机器人发条消息，再访问 `https://api.telegram.org/bot<TOKEN>/getUpdates` 看 `chat.id` |
| `BARK_KEY` | iOS Bark 推送 Key（Bark App 首页那串），与 Telegram 二选一或都配 |

### 第 4 步：点一下部署

仓库 → **Actions** → （首次会提示，点 *I understand my workflows, go ahead and enable them*）
→ 左侧选 **Deploy to Cloudflare** → 右侧 **Run workflow** → **Run workflow**。

等 1~2 分钟变绿勾 ✅，部署完成。打开最后几步日志里出现的
`https://vps-radar.<子域>.workers.dev`，就是你的监控面板。

> 以后再点一次 Run workflow 就是更新部署，D1 数据库和表结构会自动复用，数据不丢。

### 第 5 步：接入 VPS

手机浏览器打开面板 → 右上角 **🔑 登录管理** 输入 `ADMIN_TOKEN` → **+ 添加服务器** → 复制弹出的一键命令，
用任意 SSH App（Termius / Shelly / WebSSH 都行）登录你的 VPS 粘贴执行，几秒后面板上就出现这台机器。

### 第 6 步：设置价格和到期日（可选）

点卡片上的 **编辑**，依次填备注名、价格（如 `¥299/年`）、到期日期（`2027-03-15`）。
填完后：卡片显示价格和到期倒计时（7 天内变黄、3 天内变红）；配了 Telegram/Bark 的话，
到期前 7 天和前 3 天会各收到一次提醒，机器离线和恢复也会推送。

> 续费后重新编辑到期日期即可，提醒会自动重置。

---

## 功能

- 仪表盘：CPU / 内存 / 磁盘 / 实时网速 / 累计流量 / 在线状态，10 秒自动刷新
- 点击任意机器查看 24 小时历史曲线（CPU、内存、上下行流量）
- **预警通知**：机器离线/恢复时推送 Telegram 或 Bark（iOS）通知
- **到期提醒**：给每台机器设置到期日期后，前 7 天和前 3 天各推送一次提醒
- **价格展示**：卡片上直接显示每台机器的价格和到期倒计时
- 探针：纯 bash + /proc，systemd 常驻，资源占用可忽略
- 管理：网页内添加/编辑/删除服务器，添加后直接给出该机的**一键安装命令**
- 数据保留期、离线判定阈值均可配置

## 配置（wrangler.toml `[vars]`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PUBLIC_DASHBOARD` | `"1"` | `"1"` 公开只读仪表盘；设 `"0"` 则需 ADMIN_TOKEN 登录 |
| `RETENTION_DAYS` | `"30"` | 历史数据保留天数 |
| `OFFLINE_AFTER` | `"120"` | 超过该秒数未上报判定离线 |
| `SITE_TITLE` | `VPS Radar` | 页面标题 |

改法：直接在 GitHub 网页上编辑 `wrangler.toml` 提交，然后到 Actions 再跑一次
**Deploy to Cloudflare** 即可，不用碰命令行。

历史数据和预警由 cron 每分钟驱动（默认已开启 `* * * * *`），整点自动清理过期历史，无需配置。

## API

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/report` | 机器 token | 探针上报 |
| GET | `/api/servers` | 视配置 | 所有机器最新状态 |
| GET | `/api/history/:id?hours=24` | 视配置 | 历史曲线 |
| POST | `/api/servers` | Admin | 创建机器，返回 id+token |
| DELETE | `/api/servers/:id` | Admin | 删除机器及历史 |
| PATCH | `/api/servers/:id` | Admin | 编辑 `{name, price, expire_at}` |
| POST | `/api/login` | — | `{token}` 换取管理 cookie |

## 电脑手动部署（可选）

```bash
npm i -g wrangler && wrangler login
npx wrangler d1 create vps-radar            # 把 database_id 填进 wrangler.toml
npx wrangler d1 execute vps-radar --remote --file=schema.sql
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

## 卸载探针

```bash
systemctl disable --now vps-radar-agent
rm -f /etc/systemd/system/vps-radar-agent.service /usr/local/bin/vps-radar-agent /etc/vps-radar.conf
systemctl daemon-reload
```

## License

MIT
