'use client'

// Alterna claro/escuro; guarda a escolha (mesma chave das referências) e avisa quem desenha com o tema (prédio 3D).
export function alternarTema() {
  const raiz = document.documentElement
  const novo = raiz.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro'
  raiz.setAttribute('data-tema', novo)
  try {
    localStorage.setItem('go-tema', novo)
  } catch {}
  window.dispatchEvent(new CustomEvent('go-tema', { detail: novo }))
}

export function BotaoTema({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={alternarTema}
      title="Alternar tema claro/escuro"
      aria-label="Alternar tema claro ou escuro"
      className={`flex size-10 flex-none cursor-pointer items-center justify-center rounded-full bg-surface text-[16px] text-ink hover:bg-surface-2 ${className}`}
    >
      ◐
    </button>
  )
}
