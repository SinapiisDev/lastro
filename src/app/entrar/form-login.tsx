'use client'

import { useState } from 'react'
import { Campo, Entrada, FormAcao } from '@ds'
import { entrar } from './acoes'

const PERFIS = [
  ['obra', 'Obra', 'Engenheiro no canteiro'],
  ['financeiro', 'Financeiro', 'Pagamentos e caixa'],
  ['chefe', 'Chefe', 'Aprova compras grandes'],
] as const

const codigo = (id: number) => `OB-${String(id).padStart(3, '0')}`

export function FormLogin({ obras }: { obras: { id: number; nome: string; endereco: string | null }[] }) {
  const [tipo, setTipo] = useState<string>('obra')
  const [obra, setObra] = useState<number | undefined>(obras[0]?.id)
  const nome = PERFIS.find((p) => p[0] === tipo)![1]

  return (
    <FormAcao action={entrar} botao={`Entrar como ${nome}`} variante="primario" tamanho="lg" largura className="flex flex-1 flex-col gap-7">
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-label font-semibold text-ink-2">1 · Tipo de acesso</legend>
        <div className="grid grid-cols-3 gap-2">
          {PERFIS.map(([valor, texto, descricao]) => {
            const sel = tipo === valor
            return (
              <label
                key={valor}
                className={`flex min-h-[104px] cursor-pointer flex-col justify-between gap-2 rounded-[18px] border-[1.5px] p-3.5 transition-colors has-focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--focus)] ${
                  sel ? 'border-ink bg-ink text-on-ink' : 'border-line bg-surface hover:border-ink-3'
                }`}
              >
                <input type="radio" name="tipo" value={valor} checked={sel} onChange={() => setTipo(valor)} className="sr-only" />
                <span
                  aria-hidden
                  className={`flex size-[22px] items-center justify-center rounded-full text-label font-bold ${sel ? 'bg-accent text-fixed-ink' : 'border-[1.5px] border-line'}`}
                >
                  {sel && '✓'}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{texto}</span>
                  <span className={`text-caption ${sel ? 'opacity-70' : 'text-ink-3'}`}>{descricao}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {tipo === 'obra' && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-2.5 text-label font-semibold text-ink-2">2 · Obra</legend>
          {obras.length === 0 && <span className="text-table text-ink-3">Nenhuma obra cadastrada ainda. Peça ao chefe.</span>}
          {obras.map((o) => {
            const sel = obra === o.id
            return (
              <label
                key={o.id}
                className={`grid cursor-pointer grid-cols-[20px_1fr_auto] items-center gap-3 rounded-md border-[1.5px] px-3.5 py-3 transition-colors hover:bg-surface-2 has-focus-visible:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--focus)] ${
                  sel ? 'border-ink bg-surface-2' : 'border-line'
                }`}
              >
                <input type="radio" name="obra" value={o.id} checked={sel} onChange={() => setObra(o.id)} className="sr-only" required />
                <span aria-hidden className={`flex size-[18px] items-center justify-center rounded-full border-[1.5px] ${sel ? 'border-ink' : 'border-ink-3'}`}>
                  <span className={`size-2 rounded-full ${sel ? 'bg-ink' : ''}`} />
                </span>
                <span className="flex flex-col gap-px">
                  <span className="text-body font-semibold">{o.nome}</span>
                  {o.endereco && <span className="text-caption text-ink-3">{o.endereco}</span>}
                </span>
                <span className="text-caption font-semibold text-ink-3">{codigo(o.id)}</span>
              </label>
            )
          })}
        </fieldset>
      )}

      <Campo rotulo={`${tipo === 'obra' ? 3 : 2} · Senha`}>
        <Entrada name="senha" type="password" required autoComplete="current-password" placeholder="Senha de acesso" className="min-h-12 text-[16px] font-semibold tracking-[.2em]" />
      </Campo>
      <span className="flex-1" />
      <span className="order-last -mt-3 text-center text-label text-ink-3">Esqueceu a senha? Peça ao chefe para redefinir.</span>
    </FormAcao>
  )
}
