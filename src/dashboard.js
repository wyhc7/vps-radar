// 内嵌前端：仪表盘 + 登录页。Brutalist 方向（见 STYLE.md），零外部依赖，canvas 手绘图表。
// 字体走 Google Fonts CDN（Archivo Black + Space Mono），加载失败时降级系统字体。

const baseCss = `
:root{
  --bg:#FFFFFF; --ink:#000000; --hot:#FF2D00; --link:#0000EE;
  --ok:#0A7C00; --yellow:#FFE600; --paper:#F2F2F2;
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{
  background:var(--bg); color:var(--ink);
  font:14px/1.45 Arial,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;
}
.mono{font-family:"Space Mono","Courier New",monospace; font-variant-numeric:tabular-nums}
.display{font-family:"Archivo Black","PingFang SC","Microsoft YaHei",Arial,sans-serif; font-weight:400}
button{
  font:inherit; cursor:pointer; background:var(--bg); color:var(--ink);
  border:3px solid var(--ink); padding:8px 16px; min-height:44px;
  box-shadow:4px 4px 0 var(--ink);
}
button:active{transform:translate(4px,4px); box-shadow:0 0 0 var(--ink)}
button:focus-visible{outline:3px solid var(--link); outline-offset:2px}
a{color:var(--link)}
a:focus-visible{outline:3px solid var(--link); outline-offset:2px}
button.hot{background:var(--hot); color:#fff; border-color:var(--ink)}
button.primary{background:var(--ink); color:#fff}
label{display:block;font-weight:700;font-size:12px;margin-bottom:6px}
input,select{
  width:100%;border:3px solid var(--ink);background:var(--bg);color:var(--ink);
  padding:10px 12px;font:15px "Space Mono","Courier New",monospace;margin-bottom:16px;
}
input:focus-visible,select:focus-visible{outline:3px solid var(--link);outline-offset:2px}
`;

const dlgCss = `
.dlg{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;place-items:center;z-index:9;padding:16px}
.dlg .box{background:var(--bg);border:4px solid var(--ink);box-shadow:12px 12px 0 var(--ink);
padding:24px;width:min(760px,100%);max-height:90vh;overflow:auto}
.dlg .row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
.dlg-title{font-family:"Archivo Black","PingFang SC","Microsoft YaHei",Arial,sans-serif;
font-size:20px;word-break:break-all}
pre.cmd{background:var(--ink);color:var(--bg);padding:12px;font:12px "Space Mono",monospace;
overflow-x:auto;white-space:pre-wrap;word-break:break-all;border:3px solid var(--ink)}
`;

export function renderLogin() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 — VPS RADAR</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>${baseCss}
main{display:grid;place-items:center;min-height:100vh;padding:20px;background:
repeating-linear-gradient(45deg,var(--bg) 0 24px,var(--paper) 24px 48px)}
form{background:var(--bg);border:4px solid var(--ink);box-shadow:10px 10px 0 var(--ink);
padding:32px;width:min(400px,100%)}
h1{font-size:32px;line-height:1;margin-bottom:6px}
.sub{font-family:"Space Mono",monospace;font-size:12px;margin-bottom:20px;border-bottom:3px solid var(--ink);padding-bottom:12px}
button{width:100%}
.err{color:var(--hot);font-weight:700;min-height:22px;font-size:13px;margin-top:10px}
</style></head><body><main>
<form id="f">
<h1 class="display">VPS<br>RADAR</h1>
<p class="sub">内部系统 · 请输入管理令牌</p>
<label for="t">管理令牌</label>
<input type="password" id="t" autocomplete="current-password" required>
<button type="submit" class="primary">进入面板</button>
<div class="err" id="e" role="alert"></div>
</form></main>
<script>
f.onsubmit=async ev=>{ev.preventDefault();
const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},
body:JSON.stringify({token:t.value})});
if(r.ok)location.reload();else e.textContent='令牌错误';};
</script></body></html>`;
}

export function renderDashboard(opts) {
  const admin = opts && opts.admin;
  const title = (opts && opts.title) || 'VPS RADAR';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>${baseCss}
header{display:flex;align-items:center;gap:14px;flex-wrap:wrap;
padding:14px 20px;border-bottom:4px solid var(--ink);background:var(--bg);
position:sticky;top:0;z-index:5}
h1{font-size:26px;line-height:1;letter-spacing:-.01em}
#stat{font-family:"Space Mono",monospace;font-size:12px;
border:2px solid var(--ink);padding:4px 8px}
#tick{font-family:"Space Mono",monospace;font-size:12px;color:#555}
header .sp{flex:1}
main{padding:24px 20px;display:grid;gap:24px;
grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))}
.card{background:var(--bg);border:3px solid var(--ink);box-shadow:6px 6px 0 var(--ink);
padding:16px 16px 56px;position:relative;cursor:pointer}
.card:focus-visible{outline:3px solid var(--link);outline-offset:2px}
.card.down{background:var(--paper);border-color:var(--hot);box-shadow:6px 6px 0 var(--hot)}
.status{display:inline-block;font-family:"Space Mono",monospace;font-weight:700;font-size:11px;
border:2px solid var(--ink);padding:2px 8px}
.status.up{background:var(--ink);color:#fff}
.status.dn{background:var(--hot);color:#fff;border-color:var(--hot)}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.up{font-family:"Space Mono",monospace;font-size:10px}
.name{font-family:"Archivo Black","PingFang SC","Microsoft YaHei",Arial,sans-serif;
font-size:22px;line-height:1.1;word-break:break-all;margin-bottom:4px}
.meta{font-family:"Space Mono",monospace;font-size:11px;color:#333;
border-bottom:2px solid var(--ink);padding-bottom:8px;margin-bottom:10px}
.info{font-family:"Space Mono",monospace;font-size:12px;font-weight:700;margin-bottom:10px}
.info .exp-soon{background:var(--yellow);border:2px solid var(--ink);padding:1px 6px}
.info .exp-crit{background:var(--hot);color:#fff;border:2px solid var(--ink);padding:1px 6px}
.kv{display:flex;justify-content:space-between;gap:8px;
font-family:"Space Mono",monospace;font-size:12px;margin-bottom:3px}
.kv b{font-weight:700}
.bar{height:14px;border:2px solid var(--ink);margin:2px 0 10px;background:var(--bg)}
.bar i{display:block;height:100%;background:var(--ink)}
.bar i.warn{background:var(--yellow)}
.bar i.crit{background:var(--hot)}
.actions{position:absolute;bottom:12px;right:16px;display:flex;gap:8px}
.actions button{font-size:12px;min-height:36px;padding:4px 12px;box-shadow:3px 3px 0 var(--ink)}
.actions button:active{transform:translate(3px,3px);box-shadow:0 0 0 var(--ink)}
#dtabs{display:flex;gap:8px;margin:14px 0;flex-wrap:wrap}
#dtabs button{font-size:12px;min-height:40px;padding:6px 12px;box-shadow:3px 3px 0 var(--ink)}
#dtabs button.on{background:var(--ink);color:#fff}
#dchart{width:100%;height:170px;display:block;border:3px solid var(--ink)}
.empty{grid-column:1/-1;text-align:center;padding:80px 20px;
font-family:"Archivo Black","PingFang SC","Microsoft YaHei",sans-serif;font-size:24px}
.sec{font-family:"Archivo Black","PingFang SC","Microsoft YaHei",sans-serif;font-size:20px;
padding:8px 20px 0;display:flex;align-items:center;gap:14px}
.sec button{font-size:12px;min-height:40px;padding:6px 12px}
#sites{padding:16px 20px 32px;display:grid;gap:14px;
grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))}
.site{background:var(--bg);border:3px solid var(--ink);box-shadow:6px 6px 0 var(--ink);
padding:12px 16px;cursor:pointer;position:relative}
.site:focus-visible{outline:3px solid var(--link);outline-offset:2px}
.site.down{background:var(--paper);border-color:var(--hot);box-shadow:6px 6px 0 var(--hot)}
.site .sname{font-weight:700;font-size:15px;word-break:break-all}
.site .surl{font-family:"Space Mono",monospace;font-size:11px;color:#333;word-break:break-all}
.site .srow{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:6px;
font-family:"Space Mono",monospace;font-size:12px}
.site .sdel{position:absolute;top:8px;right:8px;font-size:11px;min-height:32px;
padding:2px 10px;box-shadow:3px 3px 0 var(--ink)}
.form-btns{display:flex;gap:12px}
.form-btns button{flex:1}
.hint{font-size:12px;color:#555;margin:-10px 0 16px}
@media (max-width:480px){
  h1{font-size:20px}
  main{padding:16px 12px;gap:16px}
  .name{font-size:18px}
}
${dlgCss}
</style></head><body>
<header>
<h1 class="display">${title}</h1>
<span id="stat" class="mono" aria-live="polite">…</span>
<span id="tick" class="mono"></span>
<span class="sp"></span>
${admin ? '<button id="add" class="primary">+ 添加服务器</button>' : '<button id="login">登录管理</button>'}
</header>
<main id="grid"><div class="empty">加载中…</div></main>
<h2 class="sec">网站监控 ${admin ? '<button id="addsite">+ 添加网站</button>' : ''}</h2>
<div id="sites"></div>

<div id="gdlg" class="dlg" role="dialog" aria-modal="true" aria-labelledby="gtitle">
<div class="box"><div class="row"><b id="gtitle" class="dlg-title">添加网站</b>
<button id="gclose">✕ 关闭</button></div>
<form id="gform">
<label for="g-name">备注名</label>
<input id="g-name" maxlength="64" placeholder="例如：博客">
<label for="g-url">监控地址</label>
<input id="g-url" type="url" required placeholder="https://example.com">
<div class="hint">每分钟从 Cloudflare 边缘节点探测一次；HTTP 状态码 &lt;500 视为正常</div>
<div class="form-btns"><button type="submit" class="primary">保存</button></div>
</form></div></div>

<div id="dlg" class="dlg" role="dialog" aria-modal="true" aria-labelledby="dname">
<div class="box"><div class="row"><b id="dname" class="dlg-title"></b>
<button id="dclose">✕ 关闭</button></div>
<div id="dtabs"></div><div id="dbody"><canvas id="dchart"></canvas></div></div></div>

<div id="fdlg" class="dlg" role="dialog" aria-modal="true" aria-labelledby="ftitle">
<div class="box"><div class="row"><b id="ftitle" class="dlg-title"></b>
<button id="fclose">✕ 关闭</button></div>
<form id="sform">
<label for="f-name">备注名</label>
<input id="f-name" maxlength="64" placeholder="例如：东京主力机">
<label for="f-price">价格</label>
<input id="f-price" maxlength="32" placeholder="例如：¥299/年">
<div class="hint">自由文本，留空则不显示</div>
<label for="f-exp">到期日期</label>
<input id="f-exp" type="date">
<div class="hint">到期前 7 天和 3 天会各推送一次提醒；留空则关闭提醒</div>
<div class="form-btns"><button type="submit" class="primary" id="f-save">保存</button></div>
</form>
<div id="f-done" style="display:none">
<p style="margin-bottom:10px;font-weight:700">创建成功。在该 VPS 上执行一键安装：</p>
<pre class="cmd" id="f-cmd"></pre>
<div class="form-btns" style="margin-top:16px"><button class="primary" id="f-ok">完成</button></div>
</div>
</div></div>

<script>
const ADMIN=${admin ? 'true' : 'false'};
const REFRESH=60; // 秒
let lastList=null, countdown=REFRESH;

const fmtB=n=>{const u=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}
return n.toFixed(n>=100?0:1)+' '+u[i]};
const fmtUp=s=>{if(!s)return'-';const d=~~(s/86400),h=~~(s%86400/3600),m=~~(s%3600/60);
return d?d+'天':(h?h+'小时':m+'分钟')};
const pct=(a,b)=>b?Math.min(100,a/b*100):0;
const cls=p=>p<60?'':p<85?'warn':'crit';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// 常见国家代码 → 中文名，未收录的显示原代码
const CC={CN:'中国',HK:'香港',TW:'台湾',MO:'澳门',JP:'日本',KR:'韩国',SG:'新加坡',MY:'马来西亚',
TH:'泰国',VN:'越南',PH:'菲律宾',ID:'印尼',IN:'印度',US:'美国',CA:'加拿大',MX:'墨西哥',BR:'巴西',
AR:'阿根廷',GB:'英国',DE:'德国',FR:'法国',NL:'荷兰',IT:'意大利',ES:'西班牙',SE:'瑞典',NO:'挪威',
FI:'芬兰',DK:'丹麦',PL:'波兰',CZ:'捷克',AT:'奥地利',CH:'瑞士',BE:'比利时',IE:'爱尔兰',PT:'葡萄牙',
RU:'俄罗斯',UA:'乌克兰',TR:'土耳其',AU:'澳大利亚',NZ:'新西兰',ZA:'南非',EG:'埃及',AE:'阿联酋',
SA:'沙特',IL:'以色列',PK:'巴基斯坦',CL:'智利',CO:'哥伦比亚',PE:'秘鲁'};
const loc=s=>{
  const c=s.country?(CC[s.country]||s.country):'';
  return c?(s.city?c+' · '+s.city:c):'';
};

function spark(cv,data,lo,hi,stroke){
const dpr=devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;
cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext('2d');c.scale(dpr,dpr);
if(!data||data.length<2){c.fillStyle='#000';c.font='12px monospace';c.fillText('暂无数据',10,24);return}
const min=lo??Math.min(...data),max=hi??Math.max(...data,1);
c.beginPath();data.forEach((v,i)=>{const x=i/(data.length-1)*w,y=h-4-(v-min)/(max-min||1)*(h-8);
i?c.lineTo(x,y):c.moveTo(x,y)});
c.strokeStyle=stroke;c.lineWidth=2;c.stroke();
}

function card(s){
const mem=pct(s.mem_used,s.mem_total),dsk=pct(s.disk_used,s.disk_total);
const t=new Date(s.ts*1000).toLocaleTimeString('zh-CN',{hour12:false});
let info='';
if(s.price||s.expire_at){
  info='<div class="info">';
  if(s.price)info+='价格 '+esc(s.price)+' ';
  if(s.expire_at){
    const days=Math.ceil((s.expire_at*1000-Date.now())/86400000);
    const c=days<=3?'exp-crit':days<=7?'exp-soon':'';
    const dstr=new Date(s.expire_at*1000).toISOString().slice(0,10);
    info+='<span class="'+c+'">到期 '+dstr+(days>=0?' 剩'+days+'天':' 已过期')+'</span>';
  }
  info+='</div>';
}
return '<article class="card'+(s.online?'':' down')+'" data-id="'+s.id+'" tabindex="0" role="button"'
+' aria-label="'+esc(s.name||s.id)+' '+(s.online?'在线':'离线')+'">'
+'<div class="top"><span class="status '+(s.online?'up':'dn')+'">'+(s.online?'● 在线':'● 离线')
+'</span><span class="up mono">'+t+'</span></div>'
+'<div class="name">'+esc(s.name||s.id.slice(0,8))+'</div>'
+'<div class="meta">'+esc(s.os||'-')+' / '+esc(s.ip||'-')+(loc(s)?' / '+esc(loc(s)):'')+' / 运行 '+fmtUp(s.uptime)+'</div>'
+info
+'<div class="kv"><span>处理器</span><b>'+s.cpu.toFixed(1)+'% · 负载 '+s.load1.toFixed(2)+'</b></div>'
+'<div class="bar" role="img" aria-label="处理器 '+s.cpu.toFixed(0)+'%"><i class="'+cls(s.cpu)+'" style="width:'+s.cpu+'%"></i></div>'
+'<div class="kv"><span>内存</span><b>'+fmtB(s.mem_used)+' / '+fmtB(s.mem_total)+'</b></div>'
+'<div class="bar" role="img" aria-label="内存 '+mem.toFixed(0)+'%"><i class="'+cls(mem)+'" style="width:'+mem+'%"></i></div>'
+'<div class="kv"><span>磁盘</span><b>'+fmtB(s.disk_used)+' / '+fmtB(s.disk_total)+'</b></div>'
+'<div class="bar" role="img" aria-label="磁盘 '+dsk.toFixed(0)+'%"><i class="'+cls(dsk)+'" style="width:'+dsk+'%"></i></div>'
+'<div class="kv"><span>网速</span><b>↓ '+fmtB(s.net_rx)+'/s · ↑ '+fmtB(s.net_tx)+'/s</b></div>'
+'<div class="kv"><span>累计流量</span><b>↓ '+fmtB(s.net_rx_total)+' · ↑ '+fmtB(s.net_tx_total)+'</b></div>'
+(ADMIN?'<div class="actions"><button class="edit">编辑</button><button class="del hot">删除</button></div>':'')
+'</article>';
}

async function load(){
let d;
try{
const r=await fetch('/api/servers');
if(r.status===401){location.reload();return}
d=await r.json();
}catch(e){
tick.textContent='获取失败，'+REFRESH+' 秒后重试';return;
}
lastList=d;
stat.textContent='共 '+d.servers.length+' 台 / '+d.servers.filter(s=>s.online).length+' 台在线';
grid.innerHTML=d.servers.length?d.servers.map(card).join('')
:'<div class="empty">还没有服务器 — 点右上角添加</div>';
grid.querySelectorAll('.card').forEach(c=>{
const find=()=>(lastList.servers||[]).find(x=>x.id===c.dataset.id);
const open=()=>{const s=find();if(s)openDetail(s)};
c.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target===c)open()});
c.addEventListener('click',async ev=>{
const s=find();
if(ev.target.classList.contains('del')){
if(!confirm('删除该服务器及其全部历史数据？'))return;
await fetch('/api/servers/'+c.dataset.id,{method:'DELETE'});load();return;
}
if(ev.target.classList.contains('edit')){
if(s)openForm(s);return;
}
open();
});
});
countdown=REFRESH;
loadSites();
}

// ---------- 网站监控 ----------
async function loadSites(){
const r=await fetch('/api/sites');
if(!r.ok)return;
const d=await r.json();
const box=document.getElementById('sites');
if(!d.sites.length){box.innerHTML='';return}
box.innerHTML=d.sites.map(s=>{
const on=s.ok===1,none=s.ok===null;
const badge=none?'<span class="status">待探测</span>'
:on?'<span class="status up">正常</span>':'<span class="status dn">异常</span>';
const lat=none?'-':(s.latency+'ms');
const stat=none?'':(s.status?'HTTP '+s.status:'连接失败');
const t=s.checked_at?new Date(s.checked_at*1000).toLocaleTimeString('zh-CN',{hour12:false}):'-';
return '<div class="site'+(on||none?'':' down')+'" data-id="'+s.id+'" tabindex="0" role="button"'
+' aria-label="'+esc(s.name||s.url)+'">'
+(ADMIN?'<button class="sdel hot">删除</button>':'')
+'<div class="sname">'+esc(s.name||s.url)+'</div>'
+'<div class="surl">'+esc(s.url)+'</div>'
+'<div class="srow"><span>'+badge+' '+stat+'</span><b>'+lat+'</b><span>'+t+'</span></div>'
+'</div>';
}).join('');
box.querySelectorAll('.site').forEach(el=>{
const open=()=>openSiteDetail(d.sites.find(x=>x.id===el.dataset.id));
el.addEventListener('keydown',ev=>{if(ev.key==='Enter'&&ev.target===el)open()});
el.addEventListener('click',async ev=>{
if(ev.target.classList.contains('sdel')){
if(!confirm('删除该监控站点及其历史？'))return;
await fetch('/api/sites/'+el.dataset.id,{method:'DELETE'});loadSites();return;
}
open();
});
});
}

async function openSiteDetail(s){
if(!s)return;
dname.textContent=(s.name||s.url)+' — 24 小时延迟';
dbody.innerHTML='<canvas id="dchart"></canvas>';
const chart=dbody.firstChild;
dlg.style.display='grid';
dclose.focus();
dtabs.innerHTML='';
const r=await fetch('/api/site-history/'+s.id);const d=await r.json();
spark(chart,d.points.filter(p=>p.ok===1).map(p=>p.latency),0,null,'#0000EE');
}

gclose.onclick=()=>{gdlg.style.display='none'};
gdlg.addEventListener('click',ev=>{if(ev.target===gdlg)gdlg.style.display='none'});
gform.onsubmit=async ev=>{
ev.preventDefault();
const name=document.getElementById('g-name').value.trim();
const url=document.getElementById('g-url').value.trim();
const r=await fetch('/api/sites',{method:'POST',
headers:{'content-type':'application/json'},body:JSON.stringify({name,url})});
if(!r.ok){alert('地址格式不对，需以 http:// 或 https:// 开头');return}
gdlg.style.display='none';gform.reset();loadSites();
};

async function openDetail(s){
dname.textContent=s.name||s.id;
dbody.innerHTML='<canvas id="dchart"></canvas>';
const chart=dbody.firstChild;
dlg.style.display='grid';
dclose.focus();
const kinds=[['处理器 %','cpu',0,100,'#0000EE'],['内存占用','mem_used',null,null,'#000000'],
['下载速度','net_rx',null,null,'#0A7C00'],['上传速度','net_tx',null,null,'#FF2D00']];
dtabs.innerHTML='';
const r=await fetch('/api/history/'+s.id+'?hours=24');const d=await r.json();
const draw=k=>spark(chart,d.points.map(p=>p[k[1]]),k[2],k[3],k[4]);
kinds.forEach((k,i)=>{
const b=document.createElement('button');b.textContent=k[0];if(i===0)b.className='on';
b.onclick=()=>{dtabs.querySelectorAll('button').forEach(x=>x.className='');b.className='on';draw(k)};
dtabs.appendChild(b);
});
draw(kinds[0]);
}
dclose.onclick=()=>{dlg.style.display='none'};
dlg.addEventListener('click',ev=>{if(ev.target===dlg)dlg.style.display='none'});

// ---------- 添加 / 编辑表单弹窗 ----------
let editing=null; // null = 添加模式，否则为服务器对象

function openForm(s){
editing=s||null;
ftitle.textContent=s?('编辑 — '+(s.name||s.id.slice(0,8))):'添加服务器';
document.getElementById('f-name').value=s?(s.name||''):'';
document.getElementById('f-price').value=s?(s.price||''):'';
document.getElementById('f-exp').value=s&&s.expire_at
  ?new Date(s.expire_at*1000).toISOString().slice(0,10):'';
sform.style.display='';
document.getElementById('f-done').style.display='none';
fdlg.style.display='grid';
document.getElementById('f-name').focus();
}
fclose.onclick=()=>{fdlg.style.display='none'};
fdlg.addEventListener('click',ev=>{if(ev.target===fdlg)fdlg.style.display='none'});
document.addEventListener('keydown',ev=>{
if(ev.key==='Escape'){dlg.style.display='none';fdlg.style.display='none';gdlg.style.display='none'}
});

sform.onsubmit=async ev=>{
ev.preventDefault();
const name=document.getElementById('f-name').value.trim();
const price=document.getElementById('f-price').value.trim();
const exp=document.getElementById('f-exp').value;
let expire_at=0;
if(exp){
const dd=new Date(exp+'T23:59:59Z');
if(isNaN(dd)){alert('日期格式不对');return}
expire_at=Math.floor(dd.getTime()/1000);
}
if(editing){
await fetch('/api/servers/'+editing.id,{method:'PATCH',
headers:{'content-type':'application/json'},
body:JSON.stringify({name,price,expire_at})});
fdlg.style.display='none';load();
}else{
const r=await fetch('/api/servers',{method:'POST',
headers:{'content-type':'application/json'},
body:JSON.stringify({name,price,expire_at})});
const d=await r.json();
document.getElementById('f-cmd').textContent=
'bash <(curl -fsSL '+location.origin+'/agent.sh) '+location.origin+' '+d.id+' '+d.token;
sform.style.display='none';
document.getElementById('f-done').style.display='';
load();
}
};
document.getElementById('f-ok').onclick=()=>{fdlg.style.display='none'};

${admin ? 'add.onclick=()=>openForm(null);addsite.onclick=()=>{gform.reset();gdlg.style.display="grid";document.getElementById("g-url").focus()};' : `login.onclick=async()=>{
const t=prompt('输入管理令牌:');
if(t===null)return;
const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},
body:JSON.stringify({token:t})});
if(r.ok)location.reload();else alert('令牌错误');
};`}

load();
setInterval(load,REFRESH*1000);
setInterval(()=>{
if(countdown>0)countdown--;
tick.textContent=countdown>0?(countdown+' 秒后刷新'):'正在刷新…';
},1000);
</script></body></html>`;
}
