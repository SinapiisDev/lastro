'use client'

import { useState } from 'react'
import { Campo, Dinheiro, Entrada } from '@ds'
import { brl, itemDaMedicao, totalItem, type ModoMedicao } from '@/lib/regras'

type Item = {
  id: number
  descricao: string
  etapa: string
  unidade: string
  quantidade: number
  medido: number
  precoUnitario: number
}

const num = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
const MODOS: [ModoMedicao, string][] = [
  ['quantidade', 'Quantidade'],
  ['percentual', '% do item'],
  ['valor', 'Valor (R$)'],
]

// Medição por quantidade, por % do item contratado ou por valor; mostra na hora quanto cada item e o total dão.
export function CamposMedicao({ itens }: { itens: Item[] }) {
  const [modo, setModo] = useState<ModoMedicao>('quantidade')
  const [digitado, setDigitado] = useState<Record<number, string>>({})
  const conta = itens.map((i) => {
    const bruto = (digitado[i.id] ?? '').replace(',', '.')
    const r = bruto ? itemDaMedicao(modo, Number(bruto), i) : null
    return {
      i,
      r,
      passou: typeof r === 'object' && r !== null && r.quantidade > i.quantidade - i.medido + 1e-4,
    }
  })
  const total = conta.reduce((t, c) => t + (c.r && typeof c.r === 'object' ? c.r.valor : 0), 0)
  const etapas = [...new Set(itens.map((i) => i.etapa))]

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="modo" value={modo} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label font-semibold text-ink-2">Medir por</span>
        <div role="radiogroup" aria-label="Medir por" className="flex gap-0.5 rounded-full bg-surface-2 p-1">
          {MODOS.map(([m, rotulo]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={modo === m}
              onClick={() => {
                setModo(m)
                setDigitado({})
              }}
              className={`inline-flex h-8 cursor-pointer items-center rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap ${modo === m ? 'bg-surface text-ink shadow-1' : 'text-ink-2 hover:text-ink'}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {etapas.map((e) => (
        <div key={e} className="flex flex-col gap-3">
          {etapas.length > 1 && <h3 className="text-label font-bold text-ink-3">{e}</h3>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {conta
              .filter((c) => c.i.etapa === e)
              .map(({ i, r, passou }) => {
                const saldo = i.quantidade - i.medido
                const sufixo = modo === 'quantidade' ? i.unidade : modo === 'percentual' ? '%' : 'R$'
                return (
                  <Campo
                    key={i.id}
                    rotulo={`${i.descricao} (${sufixo})`}
                    erro={typeof r === 'string' ? r : passou ? `passa do saldo (${num(saldo)} ${i.unidade})` : null}
                    ajuda={
                      r && typeof r === 'object'
                        ? `= ${num(r.quantidade)} ${i.unidade} · ${brl(r.valor)}`
                        : `Saldo: ${num(saldo)} ${i.unidade} · ${brl(totalItem(saldo, i.precoUnitario))} · ${Math.floor((i.medido / i.quantidade) * 100 + 1e-9)}% já medido`
                    }
                  >
                    <Entrada
                      name={`medir_${i.id}`}
                      type="number"
                      step="any"
                      min="0"
                      inputMode="decimal"
                      value={digitado[i.id] ?? ''}
                      onChange={(ev) => setDigitado((d) => ({ ...d, [i.id]: ev.target.value }))}
                      invalido={typeof r === 'string' || passou}
                    />
                  </Campo>
                )
              })}
          </div>
        </div>
      ))}

      <p className="text-[13px] font-semibold">
        Total desta medição: <Dinheiro valor={total} />
      </p>
    </div>
  )
}
