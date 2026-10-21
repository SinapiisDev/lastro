'use client'

import { useEffect } from 'react'
import { Botao, Cartao } from '@ds'

export default function Erro({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => console.error(error), [error])

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12" role="alert">
      <Cartao className="flex flex-col items-start gap-3">
        <h1 className="font-display text-h1 font-light">Não foi possível carregar esta página</h1>
        <p className="text-ink-2">Pode ser uma falha passageira de conexão com o banco de dados. Tente de novo; se continuar, avise o responsável pelo sistema.</p>
        <Botao onClick={() => retry()}>Tentar de novo</Botao>
      </Cartao>
    </div>
  )
}
