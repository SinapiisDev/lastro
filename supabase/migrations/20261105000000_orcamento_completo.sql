-- Orçamento completo no modelo do sistema antigo: fase (etapa) → subfase (grupo da subetapa) → serviço (subetapa,
-- com quantidade e unidade) → insumos (itens do orçamento, com os seis tipos de custo).

alter table obras add column area numeric(14,4) check (area > 0); -- m²

alter table subetapas
  add column grupo text, -- subfase do orçamento (ex.: "Contas, impostos e aprovações")
  add column quantidade numeric(14,4) check (quantidade >= 0), -- 0 = serviço ainda sem quantidade no orçamento
  add column unidade text;

alter table orcamento_itens drop constraint orcamento_itens_tipo_check;
alter table orcamento_itens add constraint orcamento_itens_tipo_check
  check (tipo in ('material', 'mao_de_obra', 'equipamento', 'frete', 'servico', 'outros'));

-- Insumo com preço e ainda sem quantidade (orçamento em montagem) fica com quantidade 0.
alter table orcamento_itens drop constraint orcamento_itens_quantidade_check;
alter table orcamento_itens add constraint orcamento_itens_quantidade_check check (quantidade >= 0);

-- Composições do sistema antigo usam 4 casas na quantidade (ex.: 67,9168 sacos); com 3 o total mudaria em centavos.
drop view v_previsto;
alter table orcamento_itens alter column quantidade type numeric(14,4);
create view v_previsto with (security_invoker = true) as
select i.subetapa_id, sum(round(i.quantidade * i.preco_unitario, 2)) as previsto
from orcamento_itens i
join v_orcamento_vigente o on o.id = i.orcamento_id
group by i.subetapa_id;
revoke all on v_previsto from anon, authenticated;
grant select on v_previsto to app_web;
