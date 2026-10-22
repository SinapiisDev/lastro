-- Entrada por e-mail e senha. O dono se cadastra; cada pessoa da equipe recebe do dono um link de
-- primeiro acesso, onde cria a própria senha. O código pelo WhatsApp deixa de existir.

do $$ begin
  if exists (select 1 from usuarios) then
    raise exception 'Esta migração espera nenhuma pessoa cadastrada: o acesso deixa de ser pelo celular.';
  end if;
end $$;

-- Uma conta por e-mail (vale para todas as construtoras em que a pessoa está).
create table contas (
  email text primary key check (email = lower(email) and email like '%_@_%'),
  senha text,                          -- hash (crypt); nula até o primeiro acesso
  tentativas int not null default 0,
  bloqueado_ate timestamptz,
  sessao_versao int not null default 1 -- "sair de todos os aparelhos" e troca de senha sobem este número
);
alter table contas enable row level security;
revoke all on contas from anon, authenticated, app_web;
drop table acessos;

-- Limite por endereço de internet: cadastros de construtora e senhas erradas.
alter table envios_codigo rename to tentativas_ip;
alter table tentativas_ip rename column enviado_em to em;

alter table usuarios drop constraint usuarios_empresa_id_celular_key,
  drop column celular,
  add column email text not null check (email = lower(email) and email like '%_@_%'),
  add column convite text,             -- hash do link de primeiro acesso (o link em si nunca fica guardado)
  add column convite_expira_em timestamptz,
  add unique (empresa_id, email);
create index on usuarios (email);

-- O código do link nunca vai para o histórico; o prazo dele sim ("link gerado" e "link usado").
create or replace function registrar_historico() returns trigger language plpgsql as $$
declare
  ocultar text[] := array['senha'];
  ignorar text[] := array['tentativas', 'bloqueado_ate', 'ultimo_acesso_em', 'tutorial_visto_em', 'convite'];
  a jsonb;
  d jsonb;
begin
  if tg_op <> 'INSERT' then a := to_jsonb(old) - ignorar; end if;
  if tg_op <> 'DELETE' then d := to_jsonb(new) - ignorar; end if;
  if a = d then return null; end if;
  a := a - ocultar;
  d := d - ocultar;
  if a = d then d := jsonb_build_object('senha', 'alterada'); end if;
  insert into historico (perfil, tabela, registro_id, acao, antes, depois)
  values (coalesce(nullif(current_setting('app.perfil', true), ''), 'sistema'),
          tg_table_name, coalesce((d ->> 'id')::int, (a ->> 'id')::int), lower(tg_op), a, d);
  return null;
end $$;
