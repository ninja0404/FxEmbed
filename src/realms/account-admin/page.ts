const styles = `
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b1015;color:#e5ecf3}*{box-sizing:border-box}body{margin:0}a{color:#79c4ff;text-decoration:none}button,input,select{font:inherit}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}.shell{max-width:1320px;margin:auto;padding:32px 40px}.top{display:flex;justify-content:space-between;align-items:center;gap:20px}.brand{font-weight:750;letter-spacing:-.5px}.brand span{margin-left:16px;font-size:13px;color:#91a0b0;font-weight:400}.logout{background:none;border:1px solid #283746;color:#a5b4c2;border-radius:8px;padding:8px 14px}h1{font-size:30px;letter-spacing:-1px;margin:38px 0 8px}.sub{color:#91a0b0;line-height:1.6;font-size:14px}.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin:26px 0}.card{background:#111a23;border:1px solid #22303e;border-radius:12px;padding:18px 20px}.card small{color:#91a0b0;font-size:13px}.card strong{display:block;font-size:29px;margin-top:8px}.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:22px 0 14px}.toolbar input{flex:1;min-width:200px}input,select{background:#111a23;color:#e5ecf3;border:1px solid #2b3c4e;padding:11px 13px;border-radius:8px}.action{border:1px solid #32475c;background:#172737;color:#e5ecf3;border-radius:8px;padding:11px 15px}.primary{background:#4da4f1;border-color:#4da4f1;color:#071321;font-weight:650}.notice{min-height:23px;color:#9aafc3;font-size:13px;margin:12px 0}.notice.error{color:#ff9898}.table-wrap{border:1px solid #253442;border-radius:12px;overflow:auto}table{border-collapse:collapse;width:100%;white-space:nowrap;text-align:left}th{background:#111a23;color:#91a0b0;font-weight:500;font-size:12px;padding:15px 18px}td{padding:14px 18px;font-size:13px;border-top:1px solid #1e2c38}tbody tr:hover{background:#101923}.handle{font-weight:600;font-size:14px}.muted{color:#899bac}.badge{display:inline-block;border-radius:6px;padding:5px 9px;background:#213044;color:#a6bbd2;font-size:12px}.available{background:#12382d;color:#6cdfad}.invalid,.restricted{background:#3b2027;color:#ff9dab}.rate_limited{background:#3d321e;color:#edc770}.error{background:#362633;color:#dab1db}.small-button{padding:6px 11px;border-radius:6px;background:#172737;border:1px solid #304459;color:#a3c9eb}.footer{margin-top:17px;font-size:12px;color:#748a9d;line-height:1.8}.login{max-width:440px;margin:12vh auto;padding:32px;background:#111a23;border:1px solid #253442;border-radius:16px}.login h1{font-size:25px;margin:12px 0}.login label{display:block;margin:25px 0 8px;font-size:13px;color:#a9bbc9}.login input,.login button{width:100%}.login button{margin-top:16px}.login .notice{margin-bottom:0}progress{width:100%;height:5px;accent-color:#4da4f1;display:none;margin:0 0 15px}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid #83c6ff;outline-offset:3px}@media(max-width:760px){.shell{padding:22px 16px}.cards{grid-template-columns:repeat(2,1fr)}.brand span{display:none}.toolbar input{flex-basis:100%}h1{font-size:25px}.login{margin:8vh 16px}}
`;

function document(nonce: string, body: string, script = ''): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FxEmbed · 账号状态</title><style nonce="${nonce}">${styles}</style></head><body>${body}${script ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`;
}

export function loginPage(nonce: string, error = ''): string {
  return document(
    nonce,
    `<main class="login"><div class="brand">FxEmbed</div><h1>账号管理</h1><p class="sub">登录后查看账号池状态与检测结果。</p><form method="post" action="/admin/login"><label for="token">管理口令</label><input id="token" name="token" type="password" autocomplete="current-password" required maxlength="256"><button class="action primary" type="submit">进入账号管理</button></form><p class="notice error" role="alert">${error}</p></main>`
  );
}

export function dashboardPage(nonce: string): string {
  return document(
    nonce,
    `<main class="shell"><header class="top"><div class="brand">FxEmbed<span>Twitter 账号池</span></div><form action="/admin/logout" method="post"><button class="logout">退出登录</button></form></header><h1>账号状态</h1><div class="sub">查看每个账号最近一次的查询检测结果。检测会使用该账号独立请求，结果会自动保存。</div><section class="cards" aria-label="账号概览"><div class="card"><small>账号总数</small><strong id="total">—</strong></div><div class="card"><small>查询可用</small><strong id="available">—</strong></div><div class="card"><small>失效 / 受限</small><strong id="unavailable">—</strong></div><div class="card"><small>限流 / 检测异常</small><strong id="errors">—</strong></div><div class="card"><small>待查询检测</small><strong id="pending">—</strong></div></section><div class="toolbar"><input id="search" type="search" placeholder="搜索用户名" aria-label="搜索用户名"><select id="filter" aria-label="筛选状态"><option value="all">全部状态</option><option value="available">查询可用</option><option value="pending">待查询检测</option><option value="invalid">登录态失效</option><option value="restricted">账号受限</option><option value="rate_limited">限流中</option><option value="error">检测异常</option></select><button id="refresh" class="action">刷新状态</button><button id="check-all" class="action primary">检测全部</button><button id="stop" class="action" hidden>停止检测</button></div><p class="notice" id="notice" role="status" aria-live="polite">正在读取账号状态…</p><progress id="progress" aria-label="检测进度"></progress><div class="table-wrap"><table><thead><tr><th>账号</th><th>来源</th><th>状态</th><th>检测说明</th><th>最近检测（北京时间）</th><th>操作</th></tr></thead><tbody id="rows"></tbody></table></div><p class="footer">“查询可用”表示最近一次查询验证通过，不保证之后始终可用。限流、网络异常和登录失效会分别显示。登录态核对通过的账号仍需完成查询检测。</p></main>`,
    dashboardScript
  );
}

const dashboardScript = `
const $ = id => document.getElementById(id);
const labels = {available:'查询可用',session_valid:'待查询检测',unknown:'未检测',invalid:'登录态失效',restricted:'账号受限',rate_limited:'限流中',error:'检测异常'};
const reasons = {query_verified:'查询验证通过',identity_and_ct0_verified:'身份与登录态已核对',authentication_failed:'登录态已失效',account_suspended:'账号已被停用',account_verification_required:'需要在 X 完成账号验证',rate_limit:'请求频率已达上限',missing_session_credentials:'登录凭证不完整',upstream_error:'X 返回查询错误',empty_upstream_response:'X 返回空响应',upstream_non_json:'X 未返回接口数据',unexpected_upstream_response:'X 返回了非预期数据',timeout:'检测超时',probe_failed:'网络或代理请求失败',not_checked:'尚未检测',identity_mismatch:'Token 与用户名不一致',no_authenticated_identity:'未识别到登录身份'};
let accounts = [], busy = false, stopRequested = false, completed = 0;
function pending(row){return ['unknown','session_valid'].includes(row.health.status);}
function notice(message,error=false){$('notice').textContent=message;$('notice').className='notice'+(error?' error':'');}
function time(value){return value ? new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}) : '—';}
async function request(url,options){const response=await fetch(url,options);if(response.status===401){location.href='/admin/login';throw new Error('登录已过期');}const data=await response.json();if(!response.ok)throw new Error(data.error || '请求失败');return data;}
function cell(text,className){const td=document.createElement('td');td.textContent=text;if(className)td.className=className;return td;}
function render(){
 $('total').textContent=accounts.length;
 $('available').textContent=accounts.filter(a=>a.health.status==='available').length;
 $('unavailable').textContent=accounts.filter(a=>['invalid','restricted'].includes(a.health.status)).length;
 $('errors').textContent=accounts.filter(a=>['rate_limited','error'].includes(a.health.status)).length;
 $('pending').textContent=accounts.filter(pending).length;
 const query=$('search').value.trim().replace(/^@/,'').toLowerCase(), filter=$('filter').value;
 const visible=accounts.filter(a=>a.username.toLowerCase().includes(query) && (filter==='all'||(filter==='pending'?pending(a):a.health.status===filter)));
 const fragment=document.createDocumentFragment();
 for(const account of visible){
  const tr=document.createElement('tr'), td=document.createElement('td'), link=document.createElement('a');link.textContent='@'+account.username;link.className='handle';link.href='https://x.com/'+encodeURIComponent(account.username);link.target='_blank';link.rel='noopener noreferrer';td.append(link);tr.append(td);
  tr.append(cell(account.source==='previous'?'原有账号':'新导入','muted'));
  const state=cell(''), badge=document.createElement('span');badge.className='badge '+account.health.status;badge.textContent=labels[account.health.status]||'未知状态';state.append(badge);tr.append(state);
  const reason=(reasons[account.health.reason]||'请重新检测')+(account.health.status==='error'&&account.health.httpStatus?' · HTTP '+account.health.httpStatus:'')+(account.health.rateLimitReset && account.health.status==='rate_limited'?'；预计 '+time(account.health.rateLimitReset)+' 恢复':'');
  tr.append(cell(reason,'muted'));tr.append(cell(time(account.health.checkedAt),'muted'));
  const action=cell(''), button=document.createElement('button');button.className='small-button';button.textContent='检测';button.disabled=busy;button.setAttribute('aria-label','检测 @'+account.username);button.onclick=()=>single(account);action.append(button);tr.append(action);fragment.append(tr);
 }
 if(!visible.length){const tr=document.createElement('tr'), td=cell('没有符合条件的账号。','muted');td.colSpan=6;tr.append(td);fragment.append(tr);}
 $('rows').replaceChildren(fragment);$('check-all').disabled=busy||!accounts.length;$('refresh').disabled=busy;$('stop').hidden=!busy;
}
async function load(){try{const data=await request('/admin/api/accounts');accounts=data.accounts;render();notice('已载入 '+accounts.length+' 个账号，状态为最近一次检测结果。');}catch(error){notice(error.message,true);}}
async function check(account){const result=await request('/admin/api/accounts/'+encodeURIComponent(account.username)+'/check',{method:'POST'});account.health=result.health;render();}
async function single(account){busy=true;render();notice('正在检测 @'+account.username+'…');try{await check(account);notice('@'+account.username+'：'+(labels[account.health.status]||'未知状态'));}catch(error){notice(error.message,true);}finally{busy=false;render();}}
async function all(){
 busy=true;stopRequested=false;completed=0;render();$('progress').style.display='block';$('progress').max=accounts.length;$('progress').value=0;notice('正在检测 0 / '+accounts.length+'…');
 let index=0,failed=0;
 async function runner(){while(!stopRequested&&index<accounts.length){const account=accounts[index++];try{await check(account);}catch(error){failed++;notice(error.message,true);}finally{completed++;$('progress').value=completed;notice('已检测 '+completed+' / '+accounts.length+(failed?'；'+failed+' 个结果保存失败':''),failed>0);}}}
 try{await Promise.all([runner(),runner()]);notice((stopRequested?'检测已停止':'检测已完成')+'：'+completed+' / '+accounts.length+(failed?'；'+failed+' 个请求失败，请重新检测':''),failed>0);}finally{busy=false;$('progress').style.display='none';render();}
}
$('search').oninput=render;$('filter').onchange=render;$('refresh').onclick=load;$('check-all').onclick=all;$('stop').onclick=()=>{stopRequested=true;$('stop').disabled=true;notice('正在结束当前检测…');};
$('check-all').addEventListener('click',()=>{$('stop').disabled=false;});load();
`;
