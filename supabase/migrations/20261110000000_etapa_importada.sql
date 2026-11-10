-- Etapa "Sistema anterior": onde ficam os documentos importados do sistema antigo, que não dizem a etapa da obra.
-- Não é fase de obra: fica fora da lista de etapas, do avanço e dos formulários; o gasto dela continua no total da obra
-- e aparece à parte, como "Gastos do sistema antigo (sem etapa)".
alter table etapas add column importada boolean not null default false;

-- Marcar as que já existem é ajuste do sistema, não evento de uma empresa: fora do histórico.
alter table etapas disable trigger historico;
alter table subetapas disable trigger historico;
update etapas set importada = true where nome = 'Sistema anterior';
update subetapas s set progresso = 0 from etapas e where e.id = s.etapa_id and e.importada and s.progresso <> 0;
alter table etapas enable trigger historico;
alter table subetapas enable trigger historico;

create unique index etapas_uma_importada on etapas (obra_id) where importada;
