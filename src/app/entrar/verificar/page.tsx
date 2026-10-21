import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { BotaoLink, Campo, Entrada, FormAcao } from '@ds'
import { sql, lerConfig } from '@/lib/db'
import { lerPreSessao } from '@/lib/sessao'
import { Moldura } from '../moldura'
import { confirmarCodigo, reenviarCodigo, escolherObra } from '../acoes'

export const instant = false

// Depois do celular: o código do WhatsApp e, para engenheiro com mais de uma obra, a escolha da obra.
export default async function Verificar() {
  await connection()
  const pre = await lerPreSessao()
  if (!pre) redirect('/entrar')
  const [[u], config] = await Promise.all([
    sql<{ nome: string; celular: string }[]>`select nome, celular from usuarios where id = ${pre.usuarioId} and ativo`,
    lerConfig(),
  ])
  if (!u) redirect('/entrar')
  const voltar = (
    <BotaoLink href="/entrar" variante="fantasma" tamanho="sm" className="self-center">
      Usar outro número
    </BotaoLink>
  )

  if (!pre.codigoOk) {
    return (
      <Moldura
        empresa={config.nomeEmpresa}
        titulo="Digite o código"
        subtitulo={`Mandamos um código de 6 números para o WhatsApp terminado em ${u.celular.slice(-4)}. Ele vale por 10 minutos.`}
      >
        {pre.codigoTela && (
          <p className="rounded-md bg-warn-bg px-3.5 py-3 text-label leading-normal font-semibold text-warn">
            WhatsApp simulado (desenvolvimento): o código é <span className="font-bold tracking-[.2em]">{pre.codigoTela}</span>. Com a Meta configurada,
            ele chega só no WhatsApp.
          </p>
        )}
        <FormAcao action={confirmarCodigo} botao="Entrar" variante="primario" tamanho="lg" largura className="flex flex-col gap-4">
          <Campo rotulo="Código">
            <Entrada
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              required
              autoFocus
              className="min-h-12 text-center text-[20px] tracking-[.4em]"
            />
          </Campo>
        </FormAcao>
        <FormAcao action={reenviarCodigo} botao="Mandar outro código" variante="fantasma" tamanho="sm" className="flex flex-col items-center gap-1" />
        {voltar}
      </Moldura>
    )
  }

  const obras = await sql<{ id: number; nome: string; endereco: string | null }[]>`
    select o.id, o.nome, o.endereco from usuario_obras uo join obras o on o.id = uo.obra_id
    where uo.usuario_id = ${pre.usuarioId} and o.ativa order by o.nome`
  return (
    <Moldura empresa={config.nomeEmpresa} titulo="Qual obra?" subtitulo="Você cuida de mais de uma obra. Escolha em qual vai trabalhar agora; dá para trocar depois em Minha conta.">
      <FormAcao action={escolherObra} botao="Entrar na obra" variante="primario" tamanho="lg" largura className="flex flex-col gap-2">
        {obras.map((o, i) => (
          <label
            key={o.id}
            className="flex cursor-pointer items-center gap-3 rounded-md border-[1.5px] border-line px-3.5 py-3 hover:bg-surface-2 has-checked:border-ink has-checked:bg-surface-2"
          >
            <input type="radio" name="obra" value={o.id} defaultChecked={i === 0} className="ds-check rounded-full" required />
            <span className="flex flex-col">
              <span className="text-body font-semibold">{o.nome}</span>
              {o.endereco && <span className="text-caption text-ink-3">{o.endereco}</span>}
            </span>
          </label>
        ))}
      </FormAcao>
      {voltar}
    </Moldura>
  )
}
