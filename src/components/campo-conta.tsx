import type { ReactNode } from 'react'
import { Campo, Selecao } from '@ds'

export type ContaOpcao = { id: number; nome: string }

// Conta do pagamento ou do recebimento. Sem conta cadastrada, some; com uma só, vai junto sem perguntar.
export function CampoConta({ contas, padrao, rotulo = 'Conta', className }: { contas: ContaOpcao[]; padrao?: number | null; rotulo?: ReactNode; className?: string }) {
  if (!contas.length) return null
  if (contas.length === 1) return <input type="hidden" name="conta" value={contas[0].id} />
  return (
    <Campo rotulo={rotulo} className={className}>
      <Selecao name="conta" required defaultValue={padrao ?? ''}>
        <option value="" disabled>
          Escolha a conta
        </option>
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Selecao>
    </Campo>
  )
}
