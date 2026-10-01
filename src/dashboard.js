// 内嵌前端：仪表盘 + 登录页。无外部依赖，图表用 canvas 手绘。

const baseCss = `
:root{--bg:#0d1117;--panel:#161b22;--line:#30363d;--fg:#e6edf3;--dim:#8b949e;
--ok:#3fb950;--warn:#d29922;--bad:#f85149;--acc:#58a6ff}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--fg);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
a{color:var(--acc);text-decoration:none}
header{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line)}
header h1{font-size:16px;font-weight:600}
header .sp{flex:1}
button{background:#21262d;color:var(--fg);border:1px solid var(--line);border-radius:6px;
padding:5px 12px;cursor:pointer;font:inherit}
button:hover{border-color:var(--dim)}
button.primary{background:#1f6feb;border-color:#1f6feb;color:#fff}
button.danger:hover{border-color:var(--bad);color:var(--bad)}
`;

export function renderLogin() {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 · VPS Monitor</title>
<style>${baseCss}
main{display:grid;place-items:center;min-height:100vh}
form{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:28px;width:320px}
input{width:100%;background:#0d1117;border:1px solid var(--line);border-radius:6px;color:var(--fg);
padding:8px 10px;margin:10px 0 16px;font:inherit}
.err{color:var(--bad);min-height:20px;font-size:12px}
</style></head><body><main><form id="f"><h2 style="font-size:15px;margin-bottom:4px">VPS Monitor</h2>
<p style="color:var(--dim);font-size:12px">输入管理令牌进入仪表盘</p>
<input type="password" id="t" placeholder="ADMIN_TOKEN" autocomplete="current-password">
<button class="primary" style="width:100%">登录</button><div class="err" id="e"></div></form></main>
<script>
f.onsubmit=async ev=>{ev.preventDefault();
const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},
body:JSON.stringify({token:t.value})});
if(r.ok)location.reload();else e.textContent='令牌错误';};
</script></body></html>`;
}

export function renderDashboard(opts) {
  const admin = opts && opts.admin;
  const title = (opts && opts.title) || 'VPS Monitor';
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>${baseCss}
main{padding:20px;display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(340px,1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px;position:relative}
.card.off{opacity:.55}
.row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px}
.name{font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
.on{background:var(--ok)}.offd{background:var(--bad)}
.meta{color:var(--dim);font-size:12px;margin:2px 0 10px}
.bar{height:6px;background:#21262d;border-radius:3px;overflow:hidden;margin:3px 0 9px}
.bar i{display:block;height:100%;border-radius:3px;background:var(--ok)}
.lbl{display:flex;justify-content:space-between;font-size:12px;color:var(--dim)}
canvas.spark{width:100%;height:48px;display:block;margin-top:8px}
.up{color:var(--dim);font-size:11px;position:absolute;top:14px;right:16px}
.card .del{position:absolute;bottom:12px;right:16px;font-size:11px;padding:2px 8px}
#dlg{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;place-items:center;z-index:9}
#dlg .box{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:24px;width:min(720px,94vw)}
#dlg canvas{width:100%;height:160px}
#dlg .tabs{display:flex;gap:8px;margin:12px 0}
#dlg .tabs button.on{border-color:var(--acc);color:var(--acc)}
pre.cmd{background:#0d1117;border:1px solid var(--line);border-radius:6px;padding:10px;font-size:12px;
overflow-x:auto;white-space:pre-wrap;word-break:break-all;color:var(--ok)}
.empty{grid-column:1/-1;text-align:center;color:var(--dim);padding:60px 0}
</style></head><body>
<header><h1>📡 ${title}</h1><span class="sp"></span>
<span id="stat" style="color:var(--dim);font-size:12px"></span>
${admin ? '<button id="add">+ 添加服务器</button>' : '<button id="login">🔑 登录管理</button>'}
</header>
<main id="grid"><div class="empty">加载中…</div></main>
<div id="dlg"><div class="box"><div class="row"><b id="dname"></b>
<button onclick="dlg.style.display='none'">✕</button></div>
<div class="tabs" id="dtabs"></div><div id="dbody"><canvas id="dchart"></canvas></div></div></div>

<script>
const ADMIN=${admin ? 'true' : 'false'};
let lastList=null;

const fmtB=n=>{const u=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}
return n.toFixed(n>=100?0:1)+' '+u[i]};
const fmtUp=s=>{if(!s)return'-';const d=~~(s/86400),h=~~(s%86400/3600),m=~~(s%3600/60);
return d?d+'d '+h+'h':(h?h+'h '+m+'m':m+'m')};
const pct=(a,b)=>b?Math.min(100,a/b*100):0;
const color=p=>p<60?'var(--ok)':p<85?'var(--warn)':'var(--bad)';

function spark(cv,data,lo,hi,stroke){
const dpr=devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;
cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext('2d');c.scale(dpr,dpr);
if(!data||data.length<2){c.fillStyle='#8b949e';c.font='11px monospace';c.fillText('暂无数据',8,20);return}
const min=lo??Math.min(...data),max=hi??Math.max(...data,1);
c.beginPath();data.forEach((v,i)=>{const x=i/(data.length-1)*w,y=h-4-(v-min)/(max-min||1)*(h-8);
i?c.lineTo(x,y):c.moveTo(x,y)});
c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();
c.lineTo(w,h);c.lineTo(0,h);c.closePath();c.fillStyle=stroke+'22';c.fill();
}

function card(s){
const mem=pct(s.mem_used,s.mem_total),dsk=pct(s.disk_used,s.disk_total);
const t=new Date(s.ts*1000).toLocaleTimeString();
let info='';
if(s.price||s.expire_at){
  info='<div class="meta">';
  if(s.price)info+='💰 '+esc(s.price);
  if(s.expire_at){
    const days=Math.ceil((s.expire_at*1000-Date.now())/86400000);
    const c=days<=3?'var(--bad)':days<=7?'var(--warn)':'var(--dim)';
    info+=(s.price?' · ':'')+'<span style="color:'+c+'">📅 '+new Date(s.expire_at*1000).toISOString().slice(0,10)
      +' 到期'+(days>=0?'（剩 '+days+' 天）':'（已过期）')+'</span>';
  }
  info+='</div>';
}
return '<div class="card'+(s.online?'':' off')+'" data-id="'+s.id+'">'
+'<div class="row"><span class="name"><i class="dot '+(s.online?'on':'offd')+'"></i>'
+esc(s.name||s.id.slice(0,8))+'</span></div>'
+'<div class="meta">'+esc(s.os||'-')+' · '+esc(s.ip||'-')+' · up '+fmtUp(s.uptime)+'</div>'
+info
+'<div class="lbl"><span>CPU '+s.cpu.toFixed(1)+'%</span><span>load '+s.load1.toFixed(2)+'</span></div>'
+'<div class="bar"><i style="width:'+s.cpu+'%;background:'+color(s.cpu)+'"></i></div>'
+'<div class="lbl"><span>内存 '+fmtB(s.mem_used)+' / '+fmtB(s.mem_total)+'</span><span>'+mem.toFixed(0)+'%</span></div>'
+'<div class="bar"><i style="width:'+mem+'%;background:'+color(mem)+'"></i></div>'
+'<div class="lbl"><span>磁盘 '+fmtB(s.disk_used)+' / '+fmtB(s.disk_total)+'</span><span>'+dsk.toFixed(0)+'%</span></div>'
+'<div class="bar"><i style="width:'+dsk+'%;background:'+color(dsk)+'"></i></div>'
+'<div class="lbl"><span>↓ '+fmtB(s.net_rx)+'/s</span><span>↑ '+fmtB(s.net_tx)+'/s</span></div>'
+'<div class="lbl"><span>累计 ↓ '+fmtB(s.net_rx_total)+' ↑ '+fmtB(s.net_tx_total)+'</span></div>'
+'<canvas class="spark"></canvas>'
+'<div class="up">'+t+'</div>'
+(ADMIN?'<button class="edit" style="position:absolute;bottom:12px;right:64px;font-size:11px;padding:2px 8px">编辑</button><button class="del danger">删除</button>':'')
+'</div>';
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

async function load(){
const r=await fetch('/api/servers');if(r.status===401){location.reload();return}
const d=await r.json();lastList=d;
stat.textContent=d.servers.length+' 台 · '+d.servers.filter(s=>s.online).length+' 在线';
grid.innerHTML=d.servers.length?d.servers.map(card).join(''):'<div class="empty">还没有服务器，点击右上角添加</div>';
// 点击卡片看历史 / 删除
grid.querySelectorAll('.card').forEach(c=>{
c.addEventListener('click',async ev=>{
const s=(lastList.servers||[]).find(x=>x.id===c.dataset.id);
if(ev.target.classList.contains('del')){
if(!confirm('删除该服务器及其全部历史？'))return;
await fetch('/api/servers/'+c.dataset.id,{method:'DELETE'});load();return;
}
if(ev.target.classList.contains('edit')){
if(!s)return;
const name=prompt('备注名:',s.name||'');if(name===null)return;
const price=prompt('价格（自由文本，如 ¥299/年，留空不显示）:',s.price||'');if(price===null)return;
const cur=s.expire_at?new Date(s.expire_at*1000).toISOString().slice(0,10):'';
const exp=prompt('到期日期（YYYY-MM-DD，留空清除）:',cur);if(exp===null)return;
let expire_at=0;
if(exp.trim()){
const d=new Date(exp.trim()+'T23:59:59Z');
if(isNaN(d)){alert('日期格式不对');return}
expire_at=Math.floor(d.getTime()/1000);
}
await fetch('/api/servers/'+c.dataset.id,{method:'PATCH',
headers:{'content-type':'application/json'},
body:JSON.stringify({name,price,expire_at})});
load();return;
}
if(s)openDetail(s);
});
});
}
async function openDetail(s){
dname.textContent=s.name||s.id;
dbody.innerHTML='<canvas id="dchart"></canvas>';
const chart=dbody.firstChild;
dlg.style.display='grid';
const kinds=[['CPU %','cpu',0,100,'#58a6ff'],['内存','mem_used',null,null,'#3fb950'],
['↓ 流量','net_rx',null,null,'#d29922'],['↑ 流量','net_tx',null,null,'#f85149']];
dtabs.innerHTML='';
kinds.forEach((k,i)=>{
const b=document.createElement('button');b.textContent=k[0];if(i===0)b.className='on';
b.onclick=async()=>{dtabs.querySelectorAll('button').forEach(x=>x.className='');b.className='on';draw(k)};
dtabs.appendChild(b);
});
const r=await fetch('/api/history/'+s.id+'?hours=24');const d=await r.json();
const draw=k=>spark(chart,d.points.map(p=>p[k[1]]),k[2],k[3],k[4]);
draw(kinds[0]);
}

${admin ? `add.onclick=async()=>{const name=prompt('服务器备注名（可留空）:','');
if(name===null)return;
const r=await fetch('/api/servers',{method:'POST',headers:{'content-type':'application/json'},
body:JSON.stringify({name})});
const d=await r.json();
const box=document.createElement('div');
box.innerHTML='<p style="margin-bottom:8px">在该 VPS 上执行一键安装：</p>'
+'<pre class="cmd">bash <(curl -fsSL '+location.origin+'/agent.sh) '+location.origin+' '+d.id+' '+d.token+'</pre>';
dlg.style.display='grid';dname.textContent='添加成功';
dtabs.innerHTML='';dbody.innerHTML='';dbody.appendChild(box);
};`:`login.onclick=async()=>{
const t=prompt('输入 ADMIN_TOKEN:');
if(t===null)return;
const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},
body:JSON.stringify({token:t})});
if(r.ok)location.reload();else alert('令牌错误');
};`}

load();setInterval(load,10000);
</script></body></html>`;
}
