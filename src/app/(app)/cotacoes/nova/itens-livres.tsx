'use client'

import { useState } from 'react'
import { Botao, Campo, Entrada, Selecao } from '@ds'

export function ItensLivres({ subetapas }: { subetapas: { id: number; nome: string; etapa: string }[] }) {
  const [linhas, setLinhas] = useState(0)
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: linhas }, (_, k) => (
        <div key={k} className="grid gap-2.5 rounded-md bg-surface-2 p-3 sm:grid-cols-[1fr_6rem_6rem_14rem]">
          <Campo rotulo="Item fora do orçamento">
            <Entrada name="livre_descricao" required className="bg-surface" />
          </Campo>
          <Campo rotulo="Qtd.">
            <Entrada name="livre_quantidade" type="number" min="0.001" step="0.001" required className="bg-surface" />
          </Campo>
          <Campo rotulo="Un.">
            <Entrada name="livre_unidade" required className="bg-surface" />
          </Campo>
          <Campo rotulo="Etapa">
            <Selecao name="livre_subetapa" required defaultValue="" className="bg-surface">
              <option value="" disabled>
                Escolha
              </option>
              {subetapas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.etapa} / {s.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        </div>
      ))}
      <Botao type="button" variante="suave" tamanho="sm" className="self-start" onClick={() => setLinhas(linhas + 1)}>
        + Incluir item fora do orçamento
      </Botao>
    </div>
  )
}
