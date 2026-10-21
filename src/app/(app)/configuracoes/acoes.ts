'use server'

import { refresh } from 'next/cache'
import { escrever } from '@/lib/db'
import { exigirSessao, criarSessao } from '@/lib/sessao'
import { normalizarWhatsapp } from '@/lib/cotacao'
import type { Estado } from '@ds'

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()
const erroUnico = (e: unknown) => (e as { code?: string }).code === '23505'

export async function salvarTetos(_: Estado, d: FormData): Promise<Estado> {
  await exigirSessao('chefe')
  const baixo = Number(d.get('teto_baixo'))
  const medio = Number(d.get('teto_medio'))
  if (!(baixo >= 0) || !(medio >= 0)) return { erro: 'Informe os dois tetos.' }
  if (medio < baixo) return { erro: 'O teto médio precisa ser maior ou igual ao teto baixo.' }
  await escrever('Chefe', (tx) => tx`update config set teto_baixo = ${baixo}, teto_medio = ${medio}`)
  refresh()
  return { ok: 'Tetos salvos. Valem para as próximas compras.' }
}

export async function salvarEmpresa(_: Estado, d: FormData): Promise<Estado> {
  await exigirSessao('chefe')
  const nome = texto(d, 'nome_empresa')
  if (!nome) return { erro: 'Informe o nome da empresa.' }
  await escrever('Chefe', (tx) => tx`update config set nome_empresa = ${nome}`)
  refresh()
  return { ok: 'Salvo. É o nome que os fornecedores veem nas mensagens.' }
}

export async function trocarSenha(perfil: 'chefe' | 'financeiro', _: Estado, d: FormData): Promise<Estado> {
  await exigirSessao('chefe')
  const senha = String(d.get('senha') ?? '')
  if (senha.length < 8) return { erro: 'Use pelo menos 8 caracteres.' }
  const coluna = perfil === 'chefe' ? 'senha_chefe' : 'senha_financeiro'
  const [c] = await escrever('Chefe', (tx) => tx<{ h: string }[]>`
    update config set ${tx(coluna)} = extensions.crypt(${senha}, extensions.gen_salt('bf')) returning ${tx(coluna)} as h`)
  // Trocar a senha derruba todas as sessões daquele acesso; o chefe continua logado com a nova.
  if (perfil === 'chefe') await criarSessao('chefe', 'Chefe', c.h)
  return { ok: 'Senha trocada. Quem estava usando a senha antiga precisa entrar de novo.' }
}

export async function salvarObra(obraId: number, _: Estado, d: FormData): Promise<Estado> {
  await exigirSessao('chefe')
  const nome = texto(d, 'nome')
  const senha = String(d.get('senha') ?? '')
  if (!nome) return { erro: 'Informe o nome.' }
  if (senha && senha.length < 8) return { erro: 'A nova senha precisa ter pelo menos 8 caracteres.' }
  try {
    await escrever('Chefe', (tx) => tx`
      update obras set nome = ${nome}, endereco = ${texto(d, 'endereco') || null}, ativa = ${d.get('ativa') === 'on'},
        senha = case when ${senha} = '' then senha else extensions.crypt(${senha}, extensions.gen_salt('bf')) end
      where id = ${obraId}`)
  } catch (e) {
    if (erroUnico(e)) return { erro: 'Já existe uma obra com esse nome.' }
    throw e
  }
  refresh()
  return { ok: senha ? 'Salvo. A senha da obra mudou.' : 'Salvo.' }
}

export async function salvarFornecedor(id: number, _: Estado, d: FormData): Promise<Estado> {
  await exigirSessao('chefe')
  const nome = texto(d, 'nome')
  if (!nome) return { erro: 'Informe o nome.' }
  const zap = texto(d, 'whatsapp')
  const whatsapp = zap ? normalizarWhatsapp(zap) : null
  if (zap && !whatsapp) return { erro: 'WhatsApp inválido. Use DDD e número, ex.: (11) 99999-8888.' }
  try {
    await escrever('Chefe', (tx) => tx`
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
