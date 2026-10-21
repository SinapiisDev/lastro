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

// Pessoas: só o dono cria, desativa e redefine acessos.

const obrasDoForm = (d: FormData) => [...new Set(d.getAll('obras').map(Number).filter(Number.isInteger))]
const provisoriaInvalida = (senha: string) => (senha.length < 10 ? 'A senha provisória precisa ter pelo menos 10 caracteres.' : null)

export async function criarPessoa(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('chefe')
  const nome = texto(d, 'nome')
  const email = texto(d, 'email').toLowerCase()
  const perfil = texto(d, 'perfil') as Perfil
  const senha = String(d.get('senha') ?? '')
  const obras = obrasDoForm(d)
  if (!nome || !email.includes('@')) return { erro: 'Informe o nome e um e-mail válido.' }
  if (!PERFIS.includes(perfil)) return { erro: 'Escolha o tipo de acesso.' }
  if (perfil === 'obra' && obras.length === 0) return { erro: 'Marque pelo menos uma obra para o engenheiro.' }
  const invalida = provisoriaInvalida(senha)
  if (invalida) return { erro: invalida }
  try {
    await escrever(nomePerfil(s), async (tx) => {
      const [u] = await tx<{ id: number }[]>`
        insert into usuarios (nome, email, perfil, senha)
        values (${nome}, ${email}, ${perfil}, extensions.crypt(${senha}, extensions.gen_salt('bf')))
        returning id`
      if (perfil === 'obra')
        await tx`insert into usuario_obras ${tx(obras.map((obra_id) => ({ usuario_id: u.id, obra_id })))}`
    })
  } catch (e) {
    if (erroUnico(e)) return { erro: 'Já existe uma pessoa com esse e-mail.' }
    throw e
  }
  refresh()
  return { ok: `Conta criada. Passe para ${nome} o e-mail e a senha provisória; no primeiro acesso a senha é trocada.` }
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

// Senha provisória nova: a pessoa troca no próximo acesso. Também desfaz o bloqueio por tentativas.
export async function redefinirSenha(id: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('chefe')
  if (id === s.usuarioId) return { erro: 'Para a sua senha, use Minha conta.' }
  const senha = String(d.get('senha') ?? '')
  const invalida = provisoriaInvalida(senha)
  if (invalida) return { erro: invalida }
  await escrever(nomePerfil(s), (tx) => tx`
    update usuarios set senha = extensions.crypt(${senha}, extensions.gen_salt('bf')), trocar_senha = true,
      tentativas = 0, bloqueado_ate = null
    where id = ${id}`)
  refresh()
  return { ok: 'Senha provisória definida. A pessoa troca no próximo acesso.' }
}

// Outro dono trocou de celular: na próxima entrada ele lê um QR Code novo.
export async function redefinirCelular(id: number): Promise<Estado> {
  const s = await exigirSessao('chefe')
  await escrever(nomePerfil(s), (tx) => tx`update usuarios set totp_ativo = false, totp_segredo = null where id = ${id} and perfil = 'chefe'`)
  refresh()
  return { ok: 'Na próxima entrada, a pessoa cadastra o celular de novo.' }
}

