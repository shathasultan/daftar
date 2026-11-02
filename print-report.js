// bt:ec52ad88d4b0903b
import { sharePdfFile } from './pdf-share.js';
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
 root.innerHTML=`<div class="report-toolbar"><button type="button" data-print-now disabled>فتح PDF للطباعة</button><button type="button" data-share-pdf disabled>مشاركة PDF</button><button type="button" data-download-pdf disabled>تنزيل PDF</button><button type="button" data-print-close>رجوع إلى دفتر</button></div><main tabindex="-1"><p class="report-help">للطباعة: افتح PDF ثم اختر «مشاركة» ثم «طباعة» من عارض الملف. لإرساله عبر واتساب اضغط «مشاركة PDF».</p><p class="report-help" data-pdf-status role="status" aria-live="polite">جارٍ تجهيز ملف PDF…</p><button type="button" class="report-retry" data-pdf-retry hidden>إعادة تجهيز PDF</button>${reportMarkup(input)}</main>`;
 document.body.append(root);document.body.classList.add('report-open');
 for(const child of document.body.children)if(child!==root&&!child.inert){child.inert=true;child.dataset.reportInert='1'}
 const historyKey='report-'+Date.now();
 history.pushState({...history.state,daftarReport:historyKey},'');
 document.title=`دفتر: ${months[input.month]} ${input.year}`;
 let closed=false,pdfUrl=null,pdfFile=null,preparing=false;
 const status=root.querySelector('[data-pdf-status]');
 const cleanup=()=>{if(closed)return;closed=true;if(pdfUrl){const url=pdfUrl;setTimeout(()=>URL.revokeObjectURL(url),60000)}window.removeEventListener('popstate',onBack);root.remove();document.body.classList.remove('report-open');document.title=oldTitle;document.querySelectorAll('[data-report-inert]').forEach(el=>{el.inert=false;delete el.dataset.reportInert});document.removeEventListener('keydown',keydown);lastFocus?.focus({preventScroll:true})};
 const onBack=()=>cleanup();
 const close=()=>{cleanup();if(history.state?.daftarReport===historyKey)history.back()};
 window.addEventListener('popstate',onBack);
 const keydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close()}if(e.key==='Tab'){const buttons=[...root.querySelectorAll('button')].filter(b=>!b.disabled&&!b.hidden);if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons[buttons.length-1].focus()}else if(!e.shiftKey&&document.activeElement===buttons[buttons.length-1]){e.preventDefault();buttons[0].focus()}}};
 const download=()=>{if(!pdfUrl)return;const a=document.createElement('a');a.href=pdfUrl;a.download=pdfFile.name;document.body.append(a);a.click();a.remove()};
 root.querySelector('[data-download-pdf]').onclick=download;
 root.querySelector('[data-print-now]').onclick=()=>{
   if(!pdfUrl)return;
   const viewer=window.open(pdfUrl,'_blank');
   if(viewer){viewer.opener=null;status.textContent='فُتح PDF في نافذة جديدة. اختر مشاركة ثم طباعة من عارض الملف.'}
   else {download();status.textContent='تم طلب تنزيل PDF. افتحه من التنزيلات ثم اختر مشاركة ثم طباعة.'}
 };
 root.querySelector('[data-share-pdf]').onclick=async()=>{
   if(!pdfFile)return;
   const button=root.querySelector('[data-share-pdf]');button.disabled=true;
   await sharePdfFile(pdfFile,{nav:navigator,title:document.title,download,notify:message=>{if(!closed)status.textContent=message}});
   if(!closed)button.disabled=false;
 };
 const prepare=async()=>{
  if(preparing||closed)return;preparing=true;root.querySelector('[data-pdf-retry]').hidden=true;
  status.textContent='جارٍ تجهيز ملف PDF…';
  try{
   const {buildMonthlyPdf}=await import('./pdf-report.js');
   if(closed)return;
   const blob=buildMonthlyPdf(input);pdfFile=new File([blob],`دفتر-${input.year}-${String(input.month+1).padStart(2,'0')}.pdf`,{type:'application/pdf'});pdfUrl=URL.createObjectURL(pdfFile);
   root.querySelectorAll('[data-print-now],[data-share-pdf],[data-download-pdf]').forEach(b=>b.disabled=false);
   status.textContent='ملف PDF جاهز للتنزيل والمشاركة والطباعة.';
  }catch(err){console.error(err);if(!closed){status.textContent='تعذّر تجهيز PDF. أعد المحاولة؛ وإذا كنت دون اتصال افتح التقرير مرة بعد الاتصال.';root.querySelector('[data-pdf-retry]').hidden=false}}
  finally{preparing=false}
 };
 root.querySelector('[data-pdf-retry]').onclick=prepare;
 root.querySelector('[data-print-close]').onclick=close;
 prepare();
 document.addEventListener('keydown',keydown);root.querySelector('[data-print-close]').focus({preventScroll:true});
}
