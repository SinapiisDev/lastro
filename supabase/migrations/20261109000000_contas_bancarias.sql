-- Contas bancárias e conciliação pelo extrato (arquivo OFX), sem ligar o sistema ao banco.
--   O dono cadastra as contas com o saldo de um dia. O financeiro escolhe a conta ao pagar e ao receber,
--   pode agendar o pagamento de uma parcela e concilia: envia o extrato e confirma os pares que o sistema sugere.
--   Saldo da conta = saldo informado + recebimentos e pagamentos nela depois daquele dia + lançamentos
--   avulsos do extrato (tarifa, juros). O último saldo que veio no extrato fica guardado para conferir.

create table contas_bancarias (
  id int generated always as identity primary key,
  empresa_id int not null default empresa_atual() references empresas,
  nome text not null check (length(trim(nome)) > 0),
  banco text,
  agencia text,
  numero text,
  saldo_inicial numeric(14,2) not null default 0,
  saldo_em date not null,       -- saldo no fim deste dia
  saldo_banco numeric(14,2),    -- último saldo que veio no extrato
  saldo_banco_em date,
  ativa boolean not null default true,
  criada_em timestamptz not null default now(),
  unique (empresa_id, nome)
);

alter table parcelas
  add column conta_id int references contas_bancarias,
  add column agendada_para date; -- pagamento agendado no banco para este dia (ainda não saiu)
alter table entradas add column conta_id int references contas_bancarias;

-- Cada linha do extrato, uma vez só por conta (o código do banco, FITID, não se repete).
--   pendente: falta conferir; conciliado: é o pagamento de uma parcela ou o recebimento de uma entrada;
--   avulso: movimento só do banco (tarifa, juros), entra no saldo da conta; ignorado: não conta.
create table extrato (
  id int generated always as identity primary key,
  empresa_id int not null default empresa_atual() references empresas,
  conta_id int not null references contas_bancarias,
  fitid text not null,
  data date not null,
  valor numeric(14,2) not null check (valor <> 0), -- < 0 saiu, > 0 entrou
  descricao text not null default '',
  nome text,
  documento text,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'conciliado', 'avulso', 'ignorado')),
  parcela_id int references parcelas,
  entrada_id int references entradas,
  baixou boolean not null default false, -- a conciliação é que pagou/recebeu (desfazer volta a parcela para em aberto)
  observacao text,
  importado_em timestamptz not null default now(),
  unique (conta_id, fitid),
  check (parcela_id is null or entrada_id is null),
  check ((situacao = 'conciliado') = (parcela_id is not null or entrada_id is not null))
);

create index on contas_bancarias (empresa_id);
create index on extrato (conta_id, situacao);
create unique index extrato_parcela on extrato (parcela_id) where parcela_id is not null;
create unique index extrato_entrada on extrato (entrada_id) where entrada_id is not null;
create index on parcelas (conta_id) where conta_id is not null;
create index on entradas (conta_id) where conta_id is not null;

create trigger historico after insert or update or delete on contas_bancarias for each row execute function registrar_historico();
-- Do extrato, o histórico guarda as conferências (quem conciliou, lançou no saldo ou desfez), não cada linha que chegou.
create trigger historico after update on extrato for each row execute function registrar_historico();
create trigger nao_apagar before delete on contas_bancarias for each row execute function proibir_exclusao();
create trigger nao_apagar before delete on extrato for each row execute function proibir_exclusao();

alter table contas_bancarias enable row level security;
alter table extrato enable row level security;
create policy da_empresa on contas_bancarias to app_web using (empresa_id = empresa_atual()) with check (empresa_id = empresa_atual());
create policy da_empresa on extrato to app_web using (empresa_id = empresa_atual()) with check (empresa_id = empresa_atual());
revoke all on contas_bancarias, extrato from anon, authenticated;
grant select, insert, update on contas_bancarias, extrato to app_web;
grant usage, select on all sequences in schema public to app_web;
