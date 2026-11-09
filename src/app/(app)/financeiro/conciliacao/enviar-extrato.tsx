'use client'

import { CampoAnexo, FormAcao, type Acao } from '@ds'

function validarOfx(f: File) {
  if (!/\.ofx$/i.test(f.name)) return 'Envie o extrato em .ofx (no internet banking: Extrato › Exportar › OFX).'
  if (f.size > 5 * 1024 * 1024) return 'Arquivo maior que 5 MB. Baixe um período menor.'
  return null
}

export function EnviarExtrato({ action }: { action: Acao }) {
  return (
    <FormAcao action={action} botao="Enviar extrato" variante="primario" className="flex flex-col gap-3">
      <CampoAnexo name="extrato" titulo="Arquivo do extrato (.ofx)" descricao="Pode mandar o mesmo período de novo: o que já veio não duplica." accept=".ofx" validar={validarOfx} obrigatorio />
    </FormAcao>
  )
}
