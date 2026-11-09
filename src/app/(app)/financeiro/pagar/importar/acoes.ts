'use server'

import { refresh } from 'next/cache'
import { sql, escrever, lerConfig, hoje as hojeDb } from '@/lib/db'
import { exigirSessao, nomePerfil } from '@/lib/sessao'
import { lerPlanilha, ErroPlanilha } from '@/lib/xlsx'
import { lerDocumentosPagar, acharObra, normalizar, type DocumentoImportado, type LeituraPagar } from '@/lib/importacao-pagar'
import { gravarImportacao, planejarImportados, aplicarImportados } from '@/lib/importacao-pagar-banco'

const MAXIMO = 8 * 1024 * 1024

export type ObraDaPlanilha = { nome: string; documentos: number; valor: number; sugestao: number | null }
export type Previa = {
  documentos: number
  parcelas: number
  jaImportados: number
  pagas: { qtd: number; valor: number }
  abertas: { qtd: number; valor: number }
  vencidas: { qtd: number; valor: number }
  de: string
  ate: string
  obras: ObraDaPlanilha[]
  fornecedores: number
  fornecedoresNovos: number
  ignoradas: { motivo: string; linhas: number[] }[]
  /** Documentos já importados antes: o que o sistema antigo pagou depois. */
  atualizar: { baixar: number; valor: number; restos: number; semPar: number }
}
export type Resultado = { documentos: number; parcelas: number; obrasNovas: number; fornecedoresNovos: number; jaImportados: number; baixadas: number; restos: number; deFora: number }
// Destino de uma obra da planilha que não deve entrar no sistema (arquivo de ações: só funções exportadas).
const NAO_IMPORTAR = -1
export type Resposta<T> = { erro: string } | { ok: T }

async function lerArquivo(d: FormData): Promise<LeituraPagar | string> {
  const f = d.get('planilha')
  if (!(f instanceof File) || f.size === 0) return 'Escolha a planilha.'
  if (f.size > MAXIMO) return 'Planilha maior que 8 MB.'
  try {
    return lerDocumentosPagar(lerPlanilha(Buffer.from(await f.arrayBuffer())))
  } catch (e) {
    if (e instanceof ErroPlanilha) return e.message
    return 'Não consegui ler a planilha. Confira se é o .xlsx exportado do sistema antigo.'
  }
}

const chavesImportadas = async () =>
  new Set((await sql<{ k: string }[]>`select importacao_chave as k from compras where importacao_chave is not null`).map((r) => r.k))

const soma = (ps: { valor: number }[]) => Math.round(ps.reduce((t, p) => t + p.valor * 100, 0)) / 100

export async function conferirPlanilha(d: FormData): Promise<Resposta<Previa>> {
  const s = await exigirSessao('financeiro', 'chefe')
  const leitura = await lerArquivo(d)
  if (typeof leitura === 'string') return { erro: leitura }
  const [obras, fornecedores, importadas, hoje] = await Promise.all([
    sql<{ id: number; nome: string }[]>`select id, nome from obras order by nome`,
    sql<{ nome: string }[]>`select nome from fornecedores`,
    chavesImportadas(),
    hojeDb(),
  ])
  const novos = leitura.documentos.filter((doc) => !importadas.has(doc.chave))
  if (!leitura.documentos.length) return { erro: 'A planilha não tem nenhuma parcela para importar.' }
  // Só lê (nada é gravado aqui).
  const plano = await escrever(nomePerfil(s), (tx) => planejarImportados(tx, leitura.documentos.filter((doc) => importadas.has(doc.chave))))

  const porObra = new Map<string, DocumentoImportado[]>()
  for (const doc of novos) porObra.set(doc.obra, [...(porObra.get(doc.obra) ?? []), doc])
  const parcelas = novos.flatMap((doc) => doc.parcelas)
  const abertas = parcelas.filter((p) => !p.pagaEm)
  const vencidas = abertas.filter((p) => p.vencimento < hoje)
  const existentes = new Set(fornecedores.map((f) => normalizar(f.nome)))
  const daPlanilha = new Set(novos.map((doc) => normalizar(doc.fornecedor)))
  const motivos = new Map<string, number[]>()
  for (const i of leitura.ignoradas) motivos.set(i.motivo, [...(motivos.get(i.motivo) ?? []), i.linha])
  const datas = parcelas.map((p) => p.vencimento).sort()

  return {
    ok: {
      documentos: novos.length,
      parcelas: parcelas.length,
      jaImportados: leitura.documentos.length - novos.length,
      pagas: { qtd: parcelas.length - abertas.length, valor: soma(parcelas.filter((p) => p.pagaEm)) },
      abertas: { qtd: abertas.length, valor: soma(abertas) },
      vencidas: { qtd: vencidas.length, valor: soma(vencidas) },
      de: datas[0] ?? '',
      ate: datas.at(-1) ?? '',
      obras: [...porObra]
        .map(([nome, docs]) => ({ nome, documentos: docs.length, valor: soma(docs), sugestao: acharObra(nome, obras) }))
        .sort((a, b) => b.valor - a.valor),
      fornecedores: daPlanilha.size,
      fornecedoresNovos: [...daPlanilha].filter((f) => !existentes.has(f)).length,
      ignoradas: [...motivos].map(([motivo, linhas]) => ({ motivo, linhas })),
      atualizar: { baixar: plano.baixar.length, valor: soma(plano.baixar), restos: plano.novas.length, semPar: plano.semPar },
    },
  }
}

export async function importarPlanilha(d: FormData): Promise<Resposta<Resultado>> {
  const s = await exigirSessao('financeiro', 'chefe')
  const leitura = await lerArquivo(d)
  if (typeof leitura === 'string') return { erro: leitura }

  // Destino de cada obra da planilha: id de uma obra do sistema, 0 = criar obra nova com esse nome, -1 = não importar.
  let destinos: Record<string, number>
  try {
    destinos = JSON.parse(String(d.get('destinos') ?? '{}'))
  } catch {
    return { erro: 'Escolha a obra do sistema para cada obra da planilha.' }
  }
  const obras = new Set((await sql<{ id: number }[]>`select id from obras`).map((o) => o.id))
  const importadas = await chavesImportadas()
  const novos = leitura.documentos.filter((doc) => !importadas.has(doc.chave))
  for (const nome of new Set(novos.map((doc) => doc.obra))) {
    const destino = destinos[nome]
    if (!Number.isInteger(destino) || (destino > 0 && !obras.has(destino)) || destino < NAO_IMPORTAR) return { erro: `Escolha a obra do sistema para "${nome}".` }
  }
  const docs = novos.filter((doc) => destinos[doc.obra] !== NAO_IMPORTAR)
  const tetos = await lerConfig()

  const r = await escrever(nomePerfil(s), async (tx) => {
    const plano = await planejarImportados(tx, leitura.documentos.filter((doc) => importadas.has(doc.chave)))
    if (!docs.length && !plano.baixar.length && !plano.novas.length) return null
    const novosR = docs.length ? await gravarImportacao(tx, docs, destinos, tetos) : { documentos: 0, parcelas: 0, obrasNovas: 0, fornecedoresNovos: 0 }
    return { ...novosR, ...(await aplicarImportados(tx, plano)) }
  })
  if (!r) return { erro: 'Nada novo nesta planilha: os documentos já foram importados e nenhum pagamento mudou.' }
  refresh()
  return { ok: { ...r, jaImportados: leitura.documentos.length - novos.length, deFora: novos.length - docs.length } }
}
