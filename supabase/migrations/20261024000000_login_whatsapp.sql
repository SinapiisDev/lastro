-- Entrada pelo celular: a pessoa digita o número e recebe um código de 6 números no WhatsApp.
-- Sem senha e sem aplicativo autenticador. O aparelho fica lembrado por 30 dias.

alter table usuarios
  drop column email,
  drop column senha,
  drop column trocar_senha,
  drop column totp_segredo,
  drop column totp_ativo,
  -- Só dígitos, com DDI (ex.: 5511988887777). Conta antiga sem celular cadastra o número na instalação.
  add column celular text unique check (celular ~ '^[0-9]{12,15}$'),
  add column codigo text,                 -- hash do último código enviado
  add column codigo_expira_em timestamptz,
  add column codigo_enviado_em timestamptz,
  -- Sobe quando a pessoa sai de todos os aparelhos ou troca de número: derruba as sessões abertas.
  add column sessao_versao int not null default 1;

create or replace function registrar_historico() returns trigger language plpgsql as $$
declare
  ocultar text[] := array['senha'];
  ignorar text[] := array['tentativas', 'bloqueado_ate', 'ultimo_acesso_em', 'tutorial_visto_em', 'codigo', 'codigo_expira_em', 'codigo_enviado_em'];
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
