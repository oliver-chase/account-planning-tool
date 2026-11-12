const wait=ms=>new Promise(r=>setTimeout(r,ms)); const out={};
try { document.getElementById('btn-export-menu').click(); await wait(300); out.exportMenu=[...document.querySelectorAll('.export-menu-title')].length; document.querySelector('.app-modal-close').click(); await wait(200); } catch(e){ out.exportMenuError=String(e) }
try { const s=buildCallSummary(); out.callSummaryLines=s.text.split('\n').length; } catch(e){ out.callSummaryError=String(e) }
try { const wb=buildWorkbook(); const arr=XLSX.write(wb,{bookType:'xlsx',type:'array'}); const back=XLSX.read(arr,{type:'array',cellDates:true}); out.roundTrip=wb.SheetNames.includes('Actions') && back.SheetNames.join()===wb.SheetNames.join(); } catch(e){ out.workbookError=String(e) }
try { const p=updateExcel(); await Promise.race([p,wait(1500)]); out.updateExcelRan=true; } catch(e){ out.updateExcelError=String(e) }
try { out.parseMoney=parseMoney('$1.2M'); } catch(e){ out.calcErr=String(e) }
return JSON.stringify(out);
