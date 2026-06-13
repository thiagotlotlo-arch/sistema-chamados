
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('form.loading-form, form[enctype="multipart/form-data"]').forEach(f=>f.addEventListener('submit',()=>{const o=document.getElementById('loadingOverlay'); if(o)o.style.display='flex'}));
  document.querySelectorAll('input[list]').forEach(i=>{i.setAttribute('autocomplete','off'); i.addEventListener('input',()=>{ if(i.value.length>=2){ i.classList.add('buscando') } else i.classList.remove('buscando') })});
  function beep(){try{const ctx=new (window.AudioContext||window.webkitAudioContext)(); for(let n=0;n<3;n++){const o=ctx.createOscillator();const g=ctx.createGain();o.frequency.value=880+n*120;o.connect(g);g.connect(ctx.destination);g.gain.setValueAtTime(.09,ctx.currentTime+n*.25);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+n*.25+.18);o.start(ctx.currentTime+n*.25);o.stop(ctx.currentTime+n*.25+.2)}}catch(e){}}
  function checkPostits(){const now=new Date(); let due=false; document.querySelectorAll('.postit').forEach(p=>{const d=p.dataset.data||''; const h=p.dataset.hora||'00:00'; if(d){const dt=new Date(d+'T'+h); if(!isNaN(dt)&&dt<=now){p.classList.add('vencido'); due=true}}}); if(due&&!sessionStorage.getItem('vb_beep_'+new Date().toISOString().slice(0,16))){sessionStorage.setItem('vb_beep_'+new Date().toISOString().slice(0,16),'1'); beep()}}
  checkPostits(); setInterval(checkPostits,60000);
  try{const cfg=document.body.textContent||''; const last=localStorage.getItem('vb_last_backup')||''; const today=new Date().toISOString().slice(0,10); if(cfg.includes('Backup automático no navegador') && !last){localStorage.setItem('vb_last_backup',today)}}catch(e){}
});

// V20.7: foco em busca apos 2 caracteres e loading mantido
document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('.version').forEach(e=>e.textContent='V20.8.1')});

/* PATCH V20.8.1 FORCE */
(function(){
 function forceV(){
   document.querySelectorAll(".version,.badge-version").forEach(e=>e.textContent="V20.8.1");
   [...document.querySelectorAll("body *")].slice(-30).forEach(e=>{if((e.textContent||"").trim()==="V20.6.0") e.textContent="V20.8.1"});
 }
 document.addEventListener("DOMContentLoaded",()=>{
   forceV();
   document.querySelectorAll("form[enctype='multipart/form-data'], form.loading-form").forEach(f=>f.addEventListener("submit",()=>{
    if(!document.getElementById("loadingOverlay")){
      const d=document.createElement("div"); d.id="loadingOverlay"; d.innerHTML='<div class="loaderBox">⏳ Processando... aguarde</div>'; document.body.appendChild(d);
    }
   }));
 });
 setInterval(forceV,800);
})();

/* PATCH V20.8.1 - LOADING NÃO TRAVA LOGIN */
(function(){
  function setVersion(){
    document.querySelectorAll(".version,.badge-version").forEach(e=>e.textContent="V20.8.1");
  }
  function removeLoading(){
    document.querySelectorAll("#loadingOverlay").forEach(e=>e.remove());
    document.documentElement.classList.remove("loading");
    if(document.body) document.body.classList.remove("loading");
  }
  function showLoading(){
    removeLoading();
    const d=document.createElement("div");
    d.id="loadingOverlay";
    d.innerHTML='<div class="loaderBox">⏳ Processando... aguarde</div>';
    document.body.appendChild(d);
  }
  function isHeavyForm(form){
    const action=(form.getAttribute("action")||"").toLowerCase();
    const path=(location.pathname||"").toLowerCase();
    if(path.includes("/login")) return false;
    if(action.includes("login")) return false;
    if(action.includes("sair") || action.includes("logout")) return false;
    return action.includes("importar") ||
           action.includes("pdf") ||
           action.includes("backup") ||
           action.includes("restaurar") ||
           form.classList.contains("loading-form") ||
           form.dataset.loading==="true";
  }
  window.addEventListener("pageshow", removeLoading);
  window.addEventListener("load", () => setTimeout(removeLoading, 300));
  document.addEventListener("DOMContentLoaded",()=>{
    removeLoading();
    setVersion();
    document.addEventListener("submit", function(ev){
      const form=ev.target;
      if(!form || form.tagName!=="FORM") return;
      if(!isHeavyForm(form)){
        setTimeout(removeLoading, 20);
        return;
      }
      showLoading();
      setTimeout(removeLoading, 45000);
    }, true);
    document.addEventListener("click", function(ev){
      const a=ev.target.closest && ev.target.closest("a,button");
      if(!a) return;
      const txt=(a.textContent||"").toLowerCase();
      const href=(a.getAttribute("href")||"").toLowerCase();
      if(txt.includes("início") || txt.includes("novo chamado") || txt.includes("chamados") ||
         txt.includes("lojas") || txt.includes("prestadores") || txt.includes("voltar") ||
         href==="/" || href.includes("/chamados") || href.includes("/lojas")){
        setTimeout(removeLoading, 20);
      }
    }, true);
  });
  setInterval(setVersion, 1000);
})();

/* PATCH V20.8.1 FRONT */
(function(){function v(){document.querySelectorAll('.version,.badge-version').forEach(e=>e.textContent='V20.8.1')}document.addEventListener('DOMContentLoaded',v);setInterval(v,1000);})();

/* PATCH V20.8.1 FRONT */
(function(){function v(){document.querySelectorAll(".version,.badge-version").forEach(e=>e.textContent="V20.8.1")}document.addEventListener("DOMContentLoaded",v);setInterval(v,1000);})();

/* PATCH V20.8.1 FRONT */
(function(){
  function v(){document.querySelectorAll(".version,.badge-version").forEach(e=>e.textContent="V20.8.1")}
  document.addEventListener("DOMContentLoaded",v);
  setInterval(v,1000);
})();

/* PATCH V20.8.1 FRONT */
(function(){function v(){document.querySelectorAll('.version,.badge-version').forEach(e=>e.textContent='V20.8.1')}document.addEventListener('DOMContentLoaded',v);setInterval(v,1000);})();

/* PATCH V20.8.1 FRONT */
(function(){
  function v(){document.querySelectorAll(".version,.badge-version").forEach(e=>e.textContent="V20.8.1")}
  document.addEventListener("DOMContentLoaded",v);
  setInterval(v,1000);
})();
