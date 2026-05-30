import express from 'express';
import session from 'express-session';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import pdfParse from 'pdf-parse';
import { fileURLToPath } from 'url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const DATA=path.join(__dirname,'data','db.json');
const upload=multer({dest:path.join(__dirname,'uploads')});
const app=express();
app.use(express.urlencoded({extended:true,limit:'50mb'}));app.use(express.json({limit:'50mb'}));
app.use(session({secret:process.env.SESSION_SECRET||'v12-secret',resave:false,saveUninitialized:false}));
app.use('/public',express.static(path.join(__dirname,'public')));
const PORT=process.env.PORT||3000;
function db(){return JSON.parse(fs.readFileSync(DATA,'utf8'))} function save(d){fs.writeFileSync(DATA,JSON.stringify(d,null,2))}
function up(v){return String(v??'').trim().replace(/\s+/g,' ').toUpperCase()} function dig(v){return String(v??'').replace(/\D/g,'')}
function money(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} function today(){return new Date().toISOString().slice(0,10)}
function next(d,k){const c=d.config?d.config:d;c[k]=Number(c[k]||1);return c[k]++} function esc(v){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}
function auth(req,res,next){if(req.session.user)return next();res.redirect('/login')}
function opt(v,cur){return `<option ${String(v)==String(cur)?'selected':''}>${esc(v)}</option>`}
function layout(req,title,body){const d=db();const c=d.config||{};const menu=[['/','Início'],['/chamados','Chamados'],['/lojas','Lojas'],['/prestadores','Prestadores'],['/proprietarios','Proprietários'],['/lembretes','Lembretes'],['/preventivas','Preventivas'],['/os','Ordens de Serviço'],['/importar-planilha','Importar'],['/ponto-horas','Ponto/Horas'],['/config','Config'],['/sair','Sair']];return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/public/style.css"><style>:root{--primary:${c.temaCor||'#2563eb'}}</style></head><body><header class="top"><h1>${esc(c.nomeSistema||'V&B CHAMADOS')}</h1><small>${esc(c.subtitulo||'Chamados de manutenção')}</small><nav class="nav">${menu.map(([h,t])=>`<a class="btn small" href="${h}">${t}</a>`).join('')}</nav></header><main class="wrap">${body}</main><button class="btn audio" id="audioBtn">🔊 Alarme ativo / testar</button><div class="badge">V12.0</div><div class="loading" id="loading">PROCESSANDO... AGUARDE</div><script src="/public/app.js"></script>
<!-- PATCH V12.1 CLIENT -->
<script>
document.addEventListener("DOMContentLoaded",function(){
  if(window.__V121__)return;window.__V121__=true;
  document.querySelectorAll(".v12-badge,.v121-badge").forEach(x=>x.remove());
  var bd=document.createElement("div");bd.className="v121-badge";bd.textContent="V12.1";document.body.appendChild(bd);

  if(location.pathname==="/config"){
    document.querySelectorAll("p,div,section,.card").forEach(function(el){
      var t=(el.textContent||"").toUpperCase();
      if(t.includes("LOGIN PADRÃO") || t.includes("OLITECH / 051309")){
        el.style.display="none";
      }
    });
    var main=document.querySelector("main,.container,.content")||document.body;
    var box=document.createElement("div");
    box.className="card v121-config-links";
    box.innerHTML='<h2>USUÁRIOS, PERMISSÕES E BACKUP</h2><a class="btn" href="/usuarios">👤 Usuários/Analistas</a> <a class="btn" href="/perfis">🔐 Perfis/Permissões</a> <a class="btn" href="/backup">💾 Backup/Restauração</a>';
    main.appendChild(box);
  }

  var nav=document.querySelector("nav,.menu,header");
  if(nav && !document.querySelector('a[href="/usuarios"]')){
    var a=document.createElement("a");a.href="/usuarios";a.className="btn small";a.textContent="USUÁRIOS";nav.appendChild(a);
  }
});
</script>
</body></html>`}
function formHidden(id){return id?`<input type="hidden" name="id" value="${esc(id)}">`:''}
function actions(back){return `<div class="actions"><button type="submit">💾 Salvar</button><a class="btn secondary" href="${back}">Voltar</a></div>`}
function filePdfBox(){return `<details class="card" open><summary>📄 Preencher por PDF/cartão CNPJ</summary><label>Enviar PDF<input type="file" accept=".pdf" class="pdfInput"></label><button type="button" class="pdfBtn">Pesquisar PDF</button><span> Preenche CNPJ, nome, CEP, endereço, cidade, UF e telefone.</span></details>`}
function cidadeUf(o){return [o.cidade,o.uf||o.estado].filter(Boolean).join('/')}
function lower(s){return String(s||'').toLowerCase()}
function match(o,q){q=lower(q);return !q||Object.values(o).some(v=>lower(Array.isArray(v)?v.join(' '):v).includes(q))}
function onlyNumFields(){return ` oninput="this.value=this.value.replace(/\\D/g,'')" `}
function listaServicos(d,sel=[]){sel=Array.isArray(sel)?sel:sel?[sel]:[];return (d.tiposServico||[]).map(s=>`<label><input type="checkbox" name="servicos" value="${esc(s)}" ${sel.includes(s)?'checked':''}> ${esc(s)}</label>`).join('')}
app.get('/login',(req,res)=>res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/style.css"><title>Login</title></head><body class="login"><form class="card" method="post" action="/login"><div class="logoBox">V12</div><h2>LOGIN</h2><label>Usuário<input name="usuario" value="olitech" required></label><label>Senha<input name="senha" type="password" required></label><div class="actions"><button>Entrar</button></div></form>
<!-- PATCH V12.1 CLIENT -->
<script>
document.addEventListener("DOMContentLoaded",function(){
  if(window.__V121__)return;window.__V121__=true;
  document.querySelectorAll(".v12-badge,.v121-badge").forEach(x=>x.remove());
  var bd=document.createElement("div");bd.className="v121-badge";bd.textContent="V12.1";document.body.appendChild(bd);

  if(location.pathname==="/config"){
    document.querySelectorAll("p,div,section,.card").forEach(function(el){
      var t=(el.textContent||"").toUpperCase();
      if(t.includes("LOGIN PADRÃO") || t.includes("OLITECH / 051309")){
        el.style.display="none";
      }
    });
    var main=document.querySelector("main,.container,.content")||document.body;
    var box=document.createElement("div");
    box.className="card v121-config-links";
    box.innerHTML='<h2>USUÁRIOS, PERMISSÕES E BACKUP</h2><a class="btn" href="/usuarios">👤 Usuários/Analistas</a> <a class="btn" href="/perfis">🔐 Perfis/Permissões</a> <a class="btn" href="/backup">💾 Backup/Restauração</a>';
    main.appendChild(box);
  }

  var nav=document.querySelector("nav,.menu,header");
  if(nav && !document.querySelector('a[href="/usuarios"]')){
    var a=document.createElement("a");a.href="/usuarios";a.className="btn small";a.textContent="USUÁRIOS";nav.appendChild(a);
  }
});
</script>
</body></html>`));
app.post('/login',(req,res)=>{const d=db();const u=up(req.body.usuario);const s=String(req.body.senha||'');const user=(d.usuarios||[]).find(x=>up(x.usuario||x.email||x.nome)===u&&String(x.senha)===s&&up(x.ativo||'SIM')!=='NÃO');if(user){req.session.user={id:user.id,nome:user.nome||user.usuario,usuario:user.usuario,perfil:user.perfil};res.redirect('/')}else res.send(`<script>alert('Usuário ou senha inválidos');location.href='/login'</script>`)});
app.get('/sair',(req,res)=>req.session.destroy(()=>res.redirect('/login')));
app.get('/',auth,(req,res)=>{const d=db();const user=up(req.session.user.nome);const lemb=(d.lembretes||[]).filter(l=>up(l.fixarInicio||'SIM')==='SIM'&&up(l.concluido)!=='SIM'&&(up(l.mostrarTodos)==='SIM'||up(l.analista||'TODOS')==='TODOS'||up(l.analista)===user));const meus=(d.chamados||[]).filter(c=>up(c.analista)===user&&up(c.status)!=='FINALIZADO');const sem=(d.chamados||[]).filter(c=>!c.analista&&up(c.status)!=='FINALIZADO');res.send(layout(req,'Início',`${lemb.length?`<section class="card"><h2>📌 Lembretes fixados</h2><div class="postits">${lemb.map(postit).join('')}</div></section>`:''}<section class="card"><h2>Ações rápidas</h2><div class="actions"><a class="btn" href="/chamados/novo">+ Criar chamado rápido</a><a class="btn secondary" href="/chamados/novo?completo=1">Abrir chamado completo</a><a class="btn secondary" href="/os/nova">Juntar chamados / Gerar OS</a><a class="btn secondary" href="/relatorios">Relatório por perfil</a></div></section>${tabelaChamados('Minha grid inicial',meus)}${tabelaChamados('Chamados sem analista definido',sem)}`))});
function postit(l){return `<div class="postit ${esc(l.cor||'amarelo')}"><h3>${esc(l.titulo)}</h3><div>📅 ${esc(l.data||'')}</div><div>${esc(l.descricao||'')}</div><div><b>Analista:</b> ${esc(l.analista||'TODOS')}</div><div class="links">${l.chamadoId?`<a class="btn small" href="/chamados/${l.chamadoId}/editar">Chamado</a>`:''}${l.preventivaId?`<a class="btn small" href="/preventivas/${l.preventivaId}/editar">Preventiva</a>`:''}<a class="btn small" href="/lembretes/${l.id}/editar">Lembrete</a></div></div>`}
function tabelaChamados(t,arr){return `<section class="card"><h2>${esc(t)}</h2><div class="table-wrap"><table class="table"><tr><th>Chamado</th><th>Loja</th><th>Aberto por</th><th>Analista</th><th>Serviço</th><th>Prioridade</th><th>Status</th><th>Data</th><th>Ações</th></tr>${arr.map(c=>`<tr><td>${esc(c.numeroInterno||c.id)}</td><td>${esc(c.lojaNome)}</td><td>${esc(c.abertoPor)}</td><td>${esc(c.analista||'SEM ANALISTA')}</td><td>${esc(c.tipoServico)}</td><td>${esc(c.prioridade)}</td><td>${esc(c.status)}</td><td>${esc(c.dataAbertura)}</td><td><a class="btn small" href="/chamados/${c.id}/editar">Abrir</a></td></tr>`).join('')}</table></div></section>`}
// LOJAS
app.get('/lojas',auth,(req,res)=>{const d=db(),q=req.query.q||'',show=req.query.show;const rows=show||q?(d.lojas||[]).filter(x=>match(x,q)):[];res.send(layout(req,'Lojas',`<div class="bar"><h2>Lojas</h2><a class="btn" href="/lojas/nova">+ Nova loja</a></div><form class="card"><div class="grid two"><input name="q" value="${esc(q)}" placeholder="Buscar loja, cidade, CNPJ, CEP"><button>🔎 Buscar</button></div><div class="actions"><a class="btn secondary" href="/lojas?show=1">Mostrar todos</a><a class="btn secondary" href="/lojas">Ocultar lista</a></div></form>${table('lojas',rows,['codigo','nome','cidade','uf','telefone'],x=>`<a class="btn small" href="/lojas/${x.id}/editar">Editar</a>` )}`))});
app.get(['/lojas/nova','/lojas/:id/editar'],auth,(req,res)=>{const d=db();const l=req.params.id?(d.lojas||[]).find(x=>String(x.id)===req.params.id)||{}:{};res.send(layout(req,l.id?'Editar loja':'Nova loja',`${filePdfBox()}<form method="post" action="/lojas/salvar" class="card">${formHidden(l.id)}<h2>Dados da loja</h2><div class="grid"><label>Código/Filial<input name="codigo" value="${esc(l.codigo||'')}"></label><label>Tipo código<select name="tipoCodigo">${['SOMENTE NÚMERO','COM SIGLA','NÚMERO DE TERCEIRO'].map(v=>opt(v,l.tipoCodigo)).join('')}</select></label><label>Nome loja<input name="nome" value="${esc(l.nome||'')}"></label><label>Responsável loja<input name="responsavel" value="${esc(l.responsavel||'')}"></label><label>CNPJ<input name="cnpj" value="${esc(l.cnpj||'')}" ${onlyNumFields()}></label><label>Telefone<input name="telefone" value="${esc(l.telefone||'')}" ${onlyNumFields()}></label><label>CEP<input name="cep" value="${esc(l.cep||'')}" ${onlyNumFields()}></label><label>Estado/UF<input name="uf" value="${esc(l.uf||l.estado||'')}"></label><label>Cidade<input name="cidade" value="${esc(l.cidade||'')}"></label><label>Endereço<input name="endereco" value="${esc(l.endereco||'')}"></label><label>Latitude<input name="latitude" value="${esc(l.latitude||'')}"></label><label>Longitude<input name="longitude" value="${esc(l.longitude||'')}"></label><label>Analista responsável<input list="analistas" name="analista" value="${esc(l.analista||'')}"></label><label>Proprietário<select name="proprietarioId"><option value="">Nenhum</option>${(d.proprietarios||[]).map(p=>`<option value="${p.id}" ${String(l.proprietarioId)==String(p.id)?'selected':''}>${esc(p.nome)}</option>`).join('')}</select></label><label>Feriado<select name="feriado">${['FECHADO','ABERTO'].map(v=>opt(v,l.feriado)).join('')}</select></label><label>Logo URL<input name="logoUrl" value="${esc(l.logoUrl||'')}"></label></div><details><summary>Horário funcionamento</summary><div class="grid three"><label>Seg-Sex início<input name="segSexInicio" value="${esc(l.segSexInicio||'')}"></label><label>Seg-Sex fim<input name="segSexFim" value="${esc(l.segSexFim||'')}"></label><label>Sábado início<input name="sabadoInicio" value="${esc(l.sabadoInicio||'')}"></label><label>Sábado fim<input name="sabadoFim" value="${esc(l.sabadoFim||'')}"></label><label>Domingo início<input name="domingoInicio" value="${esc(l.domingoInicio||'')}"></label><label>Domingo fim<input name="domingoFim" value="${esc(l.domingoFim||'')}"></label></div></details><div class="actions"><button type="button" class="cepBtn">🔎 Buscar CEP</button><button type="button" class="cnpjBtn">🔎 Buscar CNPJ</button><button type="button" onclick="openModal('propModal')">+ Proprietário</button><button type="button" onclick="gerarLocalizacao()">📍 Gerar localização</button></div>${actions('/lojas')}</form>${datalistAnalistas(d)}${modalProp()}`))});
app.post('/lojas/salvar',auth,(req,res)=>{const d=db();d.lojas=d.lojas||[];let b=req.body,obj;if(b.id){let i=d.lojas.findIndex(x=>String(x.id)===String(b.id));if(i>=0){obj=d.lojas[i]={...d.lojas[i],...b,id:Number(b.id),nome:up(b.nome),cnpj:dig(b.cnpj),cep:dig(b.cep),telefone:dig(b.telefone),uf:up(b.uf),cidade:up(b.cidade),endereco:up(b.endereco)}}}if(!obj){obj={...b,id:next(d.config,'proximaLoja'),codigo:b.codigo||d.config.proximaLoja,nome:up(b.nome),cnpj:dig(b.cnpj),cep:dig(b.cep),telefone:dig(b.telefone),uf:up(b.uf),cidade:up(b.cidade),endereco:up(b.endereco),criadoEm:new Date().toISOString()};d.lojas.push(obj)}save(d);res.redirect('/lojas?show=1')});
// PRESTADORES
app.get('/prestadores',auth,(req,res)=>{const d=db(),q=req.query.q||'',show=req.query.show;const rows=show||q?(d.prestadores||[]).filter(x=>match(x,q)):[];res.send(layout(req,'Prestadores',`<div class="bar"><h2>Prestadores</h2><a class="btn" href="/prestadores/novo">+ Novo prestador</a></div><form class="card"><div class="grid two"><input name="q" value="${esc(q)}" placeholder="Buscar prestador, serviço, cidade"><button>🔎 Buscar</button></div><div class="actions"><a class="btn secondary" href="/prestadores?show=1">Mostrar todos</a><a class="btn secondary" href="/prestadores">Ocultar lista</a></div></form>${table('prestadores',rows,['empresa','responsavel','cidade','uf','telefone','servicos'],x=>`<a class="btn small" href="/prestadores/${x.id}/editar">Editar</a>` )}`))});
app.get(['/prestadores/novo','/prestadores/:id/editar'],auth,(req,res)=>{const d=db();const p=req.params.id?(d.prestadores||[]).find(x=>String(x.id)===req.params.id)||{}:{};res.send(layout(req,p.id?'Editar prestador':'Novo prestador',`${filePdfBox()}<form method="post" action="/prestadores/salvar" class="card">${formHidden(p.id)}<h2>Dados do prestador</h2><div class="grid"><label>Empresa<input name="empresa" value="${esc(p.empresa||'')}"></label><label>Nome responsável<input name="responsavel" value="${esc(p.responsavel||'')}"></label><label>Telefone<input name="telefone" value="${esc(p.telefone||'')}" ${onlyNumFields()}></label><label>Email<input name="email" value="${esc(p.email||'')}"></label><label>CNPJ<input name="cnpj" value="${esc(p.cnpj||'')}" ${onlyNumFields()}></label><label>CPF<input name="cpf" value="${esc(p.cpf||'')}" ${onlyNumFields()}></label><label>CPF/CNH<input name="cpfCnh" value="${esc(p.cpfCnh||'')}" ${onlyNumFields()}></label><label>CEP<input name="cep" value="${esc(p.cep||'')}" ${onlyNumFields()}></label><label>Estado/UF<input name="uf" value="${esc(p.uf||'')}"></label><label>Cidade<input name="cidade" value="${esc(p.cidade||'')}"></label><label>Endereço<input name="endereco" value="${esc(p.endereco||'')}"></label><label>Ativo<select name="ativo">${['SIM','NÃO'].map(v=>opt(v,p.ativo)).join('')}</select></label></div><details><summary>🚚 Logística de atendimento</summary><div class="grid"><label>Raio KM<input name="raioKm" value="${esc(p.raioKm||'')}"></label><label>Valor por KM<input name="valorKm" value="${esc(p.valorKm||'')}"></label><label>Latitude<input name="latitude" value="${esc(p.latitude||'')}"></label><label>Longitude<input name="longitude" value="${esc(p.longitude||'')}"></label></div></details><details open><summary>Serviços realizados</summary><input placeholder="Pesquisar serviço..." oninput="filtrarChecks(this)"><div class="grid three checks">${listaServicos(d,p.servicos)}</div></details><details><summary>Pagamento</summary><div class="grid"><label>Tipo pagamento<select name="tipoPagamento">${(d.tiposPagamento||[]).map(v=>opt(v,p.tipoPagamento)).join('')}</select></label><label>Dados pagamento / chave PIX<input name="dadosPagamento" value="${esc(p.dadosPagamento||'')}"></label><label>Nome favorecido<input name="favorecido" value="${esc(p.favorecido||'')}"></label></div></details><div class="actions"><button type="button" class="cepBtn">🔎 Buscar CEP</button><button type="button" class="cnpjBtn">🔎 Buscar CNPJ</button><button type="button" class="cpfBtn">🔎 Validar CPF</button></div>${actions('/prestadores')}</form>`))});
app.post('/prestadores/salvar',auth,(req,res)=>{const d=db();d.prestadores=d.prestadores||[];let b=req.body;b.servicos=Array.isArray(b.servicos)?b.servicos:(b.servicos?[b.servicos]:[]);let obj;if(b.id){let i=d.prestadores.findIndex(x=>String(x.id)===String(b.id));if(i>=0)obj=d.prestadores[i]={...d.prestadores[i],...b,id:Number(b.id),empresa:up(b.empresa),responsavel:up(b.responsavel),cidade:up(b.cidade),uf:up(b.uf),endereco:up(b.endereco),cnpj:dig(b.cnpj),cpf:dig(b.cpf),cep:dig(b.cep),telefone:dig(b.telefone)}}if(!obj){obj={...b,id:next(d.config,'proximoPrestador'),empresa:up(b.empresa),responsavel:up(b.responsavel),cidade:up(b.cidade),uf:up(b.uf),endereco:up(b.endereco),cnpj:dig(b.cnpj),cpf:dig(b.cpf),cep:dig(b.cep),telefone:dig(b.telefone)};d.prestadores.push(obj)}save(d);res.redirect('/prestadores?show=1')});
// PROPRIETARIOS
app.get('/proprietarios',auth,(req,res)=>{const d=db(),q=req.query.q||'',show=req.query.show;const rows=show||q?(d.proprietarios||[]).filter(x=>match(x,q)):[];res.send(layout(req,'Proprietários',`<div class="bar"><h2>Proprietários</h2><a class="btn" href="/proprietarios/novo">+ Novo proprietário</a></div><form class="card"><div class="grid two"><input name="q" value="${esc(q)}" placeholder="Buscar proprietário"><button>🔎 Buscar</button></div><div class="actions"><a class="btn secondary" href="/proprietarios?show=1">Mostrar todos</a></div></form>${table('proprietarios',rows,['nome','documento','cidade','uf','telefone'],x=>`<a class="btn small" href="/proprietarios/${x.id}/editar">Editar</a>` )}`))});
app.get(['/proprietarios/novo','/proprietarios/:id/editar'],auth,(req,res)=>{const d=db();const p=req.params.id?(d.proprietarios||[]).find(x=>String(x.id)===req.params.id)||{}:{};res.send(layout(req,p.id?'Editar proprietário':'Novo proprietário',`${filePdfBox()}<form method="post" action="/proprietarios/salvar" class="card">${formHidden(p.id)}<div class="grid"><label>Nome<input name="nome" value="${esc(p.nome||'')}"></label><label>CPF<input name="cpf" value="${esc(p.cpf||'')}" ${onlyNumFields()}></label><label>CNPJ<input name="cnpj" value="${esc(p.cnpj||'')}" ${onlyNumFields()}></label><label>Telefone<input name="telefone" value="${esc(p.telefone||'')}" ${onlyNumFields()}></label><label>Email<input name="email" value="${esc(p.email||'')}"></label><label>CEP<input name="cep" value="${esc(p.cep||'')}" ${onlyNumFields()}></label><label>UF<input name="uf" value="${esc(p.uf||'')}"></label><label>Cidade<input name="cidade" value="${esc(p.cidade||'')}"></label><label>Endereço<input name="endereco" value="${esc(p.endereco||'')}"></label><label>Dados pagamento<input name="dadosPagamento" value="${esc(p.dadosPagamento||'')}"></label></div><div class="actions"><button type="button" class="cepBtn">Buscar CEP</button><button type="button" class="cnpjBtn">Buscar CNPJ</button><button type="button" class="cpfBtn">Validar CPF</button></div>${actions('/proprietarios')}</form>`))});
app.post('/proprietarios/salvar',auth,(req,res)=>{const d=db();d.proprietarios=d.proprietarios||[];let b=req.body;let obj;if(b.id){let i=d.proprietarios.findIndex(x=>String(x.id)===String(b.id));if(i>=0)obj=d.proprietarios[i]={...d.proprietarios[i],...b,id:Number(b.id),nome:up(b.nome),documento:dig(b.cpf||b.cnpj),cpf:dig(b.cpf),cnpj:dig(b.cnpj),cep:dig(b.cep),telefone:dig(b.telefone),uf:up(b.uf),cidade:up(b.cidade),endereco:up(b.endereco)}}if(!obj){obj={...b,id:next(d.config,'proximoProprietario'),nome:up(b.nome),documento:dig(b.cpf||b.cnpj),cpf:dig(b.cpf),cnpj:dig(b.cnpj),cep:dig(b.cep),telefone:dig(b.telefone),uf:up(b.uf),cidade:up(b.cidade),endereco:up(b.endereco)};d.proprietarios.push(obj)}save(d);res.redirect('/proprietarios?show=1')});
function table(tipo,rows,cols,act){return `<section class="card"><div class="table-wrap"><table class="table"><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}<th>Ações</th></tr>${rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(Array.isArray(r[c])?r[c].join(', '):r[c]||'')}</td>`).join('')}<td>${act(r)}</td></tr>`).join('')||`<tr><td colspan="${cols.length+1}">Nenhum registro.</td></tr>`}</table></div></section>`}
// CHAMADOS
app.get('/chamados',auth,(req,res)=>{const d=db(),q=req.query.q||'',show=req.query.show;const rows=show||q?(d.chamados||[]).filter(x=>match(x,q)):[];res.send(layout(req,'Chamados',`<div class="bar"><h2>Chamados</h2><div><a class="btn" href="/chamados/novo">+ Novo chamado</a><a class="btn secondary" href="/os/nova">Juntar / Gerar OS</a></div></div><form class="card"><div class="grid"><input name="q" value="${esc(q)}" placeholder="Número, loja, analista, prestador"><select name="status"><option>TODOS</option><option>ABERTOS</option><option>AGUARDANDO</option><option>EM ANDAMENTO</option><option>FINALIZADO</option></select><button>Buscar</button><a class="btn secondary" href="/chamados?show=1">Mostrar todos</a></div></form>${tabelaChamados('Resultado',rows)}`))});
app.get(['/chamados/novo','/chamados/:id/editar'],auth,(req,res)=>{const d=db();const c=req.params.id?(d.chamados||[]).find(x=>String(x.id)===req.params.id)||{}:{};res.send(layout(req,c.id?'Editar chamado':'Novo chamado',`<form method="post" action="/chamados/salvar" class="card">${formHidden(c.id)}<div class="grid"><label>Tipo número<select name="tipoNumero">${['AUTOMÁTICO','TERCEIRO'].map(v=>opt(v,c.tipoNumero)).join('')}</select></label><label>Nº chamado terceiro<input name="numeroExterno" value="${esc(c.numeroExterno||'')}" ${onlyNumFields()}></label><label>Loja<input list="lojasList" name="lojaNome" value="${esc(c.lojaNome||'')}"></label><label>Analista<input list="analistas" name="analista" value="${esc(c.analista||'')}"></label><label>Prestador<input list="prestadoresList" name="prestadorNome" value="${esc(c.prestadorNome||'')}"></label><label>Tipo serviço<input list="servicosList" name="tipoServico" value="${esc(c.tipoServico||'A DEFINIR')}"></label><label>Prioridade<select name="prioridade">${['MÍNIMA','MÉDIA','MÁXIMA'].map(v=>opt(v,c.prioridade)).join('')}</select></label><label>Status<select name="status">${['AGUARDANDO','EM ANDAMENTO','AGUARDANDO APROVAÇÃO','ORÇAMENTO FEITO','FINALIZADO','CANCELADO'].map(v=>opt(v,c.status)).join('')}</select></label><label>Valor serviço<input name="valor" value="${esc(c.valor||0)}"></label><label>Data orçamento<input type="date" name="dataOrcamento" value="${esc(c.dataOrcamento||'')}"></label><label>Data agendada<input type="date" name="dataAgendada" value="${esc(c.dataAgendada||'')}"></label><label>Data abertura<input type="date" name="dataAbertura" value="${esc(c.dataAbertura||today())}"></label></div><label>Descrição serviços<textarea name="descricao">${esc(c.descricao||'')}</textarea></label><label>Observações<textarea name="observacoes">${esc(c.observacoes||'')}</textarea></label>${actions('/chamados')}</form>${dataLists(d)}`))});
app.post('/chamados/salvar',auth,(req,res)=>{const d=db();d.chamados=d.chamados||[];let b=req.body;let loja=(d.lojas||[]).find(l=>up(l.nome)==up(b.lojaNome));let prest=(d.prestadores||[]).find(p=>up(p.empresa)==up(b.prestadorNome)||up(p.responsavel)==up(b.prestadorNome));let obj;if(b.id){let i=d.chamados.findIndex(x=>String(x.id)===String(b.id));if(i>=0)obj=d.chamados[i]={...d.chamados[i],...b,id:Number(b.id),lojaId:loja?.id||d.chamados[i].lojaId,prestadorId:prest?.id||d.chamados[i].prestadorId,lojaNome:up(b.lojaNome),prestadorNome:up(b.prestadorNome),tipoServico:up(b.tipoServico),status:up(b.status),prioridade:up(b.prioridade),descricao:up(b.descricao),valor:Number(String(b.valor||0).replace(',','.'))||0}}if(!obj){const id=next(d.config,'proximoChamado');obj={...b,id,numeroInterno:b.tipoNumero==='TERCEIRO'&&b.numeroExterno?dig(b.numeroExterno):id,lojaId:loja?.id||'',prestadorId:prest?.id||'',lojaNome:up(b.lojaNome),prestadorNome:up(b.prestadorNome),tipoServico:up(b.tipoServico),status:up(b.status||'AGUARDANDO'),prioridade:up(b.prioridade||'MÉDIA'),descricao:up(b.descricao),valor:Number(String(b.valor||0).replace(',','.'))||0,abertoPor:req.session.user.nome,criadoEm:new Date().toISOString()};d.chamados.push(obj)}save(d);res.redirect('/chamados?show=1')});
// OS impressão
app.get('/os',auth,(req,res)=>{const d=db();res.send(layout(req,'Ordens de Serviço',`<div class="bar"><h2>Ordens de Serviço</h2><a class="btn" href="/os/nova">+ Gerar OS</a></div>${table('ordens',d.ordens||[],['numero','lojaNome','prestadorNome','referencia','valorTotal','data'],o=>`<a class="btn small" href="/os/${o.id}">Imprimir</a>`)}`))});
app.get('/os/nova',auth,(req,res)=>{const d=db();const abertos=(d.chamados||[]).filter(c=>!['FINALIZADO','CANCELADO'].includes(up(c.status)));const grupos={};abertos.forEach(c=>{const k=`${c.lojaNome}|${c.prestadorNome}`;if(!grupos[k])grupos[k]=[];grupos[k].push(c)});res.send(layout(req,'Gerar O.S.',`<form method="post" action="/os/gerar" class="card"><h2>Juntar chamados / Gerar O.S.</h2><p class="hint">Selecione chamados da mesma loja e mesmo prestador. A OS é uma impressão/termo; a baixa continua nos chamados.</p><input placeholder="Pesquisar chamados..." oninput="filtrarLinhas(this)"><div class="table-wrap"><table class="table"><tr><th></th><th>Chamado</th><th>Loja</th><th>Prestador</th><th>Descrição</th><th>Valor</th></tr>${Object.values(grupos).flat().map(c=>`<tr><td><input type="checkbox" name="ids" value="${c.id}"></td><td>${esc(c.numeroInterno||c.id)}</td><td>${esc(c.lojaNome)}</td><td>${esc(c.prestadorNome)}</td><td>${esc(c.descricao)}</td><td>${money(c.valor)}</td></tr>`).join('')}</table></div><div class="actions"><button>Gerar O.S.</button></div></form>`))});
app.post('/os/gerar',auth,(req,res)=>{const d=db();let ids=Array.isArray(req.body.ids)?req.body.ids:(req.body.ids?[req.body.ids]:[]);let ch=(d.chamados||[]).filter(c=>ids.includes(String(c.id)));if(!ch.length)return res.send(`<script>alert('Selecione chamados');history.back()</script>`);let loja=ch[0].lojaNome,prest=ch[0].prestadorNome;if(ch.some(c=>c.lojaNome!==loja||c.prestadorNome!==prest))return res.send(`<script>alert('Só é permitido juntar mesma loja e mesmo prestador');history.back()</script>`);const id=next(d.config,'proximaOS');const referencia=Math.min(...ch.map(c=>Number(c.numeroInterno||c.id)||c.id));const os={id,numero:id,referencia,lojaNome:loja,prestadorNome:prest,chamados:ch.map(c=>c.id),valorTotal:ch.reduce((s,c)=>s+Number(c.valor||0),0),data:today()};d.ordens=d.ordens||[];d.ordens.push(os);ch.forEach(c=>{c.osId=id;c.osReferencia=referencia});save(d);res.redirect('/os/'+id)});
app.get('/os/:id',auth,(req,res)=>{const d=db();const os=(d.ordens||[]).find(o=>String(o.id)===req.params.id);if(!os)return res.status(404).send('OS não encontrada');const ch=(d.chamados||[]).filter(c=>os.chamados.includes(c.id));const loja=(d.lojas||[]).find(l=>up(l.nome)==up(os.lojaNome))||{};const prest=(d.prestadores||[]).find(p=>up(p.empresa)==up(os.prestadorNome)||up(p.responsavel)==up(os.prestadorNome))||{};res.send(layout(req,'O.S. '+os.referencia,`<div class="actions"><button onclick="print()">Imprimir</button><a class="btn secondary" href="/os">Voltar</a></div><section class="os-page"><div style="display:flex;justify-content:space-between;align-items:center"><div>${loja.logoUrl?`<img class="os-logo" src="${esc(loja.logoUrl)}">`:''}</div><div class="os-title">ORDEM DE SERVIÇO</div></div><h2>Nº: ${esc(os.referencia)}</h2><div class="os-section"><b>DADOS DO REQUERENTE</b><div class="os-row"><div><b>LOJA:</b> ${esc(os.lojaNome)}</div><div><b>TELEFONE:</b> ${esc(loja.telefone)}</div><div><b>ENDEREÇO:</b> ${esc(loja.endereco)}</div><div><b>CIDADE:</b> ${esc(cidadeUf(loja))}</div><div><b>CNPJ:</b> ${esc(loja.cnpj)}</div><div><b>CEP:</b> ${esc(loja.cep)}</div><div><b>HORÁRIO:</b> ${esc(loja.segSexInicio||'')} ${esc(loja.segSexFim||'')}</div></div></div><div class="os-section"><b>DETALHES DA ORDEM DE SERVIÇO</b><p><b>TÍTULO:</b> MANUTENÇÃO</p><p><b>ATRIBUÍDA:</b> ${esc(ch[0]?.analista||'')}</p><p><b>DESCRIÇÃO:</b></p>${ch.map(c=>`<p>• ${esc(c.numeroInterno||c.id)} - ${esc(c.tipoServico)} - ${esc(c.descricao)} - ${money(c.valor)}</p>`).join('')}<p><b>TOTAL:</b> ${money(os.valorTotal)}</p></div><div class="os-section"><b>PRESTADOR DE SERVIÇO</b><div class="os-row"><div><b>EMPRESA:</b> ${esc(prest.empresa||os.prestadorNome)}</div><div><b>CNPJ:</b> ${esc(prest.cnpj)}</div><div><b>NOME:</b> ${esc(prest.responsavel)}</div><div><b>TELEFONE:</b> ${esc(prest.telefone)}</div><div><b>CPF/CNH:</b> ${esc(prest.cpfCnh||prest.cpf)}</div></div></div><div class="os-section"><b>TERMO DE RESPONSABILIDADE</b><p>O prestador declara estar ciente de que é de sua responsabilidade utilizar todos os EPIs necessários para execução segura dos serviços e seguir normas de segurança.</p></div><div class="os-row"><div><div class="sign"></div><b>PRESTADOR</b></div><div><div class="sign"></div><b>RESPONSÁVEL DA LOJA</b></div></div><small>Gerado por: ${esc(req.session.user.nome)} - ${new Date().toLocaleString('pt-BR')}</small></section>`))});
// LEMBRETES
app.get('/lembretes',auth,(req,res)=>{const d=db(),q=req.query.q||'';let rows=(d.lembretes||[]).filter(x=>match(x,q));res.send(layout(req,'Lembretes',`<div class="bar"><h2>Lembretes / Post-it</h2><a class="btn" href="/lembretes/novo">+ Novo lembrete</a></div><form class="card"><div class="grid two"><input name="q" value="${esc(q)}" placeholder="Pesquisar lembrete"><button>Buscar</button></div></form><div class="postits">${rows.map(postit).join('')}</div>`))});
app.get(['/lembretes/novo','/lembretes/:id/editar'],auth,(req,res)=>{const d=db();const l=req.params.id?(d.lembretes||[]).find(x=>String(x.id)===req.params.id)||{}:{};res.send(layout(req,l.id?'Editar lembrete':'Novo lembrete',`<form method="post" action="/lembretes/salvar" class="card">${formHidden(l.id)}<div class="grid"><label>Título<input name="titulo" value="${esc(l.titulo||'')}"></label><label>Data<input type="date" name="data" value="${esc(l.data||today())}"></label><label>Hora<input type="time" name="hora" value="${esc(l.hora||'09:00')}"></label><label>Som<select name="som">${['BIPE','DIGITAL','SIRENE','SUAVE','DUPLO','SEM'].map(v=>opt(v,l.som)).join('')}</select></label><label>Analista<input list="analistas" name="analista" value="${esc(l.analista||'TODOS')}"></label><label>Mostrar para todos<select name="mostrarTodos">${['SIM','NÃO'].map(v=>opt(v,l.mostrarTodos)).join('')}</select></label><label>Cor<select name="cor">${['AMARELO','VERMELHO','AZUL','VERDE'].map(v=>opt(v,l.cor)).join('')}</select></label><label>Fixar inicial<select name="fixarInicio">${['SIM','NÃO'].map(v=>opt(v,l.fixarInicio)).join('')}</select></label><label>Chamado<select name="chamadoId"><option value="">Nenhum</option>${(d.chamados||[]).map(c=>`<option value="${c.id}" ${String(l.chamadoId)==String(c.id)?'selected':''}>${esc(c.numeroInterno||c.id)} - ${esc(c.lojaNome)}</option>`).join('')}</select></label><label>Preventiva<select name="preventivaId"><option value="">Nenhuma</option>${(d.preventivas||[]).map(p=>`<option value="${p.id}" ${String(l.preventivaId)==String(p.id)?'selected':''}>${esc(p.lojaNome)} - ${esc(p.tipo)}</option>`).join('')}</select></label></div><label>Descrição<textarea name="descricao">${esc(l.descricao||'')}</textarea></label>${actions('/lembretes')}</form>${datalistAnalistas(d)}`))});
app.post('/lembretes/salvar',auth,(req,res)=>{const d=db();d.lembretes=d.lembretes||[];let b=req.body,obj;if(b.id){let i=d.lembretes.findIndex(x=>String(x.id)===String(b.id));if(i>=0)obj=d.lembretes[i]={...d.lembretes[i],...b,id:Number(b.id)}}if(!obj){obj={...b,id:next(d.config,'proximoLembrete'),concluido:'NÃO'};d.lembretes.push(obj)}save(d);res.redirect('/lembretes')});
app.post('/api/lembrete/:id/:acao',auth,(req,res)=>{const d=db();let l=(d.lembretes||[]).find(x=>String(x.id)===req.params.id);if(l){if(req.params.acao==='concluir')l.concluido='SIM';else l._silenciadoHoje=today();save(d)}res.json({ok:true})});
app.get('/api/lembretes-alarme',auth,(req,res)=>{const d=db();const hm=new Date().toTimeString().slice(0,5);const user=up(req.session.user.nome);const rows=(d.lembretes||[]).filter(l=>up(l.concluido)!=='SIM'&&l.data===today()&&String(l.hora||'09:00')<=hm&&l._silenciadoHoje!==today()&&(up(l.mostrarTodos)==='SIM'||up(l.analista||'TODOS')==='TODOS'||up(l.analista)===user));res.json({ok:true,lembretes:rows.slice(0,3)})});
// PREVENTIVAS
app.get('/preventivas',auth,(req,res)=>{const d=db();res.send(layout(req,'Preventivas',`<div class="bar"><h2>Preventivas</h2><a class="btn" href="/preventivas/nova">+ Nova preventiva</a></div>${table('preventivas',d.preventivas||[],['lojaNome','tipo','prestadorNome','ultimaData','proximaData','valor'],p=>`<a class="btn small" href="/preventivas/${p.id}/editar">Editar</a>`)}`))});
app.get(['/preventivas/nova','/preventivas/:id/editar'],auth,(req,res)=>{const d=db();const p=req.params.id?(d.preventivas||[]).find(x=>String(x.id)===req.params.id)||{}:{};res.send(layout(req,'Preventiva',`<form method="post" action="/preventivas/salvar" class="card">${formHidden(p.id)}<div class="grid"><label>Loja<input list="lojasList" name="lojaNome" value="${esc(p.lojaNome||'')}"></label><label>Tipo<input name="tipo" value="${esc(p.tipo||'')}"></label><label>Prestador<input list="prestadoresList" name="prestadorNome" value="${esc(p.prestadorNome||'')}"></label><label>Última data<input type="date" name="ultimaData" value="${esc(p.ultimaData||'')}"></label><label>Próxima data<input type="date" name="proximaData" value="${esc(p.proximaData||'')}"></label><label>Lembrar dias antes<input name="diasAntes" value="${esc(p.diasAntes||7)}"></label><label>Valor<input name="valor" value="${esc(p.valor||0)}"></label></div>${actions('/preventivas')}</form>${dataLists(d)}`))});
app.post('/preventivas/salvar',auth,(req,res)=>{const d=db();d.preventivas=d.preventivas||[];let b=req.body,obj;if(b.id){let i=d.preventivas.findIndex(x=>String(x.id)===String(b.id));if(i>=0)obj=d.preventivas[i]={...d.preventivas[i],...b,id:Number(b.id),lojaNome:up(b.lojaNome),prestadorNome:up(b.prestadorNome),tipo:up(b.tipo)}}if(!obj){obj={...b,id:next(d.config,'proximaPreventiva'),lojaNome:up(b.lojaNome),prestadorNome:up(b.prestadorNome),tipo:up(b.tipo)};d.preventivas.push(obj)}if(b.proximaData){d.lembretes=d.lembretes||[];let dt=new Date(b.proximaData);dt.setDate(dt.getDate()-Number(b.diasAntes||7));d.lembretes.push({id:next(d.config,'proximoLembrete'),titulo:'PREVENTIVA '+up(b.tipo),data:dt.toISOString().slice(0,10),hora:'09:00',som:'BIPE',analista:'TODOS',mostrarTodos:'SIM',cor:'AMARELO',fixarInicio:'SIM',preventivaId:obj.id,descricao:'PREVENTIVA DA LOJA '+up(b.lojaNome),concluido:'NÃO'})}save(d);res.redirect('/preventivas')});
// IMPORTAÇÃO XLSX
app.get('/importar-planilha',auth,(req,res)=>{const d=db();res.send(layout(req,'Importar planilha',`<form method="post" enctype="multipart/form-data" action="/importar-planilha" class="card importForm"><h2>Importar planilha</h2><label>Analista responsável<input list="analistas" name="analista" value="${esc(req.session.user.nome)}"></label><label>Arquivo Excel<input type="file" name="arquivo" accept=".xlsx,.xls" required></label><div class="actions"><button>Importar agora</button></div></form>${datalistAnalistas(d)}`))});
app.post('/importar-planilha',auth,upload.single('arquivo'),(req,res)=>{try{const d=db();const wb=XLSX.readFile(req.file.path,{cellDates:true,cellStyles:true});const ws=wb.Sheets['CHAMADOS']||wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});let headerIndex=rows.findIndex(r=>r.map(x=>up(x)).includes('LOJA')&&r.map(x=>up(x)).some(x=>x.includes('DESCRI')));if(headerIndex<0)headerIndex=1;const headers=rows[headerIndex].map(x=>up(x));const idx=n=>headers.findIndex(h=>h.includes(n));const iLoja=idx('LOJA'),iNum=idx('NUMERO')>=0?idx('NUMERO'):idx('NÚMERO'),iData=idx('DATA'),iDesc=idx('DESCRI'),iPrest=idx('PRESTADOR'),iTel=idx('TELEFONE'),iVal=idx('VALOR'),iAgenda=idx('AGENDADO');let imp=0,lojas=0,prest=0;d.lojas=d.lojas||[];d.prestadores=d.prestadores||[];d.chamados=d.chamados||[];for(let r of rows.slice(headerIndex+1)){let loja=up(r[iLoja]);let desc=up(r[iDesc]);if(!loja||!desc||loja.includes('TOTAL')||loja.includes('GASTOS'))continue;let pnome=up(r[iPrest]);let l=d.lojas.find(x=>up(x.nome)===loja);if(!l){l={id:next(d.config,'proximaLoja'),codigo:d.config.proximaLoja,nome:loja,cidade:'',uf:''};d.lojas.push(l);lojas++}let p=null;if(pnome){p=d.prestadores.find(x=>up(x.empresa)===pnome||up(x.responsavel)===pnome);if(!p){p={id:next(d.config,'proximoPrestador'),empresa:pnome,responsavel:pnome,telefone:dig(r[iTel]),servicos:[]};d.prestadores.push(p);prest++}}let val=Number(String(r[iVal]||0).replace(/[R$\s.]/g,'').replace(',','.'))||0;d.chamados.push({id:next(d.config,'proximoChamado'),numeroInterno:dig(r[iNum])||d.config.proximoChamado,lojaId:l.id,lojaNome:loja,prestadorId:p?.id||'',prestadorNome:pnome,tipoServico:'IMPORTADO',descricao:desc,telefone:dig(r[iTel]),valor:val,status:'AGUARDANDO',prioridade:up(r[idx('PRIOR')])||'MÉDIA',analista:up(req.body.analista),dataAbertura:excelDate(r[iData]),dataAgendada:excelDate(r[iAgenda]),abertoPor:req.session.user.nome});imp++}save(d);res.send(layout(req,'Importação concluída',`<section class="card"><h2>Importação concluída</h2><p>Lojas criadas: <b>${lojas}</b></p><p>Prestadores criados: <b>${prest}</b></p><p>Chamados importados: <b>${imp}</b></p><div class="actions"><a class="btn" href="/chamados?show=1">Ver chamados</a><a class="btn secondary" href="/importar-planilha">Importar outra</a></div></section>`))}catch(e){console.error(e);res.status(500).send(layout(req,'Erro importação',`<section class="card"><h2>Erro ao importar</h2><p>${esc(e.message)}</p><a class="btn" href="/importar-planilha">Voltar</a></section>`))}});
function excelDate(v){if(!v)return today();if(v instanceof Date)return v.toISOString().slice(0,10);return String(v).slice(0,10)}
// PONTO/HORAS
app.get('/ponto-horas',auth,(req,res)=>{const d=db();res.send(layout(req,'Ponto/Horas',`<div class="bar"><h2>Ponto / Horas extras</h2></div><form class="card" method="post" action="/ponto-horas"><div class="grid"><label>Usuário<input list="analistas" name="usuario" value="${esc(req.session.user.nome)}"></label><label>Data<input type="date" name="data" value="${today()}"></label><label>Início hora extra<input type="time" name="inicio"></label><label>Final hora extra<input type="time" name="fim"></label><label>Observação<input name="obs"></label></div><button>Salvar ponto</button></form>${table('pontos',d.pontos||[],['usuario','data','inicio','fim','obs'],()=> '')}${datalistAnalistas(d)}`))});
app.post('/ponto-horas',auth,(req,res)=>{const d=db();d.pontos=d.pontos||[];d.pontos.push({id:next(d.config,'proximoPonto'),...req.body,usuario:up(req.body.usuario)});save(d);res.redirect('/ponto-horas')});
// CONFIG
app.get('/config',auth,(req,res)=>{const d=db(),c=d.config;res.send(layout(req,'Config',`<form class="card" method="post" action="/config"><h2>Configurações</h2><div class="grid"><label>Nome sistema<input name="nomeSistema" value="${esc(c.nomeSistema)}"></label><label>Subtítulo<input name="subtitulo" value="${esc(c.subtitulo)}"></label><label>Tema de cor<select name="temaCor">${[['#2563eb','AZUL'],['#16a34a','VERDE'],['#7c3aed','ROXO'],['#dc2626','VERMELHO'],['#f97316','LARANJA'],['#111827','PRETO']].map(([v,t])=>`<option value="${v}" ${c.temaCor===v?'selected':''}>${t}</option>`).join('')}</select></label><label>Logo URL<input name="logoUrl" value="${esc(c.logoUrl||'')}"></label></div><button>Salvar</button></form><section class="card"><h2>Usuários</h2><p>Login padrão: <b>olitech / 051309</b></p></section>`))});
app.post('/config',auth,(req,res)=>{const d=db();d.config={...d.config,...req.body};save(d);res.redirect('/config')});
// API PDF/CEP/CNPJ
app.post('/api/pdf-cadastro',auth,upload.single('pdf'),async(req,res)=>{try{if(!req.file)return res.json({ok:false,erro:'Envie um PDF'});const buf=fs.readFileSync(req.file.path);const parsed=await pdfParse(buf);const text=String(parsed.text||'').replace(/\r/g,'\n');const cnpj=(text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)||[''])[0];const cep=(text.match(/\d{2}\.?\d{3}-?\d{3}/)||[''])[0];const telefone=(text.match(/(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/)||[''])[0];const ufm=text.match(/(?:UF|ESTADO)\s*[:\-]?\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i)||text.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);const uf=ufm?ufm[1].toUpperCase():'';const line=lab=>{const m=text.match(new RegExp(lab+'\\s*[:\\-]?\\s*([^\\n]+)','i'));return m?m[1].trim():''};let cidade=cleanStop(line('MUNIC[IÍ]PIO')||line('CIDADE'));let endereco=cleanStop(line('LOGRADOURO')||line('ENDERE[ÇC]O'));let nome=cleanStop(line('T[IÍ]TULO DO ESTABELECIMENTO')||line('NOME FANTASIA')||line('NOME EMPRESARIAL')||line('RAZ[AÃ]O SOCIAL'));if(!nome||/NOME DE FANTASIA|TITULO DO ESTABELECIMENTO/i.test(nome))nome=cleanStop(line('NOME EMPRESARIAL')||line('RAZ[AÃ]O SOCIAL'));nome=up(nome);if(nome.includes('MEGA')&&(nome.includes('VEST')||nome.includes('CASA')))nome='MEGA VEST CASA';if(cidade&&!nome.includes(up(cidade)))nome=(nome||'LOJA')+' '+up(cidade);if(uf&&!nome.endsWith(' '+uf))nome+=' '+uf;res.json({ok:true,nome,cnpj:dig(cnpj),cep:dig(cep),telefone:dig(telefone),uf,cidade:up(cidade),endereco:up(endereco)})}catch(e){res.json({ok:false,erro:e.message})}});
function cleanStop(v){return String(v||'').split(/CNPJ|CEP|ENDERE[ÇC]O|LOGRADOURO|MUNIC[IÍ]PIO|CIDADE|UF|TELEFONE|BAIRRO|N[ÚU]MERO/i)[0].replace(/[()]/g,'').replace(/\s+/g,' ').trim()}
app.get('/api/cep/:cep',auth,async(req,res)=>{try{let cep=dig(req.params.cep);if(cep.length!==8)return res.json({ok:false,erro:'CEP inválido'});let r=await fetch(`https://viacep.com.br/ws/${cep}/json/`);let j=await r.json();if(j.erro)return res.json({ok:false,erro:'CEP não encontrado'});res.json({ok:true,cep,uf:j.uf,cidade:up(j.localidade),bairro:up(j.bairro),endereco:up(j.logradouro)})}catch(e){res.json({ok:false,erro:e.message})}});
app.get('/api/cnpj/:cnpj',auth,async(req,res)=>{try{let cnpj=dig(req.params.cnpj);if(cnpj.length!==14)return res.json({ok:false,erro:'CNPJ inválido'});let r=await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);let j=await r.json();if(j.message)return res.json({ok:false,erro:j.message});res.json({ok:true,cnpj,nome:up(j.nome_fantasia||j.razao_social),cep:dig(j.cep),uf:j.uf,cidade:up(j.municipio),endereco:up([j.logradouro,j.numero].filter(Boolean).join(' ')),telefone:dig(j.ddd_telefone_1)})}catch(e){res.json({ok:false,erro:e.message})}});
// helpers datalists/modal/js
function dataLists(d){return `${datalistAnalistas(d)}<datalist id="lojasList">${(d.lojas||[]).map(l=>`<option value="${esc(l.nome)}"></option>`).join('')}</datalist><datalist id="prestadoresList">${(d.prestadores||[]).map(p=>`<option value="${esc(p.empresa||p.responsavel)}"></option>`).join('')}</datalist><datalist id="servicosList">${(d.tiposServico||[]).map(s=>`<option value="${esc(s)}"></option>`).join('')}</datalist>`}
function datalistAnalistas(d){let set=new Set(['TODOS','ADMINISTRADOR',...(d.usuarios||[]).map(u=>u.nome||u.usuario)]);return `<datalist id="analistas">${[...set].map(a=>`<option value="${esc(up(a))}"></option>`).join('')}</datalist>`}
function modalProp(){return `<div class="modal" id="propModal"><div class="box"><h2>Novo proprietário</h2><form method="post" action="/proprietarios/salvar"><div class="grid two"><label>Nome<input name="nome"></label><label>Telefone<input name="telefone"></label><label>CPF<input name="cpf"></label><label>CNPJ<input name="cnpj"></label></div><div class="actions"><button>Salvar</button><button type="button" class="secondary" onclick="closeModal('propModal')">Fechar</button></div></form></div></div>`}


/* PATCH V12.1 - USUÁRIOS, ANALISTAS, PERMISSÕES, BACKUP E RESTAURAÇÃO */
function v121Up(v){return String(v||"").trim().toUpperCase()}
function v121Clean(v){return String(v||"").trim()}
function v121Next(d,k){d.config=d.config||{};d.config[k]=Number(d.config[k]||1);return d.config[k]++}
function v121PermissoesArray(v){return Array.isArray(v)?v:(v?[v]:[])}
function v121EnsurePermDefaults(){
  const d=db(); 
  d.usuarios=d.usuarios||[];
  d.perfis=d.perfis||[
    {id:1,nome:"ADMIN",permissoes:["TODAS"]},
    {id:2,nome:"ANALISTA",permissoes:["INICIO","CHAMADOS","LOJAS","PRESTADORES","PROPRIETARIOS","LEMBRETES","PREVENTIVAS","ORDENS_SERVICO"]},
    {id:3,nome:"CONSULTA",permissoes:["INICIO","CHAMADOS","LOJAS","PRESTADORES","PROPRIETARIOS","LEMBRETES"]}
  ];
  let admin=d.usuarios.find(u=>v121Up(u.usuario||u.login||u.nome)==="OLITECH");
  if(!admin){
    d.usuarios.push({id:v121Next(d,"proximoUsuario"),nome:"OLITECH",usuario:"OLITECH",senha:"051309",perfil:"ADMIN",ativo:"SIM",permissoes:["TODAS"],analista:"SIM"});
  }else{
    admin.usuario="OLITECH"; admin.senha=admin.senha||"051309"; admin.perfil=admin.perfil||"ADMIN"; admin.ativo=admin.ativo||"SIM"; admin.permissoes=admin.permissoes||["TODAS"]; admin.analista=admin.analista||"SIM";
  }
  save(d);
}
try{v121EnsurePermDefaults()}catch(e){console.error("V12.1 defaults",e)}

function v121UserCan(user,tela){
  if(!user)return false;
  const d=db();
  const u=(d.usuarios||[]).find(x=>String(x.id)===String(user.id) || v121Up(x.usuario)===v121Up(user.usuario));
  const perfil=(d.perfis||[]).find(p=>v121Up(p.nome)===v121Up((u&&u.perfil)||user.perfil));
  const perms=[...(u?.permissoes||[]),...(perfil?.permissoes||[])].map(v121Up);
  return perms.includes("TODAS") || perms.includes(v121Up(tela));
}
function v121AuthTela(tela){
  return function(req,res,next){
    if(!req.session.user)return res.redirect("/login");
    if(!v121UserCan(req.session.user,tela)){
      return res.send(layout("Sem permissão",`
        <div class="card"><h2>SEM PERMISSÃO</h2>
        <p>Seu usuário não possui permissão para acessar: <b>${safe(tela)}</b>.</p>
        <a class="btn" href="/">Início</a></div>
      `,req.session.user));
    }
    next();
  }
}
const v121Telas = ["INICIO","CHAMADOS","LOJAS","PRESTADORES","PROPRIETARIOS","LEMBRETES","PREVENTIVAS","ORDENS_SERVICO","IMPORTAR","CONFIG","USUARIOS","BACKUP","PONTO_HORAS","RELATORIOS","PAGAMENTOS"];

function v121UsuarioForm(req,res,u={}){
  const d=db();
  const edit=!!u.id;
  res.send(layout(edit?"Editar usuário":"Novo usuário",`
    <div class="bar">
      <h2>${edit?"EDITAR":"NOVO"} USUÁRIO / ANALISTA</h2>
      <a class="btn secondary" href="/usuarios">Voltar</a>
    </div>
    <form method="post" action="${edit?`/usuarios/${u.id}`:"/usuarios"}" class="card form">
      <div class="grid4">
        <label>Nome<input name="nome" value="${safe(u.nome||"")}" required></label>
        <label>Usuário/login<input name="usuario" value="${safe(u.usuario||"")}" required></label>
        <label>Senha<input name="senha" value="${safe(u.senha||"")}" required></label>
        <label>Ativo
          <select name="ativo">${["SIM","NÃO"].map(x=>`<option ${selected(u.ativo||"SIM",x)}>${x}</option>`).join("")}</select>
        </label>
        <label>Perfil
          <select name="perfil">${(d.perfis||[]).map(p=>`<option ${selected(u.perfil||"ANALISTA",p.nome)}>${safe(p.nome)}</option>`).join("")}</select>
        </label>
        <label>É analista?
          <select name="analista">${["SIM","NÃO"].map(x=>`<option ${selected(u.analista||"SIM",x)}>${x}</option>`).join("")}</select>
        </label>
        <label>Email<input name="email" value="${safe(u.email||"")}"></label>
        <label>Telefone<input name="telefone" value="${safe(u.telefone||"")}"></label>
      </div>
      <h3>Permissões específicas</h3>
      <div class="perm-grid">
        ${v121Telas.map(t=>`
          <label class="checkline">
            <input type="checkbox" name="permissoes" value="${t}" ${(u.permissoes||[]).map(v121Up).includes(t)?"checked":""}> ${t.replace("_"," ")}
          </label>
        `).join("")}
      </div>
      <div class="actions">
        <button type="submit">💾 Salvar</button>
        <a class="btn secondary" href="/usuarios">Voltar</a>
      </div>
    </form>
  `,req.session.user));
}

app.get("/usuarios",auth,v121AuthTela("USUARIOS"),(req,res)=>{
  const d=db(); d.usuarios=d.usuarios||[];
  const q=v121Up(req.query.q||"");
  const lista=d.usuarios.filter(u=>!q || v121Up(`${u.nome} ${u.usuario} ${u.perfil}`).includes(q));
  res.send(layout("Usuários",`
    <div class="bar">
      <h2>USUÁRIOS / ANALISTAS</h2>
      <a class="btn" href="/usuarios/novo">+ Novo usuário</a>
      <a class="btn secondary" href="/perfis">Perfis/permissões</a>
    </div>
    <form class="card search"><input name="q" value="${safe(req.query.q||"")}" placeholder="Buscar usuário, analista ou perfil"><button>🔎 Buscar</button></form>
    <div class="card">
      <table>
        <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Analista</th><th>Ativo</th><th>Ações</th></tr></thead>
        <tbody>
          ${lista.map(u=>`<tr>
            <td>${safe(u.nome)}</td><td>${safe(u.usuario)}</td><td>${safe(u.perfil)}</td><td>${safe(u.analista||"")}</td><td>${safe(u.ativo||"SIM")}</td>
            <td><a class="btn small" href="/usuarios/${u.id}/editar">Editar</a> <form method="post" action="/usuarios/${u.id}/excluir" style="display:inline" onsubmit="return confirm('Excluir usuário?')"><button class="small danger">Excluir</button></form></td>
          </tr>`).join("") || `<tr><td colspan="6">Nenhum usuário cadastrado.</td></tr>`}
        </tbody>
      </table>
    </div>
  `,req.session.user));
});
app.get("/usuarios/novo",auth,v121AuthTela("USUARIOS"),(req,res)=>v121UsuarioForm(req,res,{}));
app.get("/usuarios/:id/editar",auth,v121AuthTela("USUARIOS"),(req,res)=>{
  const u=(db().usuarios||[]).find(x=>String(x.id)===String(req.params.id));
  if(!u)return res.redirect("/usuarios");
  v121UsuarioForm(req,res,u);
});
app.post("/usuarios",auth,v121AuthTela("USUARIOS"),(req,res)=>{
  const d=db(); d.usuarios=d.usuarios||[];
  d.usuarios.push({
    id:v121Next(d,"proximoUsuario"),
    nome:v121Up(req.body.nome),
    usuario:v121Up(req.body.usuario),
    senha:String(req.body.senha||""),
    perfil:v121Up(req.body.perfil||"ANALISTA"),
    ativo:v121Up(req.body.ativo||"SIM"),
    analista:v121Up(req.body.analista||"SIM"),
    email:v121Clean(req.body.email),
    telefone:v121Clean(req.body.telefone),
    permissoes:v121PermissoesArray(req.body.permissoes).map(v121Up)
  });
  save(d); res.redirect("/usuarios");
});
app.post("/usuarios/:id",auth,v121AuthTela("USUARIOS"),(req,res)=>{
  const d=db(); d.usuarios=d.usuarios||[];
  const i=d.usuarios.findIndex(x=>String(x.id)===String(req.params.id));
  if(i>=0){
    d.usuarios[i]={...d.usuarios[i],
      nome:v121Up(req.body.nome),
      usuario:v121Up(req.body.usuario),
      senha:String(req.body.senha||""),
      perfil:v121Up(req.body.perfil||"ANALISTA"),
      ativo:v121Up(req.body.ativo||"SIM"),
      analista:v121Up(req.body.analista||"SIM"),
      email:v121Clean(req.body.email),
      telefone:v121Clean(req.body.telefone),
      permissoes:v121PermissoesArray(req.body.permissoes).map(v121Up)
    };
  }
  save(d); res.redirect("/usuarios");
});
app.post("/usuarios/:id/excluir",auth,v121AuthTela("USUARIOS"),(req,res)=>{
  const d=db(); d.usuarios=d.usuarios||[];
  d.usuarios=d.usuarios.filter(u=>String(u.id)!==String(req.params.id) || v121Up(u.usuario)==="OLITECH");
  save(d); res.redirect("/usuarios");
});

function v121PerfilForm(req,res,p={}){
  const edit=!!p.id;
  res.send(layout(edit?"Editar perfil":"Novo perfil",`
    <div class="bar"><h2>${edit?"EDITAR":"NOVO"} PERFIL</h2><a class="btn secondary" href="/perfis">Voltar</a></div>
    <form class="card form" method="post" action="${edit?`/perfis/${p.id}`:"/perfis"}">
      <label>Nome do perfil<input name="nome" value="${safe(p.nome||"")}" required></label>
      <h3>Permissões</h3>
      <div class="perm-grid">${[...v121Telas,"TODAS"].map(t=>`
        <label class="checkline"><input type="checkbox" name="permissoes" value="${t}" ${(p.permissoes||[]).map(v121Up).includes(t)?"checked":""}> ${t.replace("_"," ")}</label>`).join("")}
      </div>
      <div class="actions"><button>💾 Salvar</button><a class="btn secondary" href="/perfis">Voltar</a></div>
    </form>
  `,req.session.user));
}
app.get("/perfis",auth,v121AuthTela("USUARIOS"),(req,res)=>{
  const d=db(); d.perfis=d.perfis||[];
  res.send(layout("Perfis",`
    <div class="bar"><h2>PERFIS E PERMISSÕES</h2><a class="btn" href="/perfis/novo">+ Novo perfil</a><a class="btn secondary" href="/usuarios">Usuários</a></div>
    <div class="card"><table><thead><tr><th>Perfil</th><th>Permissões</th><th>Ações</th></tr></thead><tbody>
    ${d.perfis.map(p=>`<tr><td>${safe(p.nome)}</td><td>${safe((p.permissoes||[]).join(", "))}</td><td><a class="btn small" href="/perfis/${p.id}/editar">Editar</a></td></tr>`).join("")}
    </tbody></table></div>
  `,req.session.user));
});
app.get("/perfis/novo",auth,v121AuthTela("USUARIOS"),(req,res)=>v121PerfilForm(req,res,{}));
app.get("/perfis/:id/editar",auth,v121AuthTela("USUARIOS"),(req,res)=>{
  const p=(db().perfis||[]).find(x=>String(x.id)===String(req.params.id));
  if(!p)return res.redirect("/perfis");
  v121PerfilForm(req,res,p);
});
app.post("/perfis",auth,v121AuthTela("USUARIOS"),(req,res)=>{
  const d=db(); d.perfis=d.perfis||[];
  d.perfis.push({id:v121Next(d,"proximoPerfil"),nome:v121Up(req.body.nome),permissoes:v121PermissoesArray(req.body.permissoes).map(v121Up)});
  save(d); res.redirect("/perfis");
});
app.post("/perfis/:id",auth,v121AuthTela("USUARIOS"),(req,res)=>{
  const d=db(); const p=(d.perfis||[]).find(x=>String(x.id)===String(req.params.id));
  if(p){p.nome=v121Up(req.body.nome);p.permissoes=v121PermissoesArray(req.body.permissoes).map(v121Up);save(d);}
  res.redirect("/perfis");
});

/* BACKUP E RESTAURAÇÃO */
app.get("/backup",auth,v121AuthTela("BACKUP"),(req,res)=>{
  res.send(layout("Backup",`
    <div class="bar"><h2>BACKUP E RESTAURAÇÃO</h2><a class="btn secondary" href="/config">Voltar</a></div>
    <div class="card">
      <h3>Baixar backup</h3>
      <p>Gera um arquivo JSON com todos os dados do sistema.</p>
      <a class="btn" href="/backup/download">⬇️ Baixar backup</a>
    </div>
    <form class="card" method="post" action="/backup/restaurar" enctype="multipart/form-data" onsubmit="return confirm('Restaurar backup vai substituir os dados atuais. Continuar?')">
      <h3>Restaurar backup</h3>
      <input type="file" name="backup" accept=".json,application/json" required>
      <div class="actions"><button type="submit">♻️ Restaurar</button></div>
    </form>
  `,req.session.user));
});
app.get("/backup/download",auth,v121AuthTela("BACKUP"),(req,res)=>{
  const d=db();
  const nome=`backup-vbchamados-${new Date().toISOString().slice(0,10)}.json`;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Content-Disposition",`attachment; filename="${nome}"`);
  res.end(JSON.stringify(d,null,2));
});
app.post("/backup/restaurar",auth,v121AuthTela("BACKUP"),upload.single("backup"),(req,res)=>{
  try{
    if(!req.file || !req.file.path) throw new Error("Arquivo não enviado.");
    const fs = require("fs");
    const txt = fs.readFileSync(req.file.path,"utf8");
    const novo = JSON.parse(txt);
    if(!novo || typeof novo !== "object") throw new Error("Backup inválido.");
    save(novo);
    res.send(layout("Backup restaurado",`<div class="card"><h2>BACKUP RESTAURADO</h2><p>Dados restaurados com sucesso.</p><a class="btn" href="/">Início</a></div>`,req.session.user));
  }catch(e){
    res.send(layout("Erro backup",`<div class="card"><h2>ERRO AO RESTAURAR</h2><p>${safe(e.message)}</p><a class="btn" href="/backup">Voltar</a></div>`,req.session.user));
  }
});

/* LOGIN CASE INSENSITIVE */
app.post("/login",(req,res,next)=>{
  try{
    const usuario=v121Up(req.body.usuario||req.body.email||req.body.login);
    const senha=String(req.body.senha||req.body.password||"");
    const d=db();
    const u=(d.usuarios||[]).find(x=>v121Up(x.usuario||x.email||x.nome)===usuario && String(x.senha||"")===senha && v121Up(x.ativo||"SIM")!=="NÃO");
    if(u){
      req.session.user={id:u.id,usuario:u.usuario,nome:u.nome,perfil:u.perfil,permissoes:u.permissoes||[]};
      return res.redirect("/");
    }
  }catch(e){}
  next();
});

app.get("/api/v121/usuarios-analistas",auth,(req,res)=>{
  const d=db();
  res.json({ok:true,usuarios:(d.usuarios||[]).map(u=>({id:u.id,nome:u.nome,usuario:u.usuario,perfil:u.perfil,analista:u.analista,ativo:u.ativo}))});
});

app.use((req,res)=>res.status(404).send(layout(req,'Página não encontrada',`<section class="card"><h2>Página não encontrada</h2><p>A rota ${esc(req.path)} não foi localizada.</p><a class="btn" href="/">Início</a></section>`)));
app.listen(PORT,()=>console.log('V12 rodando na porta '+PORT));
