// bt:ec52ad88d4b0903b
import { monthlyData } from './word-report.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const months=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const money=n=>`<span class="report-number" dir="ltr">${esc(new Intl.NumberFormat('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n))}</span>`;
const sum=a=>a.reduce((s,n)=>s+n,0);
export function reportMarkup(input){
 const data=monthlyData(input),title=`تقرير ${months[input.month]} ${input.year}`;
 const table=(head,rows)=>`<div class="report-table"><table><thead><tr>${head.map(t=>`<th scope="col">${esc(t)}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr${i===rows.length-1?' class="report-last"':''}>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 const overview=table(['الفرع','المدخلات','المخرجات','الصافي'],[...data.map(b=>[esc(b.name),money(b.income),money(b.out),money(b.net)]),['الإجمالي',money(sum(data.map(b=>b.income))),money(sum(data.map(b=>b.out))),money(sum(data.map(b=>b.net)))]]);
 return `<div class="report-sheet"><header><span>دفتر الفروع</span><h1>${esc(title)}</h1><p>المدخلات والمخرجات والصافي</p><p class="report-note">جميع المبالغ بالريال السعودي، وفق البيانات المسجلة وقت إعداد التقرير.</p></header><h2>ملخص الفروع</h2>${overview}<p class="report-note">الصافي = المدخلات ناقص المخرجات. «غير مسجل» يختلف عن مبلغ صفر.</p></div>`+data.map(b=>{
  const daily=b.paper?'<p>مصدر المدخلات: مجموع الشهر من الدفتر الورقي، دون تفاصيل يومية.</p>':b.missing?'<p>لم يُسجّل دخل لهذا الشهر.</p>':table(['التاريخ','اليوم','الدخل'],[...Array.from({length:new Date(input.year,input.month+1,0).getDate()},(_,i)=>{const day=i+1,date=`${input.year}-${String(input.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,e=b.daily.find(e=>e.date===date),d=new Date(input.year,input.month,day);return [`<span class="report-number" dir="ltr">${esc(d.toLocaleDateString('ar-SA',{calendar:'gregory',year:'numeric',month:'2-digit',day:'2-digit'}))}</span>`,esc(d.toLocaleDateString('ar-SA',{weekday:'long'})),e?money(e.amount):'غير مسجل']}),['إجمالي المدخلات','',money(b.income)]]);
  const expenses=b.items.length?table(['بند المصروف','النوع','المبلغ'],[...b.items.map(i=>[esc(i.name||'بند دون اسم'),i.fixed?'ثابت':'غير ثابت',typeof i.amount==='number'?money(i.amount):'غير مسجل']),['إجمالي المخرجات','',money(b.out)]]):'<p>لا توجد بنود مصروفات مسجلة لهذا الشهر.</p>';
  return `<section class="report-sheet report-branch"><header><span>${esc(title)}</span><h1>${esc(b.name)}</h1></header>${table(['المدخلات','المخرجات','الصافي'],[[money(b.income),money(b.out),money(b.net)]])}<h2>المخرجات: تفاصيل المصروفات</h2>${expenses}<h2>المدخلات: الدخل اليومي</h2>${daily}</section>`;
 }).join('');
}
export function openPrintReport(input){
 if(document.getElementById('monthlyPrintReport'))return;
 const lastFocus=document.activeElement,oldTitle=document.title;
 const root=document.createElement('div');root.id='monthlyPrintReport';root.dir='rtl';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','معاينة وطباعة تقرير الشهر');
 root.innerHTML=`<div class="report-toolbar"><button type="button" data-print-now>طباعة التقرير</button><button type="button" data-print-close>رجوع إلى دفتر</button></div><main tabindex="-1"><p class="report-help">اختر الطابعة أو احفظ التقرير بصيغة PDF من نافذة الطباعة.</p>${reportMarkup(input)}</main>`;
 document.body.append(root);document.body.classList.add('report-open');
 for(const child of document.body.children)if(child!==root&&!child.inert){child.inert=true;child.dataset.reportInert='1'}
 const historyKey='report-'+Date.now();
 history.pushState({...history.state,daftarReport:historyKey},'');
 document.title=`دفتر: ${months[input.month]} ${input.year}`;
 let closed=false;
 const cleanup=()=>{if(closed)return;closed=true;window.removeEventListener('popstate',onBack);root.remove();document.body.classList.remove('report-open');document.title=oldTitle;document.querySelectorAll('[data-report-inert]').forEach(el=>{el.inert=false;delete el.dataset.reportInert});document.removeEventListener('keydown',keydown);lastFocus?.focus({preventScroll:true})};
 const onBack=()=>cleanup();
 const close=()=>{cleanup();if(history.state?.daftarReport===historyKey)history.back()};
 window.addEventListener('popstate',onBack);
 const keydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close()}if(e.key==='Tab'){const buttons=root.querySelectorAll('button');if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons[1].focus()}else if(!e.shiftKey&&document.activeElement===buttons[1]){e.preventDefault();buttons[0].focus()}}};
 root.querySelector('[data-print-now]').onclick=()=>window.print();root.querySelector('[data-print-close]').onclick=close;
 document.addEventListener('keydown',keydown);root.querySelector('[data-print-close]').focus({preventScroll:true});
}
