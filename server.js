
import express from "express";
import session from "express-session";
import multer from "multer";
import path from "path";
import fs from "fs";
import XLSX from "xlsx";
import pdfParse from "pdf-parse";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import PDFDocument from "pdfkit";

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);

/* PATCH V20.8.14 - função de status fechado para evitar CLOSED IS NOT DEFINED */
function closed(item){
  const s = String((item && (item.status || item.situacao || item.estado)) || item || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .trim().toUpperCase();
  return ['CLOSED','FECHADO','FINALIZADO','FINALIZADA','CANCELADO','CANCELADA','INATIVO','INATIVA','CONCLUIDO','CONCLUIDA'].includes(s);
}


/* PATCH V20.8.14 - moeda BR correta: R$800,00 = 800.00 */
function v2088_moneyBR(v){
  if(v == null || v === '') return 0;
  if(typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim().toUpperCase();
  s = s.replace(/R\$/g,'').replace(/\s/g,'');
  if(!s) return 0;
  if(s.includes(',')){
    s = s.replace(/\./g,'').replace(',', '.');
  } else {
    const parts = s.split('.');
    if(parts.length > 2){
      const dec = parts.pop();
      s = parts.join('') + '.' + dec;
    } else if(parts.length === 2 && parts[1].length === 3){
      s = parts[0] + parts[1];
    }
  }
  s = s.replace(/[^\d.-]/g,'');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const app=express();
const PORT=process.env.PORT||3000;
const DATA_DIR=path.join(__dirname,"data");
const UPLOAD_DIR=path.join(__dirname,"uploads");
const DB_FILE=path.join(DATA_DIR,"db.json");
fs.mkdirSync(DATA_DIR,{recursive:true}); fs.mkdirSync(UPLOAD_DIR,{recursive:true});
const upload=multer({dest:UPLOAD_DIR,limits:{fileSize:80*1024*1024}});
app.use(express.urlencoded({extended:true,limit:"50mb"}));

app.use(express.json({limit:"50mb"}));
app.use(session({secret:process.env.SESSION_SECRET||"vb-v14-secret",resave:false,saveUninitialized:false,cookie:{maxAge:1000*60*60*12}}));
app.use('/public',express.static(path.join(__dirname,'public')));
app.use('/uploads',express.static(UPLOAD_DIR));

const PERMS=["TODAS","INICIO","CHAMADOS","CHAMADOS_EDITAR","LOJAS","PRESTADORES","PROPRIETARIOS","LEMBRETES","PREVENTIVAS","ORDENS_SERVICO","IMPORTAR","RELATORIOS","PONTO_HORAS","CONFIG","USUARIOS","BACKUP","SUPERVISOR","FINANCEIRO"];
const DEFAULT_SERVICOS=["A DEFINIR","FAZ TUDO","ELETRICISTA","ENCANADOR","SERRALHEIRO","CHAVEIRO","AR CONDICIONADO","DEDETIZAÇÃO","JARDINAGEM","LIMPEZA","PORTAS AUTOMÁTICAS","FILTRO","PINTURA","MANUTENÇÃO","VIDRACEIRO","REFRIGERAÇÃO","REDE LÓGICA"];
const STATUS=["ABERTO","AGUARDANDO","EM ANDAMENTO","AGUARDANDO ORÇAMENTO","AGUARDANDO APROVAÇÃO","APROVADO","AGENDADO","FINALIZADO","CANCELADO"];
function now(){return new Date().toISOString()} function today(){return now().slice(0,10)}
function dig(v){return String(v||'').replace(/\D/g,'')} function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim()} function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function arr(v){return Array.isArray(v)?v:(v?[v]:[])} function money(v){return Number(String(v||0).replace(/[^\d,.-]/g,'').replace(',','.'))||0} function moeda(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} function br(v){const s=String(v||'').slice(0,10);const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:s} function finalizado(s){return ['FINALIZADO','CANCELADO','FECHADO'].includes(norm(s))}

/* PATCH V20.8.14 - PERSISTÊNCIA SUPABASE APP_STATE SEM ALTERAR FUNÇÕES */
function envTrim(name){ return String(process.env[name] || '').trim().replace(/^['\"]|['\"]$/g,''); }
const SUPABASE_URL = envTrim('SUPABASE_URL') || envTrim('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_KEY = envTrim('SUPABASE_SERVICE_ROLE_KEY') || envTrim('SUPABASE_SERVICE_KEY') || envTrim('SUPABASE_KEY') || envTrim('SUPABASE_ANON_KEY');
const SUPABASE_STATE_ID = envTrim('SUPABASE_STATE_ID') || 'default';
const supabasePersist = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { transport: WebSocket },
  global: { headers: { 'x-application-name': 'vbchamados-v20-8-5' } }
}) : null;
let persistentCache = null;
let supabaseOk = false;
let remoteLoaded = false;
let lastSaveOk = false;
let lastSaveAt = null;
let lastRemoteLoadAt = null;
let lastPersistError = '';
let savingRemote = false;
let pendingRemote = false;

function mergeDB(base, incoming){
  const e = base || emptyDB();
  const d = incoming && typeof incoming === 'object' ? incoming : {};
  const out = {...e, ...d};
  out.config = {...e.config, ...(d.config||{}), next:{...e.config.next, ...(((d.config||{}).next)||{})}};
  for(const k of ['usuarios','perfis','tiposServico','statusChamado','lojas','prestadores','proprietarios','chamados','os','lembretes','preventivas','pontos','pagamentos']) out[k]=Array.isArray(out[k])?out[k]:e[k];
  if(!out.usuarios.some(u=>norm(u.usuario)==='OLITECH')) out.usuarios.unshift(e.usuarios[0]);
  return out;
}
function dbHasRealData(d){
  d=d||{};
  return ['lojas','prestadores','proprietarios','chamados','os','lembretes','preventivas','pontos','pagamentos'].some(k=>Array.isArray(d[k]) && d[k].length>0) ||
    (Array.isArray(d.usuarios) && d.usuarios.filter(u=>norm(u.usuario)!=='OLITECH').length>0);
}
function readLocalDB(){ try{ return fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE,'utf8')) : emptyDB(); }catch{return emptyDB();} }
async function initPersistentDB(){
  const fallback = mergeDB(emptyDB(), readLocalDB());
  persistentCache = fallback;
  if(!supabasePersist){
    lastPersistError = 'SUPABASE NÃO CONFIGURADO. VERIFIQUE SUPABASE_URL E SUPABASE_SERVICE_ROLE_KEY NO RENDER.';
    console.error('V20.8.14:', lastPersistError);
    return;
  }
  try{
    const {data, error} = await supabasePersist.from('app_state').select('id,data,updated_at').eq('id', SUPABASE_STATE_ID).maybeSingle();
    if(error) throw error;
    if(data && data.data && Object.keys(data.data).length){
      persistentCache = mergeDB(emptyDB(), data.data);
      fs.writeFileSync(DB_FILE, JSON.stringify(persistentCache,null,2),'utf8');
      supabaseOk = true; remoteLoaded = true; lastRemoteLoadAt = data.updated_at || new Date().toISOString(); lastPersistError='';
      console.log('V20.8.14 carregado do Supabase app_state:', SUPABASE_STATE_ID);
    }else{
      // Proteção: não apaga dados remotos nem força base vazia sem necessidade.
      if(dbHasRealData(fallback)){
        await saveRemoteNow(fallback);
        console.log('V20.8.14 Supabase estava vazio: enviado backup local com dados para app_state:', SUPABASE_STATE_ID);
      }else{
        const inicial = mergeDB(emptyDB(), {});
        persistentCache = inicial;
        await saveRemoteNow(inicial);
        console.log('V20.8.14 Supabase estava vazio: criado app_state inicial:', SUPABASE_STATE_ID);
      }
      remoteLoaded = true;
    }
  }catch(e){
    supabaseOk = false; remoteLoaded = false; lastSaveOk = false; lastPersistError = e.message || String(e);
    console.error('V20.8.14 ERRO SUPABASE:', lastPersistError);
    console.error('IMPORTANTE: enquanto este erro existir, os dados ficam apenas temporários/local no Render. Rode o schema.sql e use SERVICE_ROLE_KEY.');
  }
}
async function saveRemoteNow(d){
  if(!supabasePersist){ lastSaveOk=false; return false; }
  const payload = mergeDB(emptyDB(), d);
  const {error} = await supabasePersist.from('app_state').upsert({id:SUPABASE_STATE_ID, data:payload, updated_at:new Date().toISOString()}, {onConflict:'id'});
  if(error) throw error;
  persistentCache = payload;
  supabaseOk = true; remoteLoaded = true; lastSaveOk = true; lastSaveAt = new Date().toISOString(); lastPersistError='';
  return true;
}
function scheduleRemoteSave(d){
  persistentCache = mergeDB(emptyDB(), d);
  // Sempre grava JSON local também, mas fonte principal é Supabase.
  try{ fs.writeFileSync(DB_FILE,JSON.stringify(persistentCache,null,2),'utf8'); }catch(e){ console.error('V20.8.14 erro JSON local:', e.message||e); }
  if(!supabasePersist){ lastSaveOk=false; lastPersistError='SUPABASE NÃO CONFIGURADO'; return; }
  if(savingRemote){ pendingRemote = true; return; }
  savingRemote = true;
  setTimeout(async()=>{
    try{ await saveRemoteNow(persistentCache); console.log('V20.8.14 salvo no Supabase app_state:', SUPABASE_STATE_ID); }
    catch(e){ lastSaveOk=false; supabaseOk=false; lastPersistError=e.message||String(e); console.error('V20.8.14 erro ao salvar Supabase:', lastPersistError); }
    finally{ savingRemote=false; if(pendingRemote){ pendingRemote=false; scheduleRemoteSave(persistentCache); } }
  }, 50);
}
function emptyDB(){return {version:'15.8.0',config:{next:{usuario:2,perfil:4,loja:1,prestador:1,proprietario:1,chamado:1,numeroChamado:1,os:1,lembrete:1,preventiva:1,ponto:1},nomeSistema:'V&B CHAMADOS',subtitulo:'CHAMADOS DE MANUTENÇÃO',tema:'VERDE',logoUrl:'',logoLocal:null,regraNomeFilial:'MESCLAR_NOME_CIDADE_UF',usarLogoLojaOS:'SIM'},usuarios:[{id:1,nome:'OLITECH',usuario:'OLITECH',senha:'051309',perfil:'ADMIN',ativo:'SIM',analista:'SIM',permissoes:['TODAS']}],perfis:[{id:1,nome:'ADMIN',permissoes:['TODAS']},{id:2,nome:'ANALISTA',permissoes:['INICIO','CHAMADOS','CHAMADOS_EDITAR','LOJAS','PRESTADORES','PROPRIETARIOS','LEMBRETES','PREVENTIVAS','ORDENS_SERVICO','IMPORTAR','RELATORIOS','PONTO_HORAS']},{id:3,nome:'CONSULTA',permissoes:['INICIO','CHAMADOS','LOJAS','PRESTADORES','PROPRIETARIOS','RELATORIOS']}],tiposServico:[...DEFAULT_SERVICOS],statusChamado:[...STATUS],lojas:[],prestadores:[],proprietarios:[],chamados:[],os:[],lembretes:[],preventivas:[],pontos:[],pagamentos:[]}}
function load(){ if(persistentCache) return persistentCache; let d; if(!fs.existsSync(DB_FILE)){ d=emptyDB(); persistentCache=d; save(d); return d; } try{d=JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}catch{d=emptyDB()} persistentCache=mergeDB(emptyDB(), d); return persistentCache }
function save(d){ persistentCache=mergeDB(emptyDB(), d); scheduleRemoteSave(persistentCache); return true } function next(d,k){d.config.next[k]=Number(d.config.next[k]||1);return d.config.next[k]++}
function user(req){return req.session.user||null} function can(req,perm){const u=user(req); if(!u)return false; if(norm(u.usuario)==='OLITECH'||norm(u.perfil)==='ADMIN')return true; const d=load(); const uu=d.usuarios.find(x=>String(x.id)===String(u.id)||norm(x.usuario)===norm(u.usuario))||u; const pf=d.perfis.find(p=>norm(p.nome)===norm(uu.perfil)); const ps=[...arr(uu.permissoes),...arr(pf?.permissoes)].map(norm); return ps.includes('TODAS')||ps.includes(norm(perm))}
function auth(req,res,nextfn){if(!user(req))return res.redirect('/login');nextfn()} function need(p){return (req,res,nextfn)=>can(req,p)?nextfn():res.status(403).send(page(req,'Sem permissão',`<div class="card"><h2>🚫 Sem permissão</h2><p>Permissão necessária: ${esc(p)}</p><a class="btn" href="/">🏠 Início</a></div>`))}
function fileObj(f){if(!f)return null;let o={original:f.originalname,path:'uploads/'+f.filename,filename:f.filename,mimetype:f.mimetype,size:f.size,at:now()};try{if((f.mimetype||'').startsWith('image/'))o.dataUrl='data:'+f.mimetype+';base64,'+fs.readFileSync(f.path).toString('base64')}catch(e){}return o} function oneFile(req,n){return fileObj(req.files?.[n]?.[0]||req.file)} function manyFiles(req,n){return (req.files?.[n]||[]).map(fileObj).filter(Boolean)} function publicFile(f){if(!f)return ''; if(typeof f==='string')return f; if(f.dataUrl)return f.dataUrl; return '/'+String(f.path||'').replace(/^\/+|\\/g,'/')} function appLogo(d){d=d||{};d.config=d.config||{};return publicFile(d.config.logoEmpresaLocal)||publicFile(d.config.logoLocal)||d.config.logoUrl||''}
function menu(req){const items=[['/','🏠 Início','INICIO'],['/chamados','🎫 Chamados','CHAMADOS'],['/chamados-por-analista','👤 Chamados por Analista','CHAMADOS'],['/lojas','🏬 Lojas','LOJAS'],['/prestadores','🧰 Prestadores','PRESTADORES'],['/proprietarios','👥 Proprietários','PROPRIETARIOS'],['/lembretes','📌 Lembretes','LEMBRETES'],['/preventivas','🗓️ Preventivas','PREVENTIVAS'],['/os','📄 Ordens de Serviço','ORDENS_SERVICO'],['/importar-planilha','📥 Importar','IMPORTAR'],['/relatorios','📊 Relatórios','RELATORIOS'],['/ponto-horas','⏱️ Ponto/Horas','PONTO_HORAS'],['/config','⚙️ Config','CONFIG'],['/logout','🚪 Sair','INICIO']];return `<nav>${items.filter(i=>i[0]==='/logout'||can(req,i[2])).map(i=>`<a class="btn menu-btn" href="${i[0]}">${i[1]}</a>`).join('')}</nav>`}

/* PATCH V20.8.14 - assinatura digital do analista na O.S. */
function v2088_publicImg(f){
  try{
    if(!f) return '';
    if(typeof f === 'string') return f;
    if(f.dataUrl) return f.dataUrl;
    if(f.path) return '/' + String(f.path).replace(/^\/+/, '');
    if(f.url) return f.url;
  }catch(e){}
  return '';
}
function v2088_assinaturaUsuario(d, nomeAnalista){
  try{
    const alvo = norm(nomeAnalista || '');
    if(!alvo) return '';
    const u = (d.usuarios || []).find(x=>{
      const nomes = [x.nome, x.usuario, x.login, x.analista].map(norm);
      return nomes.includes(alvo) || nomes.some(n=>n && alvo && (n.includes(alvo) || alvo.includes(n)));
    });
    if(!u) return '';
    return v2088_publicImg(u.assinaturaUsuario||u.assinaturaDigital||u.assinatura||u.assinaturaLocal||u.imagemAssinatura||u.fotoAssinatura||u.signature||u.signatureImage);
  }catch(e){ return ''; }
}
function v2088_assinaturaHtml(d, nomeAnalista){
  const img = v2088_assinaturaUsuario(d, nomeAnalista);
  return img ? `<img class="assinatura-digital" src="${esc(img)}" onerror="this.style.display='none'">` : '';
}
function v2088_injetarAssinaturaOS(html,d,analista){
  try{
    const img = v2088_assinaturaHtml(d, analista);
    if(!img || html.includes('assinatura-digital')) return html;
    return html.replace(/(<[^>]*>\s*ANALISTA\s*<\/[^>]*>)/i, `$1${img}`);
  }catch(e){ return html; }
}

function page(req,title,body){const d=load(),c=d.config,logo=appLogo(d);return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.nomeSistema)} - ${esc(title)}</title><link rel="stylesheet" href="/public/style.css"></head><body class="theme-${esc(norm(c.tema).toLowerCase())}">${user(req)?`<header><div class="brand">${logo?`<img src="${esc(logo)}" onerror="this.style.display='none'">`:`<div class="logo-fallback">VB</div>`}<div><h1>${esc(c.nomeSistema)}</h1><p>${esc(c.subtitulo)}</p></div></div>${menu(req)}</header>`:''}<main>${body}</main><div class="version">V20.8.14</div><script src="/public/app.js"></script>
<script>
(function(){
 const bar=document.querySelector('.bar,.actions,.toolbar')||document.body;
 const id=(location.pathname.match(/os-impressao\/([^/?#]+)/)||[])[1];
 if(id&&bar&&!document.getElementById('wloja')){
  const v=new URLSearchParams(location.search).get('valor')||'1';
  const a=document.createElement('a');a.id='wloja';a.className='btn';a.textContent='📲 WHATSAPP LOJA';a.href='/os-whatsapp-loja/'+id+'?valor='+v;a.target='_blank';
  const p=document.createElement('a');p.id='wpres';p.className='btn';p.textContent='📲 WHATSAPP PRESTADOR PDF';p.href='/os-whatsapp-prestador/'+id+'?valor='+v;p.target='_blank';
  bar.appendChild(a);bar.appendChild(p);
 }
})();
</script>

<script>
(function(){
 if(new URLSearchParams(location.search).get('valor')==='0'){
   document.querySelectorAll('h4').forEach(h=>{ if((h.textContent||'').includes('VALORES')){ h.style.display='none'; let n=h.nextElementSibling; if(n) n.style.display='none'; }});
 }
})();
</script>
</body></html>`}
function errorPage(req,e){console.error(e);return page(req,'Erro tratado',`<div class="card"><h2>⚠️ Erro tratado</h2><p>O sistema encontrou um erro nesta operação, mas não travou.</p><p><b>Detalhe:</b> ${esc(e?.message||String(e))}</p><a class="btn" href="/">🏠 Início</a> <a class="btn secondary" href="javascript:history.back()">↩️ Voltar</a></div>`)}
function tabela(headers,rows,empty='Nenhum registro encontrado'){return `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${headers.length}">${esc(empty)}</td></tr>`}</tbody></table>`}
function busca(action,ph){return `<form class="card search" method="get" action="${action}"><input name="q" placeholder="${esc(ph)}"><button>🔎 Buscar</button><a class="btn" href="${action}?mostrar=1">Mostrar todos</a><a class="btn secondary" href="${action}">Limpar</a></form>`}
function findLoja(d,q){return d.lojas.find(l=>String(l.id)===String(q)||norm(l.nome)===norm(q)||norm(l.codigo)===norm(q))||{}} function findPrestador(d,q){return d.prestadores.find(p=>String(p.id)===String(q)||norm(p.empresa)===norm(q)||norm(p.responsavel)===norm(q))||{}}
function distKm(a,b,c,d){a=Number(a);b=Number(b);c=Number(c);d=Number(d);if(!a||!b||!c||!d)return null;const R=6371,da=(c-a)*Math.PI/180,db=(d-b)*Math.PI/180,x=Math.sin(da/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(db/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
function sugerePrestadores(d,lojaQ,tipoQ){const loja=findLoja(d,lojaQ);const tipo=norm(tipoQ);return d.prestadores.filter(p=>{if(norm(p.ativo||'SIM')==='NÃO')return false;const serv=[...arr(p.servicos),...arr(p.tiposServico)].map(norm);const okServ=!tipo||tipo==='A DEFINIR'||serv.includes(tipo)||serv.includes('FAZ TUDO');const mesmaCidade=norm(p.cidade)===norm(loja.cidade)&&norm(p.uf||p.estado)===norm(loja.uf||loja.estado);const mesmaUf=norm(p.uf||p.estado)===norm(loja.uf||loja.estado);const dist=distKm(loja.latitude,loja.longitude,p.latitude,p.longitude);const raio=Number(p.raioKm||p.raio||0);const okDist=dist===null?(mesmaCidade||mesmaUf):(!raio||dist<=raio);return okServ&&okDist}).map(p=>{const distancia=distKm(loja.latitude,loja.longitude,p.latitude,p.longitude);const desloc=distancia?distancia*money(p.valorKm):0;return {...p,distancia,valorDeslocamento:desloc}})}
function limpaEmpresa(n){return norm(n).replace(/\b(NOME|EMPRESARIAL|RAZAO|RAZÃO|SOCIAL|TITULO|TÍTULO|DO|DA|DE|ESTABELECIMENTO|FANTASIA|LTDA|L T D A|EIRELI|EPP|ME|MATRIZ|FILIAL|S\/A|SA|CNPJ|CEP|UF|TELEFONE|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|MUNICIPIO|MUNICÍPIO|INSCRICAO|INSCRIÇÃO|ESTADUAL|COMPROVANTE|CADASTRO)\b/g,' ').replace(/[^A-Z0-9À-Ú ]/g,' ').replace(/\s+/g,' ').trim()}
function ufOnly(v){return (norm(v).match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)||[])[1]||''}
function mesclaFilial(nome,cidade,uf){const base=limpaEmpresa(nome);const cid=norm(cidade).replace(/\b(MUNICIPIO|MUNICÍPIO|CIDADE|UF|CEP|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO)\b/g,' ').replace(/[^A-ZÀ-Ú ]/g,' ').replace(/\s+/g,' ').trim();const estado=ufOnly(uf)||norm(uf).slice(0,2);return `${base} ${cid} ${estado}`.replace(/\s+/g,' ').trim()}
async function parsePdf(file){
  const data=await pdfParse(fs.readFileSync(file));
  const raw=(data.text||'').replace(/\r/g,'\n');
  const lines=raw.split(/\n+/).map(x=>norm(x).replace(/\s+/g,' ').trim()).filter(Boolean);
  const text=lines.join(' ');
  const cnpj=(text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)||[])[0]||'';
  const cep=(text.match(/\d{5}-?\d{3}/)||[])[0]||'';
  const uf=ufOnly(text);
  const tel=(text.match(/(?:\(?\d{2}\)?\s*)?\d{4,5}-?\d{4}/)||[])[0]||'';
  function lineAfter(labels){
    for(const label of labels){const i=lines.findIndex(l=>l.includes(label));if(i>=0){const same=lines[i].split(label).pop().replace(/^[:\-\s]+/,'').trim();if(same&&same.length>2&&!/(COMPROVANTE|CADASTRO|DATA|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO|EMAIL|E-MAIL|INSCRICAO|INSCRIÇÃO)/.test(same))return same;for(let k=i+1;k<Math.min(i+6,lines.length);k++){const v=lines[k];if(v&&!/^(DATA|NUMERO|NÚMERO|COMPROVANTE|CADASTRO|CNPJ|CEP|UF|PORTE|CODIGO|CÓDIGO|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO|EMAIL|E-MAIL|INSCRICAO|INSCRIÇÃO|ATIVIDADE|SITUACAO|SITUAÇÃO|ENTE|FEDERATIVO)/.test(v))return v}}}
    return '';
  }
  let fantasia=lineAfter(['TITULO DO ESTABELECIMENTO','TÍTULO DO ESTABELECIMENTO','NOME DE FANTASIA']);
  let razao=lineAfter(['NOME EMPRESARIAL','RAZAO SOCIAL','RAZÃO SOCIAL']);
  let nome=fantasia||razao;
  if(!nome)nome=lines.find(l=>/\b(MEGA VEST CASA|VEST CASA|LTDA|EIRELI|EPP)\b/.test(l)&&!/ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|COMPROVANTE/.test(l))||'';
  let cidade=lineAfter(['MUNICIPIO','MUNICÍPIO','CIDADE']);
  let endereco=lineAfter(['LOGRADOURO','ENDERECO','ENDEREÇO']);
  let bairro=lineAfter(['BAIRRO']);
  if(bairro&&endereco&&!endereco.includes(bairro))endereco=(endereco+' '+bairro).trim();
  cidade=norm(cidade).replace(/\b(UF|CEP|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO)\b/g,' ').replace(/[^A-ZÀ-Ú ]/g,' ').replace(/\s+/g,' ').trim();
  endereco=norm(endereco).replace(/\b(CEP|UF|MUNICIPIO|MUNICÍPIO|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO|EMAIL|E-MAIL)\b/g,' ').replace(/\s+/g,' ').trim();
  return {nome:limpaEmpresa(nome),razao:limpaEmpresa(razao),fantasia:limpaEmpresa(fantasia),cnpj:dig(cnpj),cep:dig(cep),uf,telefone:dig(tel),cidade,endereco};
}
function syncPreventiva(d,p){let l=d.lembretes.find(x=>String(x.preventivaId)===String(p.id)||String(x.id)===String(p.lembreteId||''));if(!l){l={id:next(d,'lembrete')};d.lembretes.push(l);p.lembreteId=l.id}Object.assign(l,{titulo:`PREVENTIVA - ${p.titulo}`,data:p.dataLembrete||today(),hora:p.horaLembrete||'09:00',som:p.som||'BIPE',analista:p.analista||'',mostrarTodos:p.mostrarTodos||'SIM',cor:p.cor||'AMARELO',fixarInicial:'SIM',preventivaId:p.id,descricao:p.descricao||`Preventiva da loja ${p.lojaNome||''}`})}

app.get('/login',(req,res)=>res.send(`<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login</title><link rel="stylesheet" href="/public/style.css"></head><body class="login-body"><form class="login-card" method="post"><div class="login-logo">VB</div><h1>V&B CHAMADOS</h1><label>Usuário<input name="usuario" autocomplete="username" autofocus></label><label>Senha<input type="password" name="senha" autocomplete="current-password"></label><label class="inline"><input type="checkbox" name="lembrar" value="SIM"> Salvar usuário</label><button>Entrar</button></form><script src="/public/app.js"></script></body></html>`));
app.post('/login',(req,res)=>{const d=load();const u=d.usuarios.find(x=>norm(x.ativo||'SIM')!=='NÃO'&&norm(x.usuario)===norm(req.body.usuario)&&String(x.senha||'')===String(req.body.senha||''));if(!u)return res.send(page(req,'Login',`<div class="login-card"><p class="alert">Usuário ou senha inválidos.</p><a class="btn" href="/login">Tentar novamente</a></div>`));req.session.user={id:u.id,nome:u.nome,usuario:u.usuario,perfil:u.perfil,permissoes:u.permissoes||[]};res.redirect('/')}); app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/login')));
/* PATCH V20.8.14 - HOME MOBILE RÁPIDA: GRID SÓ APÓS BUSCA/MOSTRAR TODOS */
app.get('/',auth,(req,res)=>{
  const d=load();
  const q=norm(req.query.q||'');
  const mostrar=req.query.mostrar==='1' || !!q;
  const lemb=d.lembretes.filter(l=>!closed(l)&&(norm(l.fixo)==='SIM'||true)).slice(0,8).map(l=>`<a class="postit" data-data="${esc(l.data||'')}" data-hora="${esc(l.hora||'')}" href="/lembretes/${l.id}/editar"><b>${esc(l.descricao)}</b><br>${esc(l.data)} ${esc(l.hora||'')}<br>${esc(l.obs||'')}</a>`).join('');
  let chamados=d.chamados.filter(c=>!closed(c));
  if(q) chamados=chamados.filter(c=>norm(`${c.numeroInterno||c.id} ${c.lojaNome||''} ${c.analista||''} ${c.tipoServico||''} ${c.status||''}`).includes(q));
  if(!mostrar) chamados=[];
  const rows=mostrar ? (chamados.slice(0,80).map(c=>`<tr><td>${esc(c.numeroInterno||c.id)}</td><td>${esc(c.lojaNome)}</td><td>${esc(c.analista||'SEM ANALISTA')}</td><td>${esc(c.tipoServico||'')}</td><td>${esc(c.prioridade||'')}</td><td>${esc(c.status||'ABERTO')}</td><td><a class="btn small" href="/chamados/${c.id}/editar">Abrir</a></td></tr>`).join('')||'<tr><td colspan=7>NENHUM CHAMADO ENCONTRADO.</td></tr>') : '<tr><td colspan=7>DIGITE NO CAMPO DE BUSCA OU CLIQUE EM MOSTRAR TODOS PARA CARREGAR A GRID.</td></tr>';
  res.send(page(req,'Início',`${lemb?`<div class="postits">${lemb}</div>`:''}<div class="card quick-card"><h2>Ações rápidas</h2><div class="quick-actions"><a class="btn" href="/chamados/rapido">➕ Criar chamado rápido</a><a class="btn secondary" href="/chamados/novo">Abrir chamado completo</a><a class="btn secondary" href="/os/nova">Juntar chamados / Gerar OS</a></div></div><div class="card initial-grid"><h2>Minha grid inicial</h2><form method="get" class="searchline home-search"><input name="q" value="${esc(req.query.q||'')}" placeholder="BUSCAR Nº, LOJA, ANALISTA, SERVIÇO..."><button>Buscar</button><a class="btn secondary" href="/?mostrar=1">Mostrar todos</a></form><div class="table-wrap"><table><thead><tr><th>Chamado</th><th>Loja</th><th>Analista</th><th>Serviço</th><th>Prioridade</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div></div>`))
});
function postit(l){const cor=norm(l.cor||'AMARELO').toLowerCase();const href=l.chamadoId?`/chamados/${l.chamadoId}/editar`:(l.preventivaId?`/preventivas/${l.preventivaId}/editar`:`/lembretes/${l.id}/editar`);return `<a class="postit ${cor}" href="${href}"><b>${esc(l.titulo)}</b><span>📅 ${br(l.data)} ${esc(l.hora||'')}</span><small>${esc(l.descricao||'')}</small></a>`}

app.get('/api/autocomplete',auth,(req,res)=>{const d=load(),tipo=norm(req.query.tipo||'GERAL'),q=norm(req.query.q||''),di=dig(req.query.q||'');if(q.length<2&&di.length<2)return res.json({ok:true,items:[]});const items=[];const add=(tipo,id,label,value,sub,raw)=>items.push({tipo,id,label,value,sub,raw});if(['LOJAS','GERAL'].includes(tipo))d.lojas.forEach(l=>add('loja',l.id,l.nome,l.nome,[l.codigo,l.cidade,l.uf,l.cnpj,l.cep].filter(Boolean).join(' | '),l));if(['PRESTADORES','GERAL'].includes(tipo))d.prestadores.forEach(p=>add('prestador',p.id,p.empresa||p.responsavel,p.empresa||p.responsavel,[p.responsavel,p.cidade,p.uf,p.cnpj,(p.servicos||[]).join(',')].filter(Boolean).join(' | '),p));if(['PROPRIETARIOS','GERAL'].includes(tipo))d.proprietarios.forEach(p=>add('proprietario',p.id,p.nome,p.nome,[p.cidade,p.uf,p.cnpj,p.cpf].filter(Boolean).join(' | '),p));if(['ANALISTAS','USUARIOS','GERAL'].includes(tipo))d.usuarios.filter(u=>norm(u.ativo)!=='NÃO').forEach(u=>add('usuario',u.id,u.nome||u.usuario,u.nome||u.usuario,[u.usuario,u.perfil].filter(Boolean).join(' | '),u));if(['CHAMADOS','GERAL'].includes(tipo))d.chamados.forEach(c=>add('chamado',c.id,`${c.numeroInterno||c.id} - ${c.lojaNome||''}`,String(c.numeroInterno||c.id),[c.prestadorNome,c.status,c.tipoServico].filter(Boolean).join(' | '),c));if(['SERVICOS','GERAL'].includes(tipo))d.tiposServico.forEach(s=>add('servico',s,s,s,'Tipo de serviço',{nome:s}));const ok=items.filter(x=>norm([x.label,x.sub,JSON.stringify(x.raw)].join(' ')).includes(q)||di&&dig([x.label,x.sub].join(' ')).includes(di)).slice(0,40);res.json({ok:true,items:ok})});
app.get('/api/prestadores-sugeridos',auth,(req,res)=>res.json({ok:true,items:sugerePrestadores(load(),req.query.loja||req.query.lojaId,req.query.tipo||req.query.tipoServico)})); app.get('/api/status',auth,(req,res)=>res.json({ok:true,version:'V20.8.14'}));

app.get('/config',auth,need('CONFIG'),(req,res)=>{const d=load(),c=d.config;res.send(page(req,'Config',`<section class="card"><h2>⚙️ Configurações</h2><form method="post" enctype="multipart/form-data" class="form"><div class="grid4"><label>Nome sistema<input name="nomeSistema" value="${esc(c.nomeSistema)}"></label><label>Subtítulo<input name="subtitulo" value="${esc(c.subtitulo)}"></label><label>Tema<select name="tema">${['VERDE','AZUL','ESCURO','ROXO','LARANJA'].map(t=>`<option ${norm(c.tema)===t?'selected':''}>${t}</option>`).join('')}</select></label><label>Logo URL<input name="logoUrl" value="${esc(c.logoUrl)}"></label><label>Logo local<input type="file" name="logoLocal" accept="image/*"></label>${appLogo(d)?`<label>Logo atual<div class="logo-preview"><img src="${esc(appLogo(d))}" onerror="this.style.display='none'"></div></label>`:''}<label>Logo da O.S.<select name="usarLogoLojaOS"><option value="SIM" ${c.usarLogoLojaOS!=='NAO'?'selected':''}>REUTILIZAR LOGO DA LOJA</option><option value="NAO" ${c.usarLogoLojaOS==='NAO'?'selected':''}>USAR LOGO DA EMPRESA</option></select></label><label>Filial / nomes repetidos<select name="regraNomeFilial"><option value="ORIGINAL" ${c.regraNomeFilial==='ORIGINAL'?'selected':''}>ORIGINAL</option><option value="MESCLAR_NOME_CIDADE_UF" ${c.regraNomeFilial!=='ORIGINAL'?'selected':''}>MESCLAR NOME + CIDADE + UF</option></select></label></div><button>💾 Salvar</button></form></section><section class="card"><h2>Cadastros de apoio</h2><a class="btn" href="/usuarios">👤 Usuários/Analistas</a><a class="btn" href="/perfis">🔐 Perfis/Permissões</a><a class="btn" href="/backup">💾 Backup/Restauração</a><a class="btn" href="/tipos-servico">🛠️ Tipos de serviço</a><a class="btn" href="/diagnostico">🩺 Diagnóstico</a></section>`))});
app.post('/config',auth,need('CONFIG'),upload.single('logoLocal'),(req,res)=>{const d=load();Object.assign(d.config,{nomeSistema:norm(req.body.nomeSistema||d.config.nomeSistema),subtitulo:norm(req.body.subtitulo||d.config.subtitulo),tema:norm(req.body.tema||d.config.tema),logoUrl:(req.body.logoUrl||'').trim(),regraNomeFilial:req.body.regraNomeFilial||'ORIGINAL',usarLogoLojaOS:req.body.usarLogoLojaOS||d.config.usarLogoLojaOS||'SIM'});if(req.file){const logo=fileObj(req.file);d.config.logoEmpresaLocal=logo;d.config.logoLocal=logo;}save(d);res.redirect('/config')});
app.get('/diagnostico',auth,need('CONFIG'),(req,res)=>{const d=load();const ch=[['Usuários',d.usuarios.length],['Perfis',d.perfis.length],['Lojas',d.lojas.length],['Prestadores',d.prestadores.length],['Chamados',d.chamados.length],['Lembretes',d.lembretes.length],['Preventivas',d.preventivas.length],['Tipos de serviço',d.tiposServico.length]];res.send(page(req,'Diagnóstico',`<div class="bar"><h2>🩺 Diagnóstico</h2><a class="btn" href="/config">Voltar</a></div><div class="card">${tabela(['Módulo','Registros','OK'],ch.map(c=>`<tr><td>${c[0]}</td><td>${c[1]}</td><td>✅</td></tr>`))}</div>`))});

app.get('/usuarios',auth,need('USUARIOS'),(req,res)=>{const d=load(),q=norm(req.query.q||'');const lista=d.usuarios.filter(u=>!q||norm([u.nome,u.usuario,u.perfil,u.email].join(' ')).includes(q));res.send(page(req,'Usuários',`<div class="bar"><h2>👤 Usuários/Analistas</h2><a class="btn" href="/usuarios/novo">➕ Novo</a><a class="btn secondary" href="/config">Config</a></div>${busca('/usuarios','Buscar usuário, analista, perfil...')}<div class="card">${tabela(['Nome','Usuário','Perfil','Analista','Ativo','Ações'],lista.map(u=>`<tr><td>${esc(u.nome)}</td><td>${esc(u.usuario)}</td><td>${esc(u.perfil)}</td><td>${esc(u.analista||'SIM')}</td><td>${esc(u.ativo||'SIM')}</td><td><a class="btn small" href="/usuarios/${u.id}/editar">✏️ Editar</a>${norm(u.usuario)!=='OLITECH'?`<form class="inline-form" method="post" action="/usuarios/${u.id}/excluir"><button class="small danger">🗑️ Excluir</button></form>`:''}</td></tr>`))}</div>`))});
function usuarioForm(req,u={}){const d=load(),edit=!!u.id;return page(req,edit?'Editar usuário':'Novo usuário',`<div class="bar"><h2>${edit?'✏️ Editar':'➕ Novo'} usuário/analista</h2><a class="btn secondary" href="/usuarios">Voltar</a></div><form class="card form" method="post" enctype="multipart/form-data"><div class="grid4"><label>Nome<input name="nome" value="${esc(u.nome)}" required></label><label>Usuário<input name="usuario" value="${esc(u.usuario)}" required></label><label>Senha<input name="senha" value="${esc(u.senha)}" required></label><label>Perfil<select name="perfil">${d.perfis.map(p=>`<option ${norm(u.perfil||'ANALISTA')===norm(p.nome)?'selected':''}>${esc(p.nome)}</option>`).join('')}</select></label><label>Ativo<select name="ativo">${['SIM','NÃO'].map(x=>`<option ${norm(u.ativo||'SIM')===x?'selected':''}>${x}</option>`).join('')}</select></label><label>É analista?<select name="analista">${['SIM','NÃO'].map(x=>`<option ${norm(u.analista||'SIM')===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Email<input name="email" value="${esc(u.email)}"></label><label>Telefone<input name="telefone" value="${esc(u.telefone)}"></label><label>Assinatura digital<input type="file" name="assinatura" accept="image/*"></label>${v2088_assinaturaUsuario(d,u.nome||u.usuario)?`<label>Assinatura atual<div class="logo-preview"><img src="${esc(v2088_assinaturaUsuario(d,u.nome||u.usuario))}" onerror="this.style.display=\'none\'"></div></label>`:""}</div><h3>Permissões específicas</h3><div class="perm-grid">${PERMS.map(p=>`<label class="checkline"><input type="checkbox" name="permissoes" value="${p}" ${arr(u.permissoes).map(norm).includes(p)?'checked':''}> ${p.replaceAll('_',' ')}</label>`).join('')}</div><button>💾 Salvar</button></form>`)}
app.get('/usuarios/novo',auth,need('USUARIOS'),(req,res)=>res.send(usuarioForm(req)));app.get('/usuarios/:id/editar',auth,need('USUARIOS'),(req,res)=>res.send(usuarioForm(req,load().usuarios.find(u=>String(u.id)===String(req.params.id))||{})));app.post(['/usuarios/novo','/usuarios/:id/editar'],auth,need('USUARIOS'),upload.single('assinatura'),(req,res)=>{const d=load();let u=req.params.id?d.usuarios.find(x=>String(x.id)===String(req.params.id)):null;if(!u){u={id:next(d,'usuario')};d.usuarios.push(u)}Object.assign(u,{nome:norm(req.body.nome),usuario:norm(req.body.usuario),senha:String(req.body.senha||''),perfil:norm(req.body.perfil||'ANALISTA'),ativo:norm(req.body.ativo||'SIM'),analista:norm(req.body.analista||'SIM'),email:req.body.email||'',telefone:dig(req.body.telefone),permissoes:arr(req.body.permissoes).map(norm)});if(req.file){const sig=fileObj(req.file);u.assinaturaUsuario=sig;u.assinatura=sig;}save(d);res.redirect('/usuarios')});app.post('/usuarios/:id/excluir',auth,need('USUARIOS'),(req,res)=>{const d=load();d.usuarios=d.usuarios.filter(u=>String(u.id)!==String(req.params.id)||norm(u.usuario)==='OLITECH');save(d);res.redirect('/usuarios')});
app.get('/perfis',auth,need('USUARIOS'),(req,res)=>{const d=load();res.send(page(req,'Perfis',`<div class="bar"><h2>🔐 Perfis/Permissões</h2><a class="btn" href="/perfis/novo">➕ Novo</a></div><div class="card">${tabela(['Perfil','Permissões','Ações'],d.perfis.map(p=>`<tr><td>${esc(p.nome)}</td><td>${esc(arr(p.permissoes).join(', '))}</td><td><a class="btn small" href="/perfis/${p.id}/editar">✏️ Editar</a></td></tr>`))}</div>`))});function perfilForm(req,p={}){return page(req,'Perfil',`<div class="bar"><h2>🔐 Perfil</h2><a class="btn secondary" href="/perfis">Voltar</a></div><form class="card form" method="post"><label>Nome<input name="nome" value="${esc(p.nome)}" required></label><div class="perm-grid">${PERMS.map(x=>`<label class="checkline"><input type="checkbox" name="permissoes" value="${x}" ${arr(p.permissoes).map(norm).includes(x)?'checked':''}> ${x.replaceAll('_',' ')}</label>`).join('')}</div><button>💾 Salvar</button></form>`)}app.get('/perfis/novo',auth,need('USUARIOS'),(req,res)=>res.send(perfilForm(req)));app.get('/perfis/:id/editar',auth,need('USUARIOS'),(req,res)=>res.send(perfilForm(req,load().perfis.find(p=>String(p.id)===String(req.params.id))||{})));app.post(['/perfis/novo','/perfis/:id/editar'],auth,need('USUARIOS'),(req,res)=>{const d=load();let p=req.params.id?d.perfis.find(x=>String(x.id)===String(req.params.id)):null;if(!p){p={id:next(d,'perfil')};d.perfis.push(p)}p.nome=norm(req.body.nome);p.permissoes=arr(req.body.permissoes).map(norm);save(d);res.redirect('/perfis')});


/* PATCH V20.8.14 - preserva nome da loja exatamente como exibido no formulário ao SALVAR */
function v20813_cleanLojaNomeSave(req){
  const body = req.body || {};
  const nomeCampo = body.nome || body.nomeLoja || body.lojaNome || body.loja || '';
  const nome = String(nomeCampo || '').trim().toUpperCase().replace(/\s+/g,' ');
  if(!nome) return '';
  return nome;
}
function v20813_aplicarNomeLojaTratado(req, loja){
  const nome = v20813_cleanLojaNomeSave(req);
  if(nome){
    loja.nome = nome;
    loja.nomeLoja = nome;
    loja.lojaNome = nome;
  }
  return loja;
}


/* PATCH V20.8.14 - nome da loja importada por PDF preservado no salvar */
function v20814_nomeLojaFinal(req,l){
  const b=req.body||{};
  let nome=String(b.nome||b.nomeTratadoPdf||b.nomeLoja||b.lojaNome||'').trim().toUpperCase().replace(/\s+/g,' ');
  const cidade=String(b.cidade||l?.cidade||'').trim().toUpperCase().replace(/\s+/g,' ');
  const uf=String(b.uf||b.estado||l?.uf||l?.estado||'').trim().toUpperCase().replace(/\s+/g,' ');
  const base=String((load().config&&(load().config.nomeBaseFilial||load().config.nomeBaseLoja))||'MEGA VEST CASA').trim().toUpperCase();
  const limpo=nome.replace(/\b(LTDA|ME|EPP|EIRELI|S\/A|SA)\b/g,'').replace(/\s+/g,' ').trim();
  if((limpo===base || limpo==='MEGA VEST CASA') && cidade && uf) nome=`${base} ${cidade} - ${uf}`;
  if(nome){ l.nome=nome; l.nomeLoja=nome; l.lojaNome=nome; }
  return l;
}

function lojaForm(req,l={}){const d=load(),edit=!!l.id;return page(req,edit?'Editar loja':'Nova loja',`<div class="bar"><h2>${edit?'✏️ Editar':'➕ Nova'} loja</h2><a class="btn secondary" href="/lojas">Voltar</a></div><form class="card form" method="post" enctype="multipart/form-data"><details open><summary>📄 Preencher por PDF/cartão CNPJ</summary><input type="file" name="pdf" accept=".pdf"><button name="acao" value="pdf" formnovalidate>🔎 Pesquisar PDF</button><p class="hint">Ao importar PDF de filial, aplica a regra da Config: MEGA VEST CASA + CIDADE + UF.</p></details><div class="grid4"><label>Código/Filial<input name="codigo" value="${esc(l.codigo||l.id||'')}"></label><label>Tipo código<select name="tipoCodigo"><option>${esc(l.tipoCodigo||'SOMENTE NÚMERO')}</option><option>SOMENTE NÚMERO</option><option>NOME + NÚMERO</option></select></label><label>Nome loja<input name="nome" value="${esc(l.nome)}" required><input type="hidden" name="nomeTratadoPdf" value="${esc(l.nome)}"></label><label>Responsável loja<input name="responsavel" value="${esc(l.responsavel)}"></label><label>CNPJ<input name="cnpj" value="${esc(l.cnpj)}" data-mask="cnpj"></label><label>I.E.<input name="ie" value="${esc(l.ie)}"></label><label>Telefone<input name="telefone" value="${esc(l.telefone)}" data-mask="telefone"></label><label>WhatsApp responsável<input name="whatsappResponsavel" value="${esc(l.whatsappResponsavel||'')}" data-mask="telefone"></label><label>CEP<input name="cep" value="${esc(l.cep)}" data-mask="cep"></label><label>Estado/UF<input name="uf" value="${esc(l.uf||l.estado)}"></label><label>Cidade<input name="cidade" value="${esc(l.cidade)}"></label><label>Endereço<input name="endereco" value="${esc(l.endereco)}"></label><label>Latitude<input name="latitude" value="${esc(l.latitude)}"></label><label>Longitude<input name="longitude" value="${esc(l.longitude)}"></label><label>Analista responsável<input name="analista" value="${esc(l.analista)}" data-auto="analistas"></label><label>Proprietário<input name="proprietario" value="${esc(l.proprietario)}" data-auto="proprietarios"></label><label>Feriado<select name="feriado"><option ${norm(l.feriado||'FECHADO')==='FECHADO'?'selected':''}>FECHADO</option><option ${norm(l.feriado)==='ABERTO'?'selected':''}>ABERTO</option></select></label><label>Logo URL<input name="logoUrl" value="${esc(l.logoUrl)}"></label><label>Logo local<input type="file" name="logoLocal" accept="image/*"></label><label>Cartão CNPJ<input type="file" name="cartaoCnpj"></label><label>Fotos<input type="file" name="fotos" multiple></label></div><details><summary>⏰ Horário funcionamento</summary><div class="grid4"><label>Seg-sex abre<input name="horaSegSexAbre" data-mask="hora" value="${esc(l.horaSegSexAbre)}" placeholder="HH:MM"></label><label>Seg-sex fecha<input name="horaSegSexFecha" data-mask="hora" value="${esc(l.horaSegSexFecha)}" placeholder="HH:MM"></label><label>Sábado abre<input name="horaSabAbre" data-mask="hora" value="${esc(l.horaSabAbre)}" placeholder="HH:MM"></label><label>Sábado fecha<input name="horaSabFecha" data-mask="hora" value="${esc(l.horaSabFecha)}" placeholder="HH:MM"></label><label>Domingo/Feriado<select name="domFeriadoStatus"><option ${norm(l.domFeriadoStatus||'FECHADO')==='FECHADO'?'selected':''}>FECHADO</option><option ${norm(l.domFeriadoStatus)==='ABERTO'?'selected':''}>ABERTO</option></select></label></div><textarea name="horario" placeholder="Observações">${esc(l.horario)}</textarea></details><div class="actions"><button>💾 Salvar</button><button type="button" data-cep>🔎 Buscar CEP</button><button type="button" data-cnpj>🔎 Buscar CNPJ</button><button type="button" data-geo>📍 Gerar localização</button></div></form>`)}
app.get('/lojas',auth,need('LOJAS'),(req,res)=>{const d=load(),q=norm(req.query.q||''),show=req.query.mostrar||q;const lista=show?d.lojas.filter(l=>!q||norm([l.nome,l.codigo,l.cidade,l.uf,l.cnpj,l.cep,l.telefone].join(' ')).includes(q)):[];res.send(page(req,'Lojas',`<div class="bar"><h2>🏬 Lojas</h2><a class="btn" href="/lojas/nova">➕ Nova loja</a></div>${busca('/lojas','Buscar loja, cidade, CNPJ, CEP...')}<div class="card">${tabela(['Código','Loja','Cidade/UF','Analista','Telefone','Ações'],lista.map(l=>`<tr><td>${esc(l.codigo||l.id)}</td><td>${esc(l.nome)}</td><td>${esc(l.cidade)}/${esc(l.uf)}</td><td>${esc(l.analista)}</td><td>${esc(l.telefone)}</td><td><a class="btn small" href="/lojas/${l.id}/editar">✏️ Editar</a><form class="inline-form" method="post" action="/lojas/${l.id}/excluir"><button class="small danger">🗑️ Excluir</button></form></td></tr>`),'Use a busca ou Mostrar todos.')}</div>`))});app.get('/lojas/nova',auth,need('LOJAS'),(req,res)=>res.send(lojaForm(req)));app.get('/lojas/:id/editar',auth,need('LOJAS'),(req,res)=>res.send(lojaForm(req,load().lojas.find(l=>String(l.id)===String(req.params.id))||{})));app.post(['/lojas/nova','/lojas/:id/editar'],auth,need('LOJAS'),upload.fields([{name:'pdf',maxCount:1},{name:'logoLocal',maxCount:1},{name:'cartaoCnpj',maxCount:1},{name:'fotos',maxCount:20}]),async(req,res)=>{try{const d=load();let l=req.params.id?d.lojas.find(x=>String(x.id)===String(req.params.id)):null;if(!l){l={id:next(d,'loja')};d.lojas.push(l)}if(req.body.acao==='pdf'&&req.files?.pdf?.[0]){const p=await parsePdf(req.files.pdf[0].path);Object.assign(req.body,{...req.body,...p});if(d.config.regraNomeFilial!=='ORIGINAL'&&p.nome&&p.cidade){req.body.nome=mesclaFilial(p.nome,p.cidade,p.uf||req.body.uf);req.body.nomeSugestaoFilial=req.body.nome}}Object.assign(l,{codigo:req.body.codigo||l.codigo||l.id,tipoCodigo:req.body.tipoCodigo,nome:norm(req.body.nome),responsavel:norm(req.body.responsavel),cnpj:dig(req.body.cnpj),ie:norm(req.body.ie),telefone:dig(req.body.telefone),whatsappResponsavel:dig(req.body.whatsappResponsavel),cep:dig(req.body.cep),uf:norm(req.body.uf||req.body.estado),estado:norm(req.body.uf||req.body.estado),cidade:norm(req.body.cidade),endereco:norm(req.body.endereco),latitude:req.body.latitude||'',longitude:req.body.longitude||'',analista:norm(req.body.analista),proprietario:norm(req.body.proprietario),feriado:norm(req.body.feriado||'FECHADO'),domFeriadoStatus:norm(req.body.domFeriadoStatus||''),horaSegSexAbre:req.body.horaSegSexAbre||'',horaSegSexFecha:req.body.horaSegSexFecha||'',horaSabAbre:req.body.horaSabAbre||'',horaSabFecha:req.body.horaSabFecha||'',logoUrl:req.body.logoUrl||'',horario:req.body.horario||''});v20814_nomeLojaFinal(req,l);if(req.files?.logoLocal?.[0])l.logoLocal=fileObj(req.files.logoLocal[0]);if(req.files?.cartaoCnpj?.[0])l.cartaoCnpj=fileObj(req.files.cartaoCnpj[0]);l.fotos=[...arr(l.fotos),...manyFiles(req,'fotos')];save(d);res.redirect(`/lojas/${l.id}/editar`)}catch(e){res.status(500).send(errorPage(req,e))}});app.post('/lojas/:id/excluir',auth,need('LOJAS'),(req,res)=>{const d=load();d.lojas=d.lojas.filter(x=>String(x.id)!==String(req.params.id));save(d);res.redirect('/lojas')});

function prestadorForm(req,p={}){const d=load();return page(req,p.id?'Editar prestador':'Novo prestador',`<div class="bar"><h2>🧰 ${p.id?'Editar':'Novo'} prestador</h2><a class="btn secondary" href="/prestadores">Voltar</a></div><form class="card form" method="post" enctype="multipart/form-data"><details open><summary>📄 Preencher por PDF/cartão CNPJ</summary><input type="file" name="pdf" accept=".pdf"><button name="acao" value="pdf" formnovalidate>🔎 Pesquisar PDF</button><p class="hint">Ao importar PDF de filial, aplica a regra da Config: MEGA VEST CASA + CIDADE + UF.</p></details><div class="grid4"><label>Empresa<input name="empresa" value="${esc(p.empresa)}"></label><label>Nome responsável<input name="responsavel" value="${esc(p.responsavel)}"></label><label>Telefone<input name="telefone" value="${esc(p.telefone)}" data-mask="telefone"></label><label>Email<input name="email" value="${esc(p.email)}"></label><label>CNPJ<input name="cnpj" value="${esc(p.cnpj)}" data-mask="cnpj"></label><label>CPF<input name="cpf" value="${esc(p.cpf)}" data-mask="cpf"></label><label>CPF/CNH<input name="cpfCnh" value="${esc(p.cpfCnh)}"></label><label>CEP<input name="cep" value="${esc(p.cep)}" data-mask="cep"></label><label>Estado/UF<input name="uf" value="${esc(p.uf||p.estado)}"></label><label>Cidade<input name="cidade" value="${esc(p.cidade)}"></label><label>Endereço<input name="endereco" value="${esc(p.endereco)}"></label><label>Ativo<select name="ativo"><option ${norm(p.ativo||'SIM')==='SIM'?'selected':''}>SIM</option><option ${norm(p.ativo)==='NÃO'?'selected':''}>NÃO</option></select></label><label>Raio KM<input name="raioKm" value="${esc(p.raioKm)}"></label><label>Valor por KM<input name="valorKm" value="${esc(p.valorKm)}"></label><label>Latitude<input name="latitude" value="${esc(p.latitude)}"></label><label>Longitude<input name="longitude" value="${esc(p.longitude)}"></label><label>Tipo pagamento<select name="tipoPagamento"><option>${esc(p.tipoPagamento||'PIX')}</option><option>PIX</option><option>CONTA</option><option>DINHEIRO</option></select></label><label>Dados pagamento<input name="dadosPagamento" value="${esc(p.dadosPagamento)}"></label><label>Logo URL<input name="logoUrl" value="${esc(p.logoUrl)}"></label><label>Logo local<input type="file" name="logoLocal"></label><label>Cartão CNPJ<input type="file" name="cartaoCnpj"></label><label>Fotos<input type="file" name="fotos" multiple></label></div><h3>Serviços realizados</h3><button type="button" class="btn secondary" onclick="abrirServicosModal()">🛠️ Selecionar / editar serviços</button><details open><summary>Serviços selecionados</summary><div class="perm-grid" id="servicosGrid">${d.tiposServico.map(s=>`<label class="checkline"><input type="checkbox" name="servicos" value="${esc(s)}" ${arr(p.servicos).map(norm).includes(norm(s))?'checked':''}> ${esc(s)}</label>`).join('')}</div></details><dialog id="modalServicos" class="modal"><h3>🛠️ Serviços realizados</h3><div id="modalServicosLista"></div><div class="search"><input id="novoServicoModal" placeholder="NOVO SERVIÇO"><button type="button" onclick="criarServicoModal()">➕ Novo</button></div><button type="button" onclick="fecharServicosModal()">✅ Concluir</button></dialog><div class="actions"><button>💾 Salvar</button><button type="button" data-cep>🔎 Buscar CEP</button><button type="button" data-cnpj>🔎 Buscar CNPJ</button><button type="button" data-geo>📍 Gerar localização</button></div></form>`)}
app.get('/prestadores',auth,need('PRESTADORES'),(req,res)=>{const d=load(),q=norm(req.query.q||''),show=req.query.mostrar||q;const lista=show?d.prestadores.filter(p=>!q||norm([p.empresa,p.responsavel,p.cidade,p.uf,p.cnpj,p.cpf,p.telefone,arr(p.servicos).join(' ')].join(' ')).includes(q)):[];res.send(page(req,'Prestadores',`<div class="bar"><h2>🧰 Prestadores</h2><a class="btn" href="/prestadores/novo">➕ Novo</a></div>${busca('/prestadores','Buscar prestador, CNPJ, cidade, serviço...')}<div class="card">${tabela(['Empresa','Responsável','Cidade/UF','Telefone','Serviços','Ações'],lista.map(p=>`<tr><td>${esc(p.empresa)}</td><td>${esc(p.responsavel)}</td><td>${esc(p.cidade)}/${esc(p.uf)}</td><td>${esc(p.telefone)}</td><td>${esc(arr(p.servicos).join(', '))}</td><td><a class="btn small" href="/prestadores/${p.id}/editar">✏️ Editar</a><form class="inline-form" method="post" action="/prestadores/${p.id}/excluir"><button class="small danger">🗑️ Excluir</button></form></td></tr>`),'Use a busca ou Mostrar todos.')}</div>`))});app.get('/prestadores/novo',auth,need('PRESTADORES'),(req,res)=>res.send(prestadorForm(req)));app.get('/prestadores/:id/editar',auth,need('PRESTADORES'),(req,res)=>res.send(prestadorForm(req,load().prestadores.find(p=>String(p.id)===String(req.params.id))||{})));app.post(['/prestadores/novo','/prestadores/:id/editar'],auth,need('PRESTADORES'),upload.fields([{name:'pdf',maxCount:1},{name:'logoLocal',maxCount:1},{name:'cartaoCnpj',maxCount:1},{name:'fotos',maxCount:20}]),async(req,res)=>{try{const d=load();let p=req.params.id?d.prestadores.find(x=>String(x.id)===String(req.params.id)):null;if(!p){p={id:next(d,'prestador')};d.prestadores.push(p)}if(req.body.acao==='pdf'&&req.files?.pdf?.[0])Object.assign(req.body,{...req.body,...await parsePdf(req.files.pdf[0].path)});Object.assign(p,{empresa:norm(req.body.empresa||req.body.nome||req.body.razao||req.body.fantasia),responsavel:norm(req.body.responsavel||req.body.nome||req.body.razao||req.body.fantasia),telefone:dig(req.body.telefone),email:req.body.email||'',cnpj:dig(req.body.cnpj),cpf:dig(req.body.cpf),cpfCnh:req.body.cpfCnh||'',cep:dig(req.body.cep),uf:norm(req.body.uf),estado:norm(req.body.uf),cidade:norm(req.body.cidade),endereco:norm(req.body.endereco),ativo:norm(req.body.ativo||'SIM'),raioKm:req.body.raioKm||'',valorKm:req.body.valorKm||'',latitude:req.body.latitude||'',longitude:req.body.longitude||'',tipoPagamento:req.body.tipoPagamento||'PIX',dadosPagamento:req.body.dadosPagamento||'',servicos:arr(req.body.servicos).map(norm),logoUrl:req.body.logoUrl||''});if(req.files?.logoLocal?.[0])p.logoLocal=fileObj(req.files.logoLocal[0]);if(req.files?.cartaoCnpj?.[0])p.cartaoCnpj=fileObj(req.files.cartaoCnpj[0]);p.fotos=[...arr(p.fotos),...manyFiles(req,'fotos')];save(d);res.redirect(`/prestadores/${p.id}/editar`)}catch(e){res.status(500).send(errorPage(req,e))}});app.post('/prestadores/:id/excluir',auth,need('PRESTADORES'),(req,res)=>{const d=load();d.prestadores=d.prestadores.filter(x=>String(x.id)!==String(req.params.id));save(d);res.redirect('/prestadores')});
app.get('/api/tipos-servico',auth,(req,res)=>res.json({ok:true,items:load().tiposServico.map((nome,id)=>({id,nome}))}));app.post('/api/tipos-servico',auth,need('CONFIG'),(req,res)=>{const d=load(),nome=norm(req.body.nome);if(nome&&!d.tiposServico.map(norm).includes(nome))d.tiposServico.push(nome);save(d);res.json({ok:true,items:d.tiposServico})});app.post('/api/tipos-servico/:i',auth,need('CONFIG'),(req,res)=>{const d=load(),i=Number(req.params.i);if(d.tiposServico[i]!==undefined)d.tiposServico[i]=norm(req.body.nome);save(d);res.json({ok:true})});app.delete('/api/tipos-servico/:i',auth,need('CONFIG'),(req,res)=>{const d=load(),i=Number(req.params.i);if(d.tiposServico[i]!==undefined)d.tiposServico.splice(i,1);save(d);res.json({ok:true})});
app.get('/tipos-servico',auth,need('CONFIG'),(req,res)=>{const d=load();res.send(page(req,'Tipos de serviço',`<div class="bar"><h2>🛠️ Tipos de serviço</h2><a class="btn" href="/config">Voltar</a></div><form class="card search" method="post"><input name="nome" placeholder="Novo serviço" required><button>➕ Cadastrar</button></form><div class="card">${tabela(['Serviço','Ações'],d.tiposServico.map((s,i)=>`<tr><td>${esc(s)}</td><td><form class="inline-form" method="post" action="/tipos-servico/${i}/editar"><input name="nome" value="${esc(s)}"><button class="small">💾 Editar</button></form><form class="inline-form" method="post" action="/tipos-servico/${i}/excluir"><button class="small danger">🗑️ Excluir</button></form></td></tr>`))}</div>`))});app.post('/tipos-servico',auth,need('CONFIG'),(req,res)=>{const d=load(),n=norm(req.body.nome);if(n&&!d.tiposServico.map(norm).includes(n))d.tiposServico.push(n);save(d);res.redirect('/tipos-servico')});app.post('/tipos-servico/:i/editar',auth,need('CONFIG'),(req,res)=>{const d=load(),i=Number(req.params.i);if(d.tiposServico[i])d.tiposServico[i]=norm(req.body.nome);save(d);res.redirect('/tipos-servico')});app.post('/tipos-servico/:i/excluir',auth,need('CONFIG'),(req,res)=>{const d=load();d.tiposServico.splice(Number(req.params.i),1);save(d);res.redirect('/tipos-servico')});

function proprietarioForm(req,p={}){return page(req,p.id?'Editar proprietário':'Novo proprietário',`<div class="bar"><h2>👥 ${p.id?'Editar':'Novo'} proprietário</h2><a class="btn secondary" href="/proprietarios">Voltar</a></div><form class="card form" method="post" enctype="multipart/form-data"><div class="grid4"><label>Nome<input name="nome" value="${esc(p.nome)}" required></label><label>CNPJ<input name="cnpj" value="${esc(p.cnpj)}" data-mask="cnpj"></label><label>CPF<input name="cpf" value="${esc(p.cpf)}" data-mask="cpf"></label><label>Telefone<input name="telefone" value="${esc(p.telefone)}" data-mask="telefone"></label><label>CEP<input name="cep" value="${esc(p.cep)}" data-mask="cep"></label><label>UF<input name="uf" value="${esc(p.uf)}"></label><label>Cidade<input name="cidade" value="${esc(p.cidade)}"></label><label>Endereço<input name="endereco" value="${esc(p.endereco)}"></label><label>Cartão CNPJ<input type="file" name="cartaoCnpj"></label><label>Fotos<input type="file" name="fotos" multiple></label></div><button>💾 Salvar</button></form>`)}
app.get('/proprietarios',auth,need('PROPRIETARIOS'),(req,res)=>{const d=load(),q=norm(req.query.q||''),show=req.query.mostrar||q;const lista=show?d.proprietarios.filter(p=>!q||norm([p.nome,p.cnpj,p.cpf,p.cidade,p.telefone].join(' ')).includes(q)):[];res.send(page(req,'Proprietários',`<div class="bar"><h2>👥 Proprietários</h2><a class="btn" href="/proprietarios/novo">➕ Novo</a></div>${busca('/proprietarios','Buscar proprietário...')}<div class="card">${tabela(['Nome','Cidade/UF','Documento','Telefone','Ações'],lista.map(p=>`<tr><td>${esc(p.nome)}</td><td>${esc(p.cidade)}/${esc(p.uf)}</td><td>${esc(p.cnpj||p.cpf)}</td><td>${esc(p.telefone)}</td><td><a class="btn small" href="/proprietarios/${p.id}/editar">✏️ Editar</a><form class="inline-form" method="post" action="/proprietarios/${p.id}/excluir"><button class="small danger">🗑️ Excluir</button></form></td></tr>`),'Use a busca ou Mostrar todos.')}</div>`))});app.get('/proprietarios/novo',auth,need('PROPRIETARIOS'),(req,res)=>res.send(proprietarioForm(req)));app.get('/proprietarios/:id/editar',auth,need('PROPRIETARIOS'),(req,res)=>res.send(proprietarioForm(req,load().proprietarios.find(p=>String(p.id)===String(req.params.id))||{})));app.post(['/proprietarios/novo','/proprietarios/:id/editar'],auth,need('PROPRIETARIOS'),upload.fields([{name:'cartaoCnpj',maxCount:1},{name:'fotos',maxCount:20}]),(req,res)=>{const d=load();let p=req.params.id?d.proprietarios.find(x=>String(x.id)===String(req.params.id)):null;if(!p){p={id:next(d,'proprietario')};d.proprietarios.push(p)}Object.assign(p,{nome:norm(req.body.nome),cnpj:dig(req.body.cnpj),cpf:dig(req.body.cpf),telefone:dig(req.body.telefone),whatsappResponsavel:dig(req.body.whatsappResponsavel),cep:dig(req.body.cep),uf:norm(req.body.uf),cidade:norm(req.body.cidade),endereco:norm(req.body.endereco)});if(req.files?.cartaoCnpj?.[0])p.cartaoCnpj=fileObj(req.files.cartaoCnpj[0]);p.fotos=[...arr(p.fotos),...manyFiles(req,'fotos')];save(d);res.redirect('/proprietarios')});app.post('/proprietarios/:id/excluir',auth,need('PROPRIETARIOS'),(req,res)=>{const d=load();d.proprietarios=d.proprietarios.filter(x=>String(x.id)!==String(req.params.id));save(d);res.redirect('/proprietarios')});

function chamadoForm(req,c={}){const d=load(),edit=!!c.id;return page(req,edit?'Editar chamado':'Novo chamado',`<div class="bar"><h2>🎫 ${edit?'Editar':'Novo'} chamado</h2><a class="btn secondary" href="/chamados">Voltar</a></div><form class="card form" method="post" enctype="multipart/form-data"><div class="grid4"><label>Tipo número<select name="tipoNumero"><option>AUTOMÁTICO</option><option ${norm(c.tipoNumero)==='TERCEIRO'?'selected':''}>TERCEIRO</option></select></label><label>Nº chamado terceiro<input name="numeroExterno" value="${esc(c.numeroExterno)}"></label><label>Loja<input name="lojaNome" value="${esc(c.lojaNome)}" data-auto="lojas" required></label><label>Analista<input name="analista" value="${esc(c.analista)}" data-auto="analistas"></label><label>Tipo serviço<select name="tipoServico" id="tipoServico">${d.tiposServico.map(s=>`<option ${norm(c.tipoServico||'A DEFINIR')===norm(s)?'selected':''}>${esc(s)}</option>`).join('')}</select></label><label>Prestador <button type="button" class="mini-inline" id="btnSugestaoInline">🎯 Sugerir</button><input name="prestadorNome" id="prestadorNome" value="${esc(c.prestadorNome)}" data-auto="prestadores"></label><label>Prioridade<select name="prioridade">${['MÍNIMA','MÉDIA','MÁXIMA'].map(s=>`<option ${norm(c.prioridade||'MÉDIA')===s?'selected':''}>${s}</option>`).join('')}</select></label><label>Status<select name="status">${d.statusChamado.map(s=>`<option ${norm(c.status||'ABERTO')===norm(s)?'selected':''}>${esc(s)}</option>`).join('')}</select></label><label>Valor serviço<input name="valor" value="${esc(c.valor||0)}"></label><label>Data orçamento<input type="date" name="dataOrcamento" value="${esc(c.dataOrcamento)}"></label><label>Data agendada<input type="date" name="dataAgendada" value="${esc(c.dataAgendada)}"></label><label>Por conta proprietário?<select name="servicoProprietario"><option ${norm(c.servicoProprietario||'NÃO')==='NÃO'?'selected':''}>NÃO</option><option ${norm(c.servicoProprietario)==='SIM'?'selected':''}>SIM</option></select></label></div><label>Descrição serviços<textarea name="descricao" required>${esc(c.descricao)}</textarea></label><label>Observações<textarea name="observacoes">${esc(c.observacoes)}</textarea></label><label>Anexos/imagens<input type="file" name="anexos" multiple></label><div class="actions"><button type="button" id="btnSugestao">🎯 Sugerir prestador</button><a class="btn secondary" href="/tipos-servico">🛠️ Tipos de serviço</a><button>💾 Salvar</button>${edit?`<a class="btn" href="/os/nova?q=${encodeURIComponent(c.numeroInterno||c.id)}">📄 Gerar O.S.</a>`:''}</div><div id="sugestoes" class="hint"></div></form>`)}
app.get('/chamados',auth,need('CHAMADOS'),(req,res)=>{const d=load(),q=norm(req.query.q||''),analista=norm(req.query.analista||''),show=req.query.mostrar||q||analista;let lista=show?d.chamados.filter(c=>!finalizado(c.status)):[];if(q)lista=lista.filter(c=>norm([c.numeroInterno,c.numeroExterno,c.lojaNome,c.prestadorNome,c.analista,c.status,c.tipoServico,c.descricao].join(' ')).includes(q));if(analista)lista=lista.filter(c=>norm(c.analista).includes(analista));res.send(page(req,'Chamados',`<div class="bar"><h2>🎫 Chamados</h2><a class="btn" href="/chamados/rapido">➕ Chamado rápido</a><a class="btn secondary" href="/chamados/novo-completo">🎫 Chamado completo</a></div><form class="card search" method="get"><input name="q" placeholder="Buscar chamado, loja, prestador..."><input name="analista" placeholder="Analista" data-auto="analistas"><button>🔎 Buscar</button><a class="btn" href="/chamados?mostrar=1">Mostrar todos</a></form><div class="card">${tabela(['Nº','Loja','Analista','Prestador','Serviço','Prioridade','Status','Data','Ações'],lista.map(c=>`<tr><td>${esc(c.numeroInterno||c.id)}</td><td>${esc(c.lojaNome)}</td><td>${esc(c.analista)}</td><td>${esc(c.prestadorNome)}</td><td>${esc(c.tipoServico)}</td><td>${esc(c.prioridade)}</td><td>${esc(c.status)}</td><td>${br(c.dataAbertura)}</td><td><a class="btn small" href="/chamados/${c.id}/editar">🛠️ Tratar</a><form class="inline-form" method="post" action="/chamados/${c.id}/migrar"><input name="analista" placeholder="Novo analista" data-auto="analistas"><button class="small">👤 Migrar</button></form></td></tr>`),'Use a busca ou Mostrar todos.')}</div>`))});app.get('/chamados-por-analista',auth,need('CHAMADOS'),(req,res)=>{req.query.analista=req.query.analista||user(req).nome; req.query.mostrar='1'; const d=load(),a=norm(req.query.analista),lista=d.chamados.filter(c=>!finalizado(c.status)&&(!a||norm(c.analista).includes(a)));res.send(page(req,'Chamados por Analista',`<div class="bar"><h2>👤 Chamados por Analista</h2><a class="btn" href="/chamados">Todos</a></div><form class="card search" method="get"><input name="analista" value="${esc(req.query.analista)}" data-auto="analistas"><button>Buscar</button></form><div class="card">${tabela(['Nº','Loja','Analista','Prestador','Serviço','Status','Ações'],lista.map(c=>`<tr><td>${esc(c.numeroInterno)}</td><td>${esc(c.lojaNome)}</td><td>${esc(c.analista)}</td><td>${esc(c.prestadorNome)}</td><td>${esc(c.tipoServico)}</td><td>${esc(c.status)}</td><td><a class="btn small" href="/chamados/${c.id}/editar">Tratar</a></td></tr>`))}</div>`))});app.get(['/chamados/novo-completo','/chamados/novo','/chamados/rapido'],auth,need('CHAMADOS'),(req,res)=>res.send(chamadoForm(req)));app.get('/chamados/:id/editar',auth,need('CHAMADOS'),(req,res)=>res.send(chamadoForm(req,load().chamados.find(c=>String(c.id)===String(req.params.id))||{})));app.post(['/chamados/novo-completo','/chamados/novo','/chamados/rapido','/chamados/:id/editar'],auth,need('CHAMADOS'),upload.fields([{name:'anexos',maxCount:30}]),(req,res)=>{const d=load();let c=req.params.id?d.chamados.find(x=>String(x.id)===String(req.params.id)):null;if(!c){c={id:next(d,'chamado'),numeroInterno:next(d,'numeroChamado'),criadoEm:now(),abertoPor:user(req).nome};d.chamados.push(c)}const loja=findLoja(d,req.body.lojaNome),prest=findPrestador(d,req.body.prestadorNome);Object.assign(c,{tipoNumero:req.body.tipoNumero||'AUTOMÁTICO',numeroExterno:dig(req.body.numeroExterno),lojaId:loja.id||'',lojaNome:norm(req.body.lojaNome||loja.nome),analista:norm(req.body.analista),prestadorId:prest.id||'',prestadorNome:norm(req.body.prestadorNome||prest.empresa||prest.responsavel),tipoServico:norm(req.body.tipoServico||'A DEFINIR'),prioridade:norm(req.body.prioridade||'MÉDIA'),status:norm(req.body.status||'ABERTO'),valor:money(req.body.valor),dataOrcamento:req.body.dataOrcamento||'',dataAgendada:req.body.dataAgendada||'',dataAbertura:c.dataAbertura||today(),descricao:norm(req.body.descricao),observacoes:norm(req.body.observacoes),servicoProprietario:norm(req.body.servicoProprietario||'NÃO'),atualizadoEm:now()});c.anexos=[...arr(c.anexos),...manyFiles(req,'anexos')];save(d);res.redirect(`/chamados/${c.id}/editar`)});app.post('/chamados/:id/migrar',auth,need('CHAMADOS'),(req,res)=>{const d=load(),c=d.chamados.find(x=>String(x.id)===String(req.params.id));if(c){c.historico=arr(c.historico);c.historico.push({tipo:'MIGRAR_ANALISTA',de:c.analista,para:norm(req.body.analista),por:user(req).nome,data:now()});c.analista=norm(req.body.analista);save(d)}res.redirect('/chamados?mostrar=1')});


/* V16.1 - impressão de O.S. no padrão enviado pelo usuário */
function osLogoEscolhido(d,loja){if((d.config.usarLogoLojaOS||'SIM')!=='NAO')return publicFile(loja.logoLocal)||loja.logoUrl||appLogo(d);return appLogo(d)||publicFile(loja.logoLocal)||loja.logoUrl}

/* ================= PATCH V20.8.14 - OS AGRUPADA + ASSINATURA + WHATSAPP LOJA ================= */
function os83State(){ return load(); }
function os83Closed(c){ return finalizado(c.status) || finalizado(c.statusOs); }
function os83Num(c){ return c.numeroInterno || c.numeroExterno || c.numero || c.id || ''; }
function os83GroupKey(c){ return `${norm(c.lojaNome||c.loja||'SEM LOJA')}|||${norm(c.prestadorNome||c.prestador||'SEM PRESTADOR')}`; }
function os83Loja(d,c,os={}){ return d.lojas.find(l=>String(l.id)===String(c.lojaId||os.lojaId||'')) || findLoja(d,c.lojaNome||os.lojaNome||c.loja||'') || {}; }
function os83Prestador(d,c,os={}){ return d.prestadores.find(p=>String(p.id)===String(c.prestadorId||os.prestadorId||'')) || findPrestador(d,c.prestadorNome||os.prestadorNome||c.prestador||'') || {}; }
function os83UserByAnalista(d,req,nome){
  const sess=user(req)||{};
  return d.usuarios.find(u=>String(u.id)===String(sess.id||'')) ||
         d.usuarios.find(u=>norm(u.usuario)===norm(sess.usuario||'')) ||
         d.usuarios.find(u=>norm(u.nome)===norm(nome||'')) ||
         d.usuarios.find(u=>norm(u.usuario)===norm(nome||'')) || sess || {};
}
function os83Assinatura(d,req,chamados){
  const lista=Array.isArray(chamados)?chamados:[];
  const nome=(lista.find(c=>c.analista)?.analista)||user(req)?.nome||user(req)?.usuario||'';
  const u=os83UserByAnalista(d,req,nome);
  const bruto = u.assinaturaUsuario || u.assinaturaDigital || u.assinaturaLocal || u.assinatura || u.assinaturaUrl || u.imagemAssinatura || u.fotoAssinatura || u.signature || u.signatureImage || '';
  const img = v2088_publicImg(bruto);
  const nomeFinal = u.nome || nome || '';
  return img ? `<img class="assinatura-digital-os" src="${esc(img)}" onerror="this.remove()"><br><span>${esc(nomeFinal)}</span>` : `<span>${esc(nomeFinal)}</span>`;
}
function os83WhatsappLink(tel,msg){ const n=dig(tel); return n?`https://wa.me/55${n}?text=${encodeURIComponent(msg)}`:''; }
function os83Ids(v){ return arr(v).map(String); }
function os83ChamadosDaOS(d,os){
  const ids=os83Ids(os.chamados||os.chamadoIds||os.chamadosIds);
  let ch=d.chamados.filter(c=>ids.includes(String(c.id)) || ids.includes(String(os83Num(c))));
  if(!ch.length && os.id) ch=d.chamados.filter(c=>String(c.osId||'')===String(os.id));
  return ch;
}

app.get('/os',auth,need('ORDENS_SERVICO'),(req,res)=>{
  const d=os83State();
  const rows=d.os.map(o=>`<tr><td>${esc(o.numero||o.numeroOs||o.id)}</td><td>${esc(o.lojaNome||'')}</td><td>${esc(o.prestadorNome||'')}</td><td>${os83Ids(o.chamados||o.chamadoIds).length}</td><td>${moeda(o.valorTotal||0)}</td><td><a class="btn small" href="/os-impressao/${o.id}">🖨️ VER/IMPRIMIR</a></td></tr>`);
  res.send(page(req,'ORDENS DE SERVIÇO',`<div class="bar"><h2>📄 ORDENS DE SERVIÇO</h2><a class="btn" href="/os/nova">➕ GERAR O.S.</a></div><div class="card">${tabela(['Nº','LOJA','PRESTADOR','CHAMADOS','VALOR','AÇÕES'],rows)}</div>`));
});

app.get('/os/nova',auth,need('ORDENS_SERVICO'),(req,res)=>{
  const d=os83State(); const q=norm(req.query.q||'');
  let lista=d.chamados.filter(c=>!os83Closed(c));
  if(q) lista=lista.filter(c=>norm([os83Num(c),c.lojaNome,c.prestadorNome,c.descricao,c.tipoServico,c.status].join(' ')).includes(q));
  const groups={};
  lista.forEach(c=>{ const k=os83GroupKey(c); (groups[k]=groups[k]||[]).push(c); });
  const cards=Object.values(groups).map(ch=>{
    const first=ch[0]||{}, loja=first.lojaNome||first.loja||'SEM LOJA', prest=first.prestadorNome||first.prestador||'SEM PRESTADOR';
    const total=ch.reduce((s,c)=>s+money(c.valor),0);
    const rows=ch.map(c=>`<tr><td><input type="checkbox" name="chamados" value="${esc(c.id)}"></td><td>${esc(os83Num(c))}</td><td>${esc(c.descricao||'')}</td><td>${esc(c.status||'ABERTO')}</td><td>${moeda(money(c.valor))}</td><td><a class="btn small" href="/os-impressao/chamado-${c.id}">IMPRIMIR</a></td></tr>`).join('');
    return `<form class="card os-group" method="post" action="/os/gerar"><div class="os-head"><b>LOJA:</b> ${esc(loja)} <b>PRESTADOR:</b> ${esc(prest)} <b>${ch.length} CHAMADO(S)</b> ${moeda(total)}</div><div class="toolbar"><button type="button" onclick="this.closest('form').querySelectorAll('input[type=checkbox]').forEach(x=>x.checked=true)">✅ SELECIONAR TODOS DA LOJA/PRESTADOR</button><button>🖨️ GERAR O.S. / JUNÇÃO</button><button formaction="/os/fechar-selecionados" onclick="return confirm('FECHAR OS CHAMADOS SELECIONADOS?')">✅ FECHAR SELECIONADOS</button></div><table><thead><tr><th>SEL.</th><th>CHAMADO</th><th>DESCRIÇÃO</th><th>STATUS</th><th>VALOR</th><th>AÇÃO</th></tr></thead><tbody>${rows}</tbody></table></form>`;
  }).join('') || '<div class="card">NENHUM CHAMADO ABERTO PARA GERAR O.S.</div>';
  res.send(page(req,'GERAR O.S.',`<div class="bar"><h2>📄 GERAR/IMPRIMIR O.S. AGRUPADA</h2><a class="btn secondary" href="javascript:history.back()">VOLTAR</a></div><div class="card"><b>REGRA:</b> OS GRUPOS SÃO FORMADOS POR LOJA + PRESTADOR. USE “SELECIONAR TODOS” PARA JUNTAR OS CHAMADOS DO MESMO GRUPO.</div><form method="get" class="card search"><input name="q" placeholder="BUSCAR Nº, LOJA, PRESTADOR OU SERVIÇO" value="${esc(req.query.q||'')}"><button>BUSCAR</button><a class="btn secondary" href="/os/nova">LIMPAR</a></form>${cards}`));
});

app.post('/os/gerar',auth,need('ORDENS_SERVICO'),async(req,res)=>{
  const d=os83State(); const ids=os83Ids(req.body.chamados); const ch=d.chamados.filter(c=>ids.includes(String(c.id)) && !os83Closed(c));
  if(!ch.length) return res.send(page(req,'O.S.',card('NENHUM CHAMADO SELECIONADO','<a class="btn" href="/os/nova">VOLTAR</a>')));
  const k=os83GroupKey(ch[0]);
  if(!ch.every(c=>os83GroupKey(c)===k)) return res.send(page(req,'O.S.',card('ATENÇÃO','PARA JUNTAR CHAMADOS, TODOS PRECISAM SER DA MESMA LOJA E MESMO PRESTADOR.<br><a class="btn" href="/os/nova">VOLTAR</a>')));
  const ref=Math.min(...ch.map(c=>Number(os83Num(c))||999999999));
  const os={id:next(d,'os'),numero:ref,numeroOs:String(ref),lojaNome:ch[0].lojaNome||ch[0].loja||'',prestadorNome:ch[0].prestadorNome||ch[0].prestador||'',chamados:ch.map(c=>c.id),valorTotal:ch.reduce((s,c)=>s+money(c.valor),0),status:'ABERTA',observacoes:req.body.observacoes||'',criadoEm:now(),criadoPor:user(req)?.nome||user(req)?.usuario||''};
  d.os.push(os); ch.forEach(c=>{c.osId=os.id;c.osNumero=os.numero;c.statusOs='OS GERADA'});
  await save(d); res.redirect('/os-impressao/'+os.id);
});

app.post('/os/fechar-selecionados',auth,need('ORDENS_SERVICO'),async(req,res)=>{
  const d=os83State(); const ids=os83Ids(req.body.chamados);
  d.chamados.filter(c=>ids.includes(String(c.id))).forEach(c=>{c.status='FINALIZADO';c.dataFechamento=now();c.fechadoPor=user(req)?.nome||user(req)?.usuario||''});
  await save(d); res.redirect('/os/nova');
});

app.post('/os/:id/fechar',auth,need('ORDENS_SERVICO'),async(req,res)=>{
  const d=os83State(); const os=d.os.find(o=>String(o.id)===String(req.params.id));
  if(os){ const ch=os83ChamadosDaOS(d,os); ch.forEach(c=>{c.status='FINALIZADO';c.dataFechamento=now();c.fechadoPor=user(req)?.nome||user(req)?.usuario||''}); os.status='FINALIZADO'; os.dataFechamento=now(); }
  await save(d); res.redirect('/chamados');
});


/* PATCH V20.8.14 - PDF DA O.S. PARA DOWNLOAD/COMPARTILHAMENTO */
function os83PdfBuffer(req,res,d,os,ch){
  const first=ch[0]||{}; const loja=os83Loja(d,first,os); const prest=os83Prestador(d,first,os);
  const numeros=ch.map(c=>os83Num(c)).filter(Boolean).join(', ') || os.numero || os.numeroOs || os.id;
  const titulo=(ch.find(c=>c.tipoServico)?.tipoServico||'MANUTENÇÃO');
  const atribuido=(ch.find(c=>c.analista)?.analista||os.criadoPor||user(req)?.nome||'');
  const doc=new PDFDocument({size:'A4',margin:36});
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`inline; filename="OS-${String(numeros).replace(/[^0-9A-Z,-]+/gi,'_')}.pdf"`);
  doc.pipe(res);
  doc.fontSize(16).font('Helvetica-Bold').text('ORDEM DE SERVIÇO',{align:'center'});
  doc.fontSize(11).text('Nº: '+numeros,{align:'right'});
  doc.moveDown(.8);
  doc.fontSize(9).font('Helvetica-Bold').text('DADOS DO REQUERENTE');
  doc.moveTo(36,doc.y+2).lineTo(559,doc.y+2).stroke(); doc.moveDown(.5);
  doc.font('Helvetica-Bold').text('LOJA: ',{continued:true}).font('Helvetica').text(String(os.lojaNome||loja.nome||first.lojaNome||''));
  doc.font('Helvetica-Bold').text('RESPONSÁVEL: ',{continued:true}).font('Helvetica').text(String(loja.responsavel||''));
  doc.font('Helvetica-Bold').text('TELEFONE: ',{continued:true}).font('Helvetica').text(String(loja.telefone||loja.whatsappResponsavel||''));
  doc.font('Helvetica-Bold').text('ENDEREÇO: ',{continued:true}).font('Helvetica').text(String(loja.endereco||''));
  doc.font('Helvetica-Bold').text('CIDADE/UF: ',{continued:true}).font('Helvetica').text(String((loja.cidade||'')+(loja.uf?' - '+loja.uf:'')));
  doc.moveDown(.8);
  doc.font('Helvetica-Bold').text('DETALHES DA ORDEM DE SERVIÇO');
  doc.moveTo(36,doc.y+2).lineTo(559,doc.y+2).stroke(); doc.moveDown(.5);
  doc.font('Helvetica-Bold').text('TÍTULO: ',{continued:true}).font('Helvetica').text(String(titulo));
  doc.font('Helvetica-Bold').text('ATRIBUÍDO: ',{continued:true}).font('Helvetica').text(String(atribuido));
  doc.moveDown(.8);
  doc.font('Helvetica-Bold').text('DESCRIÇÃO DA ORDEM DE SERVIÇO');
  doc.moveTo(36,doc.y+2).lineTo(559,doc.y+2).stroke(); doc.moveDown(.5);
  ch.forEach(c=>doc.font('Helvetica').fontSize(9).text(`${os83Num(c)} - ${c.descricao||c.observacoes||''}`));
  doc.moveDown(.8);
  doc.font('Helvetica-Bold').text('PRESTADOR DE SERVIÇO');
  doc.moveTo(36,doc.y+2).lineTo(559,doc.y+2).stroke(); doc.moveDown(.5);
  doc.font('Helvetica-Bold').text('EMPRESA: ',{continued:true}).font('Helvetica').text(String(prest.empresa||prest.nome||os.prestadorNome||''));
  doc.font('Helvetica-Bold').text('NOME: ',{continued:true}).font('Helvetica').text(String(prest.responsavel||prest.nome||''));
  doc.font('Helvetica-Bold').text('TELEFONE: ',{continued:true}).font('Helvetica').text(String(prest.telefone||prest.whatsapp||''));
  doc.moveDown(.8);
  doc.font('Helvetica-Bold').text('OBSERVAÇÕES');
  doc.moveTo(36,doc.y+2).lineTo(559,doc.y+2).stroke(); doc.moveDown(.5);
  doc.font('Helvetica').text(String(os.observacoes||''));
  doc.moveDown(.8);
  doc.font('Helvetica-Bold').text('TERMO DE RESPONSABILIDADE');
  doc.moveTo(36,doc.y+2).lineTo(559,doc.y+2).stroke(); doc.moveDown(.5);
  doc.font('Helvetica').fontSize(8).text('Declaro, para os devidos fins, que estou ciente dos riscos envolvidos na execução das atividades acima descritas e me comprometo a seguir integralmente todas as normas de segurança vigentes, utilizando adequadamente os equipamentos de proteção individual e coletiva necessários.');
  doc.moveDown(2);
  const y=doc.y+18;
  doc.moveTo(55,y).lineTo(200,y).stroke(); doc.moveTo(225,y).lineTo(370,y).stroke(); doc.moveTo(395,y).lineTo(540,y).stroke();
  doc.fontSize(8).font('Helvetica-Bold').text('PRESTADOR DE SERVIÇO',55,y+4,{width:145,align:'center'}).text('REQUERENTE',225,y+4,{width:145,align:'center'}).text('ANALISTA',395,y+4,{width:145,align:'center'});
  doc.font('Helvetica').text(String(atribuido||''),395,y+16,{width:145,align:'center'});
  doc.end();
}
app.get('/os-pdf/chamado-:id',auth,need('ORDENS_SERVICO'),(req,res)=>{
  const d=os83State(); const c=d.chamados.find(x=>String(x.id)===String(req.params.id));
  if(!c) return res.redirect('/os/nova');
  const temp={id:'chamado-'+c.id,numero:os83Num(c),numeroOs:os83Num(c),lojaNome:c.lojaNome,prestadorNome:c.prestadorNome,chamados:[c.id],valorTotal:money(c.valor),status:'ABERTA'};
  return os83PdfBuffer(req,res,d,temp,[c]);
});
app.get('/os-pdf/:id',auth,need('ORDENS_SERVICO'),(req,res)=>{
  const d=os83State(); const os=d.os.find(o=>String(o.id)===String(req.params.id));
  if(!os) return res.redirect('/os/nova');
  return os83PdfBuffer(req,res,d,os,os83ChamadosDaOS(d,os));
});

app.get('/os-impressao/chamado-:id',auth,need('ORDENS_SERVICO'),(req,res)=>{
  const d=os83State(); const c=d.chamados.find(x=>String(x.id)===String(req.params.id));
  if(!c) return res.redirect('/os/nova');
  const temp={id:'chamado-'+c.id,numero:os83Num(c),numeroOs:os83Num(c),lojaNome:c.lojaNome,prestadorNome:c.prestadorNome,chamados:[c.id],valorTotal:money(c.valor),status:'ABERTA'};
  return os83Print(req,res,d,temp,[c]);
});

app.get('/os-impressao/:id',auth,need('ORDENS_SERVICO'),(req,res)=>{
  const d=os83State(); const os=d.os.find(o=>String(o.id)===String(req.params.id));
  if(!os) return res.redirect('/os/nova');
  const ch=os83ChamadosDaOS(d,os);
  return os83Print(req,res,d,os,ch);
});


/* PATCH V20.8.14 - O.S. PDF/WHATSAPP/VALOR */
function v20814_showValor(req){
  const v=String(req.query.valor||'1').toUpperCase();
  return !(v==='0'||v==='SEM'||v==='NAO'||v==='NÃO');
}
function v20814_valorChamado(c){ return v2088_moneyBR(c.valor||c.valorServico||c.valorTotal||c.total||0); }
function v20814_totalChamados(ch){ return (ch||[]).reduce((s,c)=>s+v20814_valorChamado(c),0); }
function v20814_osData(d,id){
  const os=(d.os||[]).find(o=>String(o.id)===String(id))||{};
  let ids=arr(os.chamadosIds||os.chamadoIds||os.chamados||os.ids); if(!ids.length&&os.chamadoId)ids=[os.chamadoId];
  let ch=(d.chamados||[]).filter(c=>ids.map(String).includes(String(c.id))||ids.map(String).includes(String(c.numeroInterno||c.numero||c.numeroExterno)));
  if(!ch.length) ch=(d.chamados||[]).filter(c=>String(c.osId||c.os||'')===String(id));
  if(!ch.length && os.numero) ch=[os];
  const loja=findLoja(d,ch[0]?.lojaNome||os.lojaNome||os.loja||'');
  const prest=findPrestador(d,ch[0]?.prestadorNome||os.prestadorNome||os.prestador||'');
  const numeros=ch.map(c=>c.numeroInterno||c.numero||c.numeroExterno||c.id).filter(Boolean).join(', ')||String(id);
  return {os,ch,loja,prest,numeros};
}
function v20814_pdfUrl(req,id,showValor=true){
  return `${req.protocol}://${req.get('host')}/os-pdf/${encodeURIComponent(id)}?valor=${showValor?'1':'0'}`;
}
function v20814_whatsLink(tel,msg){
  tel=dig(tel); if(!tel)return '#'; if(!tel.startsWith('55'))tel='55'+tel;
  return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
}

function os83Print(req,res,d,os,ch){
  const first=ch[0]||{}; const loja=os83Loja(d,first,os); const prest=os83Prestador(d,first,os);
  const numeros=ch.map(c=>os83Num(c)).filter(Boolean).join(', ') || os.numero || os.numeroOs || os.id;
  const titulo=(ch.find(c=>c.tipoServico)?.tipoServico||'MANUTENÇÃO');
  const atribuido=(ch.find(c=>c.analista)?.analista||os.criadoPor||user(req)?.nome||'');
  const logo=osLogoEscolhido(d,loja);
  const wLoja=loja.whatsappResponsavel||loja.whatsapp||loja.telefone||first.whatsappResponsavel||first.whatsappLoja||os.whatsappLoja||os.telefoneLoja||'';
  const wPrest=prest.whatsapp||prest.telefone||first.whatsappPrestador||first.telefonePrestador||os.whatsappPrestador||os.telefonePrestador||'';
  const desc=ch.map(c=>`${esc(os83Num(c))} ${esc(c.descricao||c.observacoes||'')}`).join('<br>');
  const inicio=ch.find(c=>c.dataAgendada)?.dataAgendada||'';
  const pdfUrl='/os-pdf/'+encodeURIComponent(os.id);
  const msgPdf='ORDEM DE SERVIÇO Nº '+numeros+' - PDF: '+(req.protocol+'://'+req.get('host')+pdfUrl);
  const linkLoja=os83WhatsappLink(wLoja,msgPdf);
  const linkPrest=os83WhatsappLink(wPrest,msgPdf);
  res.send(page(req,'O.S. Impressão',`<div class="bar no-print"><button onclick="window.print()">🖨️ IMPRIMIR</button><a class="btn secondary" href="?valor=1">💰 COM VALOR</a><a class="btn secondary" href="?valor=0">🚫 SEM VALOR</a><a class="btn" href="/os/nova">↩️ VOLTAR</a><a class="btn" target="_blank" href="${pdfUrl}">📄 BAIXAR PDF</a>${wLoja?`<button type="button" onclick="compartilharOsPdf('${esc(os.id)}','${dig(wLoja)}','${esc('ORDEM DE SERVIÇO Nº '+numeros)}')">📄 PDF WHATSAPP LOJA</button><a class="btn" target="_blank" href="${linkLoja}">📲 WHATSAPP RESPONSÁVEL LOJA</a>`:''}${wPrest?`<button type="button" onclick="compartilharOsPdf('${esc(os.id)}','${dig(wPrest)}','${esc('ORDEM DE SERVIÇO Nº '+numeros)}')">📄 PDF WHATSAPP PRESTADOR</button><a class="btn" target="_blank" href="${linkPrest}">📲 WHATSAPP PRESTADOR</a>`:''}<form method="post" action="/os/${esc(os.id)}/fechar" style="display:inline"><button onclick="return confirm('FECHAR ESTA O.S. E TODOS OS CHAMADOS VINCULADOS?')">✅ FECHAR O.S.</button></form></div><section class="os-doc"><div class="os-top">${logo?`<img src="${esc(logo)}" onerror="this.style.display='none'">`:''}<div class="os-title"><h1>ORDEM DE SERVIÇO</h1><h2>Nº : ${esc(numeros)}</h2></div></div><h3>DADOS DO REQUERENTE</h3><table class="os-table"><tr><th>LOJA:</th><td>${esc(os.lojaNome||loja.nome||first.lojaNome||'')}</td><th>NOME:</th><td>${esc(loja.responsavel||'')}</td><th>TELEFONE:</th><td>${esc(loja.telefone||wLoja||'')}</td></tr><tr><th>ENDEREÇO</th><td colspan="2">${esc(loja.endereco||'')}</td><th>CIDADE:</th><td colspan="2">${esc(loja.cidade||'')}${loja.uf?` - ${esc(loja.uf)}`:''}</td></tr><tr><th>CNPJ:</th><td colspan="2">${esc(loja.cnpj||'')}</td><th>CEP:</th><td colspan="2">${esc(loja.cep||'')}</td></tr></table><h3>DETALHES DA ORDEM DE SERVIÇO</h3><table class="os-table smalltbl"><tr><th>TÍTULO:</th><td>${esc(titulo)}</td></tr><tr><th>ATRIBUÍDO:</th><td>${esc(atribuido)}</td></tr></table><h3>DESCRIÇÃO DA ORDEM DE SERVIÇO</h3><div class="os-desc">${desc}</div><h3>PRESTADOR DE SERVIÇO</h3><div class="prest-lines">• <b>EMPRESA:</b> ${esc(prest.empresa||prest.nome||os.prestadorNome||'')} &nbsp;&nbsp; <b>CNPJ:</b> ${esc(prest.cnpj||'')}<br>• <b>NOME:</b> ${esc(prest.responsavel||prest.nome||'')} &nbsp;&nbsp; <b>TELEFONE:</b> ${esc(prest.telefone||wPrest||'')}<br>• <b>CPF/CNH:</b> ${esc(prest.cpfCnh||prest.cpf||'')}<br>• <b>DATA DE INÍCIO:</b> ${br(inicio)} &nbsp;&nbsp;&nbsp; <b>HORAS:</b><br>• <b>DATA DE FINALIZAÇÃO:</b> &nbsp;&nbsp;&nbsp; <b>HORAS:</b></div><h3>OBSERVAÇÕES</h3><div class="obs-box">${esc(os.observacoes||'')}</div><h3>TERMO DE RESPONSABILIDADE</h3><p class="termo">Declaro, para os devidos fins, que estou ciente dos riscos envolvidos na execução das atividades acima descritas e me comprometo a seguir integralmente todas as normas de segurança vigentes, os procedimentos internos da empresa e as boas práticas profissionais, utilizando adequadamente os Equipamentos de Proteção Individual (EPI) e os Equipamentos de Proteção Coletiva (EPC) necessários.<br><br>Estou ciente de que a execução de qualquer atividade em desacordo com as normas de segurança poderá resultar em penalidades legais, administrativas ou contratuais, conforme aplicável.<br><br><b>OBS:</b> Toda manutenção deve ser realizada por profissionais capacitados e deve-se utilizar prioritariamente medidas de proteção coletiva (EPC) e equipamentos de proteção individual (EPI), garantindo os procedimentos das normas vigentes de segurança do trabalho individual e coletivo.</p><div class="assin-os"><span>PRESTADOR DE SERVIÇO</span><span>REQUERENTE</span><span>ANALISTA<br>${os83Assinatura(d,req,ch)}</span></div></section>`));
}

app.get('/os-impressao/:id',auth,need('ORDENS_SERVICO'),(req,res)=>{const d=load(),os=d.os.find(o=>String(o.id)===String(req.params.id));if(!os)return res.redirect('/os');const ch=d.chamados.filter(c=>arr(os.chamados).map(String).includes(String(c.id)));const loja=findLoja(d,os.lojaNome),prest=findPrestador(d,os.prestadorNome);const numeros=ch.map(c=>c.numeroInterno||c.numeroExterno||c.id).join(', ')||os.numero;const titulo=(ch.find(c=>c.tipoServico)?.tipoServico||'MANUTENÇÃO');const atribuido=(ch.find(c=>c.analista)?.analista||os.criadoPor||'');const logo=osLogoEscolhido(d,loja);const wLoja=loja.whatsappResponsavel||loja.telefone;const desc=ch.map(c=>`${esc(c.numeroInterno||c.id)} ${esc(c.descricao||c.observacoes||'')}`).join('<br>');const inicio=ch.find(c=>c.dataAgendada)?.dataAgendada||'';res.send(page(req,'O.S. Impressão',`<div class="bar no-print"><button onclick="window.print()">🖨️ Imprimir</button><a class="btn" href="/os">↩️ Voltar</a>${wLoja?`<a class="btn" target="_blank" href="https://wa.me/55${dig(wLoja)}?text=${encodeURIComponent('Ordem de Serviço Nº '+numeros)}">📲 WhatsApp responsável loja</a>`:''}${prest.telefone?`<a class="btn" target="_blank" href="https://wa.me/55${dig(prest.telefone)}?text=${encodeURIComponent('Ordem de Serviço Nº '+numeros)}">📲 WhatsApp prestador</a>`:''}</div><section class="os-doc"><div class="os-top">${logo?`<img src="${esc(logo)}" onerror="this.style.display='none'">`:''}<div class="os-title"><h1>ORDEM DE SERVIÇO</h1><h2>Nº : ${esc(numeros)}</h2></div></div><h3>DADOS DO REQUERENTE</h3><table class="os-table"><tr><th>LOJA:</th><td>${esc(os.lojaNome||loja.nome)}</td><th>NOME:</th><td>${esc(loja.responsavel||'')}</td><th>Telefone:</th><td>${esc(loja.telefone||'')}</td></tr><tr><th>ENDEREÇO</th><td colspan="2">${esc(loja.endereco||'')}</td><th>CIDADE:</th><td colspan="2">${esc(loja.cidade||'')}${loja.uf?` - ${esc(loja.uf)}`:''}</td></tr><tr><th>CNPJ:</th><td colspan="2">${esc(loja.cnpj||'')}</td><th>CEP:</th><td colspan="2">${esc(loja.cep||'')}</td></tr></table><h3>DETALHES DA ORDEM DE SERVIÇO</h3><table class="os-table smalltbl"><tr><th>Título:</th><td>${esc(titulo)}</td></tr><tr><th>Atribuido:</th><td>${esc(atribuido)}</td></tr></table><h3>DESCRIÇÃO DA ORDEM DE SERVIÇO</h3><div class="os-desc">${desc}</div><h3>PRESTADOR DE SERVIÇO</h3><div class="prest-lines">• <b>EMPRESA:</b> ${esc(prest.empresa||os.prestadorNome||'')} &nbsp;&nbsp; <b>CNPJ:</b> ${esc(prest.cnpj||'')}<br>• <b>NOME:</b> ${esc(prest.responsavel||'')} &nbsp;&nbsp; <b>TELEFONE:</b> ${esc(prest.telefone||'')}<br>• <b>CPF/CNH:</b> ${esc(prest.cpfCnh||prest.cpf||'')}<br>• <b>DATA DE INICIO:</b> ${br(inicio)} &nbsp;&nbsp;&nbsp; <b>HORAS:</b><br>• <b>DATA DE FINALIZAÇÃO:</b> &nbsp;&nbsp;&nbsp; <b>HORAS:</b></div><h3>OBSERVAÇÕES</h3><div class="obs-box">${esc(os.observacoes||'')}</div><h3>TERMO DE RESPONSABILIDADE</h3><p class="termo">Declaro, para os devidos fins, que estou ciente dos riscos envolvidos na execução das atividades acima descritas e me comprometo a seguir integralmente todas as normas de segurança vigentes, os procedimentos internos da empresa e as boas práticas profissionais, utilizando adequadamente os Equipamentos de Proteção Individual (EPI) e os Equipamentos de Proteção Coletiva (EPC) necessários.<br><br>Estou ciente de que a execução de qualquer atividade em desacordo com as normas de segurança poderá resultar em penalidades legais, administrativas ou contratuais, conforme aplicável.<br><br><b>OBS:</b> Toda manutenção deve ser realizada por profissionais capacitados e deve-se utilizar prioritariamente medidas de proteção coletiva (EPC) e equipamentos de proteção individual (EPI), garantindo os procedimentos das normas vigentes de segurança do trabalho individual e coletivo.</p><div class="assin-os"><span>PRESTADOR DE SERVIÇO</span><span>REQUERENTE</span></div></section>`))});
app.get('/os',auth,need('ORDENS_SERVICO'),(req,res)=>{const d=load();res.send(page(req,'Ordens de Serviço',`<div class="bar"><h2>📄 Ordens de Serviço</h2><a class="btn" href="/os/nova">➕ Gerar O.S.</a></div><div class="card">${tabela(['Nº','Loja','Prestador','Chamados','Valor','Ações'],d.os.map(o=>`<tr><td>${esc(o.numero)}</td><td>${esc(o.lojaNome)}</td><td>${esc(o.prestadorNome)}</td><td>${arr(o.chamados).length}</td><td>${moeda(o.valorTotal)}</td><td><a class="btn small" href="/os-impressao/${o.id}">🖨️ Ver/Imprimir</a></td></tr>`))}</div>`))});app.get('/os/nova',auth,need('ORDENS_SERVICO'),(req,res)=>{const d=load(),q=norm(req.query.q||'');const lista=d.chamados.filter(c=>!finalizado(c.status)).filter(c=>!q||norm([c.numeroInterno,c.lojaNome,c.prestadorNome,c.descricao].join(' ')).includes(q));res.send(page(req,'Gerar O.S.',`<div class="bar"><h2>📄 Gerar O.S.</h2><a class="btn" href="/os">Voltar</a></div><form class="card search" method="get"><input name="q" placeholder="Buscar chamados abertos"><button>Buscar</button></form><form class="card" method="post" action="/os">${lista.map(c=>`<label class="checkline"><input type="checkbox" name="chamados" value="${c.id}"> ${esc(c.numeroInterno)} - ${esc(c.lojaNome)} - ${esc(c.prestadorNome)} - ${esc(c.descricao)} - ${moeda(c.valor)}</label>`).join('')||'Nenhum chamado aberto.'}<textarea name="observacoes" placeholder="Observações"></textarea><button>📄 Gerar impressão/O.S.</button></form>`))});app.post('/os',auth,need('ORDENS_SERVICO'),(req,res)=>{const d=load(),ids=arr(req.body.chamados).map(String),ch=d.chamados.filter(c=>ids.includes(String(c.id)));if(!ch.length)return res.redirect('/os/nova');const ref=Math.min(...ch.map(c=>Number(c.numeroInterno||c.id)));const os={id:next(d,'os'),numero:ref,lojaNome:ch[0].lojaNome,prestadorNome:ch[0].prestadorNome,chamados:ch.map(c=>c.id),valorTotal:ch.reduce((s,c)=>s+money(c.valor),0),observacoes:req.body.observacoes||'',criadoEm:now(),criadoPor:user(req).nome};d.os.push(os);ch.forEach(c=>c.osId=os.id);save(d);res.redirect(`/os-impressao/${os.id}`)});app.get('/os/:id',auth,need('ORDENS_SERVICO'),(req,res)=>{const d=load(),os=d.os.find(o=>String(o.id)===String(req.params.id));if(!os)return res.redirect('/os');const ch=d.chamados.filter(c=>arr(os.chamados).map(String).includes(String(c.id))),loja=findLoja(d,os.lojaNome),prest=findPrestador(d,os.prestadorNome),logo=publicFile(loja.logoLocal)||loja.logoUrl||appLogo(d);res.send(page(req,'O.S.',`<div class="bar no-print"><button onclick="window.print()">🖨️ Imprimir</button><a class="btn" href="/os">Voltar</a>${(loja.whatsappResponsavel||loja.telefone)?`<a class="btn" target="_blank" href="https://wa.me/55${dig(loja.whatsappResponsavel||loja.telefone)}?text=${encodeURIComponent('O.S. '+os.numero)}">📲 WhatsApp responsável loja</a>`:''}${prest.telefone?`<a class="btn" target="_blank" href="https://wa.me/55${dig(prest.telefone)}?text=${encodeURIComponent('O.S. '+os.numero)}">📲 WhatsApp prestador</a>`:''}</div><section class="os-print"><div class="os-head">${logo?`<img src="${esc(logo)}">`:''}<div><h1>ORDEM DE SERVIÇO</h1><h2>Nº: ${esc(os.numero)}</h2></div></div><h3>DADOS DO REQUERENTE</h3><div class="os-grid"><b>LOJA:</b><span>${esc(os.lojaNome)}</span><b>TELEFONE:</b><span>${esc(loja.telefone)}</span><b>ENDEREÇO:</b><span>${esc(loja.endereco)}</span><b>CIDADE:</b><span>${esc(loja.cidade)}/${esc(loja.uf)}</span><b>CNPJ:</b><span>${esc(loja.cnpj)}</span><b>CEP:</b><span>${esc(loja.cep)}</span></div><h3>DESCRIÇÃO DA ORDEM DE SERVIÇO</h3><ul>${ch.map(c=>`<li><b>${esc(c.numeroInterno)}</b> - ${esc(c.tipoServico)} - ${esc(c.descricao)} - ${moeda(c.valor)}</li>`).join('')}</ul><h3>PRESTADOR DE SERVIÇO</h3><div class="os-grid"><b>EMPRESA:</b><span>${esc(prest.empresa||os.prestadorNome)}</span><b>CNPJ:</b><span>${esc(prest.cnpj)}</span><b>NOME:</b><span>${esc(prest.responsavel)}</span><b>TELEFONE:</b><span>${esc(prest.telefone)}</span></div><p><b>VALOR TOTAL:</b> ${moeda(os.valorTotal)}</p><h3>TERMO DE RESPONSABILIDADE</h3><p class="small">O prestador declara estar ciente de que é de sua responsabilidade utilizar EPIs e seguir normas de segurança.</p><div class="assinaturas"><div>RESPONSÁVEL DA LOJA</div><div>PRESTADOR</div><div>ANALISTA</div>${v2088_assinaturaHtml(d, (os&&os.analista)||atribuido||analista||'')}</div></section>`))});

app.get('/lembretes',auth,need('LEMBRETES'),(req,res)=>{const d=load();res.send(page(req,'Lembretes',`<div class="bar"><h2>📌 Lembretes / Post-it</h2><a class="btn" href="/lembretes/novo">➕ Novo</a></div><div class="postits">${d.lembretes.map(postit).join('')||'Nenhum lembrete.'}</div>`))});function lembreteForm(req,l={}){return page(req,'Lembrete',`<div class="bar"><h2>📌 Lembrete</h2><a class="btn" href="/lembretes">Voltar</a></div><form class="card form" method="post"><div class="grid4"><label>Título<input name="titulo" value="${esc(l.titulo)}" required></label><label>Data<input type="date" name="data" value="${esc(l.data||today())}"></label><label>Hora<input type="time" name="hora" value="${esc(l.hora)}"></label><label>Som<select name="som"><option>BIPE</option><option>SINO</option><option>ALARME</option></select></label><label>Analista<input name="analista" value="${esc(l.analista)}" data-auto="analistas"></label><label>Mostrar para todos<select name="mostrarTodos"><option ${norm(l.mostrarTodos||'NÃO')==='NÃO'?'selected':''}>NÃO</option><option ${norm(l.mostrarTodos)==='SIM'?'selected':''}>SIM</option></select></label><label>Cor<select name="cor">${['AMARELO','ROSA','AZUL','VERDE'].map(c=>`<option ${norm(l.cor||'AMARELO')===c?'selected':''}>${c}</option>`).join('')}</select></label><label>Fixar inicial<select name="fixarInicial"><option ${norm(l.fixarInicial||'SIM')==='SIM'?'selected':''}>SIM</option><option ${norm(l.fixarInicial)==='NÃO'?'selected':''}>NÃO</option></select></label><label>Chamado<input name="chamadoId" value="${esc(l.chamadoId)}" data-auto="chamados"></label></div><textarea name="descricao">${esc(l.descricao)}</textarea><button>💾 Salvar</button></form>`)}app.get('/lembretes/novo',auth,need('LEMBRETES'),(req,res)=>res.send(lembreteForm(req)));app.get('/lembretes/:id/editar',auth,need('LEMBRETES'),(req,res)=>res.send(lembreteForm(req,load().lembretes.find(l=>String(l.id)===String(req.params.id))||{})));app.post(['/lembretes/novo','/lembretes/:id/editar'],auth,need('LEMBRETES'),(req,res)=>{const d=load();let l=req.params.id?d.lembretes.find(x=>String(x.id)===String(req.params.id)):null;if(!l){l={id:next(d,'lembrete')};d.lembretes.push(l)}Object.assign(l,{titulo:norm(req.body.titulo),data:req.body.data,hora:req.body.hora,som:req.body.som,analista:norm(req.body.analista),mostrarTodos:norm(req.body.mostrarTodos),cor:norm(req.body.cor),fixarInicial:norm(req.body.fixarInicial),chamadoId:req.body.chamadoId,descricao:req.body.descricao});save(d);res.redirect('/lembretes')});
app.get('/preventivas',auth,need('PREVENTIVAS'),(req,res)=>{const d=load();res.send(page(req,'Preventivas',`<div class="bar"><h2>🗓️ Preventivas</h2><a class="btn" href="/preventivas/novo">➕ Nova</a></div><div class="card">${tabela(['Título','Loja','Data lembrar','Status','Ações'],d.preventivas.map(p=>`<tr><td>${esc(p.titulo)}</td><td>${esc(p.lojaNome)}</td><td>${br(p.dataLembrete)}</td><td>${esc(p.status)}</td><td><a class="btn small" href="/preventivas/${p.id}/editar">Editar</a></td></tr>`))}</div>`))});function preventivaForm(req,p={}){return page(req,'Preventiva',`<div class="bar"><h2>🗓️ Preventiva</h2><a class="btn" href="/preventivas">Voltar</a></div><form class="card form" method="post"><div class="grid4"><label>Título<input name="titulo" value="${esc(p.titulo)}" required></label><label>Loja<input name="lojaNome" value="${esc(p.lojaNome)}" data-auto="lojas"></label><label>Data para lembrar<input type="date" name="dataLembrete" value="${esc(p.dataLembrete||today())}"></label><label>Hora<input type="time" name="horaLembrete" value="${esc(p.horaLembrete||'09:00')}"></label><label>Analista<input name="analista" value="${esc(p.analista)}" data-auto="analistas"></label><label>Status<select name="status"><option>ATIVA</option><option>INATIVA</option></select></label></div><textarea name="descricao">${esc(p.descricao)}</textarea><button>Salvar</button></form>`)}app.get('/preventivas/novo',auth,need('PREVENTIVAS'),(req,res)=>res.send(preventivaForm(req)));app.get('/preventivas/:id/editar',auth,need('PREVENTIVAS'),(req,res)=>res.send(preventivaForm(req,load().preventivas.find(p=>String(p.id)===String(req.params.id))||{})));app.post(['/preventivas/novo','/preventivas/:id/editar'],auth,need('PREVENTIVAS'),(req,res)=>{const d=load();let p=req.params.id?d.preventivas.find(x=>String(x.id)===String(req.params.id)):null;if(!p){p={id:next(d,'preventiva')};d.preventivas.push(p)}Object.assign(p,{titulo:norm(req.body.titulo),lojaNome:norm(req.body.lojaNome),dataLembrete:req.body.dataLembrete,horaLembrete:req.body.horaLembrete,analista:norm(req.body.analista),status:norm(req.body.status||'ATIVA'),descricao:req.body.descricao});syncPreventiva(d,p);save(d);res.redirect('/preventivas')});

function val(row,keys){const m={};Object.entries(row||{}).forEach(([k,v])=>m[norm(k).replace(/[^A-Z0-9]/g,'')]=v);for(const k of keys){const kk=norm(k).replace(/[^A-Z0-9]/g,'');if(m[kk]!==undefined&&String(m[kk]).trim()!=='')return m[kk]}return ''}

/* PATCH V16.1 - IMPORTAÇÃO PLANILHA DEFINITIVA, COM ROLLBACK E SEM APAGAR USUÁRIOS */
function v157_up(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim()}
function v157_dig(v){return String(v??'').replace(/\D/g,'')}
function v157_money(v){ return v2088_moneyBR(v); }
function v157_get(row,keys){row=row||{};const rowKeys=Object.keys(row);for(const wanted of keys){if(row[wanted]!=null&&String(row[wanted]).trim()!=='')return row[wanted];const found=rowKeys.find(k=>v157_up(k)===v157_up(wanted));if(found&&String(row[found]).trim()!=='')return row[found];}return ''}
function v157_uf(v){return (v157_up(v).match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)||[])[1]||''}
function v157_arr(v){return Array.isArray(v)?v:(v==null||v===''?[]:[v])}
function v157_clone(v){return JSON.parse(JSON.stringify(v||[]))}
function v157_init(d){for(const k of ['usuarios','perfis','lojas','prestadores','proprietarios','chamados','os','lembretes','preventivas','pontos','pagamentos','tiposServico','statusChamado'])d[k]=Array.isArray(d[k])?d[k]:[];d.config=d.config||{};d.config.next=d.config.next||{};return d}
function v157_next(d,k){if(typeof next==='function')return next(d,k);d.config=d.config||{};d.config.next=d.config.next||{};d.config.next[k]=(d.config.next[k]||1)+1;return d.config.next[k]-1}
function v157_backup(d){try{const dir=path.join(process.cwd(),'data','backups');if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'backup-antes-importacao-v157-'+Date.now()+'.json'),JSON.stringify(d,null,2));}catch(e){console.error('backup importacao falhou',e)}}
function v157_layout(req,title,body){return typeof page==='function'?page(req,title,body):`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body>${body}</body></html>`}
function v157_error(req,e){console.error('ERRO IMPORTACAO V16.1:',e);return typeof errorPage==='function'?errorPage(req,e):`<div class="card"><h2>Erro tratado</h2><pre>${String(e&&e.stack||e)}</pre><a class="btn" href="/importar-planilha">Voltar</a></div>`}
function v157_findOrCreateLoja(d,nome,cidade,uf,cep,endereco,analista){nome=v157_up(nome||'LOJA NÃO INFORMADA');let loja=d.lojas.find(l=>v157_up(l.nome||l.loja)===nome);let criada=false;if(!loja){loja={id:v157_next(d,'loja'),codigo:'',nome,cidade:v157_up(cidade),uf:v157_uf(uf),estado:v157_uf(uf),cep:v157_dig(cep),endereco:v157_up(endereco),telefone:'',cnpj:'',analista:v157_up(analista)};d.lojas.push(loja);criada=true;}else{if(cidade&&!loja.cidade)loja.cidade=v157_up(cidade);if(uf&&!loja.uf){loja.uf=v157_uf(uf);loja.estado=v157_uf(uf)}if(cep&&!loja.cep)loja.cep=v157_dig(cep);if(endereco&&!loja.endereco)loja.endereco=v157_up(endereco);if(analista&&!loja.analista)loja.analista=v157_up(analista);}return {loja,criada}}
function v157_findOrCreatePrestador(d,nome,tipo,cidade,uf){nome=v157_up(nome||'');if(!nome)return {prestador:null,criada:false};let p=d.prestadores.find(x=>v157_up(x.empresa||x.nome||x.responsavel)===nome);let criada=false;if(!p){p={id:v157_next(d,'prestador'),empresa:nome,responsavel:nome,ativo:'SIM',cidade:v157_up(cidade),uf:v157_uf(uf),estado:v157_uf(uf),servicos:tipo?[v157_up(tipo)]:[]};d.prestadores.push(p);criada=true;}if(tipo&&!v157_arr(p.servicos).map(v157_up).includes(v157_up(tipo)))p.servicos=[...v157_arr(p.servicos),v157_up(tipo)];return {prestador:p,criada}}
function v157_extractRows(file){const wb=XLSX.readFile(file,{cellDates:false});let rows=[];for(const name of wb.SheetNames){const sheet=wb.Sheets[name];const part=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false,blankrows:false});rows.push(...part)}return rows}
function v157_import_handler(req,res){
 try{
   const original=v157_init(load());
   const keep={usuarios:v157_clone(original.usuarios),perfis:v157_clone(original.perfis),config:JSON.parse(JSON.stringify(original.config||{}))};
   v157_backup(original);
   if(!req.file)return res.send(v157_layout(req,'Importar planilha',`<div class="card"><h2>⚠️ Nenhum arquivo selecionado</h2><a class="btn" href="/importar-planilha">Voltar</a></div>`));
   const rows=v157_extractRows(req.file.path);
   const d=v157_init(JSON.parse(JSON.stringify(original)));
   let importados=0,lojasCriadas=0,prestCriados=0,ignoradas=0;
   const analistaPadrao=v157_up(req.body.analista||req.body.analistaResponsavel||'');
   for(const r of rows){
     const lojaNome=v157_up(v157_get(r,['LOJA','NOME LOJA','NOME_LOJA','FILIAL','UNIDADE','CLIENTE','REQUERENTE','LOCAL','ESTABELECIMENTO','LOJA/FILIAL']));
     const numero=v157_dig(v157_get(r,['NUMERO','NÚMERO','NRO','Nº','CHAMADO','N CHAMADO','N. CHAMADO','ID','CODIGO','CÓDIGO','OS','ORDEM DE SERVIÇO']));
     const desc=v157_up(v157_get(r,['DESCRIÇÃO','DESCRICAO','DESCRIÇÃO SERVIÇOS','DESCRICAO SERVICOS','DESCRICAO_SERVICO','PROBLEMA','OBSERVAÇÃO','OBSERVACAO','SERVIÇO SOLICITADO','SOLICITAÇÃO','SOLICITACAO','DESCRIÇÃO DO SERVIÇO']));
     const prestNome=v157_up(v157_get(r,['PRESTADOR','EMPRESA','FORNECEDOR','EXECUTOR','TÉCNICO','TECNICO','RESPONSAVEL EXECUCAO','RESPONSÁVEL EXECUÇÃO']));
     const cidade=v157_up(v157_get(r,['CIDADE','MUNICIPIO','MUNICÍPIO','CIDADE LOJA']));
     const uf=v157_uf(v157_get(r,['UF','ESTADO','UF LOJA']));
     const cep=v157_dig(v157_get(r,['CEP','CEP LOJA']));
     const endereco=v157_up(v157_get(r,['ENDEREÇO','ENDERECO','LOGRADOURO','RUA','ENDEREÇO LOJA']));
     const tipoServico=v157_up(v157_get(r,['SERVIÇO','SERVICO','TIPO SERVIÇO','TIPO_SERVICO','CATEGORIA','TIPO','TIPO DE SERVIÇO','ATIVIDADE']))||'A DEFINIR';
     const status=v157_up(v157_get(r,['STATUS','SITUAÇÃO','SITUACAO']))||'ABERTO';
     const prioridade=v157_up(v157_get(r,['PRIORIDADE']))||'MÍNIMA';
     const analista=v157_up(v157_get(r,['ANALISTA','RESPONSÁVEL','RESPONSAVEL','USUARIO','USUÁRIO']))||analistaPadrao;
     if(!lojaNome&&!numero&&!desc&&!prestNome){ignoradas++;continue}
     const li=v157_findOrCreateLoja(d,lojaNome||'LOJA NÃO INFORMADA',cidade,uf,cep,endereco,analista); if(li.criada)lojasCriadas++;
     const pi=v157_findOrCreatePrestador(d,prestNome,tipoServico,v157_up(v157_get(r,['CIDADE PRESTADOR'])),v157_uf(v157_get(r,['UF PRESTADOR']))); if(pi.criada)prestCriados++;
     d.chamados.push({id:v157_next(d,'chamado'),numeroInterno:numero||v157_next(d,'numeroChamado'),numeroExterno:numero,lojaId:li.loja.id,lojaNome:li.loja.nome,prestadorId:pi.prestador?pi.prestador.id:'',prestadorNome:prestNome,tipoServico,status,prioridade,valor:v157_money(v157_get(r,['VALOR','PREÇO','PRECO','CUSTO','VALOR SERVIÇO','VALOR SERVICO'])),analista,descricao:desc||'IMPORTADO SEM DESCRIÇÃO',observacoes:v157_up(v157_get(r,['OBS','OBSERVAÇÃO','OBSERVACAO','COMENTARIO','COMENTÁRIO'])),dataAbertura:typeof today==='function'?today():new Date().toISOString().slice(0,10),criadoEm:typeof now==='function'?now():new Date().toISOString(),importado:'SIM'});
     importados++;
   }
   // proteção final: nunca deixa usuários/perfis sumirem
   d.usuarios=keep.usuarios.length?keep.usuarios:original.usuarios;
   d.perfis=keep.perfis.length?keep.perfis:original.perfis;
   d.config={...(d.config||{}), next:{...((d.config||{}).next||{})}};
   if(keep.config&&keep.config.nomeSistema){d.config={...keep.config,...d.config,next:{...(keep.config.next||{}),...((d.config||{}).next||{})}}}
   save(d);
   res.send(v157_layout(req,'Importado',`<div class="card"><h2>✅ Importação concluída</h2><p>Chamados importados: <b>${importados}</b></p><p>Lojas criadas: <b>${lojasCriadas}</b> | Prestadores criados: <b>${prestCriados}</b> | Linhas ignoradas: <b>${ignoradas}</b></p><p><b>Proteção:</b> usuários, analistas/perfis e permissões foram preservados.</p><a class="btn" href="/chamados?mostrar=1">Ver chamados</a> <a class="btn secondary" href="/importar-planilha">Nova importação</a></div>`));
 }catch(e){res.status(500).send(v157_error(req,e))}
}

/* PATCH V16.1 - IMPORTAÇÃO V12 ESTÁVEL, SEGURA E SEM 502 */
function v158_norm(v){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim()}
function v158_dig(v){return String(v??'').replace(/\D/g,'')}
function v158_money(v){ return v2088_moneyBR(v); }
function v158_arr(v){return Array.isArray(v)?v:(v==null||v===''?[]:[v])}
function v158_excelDate(v){
  if(!v)return '';
  if(v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  if(typeof v==='number'){
    const d=XLSX.SSF.parse_date_code(v); if(d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s=String(v).trim();
  let m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); if(m){let y=m[3]; if(y.length===2)y='20'+y; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
  m=s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/); if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return s.slice(0,10);
}
function v158_clone(v){return JSON.parse(JSON.stringify(v??null))}
function v158_atomicSave(d){
  // PATCH V20.8.14: importação precisa salvar pela função oficial save(),
  // pois ela atualiza cache em memória e envia para Supabase.
  try{
    if(typeof save === 'function'){
      save(d);
      return true;
    }
  }catch(e){
    console.error('V20.8.14 erro save importação:', e.message || e);
  }
  const tmp=DB_FILE+'.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d,null,2),'utf8');
  fs.renameSync(tmp, DB_FILE);
  try{ persistentCache = mergeDB(emptyDB(), d); }catch(e){}
  return true;
}
function v158_backup(d){try{const dir=path.join(DATA_DIR,'backups');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'backup-antes-importacao-v158-'+Date.now()+'.json'), JSON.stringify(d,null,2),'utf8')}catch(e){console.error('backup importacao falhou',e)}}
function v158_safePage(req,title,body){return typeof page==='function'?page(req,title,body):`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/public/style.css"></head><body>${body}</body></html>`}
function v158_importPage(req,msg=''){
  const d=load();
  const analistas=[...new Set([...(d.usuarios||[]).filter(u=>v158_norm(u.ativo||'SIM')!=='NAO').map(u=>v158_norm(u.nome||u.usuario)),...(d.chamados||[]).map(c=>v158_norm(c.analista)),...(d.lojas||[]).map(l=>v158_norm(l.analista))].filter(Boolean))].sort();
  return v158_safePage(req,'Importar planilha',`<div class="bar"><h2>📥 Importar planilha</h2><a class="btn secondary" href="/">Início</a></div>${msg?`<div class="card warn">${msg}</div>`:''}<form class="card form importForm" method="post" action="/v158/importar-planilha" enctype="multipart/form-data"><label>Analista responsável<input name="analista" list="v158_analistas" data-auto="analistas" autocomplete="off" value="${esc((user(req)||{}).nome||'')}"></label><datalist id="v158_analistas">${analistas.map(a=>`<option value="${esc(a)}"></option>`).join('')}</datalist><label>Arquivo Excel<input type="file" name="arquivo" accept=".xlsx,.xls,.csv" required></label><button>📥 Importar agora</button></form><div class="card"><p><b>Importação protegida:</b> preserva usuários, analistas, perfis e permissões. Cria backup antes de gravar.</p><p>Compatível com o modelo antigo V12.</p></div><div class="loading hidden">Importando... aguarde.</div><style>.progress-wrap{height:16px;background:#dbe4ee;border-radius:20px;overflow:hidden;margin:15px 0}.progress-bar{height:100%;width:20%;background:#16a34a;transition:width .4s}.import-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:99999}.import-box{background:#fff;padding:25px;border-radius:16px;font-size:22px;font-weight:700;text-align:center}</style>`)
}
function v158_getCell(row,i){return (i>=0 && i<row.length)?row[i]:''}
function v158_headerIndex(headers, names){
  for(const n of names){ const nn=v158_norm(n); const i=headers.findIndex(h=>v158_norm(h).includes(nn)); if(i>=0)return i; }
  return -1;
}

/* PATCH V20.8.14 - importação VestCasa sem alterar layout */
function v20810_key(v){return v158_norm(v).replace(/\b(LTDA|ME|EPP|EIRELI|S A|SA|SERVICOS|SERVIÇOS|COMERCIO|COMÉRCIO)\b/g,'').replace(/[^A-Z0-9]+/g,' ').trim();}
function v20810_tel(v){return v158_dig(v).slice(-11);}
function v20810_isData(v){return !!v158_excelDate(v);}
function v20810_mergeEmpty(obj,k,v){v=v158_norm(v||''); if(v && !obj[k]) obj[k]=v;}
function v20810_prestadorKey(nome,tel){const t=v20810_tel(tel);return t?'TEL:'+t:'NOME:'+v20810_key(nome);}
function v20810_lojaKey(nome,cidade,uf){return [v20810_key(nome),v20810_key(cidade),v20810_key(uf)].filter(Boolean).join('|');}
function v20810_findLoja(d,nome,cidade,uf,cep,endereco,analista){
  nome=v158_norm(nome||'LOJA NAO INFORMADA');cidade=v158_norm(cidade);uf=v158_norm(uf);
  let l=(d.lojas||[]).find(x=>v20810_key(x.nome||x.loja||x.nomeLoja)===v20810_key(nome) && (!cidade||!x.cidade||v20810_key(x.cidade)===v20810_key(cidade)) && (!uf||!x.uf||v20810_key(x.uf||x.estado)===v20810_key(uf)));
  if(!l) l=(d.lojas||[]).find(x=>v20810_key(x.nome||x.loja||x.nomeLoja)===v20810_key(nome));
  let criada=false;
  if(!l){l={id:next(d,'loja'),codigo:'',nome:nome,nomeLoja:nome,cidade,uf,estado:uf,cep:v158_dig(cep),endereco:v158_norm(endereco),telefone:'',cnpj:'',analista:v158_norm(analista)};d.lojas.push(l);criada=true;}
  else{v20810_mergeEmpty(l,'nome',nome);v20810_mergeEmpty(l,'nomeLoja',nome);v20810_mergeEmpty(l,'cidade',cidade);v20810_mergeEmpty(l,'uf',uf);v20810_mergeEmpty(l,'estado',uf);v20810_mergeEmpty(l,'cep',v158_dig(cep));v20810_mergeEmpty(l,'endereco',endereco);v20810_mergeEmpty(l,'analista',analista);}
  return {loja:l,criada};
}
function v20810_findPrestador(d,nome,telefone,tipo){
  nome=v158_norm(nome||''); if(!nome)return {prestador:null,criada:false};
  const key=v20810_prestadorKey(nome,telefone);
  let p=(d.prestadores||[]).find(x=>v20810_prestadorKey(x.empresa||x.responsavel||x.nome,x.telefone||x.whatsapp)===key);
  if(!p && !v20810_tel(telefone)) p=(d.prestadores||[]).find(x=>v20810_key(x.empresa||x.responsavel||x.nome)===v20810_key(nome));
  let criada=false;
  if(!p){p={id:next(d,'prestador'),empresa:nome,responsavel:nome,nome,telefone:v20810_tel(telefone),whatsapp:v20810_tel(telefone),ativo:'SIM',servicos:tipo?[v158_norm(tipo)]:[]};d.prestadores.push(p);criada=true;}
  else{v20810_mergeEmpty(p,'empresa',nome);v20810_mergeEmpty(p,'responsavel',nome);v20810_mergeEmpty(p,'nome',nome); if(v20810_tel(telefone)){v20810_mergeEmpty(p,'telefone',v20810_tel(telefone));v20810_mergeEmpty(p,'whatsapp',v20810_tel(telefone));}}
  if(tipo&&!v158_arr(p.servicos).map(v158_norm).includes(v158_norm(tipo)))p.servicos=[...v158_arr(p.servicos),v158_norm(tipo)];
  return {prestador:p,criada};
}
function v20810_chamadoDuplicado(d,numero,lojaNome){
  const n=v158_dig(numero); if(!n)return false; const lk=v20810_key(lojaNome);
  return (d.chamados||[]).some(c=>v158_dig(c.numeroInterno||c.numeroExterno||c.numero||c.id)===n && (!lk||v20810_key(c.lojaNome||c.loja)===lk));
}

function v158_findOrCreateLoja(d, lojaNome, cidade, uf, cep, endereco, analista){
  lojaNome=v158_norm(lojaNome||'LOJA NAO INFORMADA');
  let l=(d.lojas||[]).find(x=>v158_norm(x.nome||x.loja)===lojaNome || (lojaNome && v158_norm(x.codigo)===lojaNome));
  let criada=false;
  if(!l){l={id:next(d,'loja'),codigo:'',nome:lojaNome,cidade:v158_norm(cidade),uf:v158_norm(uf),estado:v158_norm(uf),cep:v158_dig(cep),endereco:v158_norm(endereco),telefone:'',cnpj:'',analista:v158_norm(analista)};d.lojas.push(l);criada=true;}
  else { if(cidade&&!l.cidade)l.cidade=v158_norm(cidade); if(uf&&!l.uf){l.uf=v158_norm(uf);l.estado=v158_norm(uf)} if(cep&&!l.cep)l.cep=v158_dig(cep); if(endereco&&!l.endereco)l.endereco=v158_norm(endereco); if(analista&&!l.analista)l.analista=v158_norm(analista); }
  return {loja:l,criada};
}
function v158_findOrCreatePrestador(d, nome, telefone, tipo){
  nome=v158_norm(nome||''); if(!nome)return {prestador:null,criada:false};
  let p=(d.prestadores||[]).find(x=>v158_norm(x.empresa||x.responsavel||x.nome)===nome);
  let criada=false;
  if(!p){p={id:next(d,'prestador'),empresa:nome,responsavel:nome,telefone:v158_dig(telefone),ativo:'SIM',servicos:tipo?[v158_norm(tipo)]:[]};d.prestadores.push(p);criada=true;}
  if(tipo&&!v158_arr(p.servicos).map(v158_norm).includes(v158_norm(tipo)))p.servicos=[...v158_arr(p.servicos),v158_norm(tipo)];
  return {prestador:p,criada};
}
function v158_buildRows(filePath){
  // PATCH V20.8.14: leitura leve para não derrubar Render/502.
  // Mantém a estrutura V20.8 e evita cellStyles, que consome muita memória.
  const wb=XLSX.readFile(filePath,{cellDates:true,cellStyles:false,cellNF:false,bookVBA:false,dense:false});
  const ws=wb.Sheets['CHAMADOS']||wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false,blankrows:false});
  let headerIndex=rows.findIndex(r=>{const a=(r||[]).map(v158_norm);return a.includes('LOJA')&&a.some(x=>x.includes('DESCRI'))});
  if(headerIndex<0) headerIndex=rows.findIndex(r=>(r||[]).map(v158_norm).some(x=>x.includes('LOJA')));
  if(headerIndex<0) headerIndex=0;
  const dataRows=rows.slice(headerIndex+1).map(r=>{try{Object.defineProperty(r,'__green',{value:false,enumerable:false});}catch(e){r.__green=false;}return r;});
  const headers=(rows[headerIndex]||[]).map(v158_norm);
  return {headers, dataRows};
}
function v158_importCore(req, file){
  const original=load();
  const keep={usuarios:v158_clone(original.usuarios||[]),perfis:v158_clone(original.perfis||[]),permissoes:v158_clone(original.permissoes||[]),config:v158_clone(original.config||{})};
  v158_backup(original);
  const d=v158_clone(original);
  d.lojas=Array.isArray(d.lojas)?d.lojas:[]; d.prestadores=Array.isArray(d.prestadores)?d.prestadores:[]; d.chamados=Array.isArray(d.chamados)?d.chamados:[]; d.config=d.config||{}; d.config.next=d.config.next||{};
  const {headers,dataRows}=v158_buildRows(file.path);
  const iLoja=v158_headerIndex(headers,['LOJA','NOME LOJA','FILIAL','UNIDADE','CLIENTE','LOCAL']);
  const iNum=v158_headerIndex(headers,['NUMERO','NÚMERO','NRO','CHAMADO','OS','ID','CODIGO']);
  const iData=v158_headerIndex(headers,['DATA','ABERTURA']);
  const iAut=v158_headerIndex(headers,['AUTORIZADO','APROVADO','GERENCIA','GERÊNCIA']);
  const iDesc=v158_headerIndex(headers,['DESCRI','PROBLEMA','SOLICITA','OBSERVA']);
  const iPrest=v158_headerIndex(headers,['PRESTADOR','FORNECEDOR','EXECUTOR','TECNICO','TÉCNICO']);
  const iTel=v158_headerIndex(headers,['TELEFONE','CELULAR','WHATSAPP']);
  const iVal=v158_headerIndex(headers,['VALOR','PRECO','PREÇO','CUSTO']);
  const iAgenda=v158_headerIndex(headers,['AGENDADO','AGENDADA','DATA AGEND']);
  const iPag=v158_headerIndex(headers,['PAGAMENTO','FINANCEIRO','ENVIADO']);
  const iPrior=v158_headerIndex(headers,['PRIORIDADE','PRIORIDA']);
  const iStatus=v158_headerIndex(headers,['STATUS','SITUACAO','SITUAÇÃO']);
  const iServ=v158_headerIndex(headers,['SERVICO','SERVIÇO','TIPO','CATEGORIA']);
  const iCidade=v158_headerIndex(headers,['CIDADE','MUNICIPIO','MUNICÍPIO']);
  const iUf=v158_headerIndex(headers,['UF','ESTADO']);
  const iCep=v158_headerIndex(headers,['CEP']);
  const iEnd=v158_headerIndex(headers,['ENDERECO','ENDEREÇO','LOGRADOURO','RUA']);
  let importados=0, lojasCriadas=0, prestCriados=0, ignoradas=0, duplicados=0;
  const analista=v158_norm(req.body.analista||((user(req)||{}).nome)||'');
  let lojaAtual='';
  for(const r of dataRows){
    const brutoLoja=v158_norm(v158_getCell(r,iLoja));
    const numero=v158_dig(v158_getCell(r,iNum));
    const desc=v158_norm(v158_getCell(r,iDesc));
    const prestNome=v158_norm(v158_getCell(r,iPrest));
    const tel=v158_dig(v158_getCell(r,iTel));
    const valor=v2088_moneyBR(v158_getCell(r,iVal));
    const agendaRaw=v158_getCell(r,iAgenda);
    const pagamentoRaw=v158_getCell(r,iPag);
    const autorizadoRaw=v158_getCell(r,iAut);
    const temDados=!!(numero||desc||prestNome||tel||valor||v158_excelDate(agendaRaw)||v158_norm(agendaRaw)||v158_excelDate(autorizadoRaw)||v158_excelDate(pagamentoRaw));
    if(brutoLoja && !temDados){lojaAtual=brutoLoja; ignoradas++; continue;}
    const lojaNome=brutoLoja||lojaAtual;
    if((!lojaNome && !desc && !numero) || (lojaNome||'').includes('TOTAL') || (lojaNome||'').includes('GASTOS')){ignoradas++; continue;}
    if(!numero && !desc && !prestNome){ignoradas++; continue;}
    if(v20810_chamadoDuplicado(d, numero, lojaNome)){duplicados++; ignoradas++; continue;}
    const tipo=v158_norm(v158_getCell(r,iServ))||'IMPORTADO';
    const li=v20810_findLoja(d,lojaNome||'LOJA NAO INFORMADA',v158_getCell(r,iCidade),v158_getCell(r,iUf),v158_getCell(r,iCep),v158_getCell(r,iEnd),analista); if(li.criada)lojasCriadas++;
    const pi=v20810_findPrestador(d,prestNome,tel,tipo); if(pi.criada)prestCriados++;
    const dataAgendada=v158_excelDate(agendaRaw);
    const textoAgendado=(!dataAgendada && v158_norm(agendaRaw))?v158_norm(agendaRaw):'';
    const dataPagamento=v158_excelDate(pagamentoRaw);
    const dataAutorizado=v158_excelDate(autorizadoRaw);
    const verde=!!r.__green;
    const statusPlan=v158_norm(v158_getCell(r,iStatus));
    const status=verde?'FINALIZADO':(statusPlan||'ABERTO');
    d.chamados.push({
      id:next(d,'chamado'),numeroInterno:numero||next(d,'numeroChamado'),numeroExterno:numero,
      lojaId:li.loja.id,lojaNome:li.loja.nome||li.loja.nomeLoja,prestadorId:pi.prestador?.id||'',prestadorNome:prestNome,
      tipoServico:tipo,descricao:desc||'IMPORTADO SEM DESCRICAO',telefone:tel,valor,
      status,prioridade:v158_norm(v158_getCell(r,iPrior))||'MEDIA',analista,
      dataAbertura:v158_excelDate(v158_getCell(r,iData))||today(),dataAutorizado,dataAprovacao:dataAutorizado,dataAgendada,agendadoTexto:textoAgendado,
      dataPagamento,dataEnviadoFinanceiro:dataPagamento,
      observacoes:textoAgendado?('AGENDADO SERVIÇO: '+textoAgendado):'',
      abertoPor:(user(req)||{}).nome||'',criadoEm:now(),importado:'SIM',finalizadoImportacao:verde?'SIM':'NAO'
    });
    importados++;
  }
  d.usuarios=keep.usuarios; d.perfis=keep.perfis; if(keep.permissoes)d.permissoes=keep.permissoes; d.config={...keep.config,...(d.config||{}),next:{...((keep.config||{}).next||{}),...((d.config||{}).next||{})}};
  v158_atomicSave(d);
  try{ persistentCache = mergeDB(emptyDB(), d); }catch(e){}
  return {importados,lojasCriadas,prestCriados,ignoradas,duplicados};
}

/* PATCH V20.8.14 - IMPORTAÇÃO ASSÍNCRONA COM LOADING */
const v20811ImportJobs = new Map();
function v20811JobPage(req, jobId){
  return v158_safePage(req,'Importando planilha',`<div class="bar"><h2>📥 Importando planilha</h2><a class="btn secondary" href="/importar-planilha">Voltar</a></div><div class="card"><h2>⏳ Processando... aguarde</h2><p>O arquivo foi recebido e está sendo importado em segundo plano.</p><p>Não feche esta tela até concluir.</p><div class="progress-wrap"><div class="progress-bar" id="importProgress"></div></div><p id="importStatus">Iniciando importação...</p></div><script>
(function(){
 const id=${JSON.stringify(jobId)};
 async function poll(){
  try{
   const r=await fetch('/api/importacao-status/'+id,{cache:'no-store'}).then(x=>x.json());
   document.getElementById('importStatus').innerText=r.msg||r.status||'PROCESSANDO';
   document.getElementById('importProgress').style.width=(r.status==='done'||r.status==='error'?'100%':'65%');
   if(r.status==='done'||r.status==='error'){ location.href='/importar-planilha/resultado/'+id; return; }
  }catch(e){ document.getElementById('importStatus').innerText='Aguardando resposta do servidor...'; }
  setTimeout(poll,1800);
 }
 poll();
})();
</script>`);
}
function v20811ResultPage(req, jobId){
  const j=v20811ImportJobs.get(jobId);
  if(!j) return v158_importPage(req,'<h3>⚠️ Resultado da importação não encontrado.</h3>');
  if(j.status==='error') return v158_importPage(req,`<h3>⚠️ Erro ao importar</h3><p>${esc(j.error||'Erro desconhecido')}</p><p>Nada foi salvo. O backup anterior foi preservado.</p>`);
  const r=j.result||{};
  return v158_safePage(req,'Importado',`<div class="card"><h2>✅ Importação concluída</h2><p>Chamados importados: <b>${r.importados||0}</b></p><p>Lojas criadas: <b>${r.lojasCriadas||0}</b> | Prestadores criados: <b>${r.prestCriados||0}</b> | Linhas ignoradas: <b>${r.ignoradas||0}</b> | Duplicados: <b>${r.duplicados||0}</b></p><p><b>Proteção:</b> usuários, analistas, perfis e permissões foram preservados.</p><a class="btn" href="/chamados?mostrar=1">Ver chamados</a><a class="btn secondary" href="/importar-planilha">Nova importação</a></div>`);
}

function v158_uploadMiddleware(req,res,nextfn){
  upload.fields([{name:'arquivo',maxCount:1},{name:'excel',maxCount:1}])(req,res,function(err){
    if(err) return res.status(200).send(v158_importPage(req,`<h3>⚠️ Erro no upload</h3><p>${esc(err.message||String(err))}</p>`));
    req.file=(req.files&&req.files.arquivo&&req.files.arquivo[0])||(req.files&&req.files.excel&&req.files.excel[0])||req.file;
    nextfn();
  });
}
app.get('/importar-planilha',auth,need('IMPORTAR'),(req,res)=>res.send(v158_importPage(req)));
app.post('/importar-planilha',auth,need('IMPORTAR'),v158_uploadMiddleware,(req,res)=>v158_handleImport(req,res));
app.post('/v15/importar-planilha',auth,need('IMPORTAR'),v158_uploadMiddleware,(req,res)=>v158_handleImport(req,res));
app.post('/v155/importar-planilha',auth,need('IMPORTAR'),v158_uploadMiddleware,(req,res)=>v158_handleImport(req,res));
app.post('/v156/importar-planilha',auth,need('IMPORTAR'),v158_uploadMiddleware,(req,res)=>v158_handleImport(req,res));
app.post('/v157/importar-planilha',auth,need('IMPORTAR'),v158_uploadMiddleware,(req,res)=>v158_handleImport(req,res));
app.post('/v158/importar-planilha',auth,need('IMPORTAR'),v158_uploadMiddleware,(req,res)=>v158_handleImport(req,res));

app.get('/api/importacao-status/:id',auth,need('IMPORTAR'),(req,res)=>{
  const j=v20811ImportJobs.get(req.params.id)||{status:'missing',msg:'Importação não encontrada'};
  res.json({status:j.status,msg:j.msg,error:j.error,result:j.result});
});
app.get('/importar-planilha/resultado/:id',auth,need('IMPORTAR'),(req,res)=>res.send(v20811ResultPage(req,req.params.id)));

function v158_handleImport(req,res){
  try{
    if(!req.file) return res.status(200).send(v158_importPage(req,'<h3>⚠️ Nenhum arquivo selecionado.</h3>'));
    const jobId=String(Date.now())+'-'+Math.random().toString(36).slice(2,8);
    v20811ImportJobs.set(jobId,{status:'running',msg:'Arquivo recebido. Preparando leitura...',createdAt:Date.now()});
    res.status(200).send(v20811JobPage(req,jobId));
    setImmediate(()=>{
      try{
        const j=v20811ImportJobs.get(jobId)||{};
        j.msg='Lendo planilha e importando chamados...'; v20811ImportJobs.set(jobId,j);
        const r=v158_importCore(req,req.file);
        v20811ImportJobs.set(jobId,{status:'done',msg:'Importação concluída.',result:r,createdAt:j.createdAt||Date.now(),finishedAt:Date.now()});
        try{fs.unlinkSync(req.file.path)}catch(_e){}
      }catch(e){
        console.error('ERRO IMPORTAÇÃO V20.8.14', e);
        v20811ImportJobs.set(jobId,{status:'error',msg:'Erro ao importar.',error:e.message||String(e),createdAt:Date.now(),finishedAt:Date.now()});
      }
    });
  }catch(e){
    console.error('ERRO IMPORTAÇÃO V20.8.14', e);
    return res.status(200).send(v158_importPage(req,`<h3>⚠️ Erro ao importar</h3><p>${esc(e.message||String(e))}</p><p>Nada foi salvo. O backup anterior foi preservado.</p>`));
  }
}
app.get('/api/v158/analistas',auth,(req,res)=>{try{const d=load(),q=v158_norm(req.query.q||''),set=new Set();(d.usuarios||[]).forEach(u=>{const n=v158_norm(u.nome||u.usuario);if(n)set.add(n)});(d.chamados||[]).forEach(c=>{const n=v158_norm(c.analista);if(n)set.add(n)});(d.lojas||[]).forEach(l=>{const n=v158_norm(l.analista);if(n)set.add(n)});res.json({ok:true,items:[...set].filter(x=>!q||x.includes(q)).sort().slice(0,80).map(nome=>({nome,label:nome}))})}catch(e){res.json({ok:false,items:[]})}});

app.get('/importar-planilha',auth,need('IMPORTAR'),(req,res)=>res.send(v157_layout(req,'Importar',`<div class="bar"><h2>📥 Importar planilha</h2></div><form class="card form" method="post" action="/v157/importar-planilha" enctype="multipart/form-data"><label>Analista responsável<input name="analista" data-auto="analistas" autocomplete="off"></label><label>Arquivo Excel<input type="file" name="excel" accept=".xlsx,.xls,.csv" required></label><button>📥 Importar agora</button></form><div class="loading hidden">Importando... aguarde.</div>`)));
app.post('/importar-planilha',auth,need('IMPORTAR'),upload.single('excel'),v157_import_handler);
app.post('/v15/importar-planilha',auth,need('IMPORTAR'),upload.single('excel'),v157_import_handler);
app.post('/v155/importar-planilha',auth,need('IMPORTAR'),upload.single('excel'),v157_import_handler);
app.post('/v156/importar-planilha',auth,need('IMPORTAR'),upload.single('excel'),v157_import_handler);
app.post('/v157/importar-planilha',auth,need('IMPORTAR'),upload.single('excel'),v157_import_handler);
app.get('/api/v157/analistas',auth,(req,res)=>{try{const d=v157_init(load()),q=v157_up(req.query.q||''),set=new Set();d.usuarios.forEach(u=>{if(v157_up(u.ativo||'SIM')!=='NÃO'){const n=v157_up(u.nome||u.usuario);if(n)set.add(n)}});d.chamados.forEach(c=>{const n=v157_up(c.analista);if(n)set.add(n)});d.lojas.forEach(l=>{const n=v157_up(l.analista);if(n)set.add(n)});res.json({ok:true,items:[...set].filter(x=>!q||x.includes(q)).sort().slice(0,80).map(nome=>({nome,label:nome}))})}catch(e){res.json({ok:false,items:[]})}});

app.get('/importar-planilha',auth,need('IMPORTAR'),(req,res)=>res.send(page(req,'Importar',`<div class="bar"><h2>📥 Importar planilha</h2></div><form class="card form" method="post" enctype="multipart/form-data"><label>Analista responsável<input name="analista" data-auto="analistas"></label><label>Arquivo Excel<input type="file" name="excel" accept=".xlsx,.xls,.csv" required></label><button>📥 Importar agora</button></form><div class="loading hidden">Importando... aguarde.</div>`)));app.post('/importar-planilha',auth,need('IMPORTAR'),upload.single('excel'),(req,res)=>{try{const d=load();const wb=XLSX.readFile(req.file.path);const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{defval:''});let count=0,lojasNovas=0,prestNovos=0;for(const r of rows){const lojaNome=norm(val(r,['LOJA','NOME LOJA','FILIAL','UNIDADE','CLIENTE']));const desc=norm(val(r,['DESCRIÇÃO','DESCRICAO','DESCRICAO SERVICO','SERVIÇO DESCRIÇÃO','OBSERVAÇÃO']));const numero=dig(val(r,['NUMERO','NÚMERO','CHAMADO','OS','ID']));if(!lojaNome&&!desc&&!numero)continue;let loja=d.lojas.find(l=>norm(l.nome)===lojaNome);if(!loja&&lojaNome){loja={id:next(d,'loja'),nome:lojaNome,codigo:'',cidade:norm(val(r,['CIDADE'])),uf:norm(val(r,['UF','ESTADO'])),analista:norm(req.body.analista)};d.lojas.push(loja);lojasNovas++}const prestNome=norm(val(r,['PRESTADOR','EMPRESA','FORNECEDOR','RESPONSAVEL','RESPONSÁVEL']));if(prestNome&&!d.prestadores.some(p=>norm(p.empresa||p.responsavel)===prestNome)){d.prestadores.push({id:next(d,'prestador'),empresa:prestNome,responsavel:prestNome,ativo:'SIM',servicos:[norm(val(r,['SERVIÇO','SERVICO','TIPO SERVICO']))||'A DEFINIR'],cidade:norm(val(r,['CIDADE PRESTADOR','CIDADE'])),uf:norm(val(r,['UF PRESTADOR','UF','ESTADO']))});prestNovos++}d.chamados.push({id:next(d,'chamado'),numeroInterno:numero||next(d,'numeroChamado'),numeroExterno:numero,lojaId:loja?.id||'',lojaNome:lojaNome,status:norm(val(r,['STATUS']))||'AGUARDANDO',prioridade:norm(val(r,['PRIORIDADE']))||'MÍNIMA',tipoServico:norm(val(r,['SERVIÇO','SERVICO','TIPO SERVICO']))||'A DEFINIR',prestadorNome:prestNome,analista:norm(req.body.analista||val(r,['ANALISTA'])),descricao:desc,observacoes:norm(val(r,['OBS','OBSERVACOES','OBSERVAÇÕES'])),valor:money(val(r,['VALOR','PRECO','PREÇO'])),dataAbertura:today(),criadoEm:now(),importado:'SIM'});count++}save(d);res.send(page(req,'Importado',`<div class="card"><h2>✅ Importação concluída</h2><p>Chamados importados: <b>${count}</b></p><p>Lojas criadas: ${lojasNovas} | Prestadores criados: ${prestNovos}</p><a class="btn" href="/chamados?mostrar=1">Ver chamados</a></div>`))}catch(e){res.status(500).send(errorPage(req,e))}});

function filtraChamados(req){const d=load();let l=d.chamados;const de=req.query.de,ate=req.query.ate,loja=norm(req.query.loja),prest=norm(req.query.prestador),anal=norm(req.query.analista),status=norm(req.query.status||'TODOS');if(de)l=l.filter(c=>String(c.dataAbertura||'')>=de);if(ate)l=l.filter(c=>String(c.dataAbertura||'')<=ate);if(loja)l=l.filter(c=>norm(c.lojaNome).includes(loja));if(prest)l=l.filter(c=>norm(c.prestadorNome).includes(prest));if(anal)l=l.filter(c=>norm(c.analista).includes(anal));if(status&&status!=='TODOS')l=l.filter(c=>norm(c.status)===status);return l}function grupo(lista,key){const m={};for(const c of lista){const k=key(c)||'NÃO INFORMADO';m[k]=m[k]||{nome:k,qtd:0,valor:0};m[k].qtd++;m[k].valor+=money(c.valor)}return Object.values(m).sort((a,b)=>b.qtd-a.qtd)}function relBlock(t,rows){return `<section class="card"><h3>${esc(t)}</h3>${tabela(['Nome','Qtd','Valor'],rows.map(r=>`<tr><td>${esc(r.nome)}</td><td>${r.qtd}</td><td>${moeda(r.valor)}</td></tr>`))}</section>`}
app.get('/relatorios',auth,need('RELATORIOS'),(req,res)=>{const lista=filtraChamados(req),total=lista.reduce((s,c)=>s+money(c.valor),0),d=load();res.send(page(req,'Relatórios',`<div class="bar no-print"><h2>📊 Relatórios</h2><button onclick="window.print()">🖨️ Imprimir tudo</button><a class="btn" href="/relatorios-ponto">⏱️ Relatório ponto/horas</a></div><form class="card search no-print" method="get"><input type="date" name="de"><input type="date" name="ate"><input name="loja" placeholder="Loja" data-auto="lojas"><input name="prestador" placeholder="Prestador" data-auto="prestadores"><input name="analista" placeholder="Analista" data-auto="analistas"><select name="status"><option>TODOS</option>${d.statusChamado.map(s=>`<option>${esc(s)}</option>`).join('')}</select><button>Filtrar</button></form><div class="card"><h3>Total filtrado</h3><p>${lista.length} chamados | ${moeda(total)}</p></div><div class="rel-grid">${relBlock('Lojas',grupo(lista,c=>c.lojaNome))}${relBlock('Prestadores',grupo(lista,c=>c.prestadorNome))}${relBlock('Analistas',grupo(lista,c=>c.analista))}${relBlock('Serviços',grupo(lista,c=>c.tipoServico))}</div><div class="card">${tabela(['Nº','Data','Loja','Prestador','Analista','Serviço','Status','Valor'],lista.map(c=>`<tr><td>${esc(c.numeroInterno)}</td><td>${br(c.dataAbertura)}</td><td>${esc(c.lojaNome)}</td><td>${esc(c.prestadorNome)}</td><td>${esc(c.analista)}</td><td>${esc(c.tipoServico)}</td><td>${esc(c.status)}</td><td>${moeda(c.valor)}</td></tr>`))}</div>`))});
app.get('/ponto-horas',auth,need('PONTO_HORAS'),(req,res)=>{const d=load();res.send(page(req,'Ponto/Horas',`<div class="bar"><h2>⏱️ Ponto/Horas</h2><form method="post" action="/ponto-horas/bater"><button>⏱️ Bater ponto agora</button></form></div><form class="card search" method="post"><input type="date" name="data" value="${today()}"><input type="time" name="inicio"><input type="time" name="fim"><input name="obs" placeholder="Observação"><button>Salvar hora extra</button></form><div class="card">${tabela(['Usuário','Data','Início','Fim','Total','Tipo','Obs'],d.pontos.map(p=>`<tr><td>${esc(p.usuarioNome)}</td><td>${br(p.data)}</td><td>${esc(p.inicio)}</td><td>${esc(p.fim)}</td><td>${esc(p.total)}</td><td>${esc(p.tipo)}</td><td>${esc(p.obs)}</td></tr>`))}</div>`))});app.post('/ponto-horas',auth,need('PONTO_HORAS'),(req,res)=>{const d=load(),u=user(req);let total='';if(req.body.inicio&&req.body.fim){const [hi,mi]=req.body.inicio.split(':').map(Number),[hf,mf]=req.body.fim.split(':').map(Number);total=(Math.max(0,(hf*60+mf)-(hi*60+mi))/60).toFixed(2)+'h'}d.pontos.push({id:next(d,'ponto'),usuarioId:u.id,usuarioNome:u.nome,data:req.body.data,inicio:req.body.inicio,fim:req.body.fim,total,tipo:'EXTRA',obs:req.body.obs});save(d);res.redirect('/ponto-horas')});app.post('/ponto-horas/bater',auth,need('PONTO_HORAS'),(req,res)=>{const d=load(),u=user(req),dt=new Date(),data=today(),hora=String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');const aberto=[...d.pontos].reverse().find(p=>String(p.usuarioId)===String(u.id)&&p.data===data&&!p.fim);if(aberto){aberto.fim=hora}else d.pontos.push({id:next(d,'ponto'),usuarioId:u.id,usuarioNome:u.nome,data,inicio:hora,fim:'',total:'',tipo:'PONTO',obs:'BATIDA AUTOMÁTICA'});save(d);res.redirect('/ponto-horas')});app.get('/relatorios-ponto',auth,need('RELATORIOS'),(req,res)=>{const d=load();res.send(page(req,'Relatório Ponto',`<div class="bar no-print"><h2>⏱️ Relatório Ponto/Horas</h2><button onclick="window.print()">Imprimir</button></div><div class="card">${tabela(['Usuário','Data','Início','Fim','Total','Tipo','Obs'],d.pontos.map(p=>`<tr><td>${esc(p.usuarioNome)}</td><td>${br(p.data)}</td><td>${esc(p.inicio)}</td><td>${esc(p.fim)}</td><td>${esc(p.total)}</td><td>${esc(p.tipo)}</td><td>${esc(p.obs)}</td></tr>`))}</div>`))});
app.get('/backup',auth,need('BACKUP'),(req,res)=>res.send(page(req,'Backup',`<div class="bar"><h2>💾 Backup/Restauração</h2><a class="btn" href="/config">Voltar</a></div><section class="card"><a class="btn" href="/backup/download">⬇️ Baixar backup JSON</a></section><form class="card form" method="post" enctype="multipart/form-data"><label>Restaurar backup JSON<input type="file" name="backup" accept=".json" required></label><button>♻️ Restaurar</button></form>`)));app.get('/backup/download',auth,need('BACKUP'),(req,res)=>res.download(DB_FILE,`backup-vbchamados-${today()}.json`));app.post('/backup',auth,need('BACKUP'),upload.single('backup'),(req,res)=>{try{const obj=JSON.parse(fs.readFileSync(req.file.path,'utf8'));const e=emptyDB();save({...e,...obj,config:{...e.config,...(obj.config||{}),next:{...e.config.next,...((obj.config||{}).next||{})}}});res.send(page(req,'Backup',`<div class="card"><h2>✅ Backup restaurado</h2><a class="btn" href="/">Início</a></div>`))}catch(e){res.status(500).send(errorPage(req,e))}});


/* V16.1 - rotas finais estáveis */
function v15Val(row, keys){
  const map={};
  Object.entries(row||{}).forEach(([k,v])=>map[norm(k).replace(/[^A-Z0-9]/g,'')]=v);
  for(const k of keys){const kk=norm(k).replace(/[^A-Z0-9]/g,''); if(map[kk]!==undefined && String(map[kk]).trim()!=='') return map[kk];}
  return '';
}
app.post('/v15/importar-planilha',auth,need('IMPORTAR'),upload.single('excel'),(req,res)=>{
  try{
    const d=load();
    if(!req.file) return res.send(page(req,'Importação',`<div class="card"><h2>⚠️ Nenhum arquivo enviado</h2><a class="btn" href="/importar-planilha">Voltar</a></div>`));
    const wb=XLSX.readFile(req.file.path,{cellDates:false});
    let rows=[];
    for(const sh of wb.SheetNames) rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[sh],{defval:'',raw:false,blankrows:false}));
    let count=0,lojasNovas=0,prestNovos=0,ignoradas=0;
    for(const r of rows){
      const lojaNome=norm(v15Val(r,['LOJA','NOME LOJA','NOME_LOJA','FILIAL','UNIDADE','CLIENTE','REQUERENTE','LOCAL','LOJA / FILIAL']));
      const desc=norm(v15Val(r,['DESCRIÇÃO','DESCRICAO','DESCRIÇÃO SERVIÇOS','DESCRICAO SERVICOS','DESCRICAO_SERVICO','PROBLEMA','OBSERVAÇÃO','OBSERVACAO','SERVIÇO SOLICITADO','DESCRICAO DO CHAMADO']));
      const numero=dig(v15Val(r,['NUMERO','NÚMERO','NRO','Nº','CHAMADO','N CHAMADO','ID','CODIGO','CÓDIGO','OS']));
      const prestNome=norm(v15Val(r,['PRESTADOR','EMPRESA','FORNECEDOR','EXECUTOR','TÉCNICO','TECNICO','RESPONSAVEL','RESPONSÁVEL']));
      const cidade=norm(v15Val(r,['CIDADE','MUNICIPIO','MUNICÍPIO','CIDADE LOJA']));
      const uf=norm(v15Val(r,['UF','ESTADO','UF LOJA']));
      const cep=dig(v15Val(r,['CEP','CEP LOJA']));
      const endereco=norm(v15Val(r,['ENDEREÇO','ENDERECO','LOGRADOURO','ENDEREÇO LOJA']));
      const tipoServico=norm(v15Val(r,['SERVIÇO','SERVICO','TIPO SERVIÇO','TIPO_SERVICO','CATEGORIA','TIPO']))||'A DEFINIR';
      if(!lojaNome && !numero && !desc){ignoradas++; continue;}
      let loja=d.lojas.find(l=>norm(l.nome)===lojaNome || (lojaNome && norm(l.codigo)===lojaNome));
      if(!loja){loja={id:next(d,'loja'),codigo:'',nome:lojaNome||'LOJA NÃO INFORMADA',cidade,uf,estado:uf,cep,endereco,analista:norm(req.body.analista||''),telefone:'',cnpj:''}; d.lojas.push(loja); lojasNovas++;}
      else{ if(cep&&!loja.cep)loja.cep=cep; if(cidade&&!loja.cidade)loja.cidade=cidade; if(uf&&!loja.uf){loja.uf=uf;loja.estado=uf;} if(endereco&&!loja.endereco)loja.endereco=endereco; }
      let prest=null;
      if(prestNome){ prest=d.prestadores.find(p=>norm(p.empresa||p.responsavel)===prestNome); if(!prest){prest={id:next(d,'prestador'),empresa:prestNome,responsavel:prestNome,ativo:'SIM',cidade:'',uf:'',servicos:[tipoServico]}; d.prestadores.push(prest); prestNovos++;}}
      d.chamados.push({id:next(d,'chamado'),numeroInterno:numero||next(d,'numeroChamado'),numeroExterno:numero,lojaId:loja.id,lojaNome:loja.nome,prestadorId:prest?.id||'',prestadorNome:prestNome,tipoServico,status:norm(v15Val(r,['STATUS','SITUAÇÃO','SITUACAO']))||'AGUARDANDO',prioridade:norm(v15Val(r,['PRIORIDADE']))||'MÍNIMA',valor:money(v15Val(r,['VALOR','PREÇO','PRECO','CUSTO'])),analista:norm(req.body.analista||v15Val(r,['ANALISTA','RESPONSÁVEL','RESPONSAVEL'])),descricao:desc||'IMPORTADO SEM DESCRIÇÃO',observacoes:norm(v15Val(r,['OBS','OBSERVAÇÃO','OBSERVACAO'])),dataAbertura:today(),criadoEm:now(),importado:'SIM'});
      count++;
    }
    save(d);
    res.send(page(req,'Importado',`<div class="card"><h2>✅ Importação concluída</h2><p>Chamados importados: <b>${count}</b></p><p>Lojas criadas: <b>${lojasNovas}</b> | Prestadores criados: <b>${prestNovos}</b> | Linhas ignoradas: <b>${ignoradas}</b></p><a class="btn" href="/chamados?mostrar=1">Ver chamados</a><a class="btn secondary" href="/importar-planilha">Nova importação</a></div>`));
  }catch(e){res.status(500).send(errorPage(req,e));}
});
app.get('/diagnostico',auth,need('CONFIG'),(req,res)=>{const d=load();const checks=[['Usuários',d.usuarios.length],['Perfis',d.perfis.length],['Lojas',d.lojas.length],['Prestadores',d.prestadores.length],['Proprietários',d.proprietarios.length],['Chamados',d.chamados.length],['O.S.',d.os.length],['Lembretes',d.lembretes.length],['Preventivas',d.preventivas.length],['Pontos',d.pontos.length]];res.send(page(req,'Diagnóstico',`<div class="bar"><h2>🩺 Diagnóstico V16.1</h2><a class="btn secondary" href="/config">Voltar</a></div><div class="card">${tabela(['Módulo','Registros'],checks.map(c=>`<tr><td>${esc(c[0])}</td><td>${esc(c[1])}</td></tr>`))}</div>`));});



/* PATCH V16.1 - PDF CIDADE/UF/CEP + COMBOBOX CIDADES */
const V15_UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const V15_CIDADES_BASE = [
  ["SP","PRAIA GRANDE"],["SP","SAO PAULO"],["SP","SÃO PAULO"],["SP","SANTOS"],["SP","CAMPINAS"],["SP","RIBEIRAO PRETO"],["SP","RIBEIRÃO PRETO"],["SP","SAO JOSE DO RIO PRETO"],["SP","SÃO JOSÉ DO RIO PRETO"],["SP","IBITINGA"],["SP","BAURU"],["SP","SOROCABA"],["SP","GUARULHOS"],["SP","OSASCO"],["SP","SANTO ANDRE"],["SP","SANTO ANDRÉ"],["SP","SAO BERNARDO DO CAMPO"],["SP","SÃO BERNARDO DO CAMPO"],
  ["MG","UBERLANDIA"],["MG","UBERLÂNDIA"],["MG","BELO HORIZONTE"],["MG","CONTAGEM"],["MG","JUIZ DE FORA"],["MG","UBERABA"],
  ["SC","GASPAR"],["SC","BLUMENAU"],["SC","FLORIANOPOLIS"],["SC","FLORIANÓPOLIS"],["SC","JOINVILLE"],["SC","ITAJAÍ"],["SC","ITAJAI"],
  ["PR","CURITIBA"],["PR","LONDRINA"],["PR","MARINGA"],["PR","MARINGÁ"],["PR","CASCAVEL"],
  ["RJ","RIO DE JANEIRO"],["RJ","NITEROI"],["RJ","NITERÓI"],["RJ","DUQUE DE CAXIAS"],
  ["RS","PORTO ALEGRE"],["RS","CAXIAS DO SUL"],["RS","CANOAS"],
  ["BA","SALVADOR"],["PE","RECIFE"],["CE","FORTALEZA"],["GO","GOIANIA"],["GO","GOIÂNIA"],["DF","BRASILIA"],["DF","BRASÍLIA"]
];
function v151_up(v){ return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim(); }
function v151_dig(v){ return String(v||"").replace(/\D/g,""); }
function v151_norm_space(v){ return v151_up(v).replace(/\s+/g," ").trim(); }
function v151_clean_nome_empresa(v){
  return v151_norm_space(v)
    .replace(/\b(NOME|EMPRESARIAL|RAZAO|RAZÃO|SOCIAL|TITULO|TÍTULO|DO|DA|DE|ESTABELECIMENTO|FANTASIA)\b/g," ")
    .replace(/\b(LTDA|L T D A|EIRELI|EPP|ME|MATRIZ|FILIAL|S\/A|SA|S A)\b/g," ")
    .replace(/\b(CNPJ|CEP|UF|TELEFONE|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|MUNICIPIO|MUNICÍPIO|DISTRITO|BAIRRO|LOGRADOURO|NUMERO|NÚMERO)\b/g," ")
    .replace(/[^A-Z0-9À-Ú ]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function v151_clean_cidade(v){
  return v151_norm_space(v)
    .replace(/\b(MUNICIPIO|MUNICÍPIO|CIDADE|UF|CEP|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|DISTRITO|BAIRRO|LOGRADOURO)\b/g," ")
    .replace(/[^A-ZÀ-Ú ]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function v151_uf(v){
  const m = v151_up(v).match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);
  return m ? m[1] : "";
}
function v151_find_city_in_text(text){
  const up = v151_up(text);
  for(const [uf,cid] of V15_CIDADES_BASE){
    const c = v151_up(cid);
    if(up.includes(c+" "+uf) || up.includes(c+" - "+uf) || up.includes(c+"/"+uf) || up.includes(c)){
      return {cidade:c, uf};
    }
  }
  return {cidade:"",uf:""};
}
async function v151_parse_pdf(filePath){
  const data = await pdfParse(fs.readFileSync(filePath));
  const raw = (data.text || "").replace(/\r/g,"\n");
  const lines = raw.split(/\n+/).map(x=>v151_norm_space(x)).filter(Boolean);
  const text = lines.join(" ");

  const cnpj = (text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)||[])[0] || "";
  const cep = (text.match(/\d{5}-?\d{3}/)||[])[0] || "";
  const tel = (text.match(/(?:\(?\d{2}\)?\s*)?\d{4,5}-?\d{4}/)||[])[0] || "";

  function pickAfter(labels){
    for(const label of labels){
      const idx = lines.findIndex(l => l.includes(label));
      if(idx >= 0){
        const same = lines[idx].split(label).pop().replace(/^[:\-\s]+/,"").trim();
        if(same && same.length > 2 && !/(COMPROVANTE|CADASTRO|DATA|REPUBLICA|REPÚBLICA|EMAIL|E-MAIL|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO|CNPJ|CEP|UF)$/.test(same)) return same;
        for(let i=idx+1;i<Math.min(lines.length, idx+8);i++){
          const v = lines[i];
          if(v && !/^(DATA|NUMERO|NÚMERO|COMPROVANTE|CADASTRO|REPUBLICA|REPÚBLICA|CNPJ|CEP|UF|PORTE|CODIGO|CÓDIGO|EMAIL|E-MAIL|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO)$/.test(v)) return v;
        }
      }
    }
    return "";
  }

  let nome = pickAfter(["TITULO DO ESTABELECIMENTO","TÍTULO DO ESTABELECIMENTO","NOME DE FANTASIA","NOME EMPRESARIAL","RAZAO SOCIAL","RAZÃO SOCIAL"]);
  if(!nome) nome = lines.find(l => /\b(LTDA|EIRELI|EPP|MEGA VEST CASA|VEST CASA)\b/.test(l) && !/ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|COMPROVANTE|CADASTRO/.test(l)) || "";

  let cidade = pickAfter(["MUNICIPIO","MUNICÍPIO","CIDADE"]);
  let uf = pickAfter(["UF"]);
  let endereco = pickAfter(["LOGRADOURO","ENDERECO","ENDEREÇO"]);

  const cityFind = v151_find_city_in_text(text);
  if(!cidade || cidade.length < 3) cidade = cityFind.cidade;
  if(!v151_uf(uf)) uf = cityFind.uf || v151_uf(text);

  cidade = v151_clean_cidade(cidade);
  uf = v151_uf(uf);
  endereco = v151_norm_space(endereco).replace(/\b(CEP|UF|MUNICIPIO|MUNICÍPIO|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO)\b/g," ").replace(/\s+/g," ").trim();

  return {nome:v151_clean_nome_empresa(nome), cnpj:v151_dig(cnpj), cep:v151_dig(cep), telefone:v151_dig(tel), cidade, uf, estado:uf, endereco};
}
function v151_nome_loja(parsed, config, fallback){
  const regra = v151_up(config?.regraNomeFilial || "");
  const nome = v151_clean_nome_empresa(parsed.nome || fallback || "");
  const cidade = v151_clean_cidade(parsed.cidade || "");
  const uf = v151_uf(parsed.uf || parsed.estado || "");
  if(regra.includes("MESCLAR") && nome && cidade) return `${nome} ${cidade} ${uf}`.replace(/\s+/g," ").trim();
  return nome || fallback || "";
}
function v151_file(req,name){ return (req.files && req.files[name] && req.files[name][0]) || null; }
function v151_file_obj(f){ return f ? {original:f.originalname,path:"uploads/"+f.filename,filename:f.filename,mimetype:f.mimetype,size:f.size,at:nowISO()} : null; }
function v151_perm(perm){ return (typeof v145Require==="function" ? v145Require(perm) : (typeof requirePerm==="function" ? requirePerm(perm) : (req,res,next)=>next())); }
const v151_upload = upload.fields([{name:"pdf",maxCount:1},{name:"logoLocal",maxCount:1},{name:"cartaoCnpj",maxCount:1},{name:"fotos",maxCount:20}]);

async function v151_save_loja_pdf(req,res){
  try{
    const d=db(); let l=req.params.id ? d.lojas.find(x=>String(x.id)===String(req.params.id)) : null;
    if(!l){ l={id:nextId(d,"loja")}; d.lojas.push(l); }
    const parsed = v151_file(req,"pdf") ? await v151_parse_pdf(v151_file(req,"pdf").path) : {};
    Object.assign(l,{
      codigo:req.body.codigo||l.codigo||l.id,
      tipoCodigo:req.body.tipoCodigo||l.tipoCodigo||"SOMENTE NÚMERO",
      nome:v151_nome_loja(parsed,d.config,req.body.nome||l.nome),
      responsavel:v151_up(req.body.responsavel||l.responsavel),
      cnpj:v151_dig(parsed.cnpj||req.body.cnpj||l.cnpj),
      ie:v151_up(req.body.ie||l.ie),
      telefone:v151_dig(parsed.telefone||req.body.telefone||l.telefone),
      whatsappResponsavel:v151_dig(req.body.whatsappResponsavel||l.whatsappResponsavel),
      cep:v151_dig(parsed.cep||req.body.cep||l.cep),
      uf:v151_uf(parsed.uf||req.body.uf||req.body.estado||l.uf||l.estado),
      estado:v151_uf(parsed.uf||req.body.uf||req.body.estado||l.uf||l.estado),
      cidade:v151_clean_cidade(parsed.cidade||req.body.cidade||l.cidade),
      endereco:v151_up(parsed.endereco||req.body.endereco||l.endereco),
      latitude:req.body.latitude||l.latitude||"",
      longitude:req.body.longitude||l.longitude||"",
      analista:v151_up(req.body.analista||l.analista),
      proprietario:v151_up(req.body.proprietario||l.proprietario),
      feriado:v151_up(req.body.feriado||l.feriado||"FECHADO"),
      logoUrl:req.body.logoUrl||l.logoUrl||"",
      horario:req.body.horario||l.horario||""
    });
    if(v151_file(req,"logoLocal")) l.logoLocal=v151_file_obj(v151_file(req,"logoLocal"));
    if(v151_file(req,"cartaoCnpj")) l.cartaoCnpj=v151_file_obj(v151_file(req,"cartaoCnpj"));
    l.fotos=[...arr(l.fotos), ...((req.files?.fotos||[]).map(v151_file_obj))];
    save(d); res.redirect(`/lojas/${l.id}/editar`);
  }catch(e){res.status(500).send(errorPage(req,e));}
}
async function v151_save_prestador_pdf(req,res){
  try{
    const d=db(); let p=req.params.id ? d.prestadores.find(x=>String(x.id)===String(req.params.id)) : null;
    if(!p){ p={id:nextId(d,"prestador")}; d.prestadores.push(p); }
    const parsed = v151_file(req,"pdf") ? await v151_parse_pdf(v151_file(req,"pdf").path) : {};
    Object.assign(p,{
      empresa:v151_up(parsed.nome||req.body.empresa||req.body.nome||p.empresa),
      responsavel:v151_up(req.body.responsavel||p.responsavel||parsed.nome),
      telefone:v151_dig(parsed.telefone||req.body.telefone||p.telefone),
      email:req.body.email||p.email||"",
      cnpj:v151_dig(parsed.cnpj||req.body.cnpj||p.cnpj),
      cpf:v151_dig(req.body.cpf||p.cpf),
      cpfCnh:req.body.cpfCnh||p.cpfCnh||"",
      cep:v151_dig(parsed.cep||req.body.cep||p.cep),
      uf:v151_uf(parsed.uf||req.body.uf||req.body.estado||p.uf||p.estado),
      estado:v151_uf(parsed.uf||req.body.uf||req.body.estado||p.uf||p.estado),
      cidade:v151_clean_cidade(parsed.cidade||req.body.cidade||p.cidade),
      endereco:v151_up(parsed.endereco||req.body.endereco||p.endereco),
      ativo:v151_up(req.body.ativo||p.ativo||"SIM"),
      raioKm:req.body.raioKm||p.raioKm||"",
      valorKm:req.body.valorKm||p.valorKm||"",
      latitude:req.body.latitude||p.latitude||"",
      longitude:req.body.longitude||p.longitude||"",
      tipoPagamento:req.body.tipoPagamento||p.tipoPagamento||"PIX",
      dadosPagamento:req.body.dadosPagamento||p.dadosPagamento||"",
      servicos:arr(req.body.servicos).length?arr(req.body.servicos).map(v151_up):arr(p.servicos),
      logoUrl:req.body.logoUrl||p.logoUrl||""
    });
    if(v151_file(req,"logoLocal")) p.logoLocal=v151_file_obj(v151_file(req,"logoLocal"));
    if(v151_file(req,"cartaoCnpj")) p.cartaoCnpj=v151_file_obj(v151_file(req,"cartaoCnpj"));
    p.fotos=[...arr(p.fotos), ...((req.files?.fotos||[]).map(v151_file_obj))];
    save(d); res.redirect(`/prestadores/${p.id}/editar`);
  }catch(e){res.status(500).send(errorPage(req,e));}
}
app.get("/api/cidades", auth, (req,res)=>{
  const q=v151_up(req.query.q||"");
  const items=V15_CIDADES_BASE
    .map(([uf,cidade])=>({uf,cidade:v151_up(cidade),label:`${v151_up(cidade)} / ${uf}`}))
    .filter(x=>!q || x.cidade.includes(q) || x.uf.includes(q))
    .slice(0,80);
  res.json({ok:true,items});
});
app.get("/api/ufs", auth, (req,res)=>res.json({ok:true,items:V15_UFS}));
app.post("/v151/loja-pdf", auth, v151_perm("LOJAS"), v151_upload, v151_save_loja_pdf);
app.post("/v151/loja-pdf/:id", auth, v151_perm("LOJAS"), v151_upload, v151_save_loja_pdf);
app.post("/v151/prestador-pdf", auth, v151_perm("PRESTADORES"), v151_upload, v151_save_prestador_pdf);
app.post("/v151/prestador-pdf/:id", auth, v151_perm("PRESTADORES"), v151_upload, v151_save_prestador_pdf);



/* PATCH V16.1 - PDF NOME LOJA + CEP DEFINITIVO */
function v152_up(v){ return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim(); }
function v152_dig(v){ return String(v||"").replace(/\D/g,""); }
function v152_clean_nome(v){
  let s=v152_up(v)
    .replace(/\b(NOME|EMPRESARIAL|RAZAO|RAZÃO|SOCIAL|TITULO|TÍTULO|DO|DA|DE|ESTABELECIMENTO|FANTASIA|MATRIZ|FILIAL)\b/g," ")
    .replace(/\b(LTDA|L T D A|EIRELI|EPP|ME|S\/A|SA|S A)\b/g," ")
    .replace(/\b(CNPJ|CEP|UF|TELEFONE|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|MUNICIPIO|MUNICÍPIO|DISTRITO|BAIRRO|LOGRADOURO|NUMERO|NÚMERO)\b/g," ")
    .replace(/[^A-Z0-9À-Ú ]/g," ")
    .replace(/\s+/g," ")
    .trim();
  if(!s) return "";
  if(s.includes("MEGA") && s.includes("VEST") && s.includes("CASA")) return "MEGA VEST CASA";
  if(s.includes("VEST") && s.includes("CASA")) return "MEGA VEST CASA";
  return s;
}
function v152_clean_cidade(v){
  return v152_up(v)
    .replace(/\b(MUNICIPIO|MUNICÍPIO|CIDADE|UF|CEP|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|DISTRITO|BAIRRO|LOGRADOURO)\b/g," ")
    .replace(/[^A-ZÀ-Ú ]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function v152_uf(v){
  return (v152_up(v).match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)||[])[1] || "";
}
function v152_cep_from_text(text){
  const t = String(text||"");
  let m = t.match(/\b\d{5}-?\d{3}\b/);
  if(m) return v152_dig(m[0]);
  m = t.match(/\b\d{2}\.?\d{3}-?\d{3}\b/);
  if(m) return v152_dig(m[0]);
  m = t.match(/\b(0[1-9]|[1-9][0-9])\d{6}\b/);
  if(m) return v152_dig(m[0]);
  return "";
}
function v152_find_city(text){
  const cidades = [
    ["SP","PRAIA GRANDE"],["SP","IBITINGA"],["SP","SAO PAULO"],["SP","SÃO PAULO"],["SP","SANTOS"],["SP","GUARUJA"],["SP","GUARUJÁ"],["SP","CAMPINAS"],["SP","PIRACICABA"],["SP","VARGEM GRANDE PAULISTA"],["SP","RIBEIRAO PRETO"],["SP","RIBEIRÃO PRETO"],
    ["MG","UBERLANDIA"],["MG","UBERLÂNDIA"],["MG","BELO HORIZONTE"],
    ["SC","GASPAR"],["SC","BLUMENAU"],["SC","ITAJAÍ"],["SC","ITAJAI"],
    ["PR","CURITIBA"],["RJ","RIO DE JANEIRO"],["RS","PORTO ALEGRE"]
  ];
  const up=v152_up(text);
  for(const [uf,cidade] of cidades){
    const c=v152_up(cidade);
    if(up.includes(c+" "+uf) || up.includes(c+" / "+uf) || up.includes(c+"/"+uf) || up.includes(c+"-"+uf) || up.includes(c)) return {cidade:c,uf};
  }
  return {cidade:"",uf:""};
}
async function v152_parse_pdf(filePath){
  const data = await pdfParse(fs.readFileSync(filePath));
  const raw = (data.text || "").replace(/\r/g,"\n");
  const lines = raw.split(/\n+/).map(x=>v152_up(x).replace(/\s+/g," ").trim()).filter(Boolean);
  const text = lines.join(" ");
  const cnpj = (text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)||[])[0] || "";
  const cep = v152_cep_from_text(text);
  const tel = (text.match(/(?:\(?\d{2}\)?\s*)?\d{4,5}-?\d{4}/)||[])[0] || "";

  function pick(labels){
    for(const label of labels){
      const idx=lines.findIndex(l=>l.includes(label));
      if(idx>=0){
        const same=lines[idx].split(label).pop().replace(/^[:\-\s]+/,"").trim();
        if(same && same.length>2 && !/(COMPROVANTE|CADASTRO|DATA|REPUBLICA|REPÚBLICA|EMAIL|E-MAIL|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO|CNPJ|CEP|UF)$/.test(same)) return same;
        for(let i=idx+1;i<Math.min(lines.length,idx+10);i++){
          const v=lines[i];
          if(v && !/^(DATA|NUMERO|NÚMERO|COMPROVANTE|CADASTRO|REPUBLICA|REPÚBLICA|CNPJ|CEP|UF|PORTE|CODIGO|CÓDIGO|EMAIL|E-MAIL|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO)$/.test(v)) return v;
        }
      }
    }
    return "";
  }

  let nome = pick(["TITULO DO ESTABELECIMENTO","TÍTULO DO ESTABELECIMENTO","NOME DE FANTASIA","NOME EMPRESARIAL","RAZAO SOCIAL","RAZÃO SOCIAL"]);
  if(!nome){
    nome = lines.find(l=>/\b(MEGA VEST CASA|VEST CASA|LTDA|EIRELI|EPP)\b/.test(l) && !/ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|COMPROVANTE|CADASTRO|ATIVIDADE/.test(l)) || "";
  }
  if(!nome && text.includes("31035833008600")) nome = "MEGA VEST CASA";
  if(!nome && text.includes("MEGA") && text.includes("VEST") && text.includes("CASA")) nome = "MEGA VEST CASA";

  let cidade = pick(["MUNICIPIO","MUNICÍPIO","CIDADE"]);
  let uf = pick(["UF"]);
  const found = v152_find_city(text);
  if(!cidade || cidade.length<3) cidade = found.cidade;
  if(!v152_uf(uf)) uf = found.uf || v152_uf(text);

  let endereco = pick(["LOGRADOURO","ENDERECO","ENDEREÇO"]);
  endereco = v152_up(endereco).replace(/\b(CEP|UF|MUNICIPIO|MUNICÍPIO|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO)\b/g," ").replace(/\s+/g," ").trim();

  return {
    nome:v152_clean_nome(nome),
    cnpj:v152_dig(cnpj),
    cep:v152_dig(cep),
    telefone:v152_dig(tel),
    cidade:v152_clean_cidade(cidade),
    uf:v152_uf(uf),
    estado:v152_uf(uf),
    endereco
  };
}
function v152_nome_loja(parsed, config, fallback){
  let nome = v152_clean_nome(parsed.nome || fallback || "");
  const cidade = v152_clean_cidade(parsed.cidade || "");
  const uf = v152_uf(parsed.uf || parsed.estado || "");
  const regra = v152_up(config?.regraNomeFilial || "");
  if(regra.includes("MESCLAR") && nome && cidade) return `${nome} ${cidade} ${uf}`.replace(/\s+/g," ").trim();
  if(!nome && cidade) return `MEGA VEST CASA ${cidade} ${uf}`.replace(/\s+/g," ").trim();
  return nome || fallback || "";
}
function v152_file(req,name){ return (req.files && req.files[name] && req.files[name][0]) || null; }
function v152_file_obj(f){ return f ? {original:f.originalname,path:"uploads/"+f.filename,filename:f.filename,mimetype:f.mimetype,size:f.size,at:nowISO()} : null; }
function v152_perm(perm){ return (typeof v145Require==="function" ? v145Require(perm) : (typeof requirePerm==="function" ? requirePerm(perm) : (req,res,next)=>next())); }
const v152_upload = upload.fields([{name:"pdf",maxCount:1},{name:"logoLocal",maxCount:1},{name:"cartaoCnpj",maxCount:1},{name:"fotos",maxCount:20}]);

async function v152_save_loja_pdf(req,res){
  try{
    const d=db();
    let l=req.params.id ? d.lojas.find(x=>String(x.id)===String(req.params.id)) : null;
    if(!l){ l={id:nextId(d,"loja")}; d.lojas.push(l); }
    const parsed = v152_file(req,"pdf") ? await v152_parse_pdf(v152_file(req,"pdf").path) : {};
    Object.assign(l,{
      codigo:req.body.codigo||l.codigo||l.id,
      tipoCodigo:req.body.tipoCodigo||l.tipoCodigo||"SOMENTE NÚMERO",
      nome:v152_nome_loja(parsed,d.config,req.body.nome||l.nome),
      responsavel:v152_up(req.body.responsavel||l.responsavel),
      cnpj:v152_dig(parsed.cnpj||req.body.cnpj||l.cnpj),
      ie:v152_up(req.body.ie||l.ie),
      telefone:v152_dig(parsed.telefone||req.body.telefone||l.telefone),
      whatsappResponsavel:v152_dig(req.body.whatsappResponsavel||l.whatsappResponsavel),
      cep:v152_dig(parsed.cep||req.body.cep||l.cep),
      uf:v152_uf(parsed.uf||req.body.uf||req.body.estado||l.uf||l.estado),
      estado:v152_uf(parsed.uf||req.body.uf||req.body.estado||l.uf||l.estado),
      cidade:v152_clean_cidade(parsed.cidade||req.body.cidade||l.cidade),
      endereco:v152_up(parsed.endereco||req.body.endereco||l.endereco),
      latitude:req.body.latitude||l.latitude||"",
      longitude:req.body.longitude||l.longitude||"",
      analista:v152_up(req.body.analista||l.analista),
      proprietario:v152_up(req.body.proprietario||l.proprietario),
      feriado:v152_up(req.body.feriado||l.feriado||"FECHADO"),
      logoUrl:req.body.logoUrl||l.logoUrl||"",
      horario:req.body.horario||l.horario||""
    });
    if(v152_file(req,"logoLocal")) l.logoLocal=v152_file_obj(v152_file(req,"logoLocal"));
    if(v152_file(req,"cartaoCnpj")) l.cartaoCnpj=v152_file_obj(v152_file(req,"cartaoCnpj"));
    l.fotos=[...arr(l.fotos), ...((req.files?.fotos||[]).map(v152_file_obj))];
    save(d);
    res.redirect(`/lojas/${l.id}/editar`);
  }catch(e){res.status(500).send(errorPage(req,e));}
}
app.post("/v152/loja-pdf", auth, v152_perm("LOJAS"), v152_upload, v152_save_loja_pdf);
app.post("/v152/loja-pdf/:id", auth, v152_perm("LOJAS"), v152_upload, v152_save_loja_pdf);



/* PATCH V16.1 - IMPORTAÇÃO PDF ESTILO V11, SEM ERRO db */
function v153_up(v){ return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim(); }
function v153_dig(v){ return String(v||"").replace(/\D/g,""); }
function v153_arr(v){ if(Array.isArray(v)) return v; if(v===undefined||v===null||v==="") return []; return [v]; }
function v153_getDB(){
  if(typeof db === "function") return db();
  if(typeof readDb === "function") return readDb();
  if(typeof readDB === "function") return readDB();
  if(typeof loadDb === "function") return loadDb();
  if(typeof loadDB === "function") return loadDB();
  const f = (typeof DB_FILE !== "undefined") ? DB_FILE : (typeof DATA_FILE !== "undefined" ? DATA_FILE : path.join(process.cwd(),"data","db.json"));
  if(!fs.existsSync(path.dirname(f))) fs.mkdirSync(path.dirname(f),{recursive:true});
  if(!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify({lojas:[],prestadores:[],proprietarios:[],chamados:[],config:{},_seq:{}},null,2));
  return JSON.parse(fs.readFileSync(f,"utf8"));
}
function v153_saveDB(d){
  if(typeof save === "function") return save(d);
  if(typeof saveDb === "function") return saveDb(d);
  if(typeof saveDB === "function") return saveDB(d);
  if(typeof writeDb === "function") return writeDb(d);
  if(typeof writeDB === "function") return writeDB(d);
  const f = (typeof DB_FILE !== "undefined") ? DB_FILE : (typeof DATA_FILE !== "undefined" ? DATA_FILE : path.join(process.cwd(),"data","db.json"));
  if(!fs.existsSync(path.dirname(f))) fs.mkdirSync(path.dirname(f),{recursive:true});
  fs.writeFileSync(f, JSON.stringify(d,null,2));
}
function v153_next(d,k){ if(typeof nextId==="function") return nextId(d,k); d._seq=d._seq||{}; d._seq[k]=(d._seq[k]||0)+1; return d._seq[k]; }
function v153_error(req,e){ if(typeof errorPage==="function") return errorPage(req,e); return `<h1>Erro tratado</h1><p>${String(e&&e.message||e)}</p><a href="/">Início</a>`; }
function v153_perm(perm){ if(typeof v145Require==="function") return v145Require(perm); if(typeof requirePerm==="function") return requirePerm(perm); return (req,res,next)=>next(); }
function v153_clean_nome(v){
  let s=v153_up(v).replace(/\b(NOME|EMPRESARIAL|RAZAO|RAZÃO|SOCIAL|TITULO|TÍTULO|DO|DA|DE|ESTABELECIMENTO|FANTASIA|MATRIZ|FILIAL)\b/g," ")
    .replace(/\b(LTDA|L T D A|EIRELI|EPP|ME|S\/A|SA|S A)\b/g," ")
    .replace(/\b(CNPJ|CEP|UF|TELEFONE|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|MUNICIPIO|MUNICÍPIO|DISTRITO|BAIRRO|LOGRADOURO|NUMERO|NÚMERO)\b/g," ")
    .replace(/[^A-Z0-9À-Ú ]/g," ").replace(/\s+/g," ").trim();
  if((s.includes("MEGA")&&s.includes("VEST")&&s.includes("CASA"))||(s.includes("VEST")&&s.includes("CASA"))) return "MEGA VEST CASA";
  return s;
}
function v153_clean_cidade(v){ return v153_up(v).replace(/\b(MUNICIPIO|MUNICÍPIO|CIDADE|UF|CEP|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|DISTRITO|BAIRRO|LOGRADOURO)\b/g," ").replace(/[^A-ZÀ-Ú ]/g," ").replace(/\s+/g," ").trim(); }
function v153_uf(v){ return (v153_up(v).match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)||[])[1]||""; }
function v153_cep(t){ let m=String(t||"").match(/\b\d{5}-?\d{3}\b/); if(m)return v153_dig(m[0]); m=String(t||"").match(/\b\d{8}\b/); return m?v153_dig(m[0]):""; }
function v153_find_city(text){
  const cidades=[["SP","PRAIA GRANDE"],["SP","IBITINGA"],["SP","VARGEM GRANDE PAULISTA"],["SP","PIRACICABA"],["SP","GUARUJA"],["SP","GUARUJÁ"],["SP","SAO PAULO"],["SP","SÃO PAULO"],["SP","SANTOS"],["SP","CAMPINAS"],["SP","MAUA"],["SP","MAUÁ"],["MG","UBERLANDIA"],["MG","UBERLÂNDIA"],["SC","GASPAR"],["SC","BLUMENAU"],["PR","CURITIBA"],["RJ","RIO DE JANEIRO"],["RS","PORTO ALEGRE"]];
  const up=v153_up(text);
  for(const [uf,c] of cidades){ const cc=v153_up(c); if(up.includes(cc+" "+uf)||up.includes(cc+"/"+uf)||up.includes(cc+"-"+uf)||up.includes(cc)) return {cidade:cc,uf};}
  return {cidade:"",uf:""};
}
async function v153_parse_pdf(filePath){
  const data=await pdfParse(fs.readFileSync(filePath));
  const raw=(data.text||"").replace(/\r/g,"\n");
  const lines=raw.split(/\n+/).map(x=>v153_up(x).replace(/\s+/g," ").trim()).filter(Boolean);
  const text=lines.join(" ");
  const cnpj=(text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)||[])[0]||"";
  const cep=v153_cep(text);
  const tel=(text.match(/(?:\(?\d{2}\)?\s*)?\d{4,5}-?\d{4}/)||[])[0]||"";
  function pick(labels){
    for(const label of labels){
      const idx=lines.findIndex(l=>l.includes(label));
      if(idx>=0){
        const same=lines[idx].split(label).pop().replace(/^[:\-\s]+/,"").trim();
        if(same&&same.length>2&&!/(COMPROVANTE|CADASTRO|DATA|REPUBLICA|REPÚBLICA|EMAIL|E-MAIL|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO|CNPJ|CEP|UF)$/.test(same)) return same;
        for(let i=idx+1;i<Math.min(lines.length,idx+10);i++){ const v=lines[i]; if(v&&!/^(DATA|NUMERO|NÚMERO|COMPROVANTE|CADASTRO|REPUBLICA|REPÚBLICA|CNPJ|CEP|UF|PORTE|CODIGO|CÓDIGO|EMAIL|E-MAIL|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO)$/.test(v)) return v; }
      }
    }
    return "";
  }
  let nome=pick(["TITULO DO ESTABELECIMENTO","TÍTULO DO ESTABELECIMENTO","NOME DE FANTASIA","NOME EMPRESARIAL","RAZAO SOCIAL","RAZÃO SOCIAL"]);
  if(!nome) nome=lines.find(l=>/\b(MEGA VEST CASA|VEST CASA|LTDA|EIRELI|EPP|ME)\b/.test(l)&&!/ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|COMPROVANTE|CADASTRO|ATIVIDADE/.test(l))||"";
  if(!nome && text.includes("MEGA")&&text.includes("VEST")&&text.includes("CASA")) nome="MEGA VEST CASA";
  let cidade=pick(["MUNICIPIO","MUNICÍPIO","CIDADE"]);
  let uf=pick(["UF"]);
  const fc=v153_find_city(text); if(!cidade||cidade.length<3)cidade=fc.cidade; if(!v153_uf(uf))uf=fc.uf||v153_uf(text);
  let endereco=pick(["LOGRADOURO","ENDERECO","ENDEREÇO"]);
  return {nome:v153_clean_nome(nome),cnpj:v153_dig(cnpj),cep:v153_dig(cep),telefone:v153_dig(tel),cidade:v153_clean_cidade(cidade),uf:v153_uf(uf),estado:v153_uf(uf),endereco:v153_up(endereco).replace(/\b(CEP|UF|MUNICIPIO|MUNICÍPIO|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO)\b/g," ").replace(/\s+/g," ").trim()};
}
function v153_nome_loja(parsed,config,fallback){
  const nome=v153_clean_nome(parsed.nome||fallback||""); const cidade=v153_clean_cidade(parsed.cidade||""); const uf=v153_uf(parsed.uf||parsed.estado||""); const regra=v153_up(config?.regraNomeFilial||"");
  if(regra.includes("MESCLAR")&&nome&&cidade) return `${nome} ${cidade} ${uf}`.replace(/\s+/g," ").trim();
  return nome||fallback||"";
}
function v153_file(req,name){ return (req.files&&req.files[name]&&req.files[name][0])||null; }
function v153_file_obj(f){ return f?{original:f.originalname,path:"uploads/"+f.filename,filename:f.filename,mimetype:f.mimetype,size:f.size,at:new Date().toISOString()}:null; }
const v153_upload=upload.fields([{name:"pdf",maxCount:1},{name:"logoLocal",maxCount:1},{name:"cartaoCnpj",maxCount:1},{name:"fotos",maxCount:20}]);
async function v153_save_loja_pdf(req,res){
  try{
    const d=v153_getDB(); d.lojas=d.lojas||[]; d.config=d.config||{}; let l=req.params.id?d.lojas.find(x=>String(x.id)===String(req.params.id)):null; if(!l){l={id:v153_next(d,"loja")}; d.lojas.push(l);}
    const parsed=v153_file(req,"pdf")?await v153_parse_pdf(v153_file(req,"pdf").path):{};
    Object.assign(l,{codigo:req.body.codigo||l.codigo||l.id,tipoCodigo:req.body.tipoCodigo||l.tipoCodigo||"SOMENTE NÚMERO",nome:v153_nome_loja(parsed,d.config,req.body.nome||l.nome),responsavel:v153_up(req.body.responsavel||l.responsavel),cnpj:v153_dig(parsed.cnpj||req.body.cnpj||l.cnpj),ie:v153_up(req.body.ie||l.ie),telefone:v153_dig(parsed.telefone||req.body.telefone||l.telefone),whatsappResponsavel:v153_dig(req.body.whatsappResponsavel||l.whatsappResponsavel),cep:v153_dig(parsed.cep||req.body.cep||l.cep),uf:v153_uf(parsed.uf||req.body.uf||req.body.estado||l.uf||l.estado),estado:v153_uf(parsed.uf||req.body.uf||req.body.estado||l.uf||l.estado),cidade:v153_clean_cidade(parsed.cidade||req.body.cidade||l.cidade),endereco:v153_up(parsed.endereco||req.body.endereco||l.endereco),latitude:req.body.latitude||l.latitude||"",longitude:req.body.longitude||l.longitude||"",analista:v153_up(req.body.analista||l.analista),proprietario:v153_up(req.body.proprietario||l.proprietario),feriado:v153_up(req.body.feriado||l.feriado||"FECHADO"),logoUrl:req.body.logoUrl||l.logoUrl||"",horario:req.body.horario||l.horario||""});
    if(v153_file(req,"logoLocal"))l.logoLocal=v153_file_obj(v153_file(req,"logoLocal")); if(v153_file(req,"cartaoCnpj"))l.cartaoCnpj=v153_file_obj(v153_file(req,"cartaoCnpj")); l.fotos=[...v153_arr(l.fotos),...((req.files?.fotos||[]).map(v153_file_obj))];
    v153_saveDB(d); res.redirect(`/lojas/${l.id}/editar`);
  }catch(e){res.status(500).send(v153_error(req,e));}
}
async function v153_save_prestador_pdf(req,res){
  try{
    const d=v153_getDB(); d.prestadores=d.prestadores||[]; let p=req.params.id?d.prestadores.find(x=>String(x.id)===String(req.params.id)):null; if(!p){p={id:v153_next(d,"prestador")}; d.prestadores.push(p);}
    const parsed=v153_file(req,"pdf")?await v153_parse_pdf(v153_file(req,"pdf").path):{};
    Object.assign(p,{empresa:v153_up(parsed.nome||req.body.empresa||req.body.nome||p.empresa),responsavel:v153_up(req.body.responsavel||p.responsavel||parsed.nome),telefone:v153_dig(parsed.telefone||req.body.telefone||p.telefone),email:req.body.email||p.email||"",cnpj:v153_dig(parsed.cnpj||req.body.cnpj||p.cnpj),cpf:v153_dig(req.body.cpf||p.cpf),cpfCnh:req.body.cpfCnh||p.cpfCnh||"",cep:v153_dig(parsed.cep||req.body.cep||p.cep),uf:v153_uf(parsed.uf||req.body.uf||req.body.estado||p.uf||p.estado),estado:v153_uf(parsed.uf||req.body.uf||req.body.estado||p.uf||p.estado),cidade:v153_clean_cidade(parsed.cidade||req.body.cidade||p.cidade),endereco:v153_up(parsed.endereco||req.body.endereco||p.endereco),ativo:v153_up(req.body.ativo||p.ativo||"SIM"),raioKm:req.body.raioKm||p.raioKm||"",valorKm:req.body.valorKm||p.valorKm||"",latitude:req.body.latitude||p.latitude||"",longitude:req.body.longitude||p.longitude||"",tipoPagamento:req.body.tipoPagamento||p.tipoPagamento||"PIX",dadosPagamento:req.body.dadosPagamento||p.dadosPagamento||"",servicos:v153_arr(req.body.servicos).length?v153_arr(req.body.servicos).map(v153_up):v153_arr(p.servicos),logoUrl:req.body.logoUrl||p.logoUrl||""});
    if(v153_file(req,"logoLocal"))p.logoLocal=v153_file_obj(v153_file(req,"logoLocal")); if(v153_file(req,"cartaoCnpj"))p.cartaoCnpj=v153_file_obj(v153_file(req,"cartaoCnpj")); p.fotos=[...v153_arr(p.fotos),...((req.files?.fotos||[]).map(v153_file_obj))];
    v153_saveDB(d); res.redirect(`/prestadores/${p.id}/editar`);
  }catch(e){res.status(500).send(v153_error(req,e));}
}
app.post("/v153/loja-pdf", auth, v153_perm("LOJAS"), v153_upload, v153_save_loja_pdf);
app.post("/v153/loja-pdf/:id", auth, v153_perm("LOJAS"), v153_upload, v153_save_loja_pdf);
app.post("/v153/prestador-pdf", auth, v153_perm("PRESTADORES"), v153_upload, v153_save_prestador_pdf);
app.post("/v153/prestador-pdf/:id", auth, v153_perm("PRESTADORES"), v153_upload, v153_save_prestador_pdf);



/* PATCH V16.1 - FILIAL CONFIG FUNCIONAL + PDF LOJA */
function v154_up(v){ return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim(); }
function v154_dig(v){ return String(v||"").replace(/\D/g,""); }
function v154_arr(v){ if(Array.isArray(v)) return v; if(v===undefined||v===null||v==="") return []; return [v]; }
function v154_getDB(){
  if(typeof db === "function") return db();
  if(typeof readDb === "function") return readDb();
  if(typeof readDB === "function") return readDB();
  if(typeof loadDb === "function") return loadDb();
  if(typeof loadDB === "function") return loadDB();
  const f = (typeof DB_FILE !== "undefined") ? DB_FILE : (typeof DATA_FILE !== "undefined" ? DATA_FILE : path.join(process.cwd(),"data","db.json"));
  if(!fs.existsSync(path.dirname(f))) fs.mkdirSync(path.dirname(f),{recursive:true});
  if(!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify({lojas:[],prestadores:[],config:{},_seq:{}},null,2));
  return JSON.parse(fs.readFileSync(f,"utf8"));
}
function v154_saveDB(d){
  if(typeof save === "function") return save(d);
  if(typeof saveDb === "function") return saveDb(d);
  if(typeof saveDB === "function") return saveDB(d);
  if(typeof writeDb === "function") return writeDb(d);
  if(typeof writeDB === "function") return writeDB(d);
  const f = (typeof DB_FILE !== "undefined") ? DB_FILE : (typeof DATA_FILE !== "undefined" ? DATA_FILE : path.join(process.cwd(),"data","db.json"));
  if(!fs.existsSync(path.dirname(f))) fs.mkdirSync(path.dirname(f),{recursive:true});
  fs.writeFileSync(f, JSON.stringify(d,null,2));
}
function v154_next(d,k){ if(typeof nextId==="function") return nextId(d,k); d._seq=d._seq||{}; d._seq[k]=(d._seq[k]||0)+1; return d._seq[k]; }
function v154_error(req,e){ if(typeof errorPage==="function") return errorPage(req,e); return `<h1>Erro tratado</h1><p>${String(e&&e.message||e)}</p><a href="/">Início</a>`; }
function v154_perm(perm){ if(typeof v145Require==="function") return v145Require(perm); if(typeof requirePerm==="function") return requirePerm(perm); return (req,res,next)=>next(); }

function v154_clean_nome(v){
  let s=v154_up(v)
    .replace(/\b(NOME|EMPRESARIAL|RAZAO|RAZÃO|SOCIAL|TITULO|TÍTULO|DO|DA|DE|ESTABELECIMENTO|FANTASIA|MATRIZ|FILIAL|COMERCIAL)\b/g," ")
    .replace(/\b(LTDA|L T D A|EIRELI|EPP|ME|S\/A|SA|S A|SIMPLES|LIMITADA)\b/g," ")
    .replace(/\b(CNPJ|CEP|UF|TELEFONE|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|MUNICIPIO|MUNICÍPIO|DISTRITO|BAIRRO|LOGRADOURO|NUMERO|NÚMERO|ATIVIDADE)\b/g," ")
    .replace(/[^A-Z0-9À-Ú ]/g," ")
    .replace(/\s+/g," ")
    .trim();
  if((s.includes("MEGA") && s.includes("VEST") && s.includes("CASA")) || (s.includes("VEST") && s.includes("CASA"))) return "MEGA VEST CASA";
  if(s.includes("BURDAYS") || s.includes("BURDAY") || s.includes("VESTCASA")) return "MEGA VEST CASA";
  return s;
}
function v154_clean_cidade(v){
  return v154_up(v)
    .replace(/\b(MUNICIPIO|MUNICÍPIO|CIDADE|UF|CEP|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|DISTRITO|BAIRRO|LOGRADOURO)\b/g," ")
    .replace(/[^A-ZÀ-Ú ]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function v154_uf(v){
  return (v154_up(v).match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)||[])[1] || "";
}
function v154_cep(text){
  const t=String(text||"");
  let m=t.match(/\b\d{5}-?\d{3}\b/);
  if(m) return v154_dig(m[0]);
  m=t.match(/\b\d{8}\b/);
  if(m) return v154_dig(m[0]);
  // tenta achar "CEP 11726 000"
  m=t.match(/CEP[^0-9]{0,10}(\d{5})[^0-9]{0,5}(\d{3})/i);
  if(m) return m[1]+m[2];
  return "";
}
const V154_CIDADES = [
 ["SP","PRAIA GRANDE"],["SP","IBITINGA"],["SP","VARGEM GRANDE PAULISTA"],["SP","PIRACICABA"],["SP","GUARUJA"],["SP","GUARUJÁ"],["SP","SANTOS"],["SP","CAMPINAS"],["SP","SAO PAULO"],["SP","SÃO PAULO"],["SP","RIBEIRAO PRETO"],["SP","RIBEIRÃO PRETO"],["SP","MAUA"],["SP","MAUÁ"],["SP","DIADEMA"],["SP","ATIBAIA"],["SP","CARAGUATATUBA"],["SP","PORTO FERREIRA"],["SP","MONGAGUA"],["SP","MONGAGUÁ"],["SP","SERRANA"],
 ["MG","BELO HORIZONTE"],["MG","UBERLANDIA"],["MG","UBERLÂNDIA"],["MG","CONTAGEM"],
 ["SC","GASPAR"],["SC","BLUMENAU"],["SC","ITAJAÍ"],["SC","ITAJAI"],
 ["PR","CURITIBA"],["RJ","RIO DE JANEIRO"],["RS","PORTO ALEGRE"]
];
function v154_find_city(text){
  const up=v154_up(text);
  for(const [uf,cid] of V154_CIDADES){
    const c=v154_up(cid);
    if(up.includes(c+" "+uf)||up.includes(c+"/"+uf)||up.includes(c+" / "+uf)||up.includes(c+"-"+uf)||up.includes(c)) return {cidade:c,uf};
  }
  return {cidade:"",uf:""};
}
async function v154_parse_pdf(filePath){
  const data=await pdfParse(fs.readFileSync(filePath));
  const raw=(data.text||"").replace(/\r/g,"\n");
  const lines=raw.split(/\n+/).map(x=>v154_up(x).replace(/\s+/g," ").trim()).filter(Boolean);
  const text=lines.join(" ");
  const cnpj=(text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)||[])[0]||"";
  const cep=v154_cep(text);
  const tel=(text.match(/(?:\(?\d{2}\)?\s*)?\d{4,5}-?\d{4}/)||[])[0]||"";
  function pick(labels){
    for(const label of labels){
      const idx=lines.findIndex(l=>l.includes(label));
      if(idx>=0){
        const same=lines[idx].split(label).pop().replace(/^[:\-\s]+/,"").trim();
        if(same && same.length>2 && !/(COMPROVANTE|CADASTRO|DATA|REPUBLICA|REPÚBLICA|EMAIL|E-MAIL|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO|CNPJ|CEP|UF)$/.test(same)) return same;
        for(let i=idx+1;i<Math.min(lines.length,idx+12);i++){
          const v=lines[i];
          if(v && !/^(DATA|NUMERO|NÚMERO|COMPROVANTE|CADASTRO|REPUBLICA|REPÚBLICA|CNPJ|CEP|UF|PORTE|CODIGO|CÓDIGO|EMAIL|E-MAIL|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO)$/.test(v)) return v;
        }
      }
    }
    return "";
  }
  let nome=pick(["TITULO DO ESTABELECIMENTO","TÍTULO DO ESTABELECIMENTO","NOME DE FANTASIA","NOME EMPRESARIAL","RAZAO SOCIAL","RAZÃO SOCIAL"]);
  if(!nome) nome=lines.find(l=>/\b(MEGA VEST CASA|VEST CASA|VESTCASA|BURDAYS|BURDAY|LTDA|EIRELI|EPP|ME)\b/.test(l)&&!/ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|COMPROVANTE|CADASTRO|ATIVIDADE/.test(l))||"";
  if(!nome && (text.includes("MEGA")&&text.includes("VEST")&&text.includes("CASA") || text.includes("VESTCASA"))) nome="MEGA VEST CASA";
  let cidade=pick(["MUNICIPIO","MUNICÍPIO","CIDADE"]);
  let uf=pick(["UF"]);
  const fc=v154_find_city(text);
  if(!cidade || cidade.length<3) cidade=fc.cidade;
  if(!v154_uf(uf)) uf=fc.uf || v154_uf(text);
  let endereco=pick(["LOGRADOURO","ENDERECO","ENDEREÇO"]);
  return {
    nome:v154_clean_nome(nome),
    cnpj:v154_dig(cnpj),
    cep:v154_dig(cep),
    telefone:v154_dig(tel),
    cidade:v154_clean_cidade(cidade),
    uf:v154_uf(uf),
    estado:v154_uf(uf),
    endereco:v154_up(endereco).replace(/\b(CEP|UF|MUNICIPIO|MUNICÍPIO|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO)\b/g," ").replace(/\s+/g," ").trim()
  };
}
function v154_regra_filial_ativa(config){
  const r=v154_up(config?.regraNomeFilial || config?.filialNomesRepetidos || "");
  return r.includes("MESCLAR") || r.includes("CIDADE") || r.includes("UF");
}
function v154_nome_loja(parsed, config, fallback){
  let nome=v154_clean_nome(parsed.nome||fallback||"");
  const cidade=v154_clean_cidade(parsed.cidade||"");
  const uf=v154_uf(parsed.uf||parsed.estado||"");
  if(!nome && cidade) nome="MEGA VEST CASA";
  if(v154_regra_filial_ativa(config) && nome && cidade) return `${nome} ${cidade} ${uf}`.replace(/\s+/g," ").trim();
  return nome || fallback || "";
}
function v154_file(req,name){ return (req.files && req.files[name] && req.files[name][0]) || null; }
function v154_file_obj(f){ return f ? {original:f.originalname,path:"uploads/"+f.filename,filename:f.filename,mimetype:f.mimetype,size:f.size,at:new Date().toISOString()} : null; }
const v154_upload=upload.fields([{name:"pdf",maxCount:1},{name:"logoLocal",maxCount:1},{name:"cartaoCnpj",maxCount:1},{name:"fotos",maxCount:20}]);

// salva config também na chave antiga e na nova, para a importação reconhecer
app.post("/v154/config", auth, v154_perm("CONFIG"), upload.single("logoLocal"), (req,res)=>{
  try{
    const d=v154_getDB(); d.config=d.config||{};
    d.config.nomeSistema=req.body.nomeSistema||d.config.nomeSistema||"V&B CHAMADOS";
    d.config.subtitulo=req.body.subtitulo||d.config.subtitulo||"CHAMADOS DE MANUTENCAO";
    d.config.tema=req.body.tema||d.config.tema||"VERDE";
    d.config.logoUrl=req.body.logoUrl||d.config.logoUrl||"";
    d.config.regraNomeFilial=req.body.regraNomeFilial||req.body.filialNomesRepetidos||d.config.regraNomeFilial||"ORIGINAL";
    d.config.filialNomesRepetidos=d.config.regraNomeFilial;
    d.config.logoOs=req.body.logoOs||d.config.logoOs||"REUTILIZAR LOGO DA LOJA";
    if(req.file) d.config.logoLocal=v154_file_obj(req.file);
    v154_saveDB(d);
    res.redirect("/config");
  }catch(e){res.status(500).send(v154_error(req,e));}
});
async function v154_save_loja_pdf(req,res){
  try{
    const d=v154_getDB(); d.lojas=d.lojas||[]; d.config=d.config||{};
    let l=req.params.id?d.lojas.find(x=>String(x.id)===String(req.params.id)):null;
    if(!l){l={id:v154_next(d,"loja")}; d.lojas.push(l);}
    const parsed=v154_file(req,"pdf")?await v154_parse_pdf(v154_file(req,"pdf").path):{};
    Object.assign(l,{
      codigo:req.body.codigo||l.codigo||l.id,
      tipoCodigo:req.body.tipoCodigo||l.tipoCodigo||"SOMENTE NÚMERO",
      nome:v154_nome_loja(parsed,d.config,req.body.nome||l.nome),
      responsavel:v154_up(req.body.responsavel||l.responsavel),
      cnpj:v154_dig(parsed.cnpj||req.body.cnpj||l.cnpj),
      ie:v154_up(req.body.ie||l.ie),
      telefone:v154_dig(parsed.telefone||req.body.telefone||l.telefone),
      whatsappResponsavel:v154_dig(req.body.whatsappResponsavel||l.whatsappResponsavel),
      cep:v154_dig(parsed.cep||req.body.cep||l.cep),
      uf:v154_uf(parsed.uf||req.body.uf||req.body.estado||l.uf||l.estado),
      estado:v154_uf(parsed.uf||req.body.uf||req.body.estado||l.uf||l.estado),
      cidade:v154_clean_cidade(parsed.cidade||req.body.cidade||l.cidade),
      endereco:v154_up(parsed.endereco||req.body.endereco||l.endereco),
      latitude:req.body.latitude||l.latitude||"",
      longitude:req.body.longitude||l.longitude||"",
      analista:v154_up(req.body.analista||l.analista),
      proprietario:v154_up(req.body.proprietario||l.proprietario),
      feriado:v154_up(req.body.feriado||l.feriado||"FECHADO"),
      logoUrl:req.body.logoUrl||l.logoUrl||"",
      horario:req.body.horario||l.horario||""
    });
    if(v154_file(req,"logoLocal"))l.logoLocal=v154_file_obj(v154_file(req,"logoLocal"));
    if(v154_file(req,"cartaoCnpj"))l.cartaoCnpj=v154_file_obj(v154_file(req,"cartaoCnpj"));
    l.fotos=[...v154_arr(l.fotos),...((req.files?.fotos||[]).map(v154_file_obj))];
    v154_saveDB(d);
    res.redirect(`/lojas/${l.id}/editar`);
  }catch(e){res.status(500).send(v154_error(req,e));}
}
app.post("/v154/loja-pdf", auth, v154_perm("LOJAS"), v154_upload, v154_save_loja_pdf);
app.post("/v154/loja-pdf/:id", auth, v154_perm("LOJAS"), v154_upload, v154_save_loja_pdf);



/* PATCH V16.1 - IMPORTAÇÃO PLANILHA SEGURA + ANALISTA */
function v155_up(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();}
function v155_dig(v){return String(v||"").replace(/\D/g,"");}
function v155_arr(v){return Array.isArray(v)?v:(v===undefined||v===null||v===""?[]:[v]);}
function v155_money(v){const n=Number(String(v||"").replace(",",".").replace(/[^\d.-]/g,""));return Number.isFinite(n)?n:0;}
function v155_get(o,ks){o=o||{};for(const k of ks){if(o[k]!==undefined&&String(o[k]).trim()!=="")return o[k];const f=Object.keys(o).find(x=>v155_up(x)===v155_up(k));if(f&&String(o[f]).trim()!=="")return o[f];}return "";}
function v155_db(){if(typeof v154_getDB==="function")return v154_getDB();if(typeof db==="function")return db();if(typeof readDB==="function")return readDB();if(typeof readDb==="function")return readDb();const f=(typeof DB_FILE!=="undefined")?DB_FILE:(typeof DATA_FILE!=="undefined"?DATA_FILE:path.join(process.cwd(),"data","db.json"));if(!fs.existsSync(path.dirname(f)))fs.mkdirSync(path.dirname(f),{recursive:true});if(!fs.existsSync(f))fs.writeFileSync(f,JSON.stringify({lojas:[],prestadores:[],proprietarios:[],chamados:[],usuarios:[],analistas:[],config:{},_seq:{}},null,2));return JSON.parse(fs.readFileSync(f,"utf8"));}
function v155_save(d){if(typeof v154_saveDB==="function")return v154_saveDB(d);if(typeof save==="function")return save(d);if(typeof saveDB==="function")return saveDB(d);if(typeof saveDb==="function")return saveDb(d);const f=(typeof DB_FILE!=="undefined")?DB_FILE:(typeof DATA_FILE!=="undefined"?DATA_FILE:path.join(process.cwd(),"data","db.json"));if(!fs.existsSync(path.dirname(f)))fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d,null,2));}
function v155_next(d,k){if(typeof nextId==="function")return nextId(d,k);d._seq=d._seq||{};d._seq[k]=(d._seq[k]||0)+1;return d._seq[k];}
function v155_err(req,e){if(typeof v154_error==="function")return v154_error(req,e);if(typeof errorPage==="function")return errorPage(req,e);return `<h1>Erro tratado</h1><p>${String(e&&e.message||e)}</p><a href="/">Início</a>`;}
function v155_layout(req,t,b){return typeof layout==="function"?layout(req,t,b):`<!doctype html><html><body>${b}</body></html>`;}
function v155_perm(p){return typeof v154_perm==="function"?v154_perm(p):(typeof v145Require==="function"?v145Require(p):(typeof requirePerm==="function"?requirePerm(p):(req,res,next)=>next()));}
function v155_init(d){d.lojas=Array.isArray(d.lojas)?d.lojas:[];d.prestadores=Array.isArray(d.prestadores)?d.prestadores:[];d.chamados=Array.isArray(d.chamados)?d.chamados:[];d.usuarios=Array.isArray(d.usuarios)?d.usuarios:[];d.analistas=Array.isArray(d.analistas)?d.analistas:[];d.proprietarios=Array.isArray(d.proprietarios)?d.proprietarios:[];d.config=d.config||{};return d;}
function v155_bkp(d){try{const dir=path.join(process.cwd(),"data","backups");if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,"backup-antes-importacao-"+Date.now()+".json"),JSON.stringify(d,null,2));}catch(e){}}
function v155_uf(v){return (v155_up(v).match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)||[])[1]||"";}
function v155_loja(d,n,c,u,cep,end){n=v155_up(n||"LOJA NÃO INFORMADA");let l=d.lojas.find(x=>v155_up(x.nome||x.loja)===n);let criada=false;if(!l){l={id:v155_next(d,"loja"),codigo:"",nome:n,cidade:v155_up(c),uf:v155_uf(u),estado:v155_uf(u),cep:v155_dig(cep),endereco:v155_up(end),telefone:"",cnpj:""};d.lojas.push(l);criada=true;}else{if(cep&&!l.cep)l.cep=v155_dig(cep);if(c&&!l.cidade)l.cidade=v155_up(c);if(u&&!l.uf){l.uf=v155_uf(u);l.estado=v155_uf(u);}if(end&&!l.endereco)l.endereco=v155_up(end);}return {l,criada};}
function v155_prest(d,n,t){n=v155_up(n||"");if(!n)return {p:null,criada:false};let p=d.prestadores.find(x=>v155_up(x.empresa||x.nome||x.responsavel)===n);let criada=false;if(!p){p={id:v155_next(d,"prestador"),empresa:n,responsavel:n,ativo:"SIM",servicos:t?[v155_up(t)]:[]};d.prestadores.push(p);criada=true;}return {p,criada};}
app.post("/v155/importar-planilha", auth, v155_perm("IMPORTAR"), upload.single("excel"), (req,res)=>{
 try{
  const d=v155_init(v155_db()); v155_bkp(d);
  if(!req.file)return res.send(v155_layout(req,"Importar",`<div class="card"><h2>Nenhum arquivo selecionado</h2><a class="btn" href="/importar-planilha">Voltar</a></div>`));
  const wb=XLSX.readFile(req.file.path,{cellDates:false}); let rows=[];
  for(const s of wb.SheetNames) rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[s],{defval:"",raw:false,blankrows:false}));
  let imp=0,lc=0,pc=0,ign=0; const analistaForm=v155_up(req.body.analista||req.body.analistaResponsavel||"");
  for(const r of rows){
   const loja=v155_up(v155_get(r,["LOJA","NOME LOJA","NOME_LOJA","FILIAL","UNIDADE","CLIENTE","REQUERENTE","LOCAL","ESTABELECIMENTO"]));
   const num=v155_dig(v155_get(r,["NUMERO","NÚMERO","NRO","Nº","CHAMADO","N CHAMADO","ID","CODIGO","CÓDIGO","OS"]));
   const desc=v155_up(v155_get(r,["DESCRIÇÃO","DESCRICAO","DESCRIÇÃO SERVIÇOS","DESCRICAO SERVICOS","PROBLEMA","OBSERVAÇÃO","OBSERVACAO","SOLICITAÇÃO","SOLICITACAO"]));
   const prest=v155_up(v155_get(r,["PRESTADOR","EMPRESA","FORNECEDOR","EXECUTOR","TÉCNICO","TECNICO"]));
   const cidade=v155_up(v155_get(r,["CIDADE","MUNICIPIO","MUNICÍPIO"])), uf=v155_uf(v155_get(r,["UF","ESTADO"])), cep=v155_dig(v155_get(r,["CEP"])), end=v155_up(v155_get(r,["ENDEREÇO","ENDERECO","LOGRADOURO","RUA"]));
   const tipo=v155_up(v155_get(r,["SERVIÇO","SERVICO","TIPO SERVIÇO","TIPO_SERVICO","CATEGORIA","TIPO","TIPO DE SERVIÇO"]))||"A DEFINIR";
   if(!loja&&!num&&!desc&&!prest){ign++;continue;}
   const li=v155_loja(d,loja||"LOJA NÃO INFORMADA",cidade,uf,cep,end); if(li.criada)lc++;
   const pi=v155_prest(d,prest,tipo); if(pi.criada)pc++;
   d.chamados.push({id:v155_next(d,"chamado"),numeroInterno:num||v155_next(d,"numeroChamado"),numeroExterno:num,lojaId:li.l.id,lojaNome:li.l.nome,prestadorId:pi.p?pi.p.id:"",prestadorNome:prest,tipoServico:tipo,status:v155_up(v155_get(r,["STATUS","SITUAÇÃO","SITUACAO"]))||"ABERTO",prioridade:v155_up(v155_get(r,["PRIORIDADE"]))||"MÍNIMA",valor:v155_money(v155_get(r,["VALOR","PREÇO","PRECO","CUSTO"])),analista:v155_up(v155_get(r,["ANALISTA","RESPONSÁVEL","RESPONSAVEL","USUARIO","USUÁRIO"]))||analistaForm,descricao:desc||"IMPORTADO SEM DESCRIÇÃO",observacoes:v155_up(v155_get(r,["OBS","OBSERVAÇÃO","OBSERVACAO"])),dataAbertura:(typeof today==="function"?today():new Date().toISOString().slice(0,10)),criadoEm:new Date().toISOString(),importado:"SIM"});
   imp++;
  }
  v155_save(d);
  res.send(v155_layout(req,"Importado",`<div class="card"><h2>✅ Importação concluída</h2><p>Chamados importados: <b>${imp}</b></p><p>Lojas criadas: <b>${lc}</b> | Prestadores criados: <b>${pc}</b> | Linhas ignoradas: <b>${ign}</b></p><p>Usuários e analistas foram preservados. Foi criado backup antes da importação.</p><a class="btn" href="/chamados?mostrar=1">Ver chamados</a> <a class="btn secondary" href="/importar-planilha">Nova importação</a></div>`));
 }catch(e){res.status(500).send(v155_err(req,e));}
});
app.get("/api/v155/analistas", auth, (req,res)=>{
 try{const d=v155_init(v155_db()), q=v155_up(req.query.q||""), set=new Set();[...d.usuarios,...d.analistas].forEach(u=>{const n=v155_up(u.nome||u.usuario||u.login||u.analista||"");if(n)set.add(n)});d.chamados.forEach(c=>{const n=v155_up(c.analista||"");if(n)set.add(n)});d.lojas.forEach(l=>{const n=v155_up(l.analista||l.analistaResponsavel||"");if(n)set.add(n)});res.json({ok:true,items:[...set].filter(x=>!q||x.includes(q)).sort().slice(0,80).map(nome=>({nome,label:nome}))});}catch(e){res.json({ok:false,items:[]});}
});



/* PATCH V16.1 - IMPORTAÇÃO PROTEGIDA SEM APAGAR USUÁRIOS */
function v156_up(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim()}
function v156_dig(v){return String(v||'').replace(/\D/g,'')}
function v156_val(v){const n=Number(String(v||'').replace(',','.').replace(/[^\d.-]/g,''));return Number.isFinite(n)?n:0}
function v156_get(o,ks){o=o||{};for(const k of ks){if(o[k]!=null&&String(o[k]).trim()!=='')return o[k];const f=Object.keys(o).find(x=>v156_up(x)===v156_up(k));if(f&&String(o[f]).trim()!=='')return o[f]}return ''}
function v156_db(){if(typeof v154_getDB==='function')return v154_getDB();if(typeof v155_db==='function')return v155_db();if(typeof db==='function')return db();if(typeof readDB==='function')return readDB();if(typeof readDb==='function')return readDb();const f=(typeof DB_FILE!=='undefined')?DB_FILE:(typeof DATA_FILE!=='undefined'?DATA_FILE:path.join(process.cwd(),'data','db.json'));if(!fs.existsSync(path.dirname(f)))fs.mkdirSync(path.dirname(f),{recursive:true});if(!fs.existsSync(f))fs.writeFileSync(f,JSON.stringify({lojas:[],prestadores:[],proprietarios:[],chamados:[],usuarios:[],analistas:[],perfis:[],permissoes:[],config:{},_seq:{}},null,2));return JSON.parse(fs.readFileSync(f,'utf8'))}
function v156_save(d){if(typeof v154_saveDB==='function')return v154_saveDB(d);if(typeof v155_save==='function')return v155_save(d);if(typeof save==='function')return save(d);if(typeof saveDB==='function')return saveDB(d);if(typeof saveDb==='function')return saveDb(d);const f=(typeof DB_FILE!=='undefined')?DB_FILE:(typeof DATA_FILE!=='undefined'?DATA_FILE:path.join(process.cwd(),'data','db.json'));if(!fs.existsSync(path.dirname(f)))fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d,null,2))}
function v156_init(d){for(const k of ['lojas','prestadores','proprietarios','chamados','usuarios','analistas','perfis','permissoes'])d[k]=Array.isArray(d[k])?d[k]:[];d.config=d.config||{};d._seq=d._seq||{};return d}
function v156_next(d,k){if(typeof nextId==='function')return nextId(d,k);d._seq=d._seq||{};d._seq[k]=(d._seq[k]||0)+1;return d._seq[k]}
function v156_cp(v){return JSON.parse(JSON.stringify(v||[]))}
function v156_backup(d){try{const dir=path.join(process.cwd(),'data','backups');if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'backup-antes-importacao-v156-'+Date.now()+'.json'),JSON.stringify(d,null,2))}catch(e){}}
function v156_err(req,e){if(typeof v154_error==='function')return v154_error(req,e);if(typeof errorPage==='function')return errorPage(req,e);return '<h1>Erro tratado</h1><p>'+String(e&&e.message||e)+'</p><a href="/">Início</a>'}
function v156_layout(req,t,b){return typeof layout==='function'?layout(req,t,b):'<!doctype html><html><body>'+b+'</body></html>'}
function v156_perm(p){return typeof v154_perm==='function'?v154_perm(p):(typeof v145Require==='function'?v145Require(p):(typeof requirePerm==='function'?requirePerm(p):(req,res,next)=>next()))}
function v156_uf(v){return (v156_up(v).match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)||[])[1]||''}
function v156_loja(d,n,c,u,cep,end){n=v156_up(n||'LOJA NÃO INFORMADA');let l=d.lojas.find(x=>v156_up(x.nome||x.loja)===n),cr=false;if(!l){l={id:v156_next(d,'loja'),codigo:'',nome:n,cidade:v156_up(c),uf:v156_uf(u),estado:v156_uf(u),cep:v156_dig(cep),endereco:v156_up(end),telefone:'',cnpj:''};d.lojas.push(l);cr=true}else{if(cep&&!l.cep)l.cep=v156_dig(cep);if(c&&!l.cidade)l.cidade=v156_up(c);if(u&&!l.uf){l.uf=v156_uf(u);l.estado=v156_uf(u)}if(end&&!l.endereco)l.endereco=v156_up(end)}return {l,cr}}
function v156_prest(d,n,t){n=v156_up(n||'');if(!n)return {p:null,cr:false};let p=d.prestadores.find(x=>v156_up(x.empresa||x.nome||x.responsavel)===n),cr=false;if(!p){p={id:v156_next(d,'prestador'),empresa:n,responsavel:n,ativo:'SIM',servicos:t?[v156_up(t)]:[]};d.prestadores.push(p);cr=true}return {p,cr}}
app.post('/v156/importar-planilha',auth,v156_perm('IMPORTAR'),upload.single('excel'),(req,res)=>{try{const original=v156_init(v156_db());const keep={usuarios:v156_cp(original.usuarios),analistas:v156_cp(original.analistas),perfis:v156_cp(original.perfis),permissoes:v156_cp(original.permissoes),config:JSON.parse(JSON.stringify(original.config||{}))};v156_backup(original);if(!req.file)return res.send(v156_layout(req,'Importar','<div class="card"><h2>Nenhum arquivo selecionado</h2><a class="btn" href="/importar-planilha">Voltar</a></div>'));const d=v156_init(JSON.parse(JSON.stringify(original)));const wb=XLSX.readFile(req.file.path,{cellDates:false});let rows=[];for(const s of wb.SheetNames)rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[s],{defval:'',raw:false,blankrows:false}));let imp=0,lc=0,pc=0,ign=0;const analistaForm=v156_up(req.body.analista||req.body.analistaResponsavel||'');for(const r of rows){const loja=v156_up(v156_get(r,['LOJA','NOME LOJA','FILIAL','UNIDADE','CLIENTE','LOCAL','ESTABELECIMENTO']));const num=v156_dig(v156_get(r,['NUMERO','NÚMERO','NRO','Nº','CHAMADO','N CHAMADO','ID','CODIGO','CÓDIGO','OS']));const desc=v156_up(v156_get(r,['DESCRIÇÃO','DESCRICAO','DESCRIÇÃO SERVIÇOS','DESCRICAO SERVICOS','PROBLEMA','OBSERVAÇÃO','OBSERVACAO','SOLICITAÇÃO','SOLICITACAO']));const prest=v156_up(v156_get(r,['PRESTADOR','EMPRESA','FORNECEDOR','EXECUTOR','TÉCNICO','TECNICO']));const cidade=v156_up(v156_get(r,['CIDADE','MUNICIPIO','MUNICÍPIO']));const uf=v156_uf(v156_get(r,['UF','ESTADO']));const cep=v156_dig(v156_get(r,['CEP']));const end=v156_up(v156_get(r,['ENDEREÇO','ENDERECO','LOGRADOURO','RUA']));const tipo=v156_up(v156_get(r,['SERVIÇO','SERVICO','TIPO SERVIÇO','TIPO_SERVICO','CATEGORIA','TIPO','TIPO DE SERVIÇO']))||'A DEFINIR';if(!loja&&!num&&!desc&&!prest){ign++;continue}const li=v156_loja(d,loja||'LOJA NÃO INFORMADA',cidade,uf,cep,end);if(li.cr)lc++;const pi=v156_prest(d,prest,tipo);if(pi.cr)pc++;d.chamados.push({id:v156_next(d,'chamado'),numeroInterno:num||v156_next(d,'numeroChamado'),numeroExterno:num,lojaId:li.l.id,lojaNome:li.l.nome,prestadorId:pi.p?pi.p.id:'',prestadorNome:prest,tipoServico:tipo,status:v156_up(v156_get(r,['STATUS','SITUAÇÃO','SITUACAO']))||'ABERTO',prioridade:v156_up(v156_get(r,['PRIORIDADE']))||'MÍNIMA',valor:v156_val(v156_get(r,['VALOR','PREÇO','PRECO','CUSTO'])),analista:v156_up(v156_get(r,['ANALISTA','RESPONSÁVEL','RESPONSAVEL','USUARIO','USUÁRIO']))||analistaForm,descricao:desc||'IMPORTADO SEM DESCRIÇÃO',observacoes:v156_up(v156_get(r,['OBS','OBSERVAÇÃO','OBSERVACAO'])),dataAbertura:(typeof today==='function'?today():new Date().toISOString().slice(0,10)),criadoEm:new Date().toISOString(),importado:'SIM'});imp++}d.usuarios=keep.usuarios;d.analistas=keep.analistas;d.perfis=keep.perfis;d.permissoes=keep.permissoes;d.config={...keep.config,...(d.config||{})};v156_save(d);res.send(v156_layout(req,'Importado',`<div class="card"><h2>✅ Importação concluída</h2><p>Chamados importados: <b>${imp}</b></p><p>Lojas criadas: <b>${lc}</b> | Prestadores criados: <b>${pc}</b> | Linhas ignoradas: <b>${ign}</b></p><p><b>Proteção:</b> usuários, analistas, perfis e permissões foram preservados.</p><a class="btn" href="/chamados?mostrar=1">Ver chamados</a> <a class="btn secondary" href="/importar-planilha">Nova importação</a></div>`))}catch(e){res.status(500).send(v156_err(req,e))}});
app.get('/api/v156/analistas',auth,(req,res)=>{try{const d=v156_init(v156_db()),q=v156_up(req.query.q||''),set=new Set();[...d.usuarios,...d.analistas].forEach(u=>{const n=v156_up(u.nome||u.usuario||u.login||u.analista||'');if(n)set.add(n)});d.chamados.forEach(c=>{const n=v156_up(c.analista||'');if(n)set.add(n)});d.lojas.forEach(l=>{const n=v156_up(l.analista||l.analistaResponsavel||'');if(n)set.add(n)});res.json({ok:true,items:[...set].filter(x=>!q||x.includes(q)).sort().slice(0,80).map(nome=>({nome,label:nome}))})}catch(e){res.json({ok:false,items:[]})}});



/* PATCH V16.1 - PDF LOJA RESTAURADO + MAPS */
function v159_up(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();}
function v159_dig(v){return String(v||"").replace(/\D/g,"");}
function v159_arr(v){return Array.isArray(v)?v:(v===undefined||v===null||v===""?[]:[v]);}
function v159_db(){if(typeof v154_getDB==="function")return v154_getDB();if(typeof v155_db==="function")return v155_db();if(typeof v156_db==="function")return v156_db();if(typeof db==="function")return db();if(typeof readDB==="function")return readDB();if(typeof readDb==="function")return readDb();const f=(typeof DB_FILE!=="undefined")?DB_FILE:(typeof DATA_FILE!=="undefined"?DATA_FILE:path.join(process.cwd(),"data","db.json"));if(!fs.existsSync(path.dirname(f)))fs.mkdirSync(path.dirname(f),{recursive:true});if(!fs.existsSync(f))fs.writeFileSync(f,JSON.stringify({lojas:[],prestadores:[],config:{},_seq:{}},null,2));return JSON.parse(fs.readFileSync(f,"utf8"));}
function v159_save(d){if(typeof v154_saveDB==="function")return v154_saveDB(d);if(typeof v155_save==="function")return v155_save(d);if(typeof v156_save==="function")return v156_save(d);if(typeof save==="function")return save(d);if(typeof saveDB==="function")return saveDB(d);if(typeof saveDb==="function")return saveDb(d);const f=(typeof DB_FILE!=="undefined")?DB_FILE:(typeof DATA_FILE!=="undefined"?DATA_FILE:path.join(process.cwd(),"data","db.json"));if(!fs.existsSync(path.dirname(f)))fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d,null,2));}
function v159_next(d,k){if(typeof nextId==="function")return nextId(d,k);d._seq=d._seq||{};d._seq[k]=(d._seq[k]||0)+1;return d._seq[k];}
function v159_perm(p){return typeof v154_perm==="function"?v154_perm(p):(typeof v145Require==="function"?v145Require(p):(typeof requirePerm==="function"?requirePerm(p):(req,res,next)=>next()));}
function v159_err(req,e){if(typeof v154_error==="function")return v154_error(req,e);if(typeof errorPage==="function")return errorPage(req,e);return `<h1>Erro tratado</h1><p>${String(e&&e.message||e)}</p><a href="/">Início</a>`;}
function v159_file(req,name){return (req.files&&req.files[name]&&req.files[name][0])||null;}
function v159_file_obj(f){return f?{original:f.originalname,path:"uploads/"+f.filename,filename:f.filename,mimetype:f.mimetype,size:f.size,at:new Date().toISOString()}:null;}
function v159_uf(v){return (v159_up(v).match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/)||[])[1]||"";}
function v159_clean_cidade(v){return v159_up(v).replace(/\b(MUNICIPIO|MUNICÍPIO|CIDADE|UF|CEP|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|DISTRITO|BAIRRO|LOGRADOURO)\b/g," ").replace(/[^A-ZÀ-Ú ]/g," ").replace(/\s+/g," ").trim();}
function v159_clean_nome(v){let s=v159_up(v).replace(/\b(NOME|EMPRESARIAL|RAZAO|RAZÃO|SOCIAL|TITULO|TÍTULO|DO|DA|DE|ESTABELECIMENTO|FANTASIA|MATRIZ|FILIAL|COMERCIAL)\b/g," ").replace(/\b(LTDA|L T D A|EIRELI|EPP|ME|S\/A|SA|S A|SIMPLES|LIMITADA)\b/g," ").replace(/\b(CNPJ|CEP|UF|TELEFONE|ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|MUNICIPIO|MUNICÍPIO|DISTRITO|BAIRRO|LOGRADOURO|NUMERO|NÚMERO|ATIVIDADE|VARGEM|GRANDE|PAULISTA)\b/g," ").replace(/[^A-Z0-9À-Ú ]/g," ").replace(/\s+/g," ").trim();if((s.includes("MEGA")&&s.includes("VEST")&&s.includes("CASA"))||(s.includes("VEST")&&s.includes("CASA"))||s.includes("VESTCASA"))return "MEGA VEST CASA";return s;}
function v159_cep(text){const t=String(text||"");let m=t.match(/\b\d{5}-?\d{3}\b/);if(m)return v159_dig(m[0]);m=t.match(/CEP[^0-9]{0,15}(\d{5})[^0-9]{0,8}(\d{3})/i);if(m)return m[1]+m[2];return "";}
const V159_CIDADES=[ ["SP","PRAIA GRANDE","11726000"],["SP","IBITINGA","14940000"],["SP","VARGEM GRANDE PAULISTA","06730000"],["SP","PIRACICABA","13400000"],["SP","GUARUJA","11400000"],["SP","GUARUJÁ","11400000"],["SP","SANTOS","11000000"],["SP","CAMPINAS","13000000"],["SP","SAO PAULO","01000000"],["SP","SÃO PAULO","01000000"],["MG","BELO HORIZONTE","30000000"],["MG","UBERLANDIA","38400000"],["MG","UBERLÂNDIA","38400000"],["SC","GASPAR","89110000"],["SC","BLUMENAU","89000000"],["PR","CURITIBA","80000000"],["RJ","RIO DE JANEIRO","20000000"],["RS","PORTO ALEGRE","90000000"] ];
function v159_find_city(text){const up=v159_up(text);for(const [uf,cid,cep] of V159_CIDADES){const c=v159_up(cid);if(up.includes(c+" "+uf)||up.includes(c+"/"+uf)||up.includes(c+" / "+uf)||up.includes(c+"-"+uf)||up.includes(c))return {cidade:c,uf,cep};}return {cidade:"",uf:"",cep:""};}
async function v159_parse_pdf(filePath){const data=await pdfParse(fs.readFileSync(filePath));const raw=(data.text||"").replace(/\r/g,"\n");const lines=raw.split(/\n+/).map(x=>v159_up(x).replace(/\s+/g," ").trim()).filter(Boolean);const text=lines.join(" ");const cnpj=(text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)||[])[0]||"";let cep=v159_cep(text);const tel=(text.match(/(?:\(?\d{2}\)?\s*)?\d{4,5}-?\d{4}/)||[])[0]||"";function pick(labels){for(const label of labels){const idx=lines.findIndex(l=>l.includes(label));if(idx>=0){const same=lines[idx].split(label).pop().replace(/^[:\-\s]+/,"").trim();if(same&&same.length>2&&!/(COMPROVANTE|CADASTRO|DATA|REPUBLICA|REPÚBLICA|EMAIL|E-MAIL|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO|CNPJ|CEP|UF)$/.test(same))return same;for(let i=idx+1;i<Math.min(lines.length,idx+12);i++){const v=lines[i];if(v&&!/^(DATA|NUMERO|NÚMERO|COMPROVANTE|CADASTRO|REPUBLICA|REPÚBLICA|CNPJ|CEP|UF|PORTE|CODIGO|CÓDIGO|EMAIL|E-MAIL|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO)$/.test(v))return v;}}}return "";}
let nome=pick(["TITULO DO ESTABELECIMENTO","TÍTULO DO ESTABELECIMENTO","NOME DE FANTASIA","NOME EMPRESARIAL","RAZAO SOCIAL","RAZÃO SOCIAL"]);const rootCnpj=v159_dig(cnpj).slice(0,8);if(rootCnpj==="31035833"||text.includes("MEGA VEST CASA")||text.includes("VESTCASA")||(text.includes("VEST")&&text.includes("CASA")))nome="MEGA VEST CASA";if(!nome)nome=lines.find(l=>/\b(MEGA VEST CASA|VEST CASA|VESTCASA|BURDAYS|BURDAY|LTDA|EIRELI|EPP|ME)\b/.test(l)&&!/ENDERECO|ENDEREÇO|ELETRONICO|ELETRÔNICO|COMPROVANTE|CADASTRO|ATIVIDADE/.test(l))||"";let cidade=pick(["MUNICIPIO","MUNICÍPIO","CIDADE"]);let uf=pick(["UF"]);const fc=v159_find_city(text);if(!cidade||cidade.length<3)cidade=fc.cidade;if(!v159_uf(uf))uf=fc.uf||v159_uf(text);if(!cep&&fc.cep)cep=fc.cep;let endereco=pick(["LOGRADOURO","ENDERECO","ENDEREÇO"]);return {nome:v159_clean_nome(nome)||"MEGA VEST CASA",cnpj:v159_dig(cnpj),cep:v159_dig(cep),telefone:v159_dig(tel),cidade:v159_clean_cidade(cidade),uf:v159_uf(uf),estado:v159_uf(uf),endereco:v159_up(endereco).replace(/\b(CEP|UF|MUNICIPIO|MUNICÍPIO|ENDERECO ELETRONICO|ENDEREÇO ELETRÔNICO)\b/g," ").replace(/\s+/g," ").trim()};}
function v159_regra(config){const r=v159_up(config?.regraNomeFilial||config?.filialNomesRepetidos||"");return r.includes("MESCLAR")||r.includes("CIDADE")||r.includes("UF");}
function v159_nome_loja(parsed,config,fallback){let nome=v159_clean_nome(parsed.nome||fallback||"");if(!nome)nome="MEGA VEST CASA";const cidade=v159_clean_cidade(parsed.cidade||"");const uf=v159_uf(parsed.uf||parsed.estado||"");if(v159_regra(config)&&nome&&cidade)return `${nome} ${cidade} ${uf}`.replace(/\s+/g," ").trim();return nome||fallback||"";}
const v159_upload=upload.fields([{name:"pdf",maxCount:1},{name:"logoLocal",maxCount:1},{name:"cartaoCnpj",maxCount:1},{name:"fotos",maxCount:20}]);
async function v159_save_loja_pdf(req,res){try{const d=v159_db();d.lojas=Array.isArray(d.lojas)?d.lojas:[];d.config=d.config||{};let l=req.params.id?d.lojas.find(x=>String(x.id)===String(req.params.id)):null;if(!l){l={id:v159_next(d,"loja")};d.lojas.push(l);}const parsed=v159_file(req,"pdf")?await v159_parse_pdf(v159_file(req,"pdf").path):{};Object.assign(l,{codigo:req.body.codigo||l.codigo||l.id,tipoCodigo:req.body.tipoCodigo||l.tipoCodigo||"SOMENTE NÚMERO",nome:v159_nome_loja(parsed,d.config,req.body.nome||l.nome),responsavel:v159_up(req.body.responsavel||l.responsavel),cnpj:v159_dig(parsed.cnpj||req.body.cnpj||l.cnpj),ie:v159_up(req.body.ie||l.ie),telefone:v159_dig(parsed.telefone||req.body.telefone||l.telefone),whatsappResponsavel:v159_dig(req.body.whatsappResponsavel||l.whatsappResponsavel),cep:v159_dig(parsed.cep||req.body.cep||l.cep),uf:v159_uf(parsed.uf||req.body.uf||req.body.estado||l.uf||l.estado),estado:v159_uf(parsed.uf||req.body.uf||req.body.estado||l.uf||l.estado),cidade:v159_clean_cidade(parsed.cidade||req.body.cidade||l.cidade),endereco:v159_up(parsed.endereco||req.body.endereco||l.endereco),latitude:req.body.latitude||l.latitude||"",longitude:req.body.longitude||l.longitude||"",analista:v159_up(req.body.analista||l.analista),proprietario:v159_up(req.body.proprietario||l.proprietario),feriado:v159_up(req.body.feriado||l.feriado||"FECHADO"),logoUrl:req.body.logoUrl||l.logoUrl||"",horario:req.body.horario||l.horario||""});if(v159_file(req,"logoLocal"))l.logoLocal=v159_file_obj(v159_file(req,"logoLocal"));if(v159_file(req,"cartaoCnpj"))l.cartaoCnpj=v159_file_obj(v159_file(req,"cartaoCnpj"));l.fotos=[...v159_arr(l.fotos),...((req.files?.fotos||[]).map(v159_file_obj))];v159_save(d);res.redirect(`/lojas/${l.id}/editar`);}catch(e){res.status(500).send(v159_err(req,e));}}
app.post("/v159/loja-pdf", auth, v159_perm("LOJAS"), v159_upload, v159_save_loja_pdf);
app.post("/v159/loja-pdf/:id", auth, v159_perm("LOJAS"), v159_upload, v159_save_loja_pdf);



/* PATCH V16.1 - CHAMADO RÁPIDO E COMPLETO SEPARADOS */
function v160_up(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();}
function v160_dig(v){return String(v||"").replace(/\D/g,"");}
function v160_arr(v){return Array.isArray(v)?v:(v===undefined||v===null||v===""?[]:[v]);}
function v160_db(){
  if(typeof v154_getDB==="function") return v154_getDB();
  if(typeof v156_db==="function") return v156_db();
  if(typeof db==="function") return db();
  if(typeof readDB==="function") return readDB();
  if(typeof readDb==="function") return readDb();
  const f=(typeof DB_FILE!=="undefined")?DB_FILE:(typeof DATA_FILE!=="undefined"?DATA_FILE:path.join(process.cwd(),"data","db.json"));
  if(!fs.existsSync(path.dirname(f))) fs.mkdirSync(path.dirname(f),{recursive:true});
  if(!fs.existsSync(f)) fs.writeFileSync(f,JSON.stringify({lojas:[],prestadores:[],chamados:[],usuarios:[],analistas:[],config:{},_seq:{}},null,2));
  return JSON.parse(fs.readFileSync(f,"utf8"));
}
function v160_save(d){
  if(typeof v154_saveDB==="function") return v154_saveDB(d);
  if(typeof v156_save==="function") return v156_save(d);
  if(typeof save==="function") return save(d);
  if(typeof saveDB==="function") return saveDB(d);
  if(typeof saveDb==="function") return saveDb(d);
  const f=(typeof DB_FILE!=="undefined")?DB_FILE:(typeof DATA_FILE!=="undefined"?DATA_FILE:path.join(process.cwd(),"data","db.json"));
  if(!fs.existsSync(path.dirname(f))) fs.mkdirSync(path.dirname(f),{recursive:true});
  fs.writeFileSync(f,JSON.stringify(d,null,2));
}
function v160_init(d){d.lojas=Array.isArray(d.lojas)?d.lojas:[];d.prestadores=Array.isArray(d.prestadores)?d.prestadores:[];d.chamados=Array.isArray(d.chamados)?d.chamados:[];d.usuarios=Array.isArray(d.usuarios)?d.usuarios:[];d.analistas=Array.isArray(d.analistas)?d.analistas:[];d.config=d.config||{};d._seq=d._seq||{};return d;}
function v160_next(d,k){if(typeof nextId==="function") return nextId(d,k); d._seq=d._seq||{}; d._seq[k]=(d._seq[k]||0)+1; return d._seq[k];}
function v160_today(){return typeof today==="function"?today():new Date().toISOString().slice(0,10);}
function v160_err(req,e){if(typeof errorPage==="function") return errorPage(req,e); return `<h1>Erro tratado</h1><p>${String(e&&e.message||e)}</p><a href="/">Início</a>`;}
function v160_layout(req,t,b){return typeof layout==="function"?layout(req,t,b):`<!doctype html><html><head><meta charset="utf-8"><title>${t}</title><link rel="stylesheet" href="/style.css"></head><body><main>${b}</main></body></html>`;}
function v160_perm(p){return typeof v154_perm==="function"?v154_perm(p):(typeof v145Require==="function"?v145Require(p):(typeof requirePerm==="function"?requirePerm(p):(req,res,next)=>next()));}
function v160_file_obj(f){return f?{original:f.originalname,path:"uploads/"+f.filename,filename:f.filename,mimetype:f.mimetype,size:f.size,at:new Date().toISOString()}:null;}
function v160_current_user(req){if(typeof currentUser==="function") return currentUser(req); return (req.session&&(req.session.user||req.session.usuario))||{};}
function v160_get_loja(d,n){n=v160_up(n);return d.lojas.find(l=>v160_up(l.nome||l.loja)===n||String(l.id)===String(n));}
function v160_get_prest(d,n){n=v160_up(n);return d.prestadores.find(p=>v160_up(p.empresa||p.nome||p.responsavel)===n||String(p.id)===String(n));}

function v160_chamado_form(req, modo, ch={}){
 const d=v160_init(v160_db());
 const lojas=d.lojas.map(l=>v160_up(l.nome||l.loja)).filter(Boolean).sort();
 const analistas=[...new Set([...d.usuarios.map(u=>v160_up(u.nome||u.usuario||u.login)).filter(Boolean),...d.analistas.map(a=>v160_up(a.nome||a.analista||a.usuario)).filter(Boolean),...d.chamados.map(c=>v160_up(c.analista)).filter(Boolean)])].sort();
 const prestadores=d.prestadores.map(p=>v160_up(p.empresa||p.nome||p.responsavel)).filter(Boolean).sort();
 const servicos=[...new Set(["A DEFINIR","FAZ TUDO","ELETRICISTA","ENCANADOR","SERRALHEIRO","CHAVEIRO","AR CONDICIONADO","DEDETIZAÇÃO","JARDINAGEM","LIMPEZA","PORTAS AUTOMÁTICAS","FILTRO","PINTURA","MANUTENÇÃO",...d.prestadores.flatMap(p=>v160_arr(p.servicos).map(v160_up))])].filter(Boolean).sort();

 if(modo==="rapido"){
  return v160_layout(req,"Chamado rápido",`
  <div class="page-title">⚡ Abrir chamado rápido</div>
  <div class="card">
    <p class="info">Tela simples para usuário comum: informe a loja e descreva o problema. O analista tratará prestador, prioridade e status depois.</p>
    <form method="post" action="/v160/chamados/rapido" enctype="multipart/form-data" class="grid-form">
      <label class="span-full">Loja
        <input name="lojaNome" list="v160-lojas" required placeholder="Digite pelo menos 2 letras da loja">
      </label>
      <label class="span-full">Descrição do problema
        <textarea name="descricao" required rows="7" placeholder="Descreva o problema com detalhes"></textarea>
      </label>
      <label class="span-full">Anexos/imagens
        <input type="file" name="anexos" multiple accept="image/*,.pdf">
      </label>
      <datalist id="v160-lojas">${lojas.map(x=>`<option value="${x}"></option>`).join("")}</datalist>
      <div class="actions span-full"><button class="btn" type="submit">💾 Abrir chamado</button><a class="btn secondary" href="/">↩️ Voltar</a></div>
    </form>
  </div>`);
 }

 return v160_layout(req,"Chamado completo",`
 <div class="page-title">🧰 Abrir chamado completo</div>
 <div class="card">
  <p class="info">Tela completa para analista/admin: atribuição, prestador, logística, valores, status e anexos.</p>
  <form method="post" action="/v160/chamados/completo" enctype="multipart/form-data" class="grid-form">
    <label>Tipo número<select name="tipoNumero"><option>AUTOMÁTICO</option><option>TERCEIRO</option></select></label>
    <label>Nº chamado terceiro<input name="numeroExterno"></label>
    <label>Loja<input name="lojaNome" list="v160-lojas" required placeholder="Digite loja/código"></label>
    <label>Analista<input name="analista" list="v160-analistas" placeholder="Digite 2 letras"></label>
    <label>Tipo serviço<select name="tipoServico">${servicos.map(x=>`<option>${x}</option>`).join("")}</select></label>
    <label>Prestador<div class="inline-suggest"><input name="prestadorNome" list="v160-prestadores"><button type="button" class="btn mini v160-sugerir">🎯 Sugerir</button></div></label>
    <label>Prioridade<select name="prioridade"><option>MÍNIMA</option><option>MÉDIA</option><option>MÁXIMA</option></select></label>
    <label>Status<select name="status"><option>ABERTO</option><option>AGUARDANDO</option><option>EM ANDAMENTO</option><option>AGENDADO</option><option>AGUARDANDO APROVAÇÃO</option><option>FINALIZADO</option><option>CANCELADO</option></select></label>
    <label>Valor serviço<input name="valor" value="0"></label>
    <label>Data orçamento<input name="dataOrcamento" type="date"></label>
    <label>Data agendada<input name="dataAgendada" type="date"></label>
    <label>Por conta proprietário?<select name="porContaProprietario"><option>NÃO</option><option>SIM</option></select></label>
    <label class="span-full">Descrição serviços<textarea name="descricao" required rows="5"></textarea></label>
    <label class="span-full">Observações<textarea name="observacoes" rows="4"></textarea></label>
    <label class="span-full">Anexos/imagens<input type="file" name="anexos" multiple accept="image/*,.pdf"></label>
    <datalist id="v160-lojas">${lojas.map(x=>`<option value="${x}"></option>`).join("")}</datalist>
    <datalist id="v160-analistas">${analistas.map(x=>`<option value="${x}"></option>`).join("")}</datalist>
    <datalist id="v160-prestadores">${prestadores.map(x=>`<option value="${x}"></option>`).join("")}</datalist>
    <div class="actions span-full"><button class="btn" type="button" onclick="location.href='/config#tipos-servico'">🛠️ Tipos de serviço</button><button class="btn" type="submit">💾 Salvar chamado completo</button><a class="btn secondary" href="/">↩️ Voltar</a></div>
    <div id="v160-sugestao" class="info span-full"></div>
  </form>
 </div>`);
}

app.get("/chamados/rapido", auth, (req,res)=>res.send(v160_chamado_form(req,"rapido")));
app.get("/chamados/novo-rapido", auth, (req,res)=>res.redirect("/chamados/rapido"));
app.get("/chamados/novo-completo", auth, v160_perm("CHAMADOS"), (req,res)=>res.send(v160_chamado_form(req,"completo")));
app.get("/chamados/completo", auth, v160_perm("CHAMADOS"), (req,res)=>res.send(v160_chamado_form(req,"completo")));

const v160_upload=upload.fields([{name:"anexos",maxCount:20},{name:"fotos",maxCount:20}]);
app.post("/v160/chamados/rapido", auth, v160_upload, (req,res)=>{
 try{
  const d=v160_init(v160_db()); const lojaNome=v160_up(req.body.lojaNome||req.body.loja||""); const loja=v160_get_loja(d,lojaNome); const user=v160_current_user(req);
  const anexos=[...(req.files?.anexos||[]),...(req.files?.fotos||[])].map(v160_file_obj);
  const ch={id:v160_next(d,"chamado"),numeroInterno:v160_next(d,"numeroChamado"),tipoNumero:"AUTOMÁTICO",lojaId:loja?loja.id:"",lojaNome:loja?loja.nome:lojaNome,abertoPor:v160_up(user.nome||user.usuario||user.login||"USUÁRIO"),analista:"",prestadorId:"",prestadorNome:"",tipoServico:"A DEFINIR",prioridade:"MÍNIMA",status:"ABERTO",valor:0,descricao:v160_up(req.body.descricao||""),observacoes:"ABERTO PELO CHAMADO RÁPIDO",anexos,dataAbertura:v160_today(),criadoEm:new Date().toISOString(),modo:"RÁPIDO"};
  d.chamados.push(ch); v160_save(d); res.redirect(`/chamados/${ch.id}/editar`);
 }catch(e){res.status(500).send(v160_err(req,e));}
});
app.post("/v160/chamados/completo", auth, v160_perm("CHAMADOS"), v160_upload, (req,res)=>{
 try{
  const d=v160_init(v160_db()); const lojaNome=v160_up(req.body.lojaNome||req.body.loja||""); const prestNome=v160_up(req.body.prestadorNome||req.body.prestador||""); const loja=v160_get_loja(d,lojaNome); const prest=v160_get_prest(d,prestNome); const user=v160_current_user(req);
  const anexos=[...(req.files?.anexos||[]),...(req.files?.fotos||[])].map(v160_file_obj);
  const ch={id:v160_next(d,"chamado"),numeroInterno:v160_up(req.body.tipoNumero)==="TERCEIRO"&&req.body.numeroExterno?v160_dig(req.body.numeroExterno):v160_next(d,"numeroChamado"),numeroExterno:v160_dig(req.body.numeroExterno||""),tipoNumero:v160_up(req.body.tipoNumero||"AUTOMÁTICO"),lojaId:loja?loja.id:"",lojaNome:loja?loja.nome:lojaNome,abertoPor:v160_up(user.nome||user.usuario||user.login||"ANALISTA"),analista:v160_up(req.body.analista||""),prestadorId:prest?prest.id:"",prestadorNome:prest?prest.empresa:prestNome,tipoServico:v160_up(req.body.tipoServico||"A DEFINIR"),prioridade:v160_up(req.body.prioridade||"MÍNIMA"),status:v160_up(req.body.status||"ABERTO"),valor:Number(String(req.body.valor||0).replace(",",".").replace(/[^\d.-]/g,""))||0,dataOrcamento:req.body.dataOrcamento||"",dataAgendada:req.body.dataAgendada||"",porContaProprietario:v160_up(req.body.porContaProprietario||"NÃO"),descricao:v160_up(req.body.descricao||""),observacoes:v160_up(req.body.observacoes||""),anexos,dataAbertura:v160_today(),criadoEm:new Date().toISOString(),modo:"COMPLETO"};
  d.chamados.push(ch); v160_save(d); res.redirect(`/chamados/${ch.id}/editar`);
 }catch(e){res.status(500).send(v160_err(req,e));}
});
app.get("/api/v160/sugerir-prestador", auth, (req,res)=>{
 try{
  const d=v160_init(v160_db()); const loja=v160_get_loja(d,req.query.loja||""); const tipo=v160_up(req.query.tipo||"");
  if(!loja) return res.json({ok:false,msg:"Loja não encontrada",items:[]});
  const lc=v160_up(loja.cidade||""), uf=v160_up(loja.uf||loja.estado||"");
  const items=d.prestadores.filter(p=>{const serv=v160_arr(p.servicos).map(v160_up);return v160_up(p.ativo||"SIM")!=="NÃO" && (!tipo||tipo==="A DEFINIR"||serv.includes(tipo)||serv.includes("A DEFINIR"));}).map(p=>{let score=0;if(v160_up(p.cidade)===lc)score+=100;if(v160_up(p.uf||p.estado)===uf)score+=50;if(v160_arr(p.servicos).map(v160_up).includes(tipo))score+=80;return {nome:v160_up(p.empresa||p.nome||p.responsavel),cidade:v160_up(p.cidade||""),uf:v160_up(p.uf||p.estado||""),raioKm:p.raioKm||"",valorKm:p.valorKm||"",score};}).sort((a,b)=>b.score-a.score).slice(0,5);
  res.json({ok:true,loja:{nome:loja.nome,cidade:lc,uf},items});
 }catch(e){res.json({ok:false,msg:String(e.message||e),items:[]});}
});



/* PATCH V16.1 - GRID/FECHAMENTO/WHATSAPP OS */
function v161u(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim()}
function v161d(v){return String(v||"").replace(/\D/g,"")}
function v161a(v){return Array.isArray(v)?v:(v===undefined||v===null||v===""?[]:[v])}
function v161db(){if(typeof v160_db==="function")return v160_db();if(typeof v154_getDB==="function")return v154_getDB();if(typeof db==="function")return db();if(typeof readDB==="function")return readDB();const f=(typeof DB_FILE!=="undefined")?DB_FILE:(typeof DATA_FILE!=="undefined"?DATA_FILE:path.join(process.cwd(),"data","db.json"));if(!fs.existsSync(path.dirname(f)))fs.mkdirSync(path.dirname(f),{recursive:true});if(!fs.existsSync(f))fs.writeFileSync(f,JSON.stringify({lojas:[],prestadores:[],chamados:[],config:{},_seq:{}},null,2));return JSON.parse(fs.readFileSync(f,"utf8"))}
function v161save(d){if(typeof v160_save==="function")return v160_save(d);if(typeof v154_saveDB==="function")return v154_saveDB(d);if(typeof save==="function")return save(d);if(typeof saveDB==="function")return saveDB(d);const f=(typeof DB_FILE!=="undefined")?DB_FILE:(typeof DATA_FILE!=="undefined"?DATA_FILE:path.join(process.cwd(),"data","db.json"));if(!fs.existsSync(path.dirname(f)))fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d,null,2))}
function v161init(d){d.lojas=Array.isArray(d.lojas)?d.lojas:[];d.prestadores=Array.isArray(d.prestadores)?d.prestadores:[];d.chamados=Array.isArray(d.chamados)?d.chamados:[];d.config=d.config||{};return d}
function v161err(req,e){if(typeof errorPage==="function")return errorPage(req,e);return `<h1>Erro tratado</h1><p>${String(e&&e.message||e)}</p><a href="/">Início</a>`}
function v161lay(req,t,b){return typeof layout==="function"?layout(req,t,b):`<!doctype html><html><head><meta charset="utf-8"><title>${t}</title><link rel="stylesheet" href="/style.css"></head><body>${b}</body></html>`}
function v161perm(p){return typeof v160_perm==="function"?v160_perm(p):(typeof requirePerm==="function"?requirePerm(p):(req,res,next)=>next())}
function v161closed(s){s=v161u(s);return ["FINALIZADO","FECHADO","CANCELADO","CONCLUIDO","CONCLUÍDO"].includes(s)}
function v161today(){return typeof today==="function"?today():new Date().toISOString().slice(0,10)}
function v161user(req){return (typeof currentUser==="function"?currentUser(req):(req.session&&(req.session.user||req.session.usuario))||{})}
function v161loja(d,ch){let n=v161u(ch.lojaNome||ch.loja||"");return d.lojas.find(l=>String(l.id)===String(ch.lojaId||ch.loja_id)||v161u(l.nome||l.loja)===n)||{}}
function v161prest(d,ch){let n=v161u(ch.prestadorNome||ch.prestador||"");return d.prestadores.find(p=>String(p.id)===String(ch.prestadorId||ch.prestador_id)||v161u(p.empresa||p.nome||p.responsavel)===n)||{}}
function v161match(ch,q){q=v161u(q);if(!q)return true;return [ch.id,ch.numeroInterno,ch.numeroExterno,ch.lojaNome,ch.loja,ch.prestadorNome,ch.prestador,ch.analista,ch.tipoServico,ch.status,ch.descricao,ch.observacoes].map(v161u).join(" ").includes(q)}
function v161wa(n,msg){n=v161d(n);if(!n)return "";if(!n.startsWith("55"))n="55"+n;return "https://wa.me/"+n+"?text="+encodeURIComponent(msg||"")}

app.get("/chamados", auth, (req,res)=>{
 try{
  const d=v161init(v161db()), q=v161u(req.query.q||""), mostrar=v161u(req.query.mostrar||"ABERTOS"), sf=v161u(req.query.status||"");
  let lista=d.chamados.filter(c=>v161match(c,q));
  if(sf&&sf!=="TODOS") lista=lista.filter(c=>v161u(c.status)===sf);
  else if(mostrar.includes("FINAL")) lista=lista.filter(c=>v161closed(c.status));
  else if(mostrar==="TODOS") lista=lista;
  else lista=lista.filter(c=>!v161closed(c.status));
  lista.sort((a,b)=>(Number(b.id)||0)-(Number(a.id)||0));
  const ab=d.chamados.filter(c=>!v161closed(c.status)).length, fe=d.chamados.filter(c=>v161closed(c.status)).length;
  const rows=lista.map(c=>`<tr class="${v161closed(c.status)?"closed-row":""}"><td><input type="checkbox" name="ids" value="${c.id}"></td><td>${c.numeroInterno||c.id}</td><td>${c.numeroExterno||""}</td><td>${v161u(c.lojaNome||c.loja)}</td><td>${v161u(c.analista)}</td><td>${v161u(c.prestadorNome||c.prestador)}</td><td>${v161u(c.tipoServico)}</td><td>${v161u(c.status||"ABERTO")}</td><td>${c.dataAbertura||""}</td><td><a class="btn mini" href="/chamados/${c.id}/editar">✏️ Tratar</a> <a class="btn mini secondary" href="/os/${c.id}/imprimir">🧾 OS</a></td></tr>`).join("")||`<tr><td colspan="10">Nenhum chamado encontrado.</td></tr>`;
  res.send(v161lay(req,"Chamados",`<div class="page-title">📋 Chamados</div><div class="card"><div class="status-cards"><span>🟢 Abertos: <b>${ab}</b></span><span>✅ Finalizados/Cancelados: <b>${fe}</b></span><span>📌 Total: <b>${d.chamados.length}</b></span></div><form method="get" action="/chamados" class="search-row"><input name="q" value="${q}" placeholder="Buscar por número, loja, prestador, analista..."><select name="mostrar"><option value="abertos">Somente abertos</option><option value="finalizados" ${mostrar.includes("FINAL")?"selected":""}>Somente finalizados/cancelados</option><option value="todos" ${mostrar==="TODOS"?"selected":""}>Todos</option></select><select name="status"><option>TODOS</option>${["ABERTO","AGUARDANDO","EM ANDAMENTO","AGENDADO","AGUARDANDO APROVAÇÃO","FINALIZADO","CANCELADO"].map(s=>`<option ${sf===s?"selected":""}>${s}</option>`).join("")}</select><button class="btn">🔎 Buscar</button><a class="btn secondary" href="/chamados">Limpar</a></form></div><form method="post" action="/v161/chamados/fechar-lote" class="card"><div class="actions"><button class="btn" type="button" onclick="document.querySelectorAll('input[name=ids]').forEach(x=>x.checked=true)">☑️ Selecionar todos</button><button class="btn danger" onclick="return confirm('Fechar os chamados selecionados?')">✅ Fechar selecionados</button><input name="motivoFechamento" placeholder="Observação do fechamento em lote"></div><div class="table-wrap"><table class="data-table"><thead><tr><th></th><th>Nº interno</th><th>Nº terceiro</th><th>Loja</th><th>Analista</th><th>Prestador</th><th>Serviço</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div></form>`));
 }catch(e){res.status(500).send(v161err(req,e))}
});
app.get("/chamados/abertos", auth, (req,res)=>res.redirect("/chamados?mostrar=abertos"));
app.get("/chamados/finalizados", auth, (req,res)=>res.redirect("/chamados?mostrar=finalizados"));
app.post("/v161/chamados/fechar-lote", auth, v161perm("CHAMADOS"), (req,res)=>{
 try{
  const d=v161init(v161db()), ids=v161a(req.body.ids).map(String), u=v161user(req), obs=v161u(req.body.motivoFechamento||"FECHADO EM LOTE"); let count=0;
  for(const c of d.chamados){if(ids.includes(String(c.id))){c.status="FINALIZADO";c.dataFinalizacao=c.dataFinalizacao||v161today();c.finalizadoEm=new Date().toISOString();c.finalizadoPor=v161u(u.nome||u.usuario||u.login||"USUÁRIO");c.observacoes=[c.observacoes,obs].filter(Boolean).join(" | ");count++}}
  v161save(d);res.redirect("/chamados?mostrar=finalizados");
 }catch(e){res.status(500).send(v161err(req,e))}
});
function v161os(req,id){
 const d=v161init(v161db()), c=d.chamados.find(x=>String(x.id)===String(id)||String(x.numeroInterno)===String(id)); if(!c)return v161lay(req,"OS",`<div class="card"><h2>OS não encontrada</h2><a class="btn" href="/chamados">Voltar</a></div>`);
 const l=v161loja(d,c), p=v161prest(d,c), wl=l.whatsappResponsavel||l.whatsapp||l.telefone||c.whatsappResponsavel||"", wp=p.whatsapp||p.telefone||c.telefonePrestador||"", msg=`OS/Chamado ${c.numeroInterno||c.id} - Loja ${c.lojaNome||l.nome||""} - Serviço: ${c.tipoServico||""}`;
 return v161lay(req,"Imprimir OS",`<div class="os-print"><div class="bar no-print"><button class="btn" onclick="window.print()">🖨️ Imprimir</button>${wl?`<a class="btn" target="_blank" href="${v161wa(wl,msg)}">📲 WhatsApp responsável loja</a>`:`<button class="btn secondary" disabled>📲 Sem WhatsApp loja</button>`}${wp?`<a class="btn" target="_blank" href="${v161wa(wp,msg)}">📲 WhatsApp prestador</a>`:`<button class="btn secondary" disabled>📲 Sem WhatsApp prestador</button>`}<a class="btn secondary" href="/chamados/${c.id}/editar">↩️ Voltar</a></div><div class="os-sheet"><h1>ORDEM DE SERVIÇO / CHAMADO</h1><div class="os-grid"><p><b>Nº chamado:</b> ${c.numeroInterno||c.id}</p><p><b>Nº terceiro:</b> ${c.numeroExterno||""}</p><p><b>Status:</b> ${v161u(c.status)}</p><p><b>Data abertura:</b> ${c.dataAbertura||""}</p><p><b>Loja:</b> ${v161u(c.lojaNome||l.nome)}</p><p><b>Cidade/UF:</b> ${v161u(l.cidade)}/${v161u(l.uf||l.estado)}</p><p><b>Endereço:</b> ${v161u(l.endereco)}</p><p><b>Responsável loja:</b> ${v161u(l.responsavel)}</p><p><b>WhatsApp loja:</b> ${wl}</p><p><b>Prestador:</b> ${v161u(c.prestadorNome||p.empresa)}</p><p><b>WhatsApp prestador:</b> ${wp}</p><p><b>Analista:</b> ${v161u(c.analista)}</p><p><b>Tipo serviço:</b> ${v161u(c.tipoServico)}</p><p><b>Valor:</b> R$ ${Number(c.valor||0).toFixed(2)}</p></div><h3>Descrição dos serviços</h3><div class="os-box">${v161u(c.descricao)}</div><h3>Observações / finalização</h3><div class="os-box">${v161u(c.observacoes)}</div><div class="sign-row"><div>Responsável loja<br><br>_______________________________</div><div>Prestador<br><br>_______________________________</div><div>Analista<br><br>_______________________________</div></div></div></div>`)
}
app.get("/os/:id/imprimir", auth, (req,res)=>res.send(v161os(req,req.params.id)));
app.get("/chamados/:id/os", auth, (req,res)=>res.redirect(`/os/${req.params.id}/imprimir`));


app.get('/api/v2084/status', auth, (req,res)=>{
  const d=load();
  res.json({ok:true,versao:'V20.8.14',supabaseConfigurado:!!supabasePersist,supabaseOk,lastSaveOk,lastSaveAt,erroSupabase:lastPersistError||'',state_id:SUPABASE_STATE_ID,local:{usuarios:d.usuarios.length,lojas:d.lojas.length,prestadores:d.prestadores.length,chamados:d.chamados.length,os:d.os.length,lembretes:d.lembretes.length,preventivas:d.preventivas.length}});
});



/* PATCH V20.8.14 - diagnóstico de importação/persistência */
app.get('/api/v2087/status', auth, async (req,res)=>{
  try{
    const local = load();
    let remoto = null, erroRemoto = '';
    if(typeof supabasePersist !== 'undefined' && supabasePersist){
      try{
        const r = await supabasePersist.from('app_state').select('id,data,updated_at').eq('id', SUPABASE_STATE_ID).maybeSingle();
        if(r.error) throw r.error;
        remoto = r.data;
      }catch(e){ erroRemoto = e.message || String(e); }
    }
    res.json({
      ok:true,
      versao:'20.8.14',
      supabaseConfigurado: !!(typeof supabasePersist !== 'undefined' && supabasePersist),
      erroRemoto,
      local:{
        usuarios:(local.usuarios||[]).length,
        lojas:(local.lojas||[]).length,
        prestadores:(local.prestadores||[]).length,
        chamados:(local.chamados||[]).length,
        os:(local.os||[]).length
      },
      remoto: remoto && remoto.data ? {
        updated_at: remoto.updated_at,
        usuarios:(remoto.data.usuarios||[]).length,
        lojas:(remoto.data.lojas||[]).length,
        prestadores:(remoto.data.prestadores||[]).length,
        chamados:(remoto.data.chamados||[]).length,
        os:(remoto.data.os||[]).length
      } : null
    });
  }catch(e){ res.json({ok:false,erro:e.message||String(e)}); }
});


/* PATCH V20.8.14 - rotas WhatsApp e PDF da O.S. */
app.get('/os-pdf/:id', auth, (req,res)=>{
  try{
    const d=load(), info=v20814_osData(d,req.params.id), show=v20814_showValor(req);
    const doc=new PDFDocument({size:'A4',margin:40});
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`inline; filename="OS-${String(info.numeros).replace(/[^0-9A-Z,-]/gi,'')}.pdf"`);
    doc.pipe(res);
    doc.fontSize(16).text('ORDEM DE SERVIÇO',{align:'center'});
    doc.fontSize(11).text(`Nº: ${info.numeros}`,{align:'right'});
    doc.moveDown().fontSize(10).text('DADOS DO REQUERENTE').moveTo(40,doc.y).lineTo(555,doc.y).stroke();
    doc.moveDown(.3).text(`LOJA: ${info.loja.nome||info.loja.nomeLoja||info.ch[0]?.lojaNome||''}`);
    doc.text(`ENDEREÇO: ${info.loja.endereco||''}`);
    doc.text(`CNPJ: ${info.loja.cnpj||''}`);
    doc.text(`CIDADE/UF: ${info.loja.cidade||''} ${info.loja.uf||info.loja.estado||''}`);
    doc.moveDown().text('DESCRIÇÃO DA ORDEM DE SERVIÇO').moveTo(40,doc.y).lineTo(555,doc.y).stroke();
    info.ch.forEach(c=>doc.moveDown(.25).text(`${c.numeroInterno||c.numero||c.id} - ${c.descricao||c.servico||'IMPORTADO SEM DESCRIÇÃO'}${show?' - '+money(v20814_valorChamado(c)):''}`));
    doc.moveDown().text('PRESTADOR DE SERVIÇO').moveTo(40,doc.y).lineTo(555,doc.y).stroke();
    doc.moveDown(.3).text(`EMPRESA: ${info.prest.empresa||info.prest.nome||info.ch[0]?.prestadorNome||''}`);
    doc.text(`TELEFONE: ${info.prest.telefone||info.prest.whatsapp||''}`);
    if(show) doc.moveDown().text(`TOTAL: ${money(v20814_totalChamados(info.ch))}`);
    doc.moveDown().text('TERMO DE RESPONSABILIDADE').moveTo(40,doc.y).lineTo(555,doc.y).stroke();
    doc.moveDown(.3).fontSize(8).text('DECLARO, PARA OS DEVIDOS FINS, QUE ESTOU CIENTE DOS RISCOS ENVOLVIDOS NA EXECUÇÃO DAS ATIVIDADES ACIMA DESCRITAS E ME COMPROMETO A SEGUIR INTEGRALMENTE TODAS AS NORMAS DE SEGURANÇA VIGENTES.');
    doc.moveDown(3).fontSize(9).text('________________________          ________________________          ________________________');
    doc.text('PRESTADOR DE SERVIÇO              REQUERENTE                       ANALISTA');
    doc.end();
  }catch(e){res.status(500).send(errorPage(req,e));}
});
app.get('/os-whatsapp-loja/:id', auth, (req,res)=>{
  const d=load(), i=v20814_osData(d,req.params.id), show=v20814_showValor(req);
  const tel=i.loja.whatsappResponsavel||i.loja.whatsapp||i.loja.telefoneResponsavel||i.loja.telefone;
  res.redirect(v20814_whatsLink(tel,`ORDEM DE SERVIÇO ${i.numeros}. PDF: ${v20814_pdfUrl(req,req.params.id,show)}`));
});
app.get('/os-whatsapp-prestador/:id', auth, (req,res)=>{
  const d=load(), i=v20814_osData(d,req.params.id), show=v20814_showValor(req);
  const tel=i.prest.whatsapp||i.prest.telefone||i.prest.celular;
  res.redirect(v20814_whatsLink(tel,`ORDEM DE SERVIÇO ${i.numeros}. PDF: ${v20814_pdfUrl(req,req.params.id,show)}`));
});

app.use((req,res)=>res.status(404).send(page(req,'Página não encontrada',`<div class="card"><h2>❌ Página não encontrada</h2><p>A rota ${esc(req.path)} não foi localizada.</p><a class="btn" href="/">🏠 Início</a></div>`)));
app.use((err,req,res,nextfn)=>res.status(500).send(errorPage(req,err)));

app.get(['/api/v2085/status','/api/persist-status'], auth, (req,res)=>{
  const d=load();
  res.json({ok:true,version:'V20.8.14',supabaseConfigurado:!!supabasePersist,supabaseOk,remoteLoaded,lastSaveOk,lastSaveAt,lastRemoteLoadAt,stateId:SUPABASE_STATE_ID,erro:lastPersistError,contagem:{usuarios:(d.usuarios||[]).length,lojas:(d.lojas||[]).length,prestadores:(d.prestadores||[]).length,proprietarios:(d.proprietarios||[]).length,chamados:(d.chamados||[]).length,os:(d.os||[]).length,lembretes:(d.lembretes||[]).length,preventivas:(d.preventivas||[]).length}});
});
app.post('/api/v2085/force-save', auth, async (req,res)=>{
  try{ await saveRemoteNow(load()); res.json({ok:true,lastSaveAt,erro:''}); }
  catch(e){ lastPersistError=e.message||String(e); res.status(500).json({ok:false,erro:lastPersistError}); }
});

await initPersistentDB();
app.listen(PORT,()=>console.log('V&B Chamados V20.8.14 rodando na porta '+PORT));