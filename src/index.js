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

async function handleReport(req, env) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'bad json' }, 400);

  const id = String(body.id || '');
  if (!/^[a-f0-9]{32}$/.test(id)) return json({ error: 'bad id' }, 400);

  const srv = await env.DB.prepare('SELECT id, token FROM servers WHERE id = ?').bind(id).first();
  if (!srv) return json({ error: 'unknown server' }, 404);
  if (bearer(req) !== srv.token) return json({ error: 'unauthorized' }, 401);

  const ts = now();
  const v = {};
  for (const f of NUM_FIELDS) v[f] = Number(body[f]) || 0;

  // 顺带更新名称/系统/IP（agent 每次上报都带）
  await env.DB.batch([
    env.DB.prepare('UPDATE servers SET name = ?, os = ?, ip = ? WHERE id = ?')
      .bind(String(body.name || '').slice(0, 64), String(body.os || '').slice(0, 64),
        String(body.ip || '').slice(0, 64), id),
    env.DB.prepare(`INSERT INTO metrics (server_id, ts, cpu, load1, mem_total, mem_used,
        swap_total, swap_used, disk_total, disk_used, net_rx, net_tx, uptime)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, ts, v.cpu, v.load1, v.mem_total, v.mem_used, v.swap_total, v.swap_used,
        v.disk_total, v.disk_used, v.net_rx, v.net_tx, v.uptime),
    env.DB.prepare(`INSERT INTO latest (server_id, ts, cpu, load1, mem_total, mem_used,
        swap_total, swap_used, disk_total, disk_used, net_rx, net_tx, uptime, net_rx_total, net_tx_total)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(server_id) DO UPDATE SET
        ts=excluded.ts, cpu=excluded.cpu, load1=excluded.load1, mem_total=excluded.mem_total,
        mem_used=excluded.mem_used, swap_total=excluded.swap_total, swap_used=excluded.swap_used,
        disk_total=excluded.disk_total, disk_used=excluded.disk_used, net_rx=excluded.net_rx,
        net_tx=excluded.net_tx, uptime=excluded.uptime,
        net_rx_total=excluded.net_rx_total, net_tx_total=excluded.net_tx_total`)
      .bind(id, ts, v.cpu, v.load1, v.mem_total, v.mem_used, v.swap_total, v.swap_used,
        v.disk_total, v.disk_used, v.net_rx, v.net_tx, v.uptime, v.net_rx_total, v.net_tx_total),
  ]);
  return json({ ok: true, ts });
}

async function handleList(env) {
  const offline = Number(env.OFFLINE_AFTER || 120);
  const { results } = await env.DB.prepare(`
    SELECT s.id, s.name, s.os, s.ip, l.*
    FROM servers s JOIN latest l ON l.server_id = s.id
    ORDER BY s.name`).all();
  const t = now();
  for (const r of results) {
    r.online = t - r.ts <= offline;
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
  await env.DB.prepare('INSERT INTO servers (id, name, token, created_at) VALUES (?,?,?,?)')
    .bind(id, String(body.name || '').slice(0, 64), token, now()).run();
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

async function purgeOld(env) {
  const days = Number(env.RETENTION_DAYS || 30);
  await env.DB.prepare('DELETE FROM metrics WHERE ts < ?').bind(now() - days * 86400).run();
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === '/api/report' && req.method === 'POST') return handleReport(req, env);

    if (p === '/api/login' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (env.ADMIN_TOKEN && body.token === env.ADMIN_TOKEN) {
        return json({ ok: true }, 200, {
          'set-cookie': `vm_auth=${tokenHashSync(env.ADMIN_TOKEN)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
        });
      }
      return json({ error: 'bad token' }, 401);
    }

    if (p === '/api/servers' && req.method === 'GET') {
      const pub = env.PUBLIC_DASHBOARD === '1';
      if (!pub && !isAdmin(req, env, url)) return json({ error: 'unauthorized' }, 401);
      return handleList(env);
    }

    const hm = p.match(/^\/api\/history\/([a-f0-9]{32})$/);
    if (hm && req.method === 'GET') {
      const pub = env.PUBLIC_DASHBOARD === '1';
      if (!pub && !isAdmin(req, env, url)) return json({ error: 'unauthorized' }, 401);
      return handleHistory(env, hm[1], url);
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
      await env.DB.prepare('UPDATE servers SET name = ? WHERE id = ?')
        .bind(String(body.name || '').slice(0, 64), dm[1]).run();
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
        title: env.SITE_TITLE || 'VPS Radar',
      }), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    return json({ error: 'not found' }, 404);
  },

  // wrangler.toml 加 [triggers] crons = ["0 * * * *"] 可启用定期清理
  async scheduled(_evt, env) {
    await purgeOld(env);
  },
};
