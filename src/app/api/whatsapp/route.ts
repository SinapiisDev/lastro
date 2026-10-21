import { after } from 'next/server'
import { sql } from '@/lib/db'
import { assinaturaValida, baixarMidia } from '@/lib/whatsapp'
import { variantesWhatsapp } from '@/lib/cotacao'
import { registrarEntrada, processarFornecedor, responderAudio, carregarFornecedor } from '@/lib/conversa'
import { enviarArquivo, TAMANHO_MAXIMO } from '@/lib/storage'

// A IA pode levar alguns segundos por fornecedor depois da resposta à Meta.
export const maxDuration = 120

// A Meta confirma o webhook uma vez, mandando de volta o desafio com o token combinado.
export async function GET(req: Request) {
  const u = new URL(req.url)
  const token = process.env.WHATSAPP_VERIFY_TOKEN
  if (token && u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === token)
    return new Response(u.searchParams.get('hub.challenge') ?? '')
  return new Response('Proibido', { status: 403 })
}

type Midia = { id: string; mime_type?: string; caption?: string; filename?: string }
type MensagemWA = { from: string; id: string; type: string; text?: { body: string }; image?: Midia; document?: Midia }
type Corpo = { entry?: { changes?: { value?: { messages?: MensagemWA[] } }[] }[] }

export async function POST(req: Request) {
  const corpo = await req.text()
  if (!assinaturaValida(corpo, req.headers.get('x-hub-signature-256'))) return new Response('Assinatura inválida', { status: 401 })
  const mensagens = ((JSON.parse(corpo) as Corpo).entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []))

  const paraLer = new Set<number>()
  const pedirTexto = new Set<number>()
  for (const m of mensagens) {
    const [f] = await sql<{ id: number }[]>`select id from fornecedores where whatsapp in ${sql(variantesWhatsapp(m.from))}`
    // shortcut: número que não é de fornecedor cadastrado é ignorado; se precisar, criar uma caixa de "desconhecidos".
    if (!f) {
      console.warn('WhatsApp de número não cadastrado:', m.from)
      continue
    }
    if (m.type === 'audio' || m.type === 'voice') {
      if (await registrarEntrada(f.id, { texto: '[áudio]', whatsappId: m.id, paraIA: false })) pedirTexto.add(f.id)
      continue
    }
    const midia = m.image ?? m.document
    let anexo: { caminho: string; tipo: string } | undefined
    let aviso = ''
    if (midia) {
      try {
        const { dados, tipo } = await baixarMidia(midia.id)
        if (dados.size <= TAMANHO_MAXIMO) {
          const nome = midia.filename ?? `whatsapp-${m.id}.${tipo.split('/')[1] ?? 'bin'}`
          anexo = { caminho: await enviarArquivo(`fornecedor-${f.id}`, new File([dados], nome, { type: tipo })), tipo }
        } else aviso = '[anexo maior que 4 MB não foi guardado]'
      } catch (e) {
        console.error('Falha ao baixar mídia do WhatsApp:', e)
        aviso = '[anexo não pôde ser baixado]'
      }
    }
    const texto = [m.text?.body ?? midia?.caption, aviso].filter(Boolean).join(' ') || (midia ? null : `[mensagem do tipo ${m.type}]`)
    const lerIA = m.type === 'text' || !!anexo || !!midia?.caption
    if (await registrarEntrada(f.id, { texto, anexo, whatsappId: m.id, paraIA: lerIA }) && lerIA) paraLer.add(f.id)
  }

  // Responde logo para a Meta (senão ela reenvia); a IA trabalha depois.
  after(async () => {
    for (const id of pedirTexto) {
      const f = await carregarFornecedor(id)
      if (f) await responderAudio(f).catch((e) => console.error('Resposta de áudio falhou:', e))
    }
    for (const id of paraLer) {
      const aviso = await processarFornecedor(id).catch((e) => `erro: ${e}`)
      if (aviso) console.warn(`IA no fornecedor ${id}:`, aviso)
    }
  })
  return new Response('ok')
}
