-- Parte 2b/2c: cotações com fornecedores, conversa por WhatsApp (real ou simulado) e IA.

alter table config add column nome_empresa text not null default 'Construtora';

-- WhatsApp só com dígitos e DDI (ex.: 5511999998888). ia_pausada: uma pessoa assumiu a conversa.
alter table fornecedores add column whatsapp text, add column ia_pausada boolean not null default false;
create unique index fornecedor_whatsapp on fornecedores (whatsapp) where whatsapp is not null;

create table cotacoes (
  id int generated always as identity primary key,
  obra_id int not null references obras,
  titulo text not null,
  situacao text not null default 'rascunho' check (situacao in ('rascunho', 'aguardando', 'concluida', 'cancelada')),
  prazo_resposta date not null,
  recomendacao jsonb,      -- última análise da IA: {escolhas: [{item_id, fornecedor_id}], explicacao}
  motivo_escolha text,     -- por que a escolha final foi diferente da indicada
  economia numeric(14,2),  -- quanto a escolha economizou frente à proposta mais cara de cada item
  criada_em timestamptz not null default now()
);

create table cotacao_itens (
  id int generated always as identity primary key,
  cotacao_id int not null references cotacoes,
  subetapa_id int not null references subetapas,
  item_chave uuid,  -- item do orçamento; vazio = fora do orçamento
  descricao text not null,
  quantidade numeric(14,3) not null check (quantidade > 0),
  unidade text not null,
  fornecedor_escolhido int references fornecedores
);

create table cotacao_fornecedores (
  id int generated always as identity primary key,
  cotacao_id int not null references cotacoes,
  fornecedor_id int not null references fornecedores,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'pedido_enviado', 'respondeu', 'recusou')),
  frete numeric(14,2) check (frete >= 0),
  prazo_entrega_dias int check (prazo_entrega_dias >= 0),
  prazos_pagamento int[],  -- dias de cada parcela, ex.: {30,60,90}
  observacao text,
  unique (cotacao_id, fornecedor_id)
);

-- Sem linha = sem resposta; preço vazio = o fornecedor não tem o item.
create table cotacao_precos (
  id int generated always as identity primary key,
  cotacao_fornecedor_id int not null references cotacao_fornecedores,
  cotacao_item_id int not null references cotacao_itens,
  preco_unitario numeric(14,2) check (preco_unitario >= 0),
  unique (cotacao_fornecedor_id, cotacao_item_id)
);

-- Conversa com cada fornecedor (uma por fornecedor, como no WhatsApp).
create table mensagens (
  id bigint generated always as identity primary key,
  fornecedor_id int not null references fornecedores,
  direcao text not null check (direcao in ('entrada', 'saida')),
  autor text not null check (autor in ('fornecedor', 'ia', 'sistema', 'pessoa')),
  texto text,
  anexo_caminho text,
  anexo_tipo text,
  whatsapp_id text unique,
  pendente_ia boolean not null default false, -- entrada que a IA ainda não leu
  criada_em timestamptz not null default now()
);
create index on mensagens (fornecedor_id, id);
create index on mensagens (pendente_ia) where pendente_ia;

alter table compras add column cotacao_id int references cotacoes, add column pedido_enviado_em timestamptz;

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

create index on cotacoes (obra_id);
create index on cotacao_itens (cotacao_id);
create index on cotacao_fornecedores (cotacao_id);
create index on cotacao_fornecedores (fornecedor_id);

create trigger historico after insert or update or delete on cotacoes for each row execute function registrar_historico();
create trigger historico after insert or update or delete on cotacao_itens for each row execute function registrar_historico();
create trigger historico after insert or update or delete on cotacao_fornecedores for each row execute function registrar_historico();
create trigger historico after insert or update or delete on cotacao_precos for each row execute function registrar_historico();
create trigger nao_apagar before delete on cotacoes for each row execute function proibir_exclusao();
create trigger nao_apagar before delete on mensagens for each row execute function proibir_exclusao();

alter table cotacoes enable row level security;
alter table cotacao_itens enable row level security;
alter table cotacao_fornecedores enable row level security;
alter table cotacao_precos enable row level security;
alter table mensagens enable row level security;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
