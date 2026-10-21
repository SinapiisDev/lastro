-- Parte 1: obras, etapas, compras, financeiro e histórico.
-- O app acessa o banco só pelo servidor (usuário postgres). O navegador nunca fala com o banco.

create extension if not exists pgcrypto with schema extensions;

-- "Hoje" no horário de Brasília (o banco roda em UTC).
create function hoje() returns date language sql stable
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create table config (
  id int primary key default 1 check (id = 1),
  teto_baixo numeric(14,2) not null default 2000 check (teto_baixo >= 0),
  teto_medio numeric(14,2) not null default 20000,
  senha_chefe text,       -- hash (crypt). Nula até o primeiro acesso.
  senha_financeiro text,  -- hash (crypt)
  saldo_caixa numeric(14,2) not null default 0,
  saldo_caixa_em date not null default hoje(), -- saldo no fim deste dia
  check (teto_medio >= teto_baixo)
);
insert into config default values;

create table obras (
  id int generated always as identity primary key,
  nome text not null unique,
  endereco text,
  ativa boolean not null default true,
  senha text not null, -- hash (crypt)
  criada_em timestamptz not null default now()
);

create table etapas (
  id int generated always as identity primary key,
  obra_id int not null references obras,
  nome text not null,
  ordem int not null default 0,
  previsto numeric(14,2) not null default 0 check (previsto >= 0)
);

create table subetapas (
  id int generated always as identity primary key,
  etapa_id int not null references etapas on delete cascade,
  nome text not null,
  ordem int not null default 0,
  progresso int not null default 0 check (progresso between 0 and 100)
);

create table fornecedores (
  id int generated always as identity primary key,
  nome text not null unique,
  cnpj text,
  telefone text
);

create table compras (
  id int generated always as identity primary key,
  subetapa_id int not null references subetapas, -- impede apagar subetapa com compra
  fornecedor_id int not null references fornecedores,
  descricao text not null,
  valor numeric(14,2) not null check (valor > 0),
  justificativa text,
  faixa text not null check (faixa in ('baixa', 'media', 'alta')),
  situacao text not null check (situacao in ('aguardando_financeiro', 'aguardando_chefe', 'aprovada', 'recusada', 'cancelada')),
  motivo text, -- motivo da recusa ou do cancelamento
  criada_em timestamptz not null default now()
);

create table parcelas (
  id int generated always as identity primary key,
  compra_id int not null references compras,
  numero int not null,
  valor numeric(14,2) not null check (valor > 0),
  vencimento date not null,
  paga_em date,
  unique (compra_id, numero)
);

create table entradas (
  id int generated always as identity primary key,
  obra_id int not null references obras,
  descricao text not null,
  valor numeric(14,2) not null check (valor > 0),
  previsto_para date not null,
  recebida_em date,
  cancelada boolean not null default false
);

create table anexos (
  id int generated always as identity primary key,
  compra_id int not null references compras,
  parcela_id int references parcelas,
  tipo text not null check (tipo in ('nota_fiscal', 'orcamento', 'pedido', 'boleto', 'comprovante', 'outro')),
  nome text not null,
  caminho text not null unique, -- caminho no bucket "anexos"
  criado_em timestamptz not null default now()
);

create table historico (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  perfil text not null,
  tabela text not null,
  registro_id int,
  acao text not null,
  antes jsonb,
  depois jsonb
);

create index on etapas (obra_id);
create index on subetapas (etapa_id);
create index on compras (subetapa_id);
create index on parcelas (compra_id);
create index on anexos (compra_id);
create index on entradas (obra_id);
create index on historico (tabela, registro_id);

-- Histórico automático: toda alteração vira um registro, na mesma transação.
-- Quem fez vem de app.perfil, definido pelo servidor no início de cada transação.
create function registrar_historico() returns trigger language plpgsql as $$
declare
  ocultar text[] := array['senha', 'senha_chefe', 'senha_financeiro'];
  a jsonb;
  d jsonb;
begin
  if tg_op <> 'INSERT' then a := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then d := to_jsonb(new); end if;
  if a = d then return null; end if;
  a := a - ocultar;
  d := d - ocultar;
  if a = d then d := jsonb_build_object('senha', 'alterada'); end if;
  insert into historico (perfil, tabela, registro_id, acao, antes, depois)
  values (coalesce(nullif(current_setting('app.perfil', true), ''), 'sistema'),
          tg_table_name, coalesce((d ->> 'id')::int, (a ->> 'id')::int), lower(tg_op), a, d);
  return null;
end $$;

create trigger historico after insert or update or delete on config for each row execute function registrar_historico();
create trigger historico after insert or update or delete on obras for each row execute function registrar_historico();
create trigger historico after insert or update or delete on etapas for each row execute function registrar_historico();
create trigger historico after insert or update or delete on subetapas for each row execute function registrar_historico();
create trigger historico after insert or update or delete on fornecedores for each row execute function registrar_historico();
create trigger historico after insert or update or delete on compras for each row execute function registrar_historico();
create trigger historico after insert or update or delete on parcelas for each row execute function registrar_historico();
create trigger historico after insert or update or delete on entradas for each row execute function registrar_historico();
create trigger historico after insert or update or delete on anexos for each row execute function registrar_historico();

-- Nada que envolve dinheiro ou documento é apagado de verdade.
create function proibir_exclusao() returns trigger language plpgsql as $$
begin
  raise exception 'Registros de % não podem ser apagados nem alterados assim', tg_table_name;
end $$;

create trigger nao_apagar before delete on obras for each row execute function proibir_exclusao();
create trigger nao_apagar before delete on fornecedores for each row execute function proibir_exclusao();
create trigger nao_apagar before delete on compras for each row execute function proibir_exclusao();
create trigger nao_apagar before delete on parcelas for each row execute function proibir_exclusao();
create trigger nao_apagar before delete on entradas for each row execute function proibir_exclusao();
create trigger nao_apagar before delete on anexos for each row execute function proibir_exclusao();
create trigger nao_apagar before update or delete on historico for each row execute function proibir_exclusao();

-- Compra com obra, etapa e fornecedor. "paga" é calculado: aprovada e sem parcela em aberto.
create view v_compras with (security_invoker = true) as
select c.*,
       e.obra_id, o.nome as obra, e.id as etapa_id, e.nome as etapa, s.nome as subetapa, f.nome as fornecedor,
       case when c.situacao = 'aprovada'
             and not exists (select 1 from parcelas p where p.compra_id = c.id and p.paga_em is null)
            then 'paga' else c.situacao end as status
from compras c
join subetapas s on s.id = c.subetapa_id
join etapas e on e.id = s.etapa_id
join obras o on o.id = e.obra_id
join fornecedores f on f.id = c.fornecedor_id;

-- Fecha a API pública do Supabase: só o servidor (postgres) acessa.
alter table config enable row level security;
alter table obras enable row level security;
alter table etapas enable row level security;
alter table subetapas enable row level security;
alter table fornecedores enable row level security;
alter table compras enable row level security;
alter table parcelas enable row level security;
alter table entradas enable row level security;
alter table anexos enable row level security;
alter table historico enable row level security;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- Bucket privado dos anexos (notas, boletos, comprovantes).
insert into storage.buckets (id, name, public) values ('anexos', 'anexos', false)
on conflict (id) do nothing;
