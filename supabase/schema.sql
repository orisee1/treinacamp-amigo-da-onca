-- TREINACAMP • AMIGO DA ONÇA
-- Aplicar SOMENTE em um NOVO projeto Supabase reservado a esta campanha.
-- Nenhuma senha ou chave de serviço deve ser colocada no GitHub Pages.

create extension if not exists pgcrypto;

create table if not exists public.indicacoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  aluno_nome varchar(120) not null check(length(trim(aluno_nome)) >= 3),
  aluno_whatsapp varchar(11) not null check(aluno_whatsapp ~ '^[1-9][1-9][0-9]{8,9}$'),
  aluno_curso varchar(100), -- histórico de versões anteriores
  aluno_rede_social varchar(120),
  amigo_rede_social varchar(120), -- histórico de versões anteriores
  amigo_nome varchar(120) not null check(length(trim(amigo_nome)) >= 3),
  amigo_whatsapp varchar(11) not null check(amigo_whatsapp ~ '^[1-9][1-9][0-9]{8,9}$'),
  amigo_curso varchar(100) not null check(length(trim(amigo_curso)) >= 2),
  origem varchar(40) not null default 'qr',
  consentimento_confirmado boolean not null check(consentimento_confirmado is true),
  status varchar(16) not null default 'pendente'
    check(status in ('pendente','matriculado','pago','cancelado')),
  matriculado_em timestamptz,
  pago_em timestamptz,
  atualizado_em timestamptz not null default now(),
  constraint nao_pode_indicar_a_si check(aluno_whatsapp <> amigo_whatsapp),
  constraint amigo_indicado_uma_vez unique(amigo_whatsapp)
);

create index if not exists idx_indicacoes_aluno_whatsapp on public.indicacoes(aluno_whatsapp);
create index if not exists idx_indicacoes_criado_em on public.indicacoes(criado_em desc);
create index if not exists idx_indicacoes_status on public.indicacoes(status);

-- A campanha é ilimitada: não pode existir o gatilho antigo com máximo de 10.
drop trigger if exists trg_limitar_indicacoes on public.indicacoes;
drop function if exists public.limitar_indicacoes();

-- Limites de tentativas para proteger o login e evitar abuso do formulário.
create table if not exists public.limites_api (
  identificador varchar(100) primary key,
  tentativas integer not null default 0,
  reiniciar_em timestamptz not null,
  bloqueado_ate timestamptz
);

-- Credencial administrativa armazenada exclusivamente no banco, com hash e salt aleatório.
-- Inserir a credencial APÓS a migração via ferramenta administrativa autorizada.
-- Nunca inserir a senha em um arquivo público, commit ou migração.
create table if not exists public.admin_config (
  singleton boolean primary key default true check (singleton = true),
  pin_salt text not null check(length(pin_salt) >= 20),
  pin_hash char(64) not null check(pin_hash ~ '^[0-9a-f]{64}$')
);

-- Banco bloqueado para acesso público direto; só a Edge Function usa service_role.
alter table public.indicacoes enable row level security;
alter table public.limites_api enable row level security;
alter table public.admin_config enable row level security;
revoke all on public.indicacoes from anon, authenticated;
revoke all on public.limites_api from anon, authenticated;
revoke all on public.admin_config from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update on public.indicacoes to service_role;
grant select, insert, update, delete on public.limites_api to service_role;
grant select on public.admin_config to service_role;

-- Atualizações necessárias caso este schema seja reaplicado a um projeto legado.
alter table public.indicacoes
  add column if not exists aluno_rede_social varchar(120),
  add column if not exists amigo_rede_social varchar(120);

-- Toda lista é gravada ou rejeitada em uma única transação.
-- Apenas a Edge Function (service_role) pode executar esta função.
CREATE OR REPLACE FUNCTION public.criar_indicacoes_em_lote(p_aluno_nome text, p_aluno_whatsapp text, p_aluno_rede_social text, p_amigos jsonb, p_origem text, p_consentimento boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare quantidade int; inseridos int; primeiro_id text; total_indicados int;
begin
 if p_consentimento is distinct from true then raise exception 'Autorização para contato obrigatória'; end if;
 if jsonb_typeof(p_amigos) is distinct from 'array' then raise exception 'Lista de indicados inválida'; end if;
 quantidade:=jsonb_array_length(p_amigos);
 if quantidade < 1 then raise exception 'Adicione pelo menos um amigo'; end if;
 if length(btrim(coalesce(p_aluno_nome,'')))<3
    or length(p_aluno_nome)>120
    or coalesce(p_aluno_whatsapp,'') !~ '^[1-9][1-9][0-9]{8,9}$'
    or length(coalesce(p_aluno_rede_social,''))>120 then
    raise exception 'Dados do aluno incompletos ou inválidos';
 end if;
 if exists (select 1 from jsonb_array_elements(p_amigos) item
    where jsonb_typeof(item) is distinct from 'object'
      or length(btrim(coalesce(item->>'nome','')))<3
      or length(coalesce(item->>'nome',''))>120
      or coalesce(item->>'whatsapp','') !~ '^[1-9][1-9][0-9]{8,9}$'
      or item->>'whatsapp'=p_aluno_whatsapp) then
    raise exception 'Confira nome e telefone dos amigos';
 end if;
 if (select count(distinct item->>'whatsapp') from jsonb_array_elements(p_amigos) item)<>quantidade then
    raise exception 'Não repita o WhatsApp na mesma lista';
 end if;
 with novos as (
   insert into public.indicacoes (
     aluno_nome,aluno_whatsapp,aluno_rede_social,amigo_nome,amigo_whatsapp,
     amigo_curso,origem,consentimento_confirmado)
   select btrim(regexp_replace(p_aluno_nome,'\s+',' ','g')),p_aluno_whatsapp,
     nullif(btrim(coalesce(p_aluno_rede_social,'')),''),
     btrim(regexp_replace(item->>'nome','\s+',' ','g')),
     item->>'whatsapp','Não informado',
     left(coalesce(nullif(btrim(p_origem),''),'formulario'),40),true
   from jsonb_array_elements(p_amigos) item
   returning id
 )
 select count(*),min(id::text) into inseridos,primeiro_id from novos;

 select count(*) into total_indicados from public.indicacoes
 where aluno_whatsapp=p_aluno_whatsapp
   and lower(regexp_replace(btrim(aluno_nome),'\s+',' ','g')) =
       lower(regexp_replace(btrim(p_aluno_nome),'\s+',' ','g'));
 return jsonb_build_object('ok',true,'quantidade',inseridos,
     'total_acumulado',total_indicados,'apto',total_indicados>=10,
     'protocolo',left(primeiro_id,8));
end;
$function$

revoke all on function public.criar_indicacoes_em_lote(text,text,text,jsonb,text,boolean)
  from public, anon, authenticated;
grant execute on function public.criar_indicacoes_em_lote(text,text,text,jsonb,text,boolean)
  to service_role;
comment on table public.indicacoes is 'Campanha Amigo da Onça: acesso exclusivo ao backend, mínimo de 10 por lote';

-- Operações restritas à Edge Function autenticada como service_role.
CREATE OR REPLACE FUNCTION public.excluir_indicacoes_do_aluno(p_aluno_nome text, p_aluno_whatsapp text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare apagadas integer;
begin
 if p_aluno_nome is null or length(btrim(p_aluno_nome))<3
   or coalesce(p_aluno_whatsapp,'') !~ '^[1-9][1-9][0-9]{8,9}$' then
   raise exception 'Identificação do aluno inválida';
 end if;
 with removed as (
   delete from public.indicacoes
   where aluno_whatsapp=p_aluno_whatsapp
   and lower(regexp_replace(btrim(aluno_nome),'\s+',' ','g'))=
       lower(regexp_replace(btrim(p_aluno_nome),'\s+',' ','g'))
   returning id
 ) select count(*) into apagadas from removed;
 return apagadas;
end;
$function$

revoke all on function public.excluir_indicacoes_do_aluno(text,text) from public,anon,authenticated;
grant execute on function public.excluir_indicacoes_do_aluno(text,text) to service_role;
CREATE OR REPLACE FUNCTION public.total_indicacoes_aluno(p_nome text, p_whatsapp text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select count(*)::integer from public.indicacoes
where aluno_whatsapp=p_whatsapp
and lower(regexp_replace(btrim(aluno_nome),'\s+',' ','g'))=
    lower(regexp_replace(btrim(p_nome),'\s+',' ','g'));
$function$

revoke all on function public.total_indicacoes_aluno(text,text) from public,anon,authenticated;
grant execute on function public.total_indicacoes_aluno(text,text) to service_role;
