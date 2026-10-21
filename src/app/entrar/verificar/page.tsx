import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { BotaoLink, Campo, Entrada, FormAcao } from '@ds'
import { sqlSistema as sql } from '@/lib/db'
import { lerPreSessao, ROTULO_PERFIL, type Perfil } from '@/lib/sessao'
import { variantesWhatsapp } from '@/lib/cotacao'
import { Moldura } from '../moldura'
import { confirmarCodigo, reenviarCodigo, escolherEmpresa, escolherObra } from '../acoes'

export const instant = false

const opcao =
  'flex cursor-pointer items-center gap-3 rounded-md border-[1.5px] border-line px-3.5 py-3 hover:bg-surface-2 has-checked:border-ink has-checked:bg-surface-2'

// Depois do celular: o código do WhatsApp, a construtora (se a pessoa estiver em mais de uma) e a obra (engenheiro).
export default async function Verificar() {
  await connection()
  const pre = await lerPreSessao()
  if (!pre) redirect('/entrar')
  const voltar = (
    <BotaoLink href="/entrar" variante="fantasma" tamanho="sm" className="self-center">
      Usar outro número
    </BotaoLink>
  )

  if (!pre.codigoOk) {
    return (
      <Moldura
        titulo="Digite o código"
        subtitulo={`Mandamos um código de 6 números para o WhatsApp terminado em ${pre.celular.slice(-4)}. Ele vale por 10 minutos.`}
      >
        {pre.codigoTela && (
          <p className="rounded-md bg-warn-bg px-3.5 py-3 text-label leading-normal font-semibold text-warn">
            WhatsApp simulado (desenvolvimento): o código é <span className="font-bold tracking-[.2em]">{pre.codigoTela}</span>. Com a Meta configurada,
            ele chega só no WhatsApp.
          </p>
        )}
        <FormAcao action={confirmarCodigo} botao={pre.cadastro ? 'Criar e entrar' : 'Entrar'} variante="primario" tamanho="lg" largura className="flex flex-col gap-4">
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

  if (!pre.usuarioId) {
    const pessoas = await sql<{ id: number; perfil: Perfil; empresa: string }[]>`
      select u.id, u.perfil, c.nome_empresa as empresa
      from usuarios u join empresas e on e.id = u.empresa_id join config c on c.empresa_id = u.empresa_id
      where u.celular = any(${variantesWhatsapp(pre.celular)}) and u.ativo and e.ativa order by c.nome_empresa`
    return (
      <Moldura titulo="Qual construtora?" subtitulo="Seu número está em mais de uma construtora. Escolha em qual vai entrar agora.">
        <FormAcao action={escolherEmpresa} botao="Entrar" variante="primario" tamanho="lg" largura className="flex flex-col gap-2">
          {pessoas.map((p, i) => (
            <label key={p.id} className={opcao}>
              <input type="radio" name="pessoa" value={p.id} defaultChecked={i === 0} className="ds-check rounded-full" required />
              <span className="flex flex-col">
                <span className="text-body font-semibold">{p.empresa}</span>
                <span className="text-caption text-ink-3">{ROTULO_PERFIL[p.perfil]}</span>
              </span>
            </label>
          ))}
        </FormAcao>
        {voltar}
      </Moldura>
    )
  }

  const obras = await sql<{ id: number; nome: string; endereco: string | null }[]>`
    select o.id, o.nome, o.endereco from usuario_obras uo join obras o on o.id = uo.obra_id
    join usuarios u on u.id = uo.usuario_id
    where uo.usuario_id = ${pre.usuarioId} and u.celular = any(${variantesWhatsapp(pre.celular)}) and o.ativa order by o.nome`
  return (
    <Moldura titulo="Qual obra?" subtitulo="Você cuida de mais de uma obra. Escolha em qual vai trabalhar agora; dá para trocar depois em Minha conta.">
      <FormAcao action={escolherObra} botao="Entrar na obra" variante="primario" tamanho="lg" largura className="flex flex-col gap-2">
        {obras.map((o, i) => (
          <label key={o.id} className={opcao}>
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
