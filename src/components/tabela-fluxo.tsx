import { Dinheiro, Tabela, Td, Th, Tr } from '@ds'
import { mesBR, projetarFluxo } from '@/lib/regras'

type Linha = ReturnType<typeof projetarFluxo>[number]

// Fluxo mês a mês. Com `comparar`, mostra lado a lado o acumulado sem e com uma compra em análise.
// `noturno`: para usar dentro da faixa escura.
export function TabelaFluxo({ linhas, comparar, noturno = false }: { linhas: Linha[]; comparar?: Linha[]; noturno?: boolean }) {
  if (noturno) {
    return (
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[560px] border-collapse text-table">
          <thead>
            <tr className="text-left text-label text-night-ink-3 [&>th]:border-b [&>th]:border-night-3 [&>th]:px-2 [&>th]:py-2.5 [&>th]:font-semibold">
              <th>Mês</th>
              <th className="text-right">Entradas</th>
              <th className="text-right">Saídas</th>
              <th className="text-right">{comparar ? 'Sem a compra' : 'Saldo do mês'}</th>
              <th className="text-right">{comparar ? 'Com a compra' : 'Acumulado'}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.mes} className="[&>td]:border-b [&>td]:border-night-3 [&>td]:px-2 [&>td]:py-2.5">
                <td className="text-night-ink-2">{mesBR(l.mes)}</td>
                <td className="text-right text-accent">
                  <Dinheiro valor={l.entradas} />
                </td>
                <td className="text-right">
                  <Dinheiro valor={l.saidas} />
                </td>
                <td className="text-right font-semibold">
                  <Dinheiro valor={comparar ? l.acumulado : l.saldoMes} noturno />
                </td>
                <td className="text-right font-bold">
                  <Dinheiro valor={comparar ? comparar[i].acumulado : l.acumulado} noturno />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <Tabela minimo={560}>
      <thead>
        <tr>
          <Th>Mês</Th>
          <Th num>Entradas</Th>
          <Th num>Saídas</Th>
          <Th num>Saldo do mês</Th>
          <Th num>{comparar ? 'Acumulado sem a compra' : 'Saldo acumulado'}</Th>
          {comparar && <Th num>Acumulado com a compra</Th>}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <Tr key={l.mes}>
            <Td>{mesBR(l.mes)}</Td>
            <Td num>
              <Dinheiro valor={l.entradas} />
            </Td>
            <Td num className="text-ink-2">
              <Dinheiro valor={l.saidas} />
            </Td>
            <Td num forte>
              <Dinheiro valor={l.saldoMes} />
            </Td>
            <Td num forte>
              <Dinheiro valor={l.acumulado} />
            </Td>
            {comparar && (
              <Td num forte>
                <Dinheiro valor={comparar[i].acumulado} />
              </Td>
            )}
          </Tr>
        ))}
      </tbody>
    </Tabela>
  )
}
