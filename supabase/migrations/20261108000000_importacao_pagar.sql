-- Importação da planilha "Documentos a pagar" do sistema antigo (Financeiro › Contas a pagar › Importar planilha).
--   importacao_chave: documento + obra + fornecedor da planilha. Mandar a mesma planilha (ou uma mais nova) de novo
--   não duplica: o documento que já entrou fica como está e só os novos entram.

alter table compras add column importacao_chave text;
create unique index compras_importacao_chave on compras (empresa_id, importacao_chave) where importacao_chave is not null;

-- O Postgres fixa as colunas de "c.*" quando a visão é criada: recria para incluir a coluna nova.
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
