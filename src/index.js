// vps-radar — Cloudflare Worker + D1 VPS 监控
import { renderDashboard, renderLogin } from './dashboard.js';
import AGENT_SH from '../agent/agent.sh';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

const uid = () => crypto.randomUUID().replaceAll('-', '');
const now = () => Math.floor(Date.now() / 1000);

function bearer(req) {
  const h = req.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
}

function isAdmin(req, env, url) {
  const t = env.ADMIN_TOKEN || '';
  if (!t) return false;
  if (bearer(req) === t) return true;
  // 仪表盘用 cookie 登录
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)vm_auth=([a-f0-9]{64})/);
  return !!m && m[1] === tokenHashSync(t) && url.pathname !== '/api/report';
}

// 同步散列（WebCrypto 是异步的，会话 cookie 用 FNV 双散列拼 64 hex 即可）
function tokenHashSync(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x811c9dc5) >>> 0;
  }
  const part = (h, salt) => {
    let out = '';
    let x = h ^ salt;
    for (let i = 0; i < 8; i++) {
      x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
      x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0;
      out += x.toString(16).padStart(8, '0');
    }
    return out;
  };
  return (part(h1, h2) + part(h2, h1)).slice(0, 64);
}

const NUM_FIELDS = ['cpu', 'load1', 'mem_total', 'mem_used', 'swap_total', 'swap_used',
  'disk_total', 'disk_used', 'net_rx', 'net_tx', 'uptime', 'net_rx_total', 'net_tx_total'];

// 旧库升级：列已存在时 ALTER 会报错，直接忽略（schema.sql 已含新库完整结构）
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  schemaReady = true;
  const alters = [
    "ALTER TABLE servers ADD COLUMN price TEXT NOT NULL DEFAULT ''",
    'ALTER TABLE servers ADD COLUMN expire_at INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE servers ADD COLUMN alert_offline INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE servers ADD COLUMN notified_7d INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE servers ADD COLUMN notified_3d INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE servers ADD COLUMN country TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE servers ADD COLUMN city TEXT NOT NULL DEFAULT ''",
    'ALTER TABLE latest ADD COLUMN meta_ts INTEGER NOT NULL DEFAULT 0',
    `CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', url TEXT NOT NULL,
      alert_down INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS site_checks (
      site_id TEXT NOT NULL, ts INTEGER NOT NULL, ok INTEGER NOT NULL DEFAULT 0,
      status INTEGER NOT NULL DEFAULT 0, latency INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (site_id, ts))`,
  ];
  for (const sql of alters) {
    try { await env.DB.prepare(sql).run(); } catch { /* 列已存在 */ }
  }
}

// 通知通道：Telegram / Bark / Server酱 / Pushplus，配了哪个用哪个，都配就都发
async function notify(env, text) {
  const jobs = [];
  if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
    jobs.push(fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text }),
    }).catch(() => {}));
  }
  if (env.BARK_KEY) {
    const barkServer = env.BARK_SERVER || 'https://api.day.app';
    jobs.push(fetch(`${barkServer}/${env.BARK_KEY}/${encodeURIComponent('VPS Radar')}/${encodeURIComponent(text)}`)
      .catch(() => {}));
  }
  if (env.SCT_SENDKEY) {
    jobs.push(fetch(`https://sctapi.ftqq.com/${env.SCT_SENDKEY}.send`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `title=${encodeURIComponent('VPS Radar')}&desp=${encodeURIComponent(text)}`,
    }).catch(() => {}));
  }
  if (env.PUSHPLUS_TOKEN) {
    jobs.push(fetch('https://www.pushplus.plus/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: env.PUSHPLUS_TOKEN, title: 'VPS Radar', content: text }),
    }).catch(() => {}));
  }
  await Promise.all(jobs);
}

const fmtDate = ts => new Date(ts * 1000).toISOString().slice(0, 10);

// 每分钟由 cron 调用：离线/恢复预警 + 到期前 7 天、3 天提醒
async function checkAlerts(env) {
  const offlineAfter = Number(env.OFFLINE_AFTER || 120);
  const t = now();
  const { results: servers } = await env.DB.prepare(
    'SELECT id, name, expire_at, alert_offline, notified_7d, notified_3d, created_at FROM servers').all();
  const { results: latest } = await env.DB.prepare('SELECT server_id, ts FROM latest').all();
  const lastTs = Object.fromEntries(latest.map(r => [r.server_id, r.ts]));

  const stmts = [];
  for (const s of servers) {
    const label = s.name || s.id.slice(0, 8);
    const last = lastTs[s.id] || 0;
    // 从未上报过的机器（装探针失败）超过阈值同样算离线
    const isOffline = last > 0 ? t - last > offlineAfter : t - s.created_at > offlineAfter;

    if (isOffline && !s.alert_offline) {
      await notify(env, `🔴 离线预警：${label} 已超过 ${offlineAfter} 秒未上报`);
      stmts.push(env.DB.prepare('UPDATE servers SET alert_offline = 1 WHERE id = ?').bind(s.id));
    } else if (!isOffline && s.alert_offline && last > 0) {
      await notify(env, `🟢 恢复上线：${label} 已恢复上报`);
      stmts.push(env.DB.prepare('UPDATE servers SET alert_offline = 0 WHERE id = ?').bind(s.id));
    }

    if (s.expire_at > 0) {
      const daysLeft = (s.expire_at - t) / 86400;
      if (daysLeft <= 3 && !s.notified_3d) {
        await notify(env, `⚠️ 到期提醒：${label} 将于 ${fmtDate(s.expire_at)} 到期，仅剩 ${Math.max(0, Math.ceil(daysLeft))} 天`);
        stmts.push(env.DB.prepare('UPDATE servers SET notified_3d = 1 WHERE id = ?').bind(s.id));
      } else if (daysLeft <= 7 && !s.notified_7d) {
        await notify(env, `⚠️ 到期提醒：${label} 将于 ${fmtDate(s.expire_at)} 到期，仅剩 7 天`);
        stmts.push(env.DB.prepare('UPDATE servers SET notified_7d = 1 WHERE id = ?').bind(s.id));
      }
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
}

async function handleReport(req, env) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'bad json' }, 400);

  const id = String(body.id || '');
  if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: 'bad id' }, 400);

  const srv = await env.DB.prepare('SELECT id, token FROM servers WHERE id = ?').bind(id).first();
  if (!srv) return json({ error: 'unknown server' }, 404);
  if (bearer(req) !== srv.token) return json({ error: 'unauthorized' }, 401);

  // Cloudflare 边缘节点自带上报来源的地理位置，直接取，无需第三方查询
  const country = String(req.cf?.country || '').slice(0, 8);
  const city = String(req.cf?.city || '').slice(0, 64);

  const ts = now();
  const v = {};
  for (const f of NUM_FIELDS) v[f] = Number(body[f]) || 0;

  // 元信息（系统/IP/位置）每小时同步一次就够，省下 2/3 的 D1 写入
  const META_INTERVAL = 3600;
  const cur = await env.DB.prepare('SELECT meta_ts FROM latest WHERE server_id = ?').bind(id).first();
  const syncMeta = !cur || ts - (cur.meta_ts || 0) > META_INTERVAL;

  const stmts = [
    env.DB.prepare(`INSERT INTO latest (server_id, ts, cpu, load1, mem_total, mem_used,
        swap_total, swap_used, disk_total, disk_used, net_rx, net_tx, uptime, net_rx_total, net_tx_total, meta_ts)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(server_id) DO UPDATE SET
        ts=excluded.ts, cpu=excluded.cpu, load1=excluded.load1, mem_total=excluded.mem_total,
        mem_used=excluded.mem_used, swap_total=excluded.swap_total, swap_used=excluded.swap_used,
        disk_total=excluded.disk_total, disk_used=excluded.disk_used, net_rx=excluded.net_rx,
        net_tx=excluded.net_tx, uptime=excluded.uptime,
        net_rx_total=excluded.net_rx_total, net_tx_total=excluded.net_tx_total,
        meta_ts=excluded.meta_ts`)
      .bind(id, ts, v.cpu, v.load1, v.mem_total, v.mem_used, v.swap_total, v.swap_used,
        v.disk_total, v.disk_used, v.net_rx, v.net_tx, v.uptime, v.net_rx_total, v.net_tx_total,
        syncMeta ? ts : (cur.meta_ts || 0)),
    env.DB.prepare(`INSERT INTO metrics (server_id, ts, cpu, load1, mem_total, mem_used,
        swap_total, swap_used, disk_total, disk_used, net_rx, net_tx, uptime)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, ts, v.cpu, v.load1, v.mem_total, v.mem_used, v.swap_total, v.swap_used,
        v.disk_total, v.disk_used, v.net_rx, v.net_tx, v.uptime),
  ];
  if (syncMeta) {
    // 备注名只在为空时采用主机名，用户改过后不再覆盖
    stmts.push(env.DB.prepare(`UPDATE servers SET
        name = CASE WHEN name = '' THEN ? ELSE name END,
        os = ?, ip = ?, country = ?, city = ? WHERE id = ?`)
      .bind(String(body.name || '').slice(0, 64), String(body.os || '').slice(0, 64),
        String(body.ip || '').slice(0, 64), country, city, id));
  }
  await env.DB.batch(stmts);
  return json({ ok: true, ts });
}

// 公开模式下对访客掩码 IP，管理员看完整地址
const maskIp = ip => {
  const v4 = ip.match(/^(\d+\.\d+)\.\d+\.\d+$/);
  if (v4) return v4[1] + '.*.*';
  const v6 = ip.match(/^([0-9a-fA-F:]+?):/);
  return v6 ? ip.split(':').slice(0, 3).join(':') + '::*' : ip;
};

async function handleList(env, mask) {
  const offline = Number(env.OFFLINE_AFTER || 120);
  const { results } = await env.DB.prepare(`
    SELECT s.id, s.name, s.os, s.ip, s.price, s.expire_at, s.country, s.city, l.*
    FROM servers s JOIN latest l ON l.server_id = s.id
    ORDER BY s.name`).all();
  const t = now();
  for (const r of results) {
    r.online = t - r.ts <= offline;
    if (mask && r.ip) r.ip = maskIp(r.ip);
    delete r.server_id;
  }
  return json({ servers: results, now: t, offline_after: offline });
}

async function handleHistory(env, id, url) {
  if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: 'bad id' }, 400);
  const hours = Math.min(Math.max(Number(url.searchParams.get('hours')) || 24, 1), 24 * 30);
  const since = now() - hours * 3600;
  const { results } = await env.DB.prepare(`
    SELECT ts, cpu, load1, mem_used, net_rx, net_tx
    FROM metrics WHERE server_id = ? AND ts >= ? ORDER BY ts`).bind(id, since).all();
  return json({ points: results });
}

async function handleCreate(req, env) {
  const body = await req.json().catch(() => ({}));
  const id = uid();
  const token = crypto.randomUUID() + crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO servers (id, name, token, price, expire_at, created_at) VALUES (?,?,?,?,?,?)')
    .bind(id, String(body.name || '').slice(0, 64), token,
      String(body.price || '').slice(0, 32), Number(body.expire_at) || 0, now()).run();
  return json({ id, token });
}

async function handleDelete(env, id) {
  if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: 'bad id' }, 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM servers WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM metrics WHERE server_id = ?').bind(id),
    env.DB.prepare('DELETE FROM latest WHERE server_id = ?').bind(id),
  ]);
  return json({ ok: true });
}

// 每分钟探测一次所有监控站点：HTTP 状态 + 延迟，异常/恢复时推送
async function checkSites(env) {
  const { results: sites } = await env.DB.prepare(
    'SELECT id, name, url, alert_down FROM sites').all();
  if (!sites.length) return;
  const t = now();

  const results = await Promise.all(sites.map(async s => {
    const start = Date.now();
    let ok = 0, status = 0;
    try {
      const r = await fetch(s.url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
        headers: { 'user-agent': 'vps-radar-monitor/1.0' },
      });
      status = r.status;
      ok = status < 500 ? 1 : 0; // 4xx 视为站点本身在线
      r.body?.cancel?.();
    } catch { /* 超时/连接失败 */ }
    return { s, ok, status, latency: Date.now() - start };
  }));

  const stmts = [];
  for (const { s, ok, status, latency } of results) {
    const label = s.name || s.url;
    stmts.push(env.DB.prepare(
      'INSERT INTO site_checks (site_id, ts, ok, status, latency) VALUES (?,?,?,?,?)')
      .bind(s.id, t, ok, status, latency));
    if (!ok && !s.alert_down) {
      await notify(env, `🔴 站点异常：${label} ${status ? 'HTTP ' + status : '连接失败/超时'}（${s.url}）`);
      stmts.push(env.DB.prepare('UPDATE sites SET alert_down = 1 WHERE id = ?').bind(s.id));
    } else if (ok && s.alert_down) {
      await notify(env, `🟢 站点恢复：${label} 已恢复访问（${latency}ms）`);
      stmts.push(env.DB.prepare('UPDATE sites SET alert_down = 0 WHERE id = ?').bind(s.id));
    }
  }
  await env.DB.batch(stmts);
}

async function purgeOld(env) {
  const days = Number(env.RETENTION_DAYS || 30);
  const cutoff = now() - days * 86400;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM metrics WHERE ts < ?').bind(cutoff),
    env.DB.prepare('DELETE FROM site_checks WHERE ts < ?').bind(cutoff),
  ]);
}

export default {
  async fetch(req, env) {
    await ensureSchema(env);
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === '/api/report' && req.method === 'POST') return handleReport(req, env);

    if (p === '/api/login' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (env.ADMIN_TOKEN && body.token === env.ADMIN_TOKEN) {
        return json({ ok: true }, 200, {
          'set-cookie': `vm_auth=${tokenHashSync(env.ADMIN_TOKEN)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
        });
      }
      return json({ error: 'bad token' }, 401);
    }

    if (p === '/api/servers' && req.method === 'GET') {
      const pub = env.PUBLIC_DASHBOARD === '1';
      const adm = isAdmin(req, env, url);
      if (!pub && !adm) return json({ error: 'unauthorized' }, 401);
      return handleList(env, pub && !adm);
    }

    const hm = p.match(/^\/api\/history\/([a-f0-9]{32})$/);
    if (hm && req.method === 'GET') {
      const pub = env.PUBLIC_DASHBOARD === '1';
      if (!pub && !isAdmin(req, env, url)) return json({ error: 'unauthorized' }, 401);
      return handleHistory(env, hm[1], url);
    }

    // 网站监控：列表 / 添加 / 删除 / 延迟历史
    if (p === '/api/sites' && req.method === 'GET') {
      const pub = env.PUBLIC_DASHBOARD === '1';
      if (!pub && !isAdmin(req, env, url)) return json({ error: 'unauthorized' }, 401);
      const { results } = await env.DB.prepare(`
        SELECT s.id, s.name, s.url, s.created_at,
          (SELECT ok FROM site_checks c WHERE c.site_id = s.id ORDER BY ts DESC LIMIT 1) AS ok,
          (SELECT status FROM site_checks c WHERE c.site_id = s.id ORDER BY ts DESC LIMIT 1) AS status,
          (SELECT latency FROM site_checks c WHERE c.site_id = s.id ORDER BY ts DESC LIMIT 1) AS latency,
          (SELECT ts FROM site_checks c WHERE c.site_id = s.id ORDER BY ts DESC LIMIT 1) AS checked_at
        FROM sites s ORDER BY s.created_at`).all();
      return json({ sites: results });
    }
    if (p === '/api/sites' && req.method === 'POST') {
      if (!isAdmin(req, env, url)) return json({ error: 'unauthorized' }, 401);
      const body = await req.json().catch(() => ({}));
      const siteUrl = String(body.url || '').trim();
      if (!/^https?:\/\/.+/.test(siteUrl)) return json({ error: 'bad url' }, 400);
      const id = uid();
      await env.DB.prepare('INSERT INTO sites (id, name, url, created_at) VALUES (?,?,?,?)')
        .bind(id, String(body.name || '').slice(0, 64), siteUrl.slice(0, 256), now()).run();
      return json({ id });
    }
    const sm = p.match(/^\/api\/sites\/([a-f0-9]{32})$/);
    if (sm && req.method === 'DELETE') {
      if (!isAdmin(req, env, url)) return json({ error: 'unauthorized' }, 401);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(sm[1]),
        env.DB.prepare('DELETE FROM site_checks WHERE site_id = ?').bind(sm[1]),
      ]);
      return json({ ok: true });
    }
    const sh = p.match(/^\/api\/site-history\/([a-f0-9]{32})$/);
    if (sh && req.method === 'GET') {
      const pub = env.PUBLIC_DASHBOARD === '1';
      if (!pub && !isAdmin(req, env, url)) return json({ error: 'unauthorized' }, 401);
      const since = now() - 86400;
      const { results } = await env.DB.prepare(`
        SELECT ts, ok, status, latency FROM site_checks
        WHERE site_id = ? AND ts >= ? ORDER BY ts`).bind(sh[1], since).all();
      return json({ points: results });
    }

    // 管理接口：创建/删除/改名单
    if (p === '/api/servers' && req.method === 'POST') {
      if (!isAdmin(req, env, url)) return json({ error: 'unauthorized' }, 401);
      return handleCreate(req, env);
    }
    const dm = p.match(/^\/api\/servers\/([a-f0-9]{32})$/);
    if (dm && req.method === 'DELETE') {
      if (!isAdmin(req, env, url)) return json({ error: 'unauthorized' }, 401);
      return handleDelete(env, dm[1]);
    }
    if (dm && req.method === 'PATCH') {
      if (!isAdmin(req, env, url)) return json({ error: 'unauthorized' }, 401);
      const body = await req.json().catch(() => ({}));
      const cur = await env.DB.prepare('SELECT expire_at FROM servers WHERE id = ?').bind(dm[1]).first();
      if (!cur) return json({ error: 'unknown server' }, 404);
      const expireAt = Number(body.expire_at) || 0;
      // 到期日变化时重置提醒标记，新一轮 7 天/3 天提醒会重新触发
      const reset = expireAt !== cur.expire_at ? ', notified_7d = 0, notified_3d = 0' : '';
      await env.DB.prepare(`UPDATE servers SET name = ?, price = ?, expire_at = ?${reset} WHERE id = ?`)
        .bind(String(body.name || '').slice(0, 64), String(body.price || '').slice(0, 32),
          expireAt, dm[1]).run();
      return json({ ok: true });
    }

    if (p === '/agent.sh' && req.method === 'GET') {
      return new Response(AGENT_SH, {
        headers: { 'content-type': 'text/x-shellscript; charset=utf-8' },
      });
    }

    if (p === '/' || p === '/index.html') {
      const pub = env.PUBLIC_DASHBOARD === '1';
      if (!pub && !isAdmin(req, env, url)) {
        return new Response(renderLogin(), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      return new Response(renderDashboard({
        admin: isAdmin(req, env, url),
        title: env.SITE_TITLE || 'VPS RADAR',
      }), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    return json({ error: 'not found' }, 404);
  },

  // 每分钟 cron：预警检查；每天 UTC 0 点清理一次过期历史（删除也计写入量）
  async scheduled(_evt, env) {
    await ensureSchema(env);
    await checkAlerts(env);
    await checkSites(env);
    const d = new Date();
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) await purgeOld(env);
  },
};
