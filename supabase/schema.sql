-- TREINACAMP • AMIGO DA ONÇA
-- Aplicar SOMENTE em um NOVO projeto Supabase reservado a esta campanha.
-- Nenhuma senha ou chave de serviço deve ser colocada no GitHub Pages.

create extension if not exists pgcrypto;

create table if not exists public.indicacoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  aluno_nome varchar(120) not null check(length(trim(aluno_nome)) >= 3),
  aluno_whatsapp varchar(11) not null check(aluno_whatsapp ~ '^[1-9][1-9][0-9]{8,9}$'),
  aluno_curso varchar(100),
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

create or replace function public.limitar_indicacoes()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Lock lógico atômico: duas requisições simultâneas do mesmo aluno não furam o limite.
  perform pg_advisory_xact_lock(hashtextextended(new.aluno_whatsapp, 0));
  if (select count(*) from public.indicacoes where aluno_whatsapp = new.aluno_whatsapp) >= 10 then
    raise exception 'limite_de_dez_indicacoes';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_limitar_indicacoes on public.indicacoes;
create trigger trg_limitar_indicacoes before insert on public.indicacoes
  for each row execute function public.limitar_indicacoes();

-- Limites de tentativas para proteger o login e evitar abuso do formulário.
create table if not exists public.limites_api (
  identificador varchar(100) primary key,
  tentativas integer not null default 0,
  reiniciar_em timestamptz not null,
  bloqueado_ate timestamptz
);

-- Banco bloqueado para acesso público direto; só a Edge Function usa service_role.
alter table public.indicacoes enable row level security;
alter table public.limites_api enable row level security;
revoke all on public.indicacoes from anon, authenticated;
revoke all on public.limites_api from anon, authenticated;
revoke all on function public.limitar_indicacoes() from public, anon, authenticated;

comment on table public.indicacoes is 'Campanha Amigo da Onça: dados pessoais com acesso exclusivo pelo backend';
