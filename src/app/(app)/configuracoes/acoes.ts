'use server'

import { refresh } from 'next/cache'
import { escrever, lerConfig } from '@/lib/db'
import { exigirSessao, nomePerfil, type Perfil } from '@/lib/sessao'
import { normalizarWhatsapp } from '@/lib/cotacao'
import { dadosObra } from '@/lib/obra'
import { LINK_VALIDADE_DIAS, emailValido, normalizarEmail, novoConvite, respostaConvite } from '@/lib/contas'
import type { EstadoLink } from '@/components/link-de-acesso'
import type { Estado } from '@ds'

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()
const erroUnico = (e: unknown) => (e as { code?: string }).code === '23505'
const PERFIS: Perfil[] = ['chefe', 'financeiro', 'obra', 'compras']
const LOGO_TIPOS = ['image/png', 'image/jpeg', 'image/webp']

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
  const dados: Record<string, string | null> = { nome_empresa: nome }
  for (const c of ['cnpj', 'endereco', 'email', 'site']) dados[c] = texto(d, c).slice(0, 200) || null
  const arquivo = d.get('logo')
  if (arquivo instanceof File && arquivo.size > 0) {
    if (!LOGO_TIPOS.includes(arquivo.type)) return { erro: 'O logo precisa ser PNG, JPG ou WEBP.' }
    if (arquivo.size > 250_000) return { erro: 'O logo pode ter no máximo 250 KB.' }
    dados.logo = `data:${arquivo.type};base64,${Buffer.from(await arquivo.arrayBuffer()).toString('base64')}`
  } else if (d.get('tirar_logo') === 'on') dados.logo = null
  await escrever(nomePerfil(s), (tx) => tx`update config set ${tx(dados)}`)
  refresh()
  return { ok: 'Salvo.' }
}

export async function salvarObra(obraId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('chefe')
  const dados = dadosObra(d)
  if (typeof dados === 'string') return { erro: dados }
  try {
    await escrever(nomePerfil(s), (tx) => tx`update obras set ${tx(dados)} where id = ${obraId}`)
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

// Pessoas: só o dono cadastra e desativa. Cada pessoa recebe um link de acesso e cria a própria senha.

const obrasDoForm = (d: FormData) => [...new Set(d.getAll('obras').map(Number).filter(Number.isInteger))]

export async function criarPessoa(_: EstadoLink, d: FormData): Promise<EstadoLink> {
  const s = await exigirSessao('chefe')
  const nome = texto(d, 'nome')
  const email = normalizarEmail(texto(d, 'email'))
  const perfil = texto(d, 'perfil') as Perfil
  const obras = obrasDoForm(d)
  if (!nome) return { erro: 'Informe o nome.' }
  if (!emailValido(email)) return { erro: 'Informe um e-mail válido.' }
  if (!PERFIS.includes(perfil)) return { erro: 'Escolha a área.' }
  if (perfil === 'obra' && obras.length === 0) return { erro: 'Marque pelo menos uma obra para o engenheiro.' }
  const { token, hash } = novoConvite()
  try {
    await escrever(nomePerfil(s), async (tx) => {
      const [u] = await tx<{ id: number }[]>`
        insert into usuarios (nome, perfil, email, convite, convite_expira_em) values (${nome}, ${perfil}, ${email}, ${hash}, now() + make_interval(days => ${LINK_VALIDADE_DIAS}))
        returning id`
      if (perfil === 'obra')
        await tx`insert into usuario_obras ${tx(obras.map((obra_id) => ({ usuario_id: u.id, obra_id })))}`
    })
  } catch (e) {
    if (erroUnico(e)) return { erro: 'Já existe uma pessoa com esse e-mail.' }
    throw e
  }
  refresh()
  const empresa = (await lerConfig()).nomeEmpresa
  return respostaConvite({ nome, email, empresa }, token, `${nome} cadastrado. Mande o link abaixo para o primeiro acesso.`)
}

// Primeiro acesso que venceu ou senha esquecida: link novo (o anterior deixa de valer).
export async function gerarConvite(id: number): Promise<EstadoLink> {
  const s = await exigirSessao('chefe')
  if (id === s.usuarioId) return { erro: 'Para trocar a sua senha, use Minha conta.' }
  const { token, hash } = novoConvite()
  const [u] = await escrever(nomePerfil(s), (tx) => tx<{ nome: string; email: string }[]>`
    update usuarios set convite = ${hash}, convite_expira_em = now() + make_interval(days => ${LINK_VALIDADE_DIAS}) where id = ${id} and ativo returning nome, email`)
  if (!u) return { erro: 'Pessoa não encontrada ou desativada.' }
  const empresa = (await lerConfig()).nomeEmpresa
  return respostaConvite({ ...u, empresa }, token, `Link novo gerado para ${u.nome}.`)
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

export async function alternarAtivo(id: number): Promise<Estado> {
  const s = await exigirSessao('chefe')
  if (id === s.usuarioId) return { erro: 'Você não pode desativar a própria conta.' }
  const [u] = await escrever(nomePerfil(s), (tx) => tx<{ ativo: boolean }[]>`
    update usuarios set ativo = not ativo where id = ${id} returning ativo`)
  refresh()
  return { ok: u?.ativo ? 'Conta reativada.' : 'Conta desativada. A pessoa sai do sistema na hora.' }
}
