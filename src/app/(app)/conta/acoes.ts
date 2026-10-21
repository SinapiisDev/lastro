'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { sql, escrever } from '@/lib/db'
import { criarSessao, exigirSessao, nomePerfil } from '@/lib/sessao'
import type { Estado } from '@ds'

export async function trocarMinhaSenha(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  const atual = String(d.get('atual') ?? '')
  const nova = String(d.get('senha') ?? '')
  if (nova.length < 10) return { erro: 'Use uma senha com pelo menos 10 caracteres.' }
  if (nova !== String(d.get('confirmar') ?? '')) return { erro: 'As duas senhas novas não são iguais.' }
  const [ok] = await sql`select 1 from usuarios where id = ${s.usuarioId} and senha = extensions.crypt(${atual}, senha)`
  if (!ok) return { erro: 'A senha atual não confere.' }
  const [u] = await escrever(nomePerfil(s), (tx) => tx<{ senha: string }[]>`
    update usuarios set senha = extensions.crypt(${nova}, extensions.gen_salt('bf')) where id = ${s.usuarioId} returning senha`)
  // A troca derruba as sessões abertas com a senha antiga; esta continua com a nova.
  await criarSessao({ id: s.usuarioId, nome: s.nome, perfil: s.perfil, senha: u.senha }, s.obraId)
  return { ok: 'Senha trocada. Se você estava conectado em outro aparelho, vai precisar entrar de novo lá.' }
}

export async function trocarObra(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra')
  const obraId = Number(d.get('obra'))
  const [u] = await sql<{ senha: string }[]>`
    select u.senha from usuarios u join usuario_obras uo on uo.usuario_id = u.id join obras o on o.id = uo.obra_id
    where u.id = ${s.usuarioId} and uo.obra_id = ${obraId} and o.ativa`
  if (!u) return { erro: 'Escolha uma das suas obras.' }
  await criarSessao({ id: s.usuarioId, nome: s.nome, perfil: s.perfil, senha: u.senha }, obraId)
  redirect(`/obras/${obraId}`)
}

export async function marcarPassoAPasso(visto: boolean): Promise<Estado> {
  const s = await exigirSessao()
  await sql`update usuarios set tutorial_visto_em = ${visto ? sql`now()` : null} where id = ${s.usuarioId}`
  refresh()
  return null
}
