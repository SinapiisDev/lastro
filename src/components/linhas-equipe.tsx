'use client'

import { useState } from 'react'
import { Botao, Entrada } from '@ds'

type Linha = { chave: number; nome: string; funcao: string; pessoas: number | '' }

// Equipes que trabalharam no dia. O nome sugere os prestadores cadastrados; "Equipe própria" para o pessoal da construtora.
export function LinhasEquipe({ iniciais, prestadores }: { iniciais: { nome: string; funcao: string | null; pessoas: number }[]; prestadores: string[] }) {
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    (iniciais.length ? iniciais : [{ nome: '', funcao: '', pessoas: '' as const }]).map((l, i) => ({ chave: i, nome: l.nome, funcao: l.funcao ?? '', pessoas: l.pessoas })),
  )
  const mais = () => setLinhas((ls) => [...ls, { chave: Math.max(0, ...ls.map((l) => l.chave)) + 1, nome: '', funcao: '', pessoas: '' }])
  const tirar = (chave: number) => setLinhas((ls) => ls.filter((l) => l.chave !== chave))

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-label font-semibold text-ink-2">Equipes na obra hoje</legend>
      <datalist id="prestadores">
        <option value="Equipe própria" />
        {prestadores.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {linhas.map((l) => (
        <div key={l.chave} className="grid grid-cols-[1fr_88px_auto] gap-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_96px_auto]">
          <Entrada name="equipe_nome" list="prestadores" defaultValue={l.nome} placeholder="Equipe ou prestador" aria-label="Equipe ou prestador" />
          <Entrada name="equipe_funcao" defaultValue={l.funcao} placeholder="Serviço (ex.: alvenaria)" aria-label="Serviço da equipe" className="col-span-3 row-start-2 sm:col-span-1 sm:row-start-auto" />
          <Entrada name="equipe_pessoas" type="number" min={1} max={999} inputMode="numeric" defaultValue={l.pessoas} placeholder="Pessoas" aria-label="Quantas pessoas" />
          <Botao type="button" variante="fantasma" tamanho="sm" className="self-center" onClick={() => tirar(l.chave)} aria-label="Tirar esta equipe">
            Tirar
          </Botao>
        </div>
      ))}
      <Botao type="button" variante="suave" tamanho="sm" className="self-start" onClick={mais}>
        + Adicionar equipe
      </Botao>
    </fieldset>
  )
}
