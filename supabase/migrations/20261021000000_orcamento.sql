-- Parte 2a: orçamento da obra (com revisões) e compras com vários itens.

alter table obras add column investidor text, add column investidor_contato text;

create table orcamentos (
  id int generated always as identity primary key,
  obra_id int not null references obras,
  versao int not null,
  situacao text not null default 'rascunho' check (situacao in ('rascunho', 'enviado', 'aprovado', 'substituido')),
  bdi numeric(6,2) not null default 0 check (bdi >= 0), -- margem da construtora em %
  motivo text, -- por que esta versão (revisão) foi criada
  criado_em timestamptz not null default now(),
  aprovado_em timestamptz,
  unique (obra_id, versao)
);
-- No máximo uma versão em edição e uma aprovada por obra.
create unique index orcamento_em_edicao on orcamentos (obra_id) where situacao in ('rascunho', 'enviado');
create unique index orcamento_aprovado on orcamentos (obra_id) where situacao = 'aprovado';

create table orcamento_itens (
  id int generated always as identity primary key,
  orcamento_id int not null references orcamentos,
  chave uuid not null default gen_random_uuid(), -- igual em todas as revisões: é o que liga compras ao item
  subetapa_id int not null references subetapas,
  descricao text not null,
  unidade text not null,
  quantidade numeric(14,3) not null check (quantidade > 0),
  preco_unitario numeric(14,2) not null check (preco_unitario >= 0),
  tipo text not null check (tipo in ('material', 'mao_de_obra', 'equipamento')),
  unique (orcamento_id, chave)
);
create index on orcamento_itens (orcamento_id);
create index on orcamento_itens (chave);

-- Orçamento enviado ou aprovado não muda: só um rascunho aceita itens novos, alterados ou removidos.
create function travar_orcamento() returns trigger language plpgsql as $$
begin
  if (select situacao from orcamentos where id = coalesce(new.orcamento_id, old.orcamento_id)) <> 'rascunho' then
    raise exception 'Só dá para mexer nos itens de um orçamento em rascunho';
  end if;
  return coalesce(new, old);
end $$;
create trigger travar before insert or update or delete on orcamento_itens for each row execute function travar_orcamento();

-- Compras passam a ter itens (cada um numa subetapa, ligado ou não a um item do orçamento).
alter table compras add column obra_id int references obras;
update compras c set obra_id = e.obra_id from subetapas s join etapas e on e.id = s.etapa_id where s.id = c.subetapa_id;
alter table compras alter column obra_id set not null;
create index on compras (obra_id);

create table compra_itens (
  id int generated always as identity primary key,
  compra_id int not null references compras,
  subetapa_id int not null references subetapas,
  item_chave uuid, -- item do orçamento; vazio = fora do orçamento
  descricao text not null,
  quantidade numeric(14,3) check (quantidade > 0),
  unidade text,
  valor numeric(14,2) not null check (valor > 0)
);
create index on compra_itens (compra_id);
create index on compra_itens (item_chave);
insert into compra_itens (compra_id, subetapa_id, descricao, valor)
select id, subetapa_id, descricao, valor from compras;

drop view v_compras;
alter table compras drop column subetapa_id;

create view v_compras with (security_invoker = true) as
select c.*, o.nome as obra, f.nome as fornecedor,
       (select string_agg(distinct e.nome, ', ') from compra_itens ci
          join subetapas s on s.id = ci.subetapa_id join etapas e on e.id = s.etapa_id where ci.compra_id = c.id) as etapa,
       (select string_agg(distinct s.nome, ', ') from compra_itens ci
          join subetapas s on s.id = ci.subetapa_id where ci.compra_id = c.id) as subetapa,
       case when c.situacao = 'aprovada'
             and not exists (select 1 from parcelas p where p.compra_id = c.id and p.paga_em is null)
            then 'paga' else c.situacao end as status
from compras c
join obras o on o.id = c.obra_id
join fornecedores f on f.id = c.fornecedor_id;

-- Cada item de compra com a fração que representa da compra (para dividir pago e a pagar por etapa).
create view v_compra_itens with (security_invoker = true) as
select ci.*, c.obra_id, s.etapa_id, c.situacao, c.criada_em, c.fornecedor_id, ci.valor / c.valor as fracao
from compra_itens ci
join compras c on c.id = ci.compra_id
join subetapas s on s.id = ci.subetapa_id;

-- Versão que vale para a obra: a aprovada; sem aprovada, a que está em edição.
create view v_orcamento_vigente with (security_invoker = true) as
select distinct on (obra_id) * from orcamentos
where situacao <> 'substituido'
order by obra_id, (situacao = 'aprovado') desc, versao desc;

-- Previsto de cada subetapa = soma dos itens do orçamento vigente (custo, sem a margem).
create view v_previsto with (security_invoker = true) as
select i.subetapa_id, sum(round(i.quantidade * i.preco_unitario, 2)) as previsto
from orcamento_itens i
join v_orcamento_vigente o on o.id = i.orcamento_id
group by i.subetapa_id;

-- O valor previsto digitado à mão vira a versão 1 do orçamento (um item por etapa, na primeira subetapa).
insert into orcamentos (obra_id, versao, motivo)
select distinct e.obra_id, 1, 'Criado a partir dos valores previstos digitados antes do orçamento'
from etapas e where e.previsto > 0;
insert into orcamento_itens (orcamento_id, subetapa_id, descricao, unidade, quantidade, preco_unitario, tipo)
select o.id, (select s.id from subetapas s where s.etapa_id = e.id order by s.ordem, s.id limit 1),
       'Valor previsto da etapa ' || e.nome, 'vb', 1, e.previsto, 'material'
from etapas e join orcamentos o on o.obra_id = e.obra_id
where e.previsto > 0 and exists (select 1 from subetapas s where s.etapa_id = e.id);
alter table etapas drop column previsto;

create trigger historico after insert or update or delete on orcamentos for each row execute function registrar_historico();
create trigger historico after insert or update or delete on orcamento_itens for each row execute function registrar_historico();
create trigger historico after insert or update or delete on compra_itens for each row execute function registrar_historico();
create trigger nao_apagar before delete on orcamentos for each row execute function proibir_exclusao();
create trigger nao_apagar before delete on compra_itens for each row execute function proibir_exclusao();

alter table orcamentos enable row level security;
alter table orcamento_itens enable row level security;
alter table compra_itens enable row level security;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
