-- Contratos de empreitada e medições (como no sistema antigo, em Compras › Contratos).
--   Contrato: obra + empreiteiro + itens. Cada item é um serviço do orçamento (subetapa) com a quantidade e o preço
--   combinados com o empreiteiro (a obra pode ter 1.000 m² de pintura e o contrato, só 200).
--   Item acrescentado depois (aditivo) pode ser serviço fora do orçamento; mesmo assim cai numa subetapa da obra.
--   Medição: quanto foi executado de cada item no período. Lançada pelo engenheiro (ou dono), já vale como aprovada:
--   vira uma conta a pagar (compra aprovada, com os itens nas subetapas) e atualiza o % feito dos serviços.
--   Medição cuja conta a pagar é cancelada sai do medido (o saldo do contrato volta).

create table contratos (
  id int generated always as identity primary key,
  empresa_id int not null default empresa_atual() references empresas,
  obra_id int not null references obras,
  fornecedor_id int not null references fornecedores,
  objeto text not null, -- ex.: "Pintura interna – torre A"
  inicio date not null default hoje(),
  criado_em timestamptz not null default now()
);

create table contrato_itens (
  id int generated always as identity primary key,
  empresa_id int not null default empresa_atual() references empresas,
  contrato_id int not null references contratos,
  subetapa_id int not null references subetapas,
  descricao text not null,
  unidade text not null,
  quantidade numeric(14,4) not null check (quantidade > 0),
  preco_unitario numeric(14,2) not null check (preco_unitario >= 0),
  aditivo boolean not null default false,
  criado_em timestamptz not null default now()
);

create table medicoes (
  id int generated always as identity primary key,
  empresa_id int not null default empresa_atual() references empresas,
  contrato_id int not null references contratos,
  numero int not null,
  data date not null, -- dia da medição (fim do período medido)
  compra_id int not null unique references compras, -- a conta a pagar que a medição gerou
  criada_em timestamptz not null default now(),
  unique (contrato_id, numero)
);

create table medicao_itens (
  id int generated always as identity primary key,
  empresa_id int not null default empresa_atual() references empresas,
  medicao_id int not null references medicoes,
  contrato_item_id int not null references contrato_itens,
  quantidade numeric(14,4) not null check (quantidade > 0),
  valor numeric(14,2) not null check (valor >= 0),
  unique (medicao_id, contrato_item_id)
);

create index on contratos (empresa_id);
create index on contratos (obra_id);
create index on contrato_itens (contrato_id);
create index on contrato_itens (subetapa_id);
create index on medicoes (contrato_id);
create index on medicao_itens (medicao_id);
create index on medicao_itens (contrato_item_id);

-- Quanto já foi medido de cada item do contrato (só medições cuja conta a pagar não foi cancelada).
create view v_contrato_itens with (security_invoker = true) as
select ci.*,
       coalesce((select sum(mi.quantidade) from medicao_itens mi
                   join medicoes m on m.id = mi.medicao_id join compras c on c.id = m.compra_id
                  where mi.contrato_item_id = ci.id and c.situacao <> 'cancelada'), 0) as medido
from contrato_itens ci;

do $$
declare t text;
begin
  foreach t in array array['contratos', 'contrato_itens', 'medicoes', 'medicao_itens'] loop
    execute format('create trigger historico after insert or update or delete on %I for each row execute function registrar_historico()', t);
    execute format('create trigger nao_apagar before delete on %I for each row execute function proibir_exclusao()', t);
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy da_empresa on %I to app_web using (empresa_id = empresa_atual()) with check (empresa_id = empresa_atual())', t);
  end loop;
end $$;

revoke all on contratos, contrato_itens, medicoes, medicao_itens, v_contrato_itens from anon, authenticated;
grant select, insert, update on contratos, contrato_itens, medicoes, medicao_itens to app_web;
grant select on v_contrato_itens to app_web;
grant usage, select on all sequences in schema public to app_web;
