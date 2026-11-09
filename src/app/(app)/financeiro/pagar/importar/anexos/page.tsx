import { CabecalhoTela } from '@ds'
import { exigirSessao } from '@/lib/sessao'
import { FormAnexos } from './form-anexos'

export default async function ImportarAnexos() {
  await exigirSessao('financeiro', 'chefe')
  return (
    <>
      <CabecalhoTela contexto="Contas a pagar" titulo="Importar anexos do sistema antigo" />
      <FormAnexos />
    </>
  )
}
