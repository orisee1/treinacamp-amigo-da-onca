(() => {
  'use strict';
  const config = window.TREINACAMP_CONFIG || {};
  const ENDPOINT = config.SUPABASE_URL ? `${String(config.SUPABASE_URL).replace(/\/$/, '')}/functions/v1/indicacoes` : '';
  const BONUS = Number(config.BONUS_POR_MATRICULA) || 50;
  const $ = id => document.getElementById(id);
  const statuses = { pendente:'Pendente', matriculado:'Matriculado', pago:'Pago', cancelado:'Cancelado' };
  const state = { entries: [], filtered: [], token: sessionStorage.getItem('tc_admin_token') || '', ready: true };
  const money = n => (Number(n) || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const onlyDigits = value => String(value ?? '').replace(/\D/g, '');
  const validPhone = value => /^(?:[1-9][1-9])\d{8,9}$/.test(onlyDigits(value));
  const formatPhone = value => {
    const d=onlyDigits(value).slice(0,11);
    if(d.length<=2) return d.length ? `(${d}` : '';
    if(d.length<=6) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    const p=d.length===11?5:4;
    return `(${d.slice(0,2)}) ${d.slice(2,2+p)}-${d.slice(2+p)}`;
  };
  const fmtDate = iso => { try { return new Intl.DateTimeFormat('pt-BR', { day:'2-digit',month:'2-digit',year:'numeric', hour:'2-digit',minute:'2-digit',timeZone:'America/Campo_Grande' }).format(new Date(iso)); } catch { return String(iso??''); } };
  const toast = (message, isError=false) => { const el=document.createElement('div');el.className=`toast ${isError?'error':''}`;el.textContent=message;$('toastHolder').appendChild(el);setTimeout(()=>el.remove(),4500); };
  const setError = (id, message) => { const input=$(id), target=$(`err-${id}`);if(input)input.classList.toggle('is-invalid', Boolean(message));if(target)target.textContent=message||''; };
  const showError = (id,msg) => { $(id).textContent=msg;$(id).hidden=false; };
  const clearError = id => { $(id).textContent='';$(id).hidden=true; };
  async function request(action,data={},token=state.token) {
    if(!ENDPOINT) throw new Error('O site ainda não foi conectado ao Supabase. Configure o arquivo config.js antes de publicar.');
    const headers={'Content-Type':'application/json'};
    if(config.SUPABASE_PUBLISHABLE_KEY) headers.apikey=config.SUPABASE_PUBLISHABLE_KEY;
    if(token) headers.Authorization=`Bearer ${token}`;
    let response;
    try { response=await fetch(ENDPOINT,{method:'POST',headers,body:JSON.stringify({action,...data})}); }
    catch { throw new Error('Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.'); }
    let result={};try{result=await response.json()}catch{}
    if(!response.ok){ if(response.status===401 && action!=='login'){ signOut(false); } throw new Error(result.error||`Não foi possível concluir a solicitação (${response.status}).`); }
    return result;
  }
  function bindPhone(id){ $(id)?.addEventListener('input',e=>{e.target.value=formatPhone(e.target.value);setError(id,'');}); }
  bindPhone('studentPhone');bindPhone('friendPhone');
  ['studentName','friendName','friendCourse'].forEach(id => $(id)?.addEventListener('input',()=>setError(id,'')));
  $('consent').addEventListener('change',()=>setError('consent',''));
  // O formulário permanece disponível; erros de conexão são tratados no envio.
  const info=document.createElement('div');
  info.id='backendNotice';info.setAttribute('role','status');info.className='backend-notice';
  // Sem aviso de bloqueio durante configuração.
  function setReady(value){
    state.ready=Boolean(value);
    $('submitBtn').disabled=false;
    $('submitText').textContent=state.ready?'Enviar indicação':'Formulário temporariamente indisponível';
    info.hidden=true;
  }
  setReady(true);
  document.documentElement.dataset.viewport = window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop';
  window.addEventListener('resize', () => { document.documentElement.dataset.viewport = window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop'; }, { passive:true });

  $('year').textContent=String(new Date().getFullYear());
  function openModal(id){$(id).hidden=false;document.body.style.overflow='hidden';}
  function closeModal(id){$(id).hidden=true;document.body.style.overflow='';}
  $('privacyLink').addEventListener('click',e=>{e.preventDefault();openModal('privacyModal');});
  $('privacyFooter').addEventListener('click',()=>openModal('privacyModal'));
  $('closePrivacy').addEventListener('click',()=>closeModal('privacyModal'));
  $('agreePrivacy').addEventListener('click',()=>closeModal('privacyModal'));
  $('closeLogin').addEventListener('click',()=>closeModal('loginModal'));
  document.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>closeModal(el.dataset.close==='login'?'loginModal':'privacyModal')));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeModal('loginModal');closeModal('privacyModal');}
    if(e.altKey&&e.shiftKey&&e.key.toLowerCase()==='e'){
      e.preventDefault();
      if(!$('adminDashboard').hidden)return;
      $('adminPin').value='';clearError('loginError');openModal('loginModal');setTimeout(()=>$('adminPin').focus(),60);
    }
  });
  $('togglePin').addEventListener('click',()=>{const input=$('adminPin');input.type=input.type==='password'?'text':'password';});
  $('referralForm').addEventListener('submit',async e=>{
    e.preventDefault();clearError('submitError');
    const payload={
      aluno_nome: $('studentName').value.trim().replace(/\s+/g,' '),
      aluno_whatsapp: onlyDigits($('studentPhone').value),
      aluno_curso: $('studentCourse').value.trim(),
      aluno_rede_social: $('studentSocial').value.trim(),
      amigo_nome: $('friendName').value.trim().replace(/\s+/g,' '),
      amigo_whatsapp: onlyDigits($('friendPhone').value),
      amigo_curso: $('friendCourse').value,
      amigo_rede_social: $('friendSocial').value.trim(),
      origem: new URLSearchParams(location.search).get('origem') || 'qr',
      consentimento: $('consent').checked,
    };
    let valid=true;
    if(payload.aluno_nome.length<3){setError('studentName','Informe seu nome completo.');valid=false;}
    if(!validPhone(payload.aluno_whatsapp)){setError('studentPhone','Informe um WhatsApp válido com DDD.');valid=false;}
    if(payload.amigo_nome.length<3){setError('friendName','Informe o nome completo do amigo.');valid=false;}
    if(!validPhone(payload.amigo_whatsapp)){setError('friendPhone','Informe um WhatsApp válido com DDD.');valid=false;}
    if(!payload.amigo_curso){setError('friendCourse','Selecione o curso de interesse.');valid=false;}
    if(payload.aluno_whatsapp===payload.amigo_whatsapp){setError('friendPhone','Você não pode indicar seu próprio número.');valid=false;}
    if(!payload.consentimento){setError('consent','É necessário confirmar a autorização do indicado.');valid=false;}
    if(!valid){$('referralForm').querySelector('.is-invalid')?.focus();return;}
    $('submitBtn').disabled=true;$('submitText').textContent='Enviando indicação...';$('submitArrow').textContent='…';
    try{const r=await request('criar',{indicacao:payload},'');$('referralForm').hidden=true;$('successView').hidden=false;$('successRef').textContent=r.id?`Protocolo: ${r.id.slice(0,8).toUpperCase()}`:'';$('successView').scrollIntoView({behavior:'smooth',block:'center'});}
    catch(err){showError('submitError',err.message);}
    finally{$('submitBtn').disabled=false;$('submitText').textContent='Enviar indicação';$('submitArrow').textContent='→';}
  });
  $('newReferralBtn').addEventListener('click',()=>{$('referralForm').reset();$('referralForm').hidden=false;$('successView').hidden=true;clearError('submitError');['studentName','studentPhone','friendName','friendPhone','friendCourse','consent','studentSocial','friendSocial'].forEach(id=>setError(id,''));$('studentName').focus();});
  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();clearError('loginError');
    const pin=$('adminPin').value;
    const btn=$('loginBtn');btn.disabled=true;btn.textContent='Verificando acesso...';
    try{const r=await request('login',{senha:pin},'');state.token=r.token;sessionStorage.setItem('tc_admin_token',state.token);closeModal('loginModal');$('adminPin').value='';await loadDashboard();}
    catch(err){showError('loginError',err.message);}
    finally{btn.disabled=false;btn.innerHTML='Entrar no painel <span>→</span>';}
  });
  async function loadDashboard(){
    $('publicSite').hidden=true;$('adminDashboard').hidden=false;window.scrollTo(0,0);
    $('referralRows').innerHTML='<tr><td colspan="6" class="table-empty">Atualizando dados...</td></tr>';
    try{const result=await request('listar');state.entries=result.indicacoes||[];refreshTable();}
    catch(err){$('referralRows').innerHTML='';const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.className='table-empty';td.textContent=err.message;tr.appendChild(td);$('referralRows').appendChild(tr);toast(err.message,true);}
  }
  function signOut(showMessage=true){state.token='';state.entries=[];sessionStorage.removeItem('tc_admin_token');$('adminDashboard').hidden=true;$('publicSite').hidden=false;if(showMessage)toast('Você saiu da área administrativa.');}
  $('logoutBtn').addEventListener('click',()=>signOut());
  $('refreshBtn').addEventListener('click',()=>loadDashboard());
  $('overviewSide').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
  $('qrSide').addEventListener('click',()=>window.open(new URL('qr.html', location.href).href,'_blank','noopener,noreferrer'));
  $('searchInput').addEventListener('input',refreshTable);$('statusFilter').addEventListener('change',refreshTable);
  function refreshTable(){
    const all=state.entries,q=$('searchInput').value.toLocaleLowerCase('pt-BR').trim(),status=$('statusFilter').value;
    state.filtered=all.filter(r=>(status==='all'||r.status===status)&&(!q||[r.aluno_nome,r.aluno_whatsapp,r.amigo_nome,r.amigo_whatsapp,r.aluno_curso,r.amigo_curso,r.aluno_rede_social,r.amigo_rede_social].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q))));
    $('statTotal').textContent=all.length.toLocaleString('pt-BR');
    $('statEnrolled').textContent=all.filter(r=>r.status==='matriculado'||r.status==='pago').length.toLocaleString('pt-BR');
    $('statOwed').textContent=money(all.filter(r=>r.status==='matriculado').length*BONUS);
    $('statPaid').textContent=money(all.filter(r=>r.status==='pago').length*BONUS);
    $('filteredCount').textContent=state.filtered.length;
    $('tableSummary').textContent=`Mostrando ${state.filtered.length} de ${all.length} indicações`;
    const tbody=$('referralRows');tbody.replaceChildren();
    if(!state.filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.className='table-empty';td.textContent='Nenhuma indicação encontrada para este filtro.';tr.appendChild(td);tbody.appendChild(tr);return;}
    const frag=document.createDocumentFragment();state.filtered.forEach(r=>{
      const tr=document.createElement('tr');
      const date=document.createElement('td');date.textContent=fmtDate(r.criado_em);tr.appendChild(date);
      addPerson(tr,r.aluno_nome,r.aluno_whatsapp,r.aluno_rede_social);
      addPerson(tr,r.amigo_nome,r.amigo_whatsapp,r.amigo_rede_social);
      const course=document.createElement('td');course.textContent=r.amigo_curso;tr.appendChild(course);
      const scell=document.createElement('td'),wrapper=document.createElement('span'),sel=document.createElement('select');wrapper.className=`badge-status status-${r.status}`;sel.className='status-select';sel.setAttribute('aria-label',`Status da indicação ${r.amigo_nome}`);
      Object.keys(statuses).forEach(key=>{const opt=document.createElement('option');opt.value=key;opt.textContent=statuses[key];sel.appendChild(opt)});sel.value=r.status;
      sel.addEventListener('change',async ()=>{const prev=r.status,next=sel.value;sel.disabled=true;try{await request('atualizar',{id:r.id,status:next});r.status=next;refreshTable();toast(`Status alterado para ${statuses[next]}.`);}catch(err){sel.value=prev;toast(err.message,true);}finally{sel.disabled=false;}});
      wrapper.appendChild(sel);scell.appendChild(wrapper);tr.appendChild(scell);
      const bonus=document.createElement('td');bonus.className=r.status==='pago'||r.status==='matriculado'?'bonus-paid':'bonus-pending';bonus.textContent=['pago','matriculado'].includes(r.status)?money(BONUS):'—';tr.appendChild(bonus);frag.appendChild(tr);
    });tbody.appendChild(frag);
  }
  function addPerson(tr,name,phone,social){const td=document.createElement('td'),strong=document.createElement('span'),link=document.createElement('a');strong.className='table-name';strong.textContent=name;link.className='table-secondary';link.textContent=formatPhone(phone);link.href=`https://wa.me/55${onlyDigits(phone)}`;link.target='_blank';link.rel='noopener noreferrer';td.append(strong,link);if(social){const sm=document.createElement('span');sm.className='table-social';sm.textContent='@ '+social.replace(/^@/,'');td.appendChild(sm);}tr.appendChild(td);}
  // Prefixos potencialmente interpretados como fórmulas pelo Excel não podem ser exportados como fórmulas.
  const safeCell = value => { const s=String(value??'');return /^[\s]*[=+\-@\t\r]/.test(s)?`'${s}`:s; };
  const exportData=()=>state.filtered.map(r=>[
    fmtDate(r.criado_em),safeCell(r.aluno_nome),safeCell(formatPhone(r.aluno_whatsapp)),safeCell(r.aluno_curso),safeCell(r.amigo_nome),safeCell(formatPhone(r.amigo_whatsapp)),safeCell(r.amigo_curso),statuses[r.status]||r.status,
    ['matriculado','pago'].includes(r.status)?BONUS:0,r.status==='pago'?'Sim':'Não',safeCell(r.origem||''),r.id,safeCell(r.aluno_rede_social||''),safeCell(r.amigo_rede_social||'')
  ]);
  const columns=['Data','Aluno que indicou','WhatsApp do aluno','Curso do aluno','Amigo indicado','WhatsApp do amigo','Curso de interesse','Status','Bônus (R$)','Pago?','Origem','Identificador','Rede social de quem indicou','Rede social do amigo'];
  function makeFilename(ext){const now=new Date(),ds=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');return `Treinacamp_Indicacoes_${ds}.${ext}`;}
  $('exportXlsx').addEventListener('click',()=>{
    if(!window.XLSX){toast('Biblioteca Excel indisponível. Verifique sua conexão com a internet.',true);return;}
    const rows=exportData(),wb=XLSX.utils.book_new();
    const sheet=XLSX.utils.aoa_to_sheet([columns,...rows]);
    sheet['!cols']=[{wch:20},{wch:30},{wch:20},{wch:24},{wch:30},{wch:20},{wch:24},{wch:16},{wch:14},{wch:10},{wch:18},{wch:39},{wch:32},{wch:32}];
    sheet['!autofilter']={ref:sheet['!ref']};sheet['!freeze']={xSplit:0,ySplit:1};
    XLSX.utils.book_append_sheet(wb,sheet,'Indicações');
    const summary=[['TREINACAMP • AMIGO DA ONÇA'],['RELATÓRIO DE INDICAÇÕES'],['Gerado em',fmtDate(new Date().toISOString())],['Filtro de status',$('statusFilter').selectedOptions[0]?.textContent||'Todos'],['Indicações exportadas',rows.length],['Matriculados (filtro)',state.filtered.filter(r=>['matriculado','pago'].includes(r.status)).length],['Bônus a pagar (filtro)',state.filtered.filter(r=>r.status==='matriculado').length*BONUS],['Bônus pagos (filtro)',state.filtered.filter(r=>r.status==='pago').length*BONUS]];
    const s=XLSX.utils.aoa_to_sheet(summary);s['!cols']=[{wch:34},{wch:29}];XLSX.utils.book_append_sheet(wb,s,'Resumo');
    XLSX.writeFile(wb,makeFilename('xlsx'),{bookType:'xlsx'});toast(`Excel gerado com ${rows.length} indicação(ões).`);
  });
  $('exportPdf').addEventListener('click',()=>{
    if(!window.jspdf?.jsPDF){toast('Biblioteca PDF indisponível. Verifique sua conexão com a internet.',true);return;}
    const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),rows=exportData();
    doc.setFillColor(8,31,75);doc.rect(0,0,297,40,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('TREINACAMP  |  Amigo da Onça',14,17);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(`Relatório de indicações • ${fmtDate(new Date().toISOString())}`,14,26);
    doc.setTextColor(34,54,83);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text(`${rows.length} indicações  |  ${state.filtered.filter(r=>['pago','matriculado'].includes(r.status)).length} matrículas  |  ${money(state.filtered.filter(r=>r.status==='matriculado').length*BONUS)} a pagar`,14,49);
    if(typeof doc.autoTable==='function'){
      doc.autoTable({startY:55,head:[['Data','Quem indicou','WhatsApp','Amigo indicado','WhatsApp','Curso','Status','Bônus']],body:rows.map(r=>[r[0],r[1],r[2],r[4],r[5],r[6],r[7],money(r[8])]),theme:'grid',styles:{font:'helvetica',fontSize:7,cellPadding:2.5,overflow:'linebreak',textColor:[39,55,80]},headStyles:{fillColor:[13,47,98],fontStyle:'bold',textColor:255},alternateRowStyles:{fillColor:[248,250,253]},margin:{top:15,left:13,right:13,bottom:16},columnStyles:{0:{cellWidth:25},1:{cellWidth:44},2:{cellWidth:29},3:{cellWidth:44},4:{cellWidth:29},5:{cellWidth:38},6:{cellWidth:32},7:{cellWidth:24}},didDrawPage:data=>{const n=doc.internal.getNumberOfPages();doc.setTextColor(124,136,153);doc.setFontSize(8);doc.text(`Treinacamp • Uso interno   |   Página ${n}`,14,202);}});
    } else {doc.setFontSize(12);doc.text('O módulo de tabelas não foi carregado. Recarregue a página.',14,68);}
    doc.save(makeFilename('pdf'));toast(`PDF gerado com ${rows.length} indicação(ões).`);
  });
  // Ao atualizar a página, exige-se novo acesso caso a sessão tenha expirado.
  if(state.token)request('verificar',{},state.token).then(()=>loadDashboard()).catch(()=>{state.token='';sessionStorage.removeItem('tc_admin_token');});
})();
