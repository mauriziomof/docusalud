import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const UPPER=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const DECIDUOUS_UPPER=[55,54,53,52,51,61,62,63,64,65];
const DECIDUOUS_LOWER=[85,84,83,82,81,71,72,73,74,75];
const SIMBOLOS={sano:'',caries:'C',tratado:'T',ausente:'✕',corona:'Cor',endodoncia:'E',protesis:'P'};
const SURFACE_KEYS=['m','d','o','v','l'];
const SURFACE_LABELS={m:'Mesial',d:'Distal',o:'Oclusal',v:'Vestibular',l:'Palatal/Lingual'};
const PROCS_GROUPED=[
  {label:'Diagnóstico y planificación',procs:['Impresiones / Escaneo','Mock Up / Provisionales','Preparación de dientes']},
  {label:'Pruebas',procs:['Colocación de provisionales','Impresiones / Escaneo (final)','Prueba de porcelana terminado','Prueba de rodete','Prueba de enfilado']},
  {label:'Instalación',procs:['Instalación de prótesis','Cementación de coronas','Cementación de carillas','Tipo y marca de cemento']}
];
const PROC_NO_DATE=new Set(['tipo_y_marca_de_cemento']);
const VITA_SHADES=['A1','A2','A3','A3.5','A4','B1','B2','B3','B4','C1','C2','C3','C4','D2','D3','D4','OM1','OM2','OM3','BL1','BL2','BL3','BL4'];
const FIBRA_OPTIONS=['Sí','No','N/A'];
const ESPECIALIDADES=[
  {key:'general',label:'General'},
  {key:'endodoncia',label:'Endodoncia'},
  {key:'ortodoncia',label:'Ortodoncia'},
  {key:'periodoncia',label:'Periodoncia'},
  {key:'cirugia',label:'Cirugía'},
  {key:'prostodoncia',label:'Prostodoncia'}
];
const SPECIALTY_SCHEMAS={
  endodoncia:[
    {key:'pulpa',label:'Estado pulpar',type:'select',options:['','Vital','No vital','Necrótica']},
    {key:'pruebas_termicas',label:'Pruebas térmicas',type:'textarea'},
    {key:'tratamiento_endo',label:'Tratamiento endodóntico',type:'textarea'}
  ],
  ortodoncia:[
    {key:'cefalometria',label:'Mediciones cefalométricas',type:'textarea'},
    {key:'aparatologia',label:'Aparatología',type:'select',options:['','Brackets','Alineadores','Removible','Otro']},
    {key:'objetivos',label:'Objetivos del tratamiento',type:'textarea'}
  ],
  periodoncia:[
    {key:'profundidad_sondaje',label:'Profundidad de sondaje',type:'textarea'},
    {key:'sangrado',label:'Sangrado al sondaje',type:'select',options:['','Sí','No','Localizado']},
    {key:'movilidad',label:'Movilidad dental',type:'textarea'}
  ],
  cirugia:[
    {key:'cirugia_planificada',label:'Cirugía planificada',type:'textarea'},
    {key:'consentimiento',label:'Consentimiento informado',type:'select',options:['','Pendiente','Firmado','N/A']},
    {key:'medicacion',label:'Medicación pre/post',type:'textarea'}
  ],
  prostodoncia:[
    {key:'tipo_protesis',label:'Tipo de prótesis',type:'select',options:['','Fija','Removible parcial','Removible total','Sobre implantes']},
    {key:'arcada',label:'Arcada',type:'select',options:['','Superior','Inferior','Ambas']},
    {key:'pasos_completados',label:'Pasos completados',type:'textarea'}
  ]
};

// ─── STATE ────────────────────────────────────────────────────────────────
let pacientes=[],idActual=null,tabActual='datos',estadoDiente='caries',modalFn=null;
let viewActual='paciente';
let calendarDate=new Date();
let consultasIndex=new Map();
let odontoMode=null;
let surfaceMode=false;
const autosaveTimers={};
const autosaveStatusTimers={};
let searchDebounce=null;
let currentFilter='';
const accessLogged=new Set();

// ─── DARK MODE ────────────────────────────────────────────────────────────
window.toggleDark=function(){
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  document.documentElement.setAttribute('data-theme',isDark?'':'dark');
  document.getElementById('darkBtn').textContent=isDark?'🌙':'☀️';
  localStorage.setItem('ds_theme',isDark?'':'dark');
}
const savedTheme=localStorage.getItem('ds_theme');
if(savedTheme==='dark'){document.documentElement.setAttribute('data-theme','dark');document.getElementById('darkBtn').textContent='☀️';}

// ─── AUTH ─────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  document.getElementById('loginBg').style.display = user ? 'none' : 'flex';
});

window.checkLogin = async function(){
  const email=document.getElementById('loginEmail').value.trim();
  const pass=document.getElementById('loginPass').value;
  const btn=document.getElementById('loginBtn');
  const err=document.getElementById('loginErr');
  err.textContent='';
  btn.disabled=true;
  btn.textContent='Verificando…';
  try{
    await signInWithEmailAndPassword(auth,email,pass);
  }catch(e){
    err.textContent='Credenciales inválidas';
    document.getElementById('loginPass').value='';
  }finally{
    btn.disabled=false;
    btn.textContent='Entrar';
  }
}

window.cerrarSesion = async function(){
  try{await signOut(auth);}catch(e){toast('No se pudo cerrar sesión');}
}

// ─── MOBILE ───────────────────────────────────────────────────────────────
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

// ─── UTILS ────────────────────────────────────────────────────────────────
function ss(state,label){const d=document.getElementById('syncDot');const l=document.getElementById('syncLabel');if(d)d.className='dot '+state;if(l)l.textContent=label}
function gp(){return pacientes.find(p=>p.id===idActual)}
function g(id){const el=document.getElementById(id);return el?el.value:''}
function e(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function ff(d){if(!d)return'';const[y,m,dd]=d.split('-');const M=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];return`${parseInt(dd)} ${M[parseInt(m)-1]} ${y}`}
function edad(nac){if(!nac)return'';const a=edadAnios(nac);return a===null?'':`${a} años`}
function edadAnios(nac){if(!nac)return null;const h=new Date(),n=new Date(nac);let a=h.getFullYear()-n.getFullYear();if(h<new Date(h.getFullYear(),n.getMonth(),n.getDate()))a--;return a}
function hoy(){return new Date().toISOString().split('T')[0]}
function ahora(){const d=new Date();return d.toTimeString().slice(0,5)}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}

// ─── AUTOSAVE (3.5.1, 3.5.2, 3.5.3, 3.6.8) ────────────────────────────────
function getDebounce(){return isMobile()?3000:1000}
function autosave(formKey,getData,statusElId){
  if(autosaveTimers[formKey])clearTimeout(autosaveTimers[formKey]);
  if(statusElId)updateSaveStatus(statusElId,'pending');
  autosaveTimers[formKey]=setTimeout(async()=>{
    if(statusElId)updateSaveStatus(statusElId,'saving');
    try{
      const data=getData();
      if(data)await guardar(data);
      if(statusElId)updateSaveStatus(statusElId,'saved');
    }catch(err){
      if(statusElId)updateSaveStatus(statusElId,'error');
    }
  },getDebounce());
}
function updateSaveStatus(id,state){
  const el=document.getElementById(id);
  if(!el)return;
  if(autosaveStatusTimers[id])clearTimeout(autosaveStatusTimers[id]);
  el.classList.remove('saving','saved','error','pending');
  el.classList.add(state);
  if(state==='pending'){el.textContent='Sin guardar';}
  else if(state==='saving'){el.textContent='Guardando…';}
  else if(state==='saved'){
    el.dataset.savedAt=Date.now();
    el.textContent='Guardado';
    autosaveStatusTimers[id]=setTimeout(()=>tickSavedTime(id),5000);
  }
  else if(state==='error'){el.textContent='Error al guardar';}
}
function tickSavedTime(id){
  const el=document.getElementById(id);
  if(!el||!el.dataset.savedAt)return;
  const seconds=Math.floor((Date.now()-parseInt(el.dataset.savedAt))/1000);
  if(seconds<5)el.textContent='Guardado';
  else if(seconds<60)el.textContent=`Guardado hace ${seconds}s`;
  else el.textContent=`Guardado hace ${Math.floor(seconds/60)} min`;
  autosaveStatusTimers[id]=setTimeout(()=>tickSavedTime(id),5000);
}
function statusEl(formKey){
  return `<span class="save-status" id="ss-${formKey}"></span>`;
}

// ─── FIRESTORE ────────────────────────────────────────────────────────────
onSnapshot(collection(db,'pacientes'),snap=>{
  pacientes=snap.docs.map(d=>({id:d.id,...d.data()}));
  rebuildConsultasIndex();
  renderLista();
  rerenderCurrent();
  ss('ok','Sincronizado');
},()=>ss('err','Sin conexión'));

function rerenderCurrent(){
  if(viewActual==='calendario')renderCalendar();
  else if(idActual&&gp())renderPaciente();
  else renderEmpty();
}

async function guardar(p){
  ss('ing','Guardando...');
  const{id,...data}=p;
  try{await setDoc(doc(db,'pacientes',id),data);ss('ok','Guardado');}
  catch(err){ss('err','Error');throw err;}
}
async function crear(data){
  ss('ing','Guardando...');
  try{const ref=await addDoc(collection(db,'pacientes'),data);ss('ok','Guardado');return ref.id;}
  catch(err){ss('err','Error');return null;}
}
async function borrar(id){try{await deleteDoc(doc(db,'pacientes',id));}catch(err){}}

async function ciExists(ci, excludeId){
  if(!ci||ci==='V-'||ci==='J-'||ci==='E-')return null;
  const q1=query(collection(db,'pacientes'),where('ci','==',ci));
  const snap=await getDocs(q1);
  for(const d of snap.docs){if(d.id!==excludeId)return{id:d.id,...d.data()};}
  return null;
}

// ─── EXPORT / IMPORT (3.7.3) ──────────────────────────────────────────────
window.exportar=function(){
  const data=JSON.stringify({pacientes,exportado:new Date().toISOString()},null,2);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  a.download=`docusalud_${hoy()}.json`;a.click();
  toast('Respaldo exportado');
}
window.importar=async function(ev){
  const file=ev.target.files[0];if(!file)return;
  const isCSV=file.name.toLowerCase().endsWith('.csv');
  const reader=new FileReader();
  reader.onload=async e2=>{
    if(isCSV)await importarCSV(e2.target.result);
    else await importarJSON(e2.target.result);
  };
  reader.readAsText(file);
  ev.target.value='';
}
async function importarJSON(text){
  try{
    const d=JSON.parse(text);
    if(!d.pacientes){alert('Archivo JSON inválido (falta el campo "pacientes").');return;}
    if(!confirm(`¿Importar ${d.pacientes.length} pacientes desde JSON?`))return;
    const ex=new Set(pacientes.map(p=>p.id));
    let count=0;
    for(const p of d.pacientes){
      if(!ex.has(p.id)){
        const{id,...data}=p;
        await setDoc(doc(db,'pacientes',p.id),data);
        count++;
      }
    }
    toast(`${count} pacientes importados`);
  }catch(err){alert('Error al leer el archivo JSON');}
}
async function importarCSV(text){
  try{
    const rows=parseCSV(text);
    if(rows.length<2){alert('El CSV debe tener al menos una fila de encabezado y una de datos.');return;}
    const header=rows[0].map(h=>h.trim().toLowerCase());
    const colNombre=findCol(header,['nombre','name','paciente']);
    const colCI=findCol(header,['ci','cedula','cédula']);
    const colTel=findCol(header,['telefono','teléfono','phone','celular']);
    const colNac=findCol(header,['nacimiento','fecha_nacimiento','dob','birth']);
    const colSexo=findCol(header,['sexo','sex','genero','género']);
    if(colNombre===-1){alert('CSV sin columna "nombre". Encabezados encontrados: '+header.join(', '));return;}
    const errors=[];
    const records=[];
    for(let i=1;i<rows.length;i++){
      const r=rows[i];
      if(r.length===1&&!r[0].trim())continue;
      const nombre=(r[colNombre]||'').trim();
      if(!nombre){errors.push(`Fila ${i+1}: nombre vacío`);continue;}
      records.push({
        nombre,
        ci:colCI>=0?(r[colCI]||'').trim():'',
        telefono:colTel>=0?(r[colTel]||'').trim():'',
        nacimiento:colNac>=0?(r[colNac]||'').trim():'',
        sexo:colSexo>=0?(r[colSexo]||'').trim():''
      });
    }
    if(errors.length){alert(`Errores antes de importar:\n${errors.slice(0,5).join('\n')}${errors.length>5?'\n…':''}`);return;}
    if(!confirm(`¿Importar ${records.length} pacientes desde CSV?`))return;
    let count=0;
    for(const r of records){
      const data={...r,telefono2:'',email:'',especialidad:'general',motivo:'',antecedentes:'',patologias:'',oclusion:'',diagnostico:'',plan:'',plan_aceptado:'',restauracion:'',material:'',color_dental:'',color_deseado:'',laboratorio:'',indicaciones_tecnico:'',obs_importantes:'',teeth:{},teeth_obs:'',operatorias:[],procs:{},especialistas:[],records:[],consultas:[],firmas:{}};
      await addDoc(collection(db,'pacientes'),data);
      count++;
    }
    toast(`${count} pacientes importados desde CSV`);
  }catch(err){console.error(err);alert('Error al procesar el CSV');}
}
function parseCSV(text){
  const rows=[];let row=[];let cur='';let inQ=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];const nx=text[i+1];
    if(inQ){
      if(ch==='"'&&nx==='"'){cur+='"';i++;}
      else if(ch==='"'){inQ=false;}
      else cur+=ch;
    }else{
      if(ch==='"'){inQ=true;}
      else if(ch===','){row.push(cur);cur='';}
      else if(ch==='\n'){row.push(cur);rows.push(row);row=[];cur='';}
      else if(ch==='\r'){}
      else cur+=ch;
    }
  }
  if(cur||row.length){row.push(cur);rows.push(row);}
  return rows;
}
function findCol(header,candidates){for(const c of candidates){const i=header.indexOf(c);if(i>=0)return i;}return -1;}

// ─── SEARCH (3.3.1) ───────────────────────────────────────────────────────
window.filtrar=function(){
  clearTimeout(searchDebounce);
  searchDebounce=setTimeout(()=>{
    currentFilter=document.getElementById('search').value.toLowerCase().trim();
    renderLista();
  },150);
}
function highlight(text,q){
  if(!q)return e(text);
  const escaped=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`(${escaped})`,'gi');
  return e(text).replace(re,'<mark>$1</mark>');
}
function matchesSearch(p,q){
  if(!q)return true;
  return ['nombre','ci','telefono','telefono2'].some(k=>(p[k]||'').toLowerCase().includes(q));
}

// ─── LIST ─────────────────────────────────────────────────────────────────
function renderLista(){
  const q=currentFilter;
  const filtered=pacientes.filter(p=>matchesSearch(p,q)).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  document.getElementById('plist').innerHTML=filtered.length===0?
    '<p style="font-size:12px;color:var(--text3);padding:10px 8px">Sin resultados</p>':
    filtered.map(p=>`<div class="pi${p.id===idActual?' on':''}" onclick="seleccionar('${p.id}')">
      <div class="pn">${highlight(p.nombre,q)}</div>
      <div class="pm">${highlight(p.ci||'Sin CI',q)} · ${(p.consultas||[]).length} consulta${(p.consultas||[]).length!==1?'s':''}</div>
    </div>`).join('');
  const footer=q?`${filtered.length} de ${pacientes.length} pacientes`:`${pacientes.length} paciente${pacientes.length!==1?'s':''}`;
  document.getElementById('sfooter').textContent=footer;
}

window.seleccionar=function(id){
  idActual=id;tabActual='datos';viewActual='paciente';
  logAccess(id);
  renderLista();renderPaciente();
  if(isMobile())document.getElementById('sidebar').classList.remove('open');
}

// ─── CONSULTAS INDEX (3.3.3) ──────────────────────────────────────────────
function rebuildConsultasIndex(){
  consultasIndex=new Map();
  for(const p of pacientes){
    for(const c of(p.consultas||[])){
      if(c.fecha&&c.hora){
        const key=c.fecha+' '+c.hora;
        consultasIndex.set(key,{patientId:p.id,patientName:p.nombre,consultaId:c.id});
      }
    }
  }
}

// ─── EMPTY / LANDING (3.3.2) ──────────────────────────────────────────────
function logoSVG(size=28){return`<svg width="${size}" height="${size}" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="52" height="52" rx="12" fill="#1F3A2A"/><rect x="14" y="9" width="24" height="34" rx="3" fill="#DCE3D2" opacity="0.15" stroke="#DCE3D2" stroke-width="1.5"/><rect x="20" y="6" width="12" height="6" rx="2" fill="#1F3A2A" stroke="#DCE3D2" stroke-width="1.5"/><line x1="19" y1="22" x2="33" y2="22" stroke="#DCE3D2" stroke-width="1.5" stroke-linecap="round"/><line x1="19" y1="27" x2="33" y2="27" stroke="#DCE3D2" stroke-width="1.5" stroke-linecap="round"/><line x1="24" y1="17" x2="28" y2="17" stroke="#DCE3D2" stroke-width="2" stroke-linecap="round"/><line x1="26" y1="15" x2="26" y2="19" stroke="#DCE3D2" stroke-width="2" stroke-linecap="round"/><line x1="19" y1="33" x2="28" y2="33" stroke="#DCE3D2" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/></svg>`}

function renderEmpty(){
  const today=hoy();
  const todayConsultas=[];
  for(const p of pacientes){
    for(const c of(p.consultas||[])){
      if(c.fecha===today)todayConsultas.push({...c,patientName:p.nombre,patientId:p.id});
    }
  }
  todayConsultas.sort((a,b)=>(a.hora||'00:00').localeCompare(b.hora||'00:00'));
  let html=`<div class="panel"><div class="landing-grid">
    <div class="empty">
      <div style="opacity:.25">${logoSVG(52)}</div>
      <h3>DocuSalud</h3>
      <p>Selecciona un paciente o crea uno nuevo.</p>
    </div>`;
  if(todayConsultas.length>0){
    html+=`<div class="card today-card">
      <div class="ct">Consultas de hoy · ${todayConsultas.length}</div>
      ${todayConsultas.map(c=>`<div class="today-row" onclick="abrirPacienteConsultas('${c.patientId}')">
        <div class="today-time">${e(c.hora||'--:--')}</div>
        <div class="today-body">
          <div class="today-name">${e(c.patientName)}</div>
          <div class="today-treatment">${e(c.tratamiento||'')}</div>
        </div>
        ${c.costo?`<span class="ccc">$${parseFloat(c.costo).toLocaleString()}</span>`:''}
      </div>`).join('')}
    </div>`;
  }else{
    html+=`<div class="card today-card-empty">
      <div class="ct">Consultas de hoy</div>
      <p style="font-size:13px;color:var(--text3);margin:0">No hay consultas agendadas para hoy.</p>
    </div>`;
  }
  html+=`</div></div>`;
  document.getElementById('mainArea').innerHTML=html;
}

window.abrirPacienteConsultas=function(id){
  viewActual='paciente';idActual=id;tabActual='cons';
  logAccess(id);
  renderLista();renderPaciente();
};

// ─── CALENDAR (3.3.4) ─────────────────────────────────────────────────────
window.toggleCalendar=function(){
  if(viewActual==='calendario'){
    viewActual='paciente';
    if(idActual)renderPaciente();else renderEmpty();
  }else{
    viewActual='calendario';calendarDate=new Date();renderCalendar();
  }
}
function renderCalendar(){
  const dateStr=calendarDate.toISOString().split('T')[0];
  const consultas=[];
  for(const p of pacientes){
    for(const c of(p.consultas||[])){
      if(c.fecha===dateStr)consultas.push({...c,patientName:p.nombre,patientId:p.id});
    }
  }
  consultas.sort((a,b)=>(a.hora||'00:00').localeCompare(b.hora||'00:00'));
  const M=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const dia=calendarDate.getDate();
  const mes=M[calendarDate.getMonth()];
  const anio=calendarDate.getFullYear();
  const isToday=dateStr===hoy();
  document.getElementById('mainArea').innerHTML=`
    <div class="phdr">
      <div style="flex:1">
        <div class="phn">Calendario</div>
        <div class="phm">${dia} de ${mes} de ${anio}${isToday?' · hoy':''}</div>
      </div>
      <button class="ba" onclick="toggleCalendar()">Cerrar calendario</button>
    </div>
    <div class="cal-nav">
      <button class="ba" onclick="calPrev()">‹ Día anterior</button>
      <button class="ba" onclick="calToday()">Hoy</button>
      <button class="ba" onclick="calNext()">Día siguiente ›</button>
    </div>
    <div class="panel">
      ${consultas.length===0?
        `<div class="empty"><h3>Sin consultas</h3><p>No hay consultas agendadas para este día.</p></div>`:
        `<div>${consultas.map(c=>`
          <div class="cc cal-row" onclick="abrirPacienteConsultas('${c.patientId}')">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:14px">
              <div class="cal-time">${e(c.hora||'--:--')}</div>
              <div style="flex:1;min-width:0">
                <div class="cct">${e(c.patientName)}</div>
                <div class="ccn" style="margin-top:2px">${e(c.tratamiento||'')}</div>
              </div>
              ${c.costo?`<span class="ccc">$${parseFloat(c.costo).toLocaleString()}</span>`:''}
            </div>
          </div>`).join('')}
        </div>`}
    </div>`;
}
window.calPrev=function(){calendarDate.setDate(calendarDate.getDate()-1);renderCalendar();};
window.calNext=function(){calendarDate.setDate(calendarDate.getDate()+1);renderCalendar();};
window.calToday=function(){calendarDate=new Date();renderCalendar();};

// ─── PATIENT VIEW ─────────────────────────────────────────────────────────
function renderPaciente(){
  const p=gp();
  if(!p){renderEmpty();return;}
  const ini=p.nombre.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const tabs=[
    {k:'datos',l:'Datos personales'},
    {k:'clinico',l:'Historia clínica'},
    {k:'odonto',l:'Odontograma'},
    {k:'plan',l:'Plan de tratamiento'},
    {k:'ops',l:'Operatorias'},
    {k:'est',l:'Proc. estéticos'},
    {k:'rec',l:'Récord'},
    {k:'cons',l:`Consultas <span class="badge">${(p.consultas||[]).length}</span>`}
  ];
  document.getElementById('mainArea').innerHTML=`
    <div class="phdr">
      <div class="pav">${ini}</div>
      <div style="flex:1;min-width:0">
        <div class="phn">${e(p.nombre)}</div>
        <div class="phm">${edad(p.nacimiento)}${edad(p.nacimiento)&&p.ci?' · ':''}${e(p.ci||'')}${p.telefono?' · '+e(p.telefono):''}</div>
      </div>
      <button class="ba" onclick="volverInicio()" title="Volver al inicio">← Inicio</button>
    </div>
    <div class="tabbar">${tabs.map(t=>`<button class="tab${tabActual===t.k?' on':''}" onclick="cambiarTab('${t.k}')">${t.l}</button>`).join('')}</div>
    <div class="panel" id="panel"></div>`;
  renderTab();
}

window.volverInicio=function(){
  idActual=null;viewActual='paciente';
  renderEmpty();renderLista();
}

window.cambiarTab=function(tab){
  tabActual=tab;
  document.querySelectorAll('.tab').forEach(b=>{
    b.classList.toggle('on',b.textContent.startsWith(tabLabel(tab))||b.textContent.includes(tabLabel(tab)));
  });
  renderTab();
}
function tabLabel(k){
  return{datos:'Datos',clinico:'Historia',odonto:'Odontograma',plan:'Plan',ops:'Operatorias',est:'Proc',rec:'Récord',cons:'Consultas'}[k]||k;
}
function renderTab(){
  const t=tabActual;
  if(t==='datos')renderDatos();
  else if(t==='clinico')renderClinico();
  else if(t==='odonto')renderOdonto();
  else if(t==='plan')renderPlan();
  else if(t==='ops')renderOps();
  else if(t==='est')renderEst();
  else if(t==='rec')renderRec();
  else if(t==='cons')renderCons();
}

// ─── CI INPUT (3.2.1) ─────────────────────────────────────────────────────
function ciInputHTML(id,value=''){
  const m=(value||'').match(/^([VJE])-?(.*)$/);
  const prefix=m?m[1]:'V';
  const num=m?m[2].replace(/\D/g,''):(value||'').replace(/\D/g,'');
  const max=prefix==='J'?9:8;
  return `<div class="ci-input">
    <select id="${id}_p" onchange="updateCIMax('${id}')">
      <option value="V"${prefix==='V'?' selected':''}>V</option>
      <option value="J"${prefix==='J'?' selected':''}>J</option>
      <option value="E"${prefix==='E'?' selected':''}>E</option>
    </select>
    <input id="${id}_n" type="text" inputmode="numeric" value="${e(num)}" maxlength="${max}" oninput="this.value=this.value.replace(/\\D/g,'')" placeholder="0000000">
  </div>`;
}
window.updateCIMax=function(id){
  const p=document.getElementById(id+'_p');
  const inp=document.getElementById(id+'_n');
  if(!p||!inp)return;
  const max=p.value==='J'?9:8;
  inp.maxLength=max;
  if(inp.value.length>max)inp.value=inp.value.slice(0,max);
}
function getCIValue(id){
  const p=document.getElementById(id+'_p');
  const n=document.getElementById(id+'_n');
  if(!p||!n)return '';
  if(!n.value)return '';
  return p.value+'-'+n.value;
}

// Phone input handler (3.2.3)
function phoneInputAttrs(id,value=''){
  return `id="${id}" value="${e(value||'')}" maxlength="15" placeholder="0414-1234567" oninput="this.value=this.value.replace(/[^0-9+\\-() ]/g,'').slice(0,15)"`;
}

// ─── DATOS ────────────────────────────────────────────────────────────────
function renderDatos(){
  const p=gp();
  document.getElementById('panel').innerHTML=`
    <div class="card">
      <div class="ct-row"><div class="ct">Datos personales</div>${statusEl('datos')}</div>
      <div class="fg"><div class="f full"><label>Nombre y Apellido</label><input id="d_n" value="${e(p.nombre||'')}"></div></div>
      <div class="fg3">
        <div class="f"><label>Fecha de nacimiento</label><input type="date" id="d_nac" value="${e(p.nacimiento||'')}"></div>
        <div class="f"><label>Cédula</label>${ciInputHTML('d_ci',p.ci||'')}</div>
        <div class="f"><label>Sexo</label><select id="d_sx">
          <option value="">—</option>
          <option value="F"${p.sexo==='F'?' selected':''}>Femenino</option>
          <option value="M"${p.sexo==='M'?' selected':''}>Masculino</option>
          <option value="O"${p.sexo==='O'?' selected':''}>Otro</option>
        </select></div>
      </div>
      <div class="fg">
        <div class="f"><label>Teléfono</label><input ${phoneInputAttrs('d_t1',p.telefono||'')}></div>
        <div class="f"><label>Teléfono 2</label><input ${phoneInputAttrs('d_t2',p.telefono2||'')}></div>
      </div>
      <div class="fg"><div class="f full"><label>Correo electrónico</label><input id="d_em" value="${e(p.email||'')}"></div></div>
      <div class="fg"><div class="f full"><label>Especialidad</label><select id="d_esp" onchange="autosaveDatos()">
        ${ESPECIALIDADES.map(es=>`<option value="${es.key}"${(p.especialidad||'general')===es.key?' selected':''}>${es.label}</option>`).join('')}
      </select></div></div>
    </div>
    <div style="display:flex;gap:8px"><button class="bd" onclick="eliminarP()">Eliminar paciente</button></div>`;
  // wire autosave
  ['d_n','d_nac','d_ci_p','d_ci_n','d_sx','d_t1','d_t2','d_em','d_esp'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){
      el.addEventListener('input',autosaveDatos);
      el.addEventListener('change',autosaveDatos);
    }
  });
}
window.autosaveDatos=async function(){
  autosave('datos',()=>{
    const p=gp();if(!p)return null;
    p.nombre=g('d_n')||p.nombre;
    p.nacimiento=g('d_nac');
    const newCI=getCIValue('d_ci');
    p.ci=newCI;
    p.sexo=g('d_sx');
    p.telefono=g('d_t1');
    p.telefono2=g('d_t2');
    p.email=g('d_em');
    p.especialidad=g('d_esp')||'general';
    return p;
  },'ss-datos');
}
window.eliminarP=async function(){
  if(!confirm(`¿Eliminar a "${gp().nombre}"? Esta acción no se puede deshacer.`))return;
  await borrar(idActual);
  idActual=null;
  renderLista();
  renderEmpty();
  toast('Paciente eliminado');
}

// ─── HISTORIA CLÍNICA (3.7.1 specialty templates) ─────────────────────────
function renderClinico(){
  const p=gp();
  const esp=p.especialidad||'general';
  const schema=SPECIALTY_SCHEMAS[esp]||[];
  let specialtyHTML='';
  if(schema.length>0){
    const ns=p[`historia_${esp}`]||{};
    specialtyHTML=`<div class="card">
      <div class="ct-row"><div class="ct">Historia · ${ESPECIALIDADES.find(e=>e.key===esp)?.label||esp}</div>${statusEl('clinico-esp')}</div>
      ${schema.map(f=>{
        const v=ns[f.key]||'';
        if(f.type==='select'){
          return `<div class="f" style="margin-bottom:10px"><label>${f.label}</label><select id="ce_${f.key}" onchange="autosaveClinico()">
            ${f.options.map(o=>`<option value="${e(o)}"${v===o?' selected':''}>${e(o)||'—'}</option>`).join('')}
          </select></div>`;
        }
        return `<div class="f" style="margin-bottom:10px"><label>${f.label}</label><textarea id="ce_${f.key}" oninput="autosaveClinico()">${e(v)}</textarea></div>`;
      }).join('')}
    </div>`;
  }
  document.getElementById('panel').innerHTML=`
    <div class="card">
      <div class="ct-row"><div class="ct">Historia clínica</div>${statusEl('clinico')}</div>
      <div class="f" style="margin-bottom:10px"><label>Motivo de consulta</label><textarea id="c_mo" oninput="autosaveClinico()">${e(p.motivo||'')}</textarea></div>
      <div class="f" style="margin-bottom:10px"><label>Antecedentes</label><textarea id="c_an" oninput="autosaveClinico()">${e(p.antecedentes||'')}</textarea></div>
      <div class="f" style="margin-bottom:10px"><label>Patologías</label><textarea id="c_pa" oninput="autosaveClinico()">${e(p.patologias||'')}</textarea></div>
      <div class="f" style="margin-bottom:10px"><label>Observaciones en la oclusión</label><textarea id="c_oc" oninput="autosaveClinico()">${e(p.oclusion||'')}</textarea></div>
      <div class="f"><label>Diagnóstico</label><textarea id="c_di" oninput="autosaveClinico()">${e(p.diagnostico||'')}</textarea></div>
    </div>
    ${specialtyHTML}`;
}
window.autosaveClinico=function(){
  autosave('clinico',()=>{
    const p=gp();if(!p)return null;
    p.motivo=g('c_mo');p.antecedentes=g('c_an');p.patologias=g('c_pa');p.oclusion=g('c_oc');p.diagnostico=g('c_di');
    const esp=p.especialidad||'general';
    const schema=SPECIALTY_SCHEMAS[esp];
    if(schema){
      const ns={};
      for(const f of schema)ns[f.key]=g(`ce_${f.key}`);
      p[`historia_${esp}`]=ns;
    }
    return p;
  },'ss-clinico');
}

// ─── ODONTOGRAMA (3.4.1 age-aware, 3.4.2 surfaces) ────────────────────────
function getOdontoMode(p){
  if(odontoMode)return odontoMode;
  const a=edadAnios(p.nacimiento);
  if(a===null||a>=12)return 'permanente';
  if(a<6)return 'decidua';
  return 'mixta';
}
function getToothState(p,n){
  const t=(p.teeth||{})[n];
  if(!t)return{dominant:'sano',surfaces:null};
  if(typeof t==='string')return{dominant:t,surfaces:null};
  // object form: {m,d,o,v,l}
  const states=SURFACE_KEYS.map(k=>t[k]||'sano').filter(s=>s!=='sano');
  if(states.length===0)return{dominant:'sano',surfaces:t};
  const counts={};
  for(const s of states)counts[s]=(counts[s]||0)+1;
  const dominant=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
  return{dominant,surfaces:t};
}
function renderOdonto(){
  const p=gp();
  const mode=getOdontoMode(p);
  const legs=[
    {k:'caries',l:'Caries',bg:'var(--danger-light)',bc:'rgba(184,85,62,0.4)'},
    {k:'tratado',l:'Tratado',bg:'var(--accent-light)',bc:'var(--accent-border)'},
    {k:'ausente',l:'Ausente',bg:'var(--surface2)',bc:'var(--border)'},
    {k:'corona',l:'Corona',bg:'var(--info-light)',bc:'rgba(74,107,124,0.35)'},
    {k:'endodoncia',l:'Endodoncia',bg:'var(--warn-light)',bc:'rgba(201,169,97,0.4)'},
    {k:'protesis',l:'Prótesis',bg:'#F0EBF7',bc:'rgba(120,80,160,0.3)'},
    {k:'sano',l:'Restablecer',bg:'var(--surface2)',bc:'var(--border)'}
  ];
  function tooth(n,small=false){
    const{dominant,surfaces}=getToothState(p,n);
    const cls=`tooth ${dominant}${small?' tooth-sm':''}${surfaces?' has-surfaces':''}`;
    return `<div class="${cls}" onclick="mDiente(${n})" oncontextmenu="rDiente(event,${n})" title="Diente ${n}">
      <span class="tn">${n}</span>
      <span class="ts">${SIMBOLOS[dominant]||''}</span>
    </div>`;
  }
  function rowHTML(nums,small=false){
    const mid=nums.length/2;
    return nums.map((n,i)=>(i===mid?'<div class="ml"></div>':'')+tooth(n,small)).join('');
  }
  let chart='';
  if(mode==='permanente'){
    chart=`<div class="ow"><span class="al">Superior</span><div class="tr">${rowHTML(UPPER)}</div><div style="height:8px"></div><div class="tr">${rowHTML(LOWER)}</div><span class="al">Inferior</span></div>`;
  }else if(mode==='decidua'){
    chart=`<div class="ow"><span class="al">Superior · Decidua</span><div class="tr">${rowHTML(DECIDUOUS_UPPER)}</div><div style="height:8px"></div><div class="tr">${rowHTML(DECIDUOUS_LOWER)}</div><span class="al">Inferior · Decidua</span></div>`;
  }else{
    chart=`<div class="ow">
      <span class="al">Superior · Permanente</span><div class="tr">${rowHTML(UPPER)}</div>
      <div class="tr-decidua">${rowHTML(DECIDUOUS_UPPER,true)}</div>
      <div style="height:8px"></div>
      <div class="tr-decidua">${rowHTML(DECIDUOUS_LOWER,true)}</div>
      <div class="tr">${rowHTML(LOWER)}</div>
      <span class="al">Inferior · Permanente</span>
    </div>`;
  }
  const a=edadAnios(p.nacimiento);
  const autoMode=a===null||a>=12?'permanente':(a<6?'decidua':'mixta');
  document.getElementById('panel').innerHTML=`
    <div class="card">
      <div class="ct-row"><div class="ct">Odontograma${a!==null?' · '+a+' años':''}</div>${statusEl('odonto')}</div>
      <div class="odonto-controls">
        <label class="ctl-lbl">Dentición:</label>
        <select onchange="setOdontoMode(this.value)">
          <option value="">Auto (${autoMode})</option>
          <option value="permanente"${odontoMode==='permanente'?' selected':''}>Permanente</option>
          <option value="decidua"${odontoMode==='decidua'?' selected':''}>Decidua</option>
          <option value="mixta"${odontoMode==='mixta'?' selected':''}>Mixta</option>
        </select>
        <label class="ctl-lbl"><input type="checkbox" id="surface-mode" ${surfaceMode?'checked':''} onchange="toggleSurfaceMode()"> Modo superficie</label>
      </div>
      <div class="tleg">${legs.map(l=>`<div class="leg${l.k===estadoDiente?' sel':''}" onclick="setEst('${l.k}')"><div class="ld" style="background:${l.bg};border-color:${l.bc}"></div>${l.l}</div>`).join('')}</div>
      ${chart}
      <p style="font-size:11px;color:var(--text3);text-align:center;margin-top:10px">${surfaceMode?'Modo superficie: clic abre el detalle por cara · ':''}Selecciona un estado y haz clic en el diente · Clic derecho para restablecer</p>
      <div class="f" style="margin-top:14px"><label>Observaciones</label><textarea id="o_ob" oninput="autosaveObs()">${e(p.teeth_obs||'')}</textarea></div>
    </div>`;
}
window.setOdontoMode=function(m){odontoMode=m||null;renderOdonto();}
window.toggleSurfaceMode=function(){surfaceMode=document.getElementById('surface-mode').checked;}
window.setEst=function(st){estadoDiente=st;renderOdonto()}
window.mDiente=async function(n){
  const p=gp();if(!p.teeth)p.teeth={};
  if(surfaceMode){abrirSurfaceModal(n);return;}
  if(estadoDiente==='sano')delete p.teeth[n];
  else p.teeth[n]=estadoDiente;
  await guardar(p);renderOdonto();
}
window.rDiente=async function(ev,n){
  ev.preventDefault();
  const p=gp();if(p.teeth)delete p.teeth[n];
  await guardar(p);renderOdonto();
}
window.autosaveObs=function(){
  autosave('odonto',()=>{const p=gp();if(!p)return null;p.teeth_obs=g('o_ob');return p;},'ss-odonto');
}
function abrirSurfaceModal(n){
  const p=gp();
  const cur=(p.teeth||{})[n];
  const surfaces=typeof cur==='object'&&cur!==null?cur:{m:typeof cur==='string'?cur:'sano',d:typeof cur==='string'?cur:'sano',o:typeof cur==='string'?cur:'sano',v:typeof cur==='string'?cur:'sano',l:typeof cur==='string'?cur:'sano'};
  const states=['sano','caries','tratado','ausente','corona','endodoncia','protesis'];
  const body=`<p style="font-size:12px;color:var(--text3);margin-bottom:14px">Diente ${n} — selecciona el estado de cada cara.</p>`+
    SURFACE_KEYS.map(k=>`<div class="mf"><label>${SURFACE_LABELS[k]}</label><select id="surf_${k}">
      ${states.map(s=>`<option value="${s}"${surfaces[k]===s?' selected':''}>${s}</option>`).join('')}
    </select></div>`).join('');
  abrirModal(`Diente ${n} · superficies`,body,async()=>{
    const newSurf={};
    for(const k of SURFACE_KEYS)newSurf[k]=g(`surf_${k}`)||'sano';
    if(SURFACE_KEYS.every(k=>newSurf[k]==='sano')){
      delete p.teeth[n];
    }else{
      p.teeth[n]=newSurf;
    }
    await guardar(p);
    cerrarModal();
    renderOdonto();
  });
}

// ─── PLAN + FIRMAS (3.6.1, 3.6.2) ─────────────────────────────────────────
function renderPlan(){
  const p=gp();
  const f=p.firmas||{};
  document.getElementById('panel').innerHTML=`
    <div class="card">
      <div class="ct-row"><div class="ct">Plan de tratamiento</div>${statusEl('plan')}</div>
      <div class="f" style="margin-bottom:10px"><label>Plan de tratamiento</label><textarea id="pt_pl" style="min-height:90px" oninput="autosavePlan()">${e(p.plan||'')}</textarea></div>
      <div class="f"><label>Plan aceptado por el/la paciente</label><textarea id="pt_ac" oninput="autosavePlan()">${e(p.plan_aceptado||'')}</textarea></div>
    </div>
    <div class="card">
      <div class="ct-row"><div class="ct">Otros tratamientos por especialistas</div>${statusEl('esp')}</div>
      <div style="overflow-x:auto"><table class="rtbl" style="min-width:360px"><thead><tr><th>Odontólogo</th><th>Tratamiento</th><th></th></tr></thead><tbody id="esp-body"></tbody></table></div>
      <button class="ba" style="margin-top:10px" onclick="addEsp()">+ Agregar especialista</button>
    </div>
    <div class="card">
      <div class="ct-row"><div class="ct">Restauración / Prótesis</div>${statusEl('rest')}</div>
      <div class="fg"><div class="f full"><label>Tipo de restauración o prótesis</label><input id="pt_re" value="${e(p.restauracion||'')}" oninput="autosavePlan()"></div></div>
      <div class="fg"><div class="f"><label>Material elegido</label><input id="pt_ma" value="${e(p.material||'')}" oninput="autosavePlan()"></div><div class="f"><label>Color dental</label><input id="pt_cd" value="${e(p.color_dental||'')}" oninput="autosavePlan()"></div></div>
      <div class="fg"><div class="f"><label>Color deseado</label><input id="pt_cs" value="${e(p.color_deseado||'')}" oninput="autosavePlan()"></div><div class="f"><label>Laboratorio / Técnico</label><input id="pt_la" value="${e(p.laboratorio||'')}" oninput="autosavePlan()"></div></div>
      <div class="f" style="margin-bottom:10px"><label>Indicaciones al técnico dental</label><textarea id="pt_in" oninput="autosavePlan()">${e(p.indicaciones_tecnico||'')}</textarea></div>
      <div class="f"><label>Observaciones importantes</label><textarea id="pt_ob" oninput="autosavePlan()">${e(p.obs_importantes||'')}</textarea></div>
    </div>
    <div class="card">
      <div class="ct-row"><div class="ct">Firmas y consentimiento</div>${statusEl('firmas')}</div>
      <div class="firmas-grid">
        <div class="firma-pad-wrap">
          <div class="firma-label">Firma del paciente</div>
          <div class="terms-check"><input type="checkbox" id="firma-tc" ${f.terminos_aceptados?'checked':''} onchange="autosaveFirmas()"> <label for="firma-tc">Acepto los términos y condiciones del tratamiento</label></div>
          <canvas id="canvas-paciente" class="firma-canvas" width="320" height="120"></canvas>
          <div class="firma-actions">
            <button class="ba" onclick="clearFirma('paciente')">Limpiar</button>
            ${f.paciente?`<span style="font-size:11px;color:var(--text3)">Firmada</span>`:''}
          </div>
        </div>
        <div class="firma-pad-wrap">
          <div class="firma-label">Firma del odontólogo</div>
          <div style="height:24px"></div>
          <canvas id="canvas-odontologo" class="firma-canvas" width="320" height="120"></canvas>
          <div class="firma-actions">
            <button class="ba" onclick="clearFirma('odontologo')">Limpiar</button>
            <button class="ba" onclick="usarPresetOdontologo()">Usar guardada</button>
            <button class="ba" onclick="guardarPresetOdontologo()">Guardar como predeterminada</button>
          </div>
        </div>
      </div>
      <p style="font-size:11px;color:var(--text3);margin-top:8px">La firma se almacena como imagen junto con la fecha y la confirmación de términos.</p>
    </div>`;
  renderEspTbl();
  initFirmas(p);
}

function initFirmas(p){
  const f=p.firmas||{};
  setupSignaturePad('canvas-paciente','paciente',f.paciente);
  setupSignaturePad('canvas-odontologo','odontologo',f.odontologo);
}

function setupSignaturePad(id,role,initialData){
  const canvas=document.getElementById(id);
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  ctx.lineWidth=2;ctx.lineCap='round';ctx.strokeStyle='#1A1A17';
  if(initialData){
    const img=new Image();
    img.onload=()=>ctx.drawImage(img,0,0,canvas.width,canvas.height);
    img.src=initialData;
  }
  let drawing=false;let last=null;let touched=!!initialData;
  function pos(ev){
    const r=canvas.getBoundingClientRect();
    const e=ev.touches?ev.touches[0]:ev;
    return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};
  }
  function start(ev){ev.preventDefault();drawing=true;last=pos(ev);}
  function move(ev){if(!drawing)return;ev.preventDefault();const p2=pos(ev);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();last=p2;touched=true;}
  function end(){if(!drawing)return;drawing=false;if(touched)saveFirma(role);}
  canvas.addEventListener('pointerdown',start);
  canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',end);
  canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('pointerleave',end);
}

window.clearFirma=async function(role){
  const canvas=document.getElementById(`canvas-${role}`);
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const p=gp();if(!p.firmas)p.firmas={};
  delete p.firmas[role];
  await guardar(p);
  renderPlan();
}

async function saveFirma(role){
  const canvas=document.getElementById(`canvas-${role}`);
  const dataURL=canvas.toDataURL('image/png');
  const p=gp();
  if(!p.firmas)p.firmas={};
  p.firmas[role]=dataURL;
  p.firmas.fecha=new Date().toISOString();
  autosave('firmas',()=>p,'ss-firmas');
}

window.usarPresetOdontologo=async function(){
  const preset=localStorage.getItem('ds_preset_firma_odontologo');
  if(!preset){toast('No hay firma guardada todavía');return;}
  const canvas=document.getElementById('canvas-odontologo');
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const img=new Image();
  img.onload=async()=>{
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const p=gp();if(!p.firmas)p.firmas={};
    p.firmas.odontologo=preset;
    p.firmas.fecha=new Date().toISOString();
    await guardar(p);
    toast('Firma aplicada');
  };
  img.src=preset;
}
window.guardarPresetOdontologo=function(){
  const canvas=document.getElementById('canvas-odontologo');
  const data=canvas.toDataURL('image/png');
  localStorage.setItem('ds_preset_firma_odontologo',data);
  toast('Firma guardada como predeterminada');
}

window.autosavePlan=function(){
  autosave('plan',()=>{
    const p=gp();if(!p)return null;
    p.plan=g('pt_pl');p.plan_aceptado=g('pt_ac');
    p.restauracion=g('pt_re');p.material=g('pt_ma');p.color_dental=g('pt_cd');p.color_deseado=g('pt_cs');p.laboratorio=g('pt_la');p.indicaciones_tecnico=g('pt_in');p.obs_importantes=g('pt_ob');
    return p;
  },'ss-plan');
}
window.autosaveFirmas=function(){
  autosave('firmas',()=>{
    const p=gp();if(!p)return null;
    if(!p.firmas)p.firmas={};
    p.firmas.terminos_aceptados=document.getElementById('firma-tc').checked;
    p.firmas.terminos_fecha=p.firmas.terminos_aceptados?new Date().toISOString():null;
    return p;
  },'ss-firmas');
}

function renderEspTbl(){
  const p=gp();
  const esp=p.especialistas||[];
  const tb=document.getElementById('esp-body');
  if(!tb)return;
  tb.innerHTML=esp.length===0?
    `<tr><td colspan="3" style="font-size:12px;color:var(--text3);padding:8px 10px">Sin especialistas.</td></tr>`:
    esp.map((x,i)=>`<tr>
      <td><input value="${e(x.odontologo||'')}" oninput="updEsp(${i},'odontologo',this.value)" style="width:100%"></td>
      <td><input value="${e(x.tratamiento||'')}" oninput="updEsp(${i},'tratamiento',this.value)" style="width:100%"></td>
      <td><button class="bdel" onclick="delEsp(${i})">✕</button></td>
    </tr>`).join('');
}
window.addEsp=async function(){
  const p=gp();if(!p.especialistas)p.especialistas=[];
  p.especialistas.push({odontologo:'',tratamiento:''});
  await guardar(p);renderEspTbl();
}
window.updEsp=function(i,k,v){
  const p=gp();
  if(p.especialistas&&p.especialistas[i])p.especialistas[i][k]=v;
  autosave('esp',()=>p,'ss-esp');
}
window.delEsp=async function(i){
  const p=gp();p.especialistas.splice(i,1);
  await guardar(p);renderEspTbl();
}

// ─── OPERATORIAS (3.6.3 presets, 3.6.4 delete) ────────────────────────────
function renderOps(){
  const p=gp();
  const ops=p.operatorias||[];
  const allTeeth=[...UPPER,...LOWER,...DECIDUOUS_UPPER,...DECIDUOUS_LOWER];
  const rows=Array.from({length:Math.max(ops.length+1,5)},(_,i)=>{
    const o=ops[i]||{ud:'',fibra:'',color:'',marca:''};
    const isLast=i===ops.length&&ops.length>=1;
    const hasContent=o.ud||o.fibra||o.color||o.marca;
    const udOptions=allTeeth.map(t=>`<option value="${t}"${o.ud==t?' selected':''}>${t}</option>`).join('');
    const fibraOptions=FIBRA_OPTIONS.map(f=>`<option value="${f}"${o.fibra===f?' selected':''}>${f}</option>`).join('');
    const colorOptions=VITA_SHADES.map(s=>`<option value="${s}"${o.color===s?' selected':''}>${s}</option>`).join('');
    let extra='';
    if(o.color&&!VITA_SHADES.includes(o.color))extra=`<option value="${e(o.color)}" selected>${e(o.color)}</option>`;
    return `<tr>
      <td><select onchange="updOp(${i},'ud',this.value)"><option value="">—</option>${udOptions}</select></td>
      <td><select onchange="updOp(${i},'fibra',this.value)"><option value="">—</option>${fibraOptions}</select></td>
      <td><select onchange="updOp(${i},'color',this.value)"><option value="">—</option>${colorOptions}${extra}</select></td>
      <td><input value="${e(o.marca)}" oninput="updOp(${i},'marca',this.value)"></td>
      <td>${ops.length>1&&i<ops.length?`<button class="bdel" onclick="delOp(${i})" title="Eliminar fila">✕</button>`:''}</td>
    </tr>`;
  }).join('');
  document.getElementById('panel').innerHTML=`
    <div class="card">
      <div class="ct-row"><div class="ct">Operatorias realizadas</div>${statusEl('ops')}</div>
      <div style="overflow-x:auto"><table class="otbl" style="min-width:520px"><thead><tr><th>Unidad Dentaria</th><th>Fibra de vidrio</th><th>Color resinas</th><th>Marca resina</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <button class="ba" style="margin-top:10px" onclick="addOp()">+ Agregar fila</button>
    </div>`;
}
window.updOp=function(i,k,v){
  const p=gp();if(!p.operatorias)p.operatorias=[];
  while(p.operatorias.length<=i)p.operatorias.push({ud:'',fibra:'',color:'',marca:''});
  p.operatorias[i][k]=v;
  autosave('ops',()=>p,'ss-ops');
}
window.addOp=async function(){
  const p=gp();if(!p.operatorias)p.operatorias=[];
  p.operatorias.push({ud:'',fibra:'',color:'',marca:''});
  await guardar(p);renderOps();
}
window.delOp=async function(i){
  const p=gp();
  if(!p.operatorias||p.operatorias.length<=1){toast('Mantén al menos una fila');return;}
  p.operatorias.splice(i,1);
  await guardar(p);renderOps();
}

// ─── PROCEDIMIENTOS ESTÉTICOS (3.6.5 restructured) ────────────────────────
function procKey(label){return label.replace(/[^a-z0-9]/gi,'_').toLowerCase();}
function renderEst(){
  const p=gp();
  const pr=p.procs||{};
  const expanded=window.__procExpanded||(window.__procExpanded=new Set());
  let html=`<div class="card"><div class="ct-row"><div class="ct">Procedimientos estéticos / protésicos</div>${statusEl('est')}</div>`;
  for(const group of PROCS_GROUPED){
    html+=`<div class="proc-group"><div class="proc-group-title">${group.label}</div>`;
    for(const proc of group.procs){
      const k=procKey(proc);
      const d=pr[k]||{fecha:'',obs:''};
      const showDate=!PROC_NO_DATE.has(k);
      const isExp=expanded.has(k);
      html+=`<div class="proc-card">
        <div class="proc-head">
          <div class="proc-name">${proc}</div>
          ${showDate?`<input type="date" value="${e(d.fecha||'')}" onchange="updProc('${k}','fecha',this.value)" style="width:140px">`:'<span style="font-size:11px;color:var(--text3)">Sin fecha</span>'}
          <button class="ba" onclick="toggleProc('${k}')" style="font-size:11px;padding:4px 8px">${isExp?'Ocultar notas':'Notas…'}</button>
        </div>
        ${isExp?`<div class="proc-notes"><textarea oninput="updProc('${k}','obs',this.value)" placeholder="Observaciones extensas, pasos completados, decisiones técnicas…">${e(d.obs||'')}</textarea></div>`:(d.obs?`<div class="proc-preview">${e(d.obs.slice(0,120))}${d.obs.length>120?'…':''}</div>`:'')}
      </div>`;
    }
    html+=`</div>`;
  }
  html+=`</div>`;
  document.getElementById('panel').innerHTML=html;
}
window.toggleProc=function(k){
  const exp=window.__procExpanded;
  if(exp.has(k))exp.delete(k);else exp.add(k);
  renderEst();
}
window.updProc=function(k,f,v){
  const p=gp();if(!p.procs)p.procs={};if(!p.procs[k])p.procs[k]={fecha:'',obs:''};
  p.procs[k][f]=v;
  autosave('est',()=>p,'ss-est');
}

// ─── RECORD (3.8.1 audit log) ─────────────────────────────────────────────
let recordFilter='all';
function logAccess(patientId){
  if(accessLogged.has(patientId))return;
  accessLogged.add(patientId);
  const p=pacientes.find(x=>x.id===patientId);
  if(!p)return;
  if(!p.records)p.records=[];
  p.records.push({
    id:'a'+Date.now().toString(),
    fecha:hoy(),
    hora:ahora(),
    tipo:'acceso',
    user:auth.currentUser?.email||'desconocido',
    tratamiento:'Acceso a la historia clínica'
  });
  guardar(p).catch(()=>{});
}
function renderRec(){
  const p=gp();
  const all=[...(p.records||[])];
  const filtered=recordFilter==='all'?all:all.filter(r=>(r.tipo||'tratamiento')===recordFilter);
  const sorted=filtered.sort((a,b)=>{
    const da=(a.fecha||'')+(a.hora||'');
    const db=(b.fecha||'')+(b.hora||'');
    return db.localeCompare(da);
  });
  const counts={
    all:all.length,
    tratamiento:all.filter(r=>(r.tipo||'tratamiento')==='tratamiento').length,
    acceso:all.filter(r=>r.tipo==='acceso').length,
    edicion:all.filter(r=>r.tipo==='edicion').length
  };
  const chips=[
    {k:'all',l:'Todos',c:counts.all},
    {k:'tratamiento',l:'Tratamientos',c:counts.tratamiento},
    {k:'acceso',l:'Accesos',c:counts.acceso},
    {k:'edicion',l:'Ediciones',c:counts.edicion}
  ];
  document.getElementById('panel').innerHTML=`
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
      ${chips.map(c=>`<button class="rec-chip${recordFilter===c.k?' on':''}" onclick="setRecFilter('${c.k}')">${c.l} <span class="badge">${c.c}</span></button>`).join('')}
      <div style="flex:1"></div>
      <button class="ba" onclick="modalRec()">+ Agregar tratamiento</button>
    </div>
    <div class="card" style="padding:0;overflow:hidden"><div style="overflow-x:auto">
      <table class="rtbl" style="min-width:440px"><thead><tr><th style="width:110px">Fecha</th><th style="width:80px">Tipo</th><th>Detalle</th><th style="width:36px"></th></tr></thead>
      <tbody>${sorted.length===0?
        '<tr><td colspan="4" style="font-size:12px;color:var(--text3);padding:12px">Sin registros con este filtro.</td></tr>':
        sorted.map(r=>{
          const tipo=r.tipo||'tratamiento';
          const tipoLbl={tratamiento:'Tratamiento',acceso:'Acceso',edicion:'Edición'}[tipo]||tipo;
          return `<tr>
            <td style="white-space:nowrap;color:var(--text3);font-size:11px">${ff(r.fecha)}${r.hora?' '+e(r.hora):''}</td>
            <td><span class="rec-tag rec-tag-${tipo}">${tipoLbl}</span></td>
            <td>${e(r.tratamiento||'')}${r.user?` <span style="color:var(--text3);font-size:11px">· ${e(r.user)}</span>`:''}</td>
            <td>${tipo==='tratamiento'?`<button class="bdel" onclick="delRec('${r.id}')">✕</button>`:''}</td>
          </tr>`;
        }).join('')}</tbody></table></div></div>`;
}
window.setRecFilter=function(k){recordFilter=k;renderRec();};
window.modalRec=function(){
  const today=hoy();
  abrirModal('Nuevo tratamiento',
    `<div class="mf"><label>Fecha</label><input type="date" id="m_fe" value="${today}"></div>
     <div class="mf"><label>Tratamiento realizado</label><textarea id="m_tr" placeholder="Describe el tratamiento…"></textarea></div>`,
    async()=>{
      const tr=g('m_tr').trim();
      if(!tr){alert('Ingresa el tratamiento.');return;}
      const p=gp();if(!p.records)p.records=[];
      p.records.push({id:Date.now().toString(),fecha:g('m_fe'),tipo:'tratamiento',user:auth.currentUser?.email||'',tratamiento:tr});
      await guardar(p);cerrarModal();renderRec();toast('Registro agregado');
    });
}
window.delRec=async function(rid){
  if(!confirm('¿Eliminar este registro?'))return;
  const p=gp();p.records=(p.records||[]).filter(r=>r.id!==rid);
  await guardar(p);renderRec();
}

// ─── CONSULTAS (3.3.3 double-book) ────────────────────────────────────────
function renderCons(){
  const p=gp();
  const sorted=[...(p.consultas||[])].sort((a,b)=>{
    const ka=(a.fecha||'')+(a.hora||'');
    const kb=(b.fecha||'')+(b.hora||'');
    return kb.localeCompare(ka);
  });
  const total=(p.consultas||[]).reduce((s,c)=>s+(parseFloat(c.costo)||0),0);
  let html=`<button class="ba" onclick="modalCons()">+ Nueva consulta</button>`;
  if(sorted.length>0)html+=`<p style="font-size:12px;color:var(--text2);margin-bottom:14px">Total acumulado: <strong style="color:var(--forest)">$${total.toLocaleString()}</strong></p>`;
  else html+=`<p style="font-size:13px;color:var(--text3)">Sin consultas registradas aún.</p>`;
  sorted.forEach(c=>{
    html+=`<div class="cc">
      <div class="cch">
        <div>
          <div class="ccd">${ff(c.fecha)}${c.hora?' · '+e(c.hora):''}</div>
          <div class="cct">${e(c.tratamiento)}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          ${c.costo?`<span class="ccc">$${parseFloat(c.costo).toLocaleString()}</span>`:''}
          <button class="bdel" onclick="delCons('${c.id}')">✕</button>
        </div>
      </div>
      ${c.notas?`<div class="ccn">${e(c.notas)}</div>`:''}
      ${c.dientes?`<div style="font-size:11px;color:var(--text3);margin-top:4px">Dientes: ${e(c.dientes)}</div>`:''}
    </div>`;
  });
  document.getElementById('panel').innerHTML=html;
}
window.modalCons=function(){
  const today=hoy();
  abrirModal('Nueva consulta',
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="mf"><label>Fecha</label><input type="date" id="m_fe" value="${today}" oninput="checkConflict()"></div>
      <div class="mf"><label>Hora</label><input type="time" id="m_ho" oninput="checkConflict()"></div>
    </div>
    <div class="mf" id="conflict-row" style="display:none"><div style="font-size:12px;color:var(--terra);padding:8px 10px;background:var(--danger-light);border-radius:6px" id="conflict-msg"></div></div>
    <div class="mf"><label>Costo ($)</label><input type="number" id="m_co" placeholder="0"></div>
    <div class="mf"><label>Tratamiento realizado *</label><input id="m_tr" placeholder="Limpieza, extracción, etc."></div>
    <div class="mf"><label>Dientes involucrados</label><input id="m_di" placeholder="Ej: 16, 17"></div>
    <div class="mf"><label>Notas clínicas</label><textarea id="m_no" placeholder="Observaciones…"></textarea></div>`,
    async()=>{
      const tr=g('m_tr').trim();
      if(!tr){alert('El tratamiento es obligatorio.');return;}
      const fecha=g('m_fe');const hora=g('m_ho');
      if(fecha&&hora){
        const conflict=consultasIndex.get(fecha+' '+hora);
        if(conflict&&conflict.patientId!==idActual){
          if(!confirm(`Ya hay una consulta a las ${hora} con ${conflict.patientName}. ¿Guardar de todos modos?`))return;
        }
      }
      const p=gp();if(!p.consultas)p.consultas=[];
      p.consultas.push({id:Date.now().toString(),fecha,hora,tratamiento:tr,notas:g('m_no'),costo:g('m_co'),dientes:g('m_di')});
      await guardar(p);cerrarModal();renderLista();renderCons();toast('Consulta registrada');
    });
}
window.checkConflict=function(){
  const fecha=g('m_fe');const hora=g('m_ho');
  const row=document.getElementById('conflict-row');
  const msg=document.getElementById('conflict-msg');
  if(fecha&&hora){
    const c=consultasIndex.get(fecha+' '+hora);
    if(c&&c.patientId!==idActual){
      row.style.display='block';
      msg.textContent=`Ya hay una consulta a esa hora con ${c.patientName}.`;
      return;
    }
  }
  row.style.display='none';
}
window.delCons=async function(cid){
  if(!confirm('¿Eliminar esta consulta?'))return;
  const p=gp();p.consultas=(p.consultas||[]).filter(c=>c.id!==cid);
  await guardar(p);renderLista();renderCons();
}

// ─── MODAL ────────────────────────────────────────────────────────────────
function abrirModal(titulo,body,fn){
  modalFn=fn;
  const div=document.createElement('div');
  div.className='mbg';div.id='MB';
  div.innerHTML=`<div class="mbox"><h3>${titulo}</h3>${body}<div class="mact"><button class="bc" onclick="cerrarModal()">Cancelar</button><button class="bs" onclick="confirmarModal()">Guardar</button></div></div>`;
  document.body.appendChild(div);
}
function cerrarModal(){const m=document.getElementById('MB');if(m)m.remove();}
function confirmarModal(){if(modalFn)modalFn();}
window.cerrarModal=cerrarModal;window.confirmarModal=confirmarModal;
window.abrirModal=abrirModal;

// ─── NEW PATIENT (3.2.1, 3.2.2, 3.2.3, 3.2.4) ─────────────────────────────
window.modalNuevo=function(){
  abrirModal('Nuevo paciente',
    `<div class="mf"><label>Nombre completo *</label><input id="m_no" placeholder="Nombre y apellidos"></div>
     <div class="mf"><label>Cédula</label>${ciInputHTML('m_ci','')}</div>
     <div class="mf"><label>Teléfono</label><input ${phoneInputAttrs('m_te','')}></div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
       <div class="mf"><label>Fecha de nacimiento</label><input type="date" id="m_na"></div>
       <div class="mf"><label>Sexo</label><select id="m_sx"><option value="">—</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="O">Otro</option></select></div>
     </div>
     <div class="mf"><label>Especialidad</label><select id="m_esp">${ESPECIALIDADES.map(es=>`<option value="${es.key}">${es.label}</option>`).join('')}</select></div>
     <div id="m_err" style="font-size:12px;color:var(--terra);min-height:14px;margin-top:4px"></div>`,
    async()=>{
      const nombre=g('m_no').trim();
      if(!nombre){alert('El nombre es obligatorio.');return;}
      const ci=getCIValue('m_ci');
      const errDiv=document.getElementById('m_err');
      errDiv.textContent='';
      if(ci){
        const dup=await ciExists(ci);
        if(dup){errDiv.textContent=`Ya existe un paciente con la cédula ${ci}: ${dup.nombre}`;return;}
      }
      const data={
        nombre,ci,telefono:g('m_te'),nacimiento:g('m_na'),sexo:g('m_sx'),especialidad:g('m_esp')||'general',
        telefono2:'',email:'',motivo:'',antecedentes:'',patologias:'',oclusion:'',diagnostico:'',
        plan:'',plan_aceptado:'',restauracion:'',material:'',color_dental:'',color_deseado:'',laboratorio:'',indicaciones_tecnico:'',obs_importantes:'',
        teeth:{},teeth_obs:'',operatorias:[],procs:{},especialistas:[],records:[],consultas:[],firmas:{}
      };
      const newId=await crear(data);
      if(newId){idActual=newId;cerrarModal();logAccess(newId);renderPaciente();toast('Paciente creado');}
    });
}

// ─── SIDEBAR RESIZE (3.6.6) ───────────────────────────────────────────────
function initSidebarResize(){
  const sidebar=document.getElementById('sidebar');
  if(!sidebar)return;
  const stored=parseInt(localStorage.getItem('ds_sidebar_w')||'252');
  if(stored>=200&&stored<=500&&!isMobile())sidebar.style.width=stored+'px';
  let handle=sidebar.querySelector('.resize-handle');
  if(!handle){
    handle=document.createElement('div');
    handle.className='resize-handle';
    sidebar.appendChild(handle);
  }
  let dragging=false;
  handle.addEventListener('pointerdown',e=>{
    if(isMobile())return;
    dragging=true;e.preventDefault();
    document.body.style.cursor='col-resize';
    document.body.style.userSelect='none';
  });
  window.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const w=Math.max(200,Math.min(500,e.clientX));
    sidebar.style.width=w+'px';
  });
  window.addEventListener('pointerup',()=>{
    if(!dragging)return;
    dragging=false;
    document.body.style.cursor='';
    document.body.style.userSelect='';
    const w=parseInt(sidebar.style.width)||252;
    localStorage.setItem('ds_sidebar_w',w.toString());
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────
ss('ing','Conectando...');
initSidebarResize();
