// Anexos baixados do sistema antigo: uma pasta por documento, com o número dele ("001840/nota.pdf").
// Regras puras (sem banco), usadas pela tela e pelo servidor.

export const TIPOS_ANEXO = ['nota_fiscal', 'orcamento', 'pedido', 'boleto', 'comprovante', 'outro'] as const
export type TipoAnexo = (typeof TIPOS_ANEXO)[number]

/** Número do documento pela pasta do arquivo ("Obra Prima - anexos/001840/nota.pdf" → "001840"). */
export function codigoDaPasta(caminhoRelativo: string): string | null {
  const partes = caminhoRelativo.split('/')
  const pasta = partes.at(-2)
  return pasta && /^\d{3,10}$/.test(pasta) ? pasta : null
}

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Tipo pelo nome do arquivo; XML de nota é sempre nota fiscal. Na dúvida, "outro". */
export function tipoDoAnexo(nome: string): TipoAnexo {
  const n = sem(nome)
  if (n.endsWith('.xml') || /\b(nf|nfe|nfs|nfse|danfe|nota)\b|nota.?fiscal/.test(n)) return 'nota_fiscal'
  if (/boleto|\bbol\b/.test(n)) return 'boleto'
  if (/comprovante|\bcomp\b|recibo|pagamento|\bpix\b|transfer/.test(n)) return 'comprovante'
  if (/orcamento|\borc\b|proposta/.test(n)) return 'orcamento'
  if (/pedido|\boc\b|ordem.de.compra/.test(n)) return 'pedido'
  return 'outro'
}

/** Arquivos que não sobem: os de controle que o download deixou na pasta e os ocultos do sistema. */
export const ignorarArquivo = (nome: string) => nome.startsWith('.') || /\.(parcial|log|jsonl)$/i.test(nome)
