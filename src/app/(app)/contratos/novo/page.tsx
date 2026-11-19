import { sql, hoje } from '@/lib/db'
import { exigirSessao, obraDeTrabalho } from '@/lib/sessao'
import { CabecalhoTela, Campo, Cartao, Entrada, FormAcao, SelecaoBusca } from '@ds'
import { EscolherObra } from '@/components/escolher-obra'
import { ItensContrato } from '../itens'
import { servicosDaObra } from '../servicos'
import { criarContrato } from '../acoes'

export default async function NovoContrato({ searchParams }: PageProps<'/contratos/novo'>) {
  const s = await exigirSessao('obra', 'compras', 'chefe')
  const obraId = await obraDeTrabalho(s, (await searchParams).obra)
  if (!obraId) return <EscolherObra contexto="Contratos" titulo="Novo contrato" destino="/contratos/novo" />
  const [[obra], servicos, fornecedores, dia] = await Promise.all([
    sql<{ nome: string }[]>`select nome from obras where id = ${obraId}`,
    servicosDaObra(obraId),
    sql<{ id: number; nome: string }[]>`select id, nome from fornecedores order by nome`,
    hoje(),
  ])

  return (
    <>
      <CabecalhoTela contexto={`Contratos · ${obra.nome}`} titulo="Novo contrato" />
      <FormAcao action={criarContrato} botao="Criar contrato" variante="primario" tamanho="lg" className="flex max-w-4xl flex-col gap-4">
        <input type="hidden" name="obra" value={obraId} />
        <Cartao className="flex flex-col gap-4">
          <h2 className="font-display text-h2 font-normal">Contrato</h2>
          <Campo rotulo="Objeto" ajuda="O que o empreiteiro vai fazer. Aparece na conta a pagar de cada medição.">
            <Entrada name="objeto" required placeholder="Ex.: Pintura interna – torre A" />
          </Campo>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Campo rotulo="Empreiteiro" ajuda="Não está na lista? Deixe em branco e escreva o nome ao lado.">
              <SelecaoBusca
                name="fornecedor"
                placeholder="Digite o nome do empreiteiro"
                opcoes={[{ valor: '', rotulo: 'Novo empreiteiro (escrever o nome ao lado)' }, ...fornecedores.map((f) => ({ valor: String(f.id), rotulo: f.nome }))]}
              />
            </Campo>
            <Campo rotulo="Nome do empreiteiro novo">
              <Entrada name="fornecedor_nome" placeholder="Só se não estiver na lista" />
            </Campo>
            <Campo rotulo="CNPJ ou CPF do empreiteiro novo (opcional)">
              <Entrada name="fornecedor_cnpj" />
            </Campo>
            <Campo rotulo="Início">
              <Entrada name="inicio" type="date" defaultValue={dia} required />
            </Campo>
          </div>
        </Cartao>
        <Cartao className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-h2 font-normal">Serviços contratados</h2>
            <p className="text-[13px] text-ink-2">
              Escolha o serviço do orçamento e informe só o que foi empreitado: se a obra tem 1.000 m² de pintura e o contrato é de 200 m², a quantidade é 200.
              Pacote com vários serviços (pintura interna, externa, de forro…)? Use <strong>Adicionar outro serviço</strong>.
            </p>
          </div>
          {servicos.length ? (
            <ItensContrato servicos={servicos} />
          ) : (
            <p className="text-[13px] font-semibold text-warn">Esta obra ainda não tem etapas e serviços. Monte o orçamento antes de criar o contrato.</p>
          )}
        </Cartao>
      </FormAcao>
    </>
  )
}
