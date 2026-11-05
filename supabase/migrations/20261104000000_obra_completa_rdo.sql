-- Obra com os dados do cadastro antigo (cliente, cidade, prazo, categoria, situação, medido) e RDO completo:
-- número, tarefas com medição, jornada da equipe, máquinas e materiais recebidos/utilizados.

-- Situação no lugar do "ativa" sim/não. "ativa" continua existindo, calculada: finalizada e cancelada saem de cena.
alter table obras
  add column cidade text,
  add column inicio date,
  add column termino date,
  add column categoria text,
  add column situacao text not null default 'em_andamento'
    check (situacao in ('nao_iniciada', 'em_andamento', 'paralisada', 'finalizada', 'cancelada')),
  add column medido numeric(5,2) check (medido between 0 and 100), -- % medido trazido do sistema antigo
  add column orcamento_antigo text,                                  -- nº do orçamento no sistema antigo
  add column controla_estoque boolean not null default false,
  add check (termino is null or inicio is null or termino >= inicio);
update obras set situacao = case when ativa then 'em_andamento' else 'finalizada' end;
alter table obras drop column ativa;
alter table obras add column ativa boolean generated always as (situacao not in ('finalizada', 'cancelada')) stored;

-- Dados da empresa para o cabeçalho do RDO impresso. Logo guardado como data URL (imagem pequena).
alter table config
  add column cnpj text,
  add column endereco text,
  add column email text,
  add column site text,
  add column logo text check (logo is null or (logo like 'data:image/%' and length(logo) <= 400000));

-- RDO: número sequencial por empresa; os serviços do dia viram a lista de tarefas.
alter table rdos add column numero int, drop column servicos;
create unique index on rdos (empresa_id, numero);

create function numerar_rdo() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(1333, new.empresa_id); -- dois RDOs salvos ao mesmo tempo não pegam o mesmo número
  select coalesce(max(numero), 0) + 1 into new.numero from rdos where empresa_id = new.empresa_id;
  return new;
end $$;
create trigger numerar before insert on rdos for each row execute function numerar_rdo();

alter table rdo_equipes add column jornada text; -- "8h", "07h às 17h"...

create table rdo_tarefas (
  id int generated always as identity primary key,
  empresa_id int not null default empresa_atual() references empresas,
  rdo_id int not null references rdos,
  servico text not null check (length(trim(servico)) > 0), -- fase/serviço (etapa/subetapa da obra ou texto livre)
  descricao text,
  quantidade numeric(14,3) check (quantidade > 0),           -- medição: quanto foi executado no dia
  unidade text
);
create index on rdo_tarefas (rdo_id);

create table rdo_equipamentos (
  id int generated always as identity primary key,
  empresa_id int not null default empresa_atual() references empresas,
  rdo_id int not null references rdos,
  equipamento text not null check (length(trim(equipamento)) > 0),
  servico text,
  quantidade int not null default 1 check (quantidade between 1 and 999),
  duracao text
);
create index on rdo_equipamentos (rdo_id);

create table rdo_materiais (
  id int generated always as identity primary key,
  empresa_id int not null default empresa_atual() references empresas,
  rdo_id int not null references rdos,
  tipo text not null check (tipo in ('recebido', 'utilizado')),
  insumo text not null check (length(trim(insumo)) > 0),
  quantidade numeric(14,3) check (quantidade > 0),
  unidade text,
  servico text -- só nos utilizados: em que fase/serviço foi usado
);
create index on rdo_materiais (rdo_id);

do $$
declare t text;
begin
  foreach t in array array['rdo_tarefas', 'rdo_equipamentos', 'rdo_materiais'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy da_empresa on %I to app_web using (empresa_id = empresa_atual()) with check (empresa_id = empresa_atual())', t);
    execute format('create trigger historico after insert or update or delete on %I for each row execute function registrar_historico()', t);
  end loop;
end $$;

revoke all on rdo_tarefas, rdo_equipamentos, rdo_materiais from anon, authenticated;
