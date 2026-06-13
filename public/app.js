(function(){function qs(s,r=document){return r.querySelector(s)}function qsa(s,r=document){return [...r.querySelectorAll(s)]}function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase()}function digits(v){return String(v||"").replace(/\D/g,"")}function maskHora(v){let d=digits(v).slice(0,4);return d.length>=3?d.slice(0,2)+":"+d.slice(2):d}function mask(v,t){let d=digits(v);if(t==="hora")return maskHora(v);if(t==="cep")return d.slice(0,5)+(d.length>5?"-"+d.slice(5,8):"");if(t==="cpf")return d.replace(/^(\d{3})(\d)/,"$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1-$2").slice(0,14);if(t==="cnpj")return d.replace(/^(\d{2})(\d)/,"$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1/$2").replace(/(\d{4})(\d)/,"$1-$2").slice(0,18);if(t==="telefone"){if(d.length<=10)return d.replace(/^(\d{2})(\d)/,"($1) $2").replace(/(\d{4})(\d)/,"$1-$2");return d.replace(/^(\d{2})(\d)/,"($1) $2").replace(/(\d{5})(\d)/,"$1-$2").slice(0,15)}return v}document.addEventListener("input",e=>{let t=e.target.dataset?.mask;if(t)e.target.value=mask(e.target.value,t)});document.addEventListener("DOMContentLoaded",()=>{document.querySelectorAll(".version").forEach(v=>v.textContent = "V20.8.16");let u=qs('input[name="usuario"]');if(u&&localStorage.vb_user_saved)u.value=localStorage.vb_user_saved;let f=u?.closest('form');if(f)f.addEventListener('submit',()=>{if(qs('input[name="lembrar"]',f)?.checked)localStorage.vb_user_saved=u.value||''})});document.addEventListener("click",async e=>{if(e.target.id==="btnSugestaoInline"){e.preventDefault();qs("#btnSugestao")?.click()}if(e.target.id==="btnSugestao"){let f=e.target.closest("form"),loja=qs('[name="lojaNome"]',f)?.value||'',tipo=qs('[name="tipoServico"]',f)?.value||'',box=qs('#sugestoes');box.innerHTML="Pesquisando prestadores...";let d=await fetch('/api/prestadores-sugeridos?loja='+encodeURIComponent(loja)+'&tipo='+encodeURIComponent(tipo)).then(r=>r.json()).catch(()=>({items:[]}));box.innerHTML='<h3>🎯 Sugestão de prestador por logística</h3>'+((d.items||[]).map(p=>`<button type="button" class="small" data-pick-prest="${p.empresa||p.responsavel}">✅ ${p.empresa||p.responsavel} - ${p.cidade||''}/${p.uf||p.estado||''} | ${p.distancia?Number(p.distancia).toFixed(1)+' KM':'cidade/UF'} | Desloc.: ${Number(p.valorDeslocamento||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</button>`).join('')||'Nenhum prestador encontrado para esta combinação.')}if(e.target.dataset.pickPrest)qs('[name="prestadorNome"]').value=e.target.dataset.pickPrest;if(e.target.matches('[data-cep]')){let f=e.target.closest('form'),cep=digits(qs('[name="cep"]',f)?.value);if(cep.length!==8)return alert('Informe um CEP válido');let r=await fetch('https://viacep.com.br/ws/'+cep+'/json/').then(r=>r.json()).catch(()=>null);if(r&&!r.erro){qs('[name="endereco"]',f).value=norm((r.logradouro||'')+' '+(r.bairro||''));qs('[name="cidade"]',f).value=norm(r.localidade);qs('[name="uf"]',f).value=norm(r.uf)}}if(e.target.matches('[data-cnpj]'))alert('Busca CNPJ online depende de API externa. Use PDF/cartão CNPJ ou preencha manualmente.');if(e.target.matches('[data-geo]')){let f=e.target.closest('form'),q=[qs('[name="endereco"]',f)?.value,qs('[name="cidade"]',f)?.value,qs('[name="uf"]',f)?.value,qs('[name="cep"]',f)?.value,'Brasil'].filter(Boolean).join(', ');if(!q.trim())return alert('Preencha endereço/cidade/UF/CEP.');e.target.textContent='📍 Localizando...';try{let j=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(q)).then(r=>r.json());if(j&&j[0]){qs('[name="latitude"]',f).value=Number(j[0].lat).toFixed(6);qs('[name="longitude"]',f).value=Number(j[0].lon).toFixed(6);alert('Localização preenchida.')}else alert('Não encontrei a localização.')}catch{alert('Não foi possível buscar localização agora.')}finally{e.target.textContent='📍 Gerar localização'}}});let box=null;function close(){if(box)box.remove();box=null}function tipo(el){let s=norm((el.name||'')+' '+(el.id||'')+' '+(el.placeholder||'')+' '+(el.dataset.auto||''));if(s.includes('PRESTADOR'))return'prestadores';if(s.includes('LOJA'))return'lojas';if(s.includes('ANALISTA')||s.includes('USUARIO'))return'analistas';if(s.includes('PROPRIET'))return'proprietarios';if(s.includes('SERVICO'))return'servicos';if(s.includes('CHAMADO'))return'chamados';return''}document.addEventListener('input',e=>{let el=e.target;if(!el||el.tagName!=='INPUT')return;let tp=tipo(el);if(!tp||el.value.trim().length<2)return;clearTimeout(el._t);el._t=setTimeout(async()=>{let d=await fetch('/api/autocomplete?tipo='+tp+'&q='+encodeURIComponent(el.value)).then(r=>r.json()).catch(()=>({items:[]}));close();box=document.createElement('div');box.className='auto-box';let r=el.getBoundingClientRect();box.style.left=(r.left+scrollX)+'px';box.style.top=(r.bottom+scrollY+3)+'px';box.style.width=Math.max(300,r.width)+'px';box.innerHTML=(d.items||[]).map(i=>`<div class="auto-item" data-val="${String(i.value||i.label||'').replace(/"/g,'&quot;')}"><b>${i.label||i.value}</b><br><small>${i.sub||''}</small></div>`).join('')||'<div class="auto-item">Nenhum resultado</div>';document.body.appendChild(box)},160)});document.addEventListener('mousedown',e=>{let it=e.target.closest('[data-val]');if(it&&document.activeElement){document.activeElement.value=it.dataset.val;document.activeElement.dispatchEvent(new Event('change',{bubbles:true}));close()}else if(box&&!box.contains(e.target))close()});window.abrirServicosModal=async function(){let dlg=qs('#modalServicos');if(!dlg)return;await renderServicosModal();dlg.showModal()};window.fecharServicosModal=function(){qs('#modalServicos')?.close()};window.renderServicosModal=async function(){let res=await fetch('/api/tipos-servico').then(r=>r.json()).catch(()=>({items:[]})),lista=qs('#modalServicosLista');if(!lista)return;let checked=qsa('#servicosGrid input[name="servicos"]:checked').map(x=>norm(x.value));lista.innerHTML=(res.items||[]).map((s,i)=>{let nome=s.nome||s,ck=checked.includes(norm(nome))?'checked':'';return `<div class="service-row"><label class="checkline"><input type="checkbox" data-servico-modal value="${nome}" ${ck}> ${nome}</label><input data-servico-edit="${i}" value="${nome}"><button type="button" onclick="editarServicoModal(${i})">💾</button><button type="button" class="danger" onclick="excluirServicoModal(${i})">🗑️</button></div>`}).join('');qsa('[data-servico-modal]',lista).forEach(ch=>ch.addEventListener('change',()=>{let grid=qs('#servicosGrid'),inp=qsa('input[name="servicos"]',grid).find(x=>norm(x.value)===norm(ch.value));if(!inp){let lab=document.createElement('label');lab.className='checkline';lab.innerHTML=`<input type="checkbox" name="servicos" value="${ch.value}"> ${ch.value}`;grid.appendChild(lab);inp=qs('input',lab)}inp.checked=ch.checked}))};window.criarServicoModal=async function(){let i=qs('#novoServicoModal'),nome=i?.value||'';if(nome.trim().length<2)return alert('Digite o serviço.');await fetch('/api/tipos-servico',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome})});i.value='';await renderServicosModal()};window.editarServicoModal=async function(i){let inp=qs(`[data-servico-edit="${i}"]`);await fetch('/api/tipos-servico/'+i,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:inp.value})});await renderServicosModal()};window.excluirServicoModal=async function(i){if(!confirm('Excluir serviço?'))return;await fetch('/api/tipos-servico/'+i,{method:'DELETE'});await renderServicosModal()}})();


/* V20.8.16 - ajustes finais sem redirecionar PDF */
(function(){
 if(window.__V15__)return; window.__V15__=true;
 function N(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()}
 document.addEventListener('DOMContentLoaded',()=>{
   document.querySelectorAll('.version').forEach(x=>x.textContent = "V20.8.16");
   document.querySelectorAll('input').forEach(inp=>{
     const s=N((inp.name||'')+' '+(inp.id||'')+' '+(inp.placeholder||''));
     if(!inp.dataset.auto){
       if(s.includes('LOJA'))inp.dataset.auto='lojas';
       else if(s.includes('PRESTADOR'))inp.dataset.auto='prestadores';
       else if(s.includes('PROPRIET'))inp.dataset.auto='proprietarios';
       else if(s.includes('ANALISTA')||s.includes('USUARIO'))inp.dataset.auto='analistas';
       else if(s.includes('SERVICO')||s.includes('SERVIÇO'))inp.dataset.auto='servicos';
       else if(s.includes('CHAMADO'))inp.dataset.auto='chamados';
     }
   });
   if(location.pathname==='/importar-planilha'){
     document.querySelectorAll('form[enctype="multipart/form-data"]').forEach(f=>{
       if(f.querySelector('input[name="excel"]')){f.action='/v15/importar-planilha';f.method='post';}
     });
   }
 });
})();


/* PATCH V15.1 FRONT - CIDADES/UF COMBO + ROTAS PDF */
(function(){
 if(window.__V151__) return; window.__V151__=true;
 function up(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();}
 let box=null;
 function close(){ if(box) box.remove(); box=null; }
 function posBox(el){ const r=el.getBoundingClientRect(); box.style.left=(r.left+scrollX)+"px"; box.style.top=(r.bottom+scrollY+3)+"px"; box.style.width=Math.max(280,r.width)+"px"; }
 async function cidadeSuggest(el){
   if(el.value.trim().length<2) return close();
   const data=await fetch("/api/cidades?q="+encodeURIComponent(el.value)).then(r=>r.json()).catch(()=>({items:[]}));
   close(); box=document.createElement("div"); box.className="auto-box cidade-box"; posBox(el);
   box.innerHTML=(data.items||[]).map(i=>`<div class="auto-item" data-cidade="${i.cidade}" data-uf="${i.uf}"><b>${i.cidade}</b><br><small>${i.uf}</small></div>`).join("") || '<div class="auto-item">Nenhuma cidade</div>';
   document.body.appendChild(box);
 }
 document.addEventListener("DOMContentLoaded",()=>{
   document.querySelectorAll(".version").forEach(v=>v.textContent="V15.1");
   const path=location.pathname;
   if(path.includes("/lojas/") || path==="/lojas/nova"){
     document.querySelectorAll('form[enctype="multipart/form-data"]').forEach(f=>{
       if(f.querySelector('input[name="pdf"]')){
         const id=(path.match(/\/lojas\/(\d+)\/editar/)||[])[1]||"";
         f.action=id?"/v151/loja-pdf/"+id:"/v151/loja-pdf";
         f.method="post";
       }
     });
   }
   if(path.includes("/prestadores/") || path==="/prestadores/novo"){
     document.querySelectorAll('form[enctype="multipart/form-data"]').forEach(f=>{
       if(f.querySelector('input[name="pdf"]')){
         const id=(path.match(/\/prestadores\/(\d+)\/editar/)||[])[1]||"";
         f.action=id?"/v151/prestador-pdf/"+id:"/v151/prestador-pdf";
         f.method="post";
       }
     });
   }
   document.querySelectorAll('input[name="cidade"], input[name="Cidade"]').forEach(inp=>{
     inp.setAttribute("autocomplete","off");
     inp.addEventListener("input",()=>{ clearTimeout(inp._t); inp._t=setTimeout(()=>cidadeSuggest(inp),160); });
   });
   document.querySelectorAll('input[name="uf"], input[name="estado"]').forEach(inp=>{
     inp.setAttribute("list","ufs-v151");
   });
   if(!document.getElementById("ufs-v151")){
     const dl=document.createElement("datalist"); dl.id="ufs-v151";
     dl.innerHTML=["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map(uf=>`<option value="${uf}"></option>`).join("");
     document.body.appendChild(dl);
   }
 });
 document.addEventListener("mousedown",e=>{
   const it=e.target.closest("[data-cidade]");
   if(it && document.activeElement){
     const form=document.activeElement.closest("form")||document;
     document.activeElement.value=it.dataset.cidade;
     const uf=form.querySelector('input[name="uf"], input[name="estado"]');
     if(uf) uf.value=it.dataset.uf;
     close();
   }else if(box && !box.contains(e.target)) close();
 });
})();

/* PATCH V15.2 FRONT - usar rota v152 loja */
(function(){
 if(window.__V152__) return; window.__V152__=true;
 document.addEventListener("DOMContentLoaded",()=>{
   document.querySelectorAll(".version").forEach(v=>v.textContent="V15.2");
   const path=location.pathname;
   if(path.includes("/lojas/") || path==="/lojas/nova"){
     document.querySelectorAll('form[enctype="multipart/form-data"]').forEach(f=>{
       if(f.querySelector('input[name="pdf"]')){
         const id=(path.match(/\/lojas\/(\d+)\/editar/)||[])[1]||"";
         f.action=id?"/v152/loja-pdf/"+id:"/v152/loja-pdf";
         f.method="post";
       }
     });
   }
 });
})();

/* PATCH V15.3 FRONT - PDF usa rotas v153 */
(function(){
 if(window.__V153__)return; window.__V153__=true;
 document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".version").forEach(v=>v.textContent="V15.3");
  const path=location.pathname;
  if(path.includes("/lojas/")||path==="/lojas/nova"){
    document.querySelectorAll('form[enctype="multipart/form-data"]').forEach(f=>{if(f.querySelector('input[name="pdf"]')){const id=(path.match(/\/lojas\/(\d+)\/editar/)||[])[1]||""; f.action=id?"/v153/loja-pdf/"+id:"/v153/loja-pdf"; f.method="post";}});
  }
  if(path.includes("/prestadores/")||path==="/prestadores/novo"){
    document.querySelectorAll('form[enctype="multipart/form-data"]').forEach(f=>{if(f.querySelector('input[name="pdf"]')){const id=(path.match(/\/prestadores\/(\d+)\/editar/)||[])[1]||""; f.action=id?"/v153/prestador-pdf/"+id:"/v153/prestador-pdf"; f.method="post";}});
  }
 });
})();

/* PATCH V15.4 FRONT - Config filial e PDF loja */
(function(){
 if(window.__V154__) return; window.__V154__=true;
 document.addEventListener("DOMContentLoaded",()=>{
   document.querySelectorAll(".version").forEach(v=>v.textContent="V15.4");
   const path=location.pathname;
   if(path==="/config"){
     document.querySelectorAll('form[enctype="multipart/form-data"], form').forEach(f=>{
       if(f.querySelector('[name="regraNomeFilial"], [name="filialNomesRepetidos"], [name="tema"]')){
         f.action="/v154/config";
         f.method="post";
         f.enctype="multipart/form-data";
       }
     });
   }
   if(path.includes("/lojas/") || path==="/lojas/nova"){
     document.querySelectorAll('form[enctype="multipart/form-data"]').forEach(f=>{
       if(f.querySelector('input[name="pdf"]')){
         const id=(path.match(/\/lojas\/(\d+)\/editar/)||[])[1]||"";
         f.action=id?"/v154/loja-pdf/"+id:"/v154/loja-pdf";
         f.method="post";
       }
     });
   }
 });
})();

/* PATCH V15.5 FRONT */
(function(){if(window.__V155__)return;window.__V155__=true;
function close(){document.querySelectorAll(".v155-autobox").forEach(b=>b.remove())}
async function sug(inp){const q=inp.value.trim();if(q.length<2){close();return}const d=await fetch("/api/v155/analistas?q="+encodeURIComponent(q)).then(r=>r.json()).catch(()=>({items:[]}));close();const r=inp.getBoundingClientRect(),b=document.createElement("div");b.className="v155-autobox";b.style.left=(r.left+scrollX)+"px";b.style.top=(r.bottom+scrollY+4)+"px";b.style.width=Math.max(300,r.width)+"px";b.innerHTML=(d.items||[]).map(i=>`<div class="v155-autoitem" data-value="${i.nome}">👤 ${i.label}</div>`).join("")||'<div class="v155-autoitem">Nenhum analista</div>';document.body.appendChild(b)}
document.addEventListener("DOMContentLoaded",()=>{document.querySelectorAll(".version").forEach(v=>v.textContent="V15.5");if(location.pathname==="/importar-planilha"){document.querySelectorAll('form').forEach(f=>{if(f.querySelector('input[type="file"]')){f.action="/v155/importar-planilha";f.method="post";f.enctype="multipart/form-data"}})}document.querySelectorAll('input[name="analista"],input[name="analistaResponsavel"],input[name="analista_responsavel"],input[placeholder*="ANALISTA" i]').forEach(i=>{i.autocomplete="off";i.addEventListener("input",()=>{clearTimeout(i._t);i._t=setTimeout(()=>sug(i),160)})})});
document.addEventListener("mousedown",e=>{const it=e.target.closest(".v155-autoitem[data-value]");if(it&&document.activeElement){document.activeElement.value=it.dataset.value;close()}else if(!e.target.closest(".v155-autobox"))close()});
})();

/* PATCH V15.6 FRONT */
(function(){if(window.__V156__)return;window.__V156__=true;function close(){document.querySelectorAll('.v156-autobox').forEach(b=>b.remove())}async function sug(inp){const q=inp.value.trim();if(q.length<2){close();return}const d=await fetch('/api/v156/analistas?q='+encodeURIComponent(q)).then(r=>r.json()).catch(()=>({items:[]}));close();const r=inp.getBoundingClientRect(),b=document.createElement('div');b.className='v156-autobox';b.style.left=(r.left+scrollX)+'px';b.style.top=(r.bottom+scrollY+4)+'px';b.style.width=Math.max(300,r.width)+'px';b.innerHTML=(d.items||[]).map(i=>`<div class="v156-autoitem" data-value="${i.nome}">👤 ${i.label}</div>`).join('')||'<div class="v156-autoitem">Nenhum analista</div>';document.body.appendChild(b)}document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('.version').forEach(v=>v.textContent='V15.6');if(location.pathname==='/importar-planilha'){document.querySelectorAll('form').forEach(f=>{if(f.querySelector('input[type="file"]')){f.action='/v156/importar-planilha';f.method='post';f.enctype='multipart/form-data'}})}document.querySelectorAll('input[name="analista"],input[name="analistaResponsavel"],input[name="analista_responsavel"],input[placeholder*="ANALISTA" i]').forEach(i=>{i.autocomplete='off';i.addEventListener('input',()=>{clearTimeout(i._v156t);i._v156t=setTimeout(()=>sug(i),160)})})});document.addEventListener('mousedown',e=>{const it=e.target.closest('.v156-autoitem[data-value]');if(it&&document.activeElement){document.activeElement.value=it.dataset.value;close()}else if(!e.target.closest('.v156-autobox'))close()})})();


/* PATCH V15.7 FRONT - força importação na rota segura */
(function(){if(window.__V157__)return;window.__V157__=true;
function fechar(){document.querySelectorAll('.v157-autobox').forEach(b=>b.remove())}
async function sug(inp){const q=inp.value.trim();if(q.length<2){fechar();return}const d=await fetch('/api/v157/analistas?q='+encodeURIComponent(q)).then(r=>r.json()).catch(()=>({items:[]}));fechar();const r=inp.getBoundingClientRect(),b=document.createElement('div');b.className='v157-autobox';b.style.left=(r.left+scrollX)+'px';b.style.top=(r.bottom+scrollY+4)+'px';b.style.width=Math.max(300,r.width)+'px';b.innerHTML=(d.items||[]).map(i=>`<div class="v157-autoitem" data-value="${i.nome}">👤 ${i.label}</div>`).join('')||'<div class="v157-autoitem">Nenhum analista</div>';document.body.appendChild(b)}
document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('.version').forEach(v=>v.textContent='V15.7');if(location.pathname==='/importar-planilha'){document.querySelectorAll('form').forEach(f=>{if(f.querySelector('input[type="file"]')){f.action='/v157/importar-planilha';f.method='post';f.enctype='multipart/form-data';f.addEventListener('submit',()=>{f.action='/v157/importar-planilha'})}})}document.querySelectorAll('input[name="analista"],input[name="analistaResponsavel"],input[data-auto="analistas"],input[placeholder*="ANALISTA" i]').forEach(i=>{i.autocomplete='off';i.addEventListener('input',()=>{clearTimeout(i._v157t);i._v157t=setTimeout(()=>sug(i),160)})})});
document.addEventListener('mousedown',e=>{const it=e.target.closest('.v157-autoitem[data-value]');if(it&&document.activeElement){document.activeElement.value=it.dataset.value;fechar()}else if(!e.target.closest('.v157-autobox'))fechar()});
})();

/* PATCH V15.8 FRONT - importação estável */
(function(){if(window.__V158__)return;window.__V158__=true;function close(){document.querySelectorAll('.v158-autobox').forEach(b=>b.remove())}async function sug(inp){const q=inp.value.trim();if(q.length<2){close();return}const d=await fetch('/api/v158/analistas?q='+encodeURIComponent(q)).then(r=>r.json()).catch(()=>({items:[]}));close();const r=inp.getBoundingClientRect(),b=document.createElement('div');b.className='v158-autobox';b.style.left=(r.left+scrollX)+'px';b.style.top=(r.bottom+scrollY+4)+'px';b.style.width=Math.max(300,r.width)+'px';b.innerHTML=(d.items||[]).map(i=>`<div class="v158-autoitem" data-value="${i.nome}">👤 ${i.label}</div>`).join('')||'<div class="v158-autoitem">Nenhum analista</div>';document.body.appendChild(b)}document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('.version').forEach(v=>v.textContent='V15.8');if(location.pathname==='/importar-planilha'){document.querySelectorAll('form').forEach(f=>{if(f.querySelector('input[type="file"]')){f.action='/v158/importar-planilha';f.method='post';f.enctype='multipart/form-data'}})}document.querySelectorAll('input[name="analista"],input[name="analistaResponsavel"],input[data-auto="analistas"]').forEach(i=>{i.autocomplete='off';i.addEventListener('input',()=>{clearTimeout(i._t);i._t=setTimeout(()=>sug(i),160)})})});document.addEventListener('mousedown',e=>{const it=e.target.closest('.v158-autoitem[data-value]');if(it&&document.activeElement){document.activeElement.value=it.dataset.value;close()}else if(!e.target.closest('.v158-autobox'))close()});})();


/* PATCH V15.9 FRONT - PDF loja restaurado + Google Maps */
(function(){if(window.__V159__)return;window.__V159__=true;
function val(sel){const el=document.querySelector(sel);return el?el.value.trim():""}
function abrirMaps(){const lat=val('input[name="latitude"]'), lon=val('input[name="longitude"]');let q="";if(lat&&lon){q=lat+","+lon}else{q=[val('input[name="endereco"]'),val('input[name="cidade"]'),val('input[name="uf"],input[name="estado"]')].filter(Boolean).join(", ")}if(!q){alert("Preencha endereço, cidade e UF ou latitude/longitude para abrir no Maps.");return}window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q),"_blank")}
document.addEventListener("DOMContentLoaded",()=>{document.querySelectorAll(".version").forEach(v=>v.textContent="V15.9");const path=location.pathname;if(path.includes("/lojas/")||path==="/lojas/nova"){document.querySelectorAll('form[enctype="multipart/form-data"]').forEach(f=>{if(f.querySelector('input[name="pdf"]')){const id=(path.match(/\/lojas\/(\d+)\/editar/)||[])[1]||"";f.action=id?"/v159/loja-pdf/"+id:"/v159/loja-pdf";f.method="post";}})}document.querySelectorAll('button,a,input[type="button"],input[type="submit"]').forEach(b=>{const txt=(b.innerText||b.value||"").toUpperCase();if(txt.includes("GERAR LOCALIZAÇÃO")||txt.includes("GERAR LOCALIZACAO")){if(b.tagName==="A")b.href="javascript:void(0)";if(b.type)b.type="button";b.onclick=function(e){e.preventDefault();abrirMaps();return false;};}})});
})();

/* PATCH V16.0 FRONT */
(function(){if(window.__V160__)return;window.__V160__=true;
document.addEventListener("DOMContentLoaded",()=>{
 document.querySelectorAll(".version").forEach(v=>v.textContent="V16.0");
 document.querySelectorAll('a,button').forEach(el=>{
  const txt=(el.textContent||"").toUpperCase();
  if(txt.includes("CRIAR CHAMADO RÁPIDO")||txt.includes("CHAMADO RÁPIDO")){if(el.tagName==="A")el.href="/chamados/rapido";else el.onclick=()=>location.href="/chamados/rapido";}
  if(txt.includes("ABRIR CHAMADO COMPLETO")||txt.includes("CHAMADO COMPLETO")){if(el.tagName==="A")el.href="/chamados/novo-completo";else el.onclick=()=>location.href="/chamados/novo-completo";}
 });
 document.querySelectorAll(".v160-sugerir").forEach(btn=>btn.addEventListener("click",async()=>{
  const f=btn.closest("form"), loja=f.querySelector('[name="lojaNome"],[name="loja"]')?.value||"", tipo=f.querySelector('[name="tipoServico"]')?.value||"", box=document.getElementById("v160-sugestao");
  if(box)box.innerHTML="Pesquisando sugestão...";
  const data=await fetch("/api/v160/sugerir-prestador?loja="+encodeURIComponent(loja)+"&tipo="+encodeURIComponent(tipo)).then(r=>r.json()).catch(e=>({ok:false,msg:String(e),items:[]}));
  if(!box)return; if(!data.ok){box.innerHTML="⚠️ "+(data.msg||"Não foi possível sugerir");return;}
  box.innerHTML="<b>🎯 Sugestões por logística:</b><br>"+(data.items||[]).map(i=>`<button type="button" class="btn mini v160-use-prest" data-nome="${i.nome}">✅ ${i.nome} - ${i.cidade}/${i.uf} ${i.valorKm?`| R$/KM: ${i.valorKm}`:""}</button>`).join(" ")||"Nenhum prestador encontrado.";
  box.querySelectorAll(".v160-use-prest").forEach(b=>b.onclick=()=>{const inp=f.querySelector('[name="prestadorNome"],[name="prestador"]');if(inp)inp.value=b.dataset.nome;});
 }));
});
})();

/* PATCH V16.1 FRONT */
(function(){if(window.__V161__)return;window.__V161__=true;document.addEventListener("DOMContentLoaded",()=>{document.querySelectorAll(".version").forEach(v=>v.textContent="V16.1");document.querySelectorAll('a,button').forEach(el=>{const txt=(el.textContent||"").toUpperCase();if(txt==="CHAMADOS"||txt.includes("📋 CHAMADOS")){if(el.tagName==="A")el.href="/chamados?mostrar=abertos";}});});})();


/* PATCH V20.8.16 AUTO UPPERCASE + MOBILE */
(function(){
  function upperField(el){
    if(!el || !['INPUT','TEXTAREA'].includes(el.tagName)) return;
    const type=(el.type||'').toLowerCase();
    if(['file','checkbox','radio','date','time','datetime-local','number'].includes(type)) return;
    const p=el.selectionStart;
    el.value=(el.value||'').toUpperCase();
    try{ if(p!==null) el.setSelectionRange(p,p); }catch(e){}
  }
  document.addEventListener('input',e=>upperField(e.target),true);
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('input,textarea').forEach(upperField);
    document.querySelectorAll('.version,.badge-version').forEach(e=>e.textContent = "V20.8.16");
  });
  setInterval(()=>document.querySelectorAll('.version,.badge-version').forEach(e=>e.textContent = "V20.8.16"),1000);
})();

/* PATCH V20.8.16 FRONT FIX */
(function(){
  function setVersion(){
    document.querySelectorAll(".version,.badge-version").forEach(e=>e.textContent="V20.8.16");
  }
  document.addEventListener("DOMContentLoaded", setVersion);
  setInterval(setVersion, 1000);

  document.addEventListener('input', function(e){
    const el=e.target;
    if(!el) return;
    if(el.tagName==='INPUT' || el.tagName==='TEXTAREA'){
      const type=(el.type||'').toLowerCase();
      if(['file','checkbox','radio','date','time','datetime-local','number'].includes(type)) return;
      const p=el.selectionStart;
      el.value=(el.value||'').toUpperCase();
      try{ if(p!=null) el.setSelectionRange(p,p); }catch(_){}
    }
  });
})();


/* PATCH V20.8.16 LOADING IMPORT */
(function(){
  if(window.__V20811_IMPORT__) return; window.__V20811_IMPORT__=true;
  function showLoading(){
    if(document.getElementById('importOverlay')) return;
    const d=document.createElement('div');
    d.id='importOverlay';
    d.className='import-overlay';
    d.innerHTML='<div class="import-box">⏳ IMPORTANDO PLANILHA...<br><small>AGUARDE, NÃO FECHE A TELA.</small></div>';
    document.body.appendChild(d);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(location.pathname==='/importar-planilha'){
      document.querySelectorAll('form').forEach(f=>{
        if(f.querySelector('input[type="file"]')){
          f.action='/v158/importar-planilha';
          f.method='post';
          f.enctype='multipart/form-data';
          f.addEventListener('submit',showLoading);
        }
      });
    }
    document.querySelectorAll('.version,.badge-version').forEach(e=>e.textContent='V20.8.16');
  });
})();

/* PATCH V20.8.16 - COMPARTILHAR PDF DA O.S. */
async function compartilharOsPdf(id,tel,msg){
  const url='/os-pdf/'+encodeURIComponent(id);
  try{
    const r=await fetch(url,{credentials:'same-origin'});
    if(!r.ok) throw new Error('PDF NÃO GERADO');
    const blob=await r.blob();
    const file=new File([blob], 'OS-'+String(id).replace(/[^0-9A-Z-]/gi,'_')+'.pdf', {type:'application/pdf'});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({title:msg||'ORDEM DE SERVIÇO', text:msg||'ORDEM DE SERVIÇO', files:[file]});
      return;
    }
  }catch(e){ console.warn(e); }
  const full=location.origin+url;
  const texto=(msg||'ORDEM DE SERVIÇO')+' - PDF: '+full;
  window.open('https://wa.me/55'+String(tel||'').replace(/\D/g,'')+'?text='+encodeURIComponent(texto),'_blank');
}
