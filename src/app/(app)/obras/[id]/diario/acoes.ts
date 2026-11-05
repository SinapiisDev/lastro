'use server'

import { redirect } from 'next/navigation'
import { escrever, hoje, type Tx } from '@/lib/db'
import { exigirSessao, nomePerfil, podeVerObra } from '@/lib/sessao'
import { enviarArquivo, validarFotos } from '@/lib/storage'
import { CLIMAS } from '@/components/rotulos'
import { SECOES_RDO, linhasDoForm, type ChaveSecao, type LinhaRdo } from '@/lib/rdo'
import type { Estado } from '@ds'

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()

// Só regrava a lista se mudou (cada troca vira evento no histórico).
async function regravar(tx: Tx, rdoId: number, chave: ChaveSecao, linhas: LinhaRdo[], extra?: (l: LinhaRdo) => LinhaRdo) {
  const { tabela, campos, ...resto } = SECOES_RDO[chave]
  const filtro = 'filtro' in resto ? resto.filtro : undefined
  const nomes = campos.map((c) => c.nome)
  const atuais = await tx<LinhaRdo[]>`
    select ${tx(nomes)} from ${tx(tabela)} where rdo_id = ${rdoId} ${filtro ? tx`and tipo = ${filtro.tipo}` : tx``} order by id`
  if (JSON.stringify(atuais) === JSON.stringify(linhas)) return
  await tx`delete from ${tx(tabela)} where rdo_id = ${rdoId} ${filtro ? tx`and tipo = ${filtro.tipo}` : tx``}`
  if (linhas.length) await tx`insert into ${tx(tabela)} ${tx(linhas.map((l) => ({ rdo_id: rdoId, ...filtro, ...(extra ? extra(l) : l) })))}`
}

// Um RDO por obra e dia: salvar de novo atualiza o mesmo relatório.
export async function salvarRdo(obraId: number, data: string, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra', 'chefe')
  if (!podeVerObra(s, obraId)) return { erro: 'Você não tem acesso a esta obra.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > (await hoje())) return { erro: 'Escolha um dia até hoje.' }
  const climaManha = texto(d, 'clima_manha')
  const climaTarde = texto(d, 'clima_tarde')
  if (!(climaManha in CLIMAS) || !(climaTarde in CLIMAS)) return { erro: 'Informe o clima da manhã e da tarde.' }
  const listas = {} as Record<ChaveSecao, LinhaRdo[]>
  for (const chave of Object.keys(SECOES_RDO) as ChaveSecao[]) {
    const linhas = linhasDoForm(d, chave)
    if (typeof linhas === 'string') return { erro: linhas }
    listas[chave] = linhas
  }
  const fotos = validarFotos(d.getAll('fotos'))
  if (typeof fotos === 'string') return { erro: fotos }

  // Fotos sobem antes de gravar: se o banco falhar, sobra só arquivo solto, nunca registro sem arquivo.
  const caminhos = await Promise.all(fotos.map((f) => enviarArquivo(`obra-${obraId}/fotos`, f)))
  const autor = nomePerfil(s)
  await escrever(autor, async (tx) => {
    // A obra precisa ser desta construtora (a trava do banco esconde as das outras).
    if (!(await tx`select 1 from obras where id = ${obraId}`).length) throw new Error('Obra não encontrada')
    const [r] = await tx<{ id: number }[]>`
      insert into rdos (obra_id, data, clima_manha, clima_tarde, ocorrencias, observacoes, autor)
      values (${obraId}, ${data}, ${climaManha}, ${climaTarde}, ${texto(d, 'ocorrencias') || null}, ${texto(d, 'observacoes') || null}, ${autor})
      on conflict (obra_id, data) do update set clima_manha = excluded.clima_manha, clima_tarde = excluded.clima_tarde,
        ocorrencias = excluded.ocorrencias, observacoes = excluded.observacoes
      returning id`

    // Equipe com o mesmo nome de um prestador cadastrado fica ligada a ele.
    const prestadores = await tx<{ id: number; nome: string }[]>`select id, nome from fornecedores`
    const fornecedor = (nome: unknown) => prestadores.find((p) => p.nome.toLowerCase() === String(nome).toLowerCase())?.id ?? null
    for (const chave of Object.keys(SECOES_RDO) as ChaveSecao[])
      await regravar(tx, r.id, chave, listas[chave], chave === 'equipes' ? (l) => ({ ...l, fornecedor_id: fornecedor(l.nome) }) : undefined)

    if (caminhos.length)
      await tx`insert into fotos ${tx(caminhos.map((caminho) => ({ obra_id: obraId, rdo_id: r.id, caminho, autor })))}`
  })
  // Vai para a visualização: o formulário some, e as listas aparecem como ficaram gravadas.
  redirect(`/obras/${obraId}/diario/${data}`)
}
