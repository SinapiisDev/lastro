'use server'

import { redirect } from 'next/navigation'
import { sql, escrever } from '@/lib/db'
import { criarSessao, encerrarSessao } from '@/lib/sessao'
import type { Estado } from '@/components/form-acao'

export async function entrar(_: Estado, dados: FormData): Promise<Estado> {
  const tipo = String(dados.get('tipo'))
  const senha = String(dados.get('senha') ?? '')

  if (tipo === 'obra') {
    const id = Number(dados.get('obra'))
    const [o] = await sql<{ nome: string; senha: string }[]>`
      select nome, senha from obras where id = ${id} and ativa and senha = extensions.crypt(${senha}, senha)`
    if (o) {
      await criarSessao('obra', o.nome, o.senha, id)
      redirect(`/obras/${id}`)
    }
  } else if (tipo === 'chefe' || tipo === 'financeiro') {
    const coluna = tipo === 'chefe' ? 'senha_chefe' : 'senha_financeiro'
    const [c] = await sql<{ h: string }[]>`
      select ${sql(coluna)} as h from config where ${sql(coluna)} = extensions.crypt(${senha}, ${sql(coluna)})`
    if (c) {
      await criarSessao(tipo, tipo === 'chefe' ? 'Chefe' : 'Financeiro', c.h)
      redirect('/financeiro')
    }
  }

  // shortcut: atraso fixo contra tentativa de senha em massa; trocar por bloqueio por IP se o sistema ficar exposto a muita gente.
  await new Promise((r) => setTimeout(r, 1000))
  return { erro: 'Senha incorreta.' }
}

export async function primeiroAcesso(_: Estado, dados: FormData): Promise<Estado> {
  const chefe = String(dados.get('chefe') ?? '')
  const financeiro = String(dados.get('financeiro') ?? '')
  if (chefe.length < 8 || financeiro.length < 8) return { erro: 'Use senhas com pelo menos 8 caracteres.' }
  if (chefe === financeiro) return { erro: 'As senhas do chefe e do financeiro precisam ser diferentes.' }

  // "where senha_chefe is null" garante que isso só funciona uma vez.
  const [c] = await escrever('Primeiro acesso', (tx) => tx<{ h: string }[]>`
    update config
    set senha_chefe = extensions.crypt(${chefe}, extensions.gen_salt('bf')),
        senha_financeiro = extensions.crypt(${financeiro}, extensions.gen_salt('bf'))
    where senha_chefe is null
    returning senha_chefe as h`)
  if (!c) return { erro: 'As senhas já foram definidas. Entre normalmente.' }
  await criarSessao('chefe', 'Chefe', c.h)
  redirect('/financeiro')
}

export async function sair() {
  await encerrarSessao()
  redirect('/entrar')
}
