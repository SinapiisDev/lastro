'use client'

import { useState } from 'react'

export function ItensLivres({ subetapas }: { subetapas: { id: number; nome: string; etapa: string }[] }) {
  const [linhas, setLinhas] = useState(0)
  return (
    <div className="grid gap-3">
      {Array.from({ length: linhas }, (_, k) => (
        <div key={k} className="grid gap-2 border-b border-linha pb-3 sm:grid-cols-[1fr_6rem_6rem_14rem]">
          <label>
            <span className="rotulo">Item fora do orçamento</span>
            <input name="livre_descricao" required className="campo" />
          </label>
          <label>
            <span className="rotulo">Qtd.</span>
            <input name="livre_quantidade" type="number" min="0.001" step="0.001" required className="campo" />
          </label>
          <label>
            <span className="rotulo">Un.</span>
            <input name="livre_unidade" required className="campo" />
          </label>
          <label>
            <span className="rotulo">Etapa</span>
            <select name="livre_subetapa" required defaultValue="" className="campo">
              <option value="" disabled>
                Escolha
              </option>
              {subetapas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.etapa} / {s.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      ))}
      <button type="button" className="justify-self-start text-sm underline" onClick={() => setLinhas(linhas + 1)}>
        Incluir item fora do orçamento
      </button>
    </div>
  )
}
