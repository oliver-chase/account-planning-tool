const wait=ms=>new Promise(r=>setTimeout(r,ms));
if (document.body.classList.contains('show-start')) { [...document.querySelectorAll('.start-option')].find(b=>/sample/i.test(b.textContent)).click(); await wait(600); }
await wait(300);
return JSON.stringify({account:state.account.account_name, people:state.stakeholders.length, actions:state.actions.length, plan:!!document.querySelector('.plan-header-card'), nav:[...document.querySelectorAll('#section-nav a')].map(a=>a.textContent)});
