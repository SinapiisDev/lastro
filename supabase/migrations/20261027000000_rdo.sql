-- Relatório Diário de Obra (RDO): um por obra e dia, com as equipes que trabalharam, ocorrências e fotos.
-- As fotos também formam a galeria da obra (com ou sem RDO).

create table rdos (
  id int generated always as identity primary key,
  empresa_id int not null default empresa_atual() references empresas,
  obra_id int not null references obras,
  data date not null,
  clima_manha text not null check (clima_manha in ('bom', 'nublado', 'chuva', 'impraticavel')),
  clima_tarde text not null check (clima_tarde in ('bom', 'nublado', 'chuva', 'impraticavel')),
  servicos text,    -- serviços executados no dia
  ocorrencias text, -- acidentes, atrasos, falta de material, visitas...
  observacoes text,
  autor text not null, -- quem registrou ("Nome (Engenheiro)")
  criado_em timestamptz not null default now(),
  unique (obra_id, data)
);
create index on rdos (empresa_id);

-- Quem trabalhou na obra no dia. Prestador cadastrado (fornecedor) ou equipe própria (fornecedor_id nulo).
create table rdo_equipes (
  id int generated always as identity primary key,
  empresa_id int not null default empresa_atual() references empresas,
  rdo_id int not null references rdos,
  fornecedor_id int references fornecedores,
  nome text not null check (length(trim(nome)) > 0),
  funcao text,      -- o que a equipe fez (alvenaria, elétrica...)
  pessoas int not null check (pessoas between 1 and 999)
);
create index on rdo_equipes (rdo_id);

create table fotos (
  id int generated always as identity primary key,
  empresa_id int not null default empresa_atual() references empresas,
  obra_id int not null references obras,
  rdo_id int references rdos,
  caminho text not null unique, -- caminho no bucket "anexos"
  legenda text,
  autor text not null,
  criada_em timestamptz not null default now(),
  removida_em timestamptz       -- foto tirada da galeria (o arquivo e o registro ficam)
);
create index on fotos (obra_id, criada_em desc);

do $$
declare t text;
begin
  foreach t in array array['rdos', 'rdo_equipes', 'fotos'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy da_empresa on %I to app_web using (empresa_id = empresa_atual()) with check (empresa_id = empresa_atual())', t);
    execute format('create trigger historico after insert or update or delete on %I for each row execute function registrar_historico()', t);
  end loop;
end $$;

-- O RDO e as fotos são registro da obra: não se apagam. As equipes do dia podem ser corrigidas.
create trigger nao_apagar before delete on rdos for each row execute function proibir_exclusao();
create trigger nao_apagar before delete on fotos for each row execute function proibir_exclusao();

revoke all on rdos, rdo_equipes, fotos from anon, authenticated;
