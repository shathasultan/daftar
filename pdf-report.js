// bt:ec52ad88d4b0903b
import {jsPDF,autoTable} from './vendor/pdf.js';
import amiri from './vendor/amiri-font.js';
import {monthlyData} from './word-report.js';
const months=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const money=n=>(n<0?'−':'')+new Intl.NumberFormat('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(n));
const sum=a=>a.reduce((s,n)=>s+n,0);
export function buildMonthlyPdf(input){
 const data=monthlyData(input),title=`تقرير ${months[input.month]} ${input.year}`;
 const doc=new jsPDF({unit:'mm',format:'a4',compress:true});
 doc.addFileToVFS('Amiri.ttf',amiri);doc.addFont('Amiri.ttf','Amiri','normal');doc.setFont('Amiri');doc.setLineHeightFactor(1.5);doc.setR2L(false);
 doc.setProperties({title,author:'دفتر الفروع',creator:'دفتر الفروع · bt:ec52ad88d4b0903b',subject:'المدخلات والمخرجات والصافي'});
 let y=22;
 const text=(s,size=12,color='#243247')=>{doc.setFontSize(size);doc.setTextColor(color);const lines=doc.splitTextToSize(String(s),180);const height=lines.length*size*.3528*1.5;if(y+height>274){doc.addPage();y=22}doc.text(lines,196,y,{align:'right'});y+=height+3};
 const table=(head,rows,widths)=>{
   doc.setR2L(true);
   autoTable(doc,{startY:y,margin:{top:22,bottom:20,left:14,right:14},head:[[...head].reverse()],body:rows.map(r=>[...r].reverse()),tableWidth:182,styles:{font:'Amiri',fontStyle:'normal',fontSize:11,halign:'right',valign:'middle',cellPadding:1.8,minCellHeight:8.5,lineColor:[183,197,211],lineWidth:.2,overflow:'linebreak'},headStyles:{fontStyle:'normal',fillColor:[24,54,83],textColor:255,minCellHeight:10},alternateRowStyles:{fillColor:[240,244,248]},columnStyles:Object.fromEntries([...widths].reverse().map((w,i)=>[i,{cellWidth:w}])),willDrawCell:({cell})=>doc.setR2L(/[\u0621-\u064A]/.test(cell.text.join(' '))),rowPageBreak:'avoid',showHead:'everyPage'});
   doc.setR2L(false);
   y=doc.lastAutoTable.finalY+8;
 };
 text('دفتر الفروع',12,'#52647A');text(title,22);text('المدخلات والمخرجات والصافي',15);text('جميع المبالغ بالريال السعودي، وفق البيانات المسجلة وقت إعداد التقرير.',11);
 text('ملخص الفروع',16);
 table(['الفرع','المدخلات','المخرجات','الصافي'],[...data.map(b=>[b.name,money(b.income),money(b.out),money(b.net)]),['الإجمالي',money(sum(data.map(b=>b.income))),money(sum(data.map(b=>b.out))),money(sum(data.map(b=>b.net)))]],[62,40,40,40]);
 text('الصافي = المدخلات ناقص المخرجات. غير المسجل يختلف عن الصفر.',11);
 for(const b of data){
  doc.addPage();y=24;text(title,12,'#52647A');text(b.name,22);
  table(['المدخلات','المخرجات','الصافي'],[[money(b.income),money(b.out),money(b.net)]],[60,61,61]);
  text('المخرجات: تفاصيل المصروفات',16);
  if(b.items.length)table(['بند المصروف','النوع','المبلغ'],[...b.items.map(i=>[i.name||'بند دون اسم',i.fixed?'ثابت':'غير ثابت',typeof i.amount==='number'?money(i.amount):'غير مسجل']),['إجمالي المخرجات','',money(b.out)]],[94,40,48]);
  else text('لا توجد بنود مصروفات مسجلة لهذا الشهر.');
  text('المدخلات: الدخل اليومي',16);
  if(b.paper)text('المصدر: مجموع الشهر من الدفتر الورقي، دون تفاصيل يومية.');
  else if(b.missing)text('لم يُسجّل دخل لهذا الشهر.');
  else {
   const rows=Array.from({length:new Date(input.year,input.month+1,0).getDate()},(_,i)=>{const d=new Date(input.year,input.month,i+1),date=`${input.year}-${String(input.month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,e=b.daily.find(e=>e.date===date);return [d.toLocaleDateString('ar-SA',{calendar:'gregory',year:'numeric',month:'2-digit',day:'2-digit'}),d.toLocaleDateString('ar-SA',{weekday:'long'}),e?money(e.amount):'غير مسجل']});
   table(['التاريخ','اليوم','الدخل'],[...rows,['إجمالي المدخلات','',money(b.income)]],[65,57,60]);
   if(input.totals.some(t=>t.branchId===b.id&&t.month===`${input.year}-${String(input.month+1).padStart(2,'0')}`))text('احتُسب الدخل من القيود اليومية بدل مجموع الورق.',11);
  }
 }
 const count=doc.getNumberOfPages();
 for(let i=1;i<=count;i++){doc.setPage(i);doc.setFontSize(10);doc.setTextColor('#52647A');doc.text(title,196,12,{align:'right'});doc.text(`${i} / ${count}`,105,287,{align:'center'});}
 return doc.output('blob');
}
