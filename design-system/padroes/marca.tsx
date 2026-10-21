// Marca: três barras subindo (a primeira em lima), como um prédio em obra.
export function Marca({ tamanho = 34, comNome = true, subtitulo }: { tamanho?: number; comNome?: boolean; subtitulo?: string }) {
  const b = tamanho / 34
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex flex-none items-end justify-center rounded-[11px] bg-ink"
        style={{ width: tamanho, height: tamanho, gap: 3 * b, padding: `${8 * b}px 0` }}
      >
        <span className="rounded-[1px] bg-accent" style={{ width: 4 * b, height: 8 * b }} />
        <span className="rounded-[1px] bg-on-ink" style={{ width: 4 * b, height: 13 * b }} />
        <span className="rounded-[1px] bg-on-ink" style={{ width: 4 * b, height: 18 * b }} />
      </span>
      {comNome && (
        <span className="flex flex-col leading-[1.05] whitespace-nowrap">
          <span className="font-display text-[16px] font-medium tracking-[-0.01em]">Gestão de Obras</span>
          {subtitulo && <span className="text-[10.5px] font-semibold text-ink-3">{subtitulo}</span>}
        </span>
      )}
    </span>
  )
}
