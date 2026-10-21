'use client'

import { useEffect } from 'react'

export default function Erro({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => console.error(error), [error])

  return (
    <div className="mx-auto grid max-w-md gap-3 px-4 py-12" role="alert">
      <h1>Não foi possível carregar esta página</h1>
      <p className="text-cinza">
        Pode ser uma falha passageira de conexão com o banco de dados. Tente de novo; se continuar, avise o responsável
        pelo sistema.
      </p>
      <button className="btn btn-principal justify-self-start" onClick={() => retry()}>
        Tentar de novo
      </button>
    </div>
  )
}
