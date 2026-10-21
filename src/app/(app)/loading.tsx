import { Cartao, Esqueleto } from '@ds'

// Carregando: esqueletos com pulso, nunca spinner em tela cheia (DESIGN.md §3).
export default function Carregando() {
  return (
    <div className="flex flex-col gap-4 pt-2" role="status" aria-label="Carregando">
      <span className="ds-esqueleto block h-10 w-72 rounded-sm" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="ds-esqueleto block h-28 rounded-lg" />
        ))}
      </div>
      <Cartao>
        <Esqueleto linhas={6} />
      </Cartao>
    </div>
  )
}
