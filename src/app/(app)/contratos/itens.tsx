'use client'

import { useState } from 'react'
import { Botao, Campo, Dinheiro, Entrada, SelecaoBusca } from '@ds'
import { totalItem } from '@/lib/regras'

export type Servico = { id: number; nome: string; etapa: string; quantidade: number | null; unidade: string | null; contratado: number }
type Linha = { k: number; sub: string; desc: string; unid: string; qtd: string; preco: string }

const num = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
let proxima = 1
const vazia = (): Linha => ({ k: proxima++, sub: '', desc: '', unid: '', qtd: '', preco: '' })

// Linhas do contrato (ou do aditivo): serviço do orçamento, quantidade e preço combinados com o empreiteiro.
export function ItensContrato({ servicos }: { servicos: Servico[] }) {
  const [linhas, setLinhas] = useState<Linha[]>(() => [vazia()])
  const muda = (k: number, campo: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.k === k ? { ...l, ...campo } : l)))
  const opcoes = servicos.map((x) => ({ valor: String(x.id), rotulo: x.nome, grupo: x.etapa, detalhe: x.quantidade ? `orçamento: ${num(x.quantidade)} ${x.unidade ?? ''}` : undefined }))
  const total = linhas.reduce((t, l) => t + (Number(l.qtd) > 0 && Number(l.preco) >= 0 ? totalItem(Number(l.qtd), Number(l.preco)) : 0), 0)

  return (
    <div className="flex flex-col gap-3">
      {linhas.map((l, i) => {
        const s = servicos.find((x) => String(x.id) === l.sub)
        return (
          <div key={l.k} className="flex flex-col gap-3 rounded-md border border-line p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-label font-semibold text-ink-3">Item {i + 1}</span>
              {linhas.length > 1 && (
                <button type="button" onClick={() => setLinhas((ls) => ls.filter((x) => x.k !== l.k))} className="text-label font-semibold text-ink-2 underline">
                  Tirar
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                rotulo="Serviço do orçamento"
                ajuda={
                  s &&
                  (s.quantidade
                    ? `Orçamento: ${num(s.quantidade)} ${s.unidade ?? ''} · já contratado: ${num(s.contratado)} ${s.unidade ?? ''}`
                    : 'Serviço sem quantidade no orçamento: a medição não mexe no % feito.')
                }
              >
                <SelecaoBusca
                  name="item_subetapa"
                  valor={l.sub}
                  opcoes={opcoes}
                  placeholder="Digite o serviço (ex.: pintura)"
                  aoMudar={(v) => {
                    const novo = servicos.find((x) => String(x.id) === v)
                    muda(l.k, { sub: v, desc: l.desc || novo?.nome || '', unid: l.unid || novo?.unidade || '' })
                  }}
                />
              </Campo>
              <Campo rotulo="Descrição no contrato">
                <Entrada name="item_descricao" value={l.desc} onChange={(e) => muda(l.k, { desc: e.target.value })} placeholder="Ex.: Pintura de parede, 2 demãos" />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo rotulo="Quantidade">
                <Entrada name="item_quantidade" type="number" step="any" min="0" inputMode="decimal" value={l.qtd} onChange={(e) => muda(l.k, { qtd: e.target.value })} />
              </Campo>
              <Campo rotulo="Unidade">
                <Entrada name="item_unidade" value={l.unid} onChange={(e) => muda(l.k, { unid: e.target.value })} placeholder="m²" />
              </Campo>
              <Campo rotulo="Preço unitário (R$)">
                <Entrada name="item_preco" type="number" step="0.01" min="0" inputMode="decimal" value={l.preco} onChange={(e) => muda(l.k, { preco: e.target.value })} />
              </Campo>
              <div className="flex flex-col justify-end gap-1.5 pb-2.5">
                <span className="text-label font-semibold text-ink-2">Total do item</span>
                <span className="font-semibold">
                  <Dinheiro valor={Number(l.qtd) > 0 && Number(l.preco) >= 0 ? totalItem(Number(l.qtd), Number(l.preco)) : 0} />
                </span>
              </div>
            </div>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Botao type="button" variante="secundario" onClick={() => setLinhas((ls) => [...ls, vazia()])}>
          + Adicionar outro serviço
        </Botao>
        <span className="text-[13px] font-semibold">
          Total: <Dinheiro valor={total} />
        </span>
      </div>
    </div>
  )
}
