(() => {
  'use strict';
  const config = window.TREINACAMP_CONFIG || {};
  const ENDPOINT = config.SUPABASE_URL ? `${String(config.SUPABASE_URL).replace(/\/$/, '')}/functions/v1/indicacoes` : '';
  const BONUS = Number(config.BONUS_POR_MATRICULA) || 50;
  const $ = id => document.getElementById(id);
  const statuses = { pendente:'Pendente', matriculado:'Matriculado', pago:'Pago', cancelado:'Cancelado' };
  const state = { entries: [], filtered: [], token: sessionStorage.getItem('tc_admin_token') || '', ready: true, groups:[], visibleGroups:[], expanded:new Set() };
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
  bindPhone('consultPhone');
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

  let consulting=false;
  function resetConsult(){
    $('consultForm').reset();
    $('consultResult').hidden=true;
    clearError('consultError');
    setError('consultName','');
    setError('consultPhone','');
  }
  function openConsult(){
    resetConsult();
    openModal('consultModal');
    $('consultName').focus();
  }
  function closeConsult(){
    if(consulting)return;
    closeModal('consultModal');
    $('openConsult').focus();
  }
  $('openConsult').addEventListener('click',openConsult);
  $('closeConsult').addEventListener('click',closeConsult);
  $('consultBackdrop').addEventListener('click',closeConsult);
  ['consultName','consultPhone'].forEach(id=>$(id).addEventListener('input',()=>{
    setError(id,'');
    $('consultResult').hidden=true;
    clearError('consultError');
  }));
  $('consultForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(consulting)return;
    clearError('consultError');
    $('consultResult').hidden=true;
    // Não normalizar caixa, acentuação ou espaços internos: o nome deve ser exatamente igual ao cadastro.
    const nome=$('consultName').value.trim();
    const whatsapp=onlyDigits($('consultPhone').value);
    let valid=true;
    if(nome.length<3){setError('consultName','Informe o nome completo usado no cadastro.');valid=false;}
    if(!validPhone(whatsapp)){setError('consultPhone','Informe o WhatsApp com DDD utilizado no cadastro.');valid=false;}
    if(!valid){$('consultForm').querySelector('.is-invalid')?.focus();return;}
    consulting=true;
    $('consultSubmit').disabled=true;
    $('consultSubmitText').textContent='Consultando...';
    try{
      const result=await request('consultar_indicacoes',{nome,whatsapp},'');
      if(!result.ok)throw new Error('Não foi possível confirmar a consulta.');
      if(!result.encontrado){
        showError('consultError','Cadastro não localizado. Confira se o nome está exatamente igual ao informado no cadastro (inclusive acentos, letras maiúsculas e espaços) e se o WhatsApp é o mesmo.');
        return;
      }
      const count=Number(result.quantidade);
      if(!Number.isInteger(count)||count<0)throw new Error('O servidor retornou um total inválido.');
      $('consultCount').textContent=count.toLocaleString('pt-BR');
      $('consultResultLabel').textContent=count===1?'INDICAÇÃO CADASTRADA':'INDICAÇÕES CADASTRADAS';
      const faltam=Math.max(0,10-count);
      $('consultResultMessage').textContent=count>=10
        ?'Você já completou o mínimo de 10 indicações acumuladas para validar sua participação!'
        :'Você tem '+count+(count===1?' amigo indicado.':' amigos indicados.')+' Continue cadastrando para atingir 10.';
      $('consultProgress').setAttribute('aria-valuenow',String(Math.min(count,10)));
      $('consultProgressBar').style.width=Math.min(count*10,100)+'%';
      $('consultStatus').textContent=count>=10
        ?'Meta de indicações atingida. O prêmio de R$ 50 depende da matrícula de cada amigo e das regras da campanha.'
        :'Faltam '+faltam+(faltam===1?' indicação':' indicações')+' para validar sua participação na campanha.';
      $('consultResult').classList.toggle('complete',count>=10);
      $('consultResult').hidden=false;
    }catch(err){
      showError('consultError',err.message);
    }finally{
      consulting=false;
      $('consultSubmit').disabled=false;
      $('consultSubmitText').textContent='Consultar minhas indicações';
    }
  });

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      closeModal('loginModal');
      closeModal('privacyModal');
      if(!$('consultModal').hidden)closeConsult();
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
    $('friendsCount').textContent=n+' neste envio';
    $('progressStatus').textContent=n>0?'Pode enviar':'Adicione um amigo';
    $('progressStatus').classList.toggle('complete',n>0);
    $('friendsProgress').setAttribute('aria-valuenow',String(Math.min(n,10)));
    $('friendsProgressBar').style.width=`${Math.min(100,n*10)}%`;
    $('friendsHint').textContent=n===0?'Adicione ao menos um contato. Envie quantas vezes quiser; a validação acontece ao somar 10 indicações.':n<10?'Você pode enviar estas '+n+' indicação(ões) agora. A participação será validada após totalizar 10 indicações acumuladas.':'Você já adicionou '+n+' pessoas neste envio. Pode enviar ou continuar indicando.';
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
    if(friends.length===10)toast('Você adicionou 10 amigos neste envio! Os contatos enviados serão somados aos anteriores.');
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
    if(friends.length<1){
      if($('friendName').value.trim()||$('friendPhone').value.trim())validateFriend();
      showError('submitError','Adicione pelo menos uma pessoa pelo botão “Indicar amigo” antes de enviar.');
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
    if(aluno.nome.split(' ').filter(Boolean).length<2){setError('studentName','Informe seu nome e sobrenome completos, sem abreviar.');valid=false;}
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
      const total=Number(result.total_acumulado||quantity);
      $('celebrationMessage').textContent='Recebemos '+quantity+' nova(s) indicação(ões)! Você agora tem '+total+' indicação(ões) acumulada(s). '+(total>=10?'Sua participação atingiu as 10 necessárias para validação!':'Faltam '+(10-total)+' para validar sua participação.');
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
    friends.splice(0);$('friendName').value='';$('friendPhone').value='';$('consent').checked=false;renderFriends();
    clearError('submitError');
    ['studentName','studentPhone','friendName','friendPhone','consent','studentSocial'].forEach(id=>setError(id,''));
    document.getElementById('formulario').scrollIntoView({behavior:'smooth',block:'start'});
    $('friendName').focus({preventScroll:true});
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
  $('searchInput').addEventListener('input',refreshTable);$('statusFilter').addEventListener('change',refreshTable);

  const nameKey=name=>String(name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
  const studentKey=row=>nameKey(row.aluno_nome)+'|'+onlyDigits(row.aluno_whatsapp);
  const escapeReport=value=>{const text=String(value??'');return /^[\s]*[=+\-@\t\r]/.test(text)?"'"+text:text;};
  const groupData=()=>{
    const map=new Map();
    state.entries.forEach(row=>{
      const key=studentKey(row);
      if(!map.has(key))map.set(key,{key,nome:row.aluno_nome,whatsapp:onlyDigits(row.aluno_whatsapp),social:row.aluno_rede_social||'',items:[]});
      const g=map.get(key);
      if(!g.social&&row.aluno_rede_social)g.social=row.aluno_rede_social;
      g.items.push(row);
    });
    return [...map.values()];
  };
  const isEligible=g=>g.items.length>=10;
  const enrolledCount=g=>g.items.filter(r=>r.status==='matriculado'||r.status==='pago').length;
  const owedCount=g=>isEligible(g)?g.items.filter(r=>r.status==='matriculado').length:0;
  const paidCount=g=>g.items.filter(r=>r.status==='pago').length;
  const participantStatus=g=>isEligible(g)?'Validado':'Faltam '+(10-g.items.length);
  function cell(textValue,className){
    const td=document.createElement('td');td.textContent=String(textValue??'');
    if(className)td.className=className;
    return td;
  }
  function button(label,className,handler){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.className=className;b.addEventListener('click',handler);return b;
  }
  let deletionRequest=null;
  function askDeletion(kind,group,friend){
    const isSingle=kind==='indicacao';
    const description=isSingle
      ?'Excluir somente a indicação de '+friend.amigo_nome+' ('+formatPhone(friend.amigo_whatsapp)+')? O total de '+group.nome+' será recalculado e a exclusão não poderá ser desfeita.'
      :'Excluir '+group.nome+' e TODAS as suas '+group.items.length+' indicações? Os nomes, telefones e registros de matrícula e pagamento vinculados serão apagados definitivamente.';
    deletionRequest=isSingle?{kind,id:friend.id,key:group.key}:{kind,nome:group.nome,whatsapp:group.whatsapp,key:group.key};
    $('deleteDescription').textContent=description;
    $('confirmDelete').disabled=false;
    $('confirmDelete').textContent=isSingle?'Excluir indicação':'Excluir aluno e todos os indicados';
    openModal('deleteModal');
    $('cancelDelete').focus();
  }
  function cancelDeletion(){deletionRequest=null;closeModal('deleteModal');}
  $('cancelDelete').addEventListener('click',cancelDeletion);
  $('deleteBackdrop').addEventListener('click',cancelDeletion);
  $('confirmDelete').addEventListener('click',async()=>{
    if(!deletionRequest)return;
    const target=deletionRequest,btn=$('confirmDelete');
    btn.disabled=true;btn.textContent='Excluindo...';
    try{
      const result=await request(target.kind==='indicacao'?'excluir_indicacao':'excluir_aluno',
        target.kind==='indicacao'?{id:target.id}:{nome:target.nome,whatsapp:target.whatsapp});
      if(!result.ok)throw new Error('A exclusão não foi confirmada.');
      if(target.kind==='aluno')state.expanded.delete(target.key);
      cancelDeletion();btn.disabled=false;
      const updated=await request('listar');
      state.entries=updated.indicacoes||[];
      refreshTable();
      toast(result.excluidas+' registro(s) excluído(s) com sucesso.');
    }catch(err){toast(err.message,true);btn.disabled=false;btn.textContent='Tentar excluir novamente';}
  });
  function renderDetailRow(group){
    const row=document.createElement('tr');row.className='group-expanded-row';
    const td=document.createElement('td');td.colSpan=6;
    const wrapper=document.createElement('div');wrapper.className='group-expanded-panel';
    const intro=document.createElement('p');intro.className='group-detail-note';
    intro.textContent='Indicações de '+group.nome+' — '+group.items.length+' pessoa(s) cadastrada(s). Status e exclusões são individuais.';
    wrapper.appendChild(intro);
    const scroll=document.createElement('div');scroll.className='group-detail-scroll';
    const table=document.createElement('table');table.className='group-detail-table';
    const header=document.createElement('thead');const tr=document.createElement('tr');
    ['DATA','INDICADO / WHATSAPP','SITUAÇÃO','PRÊMIO','AÇÃO'].forEach(title=>{const th=document.createElement('th');th.textContent=title;tr.appendChild(th);});
    header.appendChild(tr);table.appendChild(header);
    const tbody=document.createElement('tbody');
    group.items.forEach(item=>{
      const r=document.createElement('tr');
      r.appendChild(cell(fmtDate(item.criado_em)));
      addPerson(r,item.amigo_nome,item.amigo_whatsapp,item.amigo_rede_social);
      const statusTd=document.createElement('td'),select=document.createElement('select');
      select.className='status-select group-status';
      select.setAttribute('aria-label','Status de '+item.amigo_nome);
      for(const [key,title] of Object.entries(statuses)){
        const opt=document.createElement('option');opt.value=key;opt.textContent=title;
        if(key==='pago'&&!isEligible(group)&&item.status!=='pago'){opt.disabled=true;opt.title='Requer 10 indicações cumulativas';}
        select.appendChild(opt);
      }
      select.value=item.status;
      select.addEventListener('change',async()=>{
        const previous=item.status;
        select.disabled=true;
        try{
          await request('atualizar',{id:item.id,status:select.value});
          item.status=select.value;
          refreshTable();
          toast('Status atualizado para '+statuses[item.status]+'.');
        }catch(err){select.value=previous;toast(err.message,true);}
        finally{select.disabled=false;}
      });
      statusTd.appendChild(select);r.appendChild(statusTd);
      const prize=item.status==='pago'?money(BONUS)+' pago'
        :item.status==='matriculado'?(isEligible(group)?money(BONUS)+' a pagar':'Aguardando 10'):'—';
      r.appendChild(cell(prize,'group-prize'));
      const actions=document.createElement('td');
      actions.appendChild(button('Excluir','btn-delete-item',()=>askDeletion('indicacao',group,item)));
      r.appendChild(actions);tbody.appendChild(r);
    });
    table.appendChild(tbody);scroll.appendChild(table);wrapper.appendChild(scroll);
    td.appendChild(wrapper);row.appendChild(td);return row;
  }
  function refreshTable(){
    const all=state.entries;
    const query=$('searchInput').value.toLocaleLowerCase('pt-BR').trim();
    const status=$('statusFilter').value;
    state.groups=groupData();
    state.filtered=all.filter(r=>(status==='all'||r.status===status) &&
      (!query||[r.aluno_nome,r.aluno_whatsapp,r.aluno_rede_social,
        r.amigo_nome,r.amigo_whatsapp].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(query))));
    const visibleIds=new Set(state.filtered.map(r=>r.id));
    state.visibleGroups=state.groups.filter(g=>g.items.some(r=>visibleIds.has(r.id)));
    $('statParticipants').textContent=state.groups.length.toLocaleString('pt-BR');
    $('statEligible').textContent=state.groups.filter(isEligible).length.toLocaleString('pt-BR');
    $('statTotal').textContent=all.length.toLocaleString('pt-BR');
    $('statEnrolled').textContent=all.filter(r=>r.status==='matriculado'||r.status==='pago').length.toLocaleString('pt-BR');
    $('statOwed').textContent=money(state.groups.reduce((sum,g)=>sum+owedCount(g),0)*BONUS);
    $('statPaid').textContent=money(all.filter(r=>r.status==='pago').length*BONUS);
    $('filteredCount').textContent=state.visibleGroups.length;
    $('tableSummary').textContent='Mostrando '+state.visibleGroups.length+' de '+state.groups.length+' participantes ('+state.filtered.length+' indicações nos filtros)';
    const tbody=$('referralRows');tbody.replaceChildren();
    if(!state.visibleGroups.length){
      const tr=document.createElement('tr');const td=cell('Nenhum participante encontrado para os filtros.','table-empty');
      td.colSpan=6;tr.appendChild(td);tbody.appendChild(tr);return;
    }
    const frag=document.createDocumentFragment();
    state.visibleGroups.forEach(group=>{
      const tr=document.createElement('tr');tr.className='group-main-row';
      const person=document.createElement('td');
      const strong=document.createElement('strong');strong.className='table-name';strong.textContent=group.nome;
      const phone=document.createElement('a');phone.className='table-secondary';
      phone.textContent=formatPhone(group.whatsapp);phone.href='https://wa.me/55'+group.whatsapp;
      phone.target='_blank';phone.rel='noopener noreferrer';
      person.append(strong,phone);
      if(group.social){const social=document.createElement('span');social.className='table-social';social.textContent=group.social;person.appendChild(social);}
      tr.appendChild(person);
      const qty=document.createElement('td');const qtyNumber=document.createElement('strong');qtyNumber.className='group-count';
      qtyNumber.textContent=String(group.items.length);qty.appendChild(qtyNumber);
      qty.appendChild(document.createTextNode(' pessoa(s)'));tr.appendChild(qty);
      const eligibleCell=document.createElement('td');
      const badge=document.createElement('span');badge.className='validation-badge '+(isEligible(group)?'eligible':'incomplete');
      badge.textContent=participantStatus(group);eligibleCell.appendChild(badge);tr.appendChild(eligibleCell);
      tr.appendChild(cell(enrolledCount(group)+' matrícula(s)'));
      const amounts=document.createElement('td');amounts.className='summary-prizes';
      const toPay=document.createElement('span');toPay.textContent=money(owedCount(group)*BONUS)+' a pagar';
      const alreadyPaid=document.createElement('small');alreadyPaid.textContent=money(paidCount(group)*BONUS)+' pago';
      amounts.append(toPay,alreadyPaid);tr.appendChild(amounts);
      const actions=document.createElement('td');actions.className='group-actions';
      const expanded=state.expanded.has(group.key);
      const expand=button(expanded?'Ocultar nomes ↑':'Listar nomes ↓','btn-expand',()=>{
        state.expanded.has(group.key)?state.expanded.delete(group.key):state.expanded.add(group.key);refreshTable();
      });
      expand.setAttribute('aria-expanded',String(expanded));
      expand.setAttribute('aria-label',(expanded?'Ocultar':'Listar')+' indicados de '+group.nome);
      const remove=button('Excluir aluno','btn-delete-group',()=>askDeletion('aluno',group));
      actions.append(expand,remove);tr.appendChild(actions);
      frag.appendChild(tr);
      if(expanded)frag.appendChild(renderDetailRow(group));
    });
    tbody.appendChild(frag);
  }
  function addPerson(tr,name,phone,social){
    const td=document.createElement('td'),strong=document.createElement('span'),link=document.createElement('a');
    strong.className='table-name';strong.textContent=name;
    link.className='table-secondary';link.textContent=formatPhone(phone);
    link.href='https://wa.me/55'+onlyDigits(phone);link.target='_blank';link.rel='noopener noreferrer';
    td.append(strong,link);
    if(social){const sm=document.createElement('span');sm.className='table-social';sm.textContent=social;td.appendChild(sm);}
    tr.appendChild(td);
  }

  const simpleReport=()=>state.visibleGroups.map(g=>[
    escapeReport(g.nome),escapeReport(formatPhone(g.whatsapp)),escapeReport(g.social),
    g.items.length,isEligible(g)?'Validado':participantStatus(g),
    enrolledCount(g),owedCount(g)*BONUS,paidCount(g)*BONUS
  ]);
  const detailedReport=()=>state.filtered.map(r=>{
    const g=state.groups.find(g=>g.key===studentKey(r));
    return [fmtDate(r.criado_em),escapeReport(r.aluno_nome),escapeReport(formatPhone(r.aluno_whatsapp)),
      escapeReport(r.aluno_rede_social),escapeReport(r.amigo_nome),escapeReport(formatPhone(r.amigo_whatsapp)),
      statuses[r.status]||r.status,g&&isEligible(g)?'Validado':'Aguardando 10',
      r.status==='pago'?'Pago':r.status==='matriculado'&&g&&isEligible(g)?'A pagar':'Não elegível',
      escapeReport(r.origem),r.id];
  });
  const reportSpec=()=>{
    const simple=$('exportMode').value==='simples';
    return simple
      ?{simple,rows:simpleReport(),columns:['Aluno','WhatsApp','Rede social','Total indicado','Validação','Matrículas','R$ a pagar','R$ já pago'],label:'Resumo por aluno'}
      :{simple,rows:detailedReport(),columns:['Data','Aluno','WhatsApp aluno','Rede social','Indicado','WhatsApp indicado','Status','Validação','Situação bônus','Origem','ID'],label:'Indicações detalhadas'};
  };
  function reportFilename(ext,kind){
    const now=new Date();const date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    return 'Treinacamp_Indicacoes_'+kind+'_'+date+'.'+ext;
  }
  $('exportXlsx').addEventListener('click',()=>{
    if(!window.XLSX){toast('Biblioteca Excel indisponível. Verifique sua conexão.',true);return;}
    const rpt=reportSpec(),wb=XLSX.utils.book_new();
    const sheet=XLSX.utils.aoa_to_sheet([rpt.columns,...rpt.rows]);
    sheet['!cols']=rpt.columns.map((header,i)=>({wch:Math.max(16,Math.min(i===0||i===1?34:28,header.length+11))}));
    sheet['!autofilter']={ref:sheet['!ref']};
    XLSX.utils.book_append_sheet(wb,sheet,rpt.simple?'Por aluno':'Por indicação');
    const summary=XLSX.utils.aoa_to_sheet([
      ['TREINACAMP — AMIGO DA ONÇA'],['Tipo',rpt.label],
      ['Gerado em',fmtDate(new Date().toISOString())],
      ['Alunos no relatório',state.visibleGroups.length],
      ['Indicações conforme filtros',state.filtered.length],
      ['Alunos validados no filtro',state.visibleGroups.filter(isEligible).length],
      ['Regra','10 indicações acumuladas pelo mesmo nome completo e WhatsApp']
    ]);
    summary['!cols']=[{wch:33},{wch:58}];
    XLSX.utils.book_append_sheet(wb,summary,'Resumo');
    XLSX.writeFile(wb,reportFilename('xlsx',rpt.simple?'Simples':'Detalhado'),{bookType:'xlsx'});
    toast('Excel '+rpt.label.toLowerCase()+' gerado com '+rpt.rows.length+' linha(s).');
  });
  $('exportPdf').addEventListener('click',()=>{
    if(!window.jspdf?.jsPDF){toast('Biblioteca PDF indisponível. Verifique sua conexão.',true);return;}
    const rpt=reportSpec(),jsPDF=window.jspdf.jsPDF,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    doc.setFillColor(8,31,75);doc.rect(0,0,297,39,'F');
    doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(18);
    doc.text('TREINACAMP | Amigo da Onça',13,17);
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(rpt.label+' — '+fmtDate(new Date().toISOString()),13,26);
    doc.setTextColor(38,55,82);doc.setFontSize(9);
    doc.text(state.visibleGroups.length+' alunos • '+state.filtered.length+' indicações nos filtros • '+state.visibleGroups.filter(isEligible).length+' participantes validados',13,47);
    if(typeof doc.autoTable==='function'){
      let head,body,widths;
      if(rpt.simple){
        head=[['Aluno','WhatsApp','Total','Validação','Matrículas','A pagar','Pago']];
        body=rpt.rows.map(row=>[row[0],row[1],String(row[3]),row[4],String(row[5]),money(row[6]),money(row[7])]);
        widths={0:{cellWidth:67},1:{cellWidth:39},2:{cellWidth:25},3:{cellWidth:35},4:{cellWidth:30},5:{cellWidth:35},6:{cellWidth:35}};
      }else{
        head=[['Data','Aluno','WhatsApp','Indicado','WhatsApp','Status','Validação']];
        body=rpt.rows.map(row=>[row[0],row[1],row[2],row[4],row[5],row[6],row[7]]);
        widths={0:{cellWidth:30},1:{cellWidth:60},2:{cellWidth:32},3:{cellWidth:60},4:{cellWidth:32},5:{cellWidth:28},6:{cellWidth:28}};
      }
      doc.autoTable({startY:54,head,body,theme:'grid',
        styles:{font:'helvetica',fontSize:7,cellPadding:3,overflow:'linebreak',textColor:[31,55,87]},
        headStyles:{fillColor:[13,47,98],textColor:255},alternateRowStyles:{fillColor:[246,249,253]},
        columnStyles:widths,margin:{left:13,right:13,bottom:17},didDrawPage:()=>{
          const n=doc.internal.getCurrentPageInfo().pageNumber;
          doc.setFontSize(8);doc.setTextColor(128,137,154);
          doc.text('Treinacamp • Uso interno • Página '+n,13,202);
        }});
    }else{doc.text('A biblioteca de tabelas não está disponível. Recarregue a página.',13,64);}
    doc.save(reportFilename('pdf',rpt.simple?'Simples':'Detalhado'));
    toast('PDF '+rpt.label.toLowerCase()+' gerado.');
  });
  // Ao atualizar a página, exige-se novo acesso caso a sessão tenha expirado.
  if(state.token)request('verificar',{},state.token).then(()=>loadDashboard()).catch(()=>{state.token='';sessionStorage.removeItem('tc_admin_token');});
})();
