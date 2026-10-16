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
  function bindPhone(id) {
    $(id)?.addEventListener('input', e => {
      e.target.value=formatPhone(e.target.value);
      setError(id,'');
    });
  }
  bindPhone('studentPhone');
  bindPhone('friendPhone');
  ['studentName','friendName','studentSocial'].forEach(id=>$(id)?.addEventListener('input',()=>setError(id,'')));
  $('consent').addEventListener('change',()=>setError('consent',''));
  const friends=[];
  let sending=false;

  document.documentElement.dataset.viewport=window.matchMedia('(max-width: 760px)').matches?'mobile':'desktop';
  window.addEventListener('resize',()=>{
    document.documentElement.dataset.viewport=window.matchMedia('(max-width: 760px)').matches?'mobile':'desktop';
  },{passive:true});
  $('year').textContent=String(new Date().getFullYear());

  function openModal(id){$(id).hidden=false;document.body.style.overflow='hidden';}
  function closeModal(id){$(id).hidden=true;document.body.style.overflow='';}
  $('privacyLink').addEventListener('click',e=>{e.preventDefault();openModal('privacyModal');});
  $('privacyFooter').addEventListener('click',()=>openModal('privacyModal'));
  $('closePrivacy').addEventListener('click',()=>closeModal('privacyModal'));
  $('agreePrivacy').addEventListener('click',()=>closeModal('privacyModal'));
  $('closeLogin').addEventListener('click',()=>closeModal('loginModal'));
  document.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>{
    closeModal(el.dataset.close==='login'?'loginModal':'privacyModal');
  }));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      closeModal('loginModal');
      closeModal('privacyModal');
    }
    if(e.altKey&&e.shiftKey&&e.key.toLowerCase()==='e'){
      e.preventDefault();
      if(!$('adminDashboard').hidden)return;
      $('adminPin').value='';clearError('loginError');openModal('loginModal');setTimeout(()=>$('adminPin').focus(),60);
    }
  });
  $('togglePin').addEventListener('click',()=>{
    const input=$('adminPin');input.type=input.type==='password'?'text':'password';
  });

  function renderFriends(){
    const n=friends.length,remaining=Math.max(0,10-n);
    $('friendsCount').textContent=`${n} / 10`;
    $('progressStatus').textContent=remaining?`Faltam ${remaining}`:'Pronto para enviar!';
    $('progressStatus').classList.toggle('complete',!remaining);
    $('friendsProgress').setAttribute('aria-valuenow',String(Math.min(n,10)));
    $('friendsProgressBar').style.width=`${Math.min(100,n*10)}%`;
    $('friendsHint').textContent=remaining
      ?`Faltam ${remaining} ${remaining===1?'amigo':'amigos'} para atingir o mínimo de 10 indicações.`
      :`Você já adicionou ${n} ${n===1?'pessoa':'pessoas'} e pode enviar ou continuar adicionando.`;
    $('friendsEmpty').hidden=n>0;
    const grid=$('friendsGrid');grid.replaceChildren();
    friends.forEach((friend,index)=>{
      const card=document.createElement('article');
      card.className='friend-card';card.setAttribute('role','listitem');
      const number=document.createElement('span');number.className='friend-card-number';number.textContent=String(index+1).padStart(2,'0');
      const info=document.createElement('div');info.className='friend-card-info';
      const name=document.createElement('strong');name.textContent=friend.nome;
      const phone=document.createElement('span');phone.textContent=formatPhone(friend.whatsapp);
      info.append(name,phone);
      const remove=document.createElement('button');remove.type='button';remove.className='friend-remove';
      remove.textContent='×';remove.title='Remover indicação';
      remove.setAttribute('aria-label',`Remover ${friend.nome} da lista`);
      remove.disabled=sending;
      remove.addEventListener('click',()=>{friends.splice(index,1);renderFriends();});
      card.append(number,info,remove);
      grid.appendChild(card);
    });
  }

  function validateFriend(){
    const name=$('friendName').value.trim().replace(/\s+/g,' ');
    const phone=onlyDigits($('friendPhone').value);
    let valid=true;
    if(name.length<3){setError('friendName','Informe o nome completo da pessoa.');valid=false;}
    if(!phone){setError('friendPhone','O WhatsApp é obrigatório.');valid=false;}
    else if(!validPhone(phone)){setError('friendPhone','Informe um WhatsApp válido com DDD.');valid=false;}
    else if(phone===onlyDigits($('studentPhone').value)){setError('friendPhone','Você não pode indicar seu próprio WhatsApp.');valid=false;}
    else if(friends.some(f=>f.whatsapp===phone)){setError('friendPhone','Este WhatsApp já está na sua lista.');valid=false;}
    return valid?{nome:name,whatsapp:phone}:null;
  }

  function addFriend(){
    if(sending)return;
    clearError('submitError');
    const friend=validateFriend();
    if(!friend){($('referralForm').querySelector('.is-invalid')||$('friendName')).focus();return;}
    friends.push(friend);
    $('friendName').value='';$('friendPhone').value='';
    setError('friendName','');setError('friendPhone','');
    renderFriends();$('friendName').focus();
    if(friends.length===10)toast('Você chegou às 10 indicações mínimas! Pode enviar ou continuar adicionando.');
  }
  $('addFriendBtn').addEventListener('click',addFriend);
  ['friendName','friendPhone'].forEach(id=>$(id).addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.isComposing){e.preventDefault();addFriend();}
  }));
  renderFriends();

  function launchConfetti(){
    const stage=$('confettiStage');stage.replaceChildren();
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const colors=['#e32336','#173b73','#ffca55','#75bfd1','#fff'];
    for(let i=0;i<75;i++){
      const item=document.createElement('i');item.className='confetti-piece';
      item.style.setProperty('--x',`${Math.round(Math.random()*100)}%`);
      item.style.setProperty('--delay',`${(Math.random()*2.3).toFixed(2)}s`);
      item.style.setProperty('--duration',`${(2.8+Math.random()*2).toFixed(2)}s`);
      item.style.setProperty('--rotation',`${Math.round(Math.random()*720)}deg`);
      item.style.backgroundColor=colors[i%colors.length];
      stage.appendChild(item);
    }
  }
  $('referralForm').addEventListener('submit',async e=>{
    e.preventDefault();if(sending)return;
    clearError('submitError');
    // O mínimo de 10 deve ser comunicado mesmo se houver um rascunho incompleto.
    if(friends.length<10){
      if($('friendName').value.trim()||$('friendPhone').value.trim())validateFriend();
      showError('submitError',`É necessário cadastrar no mínimo 10 pessoas. Você adicionou ${friends.length}; faltam ${10-friends.length}.`);
      $('submitError').scrollIntoView({behavior:'smooth',block:'center'});return;
    }
    // Um contato começado não deve ser descartado sem aviso.
    if($('friendName').value.trim()||$('friendPhone').value.trim()){
      const entry=validateFriend();
      if(entry)showError('submitError','Você começou outra indicação. Clique em "Indicar amigo" para incluí-la na lista antes do envio.');
      else showError('submitError','Complete o nome e o WhatsApp da indicação que está preenchendo.');
      return;
    }
    const aluno={
      nome:$('studentName').value.trim().replace(/\s+/g,' '),
      whatsapp:onlyDigits($('studentPhone').value),
      rede_social:$('studentSocial').value.trim()
    };
    let valid=true;
    if(aluno.nome.length<3){setError('studentName','Informe seu nome completo.');valid=false;}
    if(!validPhone(aluno.whatsapp)){setError('studentPhone','Informe um WhatsApp válido com DDD.');valid=false;}
    if(friends.some(f=>f.whatsapp===aluno.whatsapp)){
      setError('studentPhone','Seu WhatsApp não pode estar entre as pessoas indicadas.');valid=false;
    }
    if(!$('consent').checked){setError('consent','Confirme que todos os indicados autorizaram o contato.');valid=false;}
    if(!valid){$('referralForm').querySelector('.is-invalid')?.focus();return;}
    sending=true;
    $('submitBtn').disabled=true;$('addFriendBtn').disabled=true;
    $('submitText').textContent=`Enviando ${friends.length} indicações...`;
    $('submitArrow').textContent='…';
    renderFriends();
    try{
      const result=await request('criar_lote',{
        aluno,amigos:friends,
        consentimento:true,
        origem:new URLSearchParams(location.search).get('origem')||'formulario'
      },'');
      const quantity=Number(result.quantidade);
      if(!result.ok||quantity!==friends.length)throw new Error('O servidor não confirmou todas as indicações. Contate a escola antes de tentar novamente.');
      $('celebrationName').textContent=aluno.nome.split(' ')[0];
      $('celebrationMessage').textContent=`Você indicou ${quantity} ${quantity===1?'pessoa':'pessoas'} e recebemos todas as suas indicações!`;
      launchConfetti();openModal('successModal');
    }catch(err){showError('submitError',err.message);$('submitError').scrollIntoView({behavior:'smooth',block:'center'});}
    finally{
      sending=false;$('submitBtn').disabled=false;$('addFriendBtn').disabled=false;
      $('submitText').textContent='Enviar indicação';$('submitArrow').textContent='→';
      renderFriends();
    }
  });
  $('newReferralBtn').addEventListener('click',()=>{
    closeModal('successModal');
    $('referralForm').reset();friends.splice(0);renderFriends();
    clearError('submitError');
    ['studentName','studentPhone','friendName','friendPhone','consent','studentSocial'].forEach(id=>setError(id,''));
    document.getElementById('formulario').scrollIntoView({behavior:'smooth',block:'start'});
    $('studentName').focus({preventScroll:true});
  });
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
      const course=document.createElement('td');course.textContent=({'qr':'QR Code','cartaz-qr':'QR Code','formulario':'Formulário'}[r.origem]||r.origem||'Formulário');tr.appendChild(course);
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
    fmtDate(r.criado_em),safeCell(r.aluno_nome),safeCell(formatPhone(r.aluno_whatsapp)),
    safeCell(r.aluno_rede_social||''),safeCell(r.amigo_nome),
    safeCell(formatPhone(r.amigo_whatsapp)),statuses[r.status]||r.status,
    ['matriculado','pago'].includes(r.status)?BONUS:0,
    r.status==='pago'?'Sim':'Não',safeCell(r.origem||''),r.id
  ]);
  const columns=['Data','Aluno que indicou','WhatsApp do aluno','Rede social do aluno','Amigo indicado','WhatsApp do amigo','Status','Bônus (R$)','Pago?','Origem','Identificador'];
  function makeFilename(ext){const now=new Date(),ds=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');return `Treinacamp_Indicacoes_${ds}.${ext}`;}
  $('exportXlsx').addEventListener('click',()=>{
    if(!window.XLSX){toast('Biblioteca Excel indisponível. Verifique sua conexão com a internet.',true);return;}
    const rows=exportData(),wb=XLSX.utils.book_new();
    const sheet=XLSX.utils.aoa_to_sheet([columns,...rows]);
    sheet['!cols']=[{wch:20},{wch:30},{wch:20},{wch:30},{wch:30},{wch:20},{wch:16},{wch:14},{wch:10},{wch:20},{wch:39}];
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
      doc.autoTable({startY:55,head:[['Data','Aluno / Rede social','WhatsApp','Amigo indicado','WhatsApp','Status','Bônus']],body:rows.map(r=>[r[0],r[1]+(r[3]?'\n'+r[3]:''),r[2],r[4],r[5],r[6],money(r[7])]),theme:'grid',styles:{font:'helvetica',fontSize:7,cellPadding:2.5,overflow:'linebreak',textColor:[39,55,80]},headStyles:{fillColor:[13,47,98],fontStyle:'bold',textColor:255},alternateRowStyles:{fillColor:[248,250,253]},margin:{top:15,left:13,right:13,bottom:16},columnStyles:{0:{cellWidth:26},1:{cellWidth:57},2:{cellWidth:31},3:{cellWidth:58},4:{cellWidth:31},5:{cellWidth:37},6:{cellWidth:28}},didDrawPage:data=>{const n=doc.internal.getNumberOfPages();doc.setTextColor(124,136,153);doc.setFontSize(8);doc.text(`Treinacamp • Uso interno   |   Página ${n}`,14,202);}});
    } else {doc.setFontSize(12);doc.text('O módulo de tabelas não foi carregado. Recarregue a página.',14,68);}
    doc.save(makeFilename('pdf'));toast(`PDF gerado com ${rows.length} indicação(ões).`);
  });
  // Ao atualizar a página, exige-se novo acesso caso a sessão tenha expirado.
  if(state.token)request('verificar',{},state.token).then(()=>loadDashboard()).catch(()=>{state.token='';sessionStorage.removeItem('tc_admin_token');});
})();
