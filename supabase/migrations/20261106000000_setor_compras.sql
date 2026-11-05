-- Área "Compras": o setor de compras faz cotações e compras de todas as obras, sem mexer em diário, etapas ou financeiro.
alter table usuarios drop constraint usuarios_perfil_check;
alter table usuarios add constraint usuarios_perfil_check check (perfil in ('chefe', 'financeiro', 'obra', 'compras'));
