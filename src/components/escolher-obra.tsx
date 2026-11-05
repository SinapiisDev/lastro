import Link from 'next/link'
import { CabecalhoTela, Cartao, EstadoVazio } from '@ds'
import { sql } from '@/lib/db'

// Setor de compras: antes de abrir uma compra ou cotação, escolhe a obra (só as ativas).
export async function EscolherObra({ contexto, titulo, destino }: { contexto: string; titulo: string; destino: string }) {
  const obras = await sql<{ id: number; nome: string; cidade: string | null }[]>`select id, nome, cidade from obras where ativa order by nome`
  return (
    <>
      <CabecalhoTela contexto={contexto} titulo={titulo}>
        <p className="text-table text-ink-2">Para qual obra?</p>
      </CabecalhoTela>
      <Cartao className="max-w-2xl">
        {obras.length === 0 ? (
          <EstadoVazio titulo="Nenhuma obra ativa">O dono cadastra as obras em Configurações.</EstadoVazio>
        ) : (
          <ul className="flex flex-col">
            {obras.map((o) => (
              <li key={o.id} className="border-b border-line last:border-0">
                <Link href={`${destino}?obra=${o.id}`} className="flex min-h-12 items-center justify-between gap-3 px-1 py-3 font-semibold no-underline hover:bg-surface-2">
                  {o.nome}
                  {o.cidade && <span className="text-label font-medium text-ink-3">{o.cidade}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  )
}
