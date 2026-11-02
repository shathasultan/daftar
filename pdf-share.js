// bt:ec52ad88d4b0903b
// Called directly from a user click with an already prepared File (required by iOS).
export async function sharePdfFile(file,{nav,download,notify}){
 try{
  if(!nav.share||!nav.canShare?.({files:[file]})){
   download();notify('المشاركة المباشرة غير متاحة في هذا المتصفح. افتح PDF من التنزيلات وشاركه عبر واتساب.');return 'download';
  }
  notify('اختر واتساب أو التطبيق المطلوب من قائمة المشاركة.');
  await nav.share({files:[file]});notify('أُغلقت نافذة المشاركة.');return 'shared';
 }catch(err){
  notify(err.name==='AbortError'?'أُلغيت المشاركة. يمكنك المحاولة مجددًا.':'تعذّرت المشاركة. اضغط تنزيل PDF وشاركه من تطبيق الملفات.');
  return err.name==='AbortError'?'cancelled':'failed';
 }
}
