'use client'

import { useState } from 'react'
import { Campo, Cartao, Dinheiro, Entrada, FormAcao, Selecao } from '@ds'
import { CamposParcelas, useParcelamento } from '@/components/parcelamento'
import { NATUREZAS, TIPOS_DOCUMENTO } from '@/components/rotulos'
import { criarEntrada } from '../../acoes'

export function FormReceber({ obras, hoje }: { obras: { id: number; nome: string }[]; hoje: string }) {
  const [valor, setValor] = useState('')
  const [natureza, setNatureza] = useState('provisao')
  const total = Number(valor)
  const pc = useParcelamento(total, hoje)

  return (
    <FormAcao action={criarEntrada} botao="Lançar a receber" variante="primario" tamanho="lg" className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <input type="hidden" name="voltar" value="1" />
      <div className="flex min-w-0 flex-col gap-4 xl:row-span-2">
        <Cartao className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-normal">Documento</h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label font-semibold text-ink-2">Tipo</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(NATUREZAS).map(([k, [nome, explica]]) => (
                <label key={k} className={`flex cursor-pointer flex-col rounded-md border px-3.5 py-2.5 ${natureza === k ? 'border-ink bg-surface-2' : 'border-line'}`}>
                  <span className="flex items-center gap-2 text-table font-semibold">
                    <input type="radio" name="natureza" value={k} checked={natureza === k} onChange={() => setNatureza(k)} />
                    {nome}
                  </span>
                  <span className="text-caption text-ink-3">{explica}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Campo rotulo="Obra">
              <Selecao name="obra" required defaultValue="">
                <option value="" disabled>
                  Escolha a obra
                </option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Descrição">
              <Entrada name="descricao" required placeholder="Ex.: Aporte obras, 3ª medição" />
            </Campo>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Campo rotulo="Tipo do documento">
              <Selecao name="tipo_documento" defaultValue="contrato">
                {Object.entries(TIPOS_DOCUMENTO).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Número (opcional)">
              <Entrada name="numero_documento" />
            </Campo>
            <Campo rotulo="Emissão (opcional)">
              <Entrada name="emissao" type="date" defaultValue={hoje} />
            </Campo>
          </div>
        </Cartao>

        <Cartao className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-normal">Valor e parcelas</h2>
          <CamposParcelas p={pc} total={total}>
            <Campo rotulo="Valor total (R$)">
              <Entrada name="valor" type="number" min="0.01" step="0.01" required value={valor} onChange={(e) => setValor(e.target.value)} className="text-right" />
            </Campo>
          </CamposParcelas>
        </Cartao>
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-4">
        <Cartao tom="noite" as="div" className="flex flex-col gap-3">
          <span className="text-label font-semibold text-night-ink-3">Total a receber</span>
          <span className="font-display text-[36px] leading-tight font-light">{total > 0 ? <Dinheiro valor={total} noturno /> : 'R$ 0,00'}</span>
          <span className="text-label font-medium text-night-ink-2">
            {pc.parcelas.length > 1 ? `${pc.parcelas.length} parcelas a partir de ${pc.primeiro.split('-').reverse().join('/')}` : 'Recebimento em uma vez'}
          </span>
        </Cartao>
      </aside>
    </FormAcao>
  )
}
