'use client'

import { useState } from 'react'
import { Botao, Campo, Entrada, SelecaoBusca } from '@ds'

export function ItensLivres({ subetapas }: { subetapas: { id: number; nome: string; etapa: string }[] }) {
  const [linhas, setLinhas] = useState(0)
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: linhas }, (_, k) => (
        <div key={k} className="grid gap-2.5 rounded-md border border-line p-3 sm:grid-cols-[1fr_6rem_6rem_14rem]">
          <Campo rotulo="Item fora do orçamento">
            <Entrada name="livre_descricao" required />
          </Campo>
          <Campo rotulo="Qtd.">
            <Entrada name="livre_quantidade" type="number" min="0.001" step="0.001" required />
          </Campo>
          <Campo rotulo="Un.">
            <Entrada name="livre_unidade" required />
          </Campo>
          <Campo rotulo="Etapa">
            <SelecaoBusca name="livre_subetapa" placeholder="Digite a etapa" opcoes={subetapas.map((s) => ({ valor: String(s.id), rotulo: s.nome, grupo: s.etapa }))} />
          </Campo>
        </div>
      ))}
      <Botao type="button" variante="suave" tamanho="sm" className="self-start" onClick={() => setLinhas(linhas + 1)}>
        + Incluir item fora do orçamento
      </Botao>
    </div>
  )
}
