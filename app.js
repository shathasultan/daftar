import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import * as fs from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js';
import { firebaseConfig } from './config.js';

const USER_NAME='أحمد';
const AR_MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DOW=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const COLORS=['#007aff','#ff9500','#34c759','#af52de','#ff2d55','#5ac8fa','#ffcc00','#5856d6'];
const CUR='ر.س';
const now=new Date();
const S={view:'home',branchId:null,year:now.getFullYear(),month:now.getMonth(),branches:[],entries:new Map(),months:new Map(),
  yearLoaded:false,mode:'loading',confirmDel:null,rendered:''};
let db=null,uid=null,unsubYear=[],unsubs=[];

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ds=(y,m,d)=>`${y}-${pad(m+1)}-${pad(d)}`;
const ym=(y,m)=>`${y}-${pad(m+1)}`;
const dim=(y,m)=>new Date(y,m+1,0).getDate();
const todayStr=ds(now.getFullYear(),now.getMonth(),now.getDate());
const nf=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const fmt=n=>nf.format(n||0);
const money=n=>`${fmt(n)}<span class="cur">${CUR}</span>`;
const branchById=id=>S.branches.find(b=>b.id===id);
const colorOf=b=>b?.color||COLORS[0];
const badge=b=>(String(b.name).match(/\d+/)||[String(b.name).replace(/^فرع\s*/,'').trim()[0]||'؟'])[0];

// Accepts 1250, 1,250, 8,333.33, Arabic digits and the Arabic decimal mark. Commas are thousands separators.
function parseAmount(v){
  v=String(v).trim().replace(/[٠-٩]/g,c=>c.charCodeAt(0)-1632).replace(/[۰-۹]/g,c=>c.charCodeAt(0)-1776)
    .replace(/٫/g,'.').replace(/[,٬،\s]/g,'');
  if(v===''||v==='-'||v==='—') return null;
  const n=Number(v); return isFinite(n)&&n>=0?Math.round(n*100)/100:NaN;
}

let toastT;
function toast(msg,bad){const t=$('toast');t.textContent=msg;t.className='toast show'+(bad?' bad':'');clearTimeout(toastT);toastT=setTimeout(()=>t.className='toast'+(bad?' bad':''),3200)}
function errMsg(e){
  if(e?.code==='permission-denied') return 'ما عندك صلاحية تعديل البيانات.';
  if(e?.code==='resource-exhausted') return 'وصلت للحد المجاني اليومي. جرّب بكرة.';
  return 'تعذّر الحفظ. تأكد من الاتصال وحاول مرة ثانية.';
}

const IC={
  back:'<svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l8 8-8 8"/></svg>',
  spark:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M11 2.5l1.9 5.6 5.6 1.9-5.6 1.9L11 17.5l-1.9-5.6L3.5 10l5.6-1.9z"/><path d="M18.5 14l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/></svg>',
  chart:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>',
};

/* ---------- aggregation ---------- */
// Per branch and month: sum of daily entries, number of days filled, and the month total from the paper sheets (if any)
function compute(){
  const bm={};
  for(const b of S.branches) bm[b.id]=Array.from({length:12},()=>({daily:0,days:0,paper:null}));
  for(const e of S.entries.values()){
    const c=bm[e.branchId]?.[+e.date.slice(5,7)-1]; if(!c||typeof e.amount!=='number') continue;
    c.daily+=e.amount; c.days++;
  }
  for(const m of S.months.values()){
    const c=bm[m.branchId]?.[+m.month.slice(5,7)-1]; if(c&&typeof m.total==='number') c.paper=m.total;
  }
  return bm;
}
const cellTotal=c=>c.days?c.daily:(c.paper??0);
const monthAll=(bm,m)=>S.branches.reduce((s,b)=>s+cellTotal(bm[b.id][m]),0);

/* ---------- views ---------- */
function setNav(start,title,end){$('navStart').innerHTML=start;$('navTitle').textContent=title;$('navEnd').innerHTML=end}
const aiBtn=`<button class="nav-btn icon-only" data-act="ai" aria-label="المساعد الذكي">${IC.spark}</button>`;
const backBtn=label=>`<a class="nav-btn" href="#" aria-label="رجوع">${IC.back}<span>${label}</span></a>`;
function monthSwitch(){return `<div class="seg" role="group" aria-label="الشهر"><button data-mstep="-1" aria-label="الشهر السابق">›</button><span>${AR_MONTHS[S.month]} ${S.year}</span><button data-mstep="1" aria-label="الشهر التالي">‹</button></div>`}

function render(){
  if(S.view==='branch'&&!branchById(S.branchId)&&S.mode==='live'){location.hash='';return}
  const key=`${S.view}|${S.branchId}|${S.year}|${S.month}`;
  if(S.view==='branch'&&S.rendered===key&&$('days')){patchBranch();return}
  const fresh=S.rendered.split('|')[0]!==S.view||S.rendered.split('|')[1]!==String(S.branchId);
  S.rendered=key;
  if(S.view==='branch') renderBranch(); else if(S.view==='report') renderReport(); else renderHome();
  if(fresh){$('page').classList.remove('view-enter');void $('page').offsetWidth;$('page').classList.add('view-enter');window.scrollTo(0,0)}
  onScroll();
}

function renderHome(){
  setNav('','دفتر الفروع',`<a class="nav-btn icon-only" href="#report" aria-label="التقرير السنوي">${IC.chart}</a>${aiBtn}`);
  $('totalBar').hidden=true;$('page').classList.remove('with-bar');
  const bm=compute(),m=S.month,total=monthAll(bm,m);
  let delta='';
  if(m>0&&total>0){const p=monthAll(bm,m-1);if(p>0){const pc=(total-p)/p*100;delta=`<div class="delta ${pc>=0?'up':'down'}">${pc>=0?'▲':'▼'} ${Math.abs(pc).toFixed(1)}% <span>عن ${AR_MONTHS[m-1]}</span></div>`}}
  const stack=total?S.branches.map(b=>{const t=cellTotal(bm[b.id][m]);return t?`<i style="--c:${colorOf(b)};flex:${t}"></i>`:''}).join(''):'';
  const n=dim(S.year,m);
  const rows=S.branches.map(b=>{
    const c=bm[b.id][m],t=cellTotal(c);
    const sub=c.days?`سجّلت ${c.days} من ${n} يوم`:c.paper!=null?'مجموع الشهر من الورق':'ما فيه دخل مسجّل';
    const prog=c.days?`<span class="prog"><i style="width:${Math.min(c.days/n*100,100)}%"></i></span>`:'';
    return `<a class="row tap" href="#branch-${b.id}" style="--c:${colorOf(b)}"><span class="ico">${esc(badge(b))}</span>
      <span class="row-main"><span class="row-title">${esc(b.name)}</span><span class="row-sub">${sub}</span>${prog}</span>
      <span class="row-val">${t||c.days?fmt(t):'—'}</span><span class="chev" aria-hidden="true">‹</span></a>`}).join('');
  const d=new Date();
  $('page').innerHTML=`
    <section class="hero-title"><h1 class="large">أهلاً ${USER_NAME} 👋</h1><p class="sub">${DOW[d.getDay()]}، ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}</p></section>
    ${monthSwitch()}
    <div class="card hero">
      <div class="hero-label">مجموع كل الفروع · ${AR_MONTHS[m]} ${S.year}</div>
      <div class="hero-num">${money(total)}</div>${delta}
      ${stack?`<div class="stack">${stack}</div><div class="legend">${S.branches.map(b=>`<span style="--c:${colorOf(b)}"><i></i>${esc(b.name)}</span>`).join('')}</div>`:''}
    </div>
    <section class="section">
      <div class="sec-head"><span>الفروع</span>${S.branches.length?'<button class="link" data-act="edit">تعديل</button>':''}</div>
      ${S.branches.length?`<div class="list icons">${rows}</div>`:
        `<div class="card empty">${S.mode==='loading'?'جاري تحميل الدفتر…':`<strong>ما فيه فروع للحين</strong>أضف فروعك، وبعدها افتح أي فرع وسجّل دخله اليومي.<button class="btn sm" data-act="edit">إضافة فرع</button>`}</div>`}
    </section>
    <section class="section"><div class="list icons">
      <a class="row tap" href="#report" style="--c:#8e8e93"><span class="ico">${IC.chart}</span><span class="row-main"><span class="row-title">التقرير السنوي</span><span class="row-sub">مجموع كل شهر لكل فرع في ${S.year}</span></span><span class="chev" aria-hidden="true">‹</span></a>
      ${db?`<button class="row tap" data-act="logout" style="--c:#8e8e93"><span class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11"/></svg></span><span class="row-main"><span class="row-title">تسجيل الخروج</span></span></button>`:''}
    </div></section>`;
}

function dayRows(y,m){
  const n=dim(y,m);let h='';
  for(let d=1;d<=n;d++){
    const date=ds(y,m,d),w=new Date(y,m,d).getDay(),e=S.entries.get(`${S.branchId}_${date}`);
    h+=`<label class="row day${date===todayStr?' is-today':''}" for="d-${date}">
      <span class="row-main"><span class="row-title wd">${DOW[w]}</span><span class="row-sub">${d} ${AR_MONTHS[m]} ${y}</span></span>
      ${date===todayStr?'<span class="pill">اليوم</span>':''}
      <input id="d-${date}" data-date="${date}" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="—" value="${e?fmt(e.amount):''}" aria-label="دخل ${DOW[w]} ${d} ${AR_MONTHS[m]}">
      <span class="saved" aria-hidden="true">✓</span></label>`;
  }
  return h;
}
function paperNote(c){
  if(c.paper==null) return '';
  return `<div class="note"><b>مجموع الشهر من الورق: ${fmt(c.paper)} ${CUR}</b><span>${c.days?'بدأت تعبّي الأيام، فصار المجموع يتحسب من الأيام اللي فوق.':'ما فيه أرقام يومية لهذا الشهر، فالأيام فاضية (—) والمجموع هو رقم الورق.'}</span></div>`;
}
function renderBranch(){
  const b=branchById(S.branchId);
  if(!b){setNav(backBtn('الفروع'),'','');$('page').innerHTML='<div class="card empty">جاري التحميل…</div>';return}
  setNav(backBtn('الفروع'),b.name,aiBtn);
  const c=compute()[b.id][S.month];
  $('page').classList.add('with-bar');
  $('page').innerHTML=`
    <section class="hero-title"><h1 class="large">${esc(b.name)}</h1><p class="sub">الدخل اليومي · ${AR_MONTHS[S.month]} ${S.year}</p></section>
    ${monthSwitch()}
    <span id="paperNote">${paperNote(c)}</span>
    <section class="section">
      <div class="sec-head"><span>اكتب دخل كل يوم، والمجموع يتحسب تحت على طول</span></div>
      <div class="list days" id="days">${dayRows(S.year,S.month)}</div>
      <div class="sec-foot">اليوم اللي ما فيه دخل اكتب فيه 0. والخانة الفاضية (—) يعني اليوم ما تسجّل.</div>
    </section>`;
  $('totalBar').hidden=false;
  updateTotalBar();
}
// Refresh values from the store without disturbing the field being typed in
function patchBranch(){
  for(const inp of $('days').querySelectorAll('input')){
    if(inp===document.activeElement||pending.has(inp.id)) continue;
    const e=S.entries.get(`${S.branchId}_${inp.dataset.date}`),v=e?fmt(e.amount):'';
    if(inp.value!==v) inp.value=v;
  }
  $('paperNote').innerHTML=paperNote(compute()[S.branchId]?.[S.month]||{paper:null});
  updateTotalBar();
}
let lastTotal=null;
function updateTotalBar(){
  let sum=0,days=0;
  for(const inp of $('days')?.querySelectorAll('input')||[]){const v=parseAmount(inp.value);if(v!=null&&!Number.isNaN(v)){sum+=v;days++}}
  const c=compute()[S.branchId]?.[S.month],usePaper=!days&&c?.paper!=null,total=usePaper?c.paper:sum;
  const sub=usePaper?'من الورق (بدون تفصيل يومي)':days?`${days} من ${dim(S.year,S.month)} يوم · متوسط ${fmt(Math.round(sum/days))}`:'ما فيه دخل مسجّل للحين';
  $('totalBar').innerHTML=`<div class="tb-in"><div><div class="tb-label">مجموع ${AR_MONTHS[S.month]}</div><div class="tb-sub">${sub}</div></div><div class="tb-num" id="tbNum">${money(total)}</div></div>`;
  if(lastTotal!==null&&lastTotal!==total){const el=$('tbNum');el.classList.add('bump');setTimeout(()=>el.classList.remove('bump'),160)}
  lastTotal=total;
}

function niceMax(v){if(v<=0)return 1;const e=Math.pow(10,Math.floor(Math.log10(v))),f=v/e;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*e}
const short=v=>v>=1e6?(+(v/1e6).toFixed(1))+'M':v>=1e3?(+(v/1e3).toFixed(1))+'K':String(Math.round(v));
function renderReport(){
  setNav(backBtn('الفروع'),`التقرير السنوي ${S.year}`,aiBtn);
  $('totalBar').hidden=true;$('page').classList.remove('with-bar');
  const bm=compute(),mt=AR_MONTHS.map((_,i)=>monthAll(bm,i)),yt=mt.reduce((a,b)=>a+b,0);
  const W=720,H=240,pl=8,pr=44,pt=12,pb=30,cw=W-pl-pr,ch=H-pt-pb,bw=cw/12,top=niceMax(Math.max(...mt,0)),yv=v=>pt+ch-(v/top)*ch;
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="مجموع كل شهر في ${S.year}">`;
  for(let k=0;k<=4;k++){const v=top*k/4,y=yv(v);
    svg+=`<line x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}" stroke="var(--sep)" stroke-width="1"/><text x="${W-pr+6}" y="${y+4}" fill="var(--label2)" font-size="11" style="direction:ltr">${k?short(v):'0'}</text>`}
  AR_MONTHS.forEach((name,i)=>{
    const x=W-pr-(i+1)*bw+bw*.22,w=bw*.56;let acc=0;
    S.branches.forEach(b=>{const v=cellTotal(bm[b.id][i]);if(!v)return;const y1=yv(acc+v),y0=yv(acc);acc+=v;
      svg+=`<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(y0-y1-1,0)}" rx="3" fill="${colorOf(b)}"><title>${esc(b.name)} · ${name}: ${fmt(v)} ${CUR}</title></rect>`});
    svg+=`<text x="${x+w/2}" y="${H-10}" fill="${i===S.month?'var(--label)':'var(--label2)'}" font-size="11.5" font-weight="${i===S.month?700:400}" text-anchor="middle">${name}</text>`;
  });
  svg+='</svg>';
  const head=`<tr><th>الفرع</th>${AR_MONTHS.map((n,i)=>`<th class="${i===S.month?'sel':''}">${n}</th>`).join('')}<th>المجموع</th></tr>`;
  const body=S.branches.map(b=>{const r=bm[b.id].map(cellTotal),s=r.reduce((a,c)=>a+c,0);
    return `<tr><td>${esc(b.name)}</td>${r.map((v,i)=>`<td class="${i===S.month?'sel ':''}${v?'':'zero'}">${v?fmt(v):'—'}</td>`).join('')}<td><b>${fmt(s)}</b></td></tr>`}).join('');
  const foot=`<tr><td>كل الفروع</td>${mt.map((v,i)=>`<td class="${i===S.month?'sel':''}">${v?fmt(v):'—'}</td>`).join('')}<td>${fmt(yt)}</td></tr>`;
  $('page').innerHTML=`
    <section class="hero-title"><h1 class="large">التقرير السنوي</h1><p class="sub">مجموع كل شهر لكل فرع</p></section>
    <div class="seg" role="group" aria-label="السنة"><button data-ystep="-1" aria-label="السنة السابقة">›</button><span>${S.year}</span><button data-ystep="1" aria-label="السنة التالية">‹</button></div>
    <div class="card hero"><div class="hero-label">مجموع سنة ${S.year} لكل الفروع</div><div class="hero-num">${money(yt)}</div></div>
    ${S.branches.length?`<div class="card chart">${svg}<div class="legend" style="padding:6px 8px 4px">${S.branches.map(b=>`<span style="--c:${colorOf(b)}"><i></i>${esc(b.name)}</span>`).join('')}</div></div>
    <div class="card tbl"><table><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>
    <button class="btn plain" data-act="csv">تنزيل التقرير كملف Excel</button>`:''}`;
}

/* ---------- daily entry ---------- */
const pending=new Map();
function schedule(inp){clearTimeout(pending.get(inp.id));pending.set(inp.id,setTimeout(()=>commit(inp),700))}
async function commit(inp){
  clearTimeout(pending.get(inp.id));pending.delete(inp.id);
  const v=parseAmount(inp.value);if(Number.isNaN(v)) return;
  const bid=S.branchId,date=inp.dataset.date,old=S.entries.get(`${bid}_${date}`)?.amount??null;
  if(v===old) return;
  try{
    await saveEntry(bid,date,v);
    const ok=inp.parentElement.querySelector('.saved');ok.classList.add('on');setTimeout(()=>ok.classList.remove('on'),1200);
  }catch(err){toast(errMsg(err),true)}
}
$('page').addEventListener('input',e=>{
  const inp=e.target;if(!inp.dataset.date) return;
  inp.classList.toggle('err',Number.isNaN(parseAmount(inp.value)));
  updateTotalBar();schedule(inp);
});
$('page').addEventListener('change',e=>{
  const inp=e.target;if(!inp.dataset.date) return;
  const v=parseAmount(inp.value);if(v!=null&&!Number.isNaN(v)) inp.value=fmt(v);
  if(Number.isNaN(v)) toast('اكتب رقم بس، مثل 1,250 أو 980.50',true);
  commit(inp);
});
$('page').addEventListener('keydown',e=>{
  if(e.key!=='Enter'||!e.target.dataset.date) return;
  e.preventDefault();const all=[...$('days').querySelectorAll('input')],i=all.indexOf(e.target);
  e.target.blur();(all[i+1]||e.target).focus();
});

/* ---------- branches ---------- */
function openSheet(id){$('backdrop').hidden=false;$(id).hidden=false;document.body.style.overflow='hidden'}
function closeSheets(){for(const id of ['aiSheet','editSheet','importSheet'])$(id).hidden=true;$('backdrop').hidden=true;document.body.style.overflow='';S.confirmDel=null}
function renderEdit(){
  const rows=S.branches.map(b=>`<div class="row field-row" style="--c:${colorOf(b)}">
      <button type="button" class="swatch" data-color="${b.id}" aria-label="تغيير لون ${esc(b.name)}"></button>
      <input id="bn-${b.id}" data-rename="${b.id}" value="${esc(b.name)}" maxlength="50" aria-label="اسم الفرع">
      <button type="button" class="del" data-del="${b.id}">حذف</button></div>`).join('');
  const cd=branchById(S.confirmDel);
  $('editSheet').innerHTML=`<div class="grabber"></div>
    <div class="sheet-head"><span></span><h2>الفروع</h2><button class="nav-btn" type="button" data-close-sheet>تم</button></div>
    <div class="sheet-body">
      ${cd?`<div class="confirm"><b>حذف «${esc(cd.name)}»؟</b><span>بينحذف معه كل الدخل المسجّل له، وما يرجع.</span><div class="acts"><button class="btn sm danger" data-delok="${cd.id}">احذف الفرع</button><button class="btn sm plain" data-cancel>إلغاء</button></div></div>`:''}
      <section class="section"><div class="sec-head"><span>اضغط على الاسم عشان تعدّله، وعلى الدائرة عشان تغيّر اللون</span></div>
        ${rows?`<div class="list">${rows}</div>`:''}</section>
      <form class="section" id="addForm"><div class="sec-head"><span>فرع جديد</span></div>
        <div class="list"><div class="row field-row"><input id="newBranch" placeholder="مثلاً: فرع 12 العليا" maxlength="50" aria-label="اسم الفرع الجديد"><button class="nav-btn" type="submit">إضافة</button></div></div></form>
    </div>`;
}
function openEdit(){renderEdit();openSheet('editSheet')}
$('editSheet').addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t) return;
  if(t.dataset.color){const b=branchById(t.dataset.color);await act(()=>saveBranch(b.id,{color:COLORS[(COLORS.indexOf(b.color)+1)%COLORS.length]}))}
  else if(t.dataset.del){S.confirmDel=t.dataset.del;renderEdit()}
  else if('cancel' in t.dataset){S.confirmDel=null;renderEdit()}
  else if(t.dataset.delok){const id=t.dataset.delok;S.confirmDel=null;await act(()=>deleteBranch(id),'تم حذف الفرع')}
});
$('editSheet').addEventListener('change',async e=>{
  const id=e.target.dataset.rename;if(!id) return;
  const n=e.target.value.trim();if(n&&n!==branchById(id)?.name) await act(()=>saveBranch(id,{name:n}),'تم تعديل الاسم');
});
$('editSheet').addEventListener('submit',async e=>{
  e.preventDefault();const n=$('newBranch').value.trim();if(!n) return;
  await act(()=>addBranch(n),`تمت إضافة ${n}`);
});
async function act(fn,ok){try{await fn();if(ok)toast(ok)}catch(err){toast(errMsg(err),true)}if(!$('editSheet').hidden)renderEdit();render()}

/* ---------- storage (Firebase) ---------- */
const base=()=>`users/${uid}`;
async function saveEntry(bid,date,v){
  const id=`${bid}_${date}`;
  const data={branchId:bid,date,year:+date.slice(0,4),month:date.slice(0,7),amount:v,updatedAt:new Date().toISOString()};
  yearCache.delete(+date.slice(0,4));
  if(db){const ref=fs.doc(db,base(),'entries',id);return v==null?fs.deleteDoc(ref):fs.setDoc(ref,data)}
  v==null?S.entries.delete(id):S.entries.set(id,data);
}
async function addBranch(name){
  const data={name,color:COLORS[S.branches.length%COLORS.length],order:Date.now(),createdAt:new Date().toISOString()};
  if(db) return fs.addDoc(fs.collection(db,base(),'branches'),data);
  S.branches.push({id:'b'+Math.random().toString(36).slice(2,9),...data});
}
async function saveBranch(id,patch){
  if(db) return fs.updateDoc(fs.doc(db,base(),'branches',id),patch);
  Object.assign(branchById(id),patch);
}
async function deleteBranch(id){
  if(db){
    const refs=[fs.doc(db,base(),'branches',id)];
    for(const col of ['entries','months']){
      const snap=await fs.getDocs(fs.query(fs.collection(db,base(),col),fs.where('branchId','==',id)));
      refs.push(...snap.docs.map(d=>d.ref));
    }
    for(let i=0;i<refs.length;i+=400){const b=fs.writeBatch(db);refs.slice(i,i+400).forEach(r=>b.delete(r));await b.commit()}
    return;
  }
  S.branches=S.branches.filter(b=>b.id!==id);
  for(const k of [...S.entries.keys()]) if(k.startsWith(id+'_')) S.entries.delete(k);
}

function subscribeYear(){
  unsubYear.forEach(u=>u());unsubYear=[];
  if(!db){S.yearLoaded=true;return}
  S.yearLoaded=false;S.entries=new Map();S.months=new Map();
  const q=col=>fs.query(fs.collection(db,base(),col),fs.where('year','==',S.year));
  unsubYear.push(fs.onSnapshot(q('entries'),s=>{S.entries=new Map(s.docs.map(d=>[d.id,d.data()]));S.yearLoaded=true;render()},e=>toast(errMsg(e),true)));
  unsubYear.push(fs.onSnapshot(q('months'),s=>{S.months=new Map(s.docs.map(d=>[d.id,d.data()]));render()},()=>{}));
}
function step(dm){
  let y=S.year,m=S.month+dm;if(m<0){m=11;y--}if(m>11){m=0;y++}
  S.month=m;if(y!==S.year){S.year=y;subscribeYear()}render();
}

/* ---------- routing & events ---------- */
function route(){
  const h=location.hash.slice(1);
  if(h.startsWith('import-')){showImport(h.slice(7));return}
  if(h.startsWith('branch-')){S.view='branch';S.branchId=h.slice(7)}
  else if(h==='report'){S.view='report';S.branchId=null}
  else{S.view='home';S.branchId=null}
  render();
}
window.addEventListener('hashchange',route);
function onScroll(){$('nav').classList.toggle('scrolled',window.scrollY>36)}
window.addEventListener('scroll',onScroll,{passive:true});
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-mstep],[data-ystep],[data-act],[data-close-sheet],#backdrop');if(!t) return;
  if(t.id==='backdrop'||'closeSheet' in t.dataset){closeSheets();return}
  if(t.dataset.mstep){step(+t.dataset.mstep);return}
  if(t.dataset.ystep){S.year+=+t.dataset.ystep;subscribeYear();render();return}
  const a=t.dataset.act;
  if(a==='edit') openEdit();
  if(a==='ai') openAI();
  if(a==='csv') exportCsv();
  if(a==='logout') doLogout?.();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheets()});

function exportCsv(){
  const bm=compute(),q=v=>`"${String(v).replace(/"/g,'""')}"`,rows=[[`مجموع سنة ${S.year} (ريال سعودي)`],['الفرع',...AR_MONTHS,'المجموع']];
  S.branches.forEach(b=>{const r=bm[b.id].map(cellTotal);rows.push([b.name,...r,r.reduce((a,c)=>a+c,0)])});
  const mt=AR_MONTHS.map((_,i)=>monthAll(bm,i));rows.push(['كل الفروع',...mt,mt.reduce((a,c)=>a+c,0)]);
  rows.push([]);rows.push([`الدخل اليومي لشهر ${AR_MONTHS[S.month]} ${S.year}`]);rows.push(['التاريخ','اليوم',...S.branches.map(b=>b.name)]);
  for(let d=1;d<=dim(S.year,S.month);d++){const k=ds(S.year,S.month,d);
    rows.push([k,DOW[new Date(S.year,S.month,d).getDay()],...S.branches.map(b=>S.entries.get(`${b.id}_${k}`)?.amount??'')])}
  const blob=new Blob(['﻿'+rows.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`دفتر-الفروع-${S.year}.csv`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}

/* ---------- one-time import from a link (keeps figures out of the public code) ---------- */
// Link format: #import-<base64url of {"v":1,"branches":[{id,name,color,order}],"months":[[branchId,"YYYY-MM",total]]}>
function decodeImport(s){
  try{
    const bin=atob(s.replace(/-/g,'+').replace(/_/g,'/')),d=JSON.parse(new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0))));
    const okB=b=>/^[a-z0-9]{1,24}$/.test(b?.id)&&typeof b.name==='string'&&b.name.length<=60&&/^#[0-9a-f]{6}$/i.test(b.color||'#000000');
    const okM=m=>Array.isArray(m)&&/^[a-z0-9]{1,24}$/.test(m[0])&&/^\d{4}-\d{2}$/.test(m[1])&&typeof m[2]==='number'&&m[2]>=0;
    if(d?.v!==1||!Array.isArray(d.branches)||!Array.isArray(d.months)||d.branches.length>20||d.months.length>500||!d.branches.every(okB)||!d.months.every(okM)) return null;
    return d;
  }catch(e){return null}
}
let importData=null;
function showImport(s){
  history.replaceState(null,'',location.pathname);
  importData=decodeImport(s);route();
  if(!importData){toast('رابط الاستيراد غير صالح.',true);return}
  if(!db){toast('سجّل دخولك أول وبعدها افتح الرابط مرة ثانية.',true);return}
  const names=Object.fromEntries(importData.branches.map(b=>[b.id,b.name]));
  const list=importData.months.map(m=>`<div class="row"><span class="row-main"><span class="row-title">${esc(names[m[0]]||m[0])}</span><span class="row-sub">${AR_MONTHS[+m[1].slice(5)-1]} ${m[1].slice(0,4)}</span></span><span class="row-val">${fmt(m[2])}</span></div>`).join('');
  $('importSheet').innerHTML=`<div class="grabber"></div>
    <div class="sheet-head"><button class="nav-btn" type="button" data-close-sheet>إلغاء</button><h2>استيراد البيانات</h2><span></span></div>
    <div class="sheet-body">
      <p class="sub" style="text-align:center">بينضاف ${importData.branches.length} فروع، ومجموع ${importData.months.length} أشهر من الأوراق.</p>
      <div class="list">${list}</div>
      <button class="btn" id="importGo">استيراد</button>
    </div>`;
  openSheet('importSheet');
  $('importGo').onclick=async()=>{
    const btn=$('importGo');btn.disabled=true;btn.textContent='جاري الاستيراد…';
    try{
      const batch=fs.writeBatch(db);
      for(const b of importData.branches){
        const ref=fs.doc(db,base(),'branches',b.id);
        if(!(await fs.getDoc(ref)).exists()) batch.set(ref,{name:b.name,color:b.color||COLORS[0],order:b.order??Date.now(),createdAt:new Date().toISOString()});
      }
      for(const [bid,month,total] of importData.months)
        batch.set(fs.doc(db,base(),'months',`${bid}_${month}`),{branchId:bid,month,year:+month.slice(0,4),total,source:'paper'});
      await batch.commit();
      closeSheets();toast('تم الاستيراد ✓');importData=null;
    }catch(err){btn.disabled=false;btn.textContent='استيراد';toast(errMsg(err),true)}
  };
}

/* ---------- smart assistant ---------- */
const WD_EN=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const yearCache=new Map();
const r2=n=>Math.round(n*100)/100;
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
const norm=s=>String(s||'').replace(/^\s*فرع\s+/,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').trim().toLowerCase();
// null = no branch asked (all branches), undefined = name not found
function resolveBranch(q){
  if(!q) return null;const n=norm(q);
  return S.branches.find(b=>norm(b.name)===n)||S.branches.find(b=>norm(b.name).includes(n)||n.includes(norm(b.name)));
}
async function yearData(y){
  if(y===S.year&&S.yearLoaded) return {entries:[...S.entries.values()],months:[...S.months.values()]};
  if(!db) return {entries:[],months:[]};
  if(!yearCache.has(y)){
    const get=async col=>(await fs.getDocs(fs.query(fs.collection(db,base(),col),fs.where('year','==',y)))).docs.map(d=>d.data());
    yearCache.set(y,{entries:await get('entries'),months:await get('months')});
  }
  return yearCache.get(y);
}
async function rangeData(from,to){
  const ids=new Set(S.branches.map(b=>b.id)),entries=[],months=[];
  for(let y=+from.slice(0,4);y<=+to.slice(0,4)&&y<=+from.slice(0,4)+5;y++){const d=await yearData(y);entries.push(...d.entries);months.push(...d.months)}
  return {entries:entries.filter(e=>e.date>=from&&e.date<=to&&ids.has(e.branchId)),
    months:months.filter(m=>m.month>=from.slice(0,7)&&m.month<=to.slice(0,7)&&ids.has(m.branchId))};
}
function eachDay(from,to,fn){
  const d=new Date(from+'T00:00'),end=new Date(to+'T00:00');
  for(let i=0;d<=end&&i<4000;d.setDate(d.getDate()+1),i++) fn(ds(d.getFullYear(),d.getMonth(),d.getDate()),d.getDay());
}
const branchErr=q=>({error:`ما فيه فرع اسمه "${q}"`,branches:S.branches.map(b=>b.name)});
const rangeErr=()=>({error:'التواريخ لازم تكون بصيغة YYYY-MM-DD'});

const TOOLS={
  async list_branches(){return {currency:'ريال سعودي',branches:S.branches.map(b=>b.name)}},
  async get_totals({from,to,branch,weekday}){
    if(!isDate(from)||!isDate(to)) return rangeErr();
    const b=resolveBranch(branch);if(b===undefined) return branchErr(branch);
    const wi=weekday?WD_EN.indexOf(weekday):-1,per={},daysByBM=new Set();
    for(const x of S.branches) if(!b||x.id===b.id) per[x.name]={total:0,days_entered:0,monthly_paper_totals_used:[]};
    let total=0;
    const {entries,months}=await rangeData(from,to);
    for(const e of entries){
      if(b&&e.branchId!==b.id) continue;
      daysByBM.add(e.branchId+'|'+e.date.slice(0,7));
      if(wi>=0&&new Date(e.date+'T00:00').getDay()!==wi) continue;
      const p=per[branchById(e.branchId).name];p.total=r2(p.total+e.amount);p.days_entered++;total+=e.amount;
    }
    // Months that only have a paper total count when no weekday filter is asked
    const notes=[];
    for(const m of months){
      if((b&&m.branchId!==b.id)||daysByBM.has(m.branchId+'|'+m.month)) continue;
      const name=branchById(m.branchId).name;
      if(wi>=0){notes.push(`${name} ${m.month}: مسجّل كمجموع شهر بدون أيام، فما ينحسب بيوم معيّن`);continue}
      const p=per[name];p.total=r2(p.total+m.total);p.monthly_paper_totals_used.push(m.month);total+=m.total;
    }
    return {from,to,weekday:weekday||null,currency:'ريال سعودي',total:r2(total),per_branch:per,notes};
  },
  async get_day({date}){
    if(!isDate(date)) return rangeErr();
    const {entries,months}=await rangeData(date,date),amounts={};
    for(const e of entries) amounts[branchById(e.branchId).name]=e.amount;
    const paperOnly=months.filter(m=>!entries.some(e=>e.branchId===m.branchId)).map(m=>branchById(m.branchId).name);
    return {date,weekday:DOW[new Date(date+'T00:00').getDay()],currency:'ريال سعودي',total:r2(entries.reduce((s,e)=>s+e.amount,0)),amounts,
      not_entered:S.branches.filter(b=>!(b.name in amounts)).map(b=>b.name),month_recorded_as_single_total_for:paperOnly};
  },
  async get_daily({from,to,branch}){
    if(!isDate(from)||!isDate(to)) return rangeErr();
    const b=resolveBranch(branch);if(b===undefined) return branchErr(branch);
    const by={};for(const e of (await rangeData(from,to)).entries) if(!b||e.branchId===b.id) by[e.date]=(by[e.date]||0)+e.amount;
    const days=[];eachDay(from,to,(d,w)=>{if(d in by) days.push({date:d,weekday:DOW[w],total:r2(by[d])})});
    return {branch:b?.name||'كل الفروع',days:days.slice(-120),truncated:days.length>120};
  },
  async find_missing_days({from,to,branch}){
    if(!isDate(from)||!isDate(to)) return rangeErr();
    const b=resolveBranch(branch);if(b===undefined) return branchErr(branch);
    if(to>todayStr) to=todayStr;
    const {entries,months}=await rangeData(from,to),have=new Set(entries.map(e=>e.branchId+'|'+e.date));
    const withDays=new Set(entries.map(e=>e.branchId+'|'+e.date.slice(0,7)));
    const paper=new Set(months.filter(m=>!withDays.has(m.branchId+'|'+m.month)).map(m=>m.branchId+'|'+m.month));
    const targets=b?[b]:S.branches,list=[];
    eachDay(from,to,(d,w)=>{const miss=targets.filter(x=>!have.has(x.id+'|'+d)&&!paper.has(x.id+'|'+d.slice(0,7))).map(x=>x.name);if(miss.length) list.push({date:d,weekday:DOW[w],missing:miss})});
    return {from,to,checked_until:to,missing_days_count:list.length,days:list.slice(0,100),truncated:list.length>100,
      months_with_single_paper_total:[...paper].map(k=>{const [id,m]=k.split('|');return `${branchById(id)?.name} ${m}`})};
  },
};
async function runTool(name,args){
  try{return TOOLS[name]?await TOOLS[name](args||{}):{error:'أداة غير معروفة'}}catch(e){return {error:'تعذّر قراءة البيانات'}}
}
function aiDecls(){
  const date=d=>Schema.string({description:`${d} بصيغة YYYY-MM-DD`});
  const branch=Schema.string({description:'اسم الفرع أو رقمه كما يكتبه المستخدم. اتركه فاضي لكل الفروع'});
  return [
    {name:'list_branches',description:'أسماء الفروع'},
    {name:'get_totals',description:'مجموع الدخل لفترة، لكل فرع ولكل الفروع. يقدر يحسب يوم معيّن من الأسبوع بس (مثل كل أيام الاثنين). يشمل مجاميع الأشهر المسجّلة من الورق',
      parameters:Schema.object({properties:{from:date('أول يوم'),to:date('آخر يوم'),branch,
        weekday:Schema.enumString({enum:WD_EN,description:'يوم الأسبوع إذا السؤال عن يوم معيّن من كل أسبوع'})},optionalProperties:['branch','weekday']})},
    {name:'get_day',description:'دخل كل فرع في يوم واحد، والفروع اللي ما تسجّل دخلها ذاك اليوم',
      parameters:Schema.object({properties:{date:date('اليوم')}})},
    {name:'get_daily',description:'الدخل يوم بيوم لفترة، عشان أعلى يوم وأقل يوم والمقارنات',
      parameters:Schema.object({properties:{from:date('أول يوم'),to:date('آخر يوم'),branch},optionalProperties:['branch']})},
    {name:'find_missing_days',description:'الأيام اللي ما تسجّل فيها دخل فرع أو أكثر (لين اليوم)',
      parameters:Schema.object({properties:{from:date('أول يوم'),to:date('آخر يوم'),branch},optionalProperties:['branch']})},
  ];
}
function aiSystem(){
  const t=new Date(),y=t.getFullYear(),m=t.getMonth(),py=m?y:y-1,pm=(m+11)%12;
  return `أنت "المساعد الذكي" داخل موقع "دفتر الفروع"، تجاوب ${USER_NAME} عن دخل فروعه. العملة ريال سعودي دايماً.
اليوم: ${todayStr} (${DOW[t.getDay()]}). هالشهر: ${ds(y,m,1)} إلى ${todayStr}. الشهر اللي فات: ${ds(py,pm,1)} إلى ${ds(py,pm,dim(py,pm))}. هالسنة: ${y}-01-01 إلى ${todayStr}.
الأسبوع يبدأ الأحد. "يوم الاثنين" بدون تاريخ يعني آخر اثنين مضى.
بعض الأشهر مسجّلة من الأوراق كمجموع شهر واحد بدون تفصيل الأيام. إذا الجواب اعتمد عليها وضّح هذا باختصار.
القواعد:
- أي رقم لازم يجي من الأدوات. لا تخمّن ولا تخترع أرقام، وخذ المجاميع من الأداة كما هي.
- إذا اسم الفرع مو واضح استخدم list_branches. المستخدم ممكن يذكر الفرع برقمه بس (مثل 43).
- "يوم ناقص" أو "ما عبّيته" أو "نسيت أسجّل" تعني find_missing_days.
- جاوب باللهجة الخليجية، باختصار ووضوح، والأرقام بفواصل الآلاف ومعها "ر.س". استخدم نقاط قصيرة إذا فيه أكثر من فرع.
- إذا السؤال مو عن الدفتر، قل بلطف إنك مختص بأرقام الدفتر.`;
}
let aiModel=null,aiChat=null,aiBusy=false;
function initAI(app){
  try{aiModel=getGenerativeModel(getAI(app,{backend:new GoogleAIBackend()}),
    {model:'gemini-2.5-flash',systemInstruction:aiSystem(),tools:[{functionDeclarations:aiDecls()}]})}catch(e){aiModel=null}
}
function mdLite(s){
  return esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').split('\n').map(l=>/^\s*[-*•]\s+/.test(l)?`<li>${l.replace(/^\s*[-*•]\s+/,'')}</li>`:l)
    .join('\n').replace(/(<li>.*<\/li>\n?)+/g,m=>`<ul>${m.replace(/\n/g,'')}</ul>`).replace(/\n/g,'<br>');
}
function aiMsg(role,html){
  const el=document.createElement('div');el.className='ai-msg '+role;el.innerHTML=html;$('aiMsgs').appendChild(el);
  $('aiMsgs').scrollTop=$('aiMsgs').scrollHeight;return el;
}
async function aiAsk(text){
  text=text.trim();if(!text||aiBusy) return;
  aiBusy=true;$('aiSugg').hidden=true;$('aiSend').disabled=true;
  aiMsg('me',esc(text));const wait=aiMsg('bot','<span class="ai-dots"><i></i><i></i><i></i></span>');
  try{
    if(!aiModel){wait.innerHTML='المساعد يشتغل بعد ما نربط الموقع بـ Firebase ونفعّل Gemini (AI Logic).';return}
    aiChat??=aiModel.startChat();
    let r=await aiChat.sendMessage(text);
    for(let i=0;i<6;i++){
      const calls=r.response.functionCalls();if(!calls?.length) break;
      const parts=await Promise.all(calls.map(async c=>({functionResponse:{name:c.name,response:await runTool(c.name,c.args)}})));
      r=await aiChat.sendMessage(parts);
    }
    wait.innerHTML=mdLite(r.response.text()||'ما قدرت أطلع جواب. جرّب تصيغ السؤال بطريقة ثانية.');
  }catch(e){
    const m=String(e?.message||e);
    wait.innerHTML=/api-not-enabled|not been used|disabled|AI Logic/i.test(m)?'لازم تفعّل <b>AI Logic</b> في Firebase عشان يشتغل المساعد.':
      /quota|429|RESOURCE_EXHAUSTED/i.test(m)?'وصلنا للحد المجاني للمساعد حالياً. جرّب بعد شوي.':'صار خطأ في الاتصال بالمساعد. تأكد من الإنترنت وجرّب مرة ثانية.';
    aiChat=null;
  }finally{aiBusy=false;$('aiSend').disabled=false;$('aiMsgs').scrollTop=$('aiMsgs').scrollHeight}
}
const AI_SUGG=['كم مجموع كل فرع هالشهر؟','وش الأيام اللي ما عبّيتها هالشهر؟','كم دخلنا يوم الاثنين اللي فات؟','أي فرع أعلى دخل هالسنة؟'];
function openAI(){
  openSheet('aiSheet');
  if(!$('aiMsgs').children.length) aiMsg('bot',`هلا ${USER_NAME}! اسألني عن أي فرع أو يوم أو شهر، وأجاوبك من أرقام الدفتر.`);
  if(!matchMedia('(pointer:coarse)').matches) $('aiInput').focus();
}
$('aiSugg').innerHTML=AI_SUGG.map(s=>`<button type="button">${s}</button>`).join('');
$('aiSugg').addEventListener('click',e=>{const b=e.target.closest('button');if(b) aiAsk(b.textContent)});
$('aiForm').addEventListener('submit',e=>{e.preventDefault();const i=$('aiInput');aiAsk(i.value);i.value=''});

/* ---------- auth & boot ---------- */
const authMsg={'auth/invalid-credential':'الإيميل أو كلمة السر غلط.','auth/wrong-password':'كلمة السر غلط.','auth/user-not-found':'ما فيه حساب بهذا الإيميل.',
  'auth/too-many-requests':'محاولات كثيرة. انتظر شوي وجرّب.','auth/network-request-failed':'ما فيه اتصال بالإنترنت.','auth/invalid-email':'اكتب الإيميل بشكل صحيح.'};
let doLogout=null;
function stopLive(){unsubs.forEach(u=>u());unsubs=[];unsubYear.forEach(u=>u());unsubYear=[]}
function startLive(){
  stopLive();
  unsubs.push(fs.onSnapshot(fs.collection(db,base(),'branches'),s=>{
    S.branches=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.order||0)-(b.order||0));
    S.mode='live';render();if(!$('editSheet').hidden) renderEdit();
  },e=>toast(errMsg(e),true)));
  subscribeYear();
}
function showLogin(on){$('login').hidden=!on;$('app').hidden=on}

if(!firebaseConfig){
  S.mode='local';showLogin(false);
  const b=$('banner');b.hidden=false;b.textContent='وضع التجربة: الموقع مو مربوط بقاعدة البيانات، فالأرقام هنا ما تنحفظ.';
  subscribeYear();route();
}else{
  const app=initializeApp(firebaseConfig);
  const auth=getAuth(app);
  initAI(app);
  db=fs.initializeFirestore(app,{localCache:fs.persistentLocalCache({tabManager:fs.persistentMultipleTabManager()})});
  doLogout=()=>signOut(auth);
  const pendingHash=location.hash;
  onAuthStateChanged(auth,u=>{
    if(u){uid=u.uid;yearCache.clear();aiChat=null;showLogin(false);startLive();
      if(pendingHash.startsWith('#import-')&&!location.hash) location.hash=pendingHash.slice(1); else route()}
    else{uid=null;stopLive();S.branches=[];S.entries=new Map();S.months=new Map();S.mode='loading';S.rendered='';showLogin(true)}
  });
  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();const btn=$('loginBtn'),err=$('loginErr');err.hidden=true;btn.disabled=true;btn.textContent='جاري الدخول…';
    try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}
    catch(x){err.textContent=authMsg[x.code]||'تعذّر الدخول. حاول مرة ثانية.';err.hidden=false}
    btn.disabled=false;btn.textContent='دخول';
  });
}
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
