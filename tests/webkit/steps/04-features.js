const wait=ms=>new Promise(r=>setTimeout(r,ms)); const out={};
try { document.getElementById('btn-export-menu').click(); await wait(300); out.exportMenu=[...document.querySelectorAll('.export-menu-title')].length; document.querySelector('.app-modal-close').click(); await wait(200); } catch(e){ out.exportMenuError=String(e) }
try { const s=buildCallSummary(); out.callSummary=s.text.split('\n').length+' lines'; } catch(e){ out.callSummaryError=String(e) }
try { const wb=buildWorkbook(); out.workbookSheets=wb.SheetNames; const arr=XLSX.write(wb,{bookType:'xlsx',type:'array'}); const back=XLSX.read(arr,{type:'array',cellDates:true}); out.roundTripSheets=back.SheetNames.length; } catch(e){ out.workbookError=String(e) }
try { out.updateExcelUsesFallback = !window.showSaveFilePicker; const p=updateExcel(); await Promise.race([p,wait(1500)]); out.updateExcelRan='no exception'; } catch(e){ out.updateExcelError=String(e) }
try { const inp=document.createElement('input'); inp.type='date'; inp.value='2026-11-20'; out.dateInputValue=inp.value; } catch(e){ out.dateErr=String(e) }
try { out.nextMeeting=computeNextMeeting({meeting_frequency:'weekly',meeting_interval:'1'},[{date:'2026-10-01'}], today()); out.parseMoney=parseMoney('$1.2M'); } catch(e){ out.calcErr=String(e) }
out.stored=!!localStorage.getItem('accountPlanningTool.state.v2');
return JSON.stringify(out);
