import { createClient } from 'npm:@supabase/supabase-js@2';

// Função de backend privada. NÃO colocar ADMIN_PIN ou SERVICE_ROLE_KEY no site estático.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ||
  'https://orisee1.github.io,http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:8080,http://localhost:8080')
  .split(',').map(s => s.trim()).filter(Boolean);
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const encoder = new TextEncoder();

const digits = (v: unknown): string => String(v ?? '').replace(/\D/g, '');
const text = (v: unknown, max: number): string => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0,max);
const validPhone = (s: string): boolean => /^[1-9][1-9][0-9]{8,9}$/.test(s);
function cors(origin: string | null): HeadersInit {return {
  'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Vary': 'Origin', 'Cache-Control': 'no-store',
};}
function reply(body: unknown,status=200,origin: string | null=null): Response {
  return new Response(JSON.stringify(body),{status,headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8'}});
}
function url64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function un64(b64: string): Uint8Array {
  const s=atob(b64.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-b64.length%4)%4));
  return Uint8Array.from(s,c=>c.charCodeAt(0));
}
async function hash(data: string): Promise<string> {
  const b=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(data)));
  return Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function sessionSignature(message: string): Promise<string> {
  const key=await crypto.subtle.importKey('raw',encoder.encode(`treinacamp-session-v1:${SERVICE_KEY}`),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return url64(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(message))));
}
async function createSession(): Promise<string> {
  const exp=Date.now()+8*60*60*1000;
  const payload=url64(encoder.encode(JSON.stringify({exp,nonce:crypto.randomUUID()})));
  return `${payload}.${await sessionSignature(payload)}`;
}
async function sessionValid(token: string): Promise<boolean> {
  try {
    const [payload,signature,extra]=token.split('.');if(!payload||!signature||extra)return false;
    const correct=await sessionSignature(payload);
    if(signature.length!==correct.length)return false;
    let mismatch=0;for(let i=0;i<signature.length;i++)mismatch|=signature.charCodeAt(i)^correct.charCodeAt(i);
    if(mismatch!==0)return false;
    const data=JSON.parse(new TextDecoder().decode(un64(payload)));
    return Number.isFinite(data.exp) && data.exp>Date.now() && data.exp<Date.now()+8*60*60*1000+60_000;
  }catch{return false;}
}
async function useLimit(key: string, max: number, windowMin: number): Promise<{allowed:boolean,remaining:number}> {
  const now=Date.now();
  const { data }=await db.from('limites_api').select('*').eq('identificador',key).maybeSingle();
  const oldEnd=data?new Date(data.reiniciar_em).getTime():0;
  const tries=oldEnd>now?Number(data.tentativas)+1:1;
  const end=oldEnd>now?data.reiniciar_em:new Date(now+windowMin*60000).toISOString();
  const blocked=!!(data?.bloqueado_ate && new Date(data.bloqueado_ate).getTime()>now);
  const over=tries>max;
  const blockUntil=blocked?data.bloqueado_ate:over?new Date(now+15*60000).toISOString():null;
  const {error}=await db.from('limites_api').upsert({identificador:key,tentativas:tries,reiniciar_em:end,bloqueado_ate:blockUntil});
  if(error)throw new Error('Não foi possível validar o limite de acesso');
  return {allowed:!blocked&&!over,remaining:Math.max(0,max-tries)};
}
async function resetLimit(key:string):Promise<void>{await db.from('limites_api').delete().eq('identificador',key);}
const statusValues=new Set(['pendente','matriculado','pago','cancelado']);

Deno.serve(async(req:Request):Promise<Response>=>{
  const origin=req.headers.get('Origin');
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=='POST')return reply({error:'Método não permitido'},405,origin);
  if(origin&&!allowedOrigins.includes(origin))return reply({error:'Origem não autorizada'},403,origin);
  if(!SUPABASE_URL||!SERVICE_KEY)return reply({error:'O servidor ainda não foi configurado. Contate a administração.'},503,origin);
  if(Number(req.headers.get('content-length')||0)>512000)return reply({error:'Requisição muito grande'},413,origin);
  let input:Record<string,unknown>;
  try{const raw=await req.text();if(encoder.encode(raw).length>512000)return reply({error:'Lista muito grande para um único envio. Entre em contato com a escola.'},413,origin);input=JSON.parse(raw);if(!input || typeof input!=='object'||Array.isArray(input))throw 0;}
  catch{return reply({error:'Solicitação inválida'},400,origin);}
  const action=input.action;
  const ip=(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown').trim();
  const ipHash=await hash(ip+':'+SERVICE_KEY.slice(-16));
  try {
    if(action==='saude'){
      const {error}=await db.from('indicacoes').select('id').limit(1);
      if(error)return reply({error:'Banco ainda não está pronto'},503,origin);
      const {data:admin,error:authError}=await db.from('admin_config').select('pin_hash').eq('singleton',true).maybeSingle();
      if(authError || !admin)return reply({error:'Acesso administrativo ainda não configurado'},503,origin);
      return reply({ok:true},200,origin);
    }
    if(action==='criar_lote'){
      const l=await useLimit(`envio:${ipHash}`,30,60);
      if(!l.allowed)return reply({error:'Muitas tentativas deste local. Aguarde alguns minutos.'},429,origin);
      const aluno=input.aluno as Record<string,unknown>;
      const amigos=input.amigos;
      if(!aluno||typeof aluno!=='object'||!Array.isArray(amigos))
        return reply({error:'Dados ou lista de indicados ausentes'},400,origin);
      if(amigos.length<10)
        return reply({error:'Adicione pelo menos 10 amigos antes de enviar suas indicações.'},422,origin);
      const nome=text(aluno.nome,120),whatsapp=digits(aluno.whatsapp),social=text(aluno.rede_social,120);
      if(nome.length<3||!validPhone(whatsapp)||input.consentimento!==true)
        return reply({error:'Preencha seus dados e confirme a autorização dos amigos.'},422,origin);
      const lista:{nome:string,whatsapp:string}[]=[];
      const telefones=new Set<string>();
      for(const item of amigos){
        if(!item||typeof item!=='object'||Array.isArray(item))
          return reply({error:'Uma das indicações contém dados inválidos.'},422,origin);
        const a=item as Record<string,unknown>;
        const amigoNome=text(a.nome,120),amigoWhats=digits(a.whatsapp);
        if(amigoNome.length<3||!validPhone(amigoWhats))
          return reply({error:'Revise os nomes e WhatsApps de todos os indicados.'},422,origin);
        if(amigoWhats===whatsapp)
          return reply({error:'Você não pode indicar seu próprio WhatsApp.'},422,origin);
        if(telefones.has(amigoWhats))
          return reply({error:'Sua lista tem um WhatsApp repetido. Corrija antes de enviar.'},422,origin);
        telefones.add(amigoWhats);
        lista.push({nome:amigoNome,whatsapp:amigoWhats});
      }
      // A função PostgreSQL realiza a gravação em uma única transação:
      // em caso de erro, nenhum dos amigos da lista é salvo.
      const {data,error}=await db.rpc('criar_indicacoes_em_lote',{
        p_aluno_nome:nome,
        p_aluno_whatsapp:whatsapp,
        p_aluno_rede_social:social,
        p_amigos:lista,
        p_origem:text(input.origem||'formulario',40),
        p_consentimento:true
      });
      if(error){
        if(error.code==='23505')return reply({error:'Um dos WhatsApps já foi indicado anteriormente. Confira a lista com a escola. Nenhuma indicação deste envio foi registrada.'},409,origin);
        return reply({error:'Não foi possível registrar toda a lista. Nenhuma indicação deste envio foi salva. Verifique os dados e tente novamente.'},500,origin);
      }
      return reply({ok:true,quantidade:data.quantidade,protocolo:data.protocolo},201,origin);
    }
    if(action==='login'){
      const rateKey=`login:${ipHash}`;
      const l=await useLimit(rateKey,5,15);
      if(!l.allowed)return reply({error:'Acesso temporariamente bloqueado. Tente novamente em 15 minutos.'},429,origin);
      const given=String(input.senha??'');
      // A senha não existe no código: o banco guarda somente salt e hash (acessíveis via service role).
      const {data:admin,error:authError}=await db.from('admin_config').select('pin_salt,pin_hash').eq('singleton',true).single();
      if(authError || !admin)return reply({error:'Administrador ainda não configurado.'},503,origin);
      const expected=String(admin.pin_hash),actual=await hash(`${admin.pin_salt}:${given}`);
      let mismatch=0;for(let i=0;i<64;i++)mismatch|=expected.charCodeAt(i)^actual.charCodeAt(i);
      if(mismatch!==0)return reply({error:`Senha incorreta. Restam até ${l.remaining} tentativa(s) neste acesso.`},401,origin);
      await resetLimit(rateKey);
      return reply({ok:true,token:await createSession(),expira_em:'8 horas'},200,origin);
    }
    const auth=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';
    if(!await sessionValid(auth))return reply({error:'Sessão expirada ou não autorizada. Entre novamente.'},401,origin);
    if(action==='verificar')return reply({ok:true},200,origin);
    if(action==='listar'){
      const entries:Record<string,unknown>[]=[];
      for(let offset=0;offset<50000;offset+=500){
        const {data,error}=await db.from('indicacoes').select('id,criado_em,aluno_nome,aluno_whatsapp,aluno_curso,aluno_rede_social,amigo_nome,amigo_whatsapp,amigo_rede_social,amigo_curso,origem,status,matriculado_em,pago_em').order('criado_em',{ascending:false}).range(offset,offset+499);
        if(error)throw error;
        entries.push(...(data||[]));if(!data||data.length<500)break;
      }
      return reply({indicacoes:entries},200,origin);
    }
    if(action==='atualizar'){
      const id=String(input.id||'');const status=String(input.status||'');
      if(!/^[0-9a-f-]{36}$/i.test(id)||!statusValues.has(status))return reply({error:'Dados inválidos'},422,origin);
      const {data:old,error:oldError}=await db.from('indicacoes').select('id,status,matriculado_em').eq('id',id).single();
      if(oldError||!old)return reply({error:'Indicação não encontrada'},404,origin);
      const now=new Date().toISOString();
      const changes:Record<string,unknown>={status,atualizado_em:now};
      if(['matriculado','pago'].includes(status)&&!old.matriculado_em)changes.matriculado_em=now;
      if(status==='pago')changes.pago_em=now;
      if(status!=='pago')changes.pago_em=null;
      const {error}=await db.from('indicacoes').update(changes).eq('id',id);
      if(error)throw error;
      return reply({ok:true},200,origin);
    }
    return reply({error:'Ação desconhecida'},404,origin);
  }catch{
    return reply({error:'Erro interno. Tente novamente em instantes.'},500,origin);
  }
});