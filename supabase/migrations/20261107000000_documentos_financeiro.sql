-- Documentos do financeiro e pagamento/recebimento parcial (modelo do sistema antigo).
--   Documento a pagar: uma compra lançada pelo financeiro (imposto, aluguel, nota de material…), já aprovada,
--   sem passar pelos tetos. Usa as mesmas parcelas, anexos, fluxo de caixa e histórico das compras.
--   Pagamento parcial: a parcela fica com o valor pago e o restante vira uma parcela nova (saldo_de aponta a original).
--   Natureza: provisão = documento lançado; previsão = estimativa sem documento; adiantamento = pago/recebido antes.

alter table compras
  add column origem text not null default 'obra' check (origem in ('obra', 'financeiro')),
  add column natureza text not null default 'provisao' check (natureza in ('provisao', 'previsao', 'adiantamento')),
  add column tipo_documento text check (tipo_documento in ('nota_fiscal', 'boleto', 'contrato', 'recibo', 'fatura', 'guia', 'folha', 'outro')),
  add column numero_documento text,
  add column emissao date;

alter table parcelas add column saldo_de int references parcelas;

alter table entradas
  add column natureza text not null default 'provisao' check (natureza in ('provisao', 'previsao', 'adiantamento')),
  add column tipo_documento text check (tipo_documento in ('nota_fiscal', 'boleto', 'contrato', 'recibo', 'fatura', 'guia', 'folha', 'outro')),
  add column numero_documento text,
  add column emissao date,
  add column saldo_de int references entradas,
  add column criada_em timestamptz not null default now();

-- O Postgres fixa as colunas de "c.*" quando a visão é criada: recria para incluir as colunas novas.
drop view v_compras;
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
revoke all on v_compras from anon, authenticated;
grant select on v_compras to app_web;

create index on parcelas (vencimento) where paga_em is null;
