-- Contas individuais: cada pessoa entra com e-mail e senha própria. O dono (perfil 'chefe') confirma
-- a entrada com o código do celular. Substitui as senhas compartilhadas por perfil e por obra.

create table usuarios (
  id int generated always as identity primary key,
  nome text not null,
  email text not null unique check (email = lower(email) and email like '%@%'),
  perfil text not null check (perfil in ('chefe', 'financeiro', 'obra')),
  senha text not null,                      -- hash (crypt)
  trocar_senha boolean not null default true, -- senha provisória: troca no primeiro acesso
  totp_segredo text,                        -- segredo do código do celular, cifrado pelo servidor
  totp_ativo boolean not null default false,
  ativo boolean not null default true,
  tentativas int not null default 0,
  bloqueado_ate timestamptz,
  ultimo_acesso_em timestamptz,
  tutorial_visto_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Obras que cada engenheiro enxerga.
create table usuario_obras (
  usuario_id int not null references usuarios,
  obra_id int not null references obras,
  primary key (usuario_id, obra_id)
);
create index on usuario_obras (obra_id);

alter table config drop column senha_chefe, drop column senha_financeiro;
alter table obras drop column senha;

-- Histórico: segredos nunca são gravados; tentativas de login, último acesso e o passo a passo
-- mudam o tempo todo e não viram evento.
create or replace function registrar_historico() returns trigger language plpgsql as $$
declare
  ocultar text[] := array['senha', 'totp_segredo'];
  ignorar text[] := array['tentativas', 'bloqueado_ate', 'ultimo_acesso_em', 'tutorial_visto_em'];
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

create trigger historico after insert or update or delete on usuarios for each row execute function registrar_historico();
create trigger historico after insert or update or delete on usuario_obras for each row execute function registrar_historico();
-- Pessoa nunca é apagada: é desativada, para o histórico continuar dizendo quem fez o quê.
create trigger nao_apagar before delete on usuarios for each row execute function proibir_exclusao();

alter table usuarios enable row level security;
alter table usuario_obras enable row level security;
revoke all on usuarios, usuario_obras from anon, authenticated;
