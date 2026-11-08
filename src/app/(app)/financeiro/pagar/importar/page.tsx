import { CabecalhoTela } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { FormImportar } from './form-importar'

// Importar milhares de parcelas de uma vez pode passar do tempo padrão das server actions desta página.
export const maxDuration = 300

export default async function ImportarPlanilha() {
  await exigirSessao('financeiro', 'chefe')
  const obras = await sql<{ id: number; nome: string }[]>`select id, nome from obras order by ativa desc, nome`
  return (
    <>
      <CabecalhoTela contexto="Contas a pagar" titulo="Importar planilha" />
      <FormImportar obras={obras} />
    </>
  )
}
