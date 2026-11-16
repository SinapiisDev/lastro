import 'server-only'
import { sql } from '@/lib/db'
import type { Servico } from './itens'

// Serviços da obra (subetapas do orçamento) com quanto já foi contratado de cada um.
export const servicosDaObra = (obraId: number) => sql<Servico[]>`
  select s.id, s.nome, e.nome as etapa, s.quantidade, s.unidade,
    coalesce((select sum(ci.quantidade) from contrato_itens ci where ci.subetapa_id = s.id), 0) as contratado
  from subetapas s join etapas e on e.id = s.etapa_id
  where e.obra_id = ${obraId} and not e.importada
  order by e.ordem, e.id, s.ordem, s.id`
