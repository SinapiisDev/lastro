-- Várias construtoras no mesmo sistema. Cada linha pertence a uma empresa e o próprio banco só entrega
-- as linhas da empresa de quem está logado (RLS), mesmo que alguma consulta esqueça o filtro.
--   app_web: papel usado pelas telas; não é dono das tabelas, então a RLS vale para ele.
--   app.empresa_id: definido pelo servidor no começo de cada transação (src/lib/db.ts).
-- Login, webhook do WhatsApp, lembretes e o painel do administrador usam a conexão do sistema
-- (dona das tabelas) e marcam a empresa explicitamente.

do $$ begin
  if exists (select 1 from obras) or exists (select 1 from fornecedores) or exists (select 1 from usuarios)
     or exists (select 1 from historico) then
    raise exception 'Esta migração espera o banco sem dados: ainda não existe a quem atribuir cada linha.';
  end if;
end $$;

create table empresas (
  id int generated always as identity primary key,
  ativa boolean not null default true, -- o administrador do sistema bloqueia ou libera
  criada_em timestamptz not null default now()
);

create function empresa_atual() returns int language sql stable
as $$ select nullif(current_setting('app.empresa_id', true), '')::int $$;

-- Configuração (tetos, saldo em caixa, nome nas mensagens): uma linha por empresa.
alter table config disable trigger historico; -- apagar a linha antiga não é um evento de nenhuma empresa
delete from config;
alter table config enable trigger historico;
alter table config drop column id,
  add column empresa_id int primary key default empresa_atual() references empresas;

-- Toda tabela de dados ganha a empresa; o padrão vem da transação, então os inserts não mudam.
do $$
declare t text;
begin
  foreach t in array array['obras', 'etapas', 'subetapas', 'fornecedores', 'compras', 'parcelas', 'entradas', 'anexos',
    'historico', 'orcamentos', 'orcamento_itens', 'compra_itens', 'cotacoes', 'cotacao_itens', 'cotacao_fornecedores',
    'cotacao_precos', 'mensagens', 'usuarios', 'usuario_obras'] loop
    execute format('alter table %I add column empresa_id int not null default empresa_atual() references empresas', t);
  end loop;
end $$;

create index on obras (empresa_id);
create index on fornecedores (empresa_id);
create index on compras (empresa_id);
create index on cotacoes (empresa_id);
create index on entradas (empresa_id);
create index on mensagens (empresa_id);
create index on historico (empresa_id, id);

-- Nomes e números só precisam ser únicos dentro de cada empresa.
alter table obras drop constraint obras_nome_key, add unique (empresa_id, nome);
alter table fornecedores drop constraint fornecedores_nome_key, add unique (empresa_id, nome);
drop index fornecedor_whatsapp;
create unique index fornecedor_whatsapp on fornecedores (empresa_id, whatsapp) where whatsapp is not null;

-- O código de entrada é do celular, não da empresa: a mesma pessoa pode estar em várias construtoras.
alter table usuarios drop constraint usuarios_celular_key,
  drop column codigo, drop column codigo_expira_em, drop column codigo_enviado_em,
  drop column tentativas, drop column bloqueado_ate, drop column sessao_versao,
  add unique (empresa_id, celular);

create table acessos (
  celular text primary key check (celular ~ '^[0-9]{12,15}$'),
  codigo text,                        -- hash do último código enviado
  codigo_expira_em timestamptz,
  codigo_enviado_em timestamptz,
  tentativas int not null default 0,
  bloqueado_ate timestamptz,
  sessao_versao int not null default 1 -- "sair de todos os aparelhos" sobe este número
);

-- Quantos códigos cada endereço de internet pediu (o cadastro é aberto: evita usar o WhatsApp para spam).
create table envios_codigo (
  ip text not null,
  enviado_em timestamptz not null default now()
);
create index on envios_codigo (ip, enviado_em);

-- Papel das telas e as travas por empresa.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_web') then create role app_web nologin; end if;
end $$;
grant app_web to current_user;
grant usage on schema public to app_web;
grant select, insert, update, delete on all tables in schema public to app_web;
grant usage, select on all sequences in schema public to app_web;
grant execute on all functions in schema public to app_web;
alter default privileges in schema public grant select, insert, update, delete on tables to app_web;
alter default privileges in schema public grant usage, select on sequences to app_web;
-- Empresas, códigos de entrada e limites: só a conexão do sistema mexe.
revoke all on empresas, acessos, envios_codigo from app_web;

alter table empresas enable row level security;
alter table acessos enable row level security;
alter table envios_codigo enable row level security;
alter table usuarios enable row level security;
alter table usuario_obras enable row level security;
alter table orcamentos enable row level security;
alter table orcamento_itens enable row level security;
alter table compra_itens enable row level security;
alter table cotacoes enable row level security;
alter table cotacao_itens enable row level security;
alter table cotacao_fornecedores enable row level security;
alter table cotacao_precos enable row level security;
alter table mensagens enable row level security;

do $$
declare t text;
begin
  foreach t in array array['config', 'obras', 'etapas', 'subetapas', 'fornecedores', 'compras', 'parcelas', 'entradas', 'anexos',
    'historico', 'orcamentos', 'orcamento_itens', 'compra_itens', 'cotacoes', 'cotacao_itens', 'cotacao_fornecedores',
    'cotacao_precos', 'mensagens', 'usuarios', 'usuario_obras'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy da_empresa on %I to app_web using (empresa_id = empresa_atual()) with check (empresa_id = empresa_atual())', t);
  end loop;
end $$;

revoke all on empresas, acessos, envios_codigo from anon, authenticated;
