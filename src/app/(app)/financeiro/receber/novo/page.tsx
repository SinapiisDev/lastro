import { CabecalhoTela } from '@ds'
import { sql, hoje } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { FormReceber } from './form-receber'

export default async function NovoDocumentoReceber() {
  await exigirSessao('financeiro', 'chefe')
  const [obras, dia] = await Promise.all([sql<{ id: number; nome: string }[]>`select id, nome from obras where ativa order by nome`, hoje()])
  return (
    <>
      <CabecalhoTela contexto="Contas a receber" titulo="Novo documento a receber" />
      <FormReceber obras={obras} hoje={dia} />
    </>
  )
}
