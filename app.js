import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

const UPPER=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const SIMBOLOS={sano:'',caries:'C',tratado:'T',ausente:'✕',corona:'Cor',endodoncia:'E',protesis:'P'};
const PROCS=['Impresiones / Escaneo','Mock Up / Provisionales','Preparación de dientes','Colocación de provisionales','Impresiones / Escaneo (final)','Prueba de porcelana terminado','Prueba de rodete','Prueba de enfilado','Instalación de prótesis','Cementación de coronas','Cementación de carillas','Tipo y marca de cemento'];

let pacientes=[],idActual=null,tabActual='datos',estadoDiente='caries',syncTimer=null,modalFn=null;

// DARK MODE
window.toggleDark=function(){
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  document.documentElement.setAttribute('data-theme',isDark?'':'dark');
  document.getElementById('darkBtn').textContent=isDark?'🌙':'☀️';
  localStorage.setItem('ds_theme',isDark?'':'dark');
}
const savedTheme=localStorage.getItem('ds_theme');
if(savedTheme==='dark'){document.documentElement.setAttribute('data-theme','dark');document.getElementById('darkBtn').textContent='☀️';}

// AUTH — Firebase Authentication (Tasks 3.1.1 + 3.1.2)
// Login state is driven by onAuthStateChanged. No sessionStorage gate.
// Accounts are provisioned manually via Firebase Console (Decision B parking-lot default).
onAuthStateChanged(auth, user => {
  document.getElementById('loginBg').style.display = user ? 'none' : 'flex';
});

window.checkLogin = async function(){
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginErr');
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Verificando…';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged hides the login overlay; nothing else to do here.
  } catch (e) {
    err.textContent = 'Credenciales inválidas';
    document.getElementById('loginPass').value = '';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

window.cerrarSesion = async function(){
  try { await signOut(auth); } catch (e) { toast('No se pudo cerrar sesión'); }
}

// MOBILE
window.toggleSidebar=function(){document.getElementById('sidebar').classList.toggle('open')}
function isMobile(){return window.innerWidth<=768}
function checkMobile(){
  const btn=document.getElementById('menuBtn');
  if(btn) btn.style.display=isMobile()?'block':'none';
  const bn=document.getElementById('bottomNav');
  if(bn) bn.style.display=isMobile()?'flex':'none';
}
window.addEventListener('resize',checkMobile);
checkMobile();

// UTILS
function ss(state,label){document.getElementById('syncDot').className='dot '+state;document.getElementById('syncLabel').textContent=label}
function gp(){return pacientes.find(p=>p.id===idActual)}
function g(id){const el=document.getElementById(id);return el?el.value:''}
function e(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function ff(d){if(!d)return'';const[y,m,dd]=d.split('-');const M=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];return`${parseInt(dd)} ${M[parseInt(m)-1]} ${y}`}
function edad(nac){if(!nac)return'';const h=new Date(),n=new Date(nac);let a=h.getFullYear()-n.getFullYear();if(h<new Date(h.getFullYear(),n.getMonth(),n.getDate()))a--;return`${a} años`}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}

// FIRESTORE
onSnapshot(collection(db,'pacientes'),snap=>{
  pacientes=snap.docs.map(d=>({id:d.id,...d.data()}));
  renderLista();
  if(idActual&&gp())renderPaciente();
  ss('ok','Sincronizado');
},()=>ss('err','Sin conexión'));

async function guardar(p){ss('ing','Guardando...');const{id,...data}=p;try{await setDoc(doc(db,'pacientes',id),data);ss('ok','Guardado')}catch(err){ss('err','Error')}}
async function crear(data){ss('ing','Guardando...');try{const ref=await addDoc(collection(db,'pacientes'),data);ss('ok','Guardado');return ref.id}catch(err){ss('err','Error');return null}}
async function borrar(id){try{await deleteDoc(doc(db,'pacientes',id))}catch(err){}}

// EXPORTAR / IMPORTAR
window.exportar=function(){
  const data=JSON.stringify({pacientes,exportado:new Date().toISOString()},null,2);
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  a.download=`docusalud_${new Date().toISOString().slice(0,10)}.json`;a.click();toast('Respaldo exportado');
}
window.importar=async function(ev){
  const file=ev.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async e2=>{
    try{const d=JSON.parse(e2.target.result);if(!d.pacientes){alert('Archivo inválido');return}
      if(!confirm(`¿Importar ${d.pacientes.length} pacientes?`))return;
      const ex=new Set(pacientes.map(p=>p.id));let count=0;
      for(const p of d.pacientes){if(!ex.has(p.id)){const{id,...data}=p;await setDoc(doc(db,'pacientes',p.id),data);count++}}
      toast(`${count} pacientes importados`);
    }catch(err){alert('Error al leer el archivo')}
  };reader.readAsText(file);ev.target.value='';
}

// LISTA
function renderLista(){
  const q=(document.getElementById('search').value||'').toLowerCase();
  const f=pacientes.filter(p=>p.nombre.toLowerCase().includes(q)||(p.ci||'').includes(q)).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  document.getElementById('plist').innerHTML=f.length===0?'<p style="font-size:12px;color:var(--text3);padding:10px 8px">Sin resultados</p>':
    f.map(p=>`<div class="pi${p.id===idActual?' on':''}" onclick="seleccionar('${p.id}')"><div class="pn">${e(p.nombre)}</div><div class="pm">${e(p.ci||'Sin CI')} · ${(p.consultas||[]).length} consulta${(p.consultas||[]).length!==1?'s':''}</div></div>`).join('');
  document.getElementById('sfooter').textContent=`${pacientes.length} paciente${pacientes.length!==1?'s':''}`;
}
window.filtrar=function(){renderLista()}
window.seleccionar=function(id){
  idActual=id;tabActual='datos';renderLista();renderPaciente();
  if(isMobile()) document.getElementById('sidebar').classList.remove('open');
}

// PACIENTE
function logoSVG(size=28){return`<svg width="${size}" height="${size}" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="52" height="52" rx="12" fill="#1F3A2A"/><rect x="14" y="9" width="24" height="34" rx="3" fill="#DCE3D2" opacity="0.15" stroke="#DCE3D2" stroke-width="1.5"/><rect x="20" y="6" width="12" height="6" rx="2" fill="#1F3A2A" stroke="#DCE3D2" stroke-width="1.5"/><line x1="19" y1="22" x2="33" y2="22" stroke="#DCE3D2" stroke-width="1.5" stroke-linecap="round"/><line x1="19" y1="27" x2="33" y2="27" stroke="#DCE3D2" stroke-width="1.5" stroke-linecap="round"/><line x1="24" y1="17" x2="28" y2="17" stroke="#DCE3D2" stroke-width="2" stroke-linecap="round"/><line x1="26" y1="15" x2="26" y2="19" stroke="#DCE3D2" stroke-width="2" stroke-linecap="round"/><line x1="19" y1="33" x2="28" y2="33" stroke="#DCE3D2" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/></svg>`}

function renderPaciente(){
  const p=gp();if(!p)return;
  const ini=p.nombre.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const tabs=[{k:'datos',l:'Datos personales'},{k:'clinico',l:'Historia clínica'},{k:'odonto',l:'Odontograma'},{k:'plan',l:'Plan de tratamiento'},{k:'ops',l:'Operatorias'},{k:'est',l:'Proc. estéticos'},{k:'rec',l:'Récord'},{k:'cons',l:`Consultas <span class="badge">${(p.consultas||[]).length}</span>`}];
  document.getElementById('mainArea').innerHTML=`
    <div class="phdr"><div class="pav">${ini}</div><div><div class="phn">${e(p.nombre)}</div><div class="phm">${edad(p.nacimiento)}${edad(p.nacimiento)&&p.ci?' · ':''}${e(p.ci||'')}${p.telefono?' · '+e(p.telefono):''}</div></div></div>
    <div class="tabbar">${tabs.map(t=>`<button class="tab${tabActual===t.k?' on':''}" onclick="cambiarTab('${t.k}')">${t.l}</button>`).join('')}</div>
    <div class="panel" id="panel"></div>`;
  renderTab();
}
window.cambiarTab=function(tab){tabActual=tab;document.querySelectorAll('.tab').forEach((b,i)=>{const k=['datos','clinico','odonto','plan','ops','est','rec','cons'];b.classList.toggle('on',k[i]===tab)});renderTab()}
function renderTab(){const t=tabActual;if(t==='datos')renderDatos();else if(t==='clinico')renderClinico();else if(t==='odonto')renderOdonto();else if(t==='plan')renderPlan();else if(t==='ops')renderOps();else if(t==='est')renderEst();else if(t==='rec')renderRec();else if(t==='cons')renderCons()}

// DATOS
function renderDatos(){const p=gp();document.getElementById('panel').innerHTML=`
  <div class="card"><div class="ct">Datos personales</div>
    <div class="fg"><div class="f full"><label>Nombre y Apellido</label><input id="d_n" value="${e(p.nombre||'')}"></div></div>
    <div class="fg3"><div class="f"><label>Fecha de nacimiento</label><input type="date" id="d_nac" value="${e(p.nacimiento||'')}"></div><div class="f"><label>CI</label><input id="d_ci" value="${e(p.ci||'')}"></div><div class="f"><label>Sexo</label><select id="d_sx"><option value="">—</option><option value="F"${p.sexo==='F'?' selected':''}>Femenino</option><option value="M"${p.sexo==='M'?' selected':''}>Masculino</option><option value="O"${p.sexo==='O'?' selected':''}>Otro</option></select></div></div>
    <div class="fg"><div class="f"><label>Teléfono</label><input id="d_t1" value="${e(p.telefono||'')}"></div><div class="f"><label>Teléfono 2</label><input id="d_t2" value="${e(p.telefono2||'')}"></div></div>
    <div class="fg"><div class="f full"><label>Correo electrónico</label><input id="d_em" value="${e(p.email||'')}"></div></div>
  </div>
  <div style="display:flex;gap:8px"><button class="bs" onclick="guardarDatos()">Guardar</button><button class="bd" onclick="eliminarP()">Eliminar paciente</button></div>`}
window.guardarDatos=async function(){const p=gp();p.nombre=g('d_n')||p.nombre;p.nacimiento=g('d_nac');p.ci=g('d_ci');p.sexo=g('d_sx');p.telefono=g('d_t1');p.telefono2=g('d_t2');p.email=g('d_em');await guardar(p);renderLista();toast('Guardado')}
window.eliminarP=async function(){if(!confirm(`¿Eliminar a "${gp().nombre}"?`))return;await borrar(idActual);idActual=null;renderLista();document.getElementById('mainArea').innerHTML=`<div class="panel"><div class="empty">${logoSVG(52)}<h3>DocuSalud</h3><p>Selecciona un paciente.</p></div></div>`}

// HISTORIA CLINICA
function renderClinico(){const p=gp();document.getElementById('panel').innerHTML=`
  <div class="card"><div class="ct">Historia clínica</div>
    <div class="f" style="margin-bottom:10px"><label>Motivo de consulta</label><textarea id="c_mo">${e(p.motivo||'')}</textarea></div>
    <div class="f" style="margin-bottom:10px"><label>Antecedentes</label><textarea id="c_an">${e(p.antecedentes||'')}</textarea></div>
    <div class="f" style="margin-bottom:10px"><label>Patologías</label><textarea id="c_pa">${e(p.patologias||'')}</textarea></div>
    <div class="f" style="margin-bottom:10px"><label>Observaciones en la oclusión</label><textarea id="c_oc">${e(p.oclusion||'')}</textarea></div>
    <div class="f"><label>Diagnóstico</label><textarea id="c_di">${e(p.diagnostico||'')}</textarea></div>
  </div><button class="bs" onclick="guardarClinico()">Guardar</button>`}
window.guardarClinico=async function(){const p=gp();p.motivo=g('c_mo');p.antecedentes=g('c_an');p.patologias=g('c_pa');p.oclusion=g('c_oc');p.diagnostico=g('c_di');await guardar(p);toast('Guardado')}

// ODONTOGRAMA
function renderOdonto(){const p=gp();const est=estadoDiente;
  const legs=[{k:'caries',l:'Caries',bg:'var(--danger-light)',bc:'rgba(184,85,62,0.4)'},{k:'tratado',l:'Tratado',bg:'var(--accent-light)',bc:'var(--accent-border)'},{k:'ausente',l:'Ausente',bg:'var(--surface2)',bc:'var(--border)'},{k:'corona',l:'Corona',bg:'var(--info-light)',bc:'rgba(74,107,124,0.35)'},{k:'endodoncia',l:'Endodoncia',bg:'var(--warn-light)',bc:'rgba(201,169,97,0.4)'},{k:'protesis',l:'Prótesis',bg:'#F0EBF7',bc:'rgba(120,80,160,0.3)'},{k:'sano',l:'Restablecer',bg:'var(--surface2)',bc:'var(--border)'}];
  function br(nums){const mid=nums.length/2;return nums.map((n,i)=>{const st=(p.teeth||{})[n]||'sano';return`${i===mid?'<div class="ml"></div>':''}<div class="tooth ${st}" onclick="mDiente(${n})" oncontextmenu="rDiente(event,${n})" title="Diente ${n}"><span class="tn">${n}</span><span class="ts">${SIMBOLOS[st]||''}</span></div>`}).join('')}
  document.getElementById('panel').innerHTML=`
  <div class="card"><div class="ct">Odontograma</div>
    <div class="tleg">${legs.map(l=>`<div class="leg${l.k===est?' sel':''}" onclick="setEst('${l.k}')"><div class="ld" style="background:${l.bg};border-color:${l.bc}"></div>${l.l}</div>`).join('')}</div>
    <div class="ow"><span class="al">Superior</span><div class="tr">${br(UPPER)}</div><div style="height:8px"></div><div class="tr">${br(LOWER)}</div><span class="al">Inferior</span></div>
    <p style="font-size:11px;color:var(--text3);text-align:center;margin-top:10px">Selecciona un estado y haz clic en el diente · Clic derecho para restablecer</p>
    <div class="f" style="margin-top:14px"><label>Observaciones</label><textarea id="o_ob">${e(p.teeth_obs||'')}</textarea></div>
    <button class="bs" style="margin-top:10px" onclick="guardarObs()">Guardar observaciones</button>
  </div>`}
window.setEst=function(st){estadoDiente=st;renderOdonto()}
window.mDiente=async function(n){const p=gp();if(!p.teeth)p.teeth={};if(estadoDiente==='sano')delete p.teeth[n];else p.teeth[n]=estadoDiente;await guardar(p);renderOdonto()}
window.rDiente=async function(ev,n){ev.preventDefault();const p=gp();if(p.teeth)delete p.teeth[n];await guardar(p);renderOdonto()}
window.guardarObs=async function(){const p=gp();p.teeth_obs=g('o_ob');await guardar(p);toast('Guardado')}

// PLAN
function renderPlan(){const p=gp();document.getElementById('panel').innerHTML=`
  <div class="card"><div class="ct">Plan de tratamiento</div>
    <div class="f" style="margin-bottom:10px"><label>Plan de tratamiento</label><textarea id="pt_pl" style="min-height:90px">${e(p.plan||'')}</textarea></div>
    <div class="f"><label>Plan aceptado por el/la paciente</label><textarea id="pt_ac">${e(p.plan_aceptado||'')}</textarea></div>
  </div>
  <div class="card"><div class="ct">Otros tratamientos por especialistas</div>
    <div style="overflow-x:auto"><table class="rtbl" style="min-width:360px"><thead><tr><th>Odontólogo</th><th>Tratamiento</th><th></th></tr></thead><tbody id="esp-body"></tbody></table></div>
    <button class="ba" style="margin-top:10px" onclick="addEsp()">+ Agregar especialista</button>
  </div>
  <div class="card"><div class="ct">Restauración / Prótesis</div>
    <div class="fg"><div class="f full"><label>Tipo de restauración o prótesis</label><input id="pt_re" value="${e(p.restauracion||'')}"></div></div>
    <div class="fg"><div class="f"><label>Material elegido</label><input id="pt_ma" value="${e(p.material||'')}"></div><div class="f"><label>Color dental</label><input id="pt_cd" value="${e(p.color_dental||'')}"></div></div>
    <div class="fg"><div class="f"><label>Color deseado</label><input id="pt_cs" value="${e(p.color_deseado||'')}"></div><div class="f"><label>Laboratorio / Técnico</label><input id="pt_la" value="${e(p.laboratorio||'')}"></div></div>
    <div class="f" style="margin-bottom:10px"><label>Indicaciones al técnico dental</label><textarea id="pt_in">${e(p.indicaciones_tecnico||'')}</textarea></div>
    <div class="f"><label>Observaciones importantes</label><textarea id="pt_ob">${e(p.obs_importantes||'')}</textarea></div>
  </div>
  <div class="card"><div class="ct">Firmas</div>
    <div class="fr"><div class="fb"><div class="fl">Firma del paciente</div></div><div class="fb"><div class="fl">Firma del odontólogo</div></div></div>
  </div>
  <button class="bs" onclick="guardarPlan()">Guardar</button>`;renderEspTbl()}
function renderEspTbl(){const p=gp();const esp=p.especialistas||[];const tb=document.getElementById('esp-body');if(!tb)return;
  tb.innerHTML=esp.length===0?`<tr><td colspan="3" style="font-size:12px;color:var(--text3);padding:8px 10px">Sin especialistas.</td></tr>`:
    esp.map((x,i)=>`<tr><td><input value="${e(x.odontologo||'')}" onchange="updEsp(${i},'odontologo',this.value)" style="width:100%;padding:5px 7px;font-size:12px;border:var(--border-default);border-radius:6px;background:var(--surface2);font-family:'DM Sans',sans-serif;color:var(--text);outline:none"></td><td><input value="${e(x.tratamiento||'')}" onchange="updEsp(${i},'tratamiento',this.value)" style="width:100%;padding:5px 7px;font-size:12px;border:var(--border-default);border-radius:6px;background:var(--surface2);font-family:'DM Sans',sans-serif;color:var(--text);outline:none"></td><td><button class="bdel" onclick="delEsp(${i})">✕</button></td></tr>`).join('')}
window.addEsp=async function(){const p=gp();if(!p.especialistas)p.especialistas=[];p.especialistas.push({odontologo:'',tratamiento:''});await guardar(p);renderEspTbl()}
window.updEsp=function(i,k,v){const p=gp();if(p.especialistas&&p.especialistas[i])p.especialistas[i][k]=v;clearTimeout(syncTimer);syncTimer=setTimeout(()=>guardar(p),700)}
window.delEsp=async function(i){const p=gp();p.especialistas.splice(i,1);await guardar(p);renderEspTbl()}
window.guardarPlan=async function(){const p=gp();p.plan=g('pt_pl');p.plan_aceptado=g('pt_ac');p.restauracion=g('pt_re');p.material=g('pt_ma');p.color_dental=g('pt_cd');p.color_deseado=g('pt_cs');p.laboratorio=g('pt_la');p.indicaciones_tecnico=g('pt_in');p.obs_importantes=g('pt_ob');await guardar(p);toast('Guardado')}

// OPERATORIAS
function renderOps(){const p=gp();const ops=p.operatorias||[];
  const rows=Array.from({length:Math.max(ops.length+2,6)},(_,i)=>{const o=ops[i]||{ud:'',fibra:'',color:'',marca:''};return`<tr><td><input value="${e(o.ud)}" onchange="updOp(${i},'ud',this.value)"></td><td><input value="${e(o.fibra)}" onchange="updOp(${i},'fibra',this.value)"></td><td><input value="${e(o.color)}" onchange="updOp(${i},'color',this.value)"></td><td><input value="${e(o.marca)}" onchange="updOp(${i},'marca',this.value)"></td></tr>`}).join('');
  document.getElementById('panel').innerHTML=`
  <div class="card"><div class="ct">Operatorias realizadas</div>
    <div style="overflow-x:auto"><table class="otbl" style="min-width:480px"><thead><tr><th>Unidad Dentaria</th><th>Fibra de vidrio</th><th>Color resinas</th><th>Marca resina</th></tr></thead><tbody>${rows}</tbody></table></div>
    <button class="ba" style="margin-top:10px" onclick="addOp()">+ Agregar fila</button>
  </div>`}
window.updOp=function(i,k,v){const p=gp();if(!p.operatorias)p.operatorias=[];while(p.operatorias.length<=i)p.operatorias.push({ud:'',fibra:'',color:'',marca:''});p.operatorias[i][k]=v;clearTimeout(syncTimer);syncTimer=setTimeout(()=>guardar(p),700)}
window.addOp=async function(){const p=gp();if(!p.operatorias)p.operatorias=[];p.operatorias.push({ud:'',fibra:'',color:'',marca:''});await guardar(p);renderOps()}

// ESTETICO
function renderEst(){const p=gp();const pr=p.procs||{};
  const rows=PROCS.map(proc=>{const k=proc.replace(/[^a-z0-9]/gi,'_').toLowerCase();const d=pr[k]||{fecha:'',obs:''};return`<tr><td>${proc}</td><td><input type="date" value="${e(d.fecha)}" onchange="updProc('${k}','fecha',this.value)"></td><td><input value="${e(d.obs)}" placeholder="Observaciones..." onchange="updProc('${k}','obs',this.value)"></td></tr>`}).join('');
  document.getElementById('panel').innerHTML=`
  <div class="card"><div class="ct">Procedimientos estéticos / protésicos</div>
    <div style="overflow-x:auto"><table class="ptbl" style="min-width:480px"><thead><tr><th>Procedimiento</th><th>Fecha</th><th>Observaciones</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>`}
window.updProc=function(k,f,v){const p=gp();if(!p.procs)p.procs={};if(!p.procs[k])p.procs[k]={fecha:'',obs:''};p.procs[k][f]=v;clearTimeout(syncTimer);syncTimer=setTimeout(()=>guardar(p),700)}

// RECORD
function renderRec(){const p=gp();const recs=[...(p.records||[])].sort((a,b)=>b.fecha.localeCompare(a.fecha));
  document.getElementById('panel').innerHTML=`
  <button class="ba" onclick="modalRec()">+ Agregar registro</button>
  <div class="card" style="padding:0;overflow:hidden"><div style="overflow-x:auto">
    <table class="rtbl" style="min-width:380px"><thead><tr><th style="width:110px">Fecha</th><th>Tratamiento realizado</th><th style="width:36px"></th></tr></thead>
    <tbody>${recs.length===0?'<tr><td colspan="3" style="font-size:12px;color:var(--text3);padding:12px">Sin registros aún.</td></tr>':recs.map(r=>`<tr><td style="white-space:nowrap;color:var(--text3);font-size:11px;letter-spacing:0.02em">${ff(r.fecha)}</td><td>${e(r.tratamiento)}</td><td><button class="bdel" onclick="delRec('${r.id}')">✕</button></td></tr>`).join('')}</tbody>
    </table></div></div>`}
window.modalRec=function(){const hoy=new Date().toISOString().split('T')[0];
  abrirModal('Nuevo registro',`<div class="mf"><label>Fecha</label><input type="date" id="m_fe" value="${hoy}"></div><div class="mf"><label>Tratamiento realizado</label><textarea id="m_tr" placeholder="Describe el tratamiento..."></textarea></div>`,
    async()=>{const tr=g('m_tr').trim();if(!tr){alert('Ingresa el tratamiento.');return}const p=gp();if(!p.records)p.records=[];p.records.push({id:Date.now().toString(),fecha:g('m_fe'),tratamiento:tr});await guardar(p);cerrarModal();renderRec();toast('Registro agregado')})}
window.delRec=async function(rid){if(!confirm('¿Eliminar este registro?'))return;const p=gp();p.records=(p.records||[]).filter(r=>r.id!==rid);await guardar(p);renderRec()}

// CONSULTAS
function renderCons(){const p=gp();const sorted=[...(p.consultas||[])].sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const total=(p.consultas||[]).reduce((s,c)=>s+(parseFloat(c.costo)||0),0);
  let html=`<button class="ba" onclick="modalCons()">+ Nueva consulta</button>`;
  if(sorted.length>0)html+=`<p style="font-size:12px;color:var(--text2);margin-bottom:14px;letter-spacing:0.02em">Total acumulado: <strong style="color:var(--forest)">$${total.toLocaleString()}</strong></p>`;
  else html+=`<p style="font-size:13px;color:var(--text3)">Sin consultas registradas aún.</p>`;
  sorted.forEach(c=>{html+=`<div class="cc"><div class="cch"><div><div class="ccd">${ff(c.fecha)}</div><div class="cct">${e(c.tratamiento)}</div></div><div style="display:flex;gap:6px;align-items:center">${c.costo?`<span class="ccc">$${parseFloat(c.costo).toLocaleString()}</span>`:''}<button class="bdel" onclick="delCons('${c.id}')">✕</button></div></div>${c.notas?`<div class="ccn">${e(c.notas)}</div>`:''}${c.dientes?`<div style="font-size:11px;color:var(--text3);margin-top:4px;letter-spacing:0.02em">Dientes: ${e(c.dientes)}</div>`:''}</div>`});
  document.getElementById('panel').innerHTML=html;}
window.modalCons=function(){const hoy=new Date().toISOString().split('T')[0];
  abrirModal('Nueva consulta',`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="mf"><label>Fecha</label><input type="date" id="m_fe" value="${hoy}"></div><div class="mf"><label>Costo ($)</label><input type="number" id="m_co" placeholder="0"></div></div><div class="mf"><label>Tratamiento realizado *</label><input id="m_tr" placeholder="Limpieza, extracción..."></div><div class="mf"><label>Dientes involucrados</label><input id="m_di" placeholder="Ej: 16, 17"></div><div class="mf"><label>Notas clínicas</label><textarea id="m_no" placeholder="Observaciones..."></textarea></div>`,
    async()=>{const tr=g('m_tr').trim();if(!tr){alert('El tratamiento es obligatorio.');return}const p=gp();if(!p.consultas)p.consultas=[];p.consultas.push({id:Date.now().toString(),fecha:g('m_fe'),tratamiento:tr,notas:g('m_no'),costo:g('m_co'),dientes:g('m_di')});await guardar(p);cerrarModal();renderLista();renderCons();toast('Consulta registrada')})}
window.delCons=async function(cid){if(!confirm('¿Eliminar esta consulta?'))return;const p=gp();p.consultas=(p.consultas||[]).filter(c=>c.id!==cid);await guardar(p);renderLista();renderCons()}

// MODAL
function abrirModal(titulo,body,fn){modalFn=fn;const div=document.createElement('div');div.className='mbg';div.id='MB';div.innerHTML=`<div class="mbox"><h3>${titulo}</h3>${body}<div class="mact"><button class="bc" onclick="cerrarModal()">Cancelar</button><button class="bs" onclick="confirmarModal()">Guardar</button></div></div>`;document.body.appendChild(div)}
function cerrarModal(){const m=document.getElementById('MB');if(m)m.remove()}
function confirmarModal(){if(modalFn)modalFn()}
window.cerrarModal=cerrarModal;
window.confirmarModal=confirmarModal;

window.modalNuevo=function(){
  abrirModal('Nuevo paciente',`<div class="mf"><label>Nombre completo *</label><input id="m_no" placeholder="Nombre y apellidos"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="mf"><label>CI</label><input id="m_ci" placeholder="0000000"></div><div class="mf"><label>Teléfono</label><input id="m_te" placeholder="000-000-0000"></div></div><div class="mf"><label>Fecha de nacimiento</label><input type="date" id="m_na"></div>`,
    async()=>{const nombre=g('m_no').trim();if(!nombre){alert('El nombre es obligatorio.');return}
      const data={nombre,ci:g('m_ci'),telefono:g('m_te'),nacimiento:g('m_na'),telefono2:'',email:'',sexo:'',motivo:'',antecedentes:'',patologias:'',oclusion:'',diagnostico:'',plan:'',plan_aceptado:'',restauracion:'',material:'',color_dental:'',color_deseado:'',laboratorio:'',indicaciones_tecnico:'',obs_importantes:'',teeth:{},teeth_obs:'',operatorias:[],procs:{},especialistas:[],records:[],consultas:[]};
      const newId=await crear(data);if(newId){idActual=newId;cerrarModal();toast('Paciente creado')}})}

ss('ing','Conectando...');
