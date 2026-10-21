'use client'

import { useState } from 'react'
import { Botao, Toast } from '@ds'

// Demonstração do aviso flutuante: ele some sozinho, então só aparece quando pedido.
export function DemoToast() {
  const [n, setN] = useState(0)
  return (
    <>
      <Botao type="button" variante="secundario" onClick={() => setN(n + 1)}>
        Mostrar aviso flutuante
      </Botao>
      {n > 0 && <Toast key={n} texto="Compra liberada." acao="Desfazer" />}
    </>
  )
}
