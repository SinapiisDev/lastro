'use server'

import { redirect } from 'next/navigation'
import { sqlSistema as sql } from '@/lib/db'
import { criarPreSessao, lerPreSessao, ROTULO_PERFIL } from '@/lib/sessao'
import {
  MSG_BLOQUEIO,
  MSG_IP,
  conferirSenha,
  convitePodeDefinirSenha,
  conviteValido,
  definirSenha,
  entrarComo,
  errou,
  hashConvite,
  ipBloqueado,
  normalizarEmail,
  validarSenha,
} from '@/lib/contas'
import type { Estado } from '@ds'

// Passo 1 do link: a pessoa digita o e-mail em que o dono a cadastrou.
export async function confirmarEmail(token: string, _: Estado, d: FormData): Promise<Estado> {
  const c = await conviteValido(token)
  if (!c) redirect(`/convite/${token}`)
  if (normalizarEmail(String(d.get('email') ?? '')) !== c.email)
    return { erro: 'Este link é de outro e-mail. Use o e-mail em que o dono da construtora cadastrou você.' }
  await criarPreSessao({ email: c.email, senhaOk: false, convite: c.id })
  redirect(`/convite/${token}`)
}

// Passo 2: cria a senha (ou confirma a que já tem, se a conta existe em outra construtora) e entra.
export async function concluirAcesso(token: string, _: Estado, d: FormData): Promise<Estado> {
  const c = await conviteValido(token)
  const pre = await lerPreSessao()
  if (!c || pre?.convite !== c.id || pre.email !== c.email) redirect(`/convite/${token}`)
  if (await ipBloqueado()) return { erro: MSG_IP }
  const senha = String(d.get('senha') ?? '')
  const criar = await convitePodeDefinirSenha(c.email, c.empresaId)
  let v: number | undefined
  if (criar) {
    const invalida = validarSenha(senha, String(d.get('confirmar') ?? ''))
    if (invalida) return { erro: invalida }
  } else {
    const k = await conferirSenha(c.email, senha)
    if (k.bloqueada) return { erro: MSG_BLOQUEIO }
    if (!k.certa) {
      await errou(c.email)
      return { erro: 'Senha incorreta. É a senha que você já usa no Lastro.' }
    }
    await sql`update contas set tentativas = 0 where email = ${c.email}`
    v = k.v
  }

  // O link vale uma vez: quem apagar o código primeiro leva.
  const usado = await sql.begin(async (tx) => {
    await tx`select set_config('app.empresa_id', ${String(c.empresaId)}, true), set_config('app.perfil', ${`${c.nome} (${ROTULO_PERFIL[c.perfil]})`}, true)`
    const r = await tx`update usuarios set convite = null, convite_expira_em = null where id = ${c.id} and convite = ${hashConvite(token)} returning id`
    return r.length > 0
  })
  if (!usado) redirect(`/convite/${token}`)
  return entrarComo(c, v ?? (await definirSenha(c.email, senha)))
}
