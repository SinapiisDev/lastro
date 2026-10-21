'use server'

import { redirect, notFound } from 'next/navigation'
import { refresh } from 'next/cache'
import { sql, escrever } from '@/lib/db'
import { exigirSessao, podeVerObra, nomePerfil, type Sessao } from '@/lib/sessao'
import { ETAPAS_PADRAO } from '@/lib/etapas-padrao'
import type { Estado } from '@ds'

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()

async function obraDaEtapa(s: Sessao, etapaId: number) {
  const [e] = await sql<{ obraId: number }[]>`select obra_id as "obraId" from etapas where id = ${etapaId}`
  if (!e || !podeVerObra(s, e.obraId)) notFound()
}

async function obraDaSubetapa(s: Sessao, subetapaId: number) {
  const [e] = await sql<{ obraId: number }[]>`
    select e.obra_id as "obraId" from subetapas s join etapas e on e.id = s.etapa_id where s.id = ${subetapaId}`
  if (!e || !podeVerObra(s, e.obraId)) notFound()
}

export async function criarObra(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('chefe', 'financeiro')
  const nome = texto(d, 'nome')
  const senha = String(d.get('senha') ?? '')
  if (!nome) return { erro: 'Informe o nome da obra.' }
  if (senha.length < 8) return { erro: 'A senha da obra precisa ter pelo menos 8 caracteres.' }
  let id: number
  try {
    id = await escrever(nomePerfil(s), async (tx) => {
      const [o] = await tx<{ id: number }[]>`
        insert into obras (nome, endereco, senha)
        values (${nome}, ${texto(d, 'endereco') || null}, extensions.crypt(${senha}, extensions.gen_salt('bf')))
        returning id`
      for (const [i, [etapa, subetapas]] of ETAPAS_PADRAO.entries()) {
        const [e] = await tx<{ id: number }[]>`
          insert into etapas (obra_id, nome, ordem) values (${o.id}, ${etapa}, ${i + 1}) returning id`
        for (const [j, sub] of subetapas.entries()) {
          await tx`insert into subetapas (etapa_id, nome, ordem) values (${e.id}, ${sub}, ${j + 1})`
        }
      }
      return o.id
    })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { erro: 'Já existe uma obra com esse nome.' }
    throw e
  }
  redirect(`/obras/${id}`)
}

export async function salvarProgresso(subetapaId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra', 'chefe')
  await obraDaSubetapa(s, subetapaId)
  const progresso = Number(d.get('progresso'))
  if (!Number.isInteger(progresso) || progresso < 0 || progresso > 100) return { erro: 'Use um número de 0 a 100.' }
  await escrever(nomePerfil(s), (tx) => tx`update subetapas set progresso = ${progresso} where id = ${subetapaId}`)
  refresh()
  return { ok: 'Salvo.' }
}

export async function salvarEtapa(etapaId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  await obraDaEtapa(s, etapaId)
  const nome = texto(d, 'nome')
  const ordem = Number(d.get('ordem'))
  if (!nome) return { erro: 'Informe o nome.' }
  if (!Number.isInteger(ordem)) return { erro: 'Ordem inválida.' }
  await escrever(nomePerfil(s), (tx) => tx`update etapas set nome = ${nome}, ordem = ${ordem} where id = ${etapaId}`)
  refresh()
  return { ok: 'Salvo.' }
}

export async function removerEtapa(etapaId: number): Promise<Estado> {
  const s = await exigirSessao()
  await obraDaEtapa(s, etapaId)
  try {
    await escrever(nomePerfil(s), (tx) => tx`delete from etapas where id = ${etapaId}`)
  } catch (e) {
    if ((e as { code?: string }).code === '23503') return { erro: 'Essa etapa tem compras ou itens de orçamento ligados e não pode ser removida.' }
    throw e
  }
  refresh()
  return null
}

export async function adicionarEtapa(obraId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  if (!podeVerObra(s, obraId)) notFound()
  const nome = texto(d, 'nome')
  if (!nome) return { erro: 'Informe o nome da etapa.' }
  await escrever(nomePerfil(s), (tx) => tx`
    insert into etapas (obra_id, nome, ordem)
    values (${obraId}, ${nome}, (select coalesce(max(ordem), 0) + 1 from etapas where obra_id = ${obraId}))`)
  refresh()
  return { ok: 'Etapa adicionada.' }
}

export async function salvarSubetapa(subetapaId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  await obraDaSubetapa(s, subetapaId)
  const nome = texto(d, 'nome')
  const ordem = Number(d.get('ordem'))
  if (!nome) return { erro: 'Informe o nome.' }
  if (!Number.isInteger(ordem)) return { erro: 'Ordem inválida.' }
  await escrever(nomePerfil(s), (tx) => tx`update subetapas set nome = ${nome}, ordem = ${ordem} where id = ${subetapaId}`)
  refresh()
  return { ok: 'Salvo.' }
}

export async function removerSubetapa(subetapaId: number): Promise<Estado> {
  const s = await exigirSessao()
  await obraDaSubetapa(s, subetapaId)
  try {
    await escrever(nomePerfil(s), (tx) => tx`delete from subetapas where id = ${subetapaId}`)
  } catch (e) {
    if ((e as { code?: string }).code === '23503') return { erro: 'Essa subetapa tem compras ou itens de orçamento ligados e não pode ser removida.' }
    throw e
  }
  refresh()
  return null
}

export async function adicionarSubetapa(etapaId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  await obraDaEtapa(s, etapaId)
  const nome = texto(d, 'nome')
  if (!nome) return { erro: 'Informe o nome da subetapa.' }
  await escrever(nomePerfil(s), (tx) => tx`
    insert into subetapas (etapa_id, nome, ordem)
    values (${etapaId}, ${nome}, (select coalesce(max(ordem), 0) + 1 from subetapas where etapa_id = ${etapaId}))`)
  refresh()
  return { ok: 'Subetapa adicionada.' }
}
