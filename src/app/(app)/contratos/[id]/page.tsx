import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CabecalhoTela, Campo, Dinheiro, Entrada, Etiqueta, FormAcao, Kpi, LinhaTotal, Secao, Situacao, Tabela, Td, Th, Tr } from '@ds'
import { sql, hoje } from '@/lib/db'
import { exigirSessao, podeContratar, podeMedir } from '@/lib/sessao'
import { brl, dataBR, somarDias, totalItem } from '@/lib/regras'
import { ItensContrato } from '../itens'
import { servicosDaObra } from '../servicos'
import { lancarMedicao, adicionarAditivo } from '../acoes'

const num = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: 4 })

export default async function Contrato({ params }: PageProps<'/contratos/[id]'>) {
  const s = await exigirSessao()
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [c] = await sql<{ obraId: number; obra: string; fornecedor: string; objeto: string; inicio: string }[]>`
    select c.obra_id as "obraId", o.nome as obra, f.nome as fornecedor, c.objeto, c.inicio
    from contratos c join obras o on o.id = c.obra_id join fornecedores f on f.id = c.fornecedor_id where c.id = ${id}`
  if (!c || (s.perfil === 'obra' && s.obraId !== c.obraId)) notFound()

  const medir = podeMedir(s, c.obraId)
  const aditar = podeContratar(s)
  const [itens, medicoes, servicos, dia] = await Promise.all([
    sql<{ id: number; descricao: string; servico: string; etapa: string; unidade: string; quantidade: number; precoUnitario: number; medido: number; aditivo: boolean }[]>`
      select i.id, i.descricao, s.nome as servico, e.nome as etapa, i.unidade, i.quantidade, i.preco_unitario as "precoUnitario", i.medido, i.aditivo
      from v_contrato_itens i join subetapas s on s.id = i.subetapa_id join etapas e on e.id = s.etapa_id
      where i.contrato_id = ${id} order by i.id`,
    sql<{ numero: number; data: string; compraId: number; valor: number; status: string }[]>`
      select m.numero, m.data, m.compra_id as "compraId", c.valor, c.status
      from medicoes m join v_compras c on c.id = m.compra_id where m.contrato_id = ${id} order by m.numero desc`,
    aditar ? servicosDaObra(c.obraId) : [],
    hoje(),
  ])
  const contratado = itens.reduce((t, i) => t + totalItem(i.quantidade, i.precoUnitario), 0)
  const medido = itens.reduce((t, i) => t + totalItem(i.medido, i.precoUnitario), 0)
  const comSaldo = itens.filter((i) => i.quantidade - i.medido > 1e-9)

  return (
    <>
      <CabecalhoTela contexto={`Contrato nº ${id} · ${c.obra}`} titulo={c.objeto}>
        <p className="text-table text-ink-2">
          {c.fornecedor} · desde {dataBR(c.inicio)} ·{' '}
          <Link href="/contratos" className="font-semibold">
            todos os contratos
          </Link>
        </p>
      </CabecalhoTela>

      <section className="grid gap-4 sm:grid-cols-3">
        <Kpi rotulo="Contratado" valor={<Dinheiro valor={contratado} />} detalhe={`${itens.length} ${itens.length === 1 ? 'serviço' : 'serviços'}`} />
        <Kpi tom="escuro" rotulo="Medido" valor={<Dinheiro valor={medido} />} detalhe={`${contratado > 0 ? Math.round((medido / contratado) * 100) : 0}% do contrato`} corDetalhe="acento" />
        <Kpi rotulo="Saldo a medir" valor={<Dinheiro valor={contratado - medido} />} detalhe={`${medicoes.length} ${medicoes.length === 1 ? 'medição' : 'medições'}`} />
      </section>

      <Secao titulo="Serviços do contrato">
        <Tabela minimo={860}>
          <thead>
            <tr>
              <Th>Serviço</Th>
              <Th num>Contratado</Th>
              <Th num>Medido</Th>
              <Th num>Saldo</Th>
              <Th num>Preço unit.</Th>
              <Th num>Valor</Th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <Tr key={i.id}>
                <Td className="max-w-sm">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {i.descricao}
                    {i.aditivo && <Etiqueta tom="info">Aditivo</Etiqueta>}
                  </span>
                  <span className="block text-caption text-ink-3">
                    {i.etapa} / {i.servico}
                  </span>
                </Td>
                <Td num>
                  {num(i.quantidade)} {i.unidade}
                </Td>
                <Td num>
                  {num(i.medido)} {i.unidade}
                  <span className="block text-caption text-ink-3">{Math.floor((i.medido / i.quantidade) * 100 + 1e-9)}%</span>
                </Td>
                <Td num forte>
                  {num(i.quantidade - i.medido)} {i.unidade}
                </Td>
                <Td num>
                  <Dinheiro valor={i.precoUnitario} />
                </Td>
                <Td num>
                  <Dinheiro valor={totalItem(i.quantidade, i.precoUnitario)} />
                </Td>
              </Tr>
            ))}
          </tbody>
          <tfoot>
            <tr aria-hidden className="h-2" />
            <LinhaTotal>
              <td colSpan={5} className="px-2">
                Total contratado
              </td>
              <td className="px-2 text-right">
                <Dinheiro valor={contratado} />
              </td>
            </LinhaTotal>
          </tfoot>
        </Tabela>
      </Secao>

      {medir && (
        <Secao titulo="Nova medição">
          {comSaldo.length === 0 ? (
            <p className="text-[13px] text-ink-2">Tudo já foi medido. Para medir mais, inclua um aditivo.</p>
          ) : (
            <FormAcao action={lancarMedicao.bind(null, id)} botao="Lançar medição" variante="primario" className="flex flex-col gap-4">
              <p className="text-[13px] text-ink-2">
                Informe quanto foi executado de cada serviço neste período (deixe em branco o que não andou). A medição vira uma conta a pagar ao
                empreiteiro, já aprovada, e atualiza o % feito dos serviços na obra.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {comSaldo.map((i) => (
                  <Campo key={i.id} rotulo={`${i.descricao} (${i.unidade})`} ajuda={`Saldo: ${num(i.quantidade - i.medido)} ${i.unidade} · ${brl(i.precoUnitario)}/${i.unidade}`}>
                    <Entrada name={`medir_${i.id}`} type="number" step="any" min="0" max={i.quantidade - i.medido} inputMode="decimal" />
                  </Campo>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Campo rotulo="Data da medição">
                  <Entrada name="data" type="date" defaultValue={dia} required />
                </Campo>
                <Campo rotulo="Vencimento (quando o empreiteiro recebe)">
                  <Entrada name="vencimento" type="date" defaultValue={somarDias(dia, 7)} required />
                </Campo>
              </div>
            </FormAcao>
          )}
        </Secao>
      )}

      <Secao titulo="Medições">
        {medicoes.length === 0 ? (
          <p className="text-[13px] text-ink-2">Nenhuma medição lançada ainda.</p>
        ) : (
          <Tabela minimo={560}>
            <thead>
              <tr>
                <Th>Medição</Th>
                <Th>Data</Th>
                <Th num>Valor</Th>
                <Th>Conta a pagar</Th>
              </tr>
            </thead>
            <tbody>
              {medicoes.map((m) => (
                <Tr key={m.numero}>
                  <Td forte>{m.numero}ª</Td>
                  <Td>{dataBR(m.data)}</Td>
                  <Td num>
                    <Dinheiro valor={m.valor} />
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/compras/${m.compraId}`} className="font-semibold">
                        nº {m.compraId}
                      </Link>
                      <Situacao status={m.status} />
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Secao>

      {aditar && (
        <Secao titulo="Aditivo">
          <FormAcao action={adicionarAditivo.bind(null, id)} botao="Incluir aditivo" className="flex flex-col gap-4">
            <p className="text-[13px] text-ink-2">
              Serviço novo ou mais quantidade de um que já está no contrato. Serviço fora do orçamento também entra: escolha a etapa onde o gasto deve cair.
            </p>
            <ItensContrato key={itens.length} servicos={servicos} />
          </FormAcao>
        </Secao>
      )}
    </>
  )
}
