import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import * as fs from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js';
import { firebaseConfig } from './config.js';

const AR_MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DOW=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const DOW_SHORT=['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];
const COLORS=['#3b6fe0','#e0662f','#1f9d74','#b04fc9','#d4a10f','#e04771','#2aa3b8','#7d8f22'];
const CUR={SAR:{s:'ر.س',d:2,n:'ريال سعودي'},KWD:{s:'د.ك',d:3,n:'دينار كويتي'},AED:{s:'د.إ',d:2,n:'درهم إماراتي'},QAR:{s:'ر.ق',d:2,n:'ريال قطري'},BHD:{s:'د.ب',d:3,n:'دينار بحريني'},OMR:{s:'ر.ع',d:3,n:'ريال عماني'}};
const now=new Date();
const S={year:now.getFullYear(),month:now.getMonth(),filter:'all',branches:[],entries:new Map(),settings:{currency:'SAR'},
  mode:'loading',yearLoaded:false,pendingDay:null,confirmDel:null};
let db=null,uid=null,unsubYear=null;

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ds=(y,m,d)=>`${y}-${pad(m+1)}-${pad(d)}`;
const dim=(y,m)=>new Date(y,m+1,0).getDate();
const todayStr=ds(now.getFullYear(),now.getMonth(),now.getDate());
const cur=()=>CUR[S.settings.currency]||CUR.SAR;
const fmt=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:cur().d}).format(n||0);
const money=n=>`${fmt(n)}<span class="cur">${cur().s}</span>`;
const mkFmt=o=>{try{return new Intl.DateTimeFormat('ar-u-ca-islamic-umalqura-nu-latn',o)}catch(e){return null}};
const hjDay=mkFmt({day:'numeric'}), hjMY=mkFmt({month:'long',year:'numeric'}), hjFull=mkFmt({day:'numeric',month:'long',year:'numeric'});
const branchById=id=>S.branches.find(b=>b.id===id);
const colorOf=b=>b?.color||COLORS[0];

function parseAmount(v){
  v=String(v).trim().replace(/[٠-٩]/g,c=>c.charCodeAt(0)-1632).replace(/[۰-۹]/g,c=>c.charCodeAt(0)-1776)
    .replace(/٫/g,'.').replace(/[,٬\s]/g,'');
  if(v==='') return null;
  const n=Number(v); return isFinite(n)&&n>=0?n:NaN;
}

let toastT;
function toast(msg,bad){const t=$('toast');t.textContent=msg;t.className='toast show'+(bad?' bad':'');clearTimeout(toastT);toastT=setTimeout(()=>t.className='toast'+(bad?' bad':''),3600)}
function errMsg(e){
  if(e?.code==='permission-denied') return 'ما عندك صلاحية تعديل البيانات في هذا الدفتر.';
  if(e?.code==='resource-exhausted') return 'وصلت للحد المجاني اليومي. جرّب بكرة.';
  return 'تعذّر الحفظ. تأكد من الاتصال وحاول مرة ثانية.';
}

/* ---------- aggregation ---------- */
function compute(){
  const bm={},days={};
  for(const b of S.branches) bm[b.id]=Array(12).fill(0);
  for(const e of S.entries.values()){
    if(!bm[e.branchId]||typeof e.amount!=='number') continue;
    const m=+e.date.slice(5,7)-1;
    bm[e.branchId][m]+=e.amount;
    const d=days[e.date]||(days[e.date]={t:0,b:{}});
    d.t+=e.amount; d.b[e.branchId]=e.amount;
  }
  return {bm,days};
}
const monthTotal=(A,m,f=S.filter)=>f==='all'?S.branches.reduce((s,b)=>s+A.bm[b.id][m],0):(A.bm[f]?.[m]||0);
const dayVal=(d,f=S.filter)=>!d?null:(f==='all'?d.t:(f in d.b?d.b[f]:null));

/* ---------- render ---------- */
function render(){
  const A=compute();
  if(S.filter!=='all'&&!branchById(S.filter)) S.filter='all';
  $('yLabel').textContent=S.year;
  renderMonths(A); renderCal(A); renderTotal(A); renderBranches(A); renderYear(A);
}

function renderMonths(A){
  const tots=AR_MONTHS.map((_,i)=>monthTotal(A,i)); const max=Math.max(...tots,0);
  $('months').innerHTML=AR_MONTHS.map((n,i)=>`<button class="mtile${i===S.month?' on':''}${S.year===now.getFullYear()&&i===now.getMonth()?' now':''}" data-m="${i}" aria-pressed="${i===S.month}">
    <span class="mnum num">${pad(i+1)}</span><span class="mname">${n}</span>
    <span class="mval">${tots[i]?fmt(tots[i]):'—'}</span><span class="mbar"><i style="width:${max?tots[i]/max*100:0}%"></i></span></button>`).join('');
}

function renderCal(A){
  const y=S.year,m=S.month,n=dim(y,m),first=new Date(y,m,1).getDay();
  $('calTitle').textContent=`${AR_MONTHS[m]} ${y}`;
  if(hjMY){const a=hjMY.format(new Date(y,m,1)),b=hjMY.format(new Date(y,m,n));$('calHijri').textContent=a===b?a:`${a} – ${b}`}
  const fb=branchById(S.filter);
  $('filterChip').innerHTML=fb?`<span class="chip" style="--c:${colorOf(fb)}"><span class="sw"></span>${esc(fb.name)}<button data-f="all" aria-label="عرض كل الفروع">×</button></span>`:`<span class="chip"><span class="sw all"></span>كل الفروع</span>`;
  const narrow=matchMedia('(max-width:620px)').matches;
  $('dow').innerHTML=(narrow?DOW_SHORT:DOW).map(d=>`<span>${d}</span>`).join('');
  let max=0; for(let d=1;d<=n;d++){const v=dayVal(A.days[ds(y,m,d)]);if(v>max)max=v}
  let h=''; for(let i=0;i<first;i++) h+='<span class="day blank" aria-hidden="true"></span>';
  for(let d=1;d<=n;d++){
    const key=ds(y,m,d), info=A.days[key], v=dayVal(info), dt=new Date(y,m,d), wd=dt.getDay();
    const cls=['day']; if(wd===5||wd===6)cls.push('wknd'); if(key===todayStr)cls.push('today'); if(key>todayStr)cls.push('future');
    const heat=v&&max?Math.round(12+v/max*48):0;
    const dots=S.filter==='all'&&info?S.branches.filter(b=>b.id in info.b).map(b=>`<i style="--c:${colorOf(b)}"></i>`).join(''):'';
    h+=`<button class="${cls.join(' ')}" data-d="${key}" style="--h:${heat}" aria-label="${d} ${AR_MONTHS[m]}${v!=null?'، '+fmt(v):''}">
      <span class="top-row"><span class="dn num">${d}</span><span class="hj">${hjDay?hjDay.format(dt):''}</span></span>
      <span class="dots">${dots}</span>
      ${v!=null?`<span class="dv">${fmt(v)}</span>`:`<span class="add">+ إضافة</span>`}</button>`;
  }
  $('cal').innerHTML=h;
}

function renderTotal(A){
  const m=S.month,t=monthTotal(A,m),fb=branchById(S.filter);
  const n=dim(S.year,m); let rec=0,best=null;
  for(let d=1;d<=n;d++){const v=dayVal(A.days[ds(S.year,m,d)]);if(v!=null){rec++;if(!best||v>best.v)best={d,v}}}
  let delta='';
  if(m>0){const p=monthTotal(A,m-1);if(p>0){const pc=(t-p)/p*100;delta=`<span class="delta">${pc>=0?'▲':'▼'} ${Math.abs(pc).toFixed(1)}% عن ${AR_MONTHS[m-1]}</span>`}}
  const name=fb?esc(fb.name):'كل الفروع';
  $('totalCard').innerHTML=`<div class="eyebrow">إجمالي أرباح ${name} · ${AR_MONTHS[m]} ${S.year}</div>
    <div class="big">${money(t)}</div>${delta}
    <dl class="stats">
      <div><dt>أيام مسجّلة</dt><dd class="num">${rec} / ${n}</dd></div>
      <div><dt>متوسط اليوم</dt><dd>${rec?fmt(t/rec):'—'}</dd></div>
      <div><dt>أفضل يوم</dt><dd>${best?`${best.d} ${AR_MONTHS[m]}`:'—'}</dd></div>
    </dl>`;
}

function renderBranches(A){
  const el=$('branchList');
  if(!S.branches.length){
    el.innerHTML=S.mode==='loading'?`<div class="empty">جاري تحميل الدفتر…</div>`:
      `<div class="empty"><strong>ابدأ بإضافة فروعك</strong>أضف أسماء فروع المحل، وبعدها اضغط على أي يوم في التقويم وسجّل دخله. المجاميع الشهرية تنحسب تلقائياً.<button class="btn primary" data-act="manage">+ أضف أول فرع</button></div>`;
    return;
  }
  const m=S.month,all=monthTotal(A,m,'all'),n=dim(S.year,m);
  const rows=S.branches.map(b=>{
    const t=A.bm[b.id][m],share=all?t/all*100:0;
    let rec=0;for(let d=1;d<=n;d++) if(A.days[ds(S.year,m,d)]?.b[b.id]!=null) rec++;
    return `<button class="brow${S.filter===b.id?' on':''}" data-f="${b.id}" style="--c:${colorOf(b)}">
      <span class="sw"></span><span class="bmeta"><span class="bn">${esc(b.name)}</span><span class="bsub num">${rec} يوم · ${share.toFixed(0)}% من الإجمالي</span></span>
      <span class="bv">${money(t)}</span><span class="bshare"><i style="width:${share}%"></i></span></button>`}).join('');
  el.innerHTML=`<div class="side-head"><h3>أرباح الفروع في ${AR_MONTHS[m]}</h3><button class="link" data-act="manage">تعديل الفروع</button></div>
    <button class="brow${S.filter==='all'?' on':''}" data-f="all"><span class="sw all"></span><span class="bmeta"><span class="bn">كل الفروع</span><span class="bsub num">${S.branches.length} فروع</span></span><span class="bv">${money(all)}</span></button>${rows}`;
}

function niceMax(v){if(v<=0)return 1;const e=Math.pow(10,Math.floor(Math.log10(v))),f=v/e;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*e}
const short=v=>v>=1e6?(+(v/1e6).toFixed(1))+'M':v>=1e3?(+(v/1e3).toFixed(1))+'K':String(+v.toFixed(0));

function renderYear(A){
  const y=S.year,sec=$('yearSec');
  const mt=AR_MONTHS.map((_,i)=>monthTotal(A,i,'all')),yt=mt.reduce((a,b)=>a+b,0);
  const W=760,H=250,pl=16,pr=48,pt=14,pb=34,cw=W-pl-pr,ch=H-pt-pb,bw=cw/12,top=niceMax(Math.max(...mt,0));
  const yv=v=>pt+ch-(v/top)*ch;
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="أرباح كل شهر في ${y}">`;
  for(let k=0;k<=4;k++){const v=top*k/4,yy=yv(v);
    svg+=`<line x1="${pl}" x2="${W-pr}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1" ${k?'stroke-dasharray="3 4"':''}/>`+
      `<text x="${W-pr+8}" y="${yy+4}" fill="var(--muted)" font-size="11" text-anchor="start" style="direction:ltr">${k?short(v):'0'}</text>`}
  AR_MONTHS.forEach((name,i)=>{
    const x=W-pr-(i+1)*bw+bw*.18,w=bw*.64; let acc=0;
    svg+=`<g class="bar" data-m="${i}">`;
    svg+=`<rect x="${W-pr-(i+1)*bw}" y="${pt}" width="${bw}" height="${ch}" fill="${i===S.month?'var(--surface-2)':'transparent'}"/>`;
    S.branches.forEach(b=>{const v=A.bm[b.id][i];if(!v)return;const y1=yv(acc+v),y0=yv(acc);acc+=v;
      svg+=`<rect x="${x}" y="${y1}" width="${w}" height="${Math.max(y0-y1,0)}" fill="${colorOf(b)}" class="${S.filter!=='all'&&S.filter!==b.id?'faded':''}"><title>${esc(b.name)} · ${name}: ${fmt(v)} ${cur().s}</title></rect>`});
    svg+=`<text x="${x+w/2}" y="${H-12}" fill="${i===S.month?'var(--ink)':'var(--muted)'}" font-size="12" font-weight="${i===S.month?700:400}" text-anchor="middle">${name}</text></g>`;
  });
  svg+='</svg>';
  const legend=S.branches.map(b=>`<span><i class="sw" style="--c:${colorOf(b)}"></i>${esc(b.name)}</span>`).join('');
  const head=`<tr><th>الفرع</th>${AR_MONTHS.map((n,i)=>`<th class="${i===S.month?'sel':''}">${n}</th>`).join('')}<th class="tot">إجمالي السنة</th></tr>`;
  const body=S.branches.map(b=>{const r=A.bm[b.id],s=r.reduce((a,c)=>a+c,0);
    return `<tr><td><span class="sw" style="--c:${colorOf(b)}"></span> ${esc(b.name)}</td>${r.map((v,i)=>`<td class="${i===S.month?'sel ':''}${v?'':'zero'}">${v?fmt(v):'—'}</td>`).join('')}<td class="tot">${fmt(s)}</td></tr>`}).join('');
  const foot=`<tr><td>كل الفروع</td>${mt.map((v,i)=>`<td class="${i===S.month?'sel':''}">${v?fmt(v):'—'}</td>`).join('')}<td class="tot">${fmt(yt)}</td></tr>`;
  sec.innerHTML=`<div class="year-head"><div><div class="eyebrow">التقرير السنوي</div><h2>أرباح سنة ${y}</h2></div>
    <div class="ytotal">إجمالي السنة لكل الفروع<strong>${money(yt)}</strong></div>
    <button class="btn small" data-act="csv">تصدير ملف Excel (CSV)</button></div>
    ${S.branches.length?`<div class="chart">${svg}</div><div class="legend">${legend}</div>
    <div class="tbl-wrap"><table><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>`:
    `<div class="empty">بعد ما تضيف الفروع وتسجّل الدخل، يظهر هنا رسم أرباح كل شهر وجدول المجاميع لكل فرع.</div>`}`;
}

/* ---------- day entry ---------- */
function openDay(date){
  if(!S.branches.length){openBranches();return}
  const [y,mo,d]=date.split('-').map(Number),dt=new Date(y,mo-1,d),m=mo-1;
  const A=compute();
  const rows=S.branches.map(b=>{const ex=S.entries.get(`${b.id}_${date}`)?.amount;
    return `<label class="erow" style="--c:${colorOf(b)}" for="in-${b.id}"><span class="sw"></span><span class="en">${esc(b.name)}</span>
      <input id="in-${b.id}" data-b="${b.id}" inputmode="decimal" autocomplete="off" placeholder="0" value="${ex!=null?ex:''}" data-old="${ex!=null?ex:''}">
      <span class="emt">إجمالي ${esc(b.name)} لشهر ${AR_MONTHS[m]}: <b data-mt="${b.id}"></b></span></label>`}).join('');
  $('dayDlg').innerHTML=`<form class="dlg" id="dayForm" novalidate>
    <div class="dlg-head"><div><div class="eyebrow">تسجيل الدخل اليومي</div><h3>${DOW[dt.getDay()]} ${d} ${AR_MONTHS[m]} ${y}</h3><div class="hijri">${hjFull?hjFull.format(dt):''}</div></div>
      <button type="button" class="icon-btn" data-close aria-label="إغلاق">×</button></div>
    <div class="dlg-body">${rows}</div>
    <div class="dlg-foot"><div class="sums"><div><span>دخل هذا اليوم</span><b id="daySum"></b></div><div><span>كل الفروع لشهر ${AR_MONTHS[m]}</span><b id="allSum"></b></div></div>
      <div class="acts"><button type="button" class="btn" data-close>إلغاء</button><button type="submit" class="btn primary" id="saveDay">حفظ الدخل</button></div></div></form>`;
  const dlg=$('dayDlg'),form=$('dayForm');
  const update=()=>{let day=0,all=0;
    S.branches.forEach(b=>{const inp=$('in-'+b.id),v=parseAmount(inp.value),old=S.entries.get(`${b.id}_${date}`)?.amount||0;
      inp.classList.toggle('err',Number.isNaN(v));const nv=Number.isNaN(v)||v==null?0:v;
      const mt=A.bm[b.id][m]-old+nv; day+=nv; all+=mt;
      form.querySelector(`[data-mt="${b.id}"]`).innerHTML=money(mt)});
    $('daySum').innerHTML=money(day);$('allSum').innerHTML=money(all);return all};
  update();
  form.addEventListener('input',update);
  form.addEventListener('submit',async e=>{e.preventDefault();
    const changes=[];let bad=false;
    S.branches.forEach(b=>{const inp=$('in-'+b.id),v=parseAmount(inp.value);if(Number.isNaN(v)){bad=true;return}
      const old=inp.dataset.old===''?null:Number(inp.dataset.old);if(v!==old)changes.push({b:b.id,v})});
    if(bad){toast('اكتب أرقام فقط في خانات الدخل.',true);return}
    if(!changes.length){dlg.close();return}
    const btn=$('saveDay');btn.disabled=true;btn.textContent='جاري الحفظ…';
    const allAfter=update();
    try{await Promise.all(changes.map(c=>saveEntry(c.b,date,c.v)));dlg.close();
      toast(`تم الحفظ ✓ إجمالي كل الفروع لشهر ${AR_MONTHS[m]}: ${fmt(allAfter)} ${cur().s}`)}
    catch(err){toast(errMsg(err),true);btn.disabled=false;btn.textContent='حفظ الدخل'}});
  dlg.showModal();
  const firstEmpty=S.branches.map(b=>$('in-'+b.id)).find(i=>!i.value)||$('in-'+S.branches[0].id);
  if(!matchMedia('(pointer:coarse)').matches) firstEmpty.focus();
}

/* ---------- branches ---------- */
function openBranches(){
  const dlg=$('brDlg');
  const list=S.branches.map(b=>`<div class="brm" style="--c:${colorOf(b)}">
      <button type="button" class="swbtn" data-color="${b.id}" aria-label="تغيير لون ${esc(b.name)}"></button>
      <input id="bn-${b.id}" data-rename="${b.id}" value="${esc(b.name)}" aria-label="اسم الفرع" maxlength="40">
      <button type="button" class="btn small danger" data-del="${b.id}">حذف</button>
      ${S.confirmDel===b.id?`<div class="confirm"><span>حذف «${esc(b.name)}» يمسح كل الدخل المسجّل له. متأكد؟</span><span class="acts"><button type="button" class="btn small" data-cancel>لا</button><button type="button" class="btn small danger" data-delok="${b.id}">نعم، احذف</button></span></div>`:''}
    </div>`).join('');
  dlg.innerHTML=`<div class="dlg"><div class="dlg-head"><div><div class="eyebrow">إعدادات الدفتر</div><h3>فروع المحل</h3></div><button type="button" class="icon-btn" data-close aria-label="إغلاق">×</button></div>
    <div class="dlg-body">${list||'<div class="empty" style="padding:6px">ما فيه فروع للحين. اكتب اسم أول فرع تحت.</div>'}
      <form class="addrow" id="addForm"><input id="newBranch" placeholder="اسم الفرع، مثلاً: فرع العليا" maxlength="40" aria-label="اسم فرع جديد"><button class="btn primary" type="submit">إضافة</button></form>
      <label class="field" for="curSel">العملة
        <select id="curSel">${Object.entries(CUR).map(([k,c])=>`<option value="${k}"${S.settings.currency===k?' selected':''}>${c.n} (${c.s})</option>`).join('')}</select></label>
    </div></div>`;
  if(!dlg.open) dlg.showModal();
}
$('brDlg').addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.color){const b=branchById(t.dataset.color),i=(COLORS.indexOf(b.color)+1)%COLORS.length;await act(()=>saveBranch(b.id,{color:COLORS[i]}))}
  else if(t.dataset.del){S.confirmDel=t.dataset.del;openBranches()}
  else if('cancel' in t.dataset){S.confirmDel=null;openBranches()}
  else if(t.dataset.delok){const id=t.dataset.delok;S.confirmDel=null;await act(()=>deleteBranch(id),'تم حذف الفرع')}
});
$('brDlg').addEventListener('change',async e=>{
  if(e.target.dataset.rename){const n=e.target.value.trim();if(n)await act(()=>saveBranch(e.target.dataset.rename,{name:n}),'تم تحديث الاسم')}
  if(e.target.id==='curSel'){S.settings.currency=e.target.value;await act(()=>saveSettings({currency:e.target.value}))}
});
$('brDlg').addEventListener('submit',async e=>{e.preventDefault();const inp=$('newBranch'),n=inp.value.trim();if(!n)return;
  await act(()=>addBranch(n),`تمت إضافة ${n}`);});
async function act(fn,ok){try{await fn();if(ok)toast(ok)}catch(err){toast(errMsg(err),true)}if($('brDlg').open)openBranches();render()}


/* ---------- storage (Firebase) ---------- */
const base=()=>`users/${uid}`;
async function saveEntry(bid,date,v){
  const id=`${bid}_${date}`;
  const data={branchId:bid,date,year:+date.slice(0,4),month:date.slice(0,7),amount:v,updatedAt:new Date().toISOString()};
  yearCache.delete(+date.slice(0,4));
  if(db){const ref=fs.doc(db,base(),'entries',id);return v==null?fs.deleteDoc(ref):fs.setDoc(ref,data)}
  v==null?S.entries.delete(id):S.entries.set(id,data);render();
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
    const snap=await fs.getDocs(fs.query(fs.collection(db,base(),'entries'),fs.where('branchId','==',id)));
    const refs=[fs.doc(db,base(),'branches',id),...snap.docs.map(d=>d.ref)];
    for(let i=0;i<refs.length;i+=400){const b=fs.writeBatch(db);refs.slice(i,i+400).forEach(r=>b.delete(r));await b.commit()}
    return;
  }
  S.branches=S.branches.filter(b=>b.id!==id);
  for(const k of [...S.entries.keys()]) if(k.startsWith(id+'_')) S.entries.delete(k);
}
async function saveSettings(p){if(db) return fs.setDoc(fs.doc(db,base(),'settings','main'),{...S.settings,...p})}

function subscribeYear(){
  S.yearLoaded=false;
  if(!db){S.yearLoaded=true;return}
  unsubYear?.(); S.entries=new Map();
  unsubYear=fs.onSnapshot(fs.query(fs.collection(db,base(),'entries'),fs.where('year','==',S.year)),s=>{
    S.entries=new Map(s.docs.map(d=>[d.id,d.data()]));S.yearLoaded=true;render();
    if(S.pendingDay){const d=S.pendingDay;S.pendingDay=null;openDay(d)}
  },e=>toast(errMsg(e),true));
}
function setYear(y){S.year=y;subscribeYear();render()}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-m],[data-d],[data-f],[data-act],[data-close]');if(!t)return;
  if('close' in t.dataset){t.closest('dialog').close();return}
  if(t.dataset.d){openDay(t.dataset.d);return}
  if(t.dataset.m!=null){S.month=+t.dataset.m;render();return}
  if(t.dataset.f){S.filter=t.dataset.f;render();return}
  if(t.dataset.act==='manage') openBranches();
  if(t.dataset.act==='csv') exportCsv();
});
$('yPrev').onclick=()=>setYear(S.year-1);
$('yNext').onclick=()=>setYear(S.year+1);
$('mPrev').onclick=()=>{if(S.month===0){S.month=11;setYear(S.year-1)}else{S.month--;render()}};
$('mNext').onclick=()=>{if(S.month===11){S.month=0;setYear(S.year+1)}else{S.month++;render()}};
$('manageBtn').onclick=openBranches;
$('todayBtn').onclick=()=>{
  S.month=now.getMonth();
  if(S.year!==now.getFullYear()){S.pendingDay=todayStr;setYear(now.getFullYear());if(!db){S.pendingDay=null;openDay(todayStr)}}
  else{render();openDay(todayStr)}
};
$('brDlg').addEventListener('close',()=>{S.confirmDel=null});
matchMedia('(max-width:620px)').addEventListener('change',render);

function exportCsv(){
  const A=compute(),q=v=>`"${String(v).replace(/"/g,'""')}"`,rows=[];
  rows.push([`أرباح سنة ${S.year} (${cur().n})`]);
  rows.push(['الفرع',...AR_MONTHS,'إجمالي السنة']);
  S.branches.forEach(b=>{const r=A.bm[b.id];rows.push([b.name,...r,r.reduce((a,c)=>a+c,0)])});
  const mt=AR_MONTHS.map((_,i)=>monthTotal(A,i,'all'));rows.push(['كل الفروع',...mt,mt.reduce((a,c)=>a+c,0)]);
  rows.push([]);rows.push([`الدخل اليومي لشهر ${AR_MONTHS[S.month]} ${S.year}`]);
  rows.push(['التاريخ',...S.branches.map(b=>b.name),'إجمالي اليوم']);
  for(let d=1;d<=dim(S.year,S.month);d++){const k=ds(S.year,S.month,d),i=A.days[k];
    rows.push([k,...S.branches.map(b=>i?.b[b.id]??''),i?i.t:''])}
  const blob=new Blob(['﻿'+rows.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ارباح-الفروع-${S.year}.csv`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}

/* ---------- smart assistant ---------- */
const WD_EN=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const yearCache=new Map();
const r3=n=>Math.round(n*1000)/1000;
const isDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
const norm=s=>String(s||'').replace(/^\s*فرع\s+/,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').trim().toLowerCase();
// null = no branch asked (all branches), undefined = name not found
function resolveBranch(q){
  if(!q) return null; const n=norm(q);
  return S.branches.find(b=>norm(b.name)===n)||S.branches.find(b=>norm(b.name).includes(n)||n.includes(norm(b.name)));
}
async function entriesForYear(y){
  if(y===S.year&&S.yearLoaded) return [...S.entries.values()];
  if(!db) return [];
  if(!yearCache.has(y)){
    const snap=await fs.getDocs(fs.query(fs.collection(db,base(),'entries'),fs.where('year','==',y)));
    yearCache.set(y,snap.docs.map(d=>d.data()));
  }
  return yearCache.get(y);
}
async function rangeEntries(from,to){
  const y0=+from.slice(0,4),y1=+to.slice(0,4),ids=new Set(S.branches.map(b=>b.id)),out=[];
  for(let y=y0;y<=y1&&y<=y0+5;y++) out.push(...await entriesForYear(y));
  return out.filter(e=>e.date>=from&&e.date<=to&&ids.has(e.branchId));
}
function eachDay(from,to,fn){
  const d=new Date(from+'T00:00'),end=new Date(to+'T00:00');
  for(let i=0;d<=end&&i<4000;d.setDate(d.getDate()+1),i++) fn(ds(d.getFullYear(),d.getMonth(),d.getDate()),d.getDay());
}
const branchErr=q=>({error:`ما فيه فرع اسمه "${q}"`,branches:S.branches.map(b=>b.name)});
const rangeErr=()=>({error:'التواريخ لازم تكون بصيغة YYYY-MM-DD'});

const TOOLS={
  async list_branches(){return {currency:cur().n,branches:S.branches.map(b=>b.name)}},
  async get_totals({from,to,branch,weekday}){
    if(!isDate(from)||!isDate(to)) return rangeErr();
    const b=resolveBranch(branch); if(b===undefined) return branchErr(branch);
    const wi=weekday?WD_EN.indexOf(weekday):-1;
    const per={}; for(const x of S.branches) if(!b||x.id===b.id) per[x.name]={total:0,days_entered:0};
    let total=0;
    for(const e of await rangeEntries(from,to)){
      if(b&&e.branchId!==b.id) continue;
      if(wi>=0&&new Date(e.date+'T00:00').getDay()!==wi) continue;
      const p=per[branchById(e.branchId).name]; p.total=r3(p.total+e.amount); p.days_entered++; total+=e.amount;
    }
    return {from,to,weekday:weekday||null,currency:cur().n,total:r3(total),per_branch:per};
  },
  async get_day({date}){
    if(!isDate(date)) return rangeErr();
    const es=await rangeEntries(date,date),amounts={};
    for(const e of es) amounts[branchById(e.branchId).name]=e.amount;
    return {date,weekday:DOW[new Date(date+'T00:00').getDay()],currency:cur().n,total:r3(es.reduce((s,e)=>s+e.amount,0)),
      amounts,not_entered:S.branches.filter(b=>!(b.name in amounts)).map(b=>b.name)};
  },
  async get_daily({from,to,branch}){
    if(!isDate(from)||!isDate(to)) return rangeErr();
    const b=resolveBranch(branch); if(b===undefined) return branchErr(branch);
    const by={}; for(const e of await rangeEntries(from,to)) if(!b||e.branchId===b.id) by[e.date]=(by[e.date]||0)+e.amount;
    const days=[]; eachDay(from,to,(d,w)=>{if(d in by) days.push({date:d,weekday:DOW[w],total:r3(by[d])})});
    return {branch:b?.name||'كل الفروع',days:days.slice(-120),truncated:days.length>120};
  },
  async find_missing_days({from,to,branch}){
    if(!isDate(from)||!isDate(to)) return rangeErr();
    const b=resolveBranch(branch); if(b===undefined) return branchErr(branch);
    if(to>todayStr) to=todayStr;
    const have=new Set((await rangeEntries(from,to)).map(e=>e.branchId+'|'+e.date)),list=[];
    const targets=b?[b]:S.branches;
    eachDay(from,to,(d,w)=>{const miss=targets.filter(x=>!have.has(x.id+'|'+d)).map(x=>x.name);if(miss.length) list.push({date:d,weekday:DOW[w],missing:miss})});
    return {from,to,checked_until:to,missing_days_count:list.length,days:list.slice(0,100),truncated:list.length>100};
  },
};
async function runTool(name,args){
  try{return TOOLS[name]?await TOOLS[name](args||{}):{error:'أداة غير معروفة'}}catch(e){return {error:'تعذّر قراءة البيانات'}}
}

function aiDecls(){
  const date=d=>Schema.string({description:`${d} بصيغة YYYY-MM-DD`});
  const branch=Schema.string({description:'اسم الفرع كما يكتبه المستخدم. اتركه فاضي لكل الفروع'});
  return [
    {name:'list_branches',description:'أسماء الفروع والعملة'},
    {name:'get_totals',description:'مجموع الدخل لفترة، لكل فرع ولكل الفروع. يقدر يحسب يوم معيّن من الأسبوع بس (مثل كل أيام الاثنين)',
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
  const t=new Date(),y=t.getFullYear(),m=t.getMonth();
  return `أنت "المساعد الذكي" داخل موقع "دفتر الفروع"، تجاوب صاحب المحل عن دخل وأرباح فروعه.
اليوم: ${todayStr} (${DOW[t.getDay()]}). هالشهر: ${ds(y,m,1)} إلى ${todayStr}. الشهر اللي فات: ${ds(m?y:y-1,(m+11)%12,1)} إلى ${ds(m?y:y-1,(m+11)%12,dim(m?y:y-1,(m+11)%12))}. هالسنة: ${y}-01-01 إلى ${todayStr}.
الأسبوع يبدأ الأحد. "يوم الاثنين" بدون تاريخ يعني آخر اثنين مضى.
القواعد:
- أي رقم لازم يجي من الأدوات. لا تخمّن ولا تخترع أرقام. المجاميع خذها من الأداة كما هي.
- إذا اسم الفرع مو واضح استخدم list_branches، وإذا ما لقيته قل للمستخدم الفروع الموجودة.
- "يوم ناقص" أو "ما عبّيته" أو "نسيت أسجّل" تعني find_missing_days.
- جاوب باللهجة الخليجية، باختصار ووضوح. اكتب الأرقام بفواصل الآلاف ومعها العملة. استخدم نقاط قصيرة إذا فيه أكثر من فرع.
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
  text=text.trim();if(!text||aiBusy)return;
  aiBusy=true;$('aiSugg').hidden=true;$('aiSend').disabled=true;
  aiMsg('me',esc(text));const wait=aiMsg('bot','<span class="ai-dots"><i></i><i></i><i></i></span>');
  try{
    if(!aiModel){wait.innerHTML='المساعد يشتغل بعد ما نربط الموقع بـ Firebase ونفعّل Gemini (AI Logic).';return}
    aiChat??=aiModel.startChat();
    let r=await aiChat.sendMessage(text);
    for(let i=0;i<6;i++){
      const calls=r.response.functionCalls();if(!calls?.length)break;
      const parts=await Promise.all(calls.map(async c=>({functionResponse:{name:c.name,response:await runTool(c.name,c.args)}})));
      r=await aiChat.sendMessage(parts);
    }
    wait.innerHTML=mdLite(r.response.text()||'ما قدرت أطلع جواب. جرّب تصيغ السؤال بطريقة ثانية.');
  }catch(e){
    const m=String(e?.message||e);
    wait.innerHTML=/api-not-enabled|not been used|disabled|AI Logic/i.test(m)?'لازم تفعّل <b>AI Logic</b> في Firebase عشان يشتغل المساعد.':
      /quota|429|RESOURCE_EXHAUSTED/i.test(m)?'وصلنا للحد المجاني للمساعد حالياً. جرّب بعد شوي.':'صار خطأ في الاتصال بالمساعد. تأكد من الإنترنت وجرّب مرة ثانية.';
    aiChat=null;
  }finally{aiBusy=false;$('aiSend').disabled=false}
}
const AI_SUGG=['كم إجمالي كل فرع هالشهر؟','وش الأيام اللي ما عبّيتها هالشهر؟','كم دخلنا يوم الاثنين اللي فات؟','أي فرع أعلى أرباح هالسنة؟'];
function openAI(on){
  $('aiPanel').hidden=!on;$('aiFab').hidden=on;
  if(on){
    if(!$('aiMsgs').children.length) aiMsg('bot','هلا! اسألني عن أي فرع أو يوم أو شهر، وأجاوبك من أرقام الدفتر.');
    if(!matchMedia('(pointer:coarse)').matches) $('aiInput').focus();
  }
}
$('aiSugg').innerHTML=AI_SUGG.map(s=>`<button type="button">${s}</button>`).join('');
$('aiSugg').addEventListener('click',e=>{const b=e.target.closest('button');if(b)aiAsk(b.textContent)});
$('aiFab').onclick=()=>openAI(true);
$('aiClose').onclick=()=>openAI(false);
$('aiForm').addEventListener('submit',e=>{e.preventDefault();const i=$('aiInput');aiAsk(i.value);i.value=''});

/* ---------- auth & boot ---------- */
const authMsg={'auth/invalid-credential':'الإيميل أو كلمة السر غلط.','auth/wrong-password':'كلمة السر غلط.','auth/user-not-found':'ما فيه حساب بهذا الإيميل.',
  'auth/too-many-requests':'محاولات كثيرة. انتظر شوي وجرّب.','auth/network-request-failed':'ما فيه اتصال بالإنترنت.','auth/invalid-email':'اكتب الإيميل بشكل صحيح.'};
let unsubs=[];
function stopLive(){unsubs.forEach(u=>u());unsubs=[];unsubYear?.();unsubYear=null}
function startLive(){
  stopLive();
  unsubs.push(fs.onSnapshot(fs.collection(db,base(),'branches'),s=>{
    S.branches=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.order||0)-(b.order||0));
    S.mode='live';render();if($('brDlg').open)openBranches();
  },e=>toast(errMsg(e),true)));
  unsubs.push(fs.onSnapshot(fs.doc(db,base(),'settings','main'),s=>{if(s.exists()){Object.assign(S.settings,s.data());render()}},()=>{}));
  subscribeYear();
}
function showLogin(on){$('login').hidden=!on;$('app').hidden=on}

render();
if(!firebaseConfig){
  S.mode='local';showLogin(false);$('logoutBtn').hidden=true;
  const b=$('banner');b.hidden=false;
  b.textContent='وضع التجربة: الموقع لسه ما انربط بقاعدة البيانات (Firebase)، فالأرقام هنا ما تنحفظ.';
  subscribeYear();render();
}else{
  const app=initializeApp(firebaseConfig);
  const auth=getAuth(app);
  initAI(app);
  db=fs.initializeFirestore(app,{localCache:fs.persistentLocalCache({tabManager:fs.persistentMultipleTabManager()})});
  onAuthStateChanged(auth,u=>{
    if(u){uid=u.uid;yearCache.clear();aiChat=null;showLogin(false);startLive()}
    else{uid=null;stopLive();S.branches=[];S.entries=new Map();S.mode='loading';showLogin(true);render()}
  });
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();
    const btn=$('loginBtn'),err=$('loginErr');err.hidden=true;btn.disabled=true;btn.textContent='جاري الدخول…';
    try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}
    catch(x){err.textContent=authMsg[x.code]||'تعذّر الدخول. حاول مرة ثانية.';err.hidden=false}
    btn.disabled=false;btn.textContent='دخول'});
  $('logoutBtn').onclick=()=>signOut(auth);
}
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
