'use server'

import { sql, escrever } from '@/lib/db'
import { exigirSessao, nomePerfil } from '@/lib/sessao'
import { linkDeEnvio, nomeNoStorage } from '@/lib/storage'
import { tipoDoAnexo } from '@/lib/anexos-importados'

const PASTA = 'sistema-anterior'
const LOTE = 25
const caminhoDo = (compraId: number, nome: string) => `${PASTA}/${compraId}/${nomeNoStorage(nome)}`

/** Documento importado de cada número de documento do sistema antigo (o número é o começo da chave da importação). */
export async function documentosDosCodigos(codigos: string[]): Promise<Record<string, number>> {
  await exigirSessao('financeiro', 'chefe')
  const lista = [...new Set(codigos.filter((c) => /^\d{3,10}$/.test(c)))]
  if (!lista.length) return {}
  const linhas = await sql<{ codigo: string; id: number }[]>`
    select distinct on (split_part(importacao_chave, '|', 1)) split_part(importacao_chave, '|', 1) as codigo, id
    from compras where importacao_chave is not null and split_part(importacao_chave, '|', 1) in ${sql(lista)}
    order by split_part(importacao_chave, '|', 1), id`
  return Object.fromEntries(linhas.map((l) => [l.codigo, l.id]))
}

export type ArquivoParaEnviar = { indice: number; compraId: number; nome: string }
export type Envio = { indice: number; nome: string; compraId: number; caminho: string; url: string | null }

/**
 * Autoriza o envio de um lote: cada arquivo ganha um caminho fixo no Storage (o mesmo se mandar de novo) e um endereço
 * para o navegador subir. Arquivo que já está anexado volta sem endereço (url null) e é pulado.
 */
export async function autorizarEnvio(arquivos: ArquivoParaEnviar[]): Promise<{ erro: string } | { ok: Envio[] }> {
  await exigirSessao('financeiro', 'chefe')
  if (!arquivos.length || arquivos.length > LOTE) return { erro: `Mande de 1 a ${LOTE} arquivos por vez.` }
  const ids = [...new Set(arquivos.map((a) => a.compraId))]
  const validas = new Set(
    (await sql<{ id: number }[]>`select id from compras where id in ${sql(ids)} and importacao_chave is not null`).map((c) => c.id),
  )
  // Dois nomes que viram o mesmo caminho no mesmo documento: o segundo ganha "-2".
  const usados = new Set<string>()
  const itens = arquivos
    .filter((a) => validas.has(a.compraId))
    .map((a) => {
      let caminho = caminhoDo(a.compraId, a.nome)
      for (let n = 2; usados.has(caminho); n++) caminho = caminhoDo(a.compraId, a.nome.replace(/(\.[^.]*)?$/, `-${n}$1`))
      usados.add(caminho)
      return { ...a, caminho }
    })
  if (!itens.length) return { erro: 'Nenhum destes documentos veio da importação da planilha.' }
  const ja = new Set((await sql<{ caminho: string }[]>`select caminho from anexos where caminho in ${sql(itens.map((i) => i.caminho))}`).map((a) => a.caminho))
  const ok = await Promise.all(itens.map(async (i) => ({ indice: i.indice, nome: i.nome, compraId: i.compraId, caminho: i.caminho, url: ja.has(i.caminho) ? null : await linkDeEnvio(i.caminho) })))
  return { ok }
}

/** Depois que o navegador subiu os arquivos: anexa cada um ao seu documento (o mesmo caminho não entra duas vezes). */
export async function registrarAnexos(enviados: { compraId: number; nome: string; caminho: string }[]): Promise<{ erro: string } | { ok: number }> {
  const s = await exigirSessao('financeiro', 'chefe')
  const validos = enviados.filter((e) => e.caminho.startsWith(`${PASTA}/${e.compraId}/`) && e.nome.length <= 255)
  if (!validos.length) return { ok: 0 }
  const n = await escrever(nomePerfil(s), async (tx) => {
    const r = await tx`
      insert into anexos ${tx(validos.map((e) => ({ compra_id: e.compraId, tipo: tipoDoAnexo(e.nome), nome: e.nome, caminho: e.caminho })))}
      on conflict (caminho) do nothing`
    return r.count
  })
  return { ok: n }
}
