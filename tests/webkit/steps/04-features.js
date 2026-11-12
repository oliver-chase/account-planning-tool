const wait=ms=>new Promise(r=>setTimeout(r,ms)); const out={};
try { document.getElementById('btn-export-menu').click(); await wait(300); out.exportMenu=[...document.querySelectorAll('.export-menu-title')].length; document.querySelector('.app-modal-close').click(); await wait(200); } catch(e){ out.exportMenuError=String(e) }
try { const s=buildCallSummary(); out.summaryListsOpenActions=state.actions.some(a=>a.status!=='Done') && state.actions.filter(a=>a.status!=='Done').every(a=>s.text.includes(a.description)); } catch(e){ out.callSummaryError=String(e) }
try { const wb=buildWorkbook(); const arr=XLSX.write(wb,{bookType:'xlsx',type:'array'}); const back=XLSX.read(arr,{type:'array',cellDates:true}); out.roundTrip=wb.SheetNames.includes('Actions') && back.SheetNames.join()===wb.SheetNames.join(); } catch(e){ out.workbookError=String(e) }
try { persist(); const p=updateExcel(); await Promise.race([p,wait(1500)]); out.updateExcelSaved=!unsavedEdits; } catch(e){ out.updateExcelError=String(e) }
return JSON.stringify(out);
