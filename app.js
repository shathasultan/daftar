import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import * as fs from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';
import { firebaseConfig, appCheckSiteKey } from './config.js';

const USER_NAME='أحمد';
const AR_MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DOW=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
// Stored branch colours (kept for older data) and the dark-mode tones the design shows for each
const COLORS=['#007aff','#ff9500','#34c759','#af52de','#ff2d55','#5ac8fa','#ffcc00','#5856d6'];
const DARK=['#0A84FF','#FF9F0A','#30D158','#BF5AF2','#FF375F','#40C8E0','#FFD60A','#5E5CE6'];
const ICON_GRAD=['linear-gradient(180deg,#3A93FF 0%,#0A64E0 100%)','linear-gradient(180deg,#E8811A 0%,#B05000 100%)','linear-gradient(180deg,#31A955 0%,#1A7A36 100%)'];
const CUR='ر.س';
const now=new Date();
const S={view:'home',branchId:null,year:now.getFullYear(),month:now.getMonth(),branches:[],entries:new Map(),months:new Map(),expenses:new Map(),
  yearLoaded:false,mode:'loading',rendered:'',tab:'income',metric:'income'};
let db=null,uid=null,unsubYear=[],unsubs=[],appCheck=null;

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ds=(y,m,d)=>`${y}-${pad(m+1)}-${pad(d)}`;
const dim=(y,m)=>new Date(y,m+1,0).getDate();
const ym=(y,m)=>`${y}-${pad(m+1)}`;
const todayStr=ds(now.getFullYear(),now.getMonth(),now.getDate());
const nf=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const fmt=n=>nf.format(n||0);
const branchById=id=>S.branches.find(b=>b.id===id);
const cIdx=b=>Math.max(0,COLORS.indexOf(String(b?.color||'').toLowerCase()));
const tone=b=>DARK[cIdx(b)];
const grad=b=>ICON_GRAD[cIdx(b)]||`linear-gradient(180deg,color-mix(in srgb,${tone(b)} 88%,#fff) 0%,color-mix(in srgb,${tone(b)} 72%,#000) 100%)`;
const badge=b=>(String(b.name).match(/\d+/)||[String(b.name).replace(/^فرع\s*/,'').trim()[0]||'؟'])[0];
const shortName=b=>/\d/.test(b.name)?`فرع ${badge(b)}`:b.name;
const isCurMonth=()=>S.year===now.getFullYear()&&S.month===now.getMonth();
const isFutureMonth=(y,m)=>y>now.getFullYear()||(y===now.getFullYear()&&m>now.getMonth());
const plDays=n=>n===1?'يوم':n===2?'يومين':n<=10?`${n} أيام`:`${n} يوم`;

// Accepts 1250, 1,250, 8,333.33, Arabic digits and the Arabic decimal mark. Commas are thousands separators.
const normDigits=v=>String(v).replace(/[٠-٩]/g,c=>c.charCodeAt(0)-1632).replace(/[۰-۹]/g,c=>c.charCodeAt(0)-1776).replace(/٫/g,'.').replace(/[٬،]/g,',');
function parseAmount(v){
  v=normDigits(v).trim().replace(/[,\s]/g,'');
  if(v===''||v==='-'||v==='—') return null;
  if(!/^\d+(\.\d+)?$/.test(v)) return NaN;
  return Math.round(Number(v)*100)/100;
}

let toastT;
function toast(msg,bad){
  const t=$('toast');$('toastText').textContent=msg;
  $('toastIcon').innerHTML=bad?'!':IC.check(12);
  t.className='toast show'+(bad?' bad':'');clearTimeout(toastT);toastT=setTimeout(()=>t.className='toast'+(bad?' bad':''),bad?2400:1500);
}
function errMsg(e){
  if(e?.code==='permission-denied') return 'ما عندك صلاحية تعديل البيانات';
  if(e?.code==='resource-exhausted') return 'وصلت للحد المجاني اليوم، جرّب بكرة';
  return 'تعذّر الحفظ، تأكد من الاتصال';
}

const IC={
  prev:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="2.6" cy="8" r="1.5" fill="currentColor"/><path d="M5.8 8h7.4M10 4.6L13.4 8 10 11.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="13.4" cy="8" r="1.5" fill="currentColor"/><path d="M10.2 8H2.8M6 4.6L2.6 8 6 11.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  spark:(s=20)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5z" fill="#FFFFFF"/><circle cx="19" cy="18" r="2" fill="#FFD60A"/></svg>`,
  check:(s=11)=>`<svg width="${s}" height="${s}" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-4.9" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  up:'<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M5 8.5V1.8M2 4.6L5 1.6l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down:'<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M5 1.5v6.7M2 5.4l3 3 3-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  paper:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><g transform="rotate(-8 12 12)"><rect x="5" y="3.5" width="14" height="17" rx="2.5" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.6"/><path d="M8 9.5c1-1.2 2-1.2 3 0s2 1.2 3 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 14h8M8 16.8h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></g></svg>',
  logo:(s=16)=>`<svg width="${s}" height="${s}" viewBox="0 0 52 52" fill="none" aria-hidden="true"><rect x="9" y="7" width="34" height="38" rx="6" fill="#FFFFFF"/><rect x="21" y="30" width="5" height="9" rx="2" fill="#0A84FF"/><rect x="28" y="23" width="5" height="16" rx="2" fill="#FF9F0A"/><rect x="35" y="16" width="5" height="23" rx="2" fill="#30D158"/></svg>`,
};
// Three bars in the first three branch colours (the design's small chart mark)
const threeTones=()=>{const t=S.branches.slice(0,3).map(tone);return [t[0]||DARK[0],t[1]||DARK[1],t[2]||DARK[2]]};
const miniBars=(hs=[7,12,16])=>threeTones().map((c,i)=>`<span class="minibar" style="height:${hs[i]}px;background:${c}"></span>`).join('');

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
const entryOf=(bid,date)=>S.entries.get(`${bid}_${date}`);
// Expenses: one document per branch and month holding its list of items
const expOf=(bid,y,m)=>S.expenses.get(`${bid}_${ym(y,m)}`);
const expTotal=doc=>(doc?.items||[]).reduce((s,i)=>s+(typeof i.amount==='number'?i.amount:0),0);
const expMonthAll=m=>S.branches.reduce((s,b)=>s+expTotal(expOf(b.id,S.year,m)),0);
// Days of the month that count as due: up to today in the current month, all days in past months, none in future months
const dueDays=(y,m)=>isFutureMonth(y,m)?0:(y===now.getFullYear()&&m===now.getMonth()?now.getDate():dim(y,m));

/* ---------- frame ---------- */
function setNav({start='',title='',end='',home=false}){
  $('navStart').innerHTML=start;$('navTitle').textContent=title;$('navEnd').innerHTML=end;
  $('nav').classList.toggle('home',home);
}
const aiBtn=`<button class="nav-icon" type="button" data-act="ai" aria-label="المساعد الذكي"><span class="ai-orb">${IC.spark(20)}</span></button>`;
const backBtn=(label='الفروع')=>`<a class="back" href="#" aria-label="رجوع إلى ${label}"><span class="pill">${IC.prev}<span>${label}</span></span></a>`;
function monthSwitch(){
  const nextOff=isFutureMonth(S.month===11?S.year+1:S.year,(S.month+1)%12);
  return `<div class="switch" role="group" aria-label="الشهر">
    <button type="button" data-mstep="-1" aria-label="الشهر السابق"><span class="knob">${IC.prev}</span></button>
    <span class="label tnum">${AR_MONTHS[S.month]} ${S.year}</span>
    <button type="button" data-mstep="1" aria-label="الشهر التالي"${nextOff?' disabled':''}><span class="knob">${IC.next}</span></button></div>`;
}

function render(){
  if(S.view==='branch'&&!branchById(S.branchId)&&S.mode==='live'){location.hash='';return}
  const key=`${S.view}|${S.branchId}|${S.year}|${S.month}|${S.tab}|${S.metric}`;
  if(S.view==='branch'&&S.rendered===key&&($('days')||$('exp'))){patchBranch();return}
  const fresh=S.rendered.split('|').slice(0,2).join('|')!==`${S.view}|${S.branchId}`;
  S.rendered=key;
  if(S.view==='branch') renderBranch(); else if(S.view==='report') renderReport(); else renderHome();
  if(fresh){const p=$('page');p.classList.remove('enter');void p.offsetWidth;p.classList.add('enter');window.scrollTo(0,0)}
  onScroll();
}

/* ---------- home ---------- */
function renderHome(){
  setNav({home:true,
    start:`<div class="nav-brand"><span class="mini-logo">${IC.logo(16)}</span><span>دفتر الفروع</span></div>`,
    title:`أهلاً ${USER_NAME}`,
    end:`<a class="nav-icon" href="#report" aria-label="التقرير السنوي"><span class="rep">${miniBars()}</span></a>${aiBtn}`});
  $('foot').hidden=true;$('page').classList.remove('has-bar');
  const d=new Date(),tt=threeTones();
  const head=`<header class="head"><div><p class="date">${DOW[d.getDay()]}، ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}</p><h1 class="title">أهلاً ${USER_NAME}</h1></div>
    <div class="head-bars" aria-hidden="true"><span style="height:12px;background:${tt[0]}"></span><span style="height:20px;background:${tt[1]}"></span><span style="height:28px;background:${tt[2]}"></span></div></header>`;
  const logout=db?`<div class="list" style="margin-top:28px"><button class="logout" type="button" data-act="logout">تسجيل الخروج</button></div>`:'';
  const legal=appCheckSiteKey?`<p class="legal">الموقع محمي بـ reCAPTCHA من Google، وتنطبق <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">سياسة الخصوصية</a> و<a href="https://policies.google.com/terms" target="_blank" rel="noopener">شروط الخدمة</a>.</p>`:'';

  if(S.mode==='loading'){
    $('page').innerHTML=`${head}
      <div class="loading-line" role="status"><span class="loader" aria-hidden="true">${tt.map(c=>`<span style="background:${c}"></span>`).join('')}</span><span>جاري تحميل فروعك…</span></div>
      <div class="card" aria-hidden="true" style="margin-top:14px;padding:18px 16px 20px;display:flex;flex-direction:column;gap:12px">
        <div class="ghost" style="width:150px;height:12px"></div><div class="ghost" style="width:210px;height:40px;border-radius:10px"></div>
        <div style="margin-top:4px;height:64px;display:flex;align-items:flex-end;gap:3px">${Array.from({length:31},(_,i)=>`<span class="ghost" style="flex:1;height:${i%5===0?34:20+(i*7)%26}px;border-radius:2.5px 2.5px 0 0"></span>`).join('')}</div>
      </div>
      <div class="ghost" aria-hidden="true" style="margin-top:30px;width:76px;height:20px"></div>
      <div class="list" aria-hidden="true" style="margin-top:14px">${['58%','40%','50%'].map(w=>`<div style="display:flex;align-items:center;gap:14px;height:88px;padding:0 16px"><div class="ghost" style="width:40px;height:40px;border-radius:11px"></div><div style="flex:1;display:flex;flex-direction:column;gap:9px"><div class="ghost" style="width:${w};height:14px;border-radius:7px"></div><div class="ghost" style="width:96px;height:10px;border-radius:5px"></div><div class="ghost" style="width:200px;height:6px;border-radius:3px"></div></div></div>`).join('')}</div>
      ${logout}`;
    return;
  }
  if(!S.branches.length){
    $('page').innerHTML=`${head}
      <section class="card empty-card">
        <div class="empty-art" aria-hidden="true">
          <div style="position:absolute;top:8px;right:14px;width:92px;height:92px;border-radius:18px;background:var(--fill);transform:rotate(-6deg)"></div>
          <div style="position:absolute;top:4px;right:22px;width:88px;height:96px;border-radius:16px;background:var(--paper);box-shadow:0 8px 24px rgba(0,0,0,.18);display:flex;align-items:flex-end;justify-content:center;gap:7px;padding-bottom:18px">
            ${[22,36,50].map((h,i)=>`<span style="width:12px;height:${h}px;border-radius:4px;border:2px dashed ${tt[i]}"></span>`).join('')}</div>
          <div style="position:absolute;top:-2px;left:4px;width:36px;height:36px;border-radius:18px;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px var(--card)"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></div>
        </div>
        <h2>دفترك فاضي للحين</h2>
        <p>أضف أول فرع، وسجّل دخله كل يوم، وأنا أجمع لك الشهر كامل.</p>
        <button class="pill-btn" type="button" data-act="edit">إضافة فرع</button>
      </section>${logout}${legal}`;
    return;
  }

  const bm=compute(),y=S.year,m=S.month,n=dim(y,m),total=monthAll(bm,m),cur=isCurMonth(),due=dueDays(y,m);
  // Change against the previous month, only once this month has numbers
  let delta='';
  if(total>0&&m>0){const p=monthAll(bm,m-1);if(p>0){const pc=Math.round((total-p)/p*100);
    delta=`<span class="delta ${pc>=0?'up':'down'}">${pc>=0?IC.up:IC.down}<span class="tnum">${Math.abs(pc)}% عن ${AR_MONTHS[m-1]}</span></span>`}}
  // Daily stacked bars for the month
  const dayTotals=[];for(let i=1;i<=n;i++){let t=0;for(const b of S.branches){const e=entryOf(b.id,ds(y,m,i));if(e)t+=e.amount}dayTotals.push(t)}
  const maxDay=Math.max(...dayTotals,1),anyDaily=S.branches.some(b=>bm[b.id][m].days);
  const bars=dayTotals.map((t,i)=>{
    const date=ds(y,m,i+1);
    if(date>todayStr) return `<div><i style="height:3px;background:var(--future)"></i></div>`;
    if(!t) return `<div><i style="height:3px;background:var(--ter2)"></i></div>`;
    const segs=[...S.branches].reverse().map(b=>{const e=entryOf(b.id,date);return e&&e.amount?`<i style="height:${(e.amount/maxDay*60).toFixed(1)}px;background:${tone(b)}"></i>`:''}).join('');
    return `<div style="opacity:${date===todayStr?1:.82}">${segs}</div>`;
  }).join('');
  const todayPos=cur?((now.getDate()-.5)/n*100):0;
  const axis=`<div class="days-axis tnum" aria-hidden="true"><span style="right:0">1 ${AR_MONTHS[m]}</span>${cur&&now.getDate()>4?`<span class="today" style="right:${todayPos}%">اليوم</span>`:''}${!cur||now.getDate()<n-4?`<span style="left:0">${n} ${AR_MONTHS[m]}</span>`:''}</div>`;
  const chart=anyDaily?`<div class="days-chart" role="img" aria-label="الدخل اليومي لكل الفروع في ${AR_MONTHS[m]}">${bars}</div>${axis}`:
    (total?`<p class="note-text" style="margin:10px 0 0">مجموع هذا الشهر من الدفتر الورقي، بدون أرقام يومية.</p>`:'');
  const split=S.branches.map(b=>{const t=cellTotal(bm[b.id][m]);return `<div><span class="lab"><i style="background:${tone(b)}"></i><span>${esc(shortName(b))} · ${total?Math.round(t/total*100):0}%</span></span><span class="v tnum">${fmt(t)}</span></div>`}).join('');
  // Today card (current month only)
  let todayCard='';
  if(cur){
    let tsum=0,done=0;
    const bd=S.branches.map(b=>{const e=entryOf(b.id,todayStr);if(e){tsum+=e.amount;done++}return `<span class="badge tnum${e?'':' off'}" style="background:${grad(b)}">${esc(badge(b))}</span>`}).join('');
    const left=S.branches.length-done;
    todayCard=`<section class="card today-card" aria-label="دخل اليوم"><div style="flex:1;min-width:0"><div class="k-label">دخل اليوم</div><div class="v"><b class="tnum">${fmt(tsum)}</b><span>${CUR}</span></div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><div class="badges" aria-hidden="true">${bd}</div>
      <span class="status ${left?'warn':'ok'}">${left?(left===S.branches.length?'ما سجّلت أي فرع اليوم':`باقي ${left===1?'فرع واحد':left===2?'فرعين':left+' فروع'} ما سجّلت اليوم`):'سجّلت كل الفروع اليوم'}</span></div></section>`;
  }
  // Branch rows with a dot for each day of the month
  const rows=S.branches.map(b=>{
    const c=bm[b.id][m],t=cellTotal(c);let miss=0;
    const dots=Array.from({length:n},(_,i)=>{
      const date=ds(y,m,i+1),e=entryOf(b.id,date),sat=new Date(y,m,i+1).getDay()===6&&i+1<n;
      let st;
      if(date>todayStr||isFutureMonth(y,m)) st='background:var(--future)';
      else if(!e){ if(c.paper!=null&&!c.days) st='background:var(--future)'; else {st='border:1.5px solid var(--warn)';miss++} }
      else if(e.amount===0) st=`border:1.5px solid ${tone(b)}`;
      else st=`background:${tone(b)}`;
      return `<i class="${sat?'wk':''}" style="${st}"></i>`;
    }).join('');
    const sub=c.days?`سجّلت ${c.days} من ${n} يوم`:c.paper!=null?'مجموع الشهر من الورق':'ما سجّلت أي يوم للحين';
    const missTx=c.days||c.paper==null?(miss?` · <span class="miss">ناقص ${plDays(miss)}</span>`:''):'';
    return `<a class="b-row" href="#branch-${b.id}"><div class="b-icon tnum" style="background:${grad(b)}">${esc(badge(b))}</div>
      <div class="b-main"><div class="b-top"><span class="b-name">${esc(b.name)}</span><span class="b-total tnum">${fmt(t)}</span><span class="c">${CUR}</span></div>
      <div class="b-sub">${sub}${missTx}</div>
      <div class="dots" role="img" aria-label="أيام ${AR_MONTHS[m]}: ${c.days} مسجّلة${miss?` و${miss} ناقصة`:''}">${dots}</div></div></a>`;
  }).join('');
  const yearTotal=AR_MONTHS.reduce((s,_,i)=>s+monthAll(bm,i),0),expAll=expMonthAll(m);
  $('page').innerHTML=`${head}${monthSwitch()}
    <section class="card total" aria-label="مجموع كل الفروع">
      <div class="total-top"><span class="k-label">مجموع كل الفروع · ${AR_MONTHS[m]} ${y}</span>${delta}</div>
      <div class="big"><span class="n tnum">${fmt(total)}</span><span class="cur">${CUR}</span></div>
      ${chart}<div class="split">${split}</div>
      ${expAll?`<div class="netline"><div><span>المصاريف</span><b class="tnum">${fmt(expAll)} ${CUR}</b></div><div><span>الصافي</span><b class="tnum ${total-expAll>=0?'pos':'neg'}">${fmt(total-expAll)} ${CUR}</b></div></div>`:''}
    </section>
    ${todayCard}
    <div class="sec-row"><h2 class="h2">الفروع</h2><button type="button" data-act="edit">تعديل</button></div>
    <div class="list">${rows}</div>
    <div class="list" style="margin-top:28px"><a class="row-link" href="#report"><span class="ic" aria-hidden="true">${miniBars()}</span><span class="t">التقرير السنوي</span><span class="v tnum">${fmt(yearTotal)} ${CUR}</span></a></div>
    ${logout}${legal}`;
}

/* ---------- branch ---------- */
function renderBranch(){
  const b=branchById(S.branchId);
  setNav({start:backBtn('الفروع'),title:b?.name||'',end:aiBtn});
  if(!b){$('page').innerHTML='<div class="loading-line">جاري التحميل…</div>';$('foot').hidden=true;return}
  const y=S.year,m=S.month,n=dim(y,m),c=compute()[b.id][m],mon=AR_MONTHS[m];
  let h='',week=null;
  const close=()=>{if(week){h+=`<div class="week-head"><span>${week.start===week.end?`${week.start} ${mon}`:`${week.start} – ${week.end} ${mon}`}</span><span class="tnum" id="ws-${week.start}"></span></div><div class="list">${week.rows}</div>`}};
  for(let d=1;d<=n;d++){
    const date=ds(y,m,d),wd=new Date(y,m,d).getDay(),e=entryOf(b.id,date),future=date>todayStr,today=date===todayStr;
    if(!week||wd===0){close();week={start:d,end:d,rows:''}}
    week.end=d;
    week.rows+=`<label class="day${today?' is-today':''}${future?' future':''}" for="d-${date}">
      <div class="dm"><div class="dn"><b>${DOW[wd]}</b>${today?'<span class="today-pill">اليوم</span>':''}</div><div class="ds">${d} ${mon} ${y}</div></div>
      <span class="check" aria-hidden="true">${IC.check(11)}</span>
      <span class="field"><input id="d-${date}" data-date="${date}" data-week="${week.start}" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" dir="ltr"
        value="${e?fmt(e.amount):''}" aria-label="دخل ${DOW[wd]} ${d} ${mon}"${future?' disabled':''}><span class="dash" aria-hidden="true"${e?' hidden':''}>—</span><span class="sar" aria-hidden="true">${CUR}</span></span></label>`;
  }
  close();
  const paper=c.paper!=null?`<section class="card paper"><div class="pi">${IC.paper}</div><div class="pm"><div class="k-label">مجموع الشهر من الورق</div>
    <div class="pv"><b class="tnum">${fmt(c.paper)}</b><span>${CUR}</span></div>
    <div class="pn">${c.days?'بدأت تعبّي الأيام، فصار مجموع الشهر يتحسب من الأيام اللي تحت.':'ما فيه أرقام يومية لهذا الشهر — انكتب من الدفتر الورقي كمجموع واحد.'}</div></div></section>`:'';
  $('page').classList.add('has-bar');
  const income=S.tab!=='expenses';
  $('page').innerHTML=`<header class="head" style="display:block"><div class="b-head"><div class="b-icon tnum" style="background:${grad(b)}">${esc(badge(b))}</div><h1 class="title">${esc(b.name)}</h1></div>
    <p class="subline">${income?'الدخل اليومي':'المصاريف'} · ${mon} ${y}</p></header>
    ${monthSwitch()}
    <div class="seg2" role="tablist" aria-label="الدخل والمصاريف"><button type="button" role="tab" data-tab="income" aria-selected="${income}" class="${income?'on':''}">الدخل</button><button type="button" role="tab" data-tab="expenses" aria-selected="${!income}" class="${income?'':'on'}">المصاريف</button></div>
    ${income?`<div id="paperNote">${paper}</div><div id="days">${h}</div>`:`<div id="exp"></div>`}`;
  $('foot').hidden=false;
  if(income) updateTotals(); else renderExpenses();
}
// Refresh values from the store without disturbing the field being typed in
function patchBranch(){
  if(S.tab==='expenses'){patchExpenses();return}
  for(const inp of $('days').querySelectorAll('input')){
    if(inp===document.activeElement||pending.has(inp.id)) continue;
    const e=entryOf(S.branchId,inp.dataset.date),v=e?fmt(e.amount):'';
    if(inp.value!==v){inp.value=v;markField(inp)}
  }
  updateTotals();
}
function markField(inp){
  const v=parseAmount(inp.value),row=inp.closest('.day'),bad=Number.isNaN(v);
  row.classList.toggle('err',bad);
  row.querySelector('.dash').hidden=inp.value.trim()!=='';
  const [y,m,d]=inp.dataset.date.split('-').map(Number);
  row.querySelector('.ds').textContent=bad?'اكتب أرقام بس، بدون حروف':`${d} ${AR_MONTHS[m-1]} ${y}`;
  return v;
}
let lastTotal=null;
function updateTotals(){
  const weeks={};let sum=0,rec=0;
  for(const inp of $('days')?.querySelectorAll('input')||[]){
    const v=parseAmount(inp.value),w=inp.dataset.week;weeks[w]??={s:0,any:false};
    if(v!=null&&!Number.isNaN(v)){sum+=v;rec++;weeks[w].s+=v;weeks[w].any=true}
  }
  for(const [w,o] of Object.entries(weeks)){const el=$('ws-'+w);if(el) el.textContent=o.any?`${fmt(o.s)} ${CUR}`:''}
  const n=dim(S.year,S.month),c=compute()[S.branchId]?.[S.month],paperOnly=!rec&&c?.paper!=null,total=paperOnly?c.paper:sum;
  const C=2*Math.PI*21,col=tone(branchById(S.branchId));
  const sub=paperOnly?'من الورق · ما فيه أرقام يومية':`${rec} من ${n} يوم · متوسط ${fmt(rec?Math.round(sum/rec):0)}`;
  $('foot').innerHTML=`<div class="foot-in"><div class="fl"><div class="k-label">مجموع ${AR_MONTHS[S.month]}</div>
    <div class="fv${lastTotal!==null&&lastTotal!==total?' pulse':''}" id="footVal"><b class="tnum">${fmt(total)}</b><span>${CUR}</span></div><div class="fs tnum">${sub}</div></div>
    ${paperOnly?'':`<div class="ring"><svg width="52" height="52" viewBox="0 0 52 52" role="img" aria-label="سجّلت ${rec} من ${n} يوم"><circle cx="26" cy="26" r="21" fill="none" stroke="var(--fill)" stroke-width="5"/><circle class="p" cx="26" cy="26" r="21" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(C*rec/n).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 26 26)"/></svg><b class="tnum" aria-hidden="true">${rec}</b></div>`}</div>`;
  if(lastTotal!==null&&lastTotal!==total) setTimeout(()=>$('footVal')?.classList.remove('pulse'),180);
  lastTotal=total;
}

/* ---------- expenses ---------- */
// Items carried to a new month are the ones marked "ثابت" (rent, salaries, internet…), with last month's amounts
const newId=()=>Math.random().toString(36).slice(2,10);
let expDraft=null,expTimer=null,autoCarried=new Set();
function prevExp(bid,y,m){
  for(let k=1;k<=12;k++){
    let mm=m-k,yy=y;while(mm<0){mm+=12;yy--}
    const id=`${bid}_${ym(yy,mm)}`,d=yy===S.year?S.expenses.get(id):yearCache.get(yy)?.expenses?.find(e=>`${e.branchId}_${e.month}`===id);
    if(d?.items?.length) return {doc:d,y:yy,m:mm};
  }
  return null;
}
const carried=p=>p.doc.items.filter(i=>i.fixed).map(i=>({id:newId(),name:i.name,amount:i.amount??null,fixed:true}));
function draftFor(bid,y,m){
  const key=`${bid}_${ym(y,m)}`;
  if(!expDraft||expDraft.key!==key){if(expTimer)saveExpDraft();const d=S.expenses.get(key);expDraft={key,bid,y,m,exists:!!d,items:(d?.items||[]).map(i=>({...i}))}}
  return expDraft;
}
async function saveExpDraft(){
  clearTimeout(expTimer);expTimer=null;
  const d=expDraft;if(!d) return;
  const items=d.items.map(({id,name,amount,fixed})=>({id,name:String(name||'').trim(),amount:typeof amount==='number'?amount:null,fixed:!!fixed})).filter(i=>i.name||i.amount!=null);
  const data={branchId:d.bid,month:ym(d.y,d.m),year:d.y,items,updatedAt:new Date().toISOString()};
  try{
    if(db) await fs.setDoc(fs.doc(db,base(),'expenses',d.key),data); else S.expenses.set(d.key,data);
    d.exists=true;yearCache.delete(d.y);
  }catch(err){toast(errMsg(err),true)}
}
function scheduleExp(){clearTimeout(expTimer);expTimer=setTimeout(saveExpDraft,700)}
function renderExpenses(){
  const b=branchById(S.branchId),y=S.year,m=S.month,mon=AR_MONTHS[m],d=draftFor(b.id,y,m);
  const prev=d.items.length?null:prevExp(b.id,y,m);
  // The running month picks up its fixed items by itself the first time it is opened
  if(!d.exists&&!d.items.length&&prev&&isCurMonth()&&!autoCarried.has(d.key)){
    autoCarried.add(d.key);d.items=carried(prev);if(d.items.length){saveExpDraft();toast(`نقلت البنود الثابتة من ${AR_MONTHS[prev.m]}`)}
  }
  if(!prev&&!d.items.length&&!yearCache.has(y-1)&&db&&m<11) yearData(y-1).then(()=>{if(S.tab==='expenses')renderExpenses()}).catch(()=>{});
  const rows=d.items.map(it=>`<div class="x-row" data-id="${it.id}">
      <div class="x-main"><input class="x-name" data-xname="${it.id}" value="${esc(it.name)}" placeholder="اسم البند" maxlength="60" aria-label="اسم البند">
        <div class="x-acts"><button type="button" class="x-fix${it.fixed?' on':''}" data-xfix="${it.id}" aria-pressed="${!!it.fixed}">${it.fixed?'ثابت كل شهر':'مرة وحدة'}</button><button type="button" class="x-del" data-xdel="${it.id}">حذف</button></div></div>
      <span class="field x-field"><input data-xamt="${it.id}" type="text" inputmode="decimal" autocomplete="off" dir="ltr" value="${it.amount!=null?fmt(it.amount):''}" aria-label="مبلغ ${esc(it.name)}"><span class="dash" aria-hidden="true"${it.amount!=null?' hidden':''}>—</span><span class="sar" aria-hidden="true">${CUR}</span></span>
    </div>`).join('');
  const source=S.expenses.get(d.key)?.source==='paper'?`<p class="note-text">هذي المصاريف منقولة من الدفتر الورقي.</p>`:'';
  $('exp').innerHTML=`
    <div class="week-head"><span>بيان المخروج</span><span class="tnum" id="xSum"></span></div>
    ${d.items.length?`<div class="list" id="xList">${rows}</div>${source}`:`<div class="card empty-card" style="margin-top:0;padding:28px 20px">
      <h2 style="margin-top:0;font-size:19px">ما فيه مصاريف لـ ${mon}</h2><p>أضف أول بند تحت${prev?`، أو انقل البنود الثابتة من ${AR_MONTHS[prev.m]}`:''}.</p>
      ${prev?`<button class="pill-btn" type="button" data-xcarry="1" style="margin-top:18px">انقل البنود الثابتة من ${AR_MONTHS[prev.m]}</button>`:''}</div>`}
    <p class="cap gap" style="margin-top:24px">بند جديد</p>
    <form class="x-add" id="xAdd"><input id="xNewName" placeholder="مثلاً: كهرباء" maxlength="60" aria-label="اسم البند الجديد" autocomplete="off">
      <span class="field x-field"><input id="xNewAmt" type="text" inputmode="decimal" dir="ltr" autocomplete="off" aria-label="مبلغ البند الجديد"><span class="dash" aria-hidden="true">—</span><span class="sar" aria-hidden="true">${CUR}</span></span>
      <button class="e-add" id="xAddBtn" type="submit" disabled>إضافة</button></form>
    <p class="note-text">«ثابت كل شهر» ينتقل لحاله للشهر الجاي بنفس المبلغ، وتعدّله إذا تغيّر.</p>
    <section class="card net" id="xNet" aria-label="الصافي"></section>`;
  updateExpTotals();
}
function updateExpTotals(){
  const d=expDraft;if(!d||!$('exp')) return;
  const total=d.items.reduce((s,i)=>s+(typeof i.amount==='number'?i.amount:0),0);
  const inc=cellTotal(compute()[d.bid][d.m]),net=inc-total;
  if($('xSum')) $('xSum').textContent=d.items.length?`${fmt(total)} ${CUR}`:'';
  $('xNet').innerHTML=`<div class="nr"><span>الدخل</span><b class="tnum">${fmt(inc)} ${CUR}</b></div><div class="nr"><span>المصاريف</span><b class="tnum">− ${fmt(total)} ${CUR}</b></div>
    <div class="nr tot"><span>الصافي</span><b class="tnum ${net>=0?'pos':'neg'}">${fmt(net)} ${CUR}</b></div>`;
  const fv=$('footVal'),changed=lastTotal!==null&&lastTotal!==total;
  $('foot').innerHTML=`<div class="foot-in"><div class="fl"><div class="k-label">مصاريف ${AR_MONTHS[d.m]}</div>
    <div class="fv${changed?' pulse':''}" id="footVal"><b class="tnum">${fmt(total)}</b><span>${CUR}</span></div><div class="fs tnum">الصافي ${fmt(net)} ${CUR} · ${d.items.length} بند</div></div></div>`;
  if(changed) setTimeout(()=>$('footVal')?.classList.remove('pulse'),180);
  lastTotal=total;
}
function patchExpenses(){
  // Keep the list as typed while editing or saving; otherwise reload it from the store
  if(expTimer||$('exp')?.contains(document.activeElement)){updateExpTotals();return}
  expDraft=null;renderExpenses();
}
$('page').addEventListener('input',e=>{
  const t=e.target,d=expDraft;
  if(t.id==='xNewName'||t.id==='xNewAmt'){
    if(t.id==='xNewAmt'){const n=normDigits(t.value);if(n!==t.value)t.value=n;t.parentElement.querySelector('.dash').hidden=t.value.trim()!==''}
    const ok=$('xNewName').value.trim()&&!Number.isNaN(parseAmount($('xNewAmt').value));$('xAddBtn').disabled=!ok;$('xAddBtn').classList.toggle('on',!!ok);return;
  }
  if(!d) return;
  const id=t.dataset.xamt||t.dataset.xname;if(!id) return;
  const it=d.items.find(i=>i.id===id);if(!it) return;
  if(t.dataset.xname){it.name=t.value}
  else{
    const n=normDigits(t.value);if(n!==t.value)t.value=n;
    const v=parseAmount(t.value),row=t.closest('.x-row');
    row.classList.toggle('err',Number.isNaN(v));row.querySelector('.dash').hidden=t.value.trim()!=='';
    if(Number.isNaN(v)){toast('اكتب أرقام بس، بدون حروف',true);return}
    it.amount=v;
  }
  updateExpTotals();scheduleExp();
});
$('page').addEventListener('change',e=>{
  const t=e.target;if(!t.dataset.xamt) return;
  const v=parseAmount(t.value);if(v!=null&&!Number.isNaN(v)) t.value=fmt(v);
  if(expTimer) saveExpDraft().then(()=>toast('تم الحفظ'));
});
$('page').addEventListener('click',e=>{
  const t=e.target.closest('[data-tab],[data-xfix],[data-xdel],[data-xcarry]');if(!t) return;
  if(t.dataset.tab){if(S.tab!==t.dataset.tab){if(expTimer)saveExpDraft();S.tab=t.dataset.tab;lastTotal=null;expDraft=null;render()}return}
  const d=expDraft;if(!d) return;
  if(t.dataset.xcarry){const p=prevExp(d.bid,d.y,d.m);if(p){d.items=carried(p);saveExpDraft();renderExpenses();toast(`نقلت البنود الثابتة من ${AR_MONTHS[p.m]}`)}return}
  const it=d.items.find(i=>i.id===(t.dataset.xfix||t.dataset.xdel));if(!it) return;
  if(t.dataset.xfix){it.fixed=!it.fixed;t.classList.toggle('on',it.fixed);t.textContent=it.fixed?'ثابت كل شهر':'مرة وحدة';t.setAttribute('aria-pressed',it.fixed);saveExpDraft()}
  else{d.items=d.items.filter(i=>i!==it);saveExpDraft().then(()=>toast(`انحذف «${it.name}»`));renderExpenses()}
});
$('page').addEventListener('submit',e=>{
  if(e.target.id!=='xAdd') return;
  e.preventDefault();const d=expDraft;if(!d) return;
  const name=$('xNewName').value.trim(),v=parseAmount($('xNewAmt').value);if(!name||Number.isNaN(v)) return;
  d.items.push({id:newId(),name,amount:v,fixed:false});
  saveExpDraft().then(()=>toast(`تمت إضافة «${name}»`));renderExpenses();
  setTimeout(()=>$('xNewName')?.focus(),0);
});

/* ---------- daily entry ---------- */
const pending=new Map();
function schedule(inp){clearTimeout(pending.get(inp.id));pending.set(inp.id,setTimeout(()=>commit(inp),700))}
async function commit(inp){
  clearTimeout(pending.get(inp.id));pending.delete(inp.id);
  const v=parseAmount(inp.value);if(Number.isNaN(v)) return;
  const bid=S.branchId,date=inp.dataset.date,old=entryOf(bid,date)?.amount??null;
  if(v===old) return;
  try{
    await saveEntry(bid,date,v);
    const ok=inp.closest('.day')?.querySelector('.check');
    if(ok){ok.classList.add('on');setTimeout(()=>ok.classList.remove('on'),1400)}
    toast(v==null?'انمسح الرقم':'تم الحفظ');
  }catch(err){toast(errMsg(err),true)}
}
$('page').addEventListener('input',e=>{
  const inp=e.target;if(!inp.dataset.date) return;
  const n=normDigits(inp.value);if(n!==inp.value) inp.value=n;
  if(Number.isNaN(markField(inp))){toast('اكتب أرقام بس، بدون حروف',true);clearTimeout(pending.get(inp.id));pending.delete(inp.id)}
  else schedule(inp);
  updateTotals();
});
$('page').addEventListener('change',e=>{
  const inp=e.target;if(!inp.dataset.date) return;
  const v=parseAmount(inp.value);if(v!=null&&!Number.isNaN(v)){inp.value=fmt(v);markField(inp)}
  commit(inp);
});
$('page').addEventListener('keydown',e=>{
  if(e.key!=='Enter'||!e.target.dataset.date) return;
  e.preventDefault();const all=[...$('days').querySelectorAll('input:not(:disabled)')],i=all.indexOf(e.target);
  e.target.blur();(all[i+1]||e.target).focus();
});

/* ---------- report ---------- */
function renderReport(){
  setNav({start:backBtn('الرئيسية'),title:'التقرير السنوي',end:aiBtn});
  $('foot').hidden=true;$('page').classList.remove('has-bar');
  const bm=compute(),y=S.year,mt=AR_MONTHS.map((_,i)=>monthAll(bm,i)),yt=mt.reduce((a,b)=>a+b,0);
  const filled=mt.map((v,i)=>v?i:-1).filter(i=>i>=0);
  const sub=filled.length?`${filled.length===1?'شهر واحد مسجّل':filled.length===2?'شهرين مسجّلة':filled.length+' أشهر مسجّلة'} · من ${AR_MONTHS[filled[0]]} إلى ${AR_MONTHS[filled[filled.length-1]]}`:'ما فيه أرقام لهذي السنة';
  const step=(v=>{if(v<=0)return 5000;const e=Math.pow(10,Math.floor(Math.log10(v/4))),f=v/4/e;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*e})(Math.max(...mt,0));
  const MAX=step*4,H=168;
  const lbl=v=>v===0?'0':v>=1000?`${+(v/1000).toFixed(1)} ألف`:String(v);
  const grid=[0,1,2,3,4].map(k=>`<div class="gl" style="bottom:${k*step/MAX*H}px;background:${k?'var(--grid)':'var(--sep)'}"></div>`).join('');
  const yax=[0,1,2,3,4].map(k=>`<span style="bottom:${k*step/MAX*H-6}px">${lbl(k*step)}</span>`).join('');
  const bars=AR_MONTHS.map((name,i)=>{
    const segs=[...S.branches].reverse().map(b=>{const v=cellTotal(bm[b.id][i]);return v?`<i style="height:${(v/MAX*H).toFixed(1)}px;background:${tone(b)}"><span hidden>${esc(b.name)} ${fmt(v)}</span></i>`:''}).join('')||'<i style="height:3px;background:var(--fill)"></i>';
    return `<button type="button" data-month="${i}" aria-label="${name}: ${fmt(mt[i])} ${CUR}"><div class="col">${segs}</div></button>`;
  }).join('');
  const nums=AR_MONTHS.map((_,i)=>`<div><span class="tnum${i===S.month?' on':''}">${i+1}</span></div>`).join('');
  const head=`<tr><th scope="col" class="sr">الفرع</th>${AR_MONTHS.map((n,i)=>`<th scope="col" class="${i===S.month?'on':''}">${n}</th>`).join('')}<th scope="col" class="sl">المجموع</th></tr>`;
  const met=S.metric,expRow=b=>AR_MONTHS.map((_,i)=>expTotal(expOf(b.id,y,i))),incRow=b=>bm[b.id].map(cellTotal);
  const rowOf=b=>met==='expenses'?expRow(b):met==='net'?incRow(b).map((v,i)=>{const e=expRow(b)[i];return v||e?v-e:0}):incRow(b);
  const allRow=AR_MONTHS.map((_,i)=>S.branches.reduce((s,b)=>s+rowOf(b)[i],0));
  const yExp=AR_MONTHS.reduce((s,_,i)=>s+expMonthAll(i),0);
  const cells=vals=>vals.map((v,i)=>`<td class="${i===S.month?'on':''}${v?'':' z'}${v<0?' neg':''}">${v?fmt(v):'—'}</td>`).join('');
  const body=S.branches.map(b=>{const r=rowOf(b);return `<tr><th scope="row" class="sr"><span class="nm"><i style="background:${tone(b)}"></i><span>${esc(shortName(b))}</span></span></th>${cells(r)}<td class="sl">${fmt(r.reduce((a,c)=>a+c,0))}</td></tr>`}).join('');
  const all=`<tr class="all"><th scope="row" class="sr"><span class="nm"><i style="background:var(--lab)"></i><span>كل الفروع</span></span></th>${cells(allRow)}<td class="sl">${fmt(allRow.reduce((a,c)=>a+c,0))}</td></tr>`;
  const paperMonths=[...new Set([...S.months.values()].filter(x=>{const c=bm[x.branchId]?.[+x.month.slice(5,7)-1];return c&&!c.days}).map(x=>+x.month.slice(5,7)-1))].sort((a,b)=>a-b);
  $('page').innerHTML=`<header class="head"><h1 class="title">التقرير السنوي</h1></header>
    <div class="switch" role="group" aria-label="السنة"><button type="button" data-ystep="-1" aria-label="السنة السابقة"><span class="knob">${IC.prev}</span></button>
      <span class="label tnum" style="min-width:56px">${y}</span><button type="button" data-ystep="1" aria-label="السنة التالية"${y>=now.getFullYear()?' disabled':''}><span class="knob">${IC.next}</span></button></div>
    <section class="card year-card"><div class="k-label">مجموع سنة ${y} لكل الفروع</div><div class="big" style="margin-top:4px"><span class="n tnum">${fmt(yt)}</span><span class="cur">${CUR}</span></div><div class="sub">${sub}</div>${yExp?`<div class="netline"><div><span>المصاريف</span><b class="tnum">${fmt(yExp)} ${CUR}</b></div><div><span>الصافي</span><b class="tnum ${yt-yExp>=0?'pos':'neg'}">${fmt(yt-yExp)} ${CUR}</b></div></div>`:''}</section>
    ${S.branches.length?`<section class="card chart-card" aria-label="الدخل لكل شهر"><div class="ch"><h2>الدخل لكل شهر</h2><span>${CUR}</span></div>
      <div class="chart-wrap"><div class="pl"><div class="plot">${grid}<div class="bars" role="img" aria-label="أعمدة الدخل الشهري لسنة ${y} مقسومة على الفروع">${bars}</div></div><div class="mnums">${nums}</div></div><div class="yaxis tnum" aria-hidden="true">${yax}</div></div>
      <div class="legend">${S.branches.map(b=>`<div><i style="background:${tone(b)}"></i><span>${esc(b.name)}</span></div>`).join('')}</div></section>
    <h2 class="h2" style="margin:28px 4px 8px">حسب الفرع</h2>
    <div class="seg2" role="tablist" aria-label="نوع الأرقام" style="margin:0 0 10px">${[['income','الدخل'],['expenses','المصاريف'],['net','الصافي']].map(([k,l])=>`<button type="button" role="tab" data-metric="${k}" aria-selected="${met===k}" class="${met===k?'on':''}">${l}</button>`).join('')}</div>
    <div class="card tbl"><table><thead>${head}</thead><tbody>${body}${all}</tbody></table></div>
    <p class="note-text">اسحب الجدول يمين ويسار تشوف كل الأشهر.${paperMonths.length?` أرقام ${paperMonths.map(i=>AR_MONTHS[i]).join(' و')} من الدفتر الورقي.`:''}</p>
    <button class="excel" type="button" data-act="csv"><span class="xl" aria-hidden="true"><span style="background:#fff"></span><span style="background:#fff"></span><span style="background:#fff"></span><span></span><span></span><span style="background:#30D158"></span><span></span><span style="background:#FF9F0A"></span><span></span></span><span>تنزيل التقرير كملف Excel</span></button>`:''}`;
}

/* ---------- edit branches ---------- */
let confirmDel=null;
function closeOverlay(){$('overlay').innerHTML='';document.body.style.overflow='';confirmDel=null}
function openEdit(){document.body.style.overflow='hidden';renderEdit()}
function renderEdit(){
  const rows=S.branches.map(b=>`<div class="e-row"><button type="button" class="e-sw" data-color="${b.id}" aria-label="لون ${esc(b.name)}، اضغط تغيّره"><span style="background:${tone(b)};box-shadow:0 0 0 2px var(--sheet-card),0 0 0 3.5px ${tone(b)}55"></span></button>
    <input id="bn-${b.id}" data-rename="${b.id}" value="${esc(b.name)}" maxlength="50" aria-label="اسم الفرع"><button type="button" class="e-del" data-del="${b.id}"><span>حذف</span></button></div>`).join('');
  const cd=branchById(confirmDel);
  $('overlay').innerHTML=`<div class="scrim" data-close-sheet></div><section class="sheet" aria-label="تعديل الفروع"><div class="grabber" aria-hidden="true"></div>
    <div class="sheet-head"><h2>الفروع</h2><button class="done" type="button" data-close-sheet>تم</button></div>
    <div class="sheet-body">
      <p class="cap">اضغط الدائرة تغيّر اللون، واضغط الاسم تعدّله</p>
      <div class="list">${rows||'<div style="min-height:56px;display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--sec)">ما فيه فروع، أضف فرع تحت</div>'}</div>
      <p class="cap gap">فرع جديد</p>
      <form class="e-new" id="addForm"><span class="dashed" aria-hidden="true"></span><input id="newBranch" placeholder="اسم الفرع" maxlength="50" aria-label="اسم الفرع الجديد" autocomplete="off"><button class="e-add" id="addBtn" type="submit" disabled>إضافة</button></form>
      <p class="note-text">الفرع الجديد يطلع في الرئيسية على طول، وتبدأ تسجّل دخله من اليوم.</p>
    </div></section>
    ${cd?`<div class="action"><div class="box" role="alertdialog" aria-label="حذف ${esc(cd.name)}؟"><div class="q"><b>حذف ${esc(cd.name)}؟</b><span>بينحذف معه كل الدخل المسجّل له</span></div><button type="button" data-delok="${cd.id}">حذف الفرع</button></div><button class="cancel" type="button" data-cancel>إلغاء</button></div>`:''}`;
}
$('overlay').addEventListener('click',async e=>{
  const t=e.target.closest('button,[data-close-sheet]');if(!t) return;
  if('closeSheet' in t.dataset){closeOverlay();return}
  if(t.dataset.color){const b=branchById(t.dataset.color);await act(()=>saveBranch(b.id,{color:COLORS[(cIdx(b)+1)%COLORS.length]}))}
  else if(t.dataset.del){confirmDel=t.dataset.del;renderEdit()}
  else if('cancel' in t.dataset){confirmDel=null;renderEdit()}
  else if(t.dataset.delok){const id=t.dataset.delok;confirmDel=null;await act(()=>deleteBranch(id),'انحذف الفرع')}
});
$('overlay').addEventListener('input',e=>{if(e.target.id==='newBranch'){const on=!!e.target.value.trim();$('addBtn').disabled=!on;$('addBtn').classList.toggle('on',on)}});
$('overlay').addEventListener('change',async e=>{
  const id=e.target.dataset.rename;if(!id) return;
  const n=e.target.value.trim();if(n&&n!==branchById(id)?.name) await act(()=>saveBranch(id,{name:n}),'تم تعديل الاسم');
});
$('overlay').addEventListener('submit',async e=>{
  if(e.target.id!=='addForm') return;
  e.preventDefault();const n=$('newBranch').value.trim();if(!n) return;
  await act(()=>addBranch(n),`تمت إضافة ${n}`);
});
async function act(fn,ok){try{await fn();if(ok)toast(ok)}catch(err){toast(errMsg(err),true)}if($('overlay').querySelector('.sheet[aria-label="تعديل الفروع"]'))renderEdit();render()}

/* ---------- welcome (first sign-in) ---------- */
function maybeWelcome(){
  try{if(localStorage.getItem('daftar.welcomed'))return}catch(e){return}
  if(S.view!=='home'||!S.branches.length||$('overlay').innerHTML) return;
  $('overlay').innerHTML=`<div class="welcome"><button class="wscrim" type="button" data-welcome-close aria-label="إغلاق"></button><div class="welcome-in">
    <button class="w-btn" type="button" data-welcome-go aria-label="افتح المساعد الذكي"><span class="rp" aria-hidden="true"></span><span class="ai-orb">${IC.spark(20)}</span></button>
    <div class="w-pop"><span class="arrow" aria-hidden="true"></span><section class="w-card" role="dialog" aria-label="يمكنك استخدام مساعدك الذكي">
      <span class="orb" aria-hidden="true">${IC.spark(32)}</span><h2>يمكنك استخدام مساعدك الذكي</h2>
      <p>اضغط على النجمة فوق، واسأله عن أي فرع أو يوم أو شهر، ويجاوبك من أرقامك.</p>
      <div class="w-acts"><button class="go" type="button" data-welcome-go>جرّبه الحين</button><button class="ok" type="button" data-welcome-close>تمام</button></div>
    </section></div></div></div>`;
}
$('overlay').addEventListener('click',e=>{
  const t=e.target.closest('[data-welcome-close],[data-welcome-go]');if(!t) return;
  try{localStorage.setItem('daftar.welcomed','1')}catch(err){}
  closeOverlay();if('welcomeGo' in t.dataset) openAI();
});

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
    for(const col of ['entries','months','expenses']){
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
  S.yearLoaded=false;S.entries=new Map();S.months=new Map();S.expenses=new Map();expDraft=null;
  const q=col=>fs.query(fs.collection(db,base(),col),fs.where('year','==',S.year));
  unsubYear.push(fs.onSnapshot(q('entries'),s=>{S.entries=new Map(s.docs.map(d=>[d.id,d.data()]));S.yearLoaded=true;render()},e=>toast(errMsg(e),true)));
  unsubYear.push(fs.onSnapshot(q('months'),s=>{S.months=new Map(s.docs.map(d=>[d.id,d.data()]));render()},()=>{}));
  unsubYear.push(fs.onSnapshot(q('expenses'),s=>{S.expenses=new Map(s.docs.map(d=>[d.id,d.data()]));render()},()=>{}));
}
function step(dm){
  let y=S.year,m=S.month+dm;if(m<0){m=11;y--}if(m>11){m=0;y++}
  if(isFutureMonth(y,m)) return;
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
function onScroll(){const s=window.scrollY>36;$('nav').classList.toggle('scrolled',s);$('nav').classList.toggle('on',s)}
window.addEventListener('scroll',onScroll,{passive:true});
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-mstep],[data-ystep],[data-act],[data-month],[data-metric]');if(!t) return;
  if(t.dataset.mstep){step(+t.dataset.mstep);return}
  if(t.dataset.ystep){S.year+=+t.dataset.ystep;subscribeYear();render();return}
  if(t.dataset.month){S.month=+t.dataset.month;render();return}
  if(t.dataset.metric){S.metric=t.dataset.metric;render();return}
  const a=t.dataset.act;
  if(a==='edit') openEdit();
  if(a==='ai') openAI();
  if(a==='csv') exportCsv();
  if(a==='logout') doLogout?.();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeOverlay();closeAI()}});

function exportCsv(){
  const bm=compute(),q=v=>`"${String(v).replace(/"/g,'""')}"`,rows=[[`مجموع سنة ${S.year} (ريال سعودي)`],['الفرع',...AR_MONTHS,'المجموع']];
  S.branches.forEach(b=>{const r=bm[b.id].map(cellTotal);rows.push([b.name,...r,r.reduce((a,c)=>a+c,0)])});
  const mt=AR_MONTHS.map((_,i)=>monthAll(bm,i));rows.push(['كل الفروع',...mt,mt.reduce((a,c)=>a+c,0)]);
  rows.push([]);rows.push(['المصاريف (بيان المخروج)']);rows.push(['الفرع',...AR_MONTHS,'المجموع']);
  S.branches.forEach(b=>{const r=AR_MONTHS.map((_,i)=>expTotal(expOf(b.id,S.year,i)));rows.push([b.name,...r,r.reduce((a,c)=>a+c,0)])});
  rows.push([]);rows.push(['الصافي (الدخل − المصاريف)']);rows.push(['الفرع',...AR_MONTHS,'المجموع']);
  S.branches.forEach(b=>{const r=bm[b.id].map((c,i)=>cellTotal(c)-expTotal(expOf(b.id,S.year,i)));rows.push([b.name,...r,r.reduce((a,c)=>a+c,0)])});
  rows.push([]);rows.push([`مصاريف ${AR_MONTHS[S.month]} ${S.year}`]);
  S.branches.forEach(b=>{for(const it of expOf(b.id,S.year,S.month)?.items||[]) rows.push([b.name,it.name,it.amount??''])});
  rows.push([]);rows.push([`الدخل اليومي لشهر ${AR_MONTHS[S.month]} ${S.year}`]);rows.push(['التاريخ','اليوم',...S.branches.map(b=>b.name)]);
  for(let d=1;d<=dim(S.year,S.month);d++){const k=ds(S.year,S.month,d);
    rows.push([k,DOW[new Date(S.year,S.month,d).getDay()],...S.branches.map(b=>entryOf(b.id,k)?.amount??'')])}
  const blob=new Blob(['﻿'+rows.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`دفتر-الفروع-${S.year}.csv`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}

/* ---------- one-time import from a link (keeps figures out of the public code) ---------- */
// Link format: #import-<base64url of {"v":1,"branches":[{id,name,color,order}],"months":[[branchId,"YYYY-MM",total]],"entries":[[branchId,"YYYY-MM-DD",amount]]}>
// months and entries are both optional
function decodeImport(s){
  try{
    const bin=atob(s.replace(/-/g,'+').replace(/_/g,'/')),d=JSON.parse(new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0))));
    const okB=b=>/^[a-z0-9]{1,24}$/.test(b?.id)&&typeof b.name==='string'&&b.name.length<=60&&/^#[0-9a-f]{6}$/i.test(b.color||'#000000');
    const okM=m=>Array.isArray(m)&&/^[a-z0-9]{1,24}$/.test(m[0])&&/^\d{4}-\d{2}$/.test(m[1])&&typeof m[2]==='number'&&m[2]>=0;
    const okE=e=>Array.isArray(e)&&/^[a-z0-9]{1,24}$/.test(e[0])&&/^\d{4}-\d{2}-\d{2}$/.test(e[1])&&typeof e[2]==='number'&&e[2]>=0;
    const okX=x=>Array.isArray(x)&&/^[a-z0-9]{1,24}$/.test(x[0])&&/^\d{4}-\d{2}$/.test(x[1])&&Array.isArray(x[2])&&x[2].length<=80&&
      x[2].every(i=>Array.isArray(i)&&typeof i[0]==='string'&&i[0].length<=60&&(i[1]===null||(typeof i[1]==='number'&&i[1]>=0)));
    d.branches??=[];d.months??=[];d.entries??=[];d.expenses??=[];
    if(!Array.isArray(d.expenses)||d.expenses.length>200||!d.expenses.every(okX)) return null;
    if(d?.v!==1||![d.branches,d.months,d.entries].every(Array.isArray)||d.branches.length>20||d.months.length>500||d.entries.length>3000||
      !d.branches.every(okB)||!d.months.every(okM)||!d.entries.every(okE)) return null;
    return d;
  }catch(e){return null}
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
  if(y===S.year&&S.yearLoaded) return {entries:[...S.entries.values()],months:[...S.months.values()],expenses:[...S.expenses.values()]};
  if(!db) return {entries:[],months:[],expenses:[]};
  if(!yearCache.has(y)){
    const get=async col=>(await fs.getDocs(fs.query(fs.collection(db,base(),col),fs.where('year','==',y)))).docs.map(d=>d.data());
    yearCache.set(y,{entries:await get('entries'),months:await get('months'),expenses:await get('expenses')});
  }
  return yearCache.get(y);
}
async function rangeData(from,to){
  const ids=new Set(S.branches.map(b=>b.id)),entries=[],months=[],expenses=[];
  for(let y=+from.slice(0,4);y<=+to.slice(0,4)&&y<=+from.slice(0,4)+5;y++){const d=await yearData(y);entries.push(...d.entries);months.push(...d.months);expenses.push(...(d.expenses||[]))}
  const inMonths=m=>m.month>=from.slice(0,7)&&m.month<=to.slice(0,7)&&ids.has(m.branchId);
  return {entries:entries.filter(e=>e.date>=from&&e.date<=to&&ids.has(e.branchId)),months:months.filter(inMonths),expenses:expenses.filter(inMonths)};
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
  async get_expenses({from_month,to_month,branch,item}){
    const okM=v=>/^\d{4}-\d{2}$/.test(v||'');
    if(!okM(from_month)||!okM(to_month)) return {error:'الأشهر لازم تكون بصيغة YYYY-MM'};
    const b=resolveBranch(branch);if(b===undefined) return branchErr(branch);
    const last=to_month.split('-').map(Number),to=ds(last[0],last[1]-1,dim(last[0],last[1]-1));
    const {entries,months,expenses}=await rangeData(`${from_month}-01`,to),q=norm(item||''),per={};
    // Singular and plural spellings on the sheets (راتب / رواتب, إيجار / اجار) count as the same item
    const alts=/^(ال)?(راتب|رواتب)$/.test(q)?['راتب','رواتب']:q.includes('ايجار')?[q,q.replace('ايجار','اجار')]:[q];
    for(const x of S.branches){if(b&&x.id!==b.id) continue;per[x.id]={name:x.name,income:0,expenses:0,items:{}}}
    const daily={};for(const e of entries) if(per[e.branchId]){const k=e.branchId+'|'+e.date.slice(0,7);daily[k]=(daily[k]||0)+e.amount}
    for(const [k,v] of Object.entries(daily)) per[k.split('|')[0]].income+=v;
    for(const m of months) if(per[m.branchId]&&!(m.branchId+'|'+m.month in daily)) per[m.branchId].income+=m.total;
    for(const x of expenses){const p=per[x.branchId];if(!p) continue;
      for(const it of x.items||[]){if(typeof it.amount!=='number'||(q&&!alts.some(w=>norm(it.name).includes(w)))) continue;p.expenses+=it.amount;p.items[it.name]=r2((p.items[it.name]||0)+it.amount)}}
    const out=Object.values(per).map(p=>({branch:p.name,income:r2(p.income),expenses:r2(p.expenses),net:r2(p.income-p.expenses),items:p.items}));
    const sum=k=>r2(out.reduce((s,o)=>s+o[k],0));
    return {from_month,to_month,item_filter:item||null,currency:'ريال سعودي',per_branch:out,total_income:sum('income'),total_expenses:sum('expenses'),total_net:item?null:sum('net')};
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
    {name:'get_expenses',description:'مصاريف الفروع (بيان المخروج) والدخل والصافي (الدخل ناقص المصاريف) لأشهر معيّنة، ومجموع كل بند. يقدر يفلتر على بند مثل الرواتب أو الإيجار',
      parameters:Schema.object({properties:{from_month:Schema.string({description:'أول شهر بصيغة YYYY-MM'}),to_month:Schema.string({description:'آخر شهر بصيغة YYYY-MM'}),branch,
        item:Schema.string({description:'جزء من اسم البند، مثل راتب أو إيجار أو كهرباء. اتركه فاضي لكل البنود'})},optionalProperties:['branch','item']})},
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
- المصاريف أو المخروج أو الصافي أو الفارق أو الربح بعد المصاريف تعني get_expenses.
- "يوم ناقص" أو "ما عبّيته" أو "نسيت أسجّل" تعني find_missing_days.
- جاوب باللهجة الخليجية، باختصار ووضوح، والأرقام بفواصل الآلاف ومعها "ر.س". استخدم نقاط قصيرة إذا فيه أكثر من فرع.
- إذا السؤال مو عن الدفتر، قل بلطف إنك مختص بأرقام الدفتر.`;
}
// Newest model first; if Google has retired one, the next is tried and remembered for the visit
// Flash-Lite with thinking off answers fastest; the figures come from the tools, the model only reads the question and words the reply.
// If Google retires a name or a model rejects a thinking setting, the next entry is tried.
const AI_MODELS=[
  {model:'gemini-flash-lite-latest',thinkingConfig:{thinkingLevel:'MINIMAL'}},
  {model:'gemini-flash-lite-latest'},
  {model:'gemini-2.5-flash-lite',thinkingConfig:{thinkingBudget:0}},
  {model:'gemini-flash-latest',thinkingConfig:{thinkingLevel:'LOW'}},
  {model:'gemini-2.5-flash',thinkingConfig:{thinkingBudget:0}},
];
let aiCtx=null,aiModelIdx=0,aiModel=null,aiChat=null,aiBusy=false;
function initAI(app){try{aiCtx=getAI(app,{backend:new GoogleAIBackend()});makeModel()}catch(e){aiCtx=null}}
function makeModel(){
  const {model,thinkingConfig}=AI_MODELS[aiModelIdx];
  aiModel=aiCtx?getGenerativeModel(aiCtx,{model,systemInstruction:aiSystem(),tools:[{functionDeclarations:aiDecls()}],generationConfig:thinkingConfig?{thinkingConfig}:{}}):null;
  aiChat=null;
}
const modelGone=m=>/\b404\b|not found|is not supported|no longer available|deprecated|retired|thinking|\b400\b|invalid argument/i.test(m);
async function aiRun(text){
  aiChat??=aiModel.startChat();
  // The branch names travel with each question so the model can usually answer in one tool round
  let r=await aiChat.sendMessage(`[الفروع: ${S.branches.map(b=>b.name).join('، ')} · اليوم ${todayStr}]\n${text}`);
  for(let i=0;i<6;i++){
    const calls=r.response.functionCalls();if(!calls?.length) break;
    const parts=await Promise.all(calls.map(async c=>({functionResponse:{name:c.name,response:await runTool(c.name,c.args)}})));
    r=await aiChat.sendMessage(parts);
  }
  return r.response.text();
}
function mdLite(s){
  return esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').split('\n').map(l=>/^\s*[-*•]\s+/.test(l)?`<li>${l.replace(/^\s*[-*•]\s+/,'')}</li>`:l)
    .join('\n').replace(/(<li>.*<\/li>\n?)+/g,m=>`<ul>${m.replace(/\n/g,'')}</ul>`).replace(/\n/g,'<br>');
}

let importData=null;
function showImport(s){
  history.replaceState(null,'',location.pathname);
  importData=decodeImport(s);route();
  if(!importData){toast('رابط الاستيراد غير صالح',true);return}
  if(!db){toast('سجّل دخولك أول وبعدها افتح الرابط',true);return}
  const names=Object.fromEntries([...S.branches,...importData.branches].map(b=>[b.id,b.name]));
  const groups={};
  for(const [bid,date,v] of importData.entries){const g=groups[bid+'|'+date.slice(0,7)]??={bid,month:date.slice(0,7),days:0,sum:0};g.days++;g.sum+=v}
  const row=(name,sub,val)=>`<div class="e-row" style="padding:0 16px;min-height:60px"><div style="flex:1;min-width:0"><div style="font-size:17px">${esc(name)}</div><div style="font-size:13px;color:var(--sec)">${sub}</div></div><b class="tnum" style="font-size:17px">${fmt(val)}</b></div>`;
  const daily=Object.values(groups).map(g=>row(names[g.bid]||g.bid,`${AR_MONTHS[+g.month.slice(5)-1]} ${g.month.slice(0,4)} · ${g.days} يوم`,g.sum)).join('');
  const expRows=importData.expenses.map(([bid,month,items])=>row(names[bid]||bid,`${AR_MONTHS[+month.slice(5)-1]} ${month.slice(0,4)} · ${items.length} بند`,items.reduce((a,i)=>a+(i[1]||0),0))).join('');
  const paper=importData.months.map(m=>row(names[m[0]]||m[0],`${AR_MONTHS[+m[1].slice(5)-1]} ${m[1].slice(0,4)}`,m[2])).join('');
  document.body.style.overflow='hidden';
  $('overlay').innerHTML=`<div class="scrim" data-close-sheet></div><section class="sheet" aria-label="استيراد البيانات"><div class="grabber" aria-hidden="true"></div>
    <div class="sheet-head"><h2>استيراد البيانات</h2><button class="done" type="button" data-close-sheet>إلغاء</button></div>
    <div class="sheet-body">
      ${importData.branches.length?`<p class="cap">فروع: ${importData.branches.map(b=>esc(b.name)).join('، ')}</p>`:''}
      ${daily?`<p class="cap">الدخل اليومي</p><div class="list">${daily}</div>`:''}
      ${paper?`<p class="cap gap">مجاميع أشهر من الأوراق</p><div class="list">${paper}</div>`:''}
      ${expRows?`<p class="cap gap">المصاريف (بيان المخروج)</p><div class="list">${expRows}</div>`:''}
      <button class="l-btn" id="importGo" type="button" style="margin-top:24px;width:100%">استيراد</button>
    </div></section>`;
  $('importGo').onclick=async()=>{
    const btn=$('importGo');btn.disabled=true;btn.textContent='جاري الاستيراد…';
    try{
      const ops=[],at=new Date().toISOString();
      for(const b of importData.branches){
        const ref=fs.doc(db,base(),'branches',b.id);
        if(!(await fs.getDoc(ref)).exists()) ops.push([ref,{name:b.name,color:b.color||COLORS[0],order:b.order??Date.now(),createdAt:at}]);
      }
      for(const [bid,month,total] of importData.months)
        ops.push([fs.doc(db,base(),'months',`${bid}_${month}`),{branchId:bid,month,year:+month.slice(0,4),total,source:'paper'}]);
      for(const [bid,month,items] of importData.expenses)
        ops.push([fs.doc(db,base(),'expenses',`${bid}_${month}`),{branchId:bid,month,year:+month.slice(0,4),source:'paper',updatedAt:at,
          items:items.map(([name,amount,fixed])=>({id:newId(),name,amount:amount??null,fixed:!!fixed}))}]);
      for(const [bid,date,amount] of importData.entries)
        ops.push([fs.doc(db,base(),'entries',`${bid}_${date}`),{branchId:bid,date,year:+date.slice(0,4),month:date.slice(0,7),amount,updatedAt:at}]);
      for(let i=0;i<ops.length;i+=400){const b=fs.writeBatch(db);ops.slice(i,i+400).forEach(([r,d])=>b.set(r,d));await b.commit()}
      yearCache.clear();closeOverlay();toast('تم الاستيراد');importData=null;
    }catch(err){btn.disabled=false;btn.textContent='استيراد';toast(errMsg(err),true)}
  };
}

/* ---------- assistant UI ---------- */
let lastFrom=null;
// Every assistant failure shows the same message to Ahmed; the technical reason stays folded underneath for the engineer
const aiFail=detail=>`صار خلل في المساعد، راجع المهندسة شذى طال عمرك 🙏<details class="ai-det"><summary>تفاصيل للمهندسة</summary><div class="ai-err">${esc(String(detail||'').trim().slice(0,480))}</div></details>`;
function aiMsg(role,html){
  const el=document.createElement('div');el.className=`bub ${role}${lastFrom&&lastFrom!==role?' gap':''}`;el.innerHTML=html;
  $('aiMsgs').appendChild(el);lastFrom=role;return el;
}
// The suggested questions are answered on the device straight from the ledger, with no wait for Gemini
const sar=n=>`${fmt(n)} ${CUR}`;
const qList=rows=>`<ul>${rows.map(([k,v])=>`<li>${esc(k)}: <b>${v}</b></li>`).join('')}</ul>`;
async function quickAnswer(text){
  const t=new Date(),y=t.getFullYear(),m=t.getMonth(),from=ds(y,m,1);
  if(text===AI_SUGG[0]){
    const r=await TOOLS.get_totals({from,to:todayStr});
    return `مجموع ${AR_MONTHS[m]} لين اليوم:${qList(Object.entries(r.per_branch).map(([n,p])=>[n,sar(p.total)]))}كل الفروع: <b>${sar(r.total)}</b>`;
  }
  if(text===AI_SUGG[1]){
    const r=await TOOLS.find_missing_days({from,to:todayStr});
    if(!r.missing_days_count) return `ما فيه ولا يوم ناقص في ${AR_MONTHS[m]}، كل الفروع مسجّلة لين اليوم 👌`;
    const per={};for(const d of r.days) for(const n of d.missing) (per[n]??=[]).push(+d.date.slice(8));
    return `الأيام اللي ما تعبّت في ${AR_MONTHS[m]}:${qList(Object.entries(per).map(([n,ds])=>[n,(ds.length===1?'يوم ':'أيام ')+ds.join('، ')]))}`;
  }
  if(text===AI_SUGG[2]){
    const d=new Date(t.getFullYear(),t.getMonth(),t.getDate());do d.setDate(d.getDate()-1);while(d.getDay()!==1);
    const date=ds(d.getFullYear(),d.getMonth(),d.getDate()),r=await TOOLS.get_day({date});
    const head=`الاثنين ${d.getDate()} ${AR_MONTHS[d.getMonth()]}`;
    if(!Object.keys(r.amounts).length) return `${head} ما فيه دخل مسجّل لأي فرع.`;
    return `${head} دخلنا <b>${sar(r.total)}</b>:${qList(Object.entries(r.amounts).map(([n,v])=>[n,sar(v)]))}${r.not_entered.length?`ما تسجّل: ${esc(r.not_entered.join('، '))}`:''}`;
  }
  if(text===AI_SUGG[3]){
    const r=await TOOLS.get_totals({from:`${y}-01-01`,to:todayStr}),list=Object.entries(r.per_branch).sort((a,b)=>b[1].total-a[1].total);
    if(!list.length||!r.total) return `ما فيه دخل مسجّل في ${y} للحين.`;
    return `أعلى فرع في ${y} هو <b>${esc(list[0][0])}</b> بـ ${sar(list[0][1].total)}:${qList(list.map(([n,p])=>[n,sar(p.total)]))}`;
  }
  return null;
}
async function aiAsk(text){
  text=text.trim();if(!text||aiBusy) return;
  aiBusy=true;$('aiSend').disabled=true;sendState();
  aiMsg('me',esc(text));
  const wait=document.createElement('div');wait.className='typing';wait.setAttribute('aria-label','المساعد يكتب…');wait.innerHTML='<i></i><i></i><i></i>';$('aiMsgs').appendChild(wait);
  let html;
  try{
    const quick=await quickAnswer(text);
    if(quick){html=quick;return}
    if(!aiModel){html=aiFail('AI Logic model not initialised (Firebase config or getAI failed)');return}
    // Check App Check first so a broken key shows its reason instead of leaving the question hanging
    if(appCheck){
      const r=await Promise.race([getToken(appCheck,false).then(()=>null,e=>`${e?.code||''} ${e?.message||e}`),new Promise(ok=>setTimeout(()=>ok('timeout'),12000))]);
      if(r){html=aiFail(r==='timeout'?'App Check: no token after 12s':`App Check: ${r}`);return}
    }
    let answer;
    for(;;){
      try{answer=await Promise.race([aiRun(text),new Promise((_,no)=>setTimeout(()=>no(Object.assign(new Error(`timeout after 60s (${AI_MODELS[aiModelIdx].model})`),{code:'timeout'})),60000))]);break}
      catch(e){if(aiModelIdx<AI_MODELS.length-1&&modelGone(String(e?.message||e))){aiModelIdx++;makeModel();continue}throw e}
    }
    html=mdLite(answer||'ما قدرت أطلع جواب. جرّب تصيغ السؤال بطريقة ثانية.');
  }catch(e){
    const m=String(e?.message||e),code=e?.code||'';
    // When App Check rejects the request, ask App Check itself why it could not issue a valid token
    let why='';
    if(/App Check/i.test(m)&&appCheck){try{await getToken(appCheck,true);why='App Check token OK'}catch(x){why=`${x?.code||''} ${x?.message||x}`}}
    html=aiFail(`${navigator.onLine?'':'[offline] '}${code} ${m}${why?`\n${why}`:''}`);
    aiChat=null;
  }finally{wait.remove();if(html)aiMsg('bot',html);aiBusy=false;sendState()}
}
const AI_SUGG=['كم مجموع كل فرع هالشهر؟','وش الأيام اللي ما عبّيتها هالشهر؟','كم دخلنا يوم الاثنين اللي فات؟','أي فرع أعلى دخل هالسنة؟'];
function sendState(){const on=!!$('aiInput').value.trim()&&!aiBusy;$('aiSend').disabled=!on;$('aiSend').classList.toggle('on',on)}
function openAI(){
  closeOverlay();
  $('aiScrim').hidden=false;$('aiSheet').hidden=false;document.body.style.overflow='hidden';
  if(!$('aiMsgs').children.length){
    const t=new Date(),h=t.getHours();
    $('aiMsgs').innerHTML=`<div class="ai-stamp">اليوم ${h%12||12}:${pad(t.getMinutes())} ${h<12?'ص':'م'}</div>`;
    aiMsg('bot',`هلا ${USER_NAME}! اسألني عن أي فرع أو يوم أو شهر`);
  }
  sendState();
  if(!matchMedia('(pointer:coarse)').matches) $('aiInput').focus();
}
function closeAI(){$('aiScrim').hidden=true;$('aiSheet').hidden=true;document.body.style.overflow=''}
$('aiChips').innerHTML=AI_SUGG.map(s=>`<button type="button">${s}</button>`).join('');
$('aiChips').addEventListener('click',e=>{const b=e.target.closest('button');if(b) aiAsk(b.textContent)});
$('aiInput').addEventListener('input',sendState);
$('aiForm').addEventListener('submit',e=>{e.preventDefault();const i=$('aiInput');aiAsk(i.value);i.value='';sendState()});
$('aiScrim').addEventListener('click',closeAI);
document.querySelector('[data-close-ai]').addEventListener('click',closeAI);

/* ---------- auth & boot ---------- */
const authMsg={'auth/invalid-credential':'الإيميل أو كلمة السر غلط، جرّب مرة ثانية','auth/wrong-password':'كلمة السر غلط، جرّب مرة ثانية','auth/user-not-found':'ما فيه حساب بهذا الإيميل',
  'auth/too-many-requests':'محاولات كثيرة، انتظر شوي وجرّب','auth/network-request-failed':'ما فيه اتصال بالإنترنت','auth/invalid-email':'اكتب الإيميل بشكل صحيح'};
let doLogout=null;
// The splash plays its intro, then fades once the first screen is ready
const splashStart=performance.now();
let splashGone=false;
function hideSplash(){
  if(splashGone) return;splashGone=true;
  setTimeout(()=>{$('splash').classList.add('out');setTimeout(()=>$('splash').remove(),900)},Math.max(0,2200-(performance.now()-splashStart)));
}
function stopLive(){unsubs.forEach(u=>u());unsubs=[];unsubYear.forEach(u=>u());unsubYear=[]}
function startLive(){
  stopLive();
  unsubs.push(fs.onSnapshot(fs.collection(db,base(),'branches'),s=>{
    S.branches=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.order||0)-(b.order||0));
    S.mode='live';render();if($('overlay').querySelector('.sheet[aria-label="تعديل الفروع"]')) renderEdit();
    setTimeout(maybeWelcome,splashGone?600:2600);
  },e=>toast(errMsg(e),true)));
  subscribeYear();
}
function showLogin(on){$('login').hidden=!on;$('app').hidden=on;if(on){closeOverlay();closeAI()}}

if(!firebaseConfig){
  S.mode='local';showLogin(false);subscribeYear();route();hideSplash();
}else{
  const app=initializeApp(firebaseConfig);
  // App Check proves requests come from this site; Firebase requires it for the assistant (AI Logic)
  if(appCheckSiteKey) appCheck=initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(appCheckSiteKey),isTokenAutoRefreshEnabled:true});
  const auth=getAuth(app);
  initAI(app);
  db=fs.initializeFirestore(app,{localCache:fs.persistentLocalCache({tabManager:fs.persistentMultipleTabManager()})});
  doLogout=()=>signOut(auth);
  onAuthStateChanged(auth,u=>{
    if(u){uid=u.uid;yearCache.clear();aiChat=null;showLogin(false);startLive();route()}
    else{uid=null;stopLive();S.branches=[];S.entries=new Map();S.months=new Map();S.expenses=new Map();expDraft=null;S.mode='loading';S.rendered='';showLogin(true)}
    hideSplash();
  });
  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();const btn=$('loginBtn');$('loginErr').hidden=true;btn.disabled=true;$('loginBtnText').textContent='جاري الدخول…';
    try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value)}
    catch(x){$('loginErrText').textContent=authMsg[x.code]||'تعذّر الدخول، حاول مرة ثانية';$('loginErr').hidden=false}
    btn.disabled=false;$('loginBtnText').textContent='دخول';
  });
}
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).catch(()=>{});
