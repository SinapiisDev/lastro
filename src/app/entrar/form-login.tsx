'use client'

import { useState } from 'react'
import { FormAcao } from '@/components/form-acao'
import { entrar } from './acoes'

const TIPOS = [
  ['obra', 'Obra'],
  ['financeiro', 'Financeiro'],
  ['chefe', 'Chefe'],
] as const

export function FormLogin({ obras }: { obras: { id: number; nome: string }[] }) {
  const [tipo, setTipo] = useState<string>('obra')
  return (
    <FormAcao action={entrar} botao="Entrar" principal className="cartao grid gap-4">
      <fieldset>
        <legend className="rotulo">Acesso</legend>
        <div className="grid grid-cols-3 gap-2">
          {TIPOS.map(([valor, texto]) => (
            <label
              key={valor}
              className={`btn ${tipo === valor ? 'border-grafite! bg-concreto font-semibold' : ''}`}
            >
              <input
                type="radio"
                name="tipo"
                value={valor}
                checked={tipo === valor}
                onChange={() => setTipo(valor)}
                className="sr-only"
              />
              {texto}
            </label>
          ))}
        </div>
      </fieldset>
      {tipo === 'obra' && (
        <label>
          <span className="rotulo">Obra</span>
          <select name="obra" className="campo" required>
            {obras.length === 0 && <option value="">Nenhuma obra cadastrada ainda</option>}
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span className="rotulo">Senha</span>
        <input name="senha" type="password" className="campo" required autoComplete="current-password" />
      </label>
    </FormAcao>
  )
}
