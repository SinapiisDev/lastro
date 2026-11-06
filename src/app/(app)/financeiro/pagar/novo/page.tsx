import { CabecalhoTela } from '@ds'
import { sql, hoje } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { FormDocumento } from './form-documento'

export default async function NovoDocumentoPagar() {
  await exigirSessao('financeiro', 'chefe')
  const [obras, servicos, fornecedores, dia] = await Promise.all([
    sql<{ id: number; nome: string }[]>`select id, nome from obras where ativa order by nome`,
    // Serviços (subetapas) de todas as obras ativas, na ordem do orçamento.
    sql<{ id: number; obraId: number; etapa: string; nome: string; grupo: string | null }[]>`
      select s.id, e.obra_id as "obraId", e.nome as etapa, s.nome, s.grupo
      from subetapas s join etapas e on e.id = s.etapa_id join obras o on o.id = e.obra_id
      where o.ativa order by e.obra_id, e.ordem, e.id, s.ordem, s.id`,
    sql<{ id: number; nome: string }[]>`select id, nome from fornecedores order by nome`,
    hoje(),
  ])
  return (
    <>
      <CabecalhoTela contexto="Contas a pagar" titulo="Novo documento a pagar" />
      <FormDocumento obras={obras} servicos={servicos} fornecedores={fornecedores} hoje={dia} />
    </>
  )
}
