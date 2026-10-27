'use server'

import { notFound } from 'next/navigation'
import { refresh } from 'next/cache'
import { escrever } from '@/lib/db'
import { exigirSessao, nomePerfil, type Sessao } from '@/lib/sessao'
import { normalizarWhatsapp } from '@/lib/cotacao'
import { carregarFornecedor, fornecedorNaObra, mandarTexto, registrarEntrada, processarFornecedor, responderAudio } from '@/lib/conversa'
import { whatsappReal } from '@/lib/whatsapp'
import { validarArquivo, enviarArquivo } from '@/lib/storage'
import { CASOS } from '@/lib/ia-ensaio'
import type { Estado } from '@ds'

async function fornecedorPermitido(s: Sessao, fornecedorId: number) {
  const f = await carregarFornecedor(fornecedorId)
  if (!f || (s.perfil === 'obra' && !(await fornecedorNaObra(fornecedorId, s.obraId!)))) notFound()
  return f
}

export async function responderComoPessoa(fornecedorId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  const f = await fornecedorPermitido(s, fornecedorId)
  const texto = String(d.get('texto') ?? '').trim()
  if (!texto) return { erro: 'Escreva a mensagem.' }
  try {
    await mandarTexto(f, `${texto}\n\n(${nomePerfil(s)})`, 'pessoa')
  } catch (e) {
    return { erro: (e as Error).message }
  }
  // Uma pessoa assumiu: a IA para de responder esse fornecedor.
  if (!f.iaPausada) await escrever(nomePerfil(s), (tx) => tx`update fornecedores set ia_pausada = true where id = ${f.id}`)
  refresh()
  return { ok: 'Mensagem enviada. A IA ficou pausada nesta conversa.' }
}

export async function alternarIA(fornecedorId: number): Promise<Estado> {
  const s = await exigirSessao()
  const f = await fornecedorPermitido(s, fornecedorId)
  await escrever(nomePerfil(s), (tx) => tx`update fornecedores set ia_pausada = ${!f.iaPausada} where id = ${f.id}`)
  // Ao devolver a conversa para a IA, ela lê o que chegou enquanto estava pausada.
  const aviso = f.iaPausada ? await processarFornecedor(f.id) : null
  refresh()
  return aviso ? { erro: aviso } : { ok: f.iaPausada ? 'A IA voltou a responder.' : 'IA pausada nesta conversa.' }
}

export async function salvarWhatsapp(fornecedorId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  await fornecedorPermitido(s, fornecedorId)
  const numero = normalizarWhatsapp(String(d.get('whatsapp') ?? ''))
  if (!numero) return { erro: 'Número inválido. Use DDD e número, ex.: (11) 99999-8888.' }
  try {
    await escrever(nomePerfil(s), (tx) => tx`update fornecedores set whatsapp = ${numero} where id = ${fornecedorId}`)
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { erro: 'Esse número já está em outro fornecedor.' }
    throw e
  }
  refresh()
  return { ok: 'WhatsApp salvo.' }
}

// Só existe enquanto o WhatsApp real não está ligado: faz de conta que o fornecedor escreveu.
export async function simularMensagem(fornecedorId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  if (whatsappReal()) return { erro: 'O WhatsApp real está ligado: o simulador fica desativado.' }
  const f = await fornecedorPermitido(s, fornecedorId)
  if (d.get('audio') === 'on') {
    await registrarEntrada(f.id, { texto: '[áudio]', paraIA: false })
    await responderAudio(f)
    refresh()
    return { ok: 'Áudio simulado: o sistema pediu a mensagem por escrito.' }
  }
  const caso = d.get('caso') ? CASOS[Number(d.get('caso'))] : undefined
  const texto = (String(d.get('texto') ?? '').trim() || caso?.texto) ?? ''
  const arquivo = validarArquivo(d.get('arquivo'))
  if (typeof arquivo === 'string') return { erro: arquivo }
  if (!texto && !arquivo) return { erro: 'Escreva a mensagem do fornecedor ou anexe um arquivo.' }
  const caminho = arquivo ? await enviarArquivo(`fornecedor-${f.id}`, arquivo) : null
  await registrarEntrada(f.id, { texto: texto || null, anexo: arquivo && caminho ? { caminho, tipo: arquivo.type } : undefined })
  const aviso = await processarFornecedor(f.id)
  refresh()
  return aviso ? { erro: `Mensagem recebida. ${aviso}` } : { ok: 'Mensagem recebida e lida pela IA.' }
}
