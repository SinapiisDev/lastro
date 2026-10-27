'use server'

import { redirect } from 'next/navigation'
import { escrever, hoje } from '@/lib/db'
import { exigirSessao, nomePerfil, podeVerObra } from '@/lib/sessao'
import { enviarArquivo, validarFotos } from '@/lib/storage'
import { CLIMAS } from '@/components/rotulos'
import type { Estado } from '@ds'

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()

type Equipe = { nome: string; funcao: string | null; pessoas: number }

function equipesDoForm(d: FormData): Equipe[] | string {
  const nomes = d.getAll('equipe_nome').map((v) => String(v).trim())
  const funcoes = d.getAll('equipe_funcao').map((v) => String(v).trim())
  const pessoas = d.getAll('equipe_pessoas').map((v) => Number(v))
  const lista: Equipe[] = []
  for (let i = 0; i < nomes.length; i++) {
    if (!nomes[i]) continue
    if (!Number.isInteger(pessoas[i]) || pessoas[i] < 1 || pessoas[i] > 999) return `Informe quantas pessoas da equipe "${nomes[i]}" trabalharam.`
    lista.push({ nome: nomes[i].slice(0, 120), funcao: funcoes[i]?.slice(0, 120) || null, pessoas: pessoas[i] })
  }
  return lista
}

// Um RDO por obra e dia: salvar de novo atualiza o mesmo relatório.
export async function salvarRdo(obraId: number, data: string, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra', 'chefe')
  if (!podeVerObra(s, obraId)) return { erro: 'Você não tem acesso a esta obra.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > (await hoje())) return { erro: 'Escolha um dia até hoje.' }
  const climaManha = texto(d, 'clima_manha')
  const climaTarde = texto(d, 'clima_tarde')
  if (!(climaManha in CLIMAS) || !(climaTarde in CLIMAS)) return { erro: 'Informe o clima da manhã e da tarde.' }
  const equipes = equipesDoForm(d)
  if (typeof equipes === 'string') return { erro: equipes }
  const fotos = validarFotos(d.getAll('fotos'))
  if (typeof fotos === 'string') return { erro: fotos }

  // Fotos sobem antes de gravar: se o banco falhar, sobra só arquivo solto, nunca registro sem arquivo.
  const caminhos = await Promise.all(fotos.map((f) => enviarArquivo(`obra-${obraId}/fotos`, f)))
  const autor = nomePerfil(s)
  await escrever(autor, async (tx) => {
    // A obra precisa ser desta construtora (a trava do banco esconde as das outras).
    if (!(await tx`select 1 from obras where id = ${obraId}`).length) throw new Error('Obra não encontrada')
    const [r] = await tx<{ id: number }[]>`
      insert into rdos (obra_id, data, clima_manha, clima_tarde, servicos, ocorrencias, observacoes, autor)
      values (${obraId}, ${data}, ${climaManha}, ${climaTarde}, ${texto(d, 'servicos') || null}, ${texto(d, 'ocorrencias') || null},
              ${texto(d, 'observacoes') || null}, ${autor})
      on conflict (obra_id, data) do update set clima_manha = excluded.clima_manha, clima_tarde = excluded.clima_tarde,
        servicos = excluded.servicos, ocorrencias = excluded.ocorrencias, observacoes = excluded.observacoes
      returning id`

    // Equipes: só regrava se mudou (cada troca vira evento no histórico).
    const atuais = await tx<Equipe[]>`select nome, funcao, pessoas from rdo_equipes where rdo_id = ${r.id} order by id`
    if (JSON.stringify(atuais) !== JSON.stringify(equipes)) {
      await tx`delete from rdo_equipes where rdo_id = ${r.id}`
      if (equipes.length) {
        const prestadores = await tx<{ id: number; nome: string }[]>`select id, nome from fornecedores`
        const idDe = (nome: string) => prestadores.find((p) => p.nome.toLowerCase() === nome.toLowerCase())?.id ?? null
        await tx`insert into rdo_equipes ${tx(equipes.map((e) => ({ rdo_id: r.id, fornecedor_id: idDe(e.nome), ...e })))}`
      }
    }
    if (caminhos.length)
      await tx`insert into fotos ${tx(caminhos.map((caminho) => ({ obra_id: obraId, rdo_id: r.id, caminho, autor })))}`
  })
  // Vai para a visualização: o formulário some, e as equipes aparecem como ficaram gravadas.
  redirect(`/obras/${obraId}/diario/${data}`)
}
