
import express from 'express';
import session from 'express-session';
import multer from 'multer';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const VERSION='V20.8.22';
const app=express();
const PORT=process.env.PORT||10000;
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024,files:8}});
app.use(express.urlencoded({extended:true,limit:'30mb'}));
app.use(express.json({limit:'30mb'}));
app.use(session({secret:process.env.SESSION_SECRET||'vbchamados_v20_seguro',resave:false,saveUninitialized:false,cookie:{maxAge:1000*60*60*12}}));
app.use(express.static('public'));

const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'';
const STATE_ID=process.env.SUPABASE_STATE_ID||'default';
const DATA_FILE=path.join(process.cwd(),'data','state.json');
function blank(){return {usuarios:[{id:1,nome:'OLITECH',usuario:'OLITECH',senha:'051309',perfil:'ADMIN',permissoes:['*'],analista:true,ativo:true,assinaturaDigital:''}],lojas:[],prestadores:[],proprietarios:[],chamados:[],os:[],lembretes:[],preventivas:[],pontos:[],pagamentos:[],status:[{id:1,descricao:'ABERTO'},{id:2,descricao:'FINALIZADO'}],tiposServico:[{id:1,descricao:'A DEFINIR'}],config:{nomeSistema:'V&B CHAMADOS',subtitulo:'CHAMADOS DE MANUTENÇÃO',tema:'VERDE',regraFilial:'BASE_CIDADE_UF',nomeBaseFilial:'MEGA VEST CASA',whatsappSuporte:'16996076918',logoOs:'REUTILIZAR LOGO DA LOJA',logoUrl:'',logoLocal:''},_seq:{usuario:1,loja:0,prestador:0,proprietario:0,chamado:0,numeroChamado:0,os:0,lembrete:0,preventiva:0,ponto:0,pagamento:1,status:2,tipoServico:1}}}
function merge(d){const b=blank(); d=d&&typeof d==='object'?d:{}; const o={...b,...d}; for(const k of ['usuarios','lojas','prestadores','proprietarios','chamados','os','lembretes','preventivas','pontos','pagamentos','status','tiposServico']) o[k]=Array.isArray(o[k])?o[k]:[]; o.config={...b.config,...(o.config||{})}; o._seq={...b._seq,...(o._seq||{})}; return o}
let state=blank();
function loadLocal(){try{if(fs.existsSync(DATA_FILE)) return merge(JSON.parse(fs.readFileSync(DATA_FILE,'utf8')))}catch(e){console.error('local load',e.message)}return blank()}
function saveLocal(d){try{fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2))}catch(e){console.error('local save',e.message)}}
async function supaGet(){if(!SUPABASE_URL||!SUPABASE_KEY)return null; try{const r=await fetch(`${SUPABASE_URL}/rest/v1/app_state?id=eq.${encodeURIComponent(STATE_ID)}&select=data,updated_at`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}}); if(!r.ok){console.error('Supabase GET',r.status,await r.text()); return null} const j=await r.json(); return j?.[0]?.data?merge(j[0].data):null}catch(e){console.error('Supabase GET ex',e.message);return null}}
async function supaSave(d){if(!SUPABASE_URL||!SUPABASE_KEY)return false; try{const r=await fetch(`${SUPABASE_URL}/rest/v1/app_state`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:STATE_ID,data:d,updated_at:new Date().toISOString()})}); if(!r.ok){console.error('Supabase SAVE',r.status,await r.text()); return false} return true}catch(e){console.error('Supabase SAVE ex',e.message);return false}}
async function init(){state=merge(await supaGet()||loadLocal()); saveLocal(state); console.log(`${VERSION} carregado. Supabase: ${!!SUPABASE_URL}`)}
function load(){return merge(state)}
function save(d){state=merge(d); saveLocal(state); supaSave(state).then(ok=>{if(ok)console.log(`${VERSION} salvo no Supabase app_state: ${STATE_ID}`)}).catch(e=>console.error('Supabase SAVE bg',e.message)); return true}
async function saveNow(d){state=merge(d); saveLocal(state); return await supaSave(state)}

/* PATCH V20.8.22 - salvar edição real e anexos no banco */
function v20822_fileDataAny(f){
  if(!f) return '';
  if(f.buffer && f.mimetype) return `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;
  return '';
}
function v20822_files(req,field){
  const list = Array.isArray(req.files) ? req.files : (req.files ? Object.values(req.files).flat() : []);
  return list.filter(f=>!field || f.fieldname===field);
}
function v20822_uf(v){
  const s=norm(v); const m={'SAO PAULO':'SP','SÃO PAULO':'SP','CEARA':'CE','CEARÁ':'CE','RIO DE JANEIRO':'RJ','MINAS GERAIS':'MG','PARANA':'PR','PARANÁ':'PR','SANTA CATARINA':'SC','RIO GRANDE DO SUL':'RS'}; return m[s]||String(v||'').trim().toUpperCase();
}
function v20822_nomeLojaFinal(body, loja, d){
  let nome=String(body.nome||body.nomeLoja||body.lojaNome||loja.nome||'').trim().toUpperCase().replace(/\s+/g,' ');
  const cidade=String(body.cidade||loja.cidade||'').trim().toUpperCase().replace(/\s+/g,' ');
  const uf=v20822_uf(body.uf||body.estado||loja.uf||loja.estado||'');
  const base=String((d.config||{}).nomeBaseFilial || (d.config||{}).nomeBaseLoja || 'MEGA VEST CASA').trim().toUpperCase();
  const limpo=nome.replace(/\b(LTDA|ME|EPP|EIRELI|S\/A|SA)\b/g,'').replace(/\s+/g,' ').trim();
  if((limpo===base || limpo==='MEGA VEST CASA') && cidade && uf) nome=`${base} ${cidade} ${uf}`;
  if(nome){loja.nome=nome; loja.nomeLoja=nome; loja.lojaNome=nome;}
  if(uf){loja.uf=uf; loja.estado=uf;}
  if(!dig(loja.cep) && cidade && uf){ const cep={'PIRACICABA|SP':'13400000','PRAIA GRANDE|SP':'11726000','GUARUJA|SP':'11410000','GUARUJÁ|SP':'11410000','FORTALEZA|CE':'60000000','SANTOS|SP':'11000000','SAO PAULO|SP':'01001000','SÃO PAULO|SP':'01001000'}[`${cidade}|${uf}`]; if(cep) loja.cep=cep; }
  return loja;
}
function v20822_salvarArquivosLoja(req, loja, d){
  const logo=v20822_files(req,'logo')[0]||v20822_files(req,'logoLocal')[0];
  const logoData=v20822_fileDataAny(logo);
  const reutilizar=req.body.reutilizarLogo||'';
  if(reutilizar){ const r=(d.lojas||[]).find(x=>String(x.id)===String(reutilizar)); if(r&&(r.logo||r.logoDataUrl)){loja.logo=r.logo||r.logoDataUrl; loja.logoRef=r.id;} }
  if(logoData){loja.logo=logoData; loja.logoDataUrl=logoData;}
  const cart=v20822_files(req,'cartaoCnpj')[0]||v20822_files(req,'cartao')[0];
  const cartData=v20822_fileDataAny(cart);
  if(cartData) loja.cartaoCnpj={nome:cart.originalname||'CARTAO CNPJ',tipo:cart.mimetype||'',dataUrl:cartData,criadoEm:new Date().toISOString()};
  const fotos=v20822_files(req,'fotos');
  if(fotos.length){loja.fotos=Array.isArray(loja.fotos)?loja.fotos:[]; for(const f of fotos){const data=v20822_fileDataAny(f); if(data)loja.fotos.push({nome:f.originalname||'FOTO',tipo:f.mimetype||'',dataUrl:data,criadoEm:new Date().toISOString()});}}
}

function next(d,k){d._seq=d._seq||{}; d._seq[k]=Number(d._seq[k]||0)+1; return d._seq[k]}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function norm(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase()}
function digits(v){return String(v||'').replace(/\D/g,'')}
function today(){return new Date().toISOString().slice(0,10)}
function now(){return new Date().toISOString()}
function localNow(){const d=new Date(),p=n=>String(n).padStart(2,'0'); return {data:`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`,hora:`${p(d.getHours())}:${p(d.getMinutes())}`,iso:d.toISOString()}}
function money(v){return 'R$ '+(Number(String(v||0).replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,''))||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
function user(req){return req.session.user||null}
function userName(req){return user(req)?.nome||user(req)?.usuario||'USUARIO'}
function can(req,p){const u=user(req); if(!u)return false; if(u.perfil==='ADMIN'||(u.permissoes||[]).includes('*'))return true; return (u.permissoes||[]).includes(p)}
function auth(req,res,next){if(req.session.user)return next(); res.redirect('/login')}
function need(p){return (req,res,next)=>can(req,p)?next():res.status(403).send(page(req,'Sem permissão',card('Sem permissão','Seu usuário não tem acesso.')))}
function fileData(f){if(!f)return ''; if((f.mimetype||'').startsWith('image/') && f.buffer.length<3*1024*1024) return `data:${f.mimetype};base64,${f.buffer.toString('base64')}`; return ''}
function firstFile(req){return req.file||(Array.isArray(req.files)?req.files[0]:null)||(req.files?Object.values(req.files).flat()[0]:null)}
function sel(a,b){return norm(a)===norm(b)?'selected':''}
function checked(v){return v?'checked':''}
function closed(x){const s=norm(x.status); return s.includes('FINAL')||s.includes('FECH')||s.includes('CONCLU')}
function min(h){const m=String(h||'').match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null}
function dur(e,s){const a=min(e),b=min(s); if(a===null||b===null)return ''; let d=b-a; if(d<0)d+=1440; return String(Math.floor(d/60)).padStart(2,'0')+':'+String(d%60).padStart(2,'0')}
function input(name,val='',type='text',attrs=''){return `<label>${name}<input type="${type}" name="${name}" value="${esc(val)}" ${attrs}></label>`}
function page(req,title,body){const d=load(),c=d.config||{},tema=norm(c.tema||'VERDE').toLowerCase(); const logo=c.logoLocal||c.logoUrl||''; return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/style.css"></head><body class="tema-${tema}"><header><div class="brand">${logo?`<img src="${esc(logo)}">`:''}<div><h1>${esc(c.nomeSistema||'V&B CHAMADOS')}</h1><p>${esc(c.subtitulo||'CHAMADOS DE MANUTENÇÃO')}</p></div></div>${req.session.user?menu():''}</header><main>${body}</main><span class="version">${VERSION}</span><div id="loadingOverlay"><div>⏳ Processando... aguarde</div></div><script src="/app.js"></script><script>
(function(){
 const edit=/\/(lojas|prestadores|proprietarios|usuarios|chamados|lembretes|preventivas|perfis|tipos-servico)\/[^\/]+\/editar/.test(location.pathname);
 const novo=location.pathname.includes('/novo')||location.pathname.includes('/nova');
 if(edit){
  const form=document.querySelector('form.card, form');
  if(form&&!document.getElementById('btnEditarCampos')){
   const bar=document.querySelector('.bar .loja-topbar,.bar')||form;
   const b=document.createElement('button'); b.type='button'; b.id='btnEditarCampos'; b.className='btn secondary'; b.textContent='✏️ Editar campos';
   (bar.querySelector('div')||bar).prepend(b);
   const fields=[...form.querySelectorAll('input,select,textarea')].filter(x=>x.type!=='hidden'&&x.type!=='submit'&&x.type!=='button');
   fields.forEach(x=>{ if(x.type==='file') return; if(x.tagName==='SELECT') x.disabled=true; else x.readOnly=true; });
   b.onclick=()=>{fields.forEach(x=>{x.disabled=false;x.readOnly=false}); b.textContent='✅ Campos liberados';};
   form.addEventListener('submit',()=>fields.forEach(x=>{x.disabled=false;x.readOnly=false}));
  }
 }
 if(novo){document.querySelectorAll('form input,form select,form textarea').forEach(x=>{x.disabled=false;x.readOnly=false})}
})();
</script></body></html>`}
function menu(){return `<nav><a href="/">Início</a><a href="/chamados/rapido">➕ Novo chamado</a><a href="/chamados">Chamados</a><a href="/chamados/analista">Lojas por Analista</a><a href="/lojas">Lojas</a><a href="/prestadores">Prestadores</a><a href="/proprietarios">Proprietários</a><a href="/lembretes">Lembretes/Preventivas</a><a href="/os/nova">Ordens de Serviço</a><a href="/relatorios">Relatórios</a><a href="/config">Config</a><a href="/ponto-horas">⏱️ Ponto/Horas</a><a href="/sobre">Sobre</a><a href="/logout">Sair</a></nav>`}
function bar(title,back=true){return `<div class="bar"><h2>${title}</h2>${back?'<a class="btn secondary" href="javascript:history.back()">Voltar</a>':''}</div>`}
function card(t,b){return `<div class="card"><h2>${t}</h2>${b||''}</div>`}
function datalist(id,arr,label){return `<datalist id="${id}">${arr.map(x=>`<option value="${esc(label(x))}"></option>`).join('')}</datalist>`}

app.get('/login',(req,res)=>res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login</title><link rel="stylesheet" href="/style.css"></head><body class="login"><form class="loginbox" method="post" action="/login"><h1>V&B CHAMADOS</h1><p>Sistema de manutenção</p><input name="usuario" placeholder="Usuário" autofocus><input name="senha" type="password" placeholder="Senha"><button>Entrar</button></form></body></html>`));
app.post('/login',(req,res)=>{const d=load(); const u=d.usuarios.find(x=>norm(x.usuario)===norm(req.body.usuario)&&String(x.senha)===String(req.body.senha)&&x.ativo!==false); if(!u)return res.send(page(req,'Login',card('Usuário ou senha inválidos','<a class="btn" href="/login">Tentar novamente</a>'))); req.session.user=u; res.redirect('/')});
app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/login')));
app.get('/',auth,(req,res)=>{const d=load(); const nowDt=new Date(); const lemb=d.lembretes.filter(l=>!closed(l)&&(norm(l.fixo)==='SIM'||true)).slice(0,8).map(l=>`<a class="postit" data-data="${esc(l.data||'')}" data-hora="${esc(l.hora||'')}" href="/lembretes/${l.id}/editar"><b>${esc(l.descricao)}</b><br>${esc(l.data)} ${esc(l.hora||'')}<br>${esc(l.obs||'')}</a>`).join(''); const rows=d.chamados.filter(c=>!closed(c)).slice(0,50).map(c=>`<tr><td>${esc(c.numeroInterno||c.id)}</td><td>${esc(c.lojaNome)}</td><td>${esc(c.analista||'SEM ANALISTA')}</td><td>${esc(c.tipoServico||'')}</td><td>${esc(c.prioridade||'')}</td><td>${esc(c.status||'ABERTO')}</td><td><a class="btn small" href="/chamados/${c.id}/editar">Abrir</a></td></tr>`).join('')||'<tr><td colspan=7>Nenhum chamado aberto.</td></tr>'; res.send(page(req,'Início',`${lemb?`<div class="postits">${lemb}</div>`:''}<div class="card"><h2>Ações rápidas</h2><a class="btn" href="/chamados/rapido">➕ Criar chamado rápido</a><a class="btn secondary" href="/chamados/novo">Abrir chamado completo</a><a class="btn secondary" href="/os/nova">Juntar chamados / Gerar OS</a></div><div class="card"><h2>Minha grid inicial</h2><table><thead><tr><th>Chamado</th><th>Loja</th><th>Analista</th><th>Serviço</th><th>Prioridade</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div>`))});
app.get('/api/v20/status',auth,async(req,res)=>{const remote=await supaGet(); const d=load(); res.json({ok:true,versao:VERSION,supabaseConfigurado:!!SUPABASE_URL,local:{usuarios:d.usuarios.length,lojas:d.lojas.length,prestadores:d.prestadores.length,chamados:d.chamados.length,os:d.os.length},remoto:remote?{usuarios:remote.usuarios.length,lojas:remote.lojas.length,prestadores:remote.prestadores.length,chamados:remote.chamados.length,os:remote.os.length}:null})});

app.get('/config',auth,need('CONFIG'),(req,res)=>{const c=load().config; const temas=['VERDE','AZUL','ESCURO','LARANJA','ROXO','CLARO']; res.send(page(req,'Config',bar('⚙️ Configurações')+`<form class="card form loading-form" method="post" action="/config" enctype="multipart/form-data">${input('nomeSistema',c.nomeSistema)}${input('subtitulo',c.subtitulo)}<label>Tema<select name="tema">${temas.map(t=>`<option ${sel(c.tema,t)}>${t}</option>`).join('')}</select></label>${input('logoUrl',c.logoUrl||'')}<label>Logo local<input type="file" name="logoLocal" accept="image/*"></label>${c.logoLocal||c.logoUrl?`<img class="preview" src="${esc(c.logoLocal||c.logoUrl)}">`:''}<label>Regra PDF loja<select name="regraFilial"><option value="BASE_CIDADE_UF" ${sel(c.regraFilial,'BASE_CIDADE_UF')}>MEGA VEST CASA + CIDADE + UF</option><option value="ORIGINAL" ${sel(c.regraFilial,'ORIGINAL')}>Nome original do PDF</option></select></label>${input('nomeBaseFilial',c.nomeBaseFilial||'MEGA VEST CASA')}<label>Backup automático no navegador<select name="backupAuto"><option ${sel(c.backupAuto,'NÃO')}>NÃO</option><option ${sel(c.backupAuto,'DIARIO')}>DIARIO</option><option ${sel(c.backupAuto,'SEMANAL')}>SEMANAL</option></select></label><button>💾 Salvar</button></form><div class="card"><h2>Cadastros de apoio</h2><a class="btn" href="/status">Status</a><a class="btn" href="/pagamentos">Pagamentos</a><a class="btn" href="/tipos-servico">Tipos de serviço</a><a class="btn" href="/usuarios">Usuários/Analistas</a><a class="btn" href="/perfis">Permissões</a><a class="btn" href="/importar-planilha">Importar planilha</a><a class="btn" href="/backup">Backup/Restauração</a></div>`))});
app.post('/config',auth,need('CONFIG'),upload.any(),async(req,res)=>{const d=load(); Object.assign(d.config,req.body); const f=firstFile(req); const img=fileData(f); if(img)d.config.logoLocal=img; await save(d); res.redirect('/config')});

function crudList(k,title,fields){return (req,res)=>{const d=load(); const q=norm(req.query.q||''); const mostrar=req.query.todos==='1'||q; const base=Array.isArray(d[k])?d[k]:[]; const arr=mostrar?base.filter(x=>!q||norm(JSON.stringify(x)).includes(q)):[]; const rows=arr.map(x=>`<tr>${fields.map(([f])=>`<td>${esc(x[f]||'')}</td>`).join('')}<td><a class="btn small" href="/${k}/${x.id}/editar">Editar</a><form method="post" action="/${k}/${x.id}/excluir" onsubmit="return confirm('Excluir?')"><button class="danger">Excluir</button></form></td></tr>`).join('')||`<tr><td colspan="${fields.length+1}">${mostrar?'Nenhum registro.':'Digite 2 letras ou clique em Mostrar todos.'}</td></tr>`; res.send(page(req,title,bar(title)+`<div class="card"><a class="btn" href="/${k}/novo">➕ Novo</a><form method="get" class="search"><input name="q" list="dl-${k}" autocomplete="off" placeholder="Buscar... digite 2 letras" value="${esc(req.query.q||'')}"><button>Buscar</button><a class="btn secondary" href="/${k}?todos=1">Mostrar todos</a></form>${datalist('dl-'+k,base,x=>fields.map(([f])=>x[f]).filter(Boolean).join(' - '))}<table><thead><tr>${fields.map(([,l])=>`<th>${l}</th>`).join('')}<th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div>`))}}
function registerSimple(k,title,fields,perm){app.get('/'+k,auth,need(perm),crudList(k,title,fields)); app.get('/'+k+'/novo',auth,need(perm),(req,res)=>res.send(page(req,title,bar('Novo '+title)+`<form class="card form" method="post">${fields.map(([f,l])=>input(f,'')).join('')}<button>Salvar</button></form>`))); app.post('/'+k+'/novo',auth,need(perm),async(req,res)=>{const d=load();d[k].push({id:next(d,k.replace(/s$/,'')),...req.body});await save(d);res.redirect('/'+k)}); app.get('/'+k+'/:id/editar',auth,need(perm),(req,res)=>{const d=load(),x=d[k].find(i=>String(i.id)===req.params.id)||{};res.send(page(req,title,bar('Editar '+title)+`<form class="card form" method="post">${fields.map(([f,l])=>input(f,x[f]||'')).join('')}<button>Salvar</button></form>`))}); app.post('/'+k+'/:id/editar',auth,need(perm),async(req,res)=>{const d=load(),x=d[k].find(i=>String(i.id)===req.params.id); if(x)Object.assign(x,req.body); await save(d);res.redirect('/'+k)}); app.post('/'+k+'/:id/excluir',auth,need(perm),async(req,res)=>{const d=load();d[k]=d[k].filter(i=>String(i.id)!==req.params.id);await save(d);res.redirect('/'+k)})}
registerSimple('status','Status',[['descricao','Descrição']],'CONFIG'); registerSimple('pagamentos','Pagamentos',[['descricao','Descrição']],'CONFIG'); registerSimple('tiposServico','Tipos de Serviço',[['descricao','Descrição']],'CONFIG');

app.get('/usuarios',auth,need('USUARIOS'),crudList('usuarios','Usuários/Analistas',[['nome','Nome'],['usuario','Usuário'],['perfil','Perfil']]));
app.get('/usuarios/novo',auth,need('USUARIOS'),(req,res)=>res.send(page(req,'Usuários',bar('Novo usuário')+`<form class="card form" method="post" enctype="multipart/form-data">${input('nome')}${input('usuario')}${input('senha','','password')}<label>Perfil<select name="perfil"><option>ADMIN</option><option>ANALISTA</option><option>CONSULTA</option></select></label><label>Assinatura digital<input type="file" name="assinatura" accept="image/*"></label><button>Salvar</button></form>`)));
app.post('/usuarios/novo',auth,need('USUARIOS'),upload.any(),async(req,res)=>{const d=load();const f=firstFile(req);d.usuarios.push({id:next(d,'usuario'),...req.body,ativo:true,analista:req.body.perfil!=='CONSULTA',assinaturaDigital:fileData(f),permissoes:req.body.perfil==='ADMIN'?['*']:['CHAMADOS','LOJAS','PRESTADORES','OS']});await save(d);res.redirect('/usuarios')});
app.get('/usuarios/:id/editar',auth,need('USUARIOS'),(req,res)=>{const u=load().usuarios.find(x=>String(x.id)===req.params.id)||{};res.send(page(req,'Usuários',bar('Editar usuário')+`<form class="card form" method="post" enctype="multipart/form-data">${input('nome',u.nome)}${input('usuario',u.usuario)}${input('senha',u.senha,'password')}<label>Perfil<select name="perfil"><option ${sel(u.perfil,'ADMIN')}>ADMIN</option><option ${sel(u.perfil,'ANALISTA')}>ANALISTA</option><option ${sel(u.perfil,'CONSULTA')}>CONSULTA</option></select></label><label>Assinatura digital<input type="file" name="assinatura" accept="image/*"></label>${u.assinaturaDigital?`<img class="preview" src="${u.assinaturaDigital}">`:''}<button>Salvar</button></form>`))});
app.post('/usuarios/:id/editar',auth,need('USUARIOS'),upload.any(),async(req,res)=>{const d=load(),u=d.usuarios.find(x=>String(x.id)===req.params.id);if(u){Object.assign(u,req.body);const img=fileData(firstFile(req)); if(img)u.assinaturaDigital=img;}await save(d);res.redirect('/usuarios')});
app.get('/perfis',auth,need('USUARIOS'),(req,res)=>res.redirect('/usuarios'));

async function readPdf(f){const buf=f.buffer; let text=''; try{const mod=await import('pdf-parse/lib/pdf-parse.js'); const pdf=mod.default||mod; text=(await pdf(buf)).text||''}catch(e){const mod=await import('pdf-parse'); const pdf=mod.default||mod; text=(await pdf(buf)).text||''} return extractPdf(text)}
function after(text,label){const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const r=new RegExp(label+'\\s*[:\\-]?\\s*([^\\n]+)','i');const m=text.match(r);if(m&&m[1])return norm(m[1]);for(let i=0;i<lines.length;i++)if(new RegExp(label,'i').test(lines[i])&&lines[i+1])return norm(lines[i+1]);return ''}
function extractPdf(text){text=String(text||''); const cnpj=digits((text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)||[''])[0]); const cep=digits((text.match(/\d{5}-?\d{3}/)||[''])[0]); let nome=after(text,'NOME\\s+EMPRESARIAL')||after(text,'RAZ[ÃA]O\\s+SOCIAL')||after(text,'NOME\\s+DE\\s+FANTASIA'); let cidade=after(text,'MUNIC[IÍ]PIO').replace(/\bUF\b.*$/i,'').replace(/\bENDERE[ÇC]O.*$/i,'').replace(/\bTELEFONE.*$/i,'').trim(); let uf=(text.match(/UF\s*[:\-]?\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i)||text.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)||[])[1]||''; let endereco=after(text,'LOGRADOURO')||after(text,'ENDERE[ÇC]O'); return {nome,cnpj,cep,cidade,uf,endereco}}
function titleName(v){return String(v||'').toLowerCase().replace(/(^|\s|-)([a-záàâãéêíóôõúç])/g,(m,p,c)=>p+c.toUpperCase()).replace(/\bSp\b/g,'SP').replace(/\bRj\b/g,'RJ').replace(/\bMg\b/g,'MG').replace(/\bPr\b/g,'PR').replace(/\bSc\b/g,'SC').replace(/\bRs\b/g,'RS')}
function applyPdf(obj,info,tipo,d){let nome=info.nome||obj.nome||obj.empresa||''; if(tipo==='loja'&&d.config.regraFilial==='BASE_CIDADE_UF'&&info.cidade&&info.uf) nome=`${titleName(d.config.nomeBaseFilial||'MEGA VEST CASA')} ${titleName(info.cidade)} - ${String(info.uf).toUpperCase()}`; if(tipo==='prestador')obj.empresa=nome; else obj.nome=nome; if(info.cnpj)obj.cnpj=info.cnpj; if(info.cep)obj.cep=info.cep; if(info.cidade)obj.cidade=titleName(info.cidade); if(info.uf){obj.uf=String(info.uf).toUpperCase();obj.estado=String(info.uf).toUpperCase()} if(info.endereco)obj.endereco=titleName(info.endereco)}
async function pdfEntity(req,res,tipo,arrName,redirectBase){try{const f=firstFile(req);if(!f)return res.send(page(req,'PDF',card('Nenhum PDF selecionado','<a class="btn" href="javascript:history.back()">Voltar</a>'))); const info=await readPdf(f); const d=load(); const obj=d[arrName].find(x=>String(x.id)===String(req.params.id)); if(obj){applyPdf(obj,info,tipo,d); await save(d); return res.redirect(`/${redirectBase}/${obj.id}/editar`)} res.send(page(req,'PDF',card('PDF lido',`<pre>${esc(JSON.stringify(info,null,2))}</pre>`)))}catch(e){console.error('PDF',e);res.send(page(req,'Erro PDF',card('Erro ao pesquisar PDF',esc(e.message))))}}
async function pdfEntityNovo(req,res,tipo,arrName,redirectBase){try{const f=firstFile(req);if(!f)return res.send(page(req,'PDF',card('Nenhum PDF selecionado','<a class="btn" href="javascript:history.back()">Voltar</a>')));const info=await readPdf(f);const d=load();const obj={id:next(d,tipo==='loja'?'loja':tipo==='prestador'?'prestador':'proprietario')};applyPdf(obj,info,tipo,d);d[arrName].push(obj);await save(d);res.redirect(`/${redirectBase}/${obj.id}/editar`)}catch(e){console.error('PDF novo',e);res.send(page(req,'Erro PDF',card('Erro ao pesquisar PDF',esc(e.message))))}}
app.post('/loja-pdf-nova',auth,need('LOJAS'),upload.any(),(req,res)=>pdfEntityNovo(req,res,'loja','lojas','lojas'));
app.post('/prestador-pdf-novo',auth,need('PRESTADORES'),upload.any(),(req,res)=>pdfEntityNovo(req,res,'prestador','prestadores','prestadores'));
app.post('/proprietario-pdf-novo',auth,need('PROPRIETARIOS'),upload.any(),(req,res)=>pdfEntityNovo(req,res,'proprietario','proprietarios','proprietarios'));




/* ============== PATCH V20.8.22 FORCE CONSULTAS + PDF ============== */
function v2071_load(){ return (typeof load === 'function') ? load() : (globalThis.appState || globalThis.state || {lojas:[],prestadores:[],proprietarios:[],chamados:[],usuarios:[],config:{},_seq:{}}); }
async function v2071_save(d){ if(typeof save === 'function'){ const r=save(d); if(r&&typeof r.then==='function') return await r; return r; } globalThis.appState=d; globalThis.state=d; return true; }
function v2071_esc(v){ return (typeof esc === 'function') ? esc(v) : String(v??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function v2071_page(req,t,b){ return (typeof page === 'function') ? page(req,t,b) : `<!doctype html><html><head><meta charset="utf-8"><title>${v2071_esc(t)}</title><link rel="stylesheet" href="/style.css"></head><body><header><h1>V&B CHAMADOS</h1><nav><a href="/">Início</a> <a href="/chamados">Chamados</a> <a href="/lojas">Lojas</a> <a href="/prestadores">Prestadores</a> <a href="/proprietarios">Proprietários</a> <a href="/config">Config</a></nav></header><main>${b}</main><span class="version">V20.8.22</span><script src="/app.js"></script><script>
(function(){
 const edit=/\/(lojas|prestadores|proprietarios|usuarios|chamados|lembretes|preventivas|perfis|tipos-servico)\/[^\/]+\/editar/.test(location.pathname);
 const novo=location.pathname.includes('/novo')||location.pathname.includes('/nova');
 if(edit){
  const form=document.querySelector('form.card, form');
  if(form&&!document.getElementById('btnEditarCampos')){
   const bar=document.querySelector('.bar .loja-topbar,.bar')||form;
   const b=document.createElement('button'); b.type='button'; b.id='btnEditarCampos'; b.className='btn secondary'; b.textContent='✏️ Editar campos';
   (bar.querySelector('div')||bar).prepend(b);
   const fields=[...form.querySelectorAll('input,select,textarea')].filter(x=>x.type!=='hidden'&&x.type!=='submit'&&x.type!=='button');
   fields.forEach(x=>{ if(x.type==='file') return; if(x.tagName==='SELECT') x.disabled=true; else x.readOnly=true; });
   b.onclick=()=>{fields.forEach(x=>{x.disabled=false;x.readOnly=false}); b.textContent='✅ Campos liberados';};
   form.addEventListener('submit',()=>fields.forEach(x=>{x.disabled=false;x.readOnly=false}));
  }
 }
 if(novo){document.querySelectorAll('form input,form select,form textarea').forEach(x=>{x.disabled=false;x.readOnly=false})}
})();
</script></body></html>`; }
function v2071_arr(d,k){ d[k]=Array.isArray(d[k])?d[k]:[]; return d[k]; }
function v2071_norm(v){ return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase(); }
function v2071_digits(v){ return String(v||'').replace(/\D/g,''); }
function v2071_file(req){ return req.file || (Array.isArray(req.files)?req.files[0]:null) || (req.files?Object.values(req.files).flat()[0]:null); }
function v2071_pub(f){ return f ? ((typeof publicFile==='function') ? publicFile(f.filename||f.path||f.originalname) : ('/uploads/'+(f.filename||''))) : ''; }
function v2071_next(d,k){ d._seq=d._seq||{}; d._seq[k]=Number(d._seq[k]||0)+1; return d._seq[k]; }

function v2071_buttons(base){
 return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
   <a class="btn" href="${base}/novo">➕ Novo</a>
   <a class="btn secondary" href="${base}?todos=1">📋 Mostrar todos</a>
   <a class="btn secondary" href="javascript:history.back()">Voltar</a>
 </div>`;
}
function v2071_list(req,res,k,title,cols,mapper){
 const d=v2071_load(); const q=v2071_norm(req.query.q||''); const todos=req.query.todos==='1';
 let arr=v2071_arr(d,k);
 if(q) arr=arr.filter(x=>v2071_norm(JSON.stringify(x)).includes(q));
 if(!todos && !q) arr=[];
 const rows=arr.map(mapper).join('') || `<tr><td colspan="${cols.length+1}">Nenhum registro.</td></tr>`;
 res.send(v2071_page(req,title,`<h2>${title}</h2><div class="card">${v2071_buttons('/'+k)}
 <form method="get" style="display:flex;gap:8px"><input name="q" list="${k}List" placeholder="Buscar... digite 2 letras" value="${v2071_esc(req.query.q||'')}" style="flex:1"><button>Buscar</button></form>
 <datalist id="${k}List">${v2071_arr(d,k).map(x=>`<option value="${v2071_esc(x.nome||x.empresa||x.loja||x.descricao||x.numeroInterno||'')}">`).join('')}</datalist>
 <table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}<th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div>`));
}
app.get('/lojas', auth, (req,res)=>v2071_list(req,res,'lojas','Lojas',['Código','Nome','Cidade','UF'],l=>`<tr><td>${v2071_esc(l.codigo||l.filial||l.id||'')}</td><td>${v2071_esc(l.nome||l.loja||'')}</td><td>${v2071_esc(l.cidade||'')}</td><td>${v2071_esc(l.uf||l.estado||'')}</td><td><a class="btn small" href="/lojas/${l.id}/editar">Editar</a></td></tr>`));
app.get('/prestadores', auth, (req,res)=>v2071_list(req,res,'prestadores','Prestadores',['Empresa/Nome','Cidade','UF','Serviço'],p=>`<tr><td>${v2071_esc(p.empresa||p.nome||'')}</td><td>${v2071_esc(p.cidade||'')}</td><td>${v2071_esc(p.uf||p.estado||'')}</td><td>${v2071_esc(p.tipoServico||p.servico||'')}</td><td><a class="btn small" href="/prestadores/${p.id}/editar">Editar</a></td></tr>`));


/* ============== PATCH V20.8.22 - OS JUNCAO FECHAMENTO ============== */
function v208_load(){ return (typeof load === 'function') ? load() : (globalThis.appState || globalThis.state || {lojas:[],prestadores:[],proprietarios:[],chamados:[],usuarios:[],config:{},os:[],_seq:{}}); }
async function v208_save(d){ if(typeof save === 'function'){ const r=save(d); if(r&&typeof r.then==='function') return await r; return r; } globalThis.appState=d; globalThis.state=d; return true; }
function v208_esc(v){ return (typeof esc === 'function') ? esc(v) : String(v??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function v208_page(req,t,b){ return (typeof page === 'function') ? page(req,t,b) : `<!doctype html><html><head><meta charset="utf-8"><title>${v208_esc(t)}</title><link rel="stylesheet" href="/style.css"></head><body><header><h1>V&B CHAMADOS</h1><nav><a href="/">Início</a> <a href="/chamados">Chamados</a> <a href="/os/nova">Ordens de Serviço</a></nav></header><main>${b}</main><span class="version">V20.8.22</span><script src="/app.js"></script><script>
(function(){
 const edit=/\/(lojas|prestadores|proprietarios|usuarios|chamados|lembretes|preventivas|perfis|tipos-servico)\/[^\/]+\/editar/.test(location.pathname);
 const novo=location.pathname.includes('/novo')||location.pathname.includes('/nova');
 if(edit){
  const form=document.querySelector('form.card, form');
  if(form&&!document.getElementById('btnEditarCampos')){
   const bar=document.querySelector('.bar .loja-topbar,.bar')||form;
   const b=document.createElement('button'); b.type='button'; b.id='btnEditarCampos'; b.className='btn secondary'; b.textContent='✏️ Editar campos';
   (bar.querySelector('div')||bar).prepend(b);
   const fields=[...form.querySelectorAll('input,select,textarea')].filter(x=>x.type!=='hidden'&&x.type!=='submit'&&x.type!=='button');
   fields.forEach(x=>{ if(x.type==='file') return; if(x.tagName==='SELECT') x.disabled=true; else x.readOnly=true; });
   b.onclick=()=>{fields.forEach(x=>{x.disabled=false;x.readOnly=false}); b.textContent='✅ Campos liberados';};
   form.addEventListener('submit',()=>fields.forEach(x=>{x.disabled=false;x.readOnly=false}));
  }
 }
 if(novo){document.querySelectorAll('form input,form select,form textarea').forEach(x=>{x.disabled=false;x.readOnly=false})}
})();
</script></body></html>`; }
function v208_arr(d,k){ d[k]=Array.isArray(d[k])?d[k]:[]; return d[k]; }
function v208_next(d,k){ d._seq=d._seq||{}; d._seq[k]=Number(d._seq[k]||0)+1; return d._seq[k]; }
function v208_norm(v){ return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase(); }
function v208_money(v){ if(v==null||v==='')return 0; if(typeof v==='number')return v; let s=String(v).replace(/[R$\s]/g,'').trim(); if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.'); else if(s.includes(','))s=s.replace(',','.'); const n=Number(s); return isNaN(n)?0:n; }
function v208_brl(v){ return (v208_money(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function v208_idList(v){ if(Array.isArray(v))return v.map(String); if(!v)return []; return String(v).split(',').map(x=>x.trim()).filter(Boolean); }
function v208_num(c){ return c.numeroInterno || c.numero || c.numeroChamado || c.id || ''; }
function v208_isClosed(c){ return ['FINALIZADO','FECHADO','CANCELADO'].includes(v208_norm(c.status)); }
function v208_missingInfo(c){ const faltas=[]; if(!String(c.descricao||c.descricaoServico||c.observacao||'').trim())faltas.push('descrição'); if(!String(c.prestadorNome||c.prestador||c.prestadorId||'').trim())faltas.push('prestador'); if(!v208_money(c.valorServico||c.valor))faltas.push('valor'); return faltas; }
function v208_groupKey(c){ return `${c.lojaId||c.lojaNome||c.loja||''}|||${c.prestadorId||c.prestadorNome||c.prestador||''}`; }
function v208_sameGroup(arr){ if(arr.length<=1)return true; const k=v208_groupKey(arr[0]); return arr.every(c=>v208_groupKey(c)===k); }
function v208_findChamados(d,ids){ return v208_arr(d,'chamados').filter(c=>ids.includes(String(c.id))||ids.includes(String(v208_num(c)))); }
function v208_getOS(d,id){ return v208_arr(d,'os').find(o=>String(o.id)===String(id)||String(o.numeroOs||o.numero)===String(id)); }
function v208_linkedChamados(d,os){ const ids=v208_idList(os.chamadoIds||os.chamadosIds||os.chamados||os.chamadosVinculados); let list=v208_findChamados(d,ids); if(!list.length&&os.numeroOs){list=v208_arr(d,'chamados').filter(c=>String(c.osId||c.osNumero||'')===String(os.id||os.numeroOs));} return list; }
function v208_buildOS(d,chamados){ const first=chamados[0]||{}; const id=v208_next(d,'os'); const nums=chamados.map(v208_num).filter(Boolean); const valorTotal=chamados.reduce((s,c)=>s+v208_money(c.valorServico||c.valor),0); const os={id,numeroOs:nums.join(', '),chamadoIds:chamados.map(c=>String(c.id)),numerosChamados:nums,lojaId:first.lojaId||'',lojaNome:first.lojaNome||first.loja||'',prestadorId:first.prestadorId||'',prestadorNome:first.prestadorNome||first.prestador||'',valorTotal,status:'ABERTA',tipo:chamados.length>1?'JUNCAO':'INDIVIDUAL',criadoEm:new Date().toISOString()}; v208_arr(d,'os').push(os); chamados.forEach(c=>{c.osId=id;c.osNumero=os.numeroOs;c.statusOs='OS GERADA';c.atualizadoEm=new Date().toISOString();}); return os; }
app.get('/chamados', auth, (req,res)=>{ const d=v208_load(); const q=v208_norm(req.query.q||''); const status=v208_norm(req.query.status||''); const todos=req.query.todos==='1'; let arr=v208_arr(d,'chamados'); if(q)arr=arr.filter(c=>v208_norm(JSON.stringify(c)).includes(q)); if(status)arr=arr.filter(c=>v208_norm(c.status)===status); if(!q&&!status&&!todos)arr=arr.filter(c=>!v208_isClosed(c)); const rows=arr.map(c=>`<tr><td>${v208_esc(v208_num(c))}</td><td>${v208_esc(c.lojaNome||c.loja||'')}</td><td>${v208_esc(c.prestadorNome||c.prestador||'')}</td><td>${v208_esc(c.servico||c.tipoServico||'')}</td><td>${v208_esc(c.status||'ABERTO')}</td><td class="nowrap"><a class="btn small" href="/chamados/${c.id}/editar">Abrir</a> <a class="btn small secondary" href="/chamados/${c.id}/editar">Editar</a> <a class="btn small warn" href="/chamados/${c.id}/finalizar">Finalizar</a> <form method="post" action="/chamados/${c.id}/excluir" style="display:inline" onsubmit="return confirm('Excluir chamado?')"><button class="small danger">Excluir</button></form> <form method="post" action="/os/gerar" style="display:inline"><input type="hidden" name="chamados" value="${v208_esc(c.id)}"><button class="small">Gerar O.S.</button></form></td></tr>`).join('')||`<tr><td colspan="6">Nenhum registro.</td></tr>`; res.send(v208_page(req,'Chamados',`<h2>Chamados</h2><div class="card"><div class="toolbar"><a class="btn" href="/chamados/novo">➕ Novo</a><a class="btn secondary" href="/chamados?todos=1">📋 Mostrar todos</a><a class="btn secondary" href="javascript:history.back()">Voltar</a></div><form method="get" class="searchline"><input name="q" placeholder="Buscar por número, loja, prestador..." value="${v208_esc(req.query.q||'')}"><select name="status"><option value="">Status atual</option>${['ABERTO','AGENDADO','AGUARDANDO APROVAÇÃO','FINALIZADO','CANCELADO'].map(s=>`<option ${v208_norm(req.query.status)==v208_norm(s)?'selected':''}>${s}</option>`).join('')}</select><button>Buscar</button></form><table><thead><tr><th>Nº</th><th>Loja</th><th>Prestador</th><th>Serviço</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div>`)); });
app.post('/chamados/:id/excluir', auth, async (req,res)=>{ const d=v208_load(); d.chamados=v208_arr(d,'chamados').filter(c=>String(c.id)!==String(req.params.id)); await v208_save(d); res.redirect('/chamados'); });
app.get('/chamados/:id/finalizar', auth, (req,res)=>{ const d=v208_load(); const c=v208_arr(d,'chamados').find(x=>String(x.id)===String(req.params.id)); if(!c)return res.redirect('/chamados'); const faltas=v208_missingInfo(c); res.send(v208_page(req,'Finalizar chamado',`<h2>Finalizar chamado Nº ${v208_esc(v208_num(c))}</h2><form class="card" method="post" action="/chamados/${c.id}/finalizar">${faltas.length?`<div class="alert">Este chamado está sem ${v208_esc(faltas.join(', '))}. Informe o motivo para finalizar.</div>`:''}<label>Tipo de fechamento<select name="tipoFechamento" required><option value="">Selecione</option><option>Serviço executado</option><option>Fechar sem valor</option><option>Cancelamento</option><option>Duplicado</option><option>Resolvido internamente</option><option>Outro</option></select></label><label>Motivo/observação do fechamento<textarea name="motivoFechamento" required placeholder="Explique o motivo do fechamento..."></textarea></label><button>Finalizar chamado</button><a class="btn secondary" href="javascript:history.back()">Voltar</a></form>`)); });
app.post('/chamados/:id/finalizar', auth, async (req,res)=>{ const d=v208_load(); const c=v208_arr(d,'chamados').find(x=>String(x.id)===String(req.params.id)); if(c){c.status=req.body.tipoFechamento==='Cancelamento'?'CANCELADO':'FINALIZADO';c.tipoFechamento=req.body.tipoFechamento||'';c.motivoFechamento=req.body.motivoFechamento||'';c.dataFechamento=new Date().toISOString();c.usuarioFechamento=(req.session&&req.session.user&&(req.session.user.nome||req.session.user.usuario))||'';} await v208_save(d); res.redirect('/chamados'); });
app.get('/os/nova', auth, (req,res)=>{ const d=v208_load(); const q=v208_norm(req.query.q||''); let chamados=v208_arr(d,'chamados').filter(c=>!v208_isClosed(c)); if(q)chamados=chamados.filter(c=>v208_norm(JSON.stringify(c)).includes(q)); const grupos={}; chamados.forEach(c=>{const k=v208_groupKey(c); if(!grupos[k])grupos[k]=[]; grupos[k].push(c);}); const cards=Object.values(grupos).map(list=>{ const first=list[0]||{}; const total=list.reduce((s,c)=>s+v208_money(c.valorServico||c.valor),0); const rows=list.map(c=>`<tr><td><input type="checkbox" name="chamados" value="${v208_esc(c.id)}"></td><td>${v208_esc(v208_num(c))}</td><td>${v208_esc(c.descricao||c.descricaoServico||'')}</td><td>${v208_esc(c.status||'ABERTO')}</td><td>${v208_brl(c.valorServico||c.valor)}</td></tr>`).join(''); return `<form class="os-group card" method="post" action="/os/gerar"><div class="os-group-head"><div><b>Loja:</b> ${v208_esc(first.lojaNome||first.loja||'')}</div><div><b>Prestador:</b> ${v208_esc(first.prestadorNome||first.prestador||'')}</div><div><b>${list.length} chamado(s)</b> ${v208_brl(total)}</div></div><div class="toolbar"><button type="button" onclick="this.closest('form').querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=true)">Selecionar todos da loja/prestador</button><button>Gerar O.S. / Junção</button></div><table><thead><tr><th>Sel.</th><th>Chamado</th><th>Descrição</th><th>Status</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table></form>`; }).join('')||'<div class="card">Nenhum chamado aberto para O.S.</div>'; res.send(v208_page(req,'Gerar O.S.',`<h2>Gerar/Imprimir O.S.</h2><div class="card"><b>Regra:</b> para juntar, selecione chamados do mesmo grupo: mesma loja e mesmo prestador.</div><form method="get" class="card searchline"><input name="q" placeholder="Pesquisar nº, loja, prestador ou serviço" value="${v208_esc(req.query.q||'')}"><button>Buscar</button><a class="btn secondary" href="/os/nova">Limpar</a></form>${cards}`)); });
app.post('/os/gerar', auth, async (req,res)=>{ const d=v208_load(); const ids=v208_idList(req.body.chamados); const chamados=v208_findChamados(d,ids).filter(c=>!v208_isClosed(c)); if(!chamados.length)return res.send(v208_page(req,'O.S.',`<div class="card">Nenhum chamado selecionado.<br><a class="btn" href="/os/nova">Voltar</a></div>`)); if(!v208_sameGroup(chamados))return res.send(v208_page(req,'O.S.',`<div class="card"><h2>Atenção</h2><p>Para juntar chamados, todos precisam ser da mesma loja e mesmo prestador.</p><a class="btn" href="/os/nova">Voltar</a></div>`)); const os=v208_buildOS(d,chamados); await v208_save(d); res.redirect('/os-impressao/'+os.id); });


/* ============== PATCH V20.8.22 - LAYOUT IMPRESSÃO O.S. VESTCASA ============== */
function v2081_load(){ return (typeof load === 'function') ? load() : (globalThis.appState || globalThis.state || {lojas:[],prestadores:[],proprietarios:[],chamados:[],usuarios:[],config:{},os:[],_seq:{}}); }
function v2081_esc(v){ return (typeof esc === 'function') ? esc(v) : String(v??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function v2081_page(req,t,b){ return (typeof page === 'function') ? page(req,t,b) : `<!doctype html><html><head><meta charset="utf-8"><title>${v2081_esc(t)}</title><link rel="stylesheet" href="/style.css"></head><body><main>${b}</main><span class="version">V20.8.22</span><script src="/app.js"></script><script>
(function(){
 const edit=/\/(lojas|prestadores|proprietarios|usuarios|chamados|lembretes|preventivas|perfis|tipos-servico)\/[^\/]+\/editar/.test(location.pathname);
 const novo=location.pathname.includes('/novo')||location.pathname.includes('/nova');
 if(edit){
  const form=document.querySelector('form.card, form');
  if(form&&!document.getElementById('btnEditarCampos')){
   const bar=document.querySelector('.bar .loja-topbar,.bar')||form;
   const b=document.createElement('button'); b.type='button'; b.id='btnEditarCampos'; b.className='btn secondary'; b.textContent='✏️ Editar campos';
   (bar.querySelector('div')||bar).prepend(b);
   const fields=[...form.querySelectorAll('input,select,textarea')].filter(x=>x.type!=='hidden'&&x.type!=='submit'&&x.type!=='button');
   fields.forEach(x=>{ if(x.type==='file') return; if(x.tagName==='SELECT') x.disabled=true; else x.readOnly=true; });
   b.onclick=()=>{fields.forEach(x=>{x.disabled=false;x.readOnly=false}); b.textContent='✅ Campos liberados';};
   form.addEventListener('submit',()=>fields.forEach(x=>{x.disabled=false;x.readOnly=false}));
  }
 }
 if(novo){document.querySelectorAll('form input,form select,form textarea').forEach(x=>{x.disabled=false;x.readOnly=false})}
})();
</script></body></html>`; }
function v2081_arr(d,k){ d[k]=Array.isArray(d[k])?d[k]:[]; return d[k]; }
function v2081_money(v){
  if(v==null || v==='') return 0;
  if(typeof v==='number') return v;
  let s=String(v).replace(/[R$\s]/g,'').trim();
  if(s.includes(',') && s.includes('.')) s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(',')) s=s.replace(',','.');
  const n=Number(s);
  return isNaN(n)?0:n;
}
function v2081_brl(v){ return (v2081_money(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function v2081_idList(v){ return Array.isArray(v)?v.map(String):(String(v||'').split(',').map(x=>x.trim()).filter(Boolean)); }
function v2081_num(c){ return c.numeroInterno || c.numero || c.numeroChamado || c.id || ''; }
function v2081_getOS(d,id){ return v2081_arr(d,'os').find(o=>String(o.id)===String(id) || String(o.numeroOs||o.numero)===String(id)); }
function v2081_chamadosOS(d,os){
  const ids=v2081_idList(os.chamadoIds || os.chamadosIds || os.chamados || os.chamadosVinculados);
  let list=v2081_arr(d,'chamados').filter(c=>ids.includes(String(c.id)) || ids.includes(String(v2081_num(c))));
  if(!list.length) list=v2081_arr(d,'chamados').filter(c=>String(c.osId||c.osNumero||'')===String(os.id||os.numeroOs));
  return list;
}
function v2081_findLoja(d, c, os){
  return v2081_arr(d,'lojas').find(l=>String(l.id)===String(c.lojaId||os.lojaId||'')) ||
         v2081_arr(d,'lojas').find(l=>String(l.nome||l.loja||'').toUpperCase()===String(c.lojaNome||c.loja||os.lojaNome||'').toUpperCase()) || {};
}
function v2081_findPrestador(d, c, os){
  return v2081_arr(d,'prestadores').find(p=>String(p.id)===String(c.prestadorId||os.prestadorId||'')) ||
         v2081_arr(d,'prestadores').find(p=>String(p.nome||p.empresa||'').toUpperCase()===String(c.prestadorNome||c.prestador||os.prestadorNome||'').toUpperCase()) || {};
}
function v2081_userAtual(req,d){
  const s=(req.session&&req.session.user)||{};
  return v2081_arr(d,'usuarios').find(u=>String(u.id)===String(s.id||'') || String(u.usuario||'')===String(s.usuario||s.user||'') || String(u.nome||'')===String(s.nome||'')) || s || {};
}
function v2081_assinaturaAnalista(req,d,first){
  const u=v2081_userAtual(req,d);
  const analistaNome = u.nome || first.analista || first.analistaResponsavel || first.atribuido || '';
  const img = u.assinatura || u.assinaturaDigital || u.assinaturaUrl || u.imagemAssinatura || '';
  if(img) return `<div class="assinatura-img-wrap"><img src="${v2081_esc(img)}" class="assinatura-img"><div class="assinatura-nome">${v2081_esc(analistaNome)}</div></div>`;
  return `<div class="assinatura-linha"></div><div class="assinatura-nome">${v2081_esc(analistaNome)}</div>`;
}

app.get('/os-impressao/:id', auth, (req,res)=>{
  const d=v2081_load();
  const os=v2081_getOS(d,req.params.id);
  if(!os) return res.redirect('/os/nova');
  const chamados=v2081_chamadosOS(d,os);
  const first=chamados[0]||{};
  const loja=v2081_findLoja(d,first,os);
  const prest=v2081_findPrestador(d,first,os);
  const logo = loja.logo || loja.logoUrl || first.logoLoja || first.lojaLogo || (d.config&&d.config.logoOs) || '';
  const semValor = req.query.semValor === '1';
  const osNumero = os.numeroOs || chamados.map(v2081_num).filter(Boolean).join(', ') || os.id;
  const total = os.valorTotal || chamados.reduce((s,c)=>s+v2081_money(c.valorServico||c.valor),0);

  const linhas = chamados.map(c=>`
    <tr>
      <td>${v2081_esc(v2081_num(c))}</td>
      <td>${v2081_esc(c.servico||c.tipoServico||'')}</td>
      <td>${v2081_esc(c.descricao||c.descricaoServico||c.observacao||'')}</td>
      ${semValor?'':`<td class="col-valor">${v2081_brl(c.valorServico||c.valor)}</td>`}
    </tr>`).join('');

  res.send(v2081_page(req,'O.S. Impressão',`
    <div class="os-toolbar no-print">
      <button onclick="window.print()">🖨️ Imprimir</button>
      <a class="btn secondary" href="/os-impressao/${v2081_esc(os.id)}?semValor=${semValor?'0':'1'}">${semValor?'Mostrar valores':'Imprimir sem valor'}</a>
      <form method="post" action="/os/${v2081_esc(os.id)}/fechar" style="display:inline">
        <button onclick="return confirm('Fechar esta O.S. e todos os chamados vinculados?')">✅ Fechar O.S.</button>
      </form>
      <a class="btn secondary" href="javascript:history.back()">Voltar</a>
    </div>

    <section class="os-vc-page">
      <div class="os-vc-logo">
        ${logo?`<img src="${v2081_esc(logo)}" alt="Logo loja">`:''}
      </div>

      <h1>ORDEM DE SERVIÇO Nº ${v2081_esc(osNumero)}</h1>

      <table class="os-vc-table">
        <tr><th colspan="4">DADOS DO REQUERENTE</th></tr>
        <tr>
          <td class="lbl">LOJA:</td><td>${v2081_esc(loja.nome||loja.loja||first.lojaNome||first.loja||os.lojaNome||'')}</td>
          <td class="lbl">CNPJ:</td><td>${v2081_esc(loja.cnpj||first.cnpj||first.lojaCnpj||'')}</td>
        </tr>
        <tr>
          <td class="lbl">ENDEREÇO:</td><td>${v2081_esc(loja.endereco||first.endereco||'')}</td>
          <td class="lbl">CIDADE/UF:</td><td>${v2081_esc((loja.cidade||first.cidade||'') + (loja.uf||first.uf ? ' / ' + (loja.uf||first.uf||'') : ''))}</td>
        </tr>
        <tr>
          <td class="lbl">RESPONSÁVEL:</td><td>${v2081_esc(loja.responsavel||first.responsavel||'')}</td>
          <td class="lbl">WHATSAPP:</td><td>${v2081_esc(loja.whatsapp||loja.telefone||first.whatsapp||'')}</td>
        </tr>
      </table>

      <table class="os-vc-table">
        <thead>
          <tr>
            <th>Chamado</th>
            <th>Serviço</th>
            <th>Descrição</th>
            ${semValor?'':`<th class="col-valor">Valor</th>`}
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
        ${semValor?'':`<tfoot><tr><td colspan="3" class="total-label">TOTAL</td><td class="col-valor"><b>${v2081_brl(total)}</b></td></tr></tfoot>`}
      </table>

      <h2>PRESTADOR</h2>
      <table class="os-vc-table">
        <tr>
          <td class="lbl">EMPRESA:</td><td>${v2081_esc(prest.empresa||prest.nome||first.prestadorNome||first.prestador||os.prestadorNome||'')}</td>
          <td class="lbl">CNPJ/CPF:</td><td>${v2081_esc(prest.cnpj||prest.cpf||prest.documento||'')}</td>
        </tr>
        <tr>
          <td class="lbl">NOME:</td><td>${v2081_esc(prest.nome||first.prestadorNome||first.prestador||'')}</td>
          <td class="lbl">TELEFONE:</td><td>${v2081_esc(prest.telefone||first.telefonePrestador||'')}</td>
        </tr>
      </table>

      <h2>DESCRIÇÃO DA ORDEM DE SERVIÇO</h2>
      <div class="os-vc-desc">
        ${chamados.map(c=>`<p><b>${v2081_esc(v2081_num(c))}</b> - ${v2081_esc(c.descricao||c.descricaoServico||c.observacao||'')}</p>`).join('')}
      </div>

      <h2>TERMO DE RESPONSABILIDADE</h2>
      <p class="termo">Declaro que as atividades descritas foram executadas ou acompanhadas conforme solicitação. O prestador deverá utilizar EPIs e equipamentos adequados, seguindo normas de segurança e responsabilidade técnica.</p>

      <div class="os-vc-assinaturas">
        <div>
          <div class="assinatura-linha"></div>
          <div>PRESTADOR</div>
        </div>
        <div>
          <div class="assinatura-linha"></div>
          <div>RESPONSÁVEL LOJA</div>
        </div>
        <div>
          ${v2081_assinaturaAnalista(req,d,first)}
          <div>ANALISTA</div>
        </div>
      </div>
    </section>`));
});

app.get('/os-impressao/:id', auth, (req,res)=>{ const d=v208_load(); const os=v208_getOS(d,req.params.id); if(!os)return res.redirect('/os/nova'); const chamados=v208_linkedChamados(d,os); const first=chamados[0]||{}; const missing=chamados.some(c=>v208_missingInfo(c).length); const rows=chamados.map(c=>`<tr><td>${v208_esc(v208_num(c))}</td><td>${v208_esc(c.servico||c.tipoServico||'')}</td><td>${v208_esc(c.descricao||c.descricaoServico||'')}</td><td class="os-valor">${v208_brl(c.valorServico||c.valor)}</td></tr>`).join(''); const descLista=chamados.map(c=>`${v208_esc(v208_num(c))} - ${v208_esc(c.descricao||c.descricaoServico||'')}`).join('<br>'); res.send(v208_page(req,'O.S. Impressão',`<div class="no-print os-actions"><button onclick="window.print()">🖨️ Imprimir</button><button onclick="document.body.classList.toggle('sem-valores')">🚫 Imprimir sem valor</button><form method="post" action="/os/${os.id}/fechar" style="display:inline"><button type="submit" onclick="${missing?`event.preventDefault();document.getElementById('modalFecharOS').style.display='flex'`:`return confirm('Fechar esta O.S. e todos os chamados vinculados?')`}">✅ Fechar O.S. e chamados</button></form><a class="btn secondary" href="/os/nova">Voltar</a></div><section class="os-print"><h1>ORDEM DE SERVIÇO Nº ${v208_esc(os.numeroOs||os.id)}</h1><table class="os-table"><tr><th colspan="4">DADOS DO REQUERENTE</th></tr><tr><td>LOJA:</td><td>${v208_esc(first.lojaNome||first.loja||'')}</td><td>CNPJ:</td><td>${v208_esc(first.cnpj||first.lojaCnpj||'')}</td></tr><tr><td>ENDEREÇO:</td><td>${v208_esc(first.endereco||'')}</td><td>CIDADE/UF:</td><td>${v208_esc((first.cidade||'')+' '+(first.uf||''))}</td></tr></table><table class="os-table"><thead><tr><th>Chamado</th><th>Serviço</th><th>Descrição</th><th class="os-valor">Valor</th></tr></thead><tbody>${rows}</tbody></table><h2>PRESTADOR</h2><p>${v208_esc(first.prestadorNome||first.prestador||'')}</p><h2>DESCRIÇÃO DA ORDEM DE SERVIÇO</h2><p>${descLista}</p><h2>TERMO DE RESPONSABILIDADE</h2><p>Declaro que as atividades descritas foram executadas ou acompanhadas conforme solicitação.</p><div class="assinaturas"><div>PRESTADOR</div><div>RESPONSÁVEL LOJA</div><div>ANALISTA</div></div></section><div id="modalFecharOS" class="modal-os"><form class="modal-box" method="post" action="/os/${os.id}/fechar"><h2>Fechar O.S. com informações incompletas?</h2><p>Existe chamado sem descrição, prestador ou valor. Informe o motivo.</p><label>Tipo de fechamento<select name="tipoFechamento" required><option value="">Selecione</option><option>Serviço executado</option><option>Fechar sem valor</option><option>Cancelamento</option><option>Duplicado</option><option>Resolvido internamente</option><option>Outro</option></select></label><label>Motivo<textarea name="motivoFechamento" required></textarea></label><button>Confirmar fechamento</button><button type="button" class="secondary" onclick="document.getElementById('modalFecharOS').style.display='none'">Cancelar</button></form></div>`)); });
app.post('/os/:id/fechar', auth, async (req,res)=>{ const d=v208_load(); const os=v208_getOS(d,req.params.id); if(!os)return res.redirect('/os/nova'); const chamados=v208_linkedChamados(d,os); const precisaMotivo=chamados.some(c=>v208_missingInfo(c).length); if(precisaMotivo&&!req.body.tipoFechamento)return res.redirect('/os-impressao/'+os.id); const tipo=req.body.tipoFechamento||'Serviço executado'; const statusFinal=tipo==='Cancelamento'?'CANCELADO':'FINALIZADO'; chamados.forEach(c=>{c.status=statusFinal;c.osFechada=true;c.dataFechamento=new Date().toISOString();c.tipoFechamento=tipo;c.motivoFechamento=req.body.motivoFechamento||'Fechado pela O.S.';c.usuarioFechamento=(req.session&&req.session.user&&(req.session.user.nome||req.session.user.usuario))||'';}); os.status=statusFinal;os.dataFechamento=new Date().toISOString();os.tipoFechamento=tipo;os.motivoFechamento=req.body.motivoFechamento||''; await v208_save(d); res.redirect('/chamados'); });

app.get('/chamados', auth, (req,res)=>v2071_list(req,res,'chamados','Chamados',['Nº','Loja','Prestador','Serviço','Status'],c=>`<tr><td>${v2071_esc(c.numeroInterno||c.numero||c.id||'')}</td><td>${v2071_esc(c.lojaNome||c.loja||'')}</td><td>${v2071_esc(c.prestadorNome||c.prestador||'')}</td><td>${v2071_esc(c.tipoServico||c.servico||'')}</td><td>${v2071_esc(c.status||'')}</td><td><a class="btn small" href="/chamados/${c.id}/editar">Abrir</a></td></tr>`));

app.get('/lojas-por-analista', auth, (req,res)=>{
 const d=v2071_load(); const analista=req.query.analista||'TODOS';
 const usuarios=v2071_arr(d,'usuarios');
 let lojas=v2071_arr(d,'lojas');
 if(analista && analista!=='TODOS') lojas=lojas.filter(l=>v2071_norm(l.analista||l.analistaResponsavel||'')===v2071_norm(analista));
 const opts=['TODOS',...usuarios.map(u=>u.nome||u.usuario).filter(Boolean)];
 const rows=lojas.map(l=>`<tr><td>${v2071_esc(l.nome||l.loja||'')}</td><td>${v2071_esc(l.cidade||'')}</td><td>${v2071_esc(l.uf||l.estado||'')}</td><td>${v2071_esc(l.analista||l.analistaResponsavel||'')}</td></tr>`).join('')||'<tr><td colspan=4>Nenhum registro.</td></tr>';
 res.send(v2071_page(req,'Lojas por Analista',`<h2>Lojas por Analista</h2><div class="card no-print"><form method="get"><label>Analista<select name="analista">${opts.map(o=>`<option ${o===analista?'selected':''}>${v2071_esc(o)}</option>`).join('')}</select></label><button>Pesquisar</button><button type="button" onclick="window.print()">🖨️ Imprimir lista</button><a class="btn secondary" href="javascript:history.back()">Voltar</a></form></div><div class="card"><table><thead><tr><th>Loja</th><th>Cidade</th><th>UF</th><th>Analista</th></tr></thead><tbody>${rows}</tbody></table></div>`));
});

/* Config sem WhatsApp suporte */
app.get('/config', auth, (req,res)=>{
 const d=v2071_load(); const c=d.config||{};
 res.send(v2071_page(req,'Config',`<h2>⚙️ Configurações</h2><form class="card" method="post" action="/config" enctype="multipart/form-data">
 <label>nomeSistema<input name="nomeSistema" value="${v2071_esc(c.nomeSistema||'V&B CHAMADOS')}"></label>
 <label>subtitulo<input name="subtitulo" value="${v2071_esc(c.subtitulo||'CHAMADOS DE MANUTENÇÃO')}"></label>
 <label>Tema<select name="tema">${['VERDE','AZUL','ESCURO','LARANJA','ROXO','CLARO'].map(t=>`<option ${v2071_norm(c.tema)===t?'selected':''}>${t}</option>`).join('')}</select></label>
 <label>logoUrl<input name="logoUrl" value="${v2071_esc(c.logoUrl||'')}"></label>
 <label>Logo local<input type="file" name="logoLocal" accept="image/*"></label>
 <label>Regra PDF loja<select name="regraPdfLoja"><option>MEGA VEST CASA + CIDADE - UF</option><option>ORIGINAL</option></select></label>
 <label>nomeBaseFilial<input name="nomeBaseFilial" value="${v2071_esc(c.nomeBaseFilial||'MEGA VEST CASA')}"></label>
 <button>💾 Salvar</button></form>
 <div class="card"><h2>Cadastros de apoio</h2><a class="btn" href="/permissoes">Permissões</a> <a class="btn" href="/importar-planilha">Importar</a> <a class="btn" href="/backup">Backup</a> <a class="btn" href="/status">Status</a> <a class="btn" href="/pagamentos">Pagamentos</a></div>`));
});
app.post('/config', auth, upload.any(), async (req,res)=>{
 const d=v2071_load(); d.config=d.config||{}; Object.assign(d.config,req.body||{});
 const f=v2071_file(req); if(f){d.config.logoLocal=v2071_pub(f); d.config.logoUrl=d.config.logoUrl||d.config.logoLocal}
 await v2071_save(d); res.redirect('/config');
});

function v2071_pdfBlock(tipo,id){
 const action = tipo==='loja'?`/loja-pdf/${id}`:tipo==='prestador'?`/prestador-pdf/${id}`:`/proprietario-pdf/${id}`;
 return `<details open class="card"><summary>📄 Preencher por PDF/cartão CNPJ</summary><form method="post" action="${action}" enctype="multipart/form-data" class="loading-form"><label>Enviar PDF<input type="file" name="pdf" accept="application/pdf" required></label><button>🔎 Pesquisar PDF</button></form></details>`;
}


/* ============== PATCH V20.8.22 - LOJA COM ANALISTA E PROPRIETÁRIO ============== */
function v2073_load(){ return (typeof load === 'function') ? load() : (globalThis.appState || globalThis.state || {lojas:[],prestadores:[],proprietarios:[],chamados:[],usuarios:[],config:{},_seq:{}}); }
async function v2073_save(d){ if(typeof save === 'function'){ const r=save(d); if(r&&typeof r.then==='function') return await r; return r; } globalThis.appState=d; globalThis.state=d; return true; }
function v2073_esc(v){ return (typeof esc === 'function') ? esc(v) : String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function v2073_page(req,t,b){ return (typeof page === 'function') ? page(req,t,b) : `<!doctype html><html><head><meta charset="utf-8"><title>${v2073_esc(t)}</title><link rel="stylesheet" href="/style.css"></head><body><header><h1>V&B CHAMADOS</h1><nav><a href="/">Início</a> <a href="/chamados">Chamados</a> <a href="/lojas">Lojas</a> <a href="/prestadores">Prestadores</a> <a href="/proprietarios">Proprietários</a> <a href="/config">Config</a></nav></header><main>${b}</main><span class="version">V20.8.22</span><script src="/app.js"></script><script>
(function(){
 const edit=/\/(lojas|prestadores|proprietarios|usuarios|chamados|lembretes|preventivas|perfis|tipos-servico)\/[^\/]+\/editar/.test(location.pathname);
 const novo=location.pathname.includes('/novo')||location.pathname.includes('/nova');
 if(edit){
  const form=document.querySelector('form.card, form');
  if(form&&!document.getElementById('btnEditarCampos')){
   const bar=document.querySelector('.bar .loja-topbar,.bar')||form;
   const b=document.createElement('button'); b.type='button'; b.id='btnEditarCampos'; b.className='btn secondary'; b.textContent='✏️ Editar campos';
   (bar.querySelector('div')||bar).prepend(b);
   const fields=[...form.querySelectorAll('input,select,textarea')].filter(x=>x.type!=='hidden'&&x.type!=='submit'&&x.type!=='button');
   fields.forEach(x=>{ if(x.type==='file') return; if(x.tagName==='SELECT') x.disabled=true; else x.readOnly=true; });
   b.onclick=()=>{fields.forEach(x=>{x.disabled=false;x.readOnly=false}); b.textContent='✅ Campos liberados';};
   form.addEventListener('submit',()=>fields.forEach(x=>{x.disabled=false;x.readOnly=false}));
  }
 }
 if(novo){document.querySelectorAll('form input,form select,form textarea').forEach(x=>{x.disabled=false;x.readOnly=false})}
})();
</script></body></html>`; }
function v2073_arr(d,k){ d[k]=Array.isArray(d[k])?d[k]:[]; return d[k]; }
function v2073_file(req){ return req.file || (Array.isArray(req.files)?req.files[0]:null) || (req.files?Object.values(req.files).flat()[0]:null); }
function v2073_pub(f){ return f ? ((typeof publicFile==='function') ? publicFile(f.filename||f.path||f.originalname) : ('/uploads/'+(f.filename||''))) : ''; }
function v2073_next(d,k){ d._seq=d._seq||{}; d._seq[k]=Number(d._seq[k]||0)+1; return d._seq[k]; }
function v2073_sel(a,b){ return String(a??'')===String(b??'') ? 'selected' : ''; }
function v2073_options(arr, value, labelFn){ return arr.map(x=>`<option value="${v2073_esc(x.id||x.usuario||x.nome)}" ${v2073_sel(value, x.id||x.usuario||x.nome)}>${v2073_esc(labelFn(x))}</option>`).join(''); }
function v2073_logoOptions(d, atual){ return v2073_arr(d,'lojas').filter(l=>l.logo).map(l=>`<option value="${v2073_esc(l.logo)}" ${v2073_sel(atual,l.logo)}>${v2073_esc(l.nome||l.loja||l.id)}</option>`).join(''); }
function v2073_pdfBlock(id){ return `<details open class="card bloco-pdf"><summary>📄 Preencher por PDF/cartão CNPJ</summary><form method="post" action="/loja-pdf/${id||'novo'}" enctype="multipart/form-data" class="loading-form pdf-form-inline"><label>Enviar PDF <input type="file" name="pdf" accept="application/pdf"></label><button type="submit">🔎 Pesquisar PDF</button></form><div class="hint">Regra atual: MEGA VEST CASA + CIDADE - UF.</div></details>`; }
function v2073_lojaForm(req, loja, modo){
 const d=v2073_load(); loja=loja||{};
 const usuarios=v2073_arr(d,'usuarios').filter(u=>u.analista===true || String(u.perfil||'').toUpperCase().includes('ANAL') || String(u.perfil||'').toUpperCase().includes('ADMIN'));
 const props=v2073_arr(d,'proprietarios');
 const analistaValor=loja.analistaId||loja.analista||loja.analistaResponsavel||''; const proprietarioValor=loja.proprietarioId||loja.proprietario||''; const id=loja.id||'novo';
 return v2073_page(req, modo==='edit'?'Editar loja':'Nova loja', `<div class="bar"><h2>${modo==='edit'?'✏️ Editar loja':'➕ Nova loja'}</h2><a class="btn secondary" href="javascript:history.back()">Voltar</a></div>${v2073_pdfBlock(id)}<form class="card form loja-form" method="post" action="${modo==='edit'?`/lojas/${loja.id}/editar`:'/lojas/novo'}" enctype="multipart/form-data"><div class="form-grid-4"><label>Código/Filial<input name="codigo" value="${v2073_esc(loja.codigo||loja.filial||'')}"></label><label>Nome loja<input name="nome" list="listaLojas" value="${v2073_esc(loja.nome||loja.loja||'')}" required></label><label>CNPJ<input name="cnpj" value="${v2073_esc(loja.cnpj||'')}"></label><label>CEP<input name="cep" value="${v2073_esc(loja.cep||'')}"></label><label>UF<input name="uf" list="listaUF" value="${v2073_esc(loja.uf||loja.estado||'')}"></label><label>Cidade<input name="cidade" list="listaCidades" value="${v2073_esc(loja.cidade||'')}"></label><label>Endereço<input name="endereco" value="${v2073_esc(loja.endereco||'')}"></label><label>Responsável loja<input name="responsavel" value="${v2073_esc(loja.responsavel||loja.responsavelLoja||'')}"></label><label>WhatsApp responsável<input name="whatsapp" value="${v2073_esc(loja.whatsapp||loja.telefone||'')}"></label><label>Latitude<input name="latitude" value="${v2073_esc(loja.latitude||'')}"></label><label>Longitude<input name="longitude" value="${v2073_esc(loja.longitude||'')}"></label><label>Logo<input type="file" name="logo" accept="image/*"></label><label>Analista responsável<select name="analistaId"><option value="">Sem analista</option>${v2073_options(usuarios, analistaValor, u=>(u.nome||u.usuario||'')+' - '+(u.perfil||''))}</select></label><label>Proprietário cadastrado<select name="proprietarioId"><option value="">Sem proprietário</option>${v2073_options(props, proprietarioValor, p=>(p.nome||p.razaoSocial||'')+' - '+(p.documento||p.cnpj||p.cpf||''))}</select></label><label>Reutilizar logo<select name="reutilizarLogo"><option value="">Não alterar</option>${v2073_logoOptions(d, loja.logo||'')}</select></label><label>Ativo<select name="ativo"><option value="SIM" ${v2073_sel(loja.ativo||'SIM','SIM')}>SIM</option><option value="NÃO" ${v2073_sel(loja.ativo,'NÃO')}>NÃO</option></select></label></div><details class="subcard"><summary>Horários de funcionamento</summary><div class="form-grid-3"><label>Segunda a sexta<input name="horarioSemana" value="${v2073_esc(loja.horarioSemana||'')}"></label><label>Sábado<input name="horarioSabado" value="${v2073_esc(loja.horarioSabado||'')}"></label><label>Domingo/Feriado<input name="horarioDomingo" value="${v2073_esc(loja.horarioDomingo||'')}"></label></div></details><details class="subcard"><summary>Logística automática da loja</summary><div class="form-grid-3"><label>KM atendido pela loja<input name="kmAtendido" value="${v2073_esc(loja.kmAtendido||loja.km||'')}"></label><label>Tipo serviço padrão<input name="tipoServicoPadrao" list="listaServicos" value="${v2073_esc(loja.tipoServicoPadrao||'')}"></label><label>Observação logística<input name="obsLogistica" value="${v2073_esc(loja.obsLogistica||'')}"></label></div></details><datalist id="listaLojas">${v2073_arr(d,'lojas').map(l=>`<option value="${v2073_esc(l.nome||l.loja||'')}">`).join('')}</datalist><datalist id="listaCidades">${[...new Set(v2073_arr(d,'lojas').map(l=>l.cidade).filter(Boolean))].map(c=>`<option value="${v2073_esc(c)}">`).join('')}</datalist><datalist id="listaUF">${['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(u=>`<option value="${u}">`).join('')}</datalist><datalist id="listaServicos">${[...new Set(v2073_arr(d,'prestadores').map(p=>p.tipoServico||p.servico).filter(Boolean))].map(s=>`<option value="${v2073_esc(s)}">`).join('')}</datalist><div class="form-actions"><button>💾 Salvar</button><a class="btn secondary" href="/lojas?todos=1">Voltar para lojas</a></div></form>`);
}


/* ============== PATCH V20.8.22 - CADASTRO DE LOJA ORGANIZADO ============== */
function v2074_load(){ return (typeof load === 'function') ? load() : (globalThis.appState || globalThis.state || {lojas:[],prestadores:[],proprietarios:[],chamados:[],usuarios:[],config:{},_seq:{}}); }
async function v2074_save(d){ if(typeof save === 'function'){ const r=save(d); if(r&&typeof r.then==='function') return await r; return r; } globalThis.appState=d; globalThis.state=d; return true; }
function v2074_esc(v){ return (typeof esc === 'function') ? esc(v) : String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function v2074_page(req,t,b){ return (typeof page === 'function') ? page(req,t,b) : `<!doctype html><html><head><meta charset="utf-8"><title>${v2074_esc(t)}</title><link rel="stylesheet" href="/style.css"></head><body><header><h1>V&B CHAMADOS</h1><nav><a href="/">Início</a> <a href="/chamados">Chamados</a> <a href="/lojas">Lojas</a> <a href="/prestadores">Prestadores</a> <a href="/proprietarios">Proprietários</a> <a href="/config">Config</a></nav></header><main>${b}</main><span class="version">V20.8.22</span><script src="/app.js"></script><script>
(function(){
 const edit=/\/(lojas|prestadores|proprietarios|usuarios|chamados|lembretes|preventivas|perfis|tipos-servico)\/[^\/]+\/editar/.test(location.pathname);
 const novo=location.pathname.includes('/novo')||location.pathname.includes('/nova');
 if(edit){
  const form=document.querySelector('form.card, form');
  if(form&&!document.getElementById('btnEditarCampos')){
   const bar=document.querySelector('.bar .loja-topbar,.bar')||form;
   const b=document.createElement('button'); b.type='button'; b.id='btnEditarCampos'; b.className='btn secondary'; b.textContent='✏️ Editar campos';
   (bar.querySelector('div')||bar).prepend(b);
   const fields=[...form.querySelectorAll('input,select,textarea')].filter(x=>x.type!=='hidden'&&x.type!=='submit'&&x.type!=='button');
   fields.forEach(x=>{ if(x.type==='file') return; if(x.tagName==='SELECT') x.disabled=true; else x.readOnly=true; });
   b.onclick=()=>{fields.forEach(x=>{x.disabled=false;x.readOnly=false}); b.textContent='✅ Campos liberados';};
   form.addEventListener('submit',()=>fields.forEach(x=>{x.disabled=false;x.readOnly=false}));
  }
 }
 if(novo){document.querySelectorAll('form input,form select,form textarea').forEach(x=>{x.disabled=false;x.readOnly=false})}
})();
</script></body></html>`; }
function v2074_arr(d,k){ d[k]=Array.isArray(d[k])?d[k]:[]; return d[k]; }
function v2074_file(req, name){ if(req.file && (!name || req.file.fieldname===name)) return req.file; if(Array.isArray(req.files)) return req.files.find(f=>!name||f.fieldname===name)||null; if(req.files&&typeof req.files==='object'){ const vals=Object.values(req.files).flat(); return vals.find(f=>!name||f.fieldname===name)||null; } return null; }
function v2074_pub(f){ return f ? ((typeof publicFile==='function') ? publicFile(f.filename||f.path||f.originalname) : ('/uploads/'+(f.filename||''))) : ''; }
function v2074_next(d,k){ d._seq=d._seq||{}; d._seq[k]=Number(d._seq[k]||0)+1; return d._seq[k]; }
function v2074_sel(a,b){ return String(a??'')===String(b??'') ? 'selected' : ''; }
function v2074_norm(v){ return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase(); }
function v2074_analistas(d, atual){ return v2074_arr(d,'usuarios').filter(u=>u.analista===true || v2074_norm(u.perfil).includes('ANAL') || v2074_norm(u.perfil).includes('ADMIN')).map(u=>{ const val=String(u.id||u.usuario||u.nome||''); const txt=(u.nome||u.usuario||'')+(u.perfil?' - '+u.perfil:''); return `<option value="${v2074_esc(val)}" ${v2074_sel(atual,val)}>${v2074_esc(txt)}</option>`; }).join(''); }
function v2074_proprietarios(d, atual){ return v2074_arr(d,'proprietarios').map(p=>{ const val=String(p.id||p.nome||''); const doc=p.documento||p.cnpj||p.cpf||''; return `<option value="${v2074_esc(val)}" ${v2074_sel(atual,val)}>${v2074_esc((p.nome||p.razaoSocial||'')+(doc?' - '+doc:''))}</option>`; }).join(''); }
function v2074_logoOptions(d, atual){ return v2074_arr(d,'lojas').filter(l=>l.logo).map(l=>`<option value="${v2074_esc(l.logo)}" ${v2074_sel(atual,l.logo)}>${v2074_esc(l.nome||l.loja||l.codigo||l.id)}</option>`).join(''); }
function v2074_pdfBox(id){ return `<section class="card loja-section loja-pdf-box"><h3>📄 Preencher por PDF/cartão CNPJ</h3><form method="post" action="/loja-pdf/${id||'novo'}" enctype="multipart/form-data" class="loading-form loja-pdf-form"><input type="file" name="pdf" accept="application/pdf"><button type="submit">🔎 Pesquisar PDF</button></form><div class="info-blue">Regra atual: <b>MEGA VEST CASA + CIDADE - UF</b>. Exemplo: MEGA VEST CASA PRAIA GRANDE - SP.</div></section>`; }
function v2074_lojaFormulario(req, loja, editando){
 const d=v2074_load(); loja=loja||{}; const id=loja.id||'novo';
 const analistaAtual=loja.analistaId||loja.analistaUsuario||loja.analista||loja.analistaResponsavel||'';
 const propAtual=loja.proprietarioId||loja.proprietario||''; const logoAtual=loja.logo||loja.logoUrl||'';
 return v2074_page(req, editando?'Editar loja':'Nova loja',`
 <div class="bar loja-topbar"><h2>${editando?'✏️ Editar loja':'➕ Nova loja'}</h2><div><a class="btn secondary" href="/lojas?todos=1">Lista de lojas</a><a class="btn secondary" href="javascript:history.back()">Voltar</a></div></div>
 ${v2074_pdfBox(id)}
 <form class="card loja-cadastro-form" method="post" action="${editando?`/lojas/${loja.id}/editar`:'/lojas/novo'}" enctype="multipart/form-data">
  <section class="loja-section"><h3>🏬 Dados principais</h3><div class="loja-grid">
   <label>Código/Filial<input name="codigo" value="${v2074_esc(loja.codigo||loja.filial||'')}" placeholder="Ex: 001"></label>
   <label>Nome loja<input name="nome" list="listaLojasCadastro" value="${v2074_esc(loja.nome||loja.loja||'')}" required placeholder="Ex: MEGA VEST CASA PRAIA GRANDE - SP"></label>
   <label>CNPJ<input name="cnpj" value="${v2074_esc(loja.cnpj||'')}" placeholder="00.000.000/0000-00"></label>
   <label>Inscrição Estadual<input name="ie" value="${v2074_esc(loja.ie||loja.inscricaoEstadual||'')}"></label>
  </div></section>
  <section class="loja-section"><h3>📍 Endereço e localização</h3><div class="loja-grid">
   <label>CEP<input name="cep" value="${v2074_esc(loja.cep||'')}"></label>
   <label>Estado/UF<input name="uf" list="listaUF" value="${v2074_esc(loja.uf||loja.estado||'')}"></label>
   <label>Cidade<input name="cidade" list="listaCidadesCadastro" value="${v2074_esc(loja.cidade||'')}"></label>
   <label>Endereço<input name="endereco" value="${v2074_esc(loja.endereco||'')}"></label>
   <label>Latitude<input name="latitude" value="${v2074_esc(loja.latitude||'')}"></label>
   <label>Longitude<input name="longitude" value="${v2074_esc(loja.longitude||'')}"></label>
  </div></section>
  <section class="loja-section"><h3>👤 Responsáveis e vínculos</h3><div class="loja-grid">
   <label>Responsável loja<input name="responsavel" value="${v2074_esc(loja.responsavel||loja.responsavelLoja||'')}"></label>
   <label>Telefone<input name="telefone" value="${v2074_esc(loja.telefone||'')}"></label>
   <label>WhatsApp responsável<input name="whatsapp" value="${v2074_esc(loja.whatsapp||loja.whatsappResponsavel||'')}"></label>
   <label>Analista responsável<select name="analistaId"><option value="">Sem analista vinculado</option>${v2074_analistas(d, analistaAtual)}</select></label>
   <label>Proprietário cadastrado<select name="proprietarioId"><option value="">Sem proprietário vinculado</option>${v2074_proprietarios(d, propAtual)}</select></label>
   <label>Ativo<select name="ativo"><option value="SIM" ${v2074_sel(loja.ativo||'SIM','SIM')}>SIM</option><option value="NÃO" ${v2074_sel(loja.ativo,'NÃO')}>NÃO</option></select></label>
  </div></section>
  <section class="loja-section"><h3>🖼️ Logo</h3><div class="loja-grid">
   <label>Enviar logo<input type="file" name="logo" accept="image/*"></label><label>Cartão CNPJ<input type="file" name="cartaoCnpj" accept="application/pdf,image/*"></label><label>Fotos<input type="file" name="fotos" multiple accept="image/*,application/pdf"></label>
   <label>Reutilizar logo<select name="reutilizarLogo"><option value="">Não alterar</option>${v2074_logoOptions(d, logoAtual)}</select></label>
   <label>Logo URL<input name="logoUrl" value="${v2074_esc(loja.logoUrl||'')}"></label>
   <div class="logo-preview">${logoAtual?`<img src="${v2074_esc(logoAtual)}" alt="Logo atual">`:'<span>Sem logo atual</span>'}</div><div class="hint"><b>Arquivos salvos:</b> ${loja.cartaoCnpj?`<a class="btn small" href="/lojas/${loja.id}/cartao-cnpj" target="_blank">Abrir cartão CNPJ</a>`:''} ${(loja.fotos||[]).map((f,i)=>`<a class="btn small" href="/lojas/${loja.id}/foto/${i}" target="_blank">Foto ${i+1}</a>`).join(' ')}</div>
  </div></section>
  <section class="loja-section"><h3>🕒 Horários</h3><div class="loja-grid">
   <label>Segunda a sexta<input name="horarioSemana" value="${v2074_esc(loja.horarioSemana||'')}" placeholder="08:00 às 18:00"></label>
   <label>Sábado<input name="horarioSabado" value="${v2074_esc(loja.horarioSabado||'')}" placeholder="08:00 às 12:00"></label>
   <label>Domingo/Feriado<input name="horarioDomingo" value="${v2074_esc(loja.horarioDomingo||'')}" placeholder="Fechado"></label><label>Domingo/Feriado abre<input type="time" name="horaDomAbre" value="${v2074_esc(loja.horaDomAbre||'')}"></label><label>Domingo/Feriado fecha<input type="time" name="horaDomFecha" value="${v2074_esc(loja.horaDomFecha||'')}"></label>
  </div></section>
  <section class="loja-section"><h3>🚚 Logística automática</h3><div class="loja-grid">
   <label>KM atendido/raio<input name="kmAtendido" value="${v2074_esc(loja.kmAtendido||loja.km||'')}"></label>
   <label>Tipo serviço padrão<input name="tipoServicoPadrao" list="listaServicosCadastro" value="${v2074_esc(loja.tipoServicoPadrao||'')}"></label>
   <label>Observação logística<input name="obsLogistica" value="${v2074_esc(loja.obsLogistica||'')}"></label>
  </div></section>
  <datalist id="listaLojasCadastro">${v2074_arr(d,'lojas').map(l=>`<option value="${v2074_esc(l.nome||l.loja||'')}">`).join('')}</datalist>
  <datalist id="listaCidadesCadastro">${[...new Set(v2074_arr(d,'lojas').map(l=>l.cidade).filter(Boolean))].map(c=>`<option value="${v2074_esc(c)}">`).join('')}</datalist>
  <datalist id="listaServicosCadastro">${[...new Set(v2074_arr(d,'prestadores').map(p=>p.tipoServico||p.servico).filter(Boolean))].map(s=>`<option value="${v2074_esc(s)}">`).join('')}</datalist>
  <datalist id="listaUF">${['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(u=>`<option value="${u}">`).join('')}</datalist>
  <div class="loja-actions"><button type="submit">💾 Salvar loja</button><a class="btn secondary" href="/lojas?todos=1">Cancelar / Voltar</a></div>
 </form>`);
}
app.get('/lojas/novo', auth, (req,res)=>res.send(v2074_lojaFormulario(req, {}, false)));
app.get('/lojas/:id/editar', auth, (req,res)=>{ const d=v2074_load(); const loja=v2074_arr(d,'lojas').find(l=>String(l.id)===String(req.params.id)) || {id:req.params.id}; res.send(v2074_lojaFormulario(req, loja, true)); });
app.post('/lojas/novo', auth, upload.any(), async (req,res)=>{ const d=v2074_load(); const usuarios=v2074_arr(d,'usuarios'), props=v2074_arr(d,'proprietarios'); const u=usuarios.find(x=>String(x.id||x.usuario||x.nome)===String(req.body.analistaId||''))||{}; const p=props.find(x=>String(x.id||x.nome)===String(req.body.proprietarioId||''))||{}; const obj={id:v2074_next(d,'loja'),...req.body}; v20822_nomeLojaFinal(req.body,obj,d); obj.analista=u.nome||u.usuario||req.body.analista||''; obj.analistaUsuario=u.usuario||''; obj.proprietario=p.nome||req.body.proprietario||''; obj.criadoEm=new Date().toISOString(); v20822_salvarArquivosLoja(req,obj,d); v2074_arr(d,'lojas').push(obj); await v2074_save(d); res.redirect(`/lojas/${obj.id}/editar?salvo=1`); });
app.post('/lojas/:id/editar', auth, upload.any(), async (req,res)=>{ const d=v2074_load(); const arr=v2074_arr(d,'lojas'); let loja=arr.find(l=>String(l.id)===String(req.params.id)); if(!loja){ loja={id:req.params.id}; arr.push(loja); } const usuarios=v2074_arr(d,'usuarios'), props=v2074_arr(d,'proprietarios'); const u=usuarios.find(x=>String(x.id||x.usuario||x.nome)===String(req.body.analistaId||''))||{}; const p=props.find(x=>String(x.id||x.nome)===String(req.body.proprietarioId||''))||{}; Object.assign(loja, req.body); v20822_nomeLojaFinal(req.body,loja,d); loja.analista=u.nome||u.usuario||req.body.analista||loja.analista||''; loja.analistaUsuario=u.usuario||loja.analistaUsuario||''; loja.proprietario=p.nome||req.body.proprietario||loja.proprietario||''; loja.atualizadoEm=new Date().toISOString(); v20822_salvarArquivosLoja(req,loja,d); await v2074_save(d); res.redirect(`/lojas/${loja.id}/editar?salvo=1`); });

app.get('/lojas/novo', auth, (req,res)=>res.send(v2073_lojaForm(req, {}, 'new')));
app.get('/lojas/:id/editar', auth, (req,res)=>{ const d=v2073_load(); const loja=v2073_arr(d,'lojas').find(l=>String(l.id)===String(req.params.id))||{id:req.params.id}; res.send(v2073_lojaForm(req, loja, 'edit')); });
app.post('/lojas/novo', auth, upload.any(), async (req,res)=>{ const d=v2073_load(); const f=v2073_file(req); const usuarios=v2073_arr(d,'usuarios'), props=v2073_arr(d,'proprietarios'); const u=usuarios.find(x=>String(x.id||x.usuario||x.nome)===String(req.body.analistaId||''))||{}; const p=props.find(x=>String(x.id||x.nome)===String(req.body.proprietarioId||''))||{}; const obj={id:v2073_next(d,'loja'),...req.body,logo:req.body.reutilizarLogo||(f?v2073_pub(f):''),analista:u.nome||u.usuario||req.body.analistaId||'',proprietario:p.nome||req.body.proprietarioId||'',criadoEm:new Date().toISOString()}; v2073_arr(d,'lojas').push(obj); await v2073_save(d); res.redirect('/lojas?todos=1'); });
app.post('/lojas/:id/editar', auth, upload.any(), async (req,res)=>{ const d=v2073_load(); const arr=v2073_arr(d,'lojas'); let loja=arr.find(l=>String(l.id)===String(req.params.id)); if(!loja){loja={id:req.params.id}; arr.push(loja);} const f=v2073_file(req); const usuarios=v2073_arr(d,'usuarios'), props=v2073_arr(d,'proprietarios'); const u=usuarios.find(x=>String(x.id||x.usuario||x.nome)===String(req.body.analistaId||''))||{}; const p=props.find(x=>String(x.id||x.nome)===String(req.body.proprietarioId||''))||{}; Object.assign(loja, req.body); if(req.body.reutilizarLogo) loja.logo=req.body.reutilizarLogo; if(f) loja.logo=v2073_pub(f); loja.analista=u.nome||u.usuario||req.body.analistaId||''; loja.proprietario=p.nome||req.body.proprietarioId||''; loja.atualizadoEm=new Date().toISOString(); await v2073_save(d); res.redirect('/lojas?todos=1'); });

app.get('/lojas/novo', auth, (req,res)=>{
 const d=v2071_load(); const logos=v2071_arr(d,'lojas').filter(l=>l.logo).map(l=>`<option value="${v2071_esc(l.logo)}">${v2071_esc(l.nome||l.loja||l.id)}</option>`).join('');
 res.send(v2071_page(req,'Nova loja',`<h2>Nova loja</h2>${v2071_pdfBlock('loja','novo')}<form class="card" method="post" action="/lojas/novo" enctype="multipart/form-data"><label>Código/Filial<input name="codigo"></label><label>Nome<input name="nome"></label><label>CNPJ<input name="cnpj"></label><label>CEP<input name="cep"></label><label>UF<input name="uf"></label><label>Cidade<input name="cidade"></label><label>Endereço<input name="endereco"></label><label>Responsável<input name="responsavel"></label><label>WhatsApp<input name="whatsapp"></label><label>Latitude<input name="latitude"></label><label>Longitude<input name="longitude"></label><label>Logo<input type="file" name="logo" accept="image/*"></label><label>Reutilizar logo<select name="reutilizarLogo"><option value="">Não alterar</option>${logos}</select></label><button>💾 Salvar</button></form>`));
});
app.post('/lojas/novo', auth, upload.any(), async (req,res)=>{
 const d=v2071_load(); const f=v2071_file(req);
 const obj={id:v2071_next(d,'loja'),...req.body,logo:req.body.reutilizarLogo|| (f?v2071_pub(f):'')};
 v2071_arr(d,'lojas').push(obj); await v2071_save(d); res.redirect('/lojas?todos=1');
});

function v2071_cleanNomeEmpresa(nome,cidade,uf,d){
 let base=(d.config||{}).nomeBaseFilial||'MEGA VEST CASA';
 nome=v2071_norm(nome).replace(/\bLTDA\b|\bLIMITADA\b|\bME\b|\bEPP\b/g,'').trim();
 if(v2071_norm(nome).includes(v2071_norm(base))) return `${base} ${cidade||''} - ${uf||''}`.replace(/\s+/g,' ').trim();
 return `${nome||base} ${cidade||''}${uf?' - '+uf:''}`.replace(/\s+/g,' ').trim();
}
async function v2071_readPdf(file){
 const buf=file.buffer||fs.readFileSync(file.path); let text='';
 try{const mod=await import('pdf-parse/lib/pdf-parse.js');const pdf=mod.default||mod;text=(await pdf(buf)).text||''}
 catch(e){const mod=await import('pdf-parse');const pdf=mod.default||mod;text=(await pdf(buf)).text||''}
 function after(label){const r=new RegExp(label+'\\s*[:\\-]?\\s*([^\\n]+)','i');const m=text.match(r);return m?m[1].trim():''}
 const cnpj=v2071_digits((text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)||[''])[0]);
 const cep=v2071_digits((text.match(/\d{5}-?\d{3}/)||[''])[0]);
 let nome=after('NOME\\s+EMPRESARIAL')||after('RAZ[ÃA]O\\s+SOCIAL')||after('NOME\\s+DE\\s+FANTASIA');
 let cidade=(after('MUNIC[IÍ]PIO')||after('CIDADE')).replace(/\bUF\b.*$/i,'').replace(/\bENDERE[ÇC]O.*$/i,'').replace(/\bTELEFONE.*$/i,'').trim();
 let uf=((text.match(/UF\s*[:\-]?\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i)||text.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)||[])[1]||'').toUpperCase();
 let endereco=after('LOGRADOURO')||after('ENDERE[ÇC]O');
 return {nome,cnpj,cep,cidade,uf,endereco};
}
async function v2071_pdfEntity(req,res,tipo){
 const d=v2071_load(); const f=v2071_file(req);
 if(!f) return res.send(v2071_page(req,'PDF',`<div class="card"><h2>Nenhum PDF selecionado</h2><a class="btn" href="javascript:history.back()">Voltar</a></div>`));
 try{
   const info=await v2071_readPdf(f); const key=tipo==='loja'?'lojas':tipo==='prestador'?'prestadores':'proprietarios';
   if(req.params.id==='novo'){
     const obj={id:v2071_next(d,key.slice(0,-1)),nome: tipo==='loja'?v2071_cleanNomeEmpresa(info.nome,info.cidade,info.uf,d):info.nome,empresa:info.nome,cnpj:info.cnpj,cep:info.cep,cidade:info.cidade,uf:info.uf,endereco:info.endereco,cartaoCnpj:v2071_pub(f)};
     v2071_arr(d,key).push(obj); await v2071_save(d);
     return res.redirect(`/${key}/${obj.id}/editar`);
   }
   const arr=v2071_arr(d,key); let obj=arr.find(x=>String(x.id)===String(req.params.id));
   if(obj){ if(tipo==='loja') obj.nome=v2071_cleanNomeEmpresa(info.nome,info.cidade,info.uf,d); else {obj.nome=info.nome||obj.nome; obj.empresa=info.nome||obj.empresa}
     Object.assign(obj,{cnpj:info.cnpj||obj.cnpj,cep:info.cep||obj.cep,cidade:info.cidade||obj.cidade,uf:info.uf||obj.uf,endereco:info.endereco||obj.endereco,cartaoCnpj:v2071_pub(f)});
     await v2071_save(d); return res.redirect(`/${key}/${obj.id}/editar`);
   }
   res.redirect('/'+key);
 }catch(e){res.send(v2071_page(req,'Erro PDF',`<div class="card"><h2>Erro ao pesquisar PDF</h2><p>${v2071_esc(e.message||String(e))}</p><a class="btn" href="javascript:history.back()">Voltar</a></div>`))}
}
app.post('/loja-pdf/:id', auth, upload.any(), (req,res)=>v2071_pdfEntity(req,res,'loja'));
app.post('/v159/loja-pdf/:id', auth, upload.any(), (req,res)=>v2071_pdfEntity(req,res,'loja'));
app.post('/prestador-pdf/:id', auth, upload.any(), (req,res)=>v2071_pdfEntity(req,res,'prestador'));
app.post('/proprietario-pdf/:id', auth, upload.any(), (req,res)=>v2071_pdfEntity(req,res,'proprietario'));

app.get('/api/version',(req,res)=>res.json({version:'V20.8.22',ok:true}));

app.get('/lojas',auth,need('LOJAS'),crudList('lojas','Lojas',[['nome','Nome'],['codigo','Código'],['cidade','Cidade'],['uf','UF'],['cnpj','CNPJ']]));
app.get('/lojas/novo',auth,need('LOJAS'),(req,res)=>res.send(page(req,'Lojas',bar('Nova loja')+`<details open class="card"><summary>📄 Importar dados por PDF/cartão CNPJ</summary><form class="loading-form" method="post" action="/loja-pdf-nova" enctype="multipart/form-data"><input type="file" name="pdf" accept="application/pdf" required><button>🔎 Pesquisar PDF e criar loja</button></form><p>Regra: ${esc(load().config.nomeBaseFilial||'MEGA VEST CASA')} + CIDADE - UF.</p></details>`+lojaForm({}))));
app.post('/lojas/novo',auth,need('LOJAS'),upload.any(),async(req,res)=>{const d=load();const logo=fileData((req.files||[]).find(f=>f.fieldname==='logo'));d.lojas.push({id:next(d,'loja'),...req.body,logo});await save(d);res.redirect('/lojas')});
app.get('/lojas/:id/editar',auth,need('LOJAS'),(req,res)=>{const d=load(),l=d.lojas.find(x=>String(x.id)===req.params.id)||{};res.send(page(req,'Editar loja',bar('Editar loja')+`<details open class="card"><summary>📄 Preencher por PDF/cartão CNPJ</summary><form class="loading-form" method="post" action="/loja-pdf/${l.id}" enctype="multipart/form-data"><input type="file" name="pdf" accept="application/pdf" required><button>🔎 Pesquisar PDF</button></form><p>Regra atual: ${esc(d.config.nomeBaseFilial)} + CIDADE + UF.</p></details>`+lojaForm(l)))})
app.post('/lojas/:id/editar',auth,need('LOJAS'),upload.any(),async(req,res)=>{const d=load(),l=d.lojas.find(x=>String(x.id)===req.params.id); if(l){Object.assign(l,req.body); const lf=(req.files||[]).find(f=>f.fieldname==='logo'); const img=fileData(lf); if(img)l.logo=img; if(req.body.reutilizarLogo){const r=d.lojas.find(x=>String(x.id)===String(req.body.reutilizarLogo)); if(r?.logo)l.logo=r.logo}} await save(d);res.redirect('/lojas')});
app.post('/loja-pdf/:id',auth,need('LOJAS'),upload.any(),(req,res)=>pdfEntity(req,res,'loja','lojas','lojas'));
app.post('/v159/loja-pdf/:id',auth,need('LOJAS'),upload.any(),(req,res)=>pdfEntity(req,res,'loja','lojas','lojas'));
function lojaForm(l){const d=load();return `<form class="card form" method="post" enctype="multipart/form-data"><label>Código/Filial<input name="codigo" value="${esc(l.codigo||'')}"></label><label>Nome<input name="nome" list="dl-lojas" value="${esc(l.nome||'')}"></label><label>CNPJ<input name="cnpj" value="${esc(l.cnpj||'')}"></label><label>CEP<input name="cep" value="${esc(l.cep||'')}"></label><label>UF<input name="uf" value="${esc(l.uf||l.estado||'')}"></label><label>Cidade<input name="cidade" value="${esc(l.cidade||'')}"></label><label>Endereço<input name="endereco" value="${esc(l.endereco||'')}"></label><label>Responsável<input name="responsavel" value="${esc(l.responsavel||'')}"></label><label>WhatsApp<input name="whatsapp" value="${esc(l.whatsapp||'')}"></label><label>Latitude<input name="latitude" value="${esc(l.latitude||'')}"></label><label>Longitude<input name="longitude" value="${esc(l.longitude||'')}"></label><label>Logo<input type="file" name="logo" accept="image/*"></label><label>Reutilizar logo<select name="reutilizarLogo"><option value="">Não alterar</option>${d.lojas.filter(x=>x.logo).map(x=>`<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select></label>${l.logo?`<img class="preview" src="${l.logo}">`:''}<button>💾 Salvar</button>${datalist('dl-lojas',d.lojas,x=>x.nome)}</form>`}

app.get('/prestadores',auth,need('PRESTADORES'),crudList('prestadores','Prestadores',[['empresa','Empresa'],['nome','Nome'],['cidade','Cidade'],['servicos','Serviços'],['valorKm','R$/km']]));
app.get('/prestadores/novo',auth,need('PRESTADORES'),(req,res)=>res.send(page(req,'Prestadores',bar('Novo prestador')+`<details open class="card"><summary>📄 Importar dados por PDF/cartão CNPJ</summary><form class="loading-form" method="post" action="/prestador-pdf-novo" enctype="multipart/form-data"><input type="file" name="pdf" accept="application/pdf" required><button>🔎 Pesquisar PDF e criar prestador</button></form></details>`+prestForm({}))));
app.post('/prestadores/novo',auth,need('PRESTADORES'),upload.any(),async(req,res)=>{const d=load();d.prestadores.push({id:next(d,'prestador'),...req.body});await save(d);res.redirect('/prestadores')});
app.get('/prestadores/:id/editar',auth,need('PRESTADORES'),(req,res)=>{const p=load().prestadores.find(x=>String(x.id)===req.params.id)||{};res.send(page(req,'Prestadores',bar('Editar prestador')+`<details open class="card"><summary>PDF/cartão CNPJ</summary><form class="loading-form" method="post" action="/prestador-pdf/${p.id}" enctype="multipart/form-data"><input type="file" name="pdf" accept="application/pdf" required><button>Pesquisar PDF</button></form></details>`+prestForm(p)))})
app.post('/prestadores/:id/editar',auth,need('PRESTADORES'),async(req,res)=>{const d=load(),p=d.prestadores.find(x=>String(x.id)===req.params.id);if(p)Object.assign(p,req.body);await save(d);res.redirect('/prestadores')});
app.post('/prestador-pdf/:id',auth,need('PRESTADORES'),upload.any(),(req,res)=>pdfEntity(req,res,'prestador','prestadores','prestadores'));
function prestForm(p){return `<form class="card form" method="post"><label>Empresa<input name="empresa" list="dl-prest" value="${esc(p.empresa||'')}"></label><label>Nome<input name="nome" value="${esc(p.nome||'')}"></label><label>CNPJ<input name="cnpj" value="${esc(p.cnpj||'')}"></label><label>Telefone<input name="telefone" value="${esc(p.telefone||'')}"></label><label>WhatsApp<input name="whatsapp" value="${esc(p.whatsapp||'')}"></label><label>Cidade<input name="cidade" value="${esc(p.cidade||'')}"></label><label>UF<input name="uf" value="${esc(p.uf||'')}"></label><label>Tipos de serviço<input name="servicos" list="dl-serv" value="${esc(p.servicos||'')}"></label><label>Valor por KM<input name="valorKm" value="${esc(p.valorKm||'')}"></label><label>Banco/PIX<input name="pix" value="${esc(p.pix||'')}"></label><button>Salvar</button>${datalist('dl-prest',load().prestadores,x=>x.empresa||x.nome)}${datalist('dl-serv',load().tiposServico,x=>x.descricao)}</form>`}

app.get('/proprietarios',auth,need('PROPRIETARIOS'),crudList('proprietarios','Proprietários',[['nome','Nome'],['cnpj','CPF/CNPJ'],['telefone','Telefone'],['email','Email']]));
app.get('/proprietarios/novo',auth,need('PROPRIETARIOS'),(req,res)=>res.send(page(req,'Proprietários',bar('Novo proprietário')+`<details open class="card"><summary>📄 Importar dados por PDF/cartão CNPJ</summary><form class="loading-form" method="post" action="/proprietario-pdf-novo" enctype="multipart/form-data"><input type="file" name="pdf" accept="application/pdf" required><button>🔎 Pesquisar PDF e criar proprietário</button></form></details>`+propForm({}))));
app.post('/proprietarios/novo',auth,need('PROPRIETARIOS'),upload.any(),async(req,res)=>{const d=load();d.proprietarios.push({id:next(d,'proprietario'),...req.body});await save(d);res.redirect('/proprietarios')});
app.get('/proprietarios/:id/editar',auth,need('PROPRIETARIOS'),(req,res)=>{const p=load().proprietarios.find(x=>String(x.id)===req.params.id)||{};res.send(page(req,'Proprietários',bar('Editar proprietário')+`<details open class="card"><summary>PDF/cartão CNPJ</summary><form class="loading-form" method="post" action="/proprietario-pdf/${p.id}" enctype="multipart/form-data"><input type="file" name="pdf" accept="application/pdf" required><button>Pesquisar PDF</button></form></details>`+propForm(p)))})
app.post('/proprietarios/:id/editar',auth,need('PROPRIETARIOS'),async(req,res)=>{const d=load(),p=d.proprietarios.find(x=>String(x.id)===req.params.id);if(p)Object.assign(p,req.body);await save(d);res.redirect('/proprietarios')});
app.post('/proprietario-pdf/:id',auth,need('PROPRIETARIOS'),upload.any(),(req,res)=>pdfEntity(req,res,'proprietario','proprietarios','proprietarios'));
function propForm(p){return `<form class="card form" method="post"><label>Nome<input name="nome" list="dl-prop" value="${esc(p.nome||'')}"></label><label>CPF/CNPJ<input name="cnpj" value="${esc(p.cnpj||p.documento||'')}"></label><label>Telefone<input name="telefone" value="${esc(p.telefone||'')}"></label><label>Email<input name="email" value="${esc(p.email||'')}"></label><label>Endereço<input name="endereco" value="${esc(p.endereco||'')}"></label><button>Salvar</button>${datalist('dl-prop',load().proprietarios,x=>x.nome)}</form>`}

app.get('/chamados',auth,need('CHAMADOS'),crudList('chamados','Chamados',[['numeroInterno','Nº'],['lojaNome','Loja'],['prestadorNome','Prestador'],['tipoServico','Serviço'],['status','Status']]));
app.get('/chamados/analista',auth,need('CHAMADOS'),(req,res)=>{const d=load();const analista=req.query.analista||'TODOS';const q=norm(req.query.q||'');let lojas=d.lojas.slice();if(analista&&analista!=='TODOS')lojas=lojas.filter(l=>norm(l.analista||l.analistaResponsavel||'')===norm(analista));if(q)lojas=lojas.filter(l=>norm(JSON.stringify(l)).includes(q));const opts=['TODOS',...d.usuarios.filter(u=>u.analista!==false).map(u=>u.nome||u.usuario)].map(a=>`<option ${String(a)===String(analista)?'selected':''}>${esc(a)}</option>`).join('');const rows=lojas.map(l=>`<tr><td>${esc(l.nome||'')}</td><td>${esc(l.codigo||'')}</td><td>${esc(l.cidade||'')}</td><td>${esc(l.uf||l.estado||'')}</td><td>${esc(l.analista||l.analistaResponsavel||'SEM ANALISTA')}</td><td>${esc(l.whatsapp||'')}</td></tr>`).join('')||'<tr><td colspan=6>Nenhuma loja encontrada.</td></tr>';res.send(page(req,'Lojas por Analista',bar('Lojas por Analista')+`<div class="card no-print"><form method="get" class="search"><label>Analista<select name="analista">${opts}</select></label><input name="q" list="dl-lojas-analista" placeholder="Buscar loja/cidade..." value="${esc(req.query.q||'')}"><button>Pesquisar</button><a class="btn secondary" href="/chamados/analista?analista=TODOS">Mostrar todos</a><button type="button" onclick="print()">🖨️ Imprimir lista</button></form>${datalist('dl-lojas-analista',d.lojas,x=>x.nome+' - '+(x.cidade||''))}</div><div class="card"><h2>Lista de lojas</h2><table><thead><tr><th>Loja</th><th>Código</th><th>Cidade</th><th>UF</th><th>Analista</th><th>WhatsApp</th></tr></thead><tbody>${rows}</tbody></table></div>`))});
app.get('/solicitar-chamado',auth,(req,res)=>res.redirect('/chamados/rapido'));
app.get('/chamados/rapido',auth,need('CHAMADOS'),(req,res)=>res.send(page(req,'Chamado rápido',bar('Criar chamado rápido')+chamadoForm({},true))));
app.post('/chamados/rapido',auth,need('CHAMADOS'),async(req,res)=>saveChamado(req,res));
app.get('/chamados/novo',auth,need('CHAMADOS'),(req,res)=>res.send(page(req,'Chamado completo',bar('Abrir chamado completo')+chamadoForm({},false))));
app.post('/chamados/novo',auth,need('CHAMADOS'),async(req,res)=>saveChamado(req,res));
app.get('/chamados/:id/editar',auth,need('CHAMADOS'),(req,res)=>{const c=load().chamados.find(x=>String(x.id)===req.params.id)||{};res.send(page(req,'Chamado',bar('Editar chamado')+chamadoForm(c,false)))})
app.post('/chamados/:id/editar',auth,need('CHAMADOS'),async(req,res)=>saveChamado(req,res,req.params.id));
async function saveChamado(req,res,id){const d=load(); let c=id?d.chamados.find(x=>String(x.id)===String(id)):null; if(!c){c={id:next(d,'chamado'),numeroInterno:next(d,'numeroChamado'),dataAbertura:today(),abertoPor:userName(req)};d.chamados.push(c)} Object.assign(c,req.body); const l=d.lojas.find(x=>String(x.id)===String(req.body.lojaId)); if(l)c.lojaNome=l.nome; const p=d.prestadores.find(x=>String(x.id)===String(req.body.prestadorId)); if(p)c.prestadorNome=p.empresa||p.nome; if(!c.status)c.status='ABERTO'; await save(d); res.redirect('/chamados')}
function chamadoForm(c,rapido){const d=load();return `<form class="card form" method="post"><label>Loja<select name="lojaId"><option></option>${d.lojas.map(l=>`<option value="${l.id}" ${String(c.lojaId)===String(l.id)?'selected':''}>${esc(l.nome)}</option>`).join('')}</select></label>${!rapido?`<label>Prestador<select name="prestadorId"><option></option>${d.prestadores.map(p=>`<option value="${p.id}" ${String(c.prestadorId)===String(p.id)?'selected':''}>${esc(p.empresa||p.nome)}</option>`).join('')}</select></label>`:''}<label>Tipo serviço<input name="tipoServico" list="dl-servico" value="${esc(c.tipoServico||'A DEFINIR')}"></label><label>Prioridade<select name="prioridade"><option ${sel(c.prioridade,'MÍNIMA')}>MÍNIMA</option><option ${sel(c.prioridade,'MÉDIA')}>MÉDIA</option><option ${sel(c.prioridade,'MÁXIMA')}>MÁXIMA</option></select></label>${!rapido?`<label>Status<input name="status" list="dl-status" value="${esc(c.status||'ABERTO')}"></label><label>Data abertura<input type="date" name="dataAbertura" value="${esc(c.dataAbertura||today())}"></label><label>Data agendamento<input type="date" name="dataAgendada" value="${esc(c.dataAgendada||'')}"></label><label>Data aprovado financeiro<input type="date" name="dataAprovadoFinanceiro" value="${esc(c.dataAprovadoFinanceiro||'')}"></label><label>Data subiu financeiro<input type="date" name="dataSubiuFinanceiro" value="${esc(c.dataSubiuFinanceiro||'')}"></label><label>Data pagar prestador<input type="date" name="dataPagarPrestador" value="${esc(c.dataPagarPrestador||'')}"></label><label>Valor<input name="valor" value="${esc(c.valor||'')}"></label>`:''}<label>Descrição<textarea name="descricao" required>${esc(c.descricao||'')}</textarea></label><label>Observações<textarea name="obs">${esc(c.obs||'')}</textarea></label><button>Salvar</button>${datalist('dl-servico',d.tiposServico,x=>x.descricao)}${datalist('dl-status',d.status,x=>x.descricao)}</form>`}


/* V20.6 Lembretes + Preventivas unidos */
function agendaForm206(k,x){const d=load();return `<form class="card form" method="post"><label>Descrição<input name="descricao" value="${esc(x.descricao||'')}" required></label><label>Data<input type="date" name="data" value="${esc(x.data||today())}"></label><label>Hora/Bipe<input type="time" name="hora" value="${esc(x.hora||'08:00')}"></label><label>Avisar antes dias<input type="number" name="avisarAntes" value="${esc(x.avisarAntes||0)}"></label><label>Fixar na inicial<select name="fixo"><option ${sel(x.fixo,'SIM')}>SIM</option><option ${sel(x.fixo,'NÃO')}>NÃO</option></select></label><label>Vincular chamado<select name="chamadoId"><option></option>${d.chamados.map(c=>`<option value="${c.id}" ${String(x.chamadoId)===String(c.id)?'selected':''}>${esc(c.numeroInterno||c.id)} - ${esc(c.lojaNome||'')}</option>`).join('')}</select></label><label>Usuário/Analista<select name="usuarioId"><option>TODOS</option>${d.usuarios.map(u=>`<option value="${u.id}" ${String(x.usuarioId)===String(u.id)?'selected':''}>${esc(u.nome)}</option>`).join('')}</select></label>${k==='preventivas'?`<label>Gerar lembrete automático?<select name="gerarLembrete"><option ${sel(x.gerarLembrete,'SIM')}>SIM</option><option ${sel(x.gerarLembrete,'NÃO')}>NÃO</option></select></label><label>Próxima data ao finalizar<input type="date" name="proximaData" value="${esc(x.proximaData||'')}"></label>`:''}<label>Observações<textarea name="obs">${esc(x.obs||'')}</textarea></label><button>Salvar</button></form>`}
function novoLembreteDaPreventiva(d,x){if((x.gerarLembrete||'SIM')==='NÃO')return; const base=x.proximaData||x.data; if(!base)return; const dt=new Date(base+'T00:00:00'); dt.setDate(dt.getDate()-Number(x.avisarAntes||0)); const data=dt.toISOString().slice(0,10); d.lembretes.push({id:next(d,'lembrete'),descricao:'Preventiva: '+(x.descricao||''),data,hora:x.hora||'08:00',fixo:'SIM',status:'ATIVO',chamadoId:x.chamadoId||'',usuarioId:x.usuarioId||'TODOS',obs:'Gerado automaticamente pela preventiva'})}
app.get('/preventivas',auth,(req,res)=>res.redirect('/lembretes?aba=preventivas'));
app.get('/lembretes',auth,need('LEMBRETES'),(req,res)=>{const d=load(); const lemb=d.lembretes.filter(x=>!closed(x)); const prev=d.preventivas.filter(x=>!closed(x)); const rowL=lemb.map(x=>`<tr><td>${esc(x.descricao)}</td><td>${esc(x.data)} ${esc(x.hora||'')}</td><td>${esc(x.status||'ATIVO')}</td><td><a class="btn small" href="/lembretes/${x.id}/editar">Editar</a><form method="post" action="/lembretes/${x.id}/finalizar"><button>Finalizar</button></form></td></tr>`).join('')||'<tr><td colspan=4>Nenhum lembrete ativo.</td></tr>'; const rowP=prev.map(x=>`<tr><td>${esc(x.descricao)}</td><td>${esc(x.data)} ${esc(x.hora||'')}</td><td>${esc(x.status||'ATIVO')}</td><td><a class="btn small" href="/lembretes/preventiva/${x.id}/editar">Editar</a><form method="post" action="/lembretes/preventiva/${x.id}/finalizar"><button>Finalizar</button></form></td></tr>`).join('')||'<tr><td colspan=4>Nenhuma preventiva ativa.</td></tr>'; res.send(page(req,'Lembretes/Preventivas',bar('📌 Lembretes e Preventivas')+`<div class="card"><a class="btn" href="/lembretes/novo">Novo lembrete</a> <a class="btn" href="/lembretes/preventiva/novo">Nova preventiva</a></div><div class="card"><h2>Lembretes ativos</h2><table><tr><th>Descrição</th><th>Data/hora</th><th>Status</th><th>Ações</th></tr>${rowL}</table></div><div class="card"><h2>Preventivas ativas</h2><table><tr><th>Descrição</th><th>Data/hora</th><th>Status</th><th>Ações</th></tr>${rowP}</table></div>`))});
app.get('/lembretes/novo',auth,need('LEMBRETES'),(req,res)=>res.send(page(req,'Novo lembrete',bar('Novo lembrete')+agendaForm206('lembretes',{}))));
app.post('/lembretes/novo',auth,need('LEMBRETES'),async(req,res)=>{const d=load();d.lembretes.push({id:next(d,'lembrete'),...req.body,status:'ATIVO'});await save(d);res.redirect('/lembretes')});
app.get('/lembretes/preventiva/novo',auth,need('PREVENTIVAS'),(req,res)=>res.send(page(req,'Nova preventiva',bar('Nova preventiva')+agendaForm206('preventivas',{}))));
app.post('/lembretes/preventiva/novo',auth,need('PREVENTIVAS'),async(req,res)=>{const d=load();const x={id:next(d,'preventiva'),...req.body,status:'ATIVO'};d.preventivas.push(x);novoLembreteDaPreventiva(d,x);await save(d);res.redirect('/lembretes')});
app.get('/lembretes/:id/editar',auth,need('LEMBRETES'),(req,res)=>{const x=load().lembretes.find(i=>String(i.id)===req.params.id)||{};res.send(page(req,'Editar lembrete',bar('Editar lembrete')+agendaForm206('lembretes',x)))});
app.post('/lembretes/:id/editar',auth,need('LEMBRETES'),async(req,res)=>{const d=load(),x=d.lembretes.find(i=>String(i.id)===req.params.id);if(x)Object.assign(x,req.body);await save(d);res.redirect('/lembretes')});
app.post('/lembretes/:id/finalizar',auth,need('LEMBRETES'),async(req,res)=>{const d=load(),x=d.lembretes.find(i=>String(i.id)===req.params.id);if(x){x.status='FINALIZADO';x.finalizadoEm=now()}await save(d);res.redirect('/lembretes')});
app.get('/lembretes/preventiva/:id/editar',auth,need('PREVENTIVAS'),(req,res)=>{const x=load().preventivas.find(i=>String(i.id)===req.params.id)||{};res.send(page(req,'Editar preventiva',bar('Editar preventiva')+agendaForm206('preventivas',x)))});
app.post('/lembretes/preventiva/:id/editar',auth,need('PREVENTIVAS'),async(req,res)=>{const d=load(),x=d.preventivas.find(i=>String(i.id)===req.params.id);if(x)Object.assign(x,req.body);await save(d);res.redirect('/lembretes')});
app.post('/lembretes/preventiva/:id/finalizar',auth,need('PREVENTIVAS'),async(req,res)=>{const d=load(),x=d.preventivas.find(i=>String(i.id)===req.params.id);if(x){x.status='FINALIZADO';x.finalizadoEm=now();novoLembreteDaPreventiva(d,x); if(x.proximaData){d.preventivas.push({id:next(d,'preventiva'),...x,id:next(d,'preventiva'),data:x.proximaData,status:'ATIVO',finalizadoEm:'',obs:'Gerada com base na preventiva anterior'})}}await save(d);res.redirect('/lembretes')});
function regAgenda(k,title){app.get('/'+k,auth,need(k==='lembretes'?'LEMBRETES':'PREVENTIVAS'),(req,res)=>{const d=load();const rows=d[k].map(x=>`<tr><td>${esc(x.descricao)}</td><td>${esc(x.data)} ${esc(x.hora||'')}</td><td>${esc(x.status||'ATIVO')}</td><td><a class="btn small" href="/${k}/${x.id}/editar">Editar</a><form method="post" action="/${k}/${x.id}/finalizar"><button>Finalizar</button></form></td></tr>`).join('')||'<tr><td colspan=4>Nenhum.</td></tr>';res.send(page(req,title,bar(title)+`<div class="card"><a class="btn" href="/${k}/novo">Novo</a><table><tr><th>Descrição</th><th>Data/hora</th><th>Status</th><th>Ações</th></tr>${rows}</table></div>`))});app.get('/'+k+'/novo',auth,(req,res)=>res.send(page(req,title,bar('Novo '+title)+agendaForm(k,{}))));app.post('/'+k+'/novo',auth,async(req,res)=>{const d=load();d[k].push({id:next(d,k==='lembretes'?'lembrete':'preventiva'),...req.body,status:req.body.status||'ATIVO'});await save(d);res.redirect('/'+k)});app.get('/'+k+'/:id/editar',auth,(req,res)=>{const x=load()[k].find(i=>String(i.id)===req.params.id)||{};res.send(page(req,title,bar('Editar '+title)+agendaForm(k,x)))});app.post('/'+k+'/:id/editar',auth,async(req,res)=>{const d=load(),x=d[k].find(i=>String(i.id)===req.params.id);if(x)Object.assign(x,req.body);await save(d);res.redirect('/'+k)});app.post('/'+k+'/:id/finalizar',auth,async(req,res)=>{const d=load(),x=d[k].find(i=>String(i.id)===req.params.id);if(x){x.status='FINALIZADO';x.finalizadoEm=now();if(k==='preventivas'){d.lembretes.push({id:next(d,'lembrete'),descricao:'Renovar preventiva: '+x.descricao,data:x.proximaData||x.data,hora:x.hora||'08:00',fixo:'SIM',status:'ATIVO',obs:'Gerado automaticamente pela preventiva finalizada'})}}await save(d);res.redirect('/'+k)})}
function agendaForm(k,x){const d=load();return `<form class="card form" method="post"><label>Descrição<input name="descricao" value="${esc(x.descricao||'')}"></label><label>Data<input type="date" name="data" value="${esc(x.data||today())}"></label><label>Hora/Bipe<input type="time" name="hora" value="${esc(x.hora||'08:00')}"></label><label>Avisar antes dias<input type="number" name="avisarAntes" value="${esc(x.avisarAntes||0)}"></label><label>Fixar na inicial<select name="fixo"><option ${sel(x.fixo,'SIM')}>SIM</option><option ${sel(x.fixo,'NÃO')}>NÃO</option></select></label><label>Vincular chamado<select name="chamadoId"><option></option>${d.chamados.map(c=>`<option value="${c.id}" ${String(x.chamadoId)===String(c.id)?'selected':''}>${esc(c.numeroInterno||c.id)} - ${esc(c.lojaNome||'')}</option>`).join('')}</select></label><label>Usuário/Analista<select name="usuarioId"><option>TODOS</option>${d.usuarios.map(u=>`<option value="${u.id}" ${String(x.usuarioId)===String(u.id)?'selected':''}>${esc(u.nome)}</option>`).join('')}</select></label>${k==='preventivas'?`<label>Gerar lembrete automático?<select name="gerarLembrete"><option ${sel(x.gerarLembrete,'SIM')}>SIM</option><option ${sel(x.gerarLembrete,'NÃO')}>NÃO</option></select></label><label>Próxima data ao finalizar<input type="date" name="proximaData" value="${esc(x.proximaData||'')}"></label>`:''}<label>Observações<textarea name="obs">${esc(x.obs||'')}</textarea></label><button>Salvar</button></form>`}
regAgenda('lembretes','📌 Lembretes'); regAgenda('preventivas','🗓️ Preventivas');
app.get('/api/lembretes-postit',auth,(req,res)=>{const d=load();res.send(d.lembretes.filter(l=>!closed(l)).slice(0,10).map(l=>`<a class="postit" href="/lembretes/${l.id}/editar"><b>${esc(l.descricao)}</b><br>${esc(l.data)} ${esc(l.hora||'')}<br>${esc(l.obs||'')}</a>`).join(''))});

app.get('/ponto-horas',auth,(req,res)=>{const d=load(),u=userName(req),ln=localNow();const aberto=d.pontos.find(p=>norm(p.usuario)===norm(u)&&p.data===ln.data&&!p.saida);const rows=d.pontos.slice().reverse().map(p=>`<tr><td>${esc(p.usuario)}</td><td>${esc(p.data)}</td><td>${esc(p.plantaoNumero)}</td><td>${esc(p.entrada)}</td><td>${esc(p.saida)}</td><td>${esc(p.duracao||dur(p.entrada,p.saida))}</td><td>${esc(p.status)}</td><td><a href="/ponto/${p.id}/editar">Editar</a></td></tr>`).join('');res.send(page(req,'Ponto',bar('⏱️ Ponto/Horas')+`<div class="card"><form method="post" action="/ponto/bater"><button class="btn-ponto">${aberto?'⏹️ Bater saída':'🟢 Bater entrada'}</button></form><a class="btn secondary" href="/ponto/extra">Lançar hora extra</a></div><div class="card"><table><tr><th>Usuário</th><th>Data</th><th>Plantão</th><th>Entrada</th><th>Saída</th><th>Duração</th><th>Status</th><th>Ações</th></tr>${rows}</table></div>`))});
app.post('/ponto/bater',auth,async(req,res)=>{const d=load(),u=userName(req),ln=localNow();const aberto=d.pontos.filter(p=>norm(p.usuario)===norm(u)&&p.data===ln.data&&!p.saida).pop(); if(aberto){aberto.saida=ln.hora;aberto.status='FECHADO';aberto.duracao=dur(aberto.entrada,aberto.saida)}else{const seq=d.pontos.filter(p=>norm(p.usuario)===norm(u)&&p.data===ln.data).length+1;d.pontos.push({id:next(d,'ponto'),usuario:u,data:ln.data,plantaoNumero:seq,entrada:ln.hora,saida:'',status:'ABERTO'})}await save(d);res.redirect('/ponto-horas')});
app.get('/ponto/:id/editar',auth,(req,res)=>{const p=load().pontos.find(x=>String(x.id)===req.params.id)||{};res.send(page(req,'Editar ponto',bar('Editar ponto')+`<form class="card form" method="post">${input('usuario',p.usuario)}${input('data',p.data,'date')}${input('entrada',p.entrada,'time')}${input('saida',p.saida,'time')}<label>Status<input name="status" value="${esc(p.status||'')}"></label><button>Salvar</button></form>`))});
app.post('/ponto/:id/editar',auth,async(req,res)=>{const d=load(),p=d.pontos.find(x=>String(x.id)===req.params.id);if(p){Object.assign(p,req.body);p.duracao=dur(p.entrada,p.saida)}await save(d);res.redirect('/ponto-horas')});
app.get('/ponto/extra',auth,(req,res)=>res.send(page(req,'Hora extra',bar('Lançar hora extra')+`<form class="card form" method="post"><label>Usuário<input name="usuario" value="${esc(userName(req))}"></label>${input('data',today(),'date')}${input('horaExtraInicial','','time')}${input('horaExtraFinal','','time')}<label>Observação<textarea name="obs"></textarea></label><button>Salvar</button></form>`)));
app.post('/ponto/extra',auth,async(req,res)=>{const d=load();d.pontos.push({id:next(d,'ponto'),...req.body,status:'HORA EXTRA'});await save(d);res.redirect('/ponto-horas')});


app.get('/api/logistica/sugerir',auth,(req,res)=>{const d=load();const loja=d.lojas.find(l=>String(l.id)===String(req.query.lojaId))||{};const serv=norm(req.query.servico||'');const cidade=norm(loja.cidade),uf=norm(loja.uf||loja.estado);const out=d.prestadores.filter(p=>{const ps=norm(p.servicos||p.tipoServico||'');const pc=norm(p.cidade),pu=norm(p.uf||p.estado);return (!serv||ps.includes(serv)||serv.includes(ps))&&(!cidade||pc===cidade||pu===uf||Number(p.kmAtendido||p.km||0)>0)}).map(p=>({id:p.id,nome:p.empresa||p.nome,cidade:p.cidade,uf:p.uf,servicos:p.servicos,kmAtendido:p.kmAtendido||p.km||'',valorKm:p.valorKm||''}));res.json(out)});
app.get('/os/nova',auth,need('OS'),(req,res)=>{const d=load(); const groups={}; for(const c of d.chamados.filter(c=>!closed(c))){const k=(c.lojaNome||'SEM LOJA')+'||'+(c.prestadorNome||'SEM PRESTADOR');(groups[k]=groups[k]||[]).push(c)} const html=Object.entries(groups).map(([k,arr])=>{const [loja,prest]=k.split('||'),total=arr.reduce((s,c)=>s+(Number(c.valor)||0),0);return `<form class="card os-group" method="post" action="/os/gerar"><div class="os-head"><b>Loja:</b> ${esc(loja)} <b>Prestador:</b> ${esc(prest)} <b>${arr.length} chamado(s)</b> ${money(total)} <button>🖨️ Imprimir selecionados</button><button formaction="/os/fechar-selecionados">✅ Fechar selecionados</button></div><table><tr><th>Sel.</th><th>Chamado</th><th>Descrição</th><th>Status</th><th>Valor</th><th>Ação</th></tr>${arr.map(c=>`<tr><td><input type="checkbox" name="chamados" value="${c.id}"></td><td>${esc(c.numeroInterno)}</td><td>${esc(c.descricao)}</td><td>${esc(c.status)}</td><td>${money(c.valor)}</td><td><a class="btn small" href="/os-impressao/${c.id}">Imprimir</a></td></tr>`).join('')}</table></form>`}).join('')||'<div class="card">Nenhum chamado aberto.</div>';res.send(page(req,'OS',bar('Gerar/Imprimir O.S.')+html))});
app.post('/os/fechar-selecionados',auth,async(req,res)=>{const d=load(),ids=[].concat(req.body.chamados||[]).map(String);for(const c of d.chamados.filter(c=>ids.includes(String(c.id)))){c.status='FINALIZADO';c.dataFinalizada=today();c.fechadoPor=userName(req)}await save(d);res.redirect('/os/nova')});
app.post('/os/gerar',auth,(req,res)=>{const id=[].concat(req.body.chamados||[])[0];res.redirect('/os-impressao/'+id)});
app.get('/os-impressao/:id',auth,(req,res)=>{const d=load(),c=d.chamados.find(x=>String(x.id)===req.params.id)||{},l=d.lojas.find(x=>String(x.id)===String(c.lojaId))||{},p=d.prestadores.find(x=>String(x.id)===String(c.prestadorId))||{},u=d.usuarios.find(x=>norm(x.nome)===norm(c.analista)||norm(x.usuario)===norm(c.analista))||user(req)||{};const logo=(l.logo&&d.config.logoOs!=='LOGO DO SISTEMA')?l.logo:(d.config.logoLocal||d.config.logoUrl||'');res.send(page(req,'O.S. Impressão',`<div class="print-actions"><button onclick="print()">Imprimir</button><a class="btn" href="/os-impressao/${c.id}?semvalor=1">Imprimir sem valor</a><a class="btn secondary" href="javascript:history.back()">Voltar</a></div><section class="os-print">${logo?`<img class="os-logo" src="${esc(logo)}">`:''}<h2>ORDEM DE SERVIÇO Nº ${esc(c.numeroInterno||c.id)}</h2><table><tr><th colspan=4>DADOS DO REQUERENTE</th></tr><tr><td>LOJA:</td><td>${esc(c.lojaNome||l.nome)}</td><td>CNPJ:</td><td>${esc(l.cnpj||'')}</td></tr><tr><td>ENDEREÇO:</td><td>${esc(l.endereco||'')}</td><td>CIDADE/UF:</td><td>${esc((l.cidade||'')+' '+(l.uf||''))}</td></tr></table><table><tr><th>Chamado</th><th>Serviço</th><th>Descrição</th>${req.query.semvalor?'':'<th>Valor</th>'}</tr><tr><td>${esc(c.numeroInterno||c.id)}</td><td>${esc(c.tipoServico||'')}</td><td>${esc(c.descricao||'')}</td>${req.query.semvalor?'':`<td>${money(c.valor)}</td>`}</tr></table><h3>PRESTADOR</h3><p>${esc(p.empresa||p.nome||c.prestadorNome||'')}</p><h3>TERMO DE RESPONSABILIDADE</h3><p>Declaro que as atividades descritas foram executadas ou acompanhadas conforme solicitação.</p><div class="assinaturas"><div>PRESTADOR<hr></div><div>RESPONSÁVEL LOJA<hr></div><div>ANALISTA${u.assinaturaDigital?`<img src="${u.assinaturaDigital}">`:''}<hr>${esc(u.nome||'')}</div></div></section>`))});



/* ============== PATCH V20.8.22 - IMPORTAÇÃO EXCEL HORIZONTAL CORRIGIDA ============== */
function v2075_load(){ return (typeof load === 'function') ? load() : (globalThis.appState || globalThis.state || {lojas:[],prestadores:[],proprietarios:[],chamados:[],usuarios:[],config:{},_seq:{}}); }
async function v2075_save(d){ if(typeof save === 'function'){ const r=save(d); if(r&&typeof r.then==='function') return await r; return r; } globalThis.appState=d; globalThis.state=d; return true; }
function v2075_esc(v){ return (typeof esc === 'function') ? esc(v) : String(v??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function v2075_page(req,t,b){ return (typeof page === 'function') ? page(req,t,b) : `<!doctype html><html><head><meta charset="utf-8"><title>${v2075_esc(t)}</title><link rel="stylesheet" href="/style.css"></head><body><header><h1>V&B CHAMADOS</h1><nav><a href="/">Início</a> <a href="/chamados">Chamados</a> <a href="/lojas">Lojas</a> <a href="/prestadores">Prestadores</a> <a href="/proprietarios">Proprietários</a> <a href="/config">Config</a></nav></header><main>${b}</main><span class="version">V20.8.22</span><script src="/app.js"></script><script>
(function(){
 const edit=/\/(lojas|prestadores|proprietarios|usuarios|chamados|lembretes|preventivas|perfis|tipos-servico)\/[^\/]+\/editar/.test(location.pathname);
 const novo=location.pathname.includes('/novo')||location.pathname.includes('/nova');
 if(edit){
  const form=document.querySelector('form.card, form');
  if(form&&!document.getElementById('btnEditarCampos')){
   const bar=document.querySelector('.bar .loja-topbar,.bar')||form;
   const b=document.createElement('button'); b.type='button'; b.id='btnEditarCampos'; b.className='btn secondary'; b.textContent='✏️ Editar campos';
   (bar.querySelector('div')||bar).prepend(b);
   const fields=[...form.querySelectorAll('input,select,textarea')].filter(x=>x.type!=='hidden'&&x.type!=='submit'&&x.type!=='button');
   fields.forEach(x=>{ if(x.type==='file') return; if(x.tagName==='SELECT') x.disabled=true; else x.readOnly=true; });
   b.onclick=()=>{fields.forEach(x=>{x.disabled=false;x.readOnly=false}); b.textContent='✅ Campos liberados';};
   form.addEventListener('submit',()=>fields.forEach(x=>{x.disabled=false;x.readOnly=false}));
  }
 }
 if(novo){document.querySelectorAll('form input,form select,form textarea').forEach(x=>{x.disabled=false;x.readOnly=false})}
})();
</script></body></html>`; }
function v2075_arr(d,k){ d[k]=Array.isArray(d[k])?d[k]:[]; return d[k]; }
function v2075_file(req, name){
  if(req.file && (!name || req.file.fieldname===name)) return req.file;
  if(Array.isArray(req.files)) return req.files.find(f=>!name || f.fieldname===name) || req.files[0] || null;
  if(req.files && typeof req.files==='object') return Object.values(req.files).flat().find(f=>!name || f.fieldname===name) || null;
  return null;
}
function v2075_next(d,k){ d._seq=d._seq||{}; d._seq[k]=Number(d._seq[k]||0)+1; return d._seq[k]; }
function v2075_norm(v){ return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase(); }
function v2075_digits(v){ return String(v??'').replace(/\D/g,''); }
function v2075_money(v){
  if(v==null || v==='') return 0;
  if(typeof v==='number') return v;
  let s=String(v).replace(/[R$\s]/g,'').trim();
  if(s.includes(',') && s.includes('.')) s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(',')) s=s.replace(',','.');
  const n=Number(s);
  return isNaN(n)?0:n;
}
function v2075_date(v){
  if(!v) return '';
  if(v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  if(typeof v==='number'){
    const epoch = new Date(Date.UTC(1899,11,30));
    const dt = new Date(epoch.getTime() + v*86400000);
    return dt.toISOString().slice(0,10);
  }
  const s=String(v).trim();
  const m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(m){ const y=m[3].length===2?'20'+m[3]:m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  return s;
}
function v2075_text(row, idx){ const v=row[idx]; return v==null?'':String(v).trim(); }
function v2075_findSheet(wb){
  const names=wb.SheetNames||[];
  return names.find(n=>v2075_norm(n)==='CHAMADOS') || names.find(n=>v2075_norm(n).includes('CHAMADO')) || names[0];
}
function v2075_getAnalista(req,d){
  const id=req.body.analista || req.body.analistaId || req.body.analistaResponsavel || '';
  const u=v2075_arr(d,'usuarios').find(x=>String(x.id||x.usuario||x.nome)===String(id));
  return u ? (u.nome||u.usuario||'') : (id || '');
}
function v2075_findOrCreateLoja(d,nome){
  nome=String(nome||'').trim();
  if(!nome) return null;
  let loja=v2075_arr(d,'lojas').find(l=>v2075_norm(l.nome||l.loja)===v2075_norm(nome));
  if(!loja){
    loja={id:v2075_next(d,'loja'),nome,loja:nome,ativo:'SIM',criadoPorImportacao:true,criadoEm:new Date().toISOString()};
    v2075_arr(d,'lojas').push(loja);
  }
  return loja;
}
function v2075_findOrCreatePrestador(d,nome,telefone,tipoServico){
  nome=String(nome||'').trim();
  if(!nome) return null;
  let p=v2075_arr(d,'prestadores').find(x=>v2075_norm(x.nome||x.empresa)===v2075_norm(nome));
  if(!p){
    p={id:v2075_next(d,'prestador'),nome,empresa:nome,telefone:telefone||'',tipoServico:tipoServico||'',ativo:'SIM',criadoPorImportacao:true,criadoEm:new Date().toISOString()};
    v2075_arr(d,'prestadores').push(p);
  } else {
    if(telefone && !p.telefone) p.telefone=telefone;
    if(tipoServico && !p.tipoServico) p.tipoServico=tipoServico;
  }
  return p;
}
function v2075_isHeaderOrMerged(row){
  const a=v2075_text(row,0), b=v2075_text(row,1), g=v2075_text(row,6);
  if(!a && !b && !g) return true;
  const bn=v2075_norm(b), an=v2075_norm(a), gn=v2075_norm(g);
  if(['NUMERO','NÚMERO','CHAMADO','DE','LOJAS'].includes(bn)) return true;
  if(['LOJA','CHAMADO','DATA','PRIORIDADE','DESCRICAO','DESCRIÇÃO'].includes(an)) return true;
  // Linhas mescladas/título normalmente têm loja ou cidade, mas não têm número válido na coluna B.
  if(!/^\d{1,10}$/.test(v2075_digits(b))) return true;
  return false;
}
async function v2075_importExcel(req,res){
  const d=v2075_load();
  const f=v2075_file(req,'excel') || v2075_file(req,'planilha') || v2075_file(req,'arquivo') || v2075_file(req);
  if(!f) return res.send(v2075_page(req,'Importar planilha',`<div class="card"><h2>Nenhum arquivo selecionado</h2><a class="btn" href="/importar-planilha">Voltar</a></div>`));
  try{
    const XLSX = await import('xlsx');
    const fsMod = await import('fs');
    const buf = f.buffer || fsMod.readFileSync(f.path);
    const wb = XLSX.read(buf,{type:'buffer',cellDates:true,raw:false});
    const sheetName=v2075_findSheet(wb);
    const ws=wb.Sheets[sheetName];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
    const analista=v2075_getAnalista(req,d);
    let importados=0, ignorados=0, lojasCriadas=0, prestadoresCriados=0, atualizados=0;
    const beforeL=v2075_arr(d,'lojas').length, beforeP=v2075_arr(d,'prestadores').length;
    const vistos=new Set();

    for(const row of rows){
      if(v2075_isHeaderOrMerged(row)){ ignorados++; continue; }

      // Colunas horizontais conforme planilha:
      // A LOJA, B NUMERO, C DATA, D PRIORIDADE, E AUTORIZADO, G DESCRIÇÃO, H DATA CONVERSA, I AGENDADO, J PRESTADOR, K TELEFONE, L VALOR, M PAGAMENTO, N FECHAMENTO
      const lojaNome=v2075_text(row,0);
      const numero=v2075_digits(v2075_text(row,1));
      const data=v2075_date(v2075_text(row,2));
      const prioridade=v2075_text(row,3);
      const autorizado=v2075_date(v2075_text(row,4));
      const descricao=v2075_text(row,6);
      const dataConversa=v2075_date(v2075_text(row,7));
      const dataAgendada=v2075_date(v2075_text(row,8));
      const prestadorNome=v2075_text(row,9);
      const telefone=v2075_text(row,10);
      const valor=v2075_money(v2075_text(row,11));
      const dataPagamento=v2075_date(v2075_text(row,12));
      const fechamentoLoja=v2075_date(v2075_text(row,13));

      if(!numero){ ignorados++; continue; }
      const chave=numero;
      if(vistos.has(chave)){ ignorados++; continue; }
      vistos.add(chave);

      const loja=v2075_findOrCreateLoja(d,lojaNome);
      const prest=v2075_findOrCreatePrestador(d,prestadorNome,telefone,'IMPORTADO');

      let status='ABERTO';
      const linhaTexto=v2075_norm(row.join(' '));
      if(fechamentoLoja || linhaTexto.includes('FINALIZADO')) status='FINALIZADO';
      else if(linhaTexto.includes('AGUARDANDO APROVACAO') || linhaTexto.includes('AGUARDANDO APROVAÇÃO')) status='AGUARDANDO APROVAÇÃO';
      else if(dataAgendada) status='AGENDADO';

      let chamado=v2075_arr(d,'chamados').find(c=>String(c.numeroInterno||c.numero||c.numeroChamado||'')===String(numero));
      const payload={
        numeroInterno:numero,
        numero,
        lojaId:loja?loja.id:'',
        lojaNome:loja?loja.nome:lojaNome,
        loja:loja?loja.nome:lojaNome,
        prestadorId:prest?prest.id:'',
        prestadorNome:prest?prest.nome:prestadorNome,
        prestador:prest?prest.nome:prestadorNome,
        telefonePrestador:telefone,
        tipoServico:'IMPORTADO',
        servico:'IMPORTADO',
        descricao,
        prioridade:prioridade||'MÍNIMA',
        status,
        dataAbertura:data,
        data,
        dataAutorizado:autorizado,
        dataConversa,
        dataAgendada,
        dataPagamento,
        dataFechamentoLoja:fechamentoLoja,
        valorServico:valor,
        valor,
        analista,
        origemImportacao:'PLANILHA HORIZONTAL CHAMADOS',
        atualizadoEm:new Date().toISOString()
      };
      if(chamado){
        Object.assign(chamado,payload);
        atualizados++;
      } else {
        chamado={id:v2075_next(d,'chamado'),...payload,criadoEm:new Date().toISOString()};
        v2075_arr(d,'chamados').push(chamado);
        importados++;
      }
    }

    lojasCriadas=v2075_arr(d,'lojas').length-beforeL;
    prestadoresCriados=v2075_arr(d,'prestadores').length-beforeP;
    await v2075_save(d);

    res.send(v2075_page(req,'Importação concluída',`
      <div class="card">
       <h2>✅ Importação concluída</h2>
       <p><b>Chamados importados:</b> ${importados}</p>
       <p><b>Chamados atualizados:</b> ${atualizados}</p>
       <p><b>Lojas criadas:</b> ${lojasCriadas} | <b>Prestadores criados:</b> ${prestadoresCriados} | <b>Linhas ignoradas:</b> ${ignorados}</p>
       <p><b>Aba lida:</b> ${v2075_esc(sheetName)} | <b>Regra:</b> colunas horizontais A:N, ignorando linhas mescladas/sem número na coluna B.</p>
       <a class="btn" href="/chamados?todos=1">Ver chamados</a>
       <a class="btn secondary" href="/lojas?todos=1">Ver lojas</a>
       <a class="btn secondary" href="/prestadores?todos=1">Ver prestadores</a>
       <a class="btn secondary" href="/importar-planilha">Nova importação</a>
      </div>`));
  }catch(e){
    res.status(500).send(v2075_page(req,'Erro importação',`<div class="card"><h2>Erro ao importar planilha</h2><p>${v2075_esc(e.stack||e.message||String(e))}</p><a class="btn" href="/importar-planilha">Voltar</a></div>`));
  }
}

/* Tela de importação com orientação correta */
app.get('/importar-planilha', auth, (req,res)=>{
 const d=v2075_load();
 const usuarios=v2075_arr(d,'usuarios').filter(u=>u.analista===true || v2075_norm(u.perfil).includes('ANAL') || v2075_norm(u.perfil).includes('ADMIN'));
 res.send(v2075_page(req,'Importar planilha',`
 <h2>Importar planilha</h2>
 <div class="card">
  <div class="info-blue"><b>Leitura corrigida:</b> aba CHAMADOS, dados em colunas horizontais A:N. Linhas mescladas/títulos de loja serão ignorados.</div>
  <form method="post" action="/importar-planilha" enctype="multipart/form-data" class="loading-form">
   <label>Analista responsável
    <select name="analista">
      <option value="">Sem analista</option>
      ${usuarios.map(u=>`<option value="${v2075_esc(u.id||u.usuario||u.nome)}">${v2075_esc(u.nome||u.usuario||'')}</option>`).join('')}
    </select>
   </label>
   <label>Arquivo Excel
    <input type="file" name="excel" accept=".xlsx,.xls,.xlsm" required>
   </label>
   <button>Importar agora</button>
  </form>
 </div>`));
});
app.post('/importar-planilha', auth, upload.any(), v2075_importExcel);
app.post('/v157/importar-planilha', auth, upload.any(), v2075_importExcel);

app.get('/importar-planilha',auth,need('IMPORTAR'),(req,res)=>res.send(page(req,'Importar',bar('Importar Planilha')+`<form class="card form loading-form" method="post" enctype="multipart/form-data"><label>Analista responsável<input name="analista" list="dl-users"></label><label>Arquivo Excel<input type="file" name="excel" accept=".xlsx,.xls,.csv" required></label><label>Limite de linhas<input name="limite" value="3000"></label><button>Importar agora</button>${datalist('dl-users',load().usuarios,x=>x.nome)}</form>`)));
app.post('/importar-planilha',auth,need('IMPORTAR'),upload.single('excel'),async(req,res)=>{try{const d=load(),wb=XLSX.read(req.file.buffer,{type:'buffer',cellDates:false});const ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});let hi=rows.findIndex(r=>r.some(c=>norm(c).includes('LOJA')));if(hi<0)hi=0;const head=rows[hi].map(norm);const idx=(names)=>head.findIndex(h=>names.some(n=>h.includes(n)));const il=idx(['LOJA','FILIAL']),ic=idx(['CHAMADO','OS']),idc=idx(['DESCRICAO','DESCRIÇÃO','SERVICO','SERVIÇO']),ip=idx(['PRESTADOR']);let imp=0;for(const r of rows.slice(hi+1,hi+1+Number(req.body.limite||3000))){const loja=String(r[il]||'').trim(),desc=String(r[idc]||'').trim(),prest=String(r[ip]||'').trim(),num=String(r[ic]||'').trim();if(!loja&&!desc)continue;let l=d.lojas.find(x=>norm(x.nome)===norm(loja));if(!l&&loja){l={id:next(d,'loja'),nome:loja};d.lojas.push(l)}let p=d.prestadores.find(x=>norm(x.empresa||x.nome)===norm(prest));if(!p&&prest){p={id:next(d,'prestador'),empresa:prest};d.prestadores.push(p)}d.chamados.push({id:next(d,'chamado'),numeroInterno:num||next(d,'numeroChamado'),lojaId:l?.id,lojaNome:l?.nome||loja,prestadorId:p?.id,prestadorNome:p?.empresa||prest,descricao:desc,tipoServico:'IMPORTADO',status:'ABERTO',analista:req.body.analista||'',dataAbertura:today()});imp++}await save(d);res.send(page(req,'Importação',card('Importação concluída',`Chamados importados: ${imp}<br><a class="btn" href="/chamados">Ver chamados</a>`)))}catch(e){console.error('import',e);res.send(page(req,'Erro importação',card('Erro ao importar',esc(e.message))))}});

app.get('/backup',auth,need('CONFIG'),(req,res)=>res.send(page(req,'Backup',bar('Backup/Restauração')+`<div class="card"><h2>Backup manual</h2><a class="btn" href="/backup/download">💾 Baixar backup agora</a><p>O navegador vai perguntar onde salvar conforme suas configurações de download.</p></div><form class="card form loading-form" method="post" action="/backup/restaurar" enctype="multipart/form-data"><h2>Restaurar backup</h2><label>Arquivo JSON<input type="file" name="backup" accept="application/json,.json" required></label><button>Restaurar</button></form><div class="card"><h2>Backup automático</h2><p>Configure em <b>Config</b> a opção de backup automático. O sistema usa o navegador para baixar o arquivo quando chegar o período definido.</p></div>`)));
app.get('/backup/download',auth,need('CONFIG'),(req,res)=>{const d=load();res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="vbchamados-backup-${today()}.json"`);res.send(JSON.stringify(d,null,2))});
app.post('/backup/restaurar',auth,need('CONFIG'),upload.single('backup'),async(req,res)=>{try{const data=JSON.parse(req.file.buffer.toString('utf8'));await save(merge(data));res.send(page(req,'Backup',card('Backup restaurado','<a class="btn" href="/">Início</a>')))}catch(e){res.send(page(req,'Erro backup',card('Erro ao restaurar',esc(e.message))))}});
app.get('/sobre',auth,(req,res)=>res.send(page(req,'Sobre',bar('Sobre o Sistema')+`<div class="card sobre"><img src="/img/olitech-sobre.png" onerror="this.style.display='none'"><h2>Desenvolvido por Olitech - Thiago Lucas de Oliveira</h2><p>Em parceria com ChatGPT</p><a class="btn" href="https://wa.me/5516996076918">WhatsApp suporte: 16 99607-6918</a></div>`)));
app.use((err,req,res,next)=>{console.error(err);res.status(200).send(page(req,'Erro tratado',card('Erro tratado',`Detalhe: ${esc(err.message||String(err))}<br><a class="btn" href="javascript:history.back()">Voltar</a>`)))});


/* PATCH V20.8.22 - health/version */
app.get('/api/v2072/status', (req,res)=>{
  res.json({ok:true,versao:'V20.8.22',loadingFix:true,time:new Date().toISOString()});
});


/* V20.8.22 - abrir anexos da loja salvos no app_state */
app.get('/lojas/:id/cartao-cnpj',auth,(req,res)=>{const d=load();const l=(d.lojas||[]).find(x=>String(x.id)===String(req.params.id));const data=l?.cartaoCnpj?.dataUrl;if(!data)return res.status(404).send('Cartão CNPJ não encontrado');const m=String(data).match(/^data:([^;]+);base64,(.*)$/);if(m){res.setHeader('Content-Type',m[1]);return res.end(Buffer.from(m[2],'base64'));}res.redirect(data)});
app.get('/lojas/:id/foto/:idx',auth,(req,res)=>{const d=load();const l=(d.lojas||[]).find(x=>String(x.id)===String(req.params.id));const data=(l?.fotos||[])[Number(req.params.idx)]?.dataUrl;if(!data)return res.status(404).send('Foto não encontrada');const m=String(data).match(/^data:([^;]+);base64,(.*)$/);if(m){res.setHeader('Content-Type',m[1]);return res.end(Buffer.from(m[2],'base64'));}res.redirect(data)});
app.get('/api/save/flush',auth,async(req,res)=>res.json({ok:await saveNow(load()),versao:VERSION}));
app.get('/api/save/status',auth,(req,res)=>{const d=load();res.json({versao:VERSION,supabaseConfigurado:!!SUPABASE_URL,modelo:'DADOS PRINCIPAIS FICAM NA TABELA app_state, CAMPO data JSONB',aviso:'As tabelas chamadas/lojas/prestadores podem ficar vazias neste modelo.',totais:{lojas:(d.lojas||[]).length,prestadores:(d.prestadores||[]).length,chamados:(d.chamados||[]).length,os:(d.os||[]).length,usuarios:(d.usuarios||[]).length}})});
app.use((req,res)=>res.status(404).send(page(req,'Página não encontrada',card('Página não encontrada',`A rota <b>${esc(req.path)}</b> não foi localizada.<br><a class="btn" href="/">Início</a>`))));
await init();


/* ===== PATCH V20.8.22 RECUPERADO ===== */
app.get('/api/v205/status',auth,async(req,res)=>{const remote=await supaGet(); const d=load(); res.json({ok:true,versao:VERSION,supabaseConfigurado:!!SUPABASE_URL,state_id:STATE_ID,local:{usuarios:d.usuarios.length,lojas:d.lojas.length,prestadores:d.prestadores.length,proprietarios:d.proprietarios.length,chamados:d.chamados.length,os:d.os.length,lembretes:d.lembretes.length,preventivas:d.preventivas.length,pontos:d.pontos.length},remoto:remote?{usuarios:(remote.usuarios||[]).length,lojas:(remote.lojas||[]).length,prestadores:(remote.prestadores||[]).length,chamados:(remote.chamados||[]).length,os:(remote.os||[]).length}:null})});
app.get('/solicitar-chamado',auth,(req,res)=>res.redirect('/chamados/rapido'));
app.get('/v154/config',auth,(req,res)=>res.redirect('/config'));
app.get('/v153/prestador-pdf',auth,(req,res)=>res.redirect('/prestadores'));
app.post('/prestador-pdf/:id',auth,need('PRESTADORES'),upload.any(),(req,res)=>pdfEntity(req,res,'prestador','prestadores','prestadores'));
app.post('/proprietario-pdf/:id',auth,need('PROPRIETARIOS'),upload.any(),(req,res)=>pdfEntity(req,res,'proprietario','proprietarios','proprietarios'));

/* tela de diagnóstico simples */
app.get('/diagnostico',auth,(req,res)=>{const d=load();res.send(page(req,'Diagnóstico',bar('Diagnóstico V20.7')+`<div class="card"><p><b>Versão:</b> ${VERSION}</p><p><b>Supabase configurado:</b> ${SUPABASE_URL?'SIM':'NÃO'}</p><p><b>State ID:</b> ${esc(STATE_ID)}</p><p><b>Lojas:</b> ${d.lojas.length}</p><p><b>Chamados:</b> ${d.chamados.length}</p><p><b>O.S.:</b> ${d.os.length}</p><p><b>Lembretes:</b> ${d.lembretes.length}</p><p><b>Preventivas:</b> ${d.preventivas.length}</p><a class="btn" href="/api/v205/status">Abrir JSON</a></div>`))});

app.listen(PORT,()=>console.log(`${VERSION} rodando na porta ${PORT}`));
