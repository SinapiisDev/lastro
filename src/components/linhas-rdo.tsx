'use client'

import { useState, type CSSProperties } from 'react'
import { Botao, Entrada } from '@ds'
import type { CampoRdo, LinhaRdo } from '@/lib/rdo'

// Uma lista do RDO (tarefas, equipe, máquinas, materiais): linhas que o engenheiro adiciona e tira.
export function LinhasRdo({ prefixo, titulo, campos, botao, iniciais }: { prefixo: string; titulo: string; campos: CampoRdo[]; botao: string; iniciais: LinhaRdo[] }) {
  const vazia = () => Object.fromEntries(campos.map((c) => [c.nome, null]))
  const [linhas, setLinhas] = useState(() => (iniciais.length ? iniciais : [vazia()]).map((l, chave) => ({ chave, l })))
  const mais = () => setLinhas((ls) => [...ls, { chave: Math.max(0, ...ls.map((x) => x.chave)) + 1, l: vazia() }])
  const tirar = (chave: number) => setLinhas((ls) => ls.filter((x) => x.chave !== chave))
  const grade = { '--cols': `${campos.map((c) => c.largura).join(' ')} auto` } as CSSProperties

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-label font-semibold text-ink-2">{titulo}</legend>
      <div style={grade} className="hidden gap-2 text-caption font-semibold text-ink-3 sm:grid sm:grid-cols-(--cols)" aria-hidden>
        {campos.map((c) => (
          <span key={c.nome}>{c.rotulo}</span>
        ))}
      </div>
      {linhas.map(({ chave, l }) => (
        <div key={chave} style={grade} className="grid grid-cols-2 gap-2 border-b border-line pb-2 sm:grid-cols-(--cols) sm:border-0 sm:pb-0">
          {campos.map((c, i) => (
            <Entrada
              key={c.nome}
              name={`${prefixo}_${c.nome}`}
              type={c.tipo === 'texto' ? 'text' : 'number'}
              step={c.tipo === 'decimal' ? 'any' : undefined}
              min={c.tipo === 'texto' ? undefined : c.tipo === 'inteiro' ? 1 : 0}
              inputMode={c.tipo === 'texto' ? undefined : c.tipo === 'inteiro' ? 'numeric' : 'decimal'}
              list={c.lista}
              defaultValue={l[c.nome] ?? ''}
              placeholder={c.placeholder ?? c.rotulo}
              aria-label={c.rotulo}
              className={i === 0 ? 'col-span-2 sm:col-span-1' : ''}
            />
          ))}
          <Botao type="button" variante="fantasma" tamanho="sm" className="col-span-2 self-center justify-self-end sm:col-span-1" onClick={() => tirar(chave)}>
            Tirar
          </Botao>
        </div>
      ))}
      <Botao type="button" variante="suave" tamanho="sm" className="self-start" onClick={mais}>
        {botao}
      </Botao>
    </fieldset>
  )
}
