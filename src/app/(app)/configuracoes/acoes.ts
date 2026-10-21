'use server'

import { refresh } from 'next/cache'
import { escrever } from '@/lib/db'
import { exigirSessao, nomePerfil, type Perfil } from '@/lib/sessao'
import { normalizarWhatsapp } from '@/lib/cotacao'
import type { Estado } from '@ds'

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()
const erroUnico = (e: unknown) => (e as { code?: string }).code === '23505'
const PERFIS: Perfil[] = ['chefe', 'financeiro', 'obra']

export async function salvarTetos(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('chefe')
  const baixo = Number(d.get('teto_baixo'))
  const medio = Number(d.get('teto_medio'))
  if (!(baixo >= 0) || !(medio >= 0)) return { erro: 'Informe os dois tetos.' }
  if (medio < baixo) return { erro: 'O teto médio precisa ser maior ou igual ao teto baixo.' }
  await escrever(nomePerfil(s), (tx) => tx`update config set teto_baixo = ${baixo}, teto_medio = ${medio}`)
  refresh()
  return { ok: 'Tetos salvos. Valem para as próximas compras.' }
}

export async function salvarEmpresa(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('chefe')
  const nome = texto(d, 'nome_empresa')
  if (!nome) return { erro: 'Informe o nome da empresa.' }
  await escrever(nomePerfil(s), (tx) => tx`update config set nome_empresa = ${nome}`)
  refresh()
  return { ok: 'Salvo. É o nome que os fornecedores veem nas mensagens.' }
}

export async function salvarObra(obraId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('chefe')
  const nome = texto(d, 'nome')
  if (!nome) return { erro: 'Informe o nome.' }
  try {
    await escrever(nomePerfil(s), (tx) => tx`
      update obras set nome = ${nome}, endereco = ${texto(d, 'endereco') || null}, ativa = ${d.get('ativa') === 'on'}
      where id = ${obraId}`)
  } catch (e) {
    if (erroUnico(e)) return { erro: 'Já existe uma obra com esse nome.' }
    throw e
  }
  refresh()
  return { ok: 'Salvo.' }
}

export async function salvarFornecedor(id: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('chefe')
  const nome = texto(d, 'nome')
  if (!nome) return { erro: 'Informe o nome.' }
  const zap = texto(d, 'whatsapp')
  const whatsapp = zap ? normalizarWhatsapp(zap) : null
  if (zap && !whatsapp) return { erro: 'WhatsApp inválido. Use DDD e número, ex.: (11) 99999-8888.' }
  try {
    await escrever(nomePerfil(s), (tx) => tx`
      update fornecedores set nome = ${nome}, cnpj = ${texto(d, 'cnpj') || null}, telefone = ${texto(d, 'telefone') || null},
        whatsapp = ${whatsapp}
      where id = ${id}`)
  } catch (e) {
    if (erroUnico(e)) return { erro: 'Já existe um fornecedor com esse nome ou esse WhatsApp.' }
    throw e
  }
  refresh()
  return { ok: 'Salvo.' }
}

// Pessoas: só o dono cadastra, troca o número e desativa. Cada um entra pelo próprio WhatsApp.

const obrasDoForm = (d: FormData) => [...new Set(d.getAll('obras').map(Number).filter(Number.isInteger))]
const MSG_CELULAR = 'Digite o celular com DDD, por exemplo (11) 98888-7777.'

export async function criarPessoa(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('chefe')
  const nome = texto(d, 'nome')
  const celular = normalizarWhatsapp(texto(d, 'celular'))
  const perfil = texto(d, 'perfil') as Perfil
  const obras = obrasDoForm(d)
  if (!nome) return { erro: 'Informe o nome.' }
  if (!celular) return { erro: MSG_CELULAR }
  if (!PERFIS.includes(perfil)) return { erro: 'Escolha o tipo de acesso.' }
  if (perfil === 'obra' && obras.length === 0) return { erro: 'Marque pelo menos uma obra para o engenheiro.' }
  try {
    await escrever(nomePerfil(s), async (tx) => {
      const [u] = await tx<{ id: number }[]>`
        insert into usuarios (nome, perfil, celular) values (${nome}, ${perfil}, ${celular}) returning id`
      if (perfil === 'obra')
        await tx`insert into usuario_obras ${tx(obras.map((obra_id) => ({ usuario_id: u.id, obra_id })))}`
    })
  } catch (e) {
    if (erroUnico(e)) return { erro: 'Já existe uma pessoa com esse celular.' }
    throw e
  }
  refresh()
  return { ok: `Pronto. ${nome} já pode entrar: é só digitar o celular na tela de entrada e usar o código que chega no WhatsApp.` }
}

export async function salvarObrasPessoa(id: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('chefe')
  const obras = obrasDoForm(d)
  if (obras.length === 0) return { erro: 'Marque pelo menos uma obra.' }
  await escrever(nomePerfil(s), async (tx) => {
    await tx`delete from usuario_obras where usuario_id = ${id} and obra_id <> all(${obras})`
    await tx`insert into usuario_obras ${tx(obras.map((obra_id) => ({ usuario_id: id, obra_id })))} on conflict do nothing`
  })
  refresh()
  return { ok: 'Obras salvas.' }
}

// Número novo: as sessões abertas eram do número antigo e deixam de valer.
export async function trocarCelular(id: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('chefe')
  const celular = normalizarWhatsapp(texto(d, 'celular'))
  if (!celular) return { erro: MSG_CELULAR }
  try {
    await escrever(nomePerfil(s), (tx) => tx`
      update usuarios set celular = ${celular} where id = ${id}`)
  } catch (e) {
    if (erroUnico(e)) return { erro: 'Já existe uma pessoa com esse celular.' }
    throw e
  }
  refresh()
  return { ok: 'Número trocado. A pessoa entra de novo pelo número novo.' }
}

export async function alternarAtivo(id: number): Promise<Estado> {
  const s = await exigirSessao('chefe')
  if (id === s.usuarioId) return { erro: 'Você não pode desativar a própria conta.' }
  const [u] = await escrever(nomePerfil(s), (tx) => tx<{ ativo: boolean }[]>`
    update usuarios set ativo = not ativo where id = ${id} returning ativo`)
  refresh()
  return { ok: u?.ativo ? 'Conta reativada.' : 'Conta desativada. A pessoa sai do sistema na hora.' }
}
