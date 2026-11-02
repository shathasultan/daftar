// bt:ec52ad88d4b0903b
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, TableLayoutType, AlignmentType, ShadingType, Header, Footer, PageNumber, PageBreak } from './vendor/docx.js';
const months=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const money=n=>(n<0?'−':'')+new Intl.NumberFormat('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(n));
const sum=a=>a.reduce((s,n)=>s+n,0);
const numeric=n=>typeof n==='number'&&Number.isFinite(n);
export function monthlyData({year,month,branches,entries,totals,expenses}){
  const key=`${year}-${String(month+1).padStart(2,'0')}`;
  return branches.map(b=>{
    const daily=entries.filter(e=>e.branchId===b.id&&e.date.startsWith(key+'-')&&numeric(e.amount)).sort((a,b)=>a.date.localeCompare(b.date));
    const paper=totals.find(e=>e.branchId===b.id&&e.month===key);
    const items=expenses.find(e=>e.branchId===b.id&&e.month===key)?.items||[];
    const income=daily.length?sum(daily.map(e=>e.amount)):numeric(paper?.total)?paper.total:0;
    const out=sum(items.map(e=>numeric(e.amount)?e.amount:0));
    return {...b,daily,items,income,out,net:income-out,paper:!daily.length&&numeric(paper?.total),missing:!daily.length&&!numeric(paper?.total)};
  });
}
export async function buildMonthlyReport(input){
  const data=monthlyData(input),title=`تقرير ${months[input.month]} ${input.year}`;
  const p=(text,{bold=false,size=22,color='243247',center=false,pageBreakBefore=false}={})=>new Paragraph({bidirectional:!String(text).endsWith(' ر.س'),alignment:center?AlignmentType.CENTER:AlignmentType.RIGHT,spacing:{after:100,line:360},pageBreakBefore,children:[new TextRun({text:String(text),bold,size,color,font:'Arial',rightToLeft:!String(text).endsWith(' ر.س')})]});
  const table=(headers,rows,widths)=>new Table({alignment:AlignmentType.RIGHT,layout:TableLayoutType.FIXED,width:{size:9638,type:WidthType.DXA},columnWidths:[...widths].reverse(),rows:[headers,...rows].map((r,i)=>new TableRow({tableHeader:i===0,cantSplit:true,children:[...r].reverse().map((v,j)=>new TableCell({width:{size:[...widths].reverse()[j],type:WidthType.DXA},shading:{type:ShadingType.CLEAR,fill:i===0?'183653':i%2?'F0F4F8':'FFFFFF'},margins:{top:90,bottom:90,left:110,right:110},children:[p(v,{bold:i===0,color:i===0?'FFFFFF':'243247',size:21})]}))}))});
  const amount=n=>money(n)+' ر.س';
  const children=[p('دفتر الفروع',{size:22,color:'52647A'}),p(title,{size:36,bold:true}),p('المدخلات والمخرجات والصافي',{size:24}),p('جميع المبالغ بالريال السعودي. التقرير يعكس البيانات المسجلة وقت التنزيل.'),p('ملخص الفروع',{bold:true,size:27}),table(['الفرع','المدخلات (الدخل)','المخرجات (المصروفات)','الصافي'],[...data.map(b=>[b.name,amount(b.income),amount(b.out),amount(b.net)]),['الإجمالي',amount(sum(data.map(b=>b.income))),amount(sum(data.map(b=>b.out))),amount(sum(data.map(b=>b.net)))]],[2408,2410,2410,2410]),p('الصافي = المدخلات ناقص المخرجات. القيم غير المسجلة لا تعني عدم وجود دخل أو مصروفات.',{size:20})];
  for(const b of data){
    children.push(new Paragraph({children:[new PageBreak()]}),p(b.name,{bold:true,size:32}),p(title,{size:22,color:'52647A'}),table(['المدخلات','المخرجات','الصافي'],[[amount(b.income),amount(b.out),amount(b.net)]],[3212,3213,3213]),p('المدخلات: الدخل اليومي',{bold:true,size:27}));
    if(b.paper) children.push(p('مصدر الدخل: مجموع الشهر من الدفتر الورقي. لا توجد تفاصيل يومية لهذا المجموع.'));
    else if(b.missing) children.push(p('لم يُسجّل دخل لهذا الفرع في الشهر المحدد.'));
    else {
      const days=new Date(input.year,input.month+1,0).getDate();
      const rows=Array.from({length:days},(_,i)=>{const date=`${input.year}-${String(input.month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,entry=b.daily.find(e=>e.date===date);return [new Date(input.year,input.month,i+1).toLocaleDateString('ar-SA',{calendar:'gregory',year:'numeric',month:'2-digit',day:'2-digit'}),new Date(input.year,input.month,i+1).toLocaleDateString('ar-SA',{weekday:'long'}),entry?amount(entry.amount):'غير مسجل']});
      children.push(table(['التاريخ','اليوم','الدخل'],[...rows,['إجمالي المدخلات','',amount(b.income)]],[3212,3213,3213]));
      if(input.totals.some(t=>t.branchId===b.id&&t.month===`${input.year}-${String(input.month+1).padStart(2,'0')}`)) children.push(p('احتُسب الدخل من القيود اليومية بدل مجموع الورق، وفق طريقة الحساب في دفتر.',{size:20}));
    }
    children.push(p('المخرجات: تفاصيل المصروفات',{bold:true,size:27}));
    if(b.items.length) children.push(table(['البند','النوع','المبلغ'],[...b.items.map(it=>[it.name||'بند دون اسم',it.fixed?'ثابت':'غير ثابت',numeric(it.amount)?amount(it.amount):'غير مسجل']),['إجمالي المخرجات','',amount(b.out)]],[4818,2410,2410]));
    else children.push(p('لا توجد بنود مصروفات مسجلة لهذا الشهر.'));
  }
  const doc=new Document({creator:'دفتر الفروع',description:'bt:ec52ad88d4b0903b',title,styles:{default:{document:{run:{font:'Arial',size:22},paragraph:{spacing:{line:360}}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1000,bottom:1000,left:1134,right:1134}}},headers:{default:new Header({children:[p('دفتر الفروع | '+title,{size:18,color:'52647A'})]})},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({children:[PageNumber.CURRENT],font:'Arial',size:18})]})]})},children}]});
  return Packer.toBlob(doc);
}
