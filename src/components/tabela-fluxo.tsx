import { brl, mesBR, projetarFluxo } from '@/lib/regras'
import { Rolagem } from './ui'

type Linha = ReturnType<typeof projetarFluxo>[number]

const valor = (v: number) => <span className={v < 0 ? 'font-semibold text-erro' : ''}>{brl(v)}</span>

// Com `comparar`, mostra lado a lado o acumulado sem e com uma compra em análise.
export function TabelaFluxo({ linhas, comparar }: { linhas: Linha[]; comparar?: Linha[] }) {
  return (
    <Rolagem>
      <table className="tabela">
        <thead>
          <tr>
            <th>Mês</th>
            <th className="num">Entradas</th>
            <th className="num">Saídas</th>
            <th className="num">Saldo do mês</th>
            <th className="num">{comparar ? 'Acumulado sem a compra' : 'Saldo acumulado'}</th>
            {comparar && <th className="num">Acumulado com a compra</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={l.mes}>
              <td>{mesBR(l.mes)}</td>
              <td className="num">{brl(l.entradas)}</td>
              <td className="num">{brl(l.saidas)}</td>
              <td className="num">{valor(l.saldoMes)}</td>
              <td className="num">{valor(l.acumulado)}</td>
              {comparar && <td className="num">{valor(comparar[i].acumulado)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Rolagem>
  )
}
