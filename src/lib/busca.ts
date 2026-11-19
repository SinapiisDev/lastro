// Busca de digitação livre: sem acento, sem maiúscula, cada palavra em qualquer parte do texto e em qualquer ordem
// ("metal sol" acha "Solda para metalon"). Consulta vazia casa com tudo.
const limpar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function casaBusca(texto: string, consulta: string) {
  const alvo = limpar(texto)
  return limpar(consulta)
    .split(/\s+/)
    .filter(Boolean)
    .every((palavra) => alvo.includes(palavra))
}
