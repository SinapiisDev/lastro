import { after } from 'next/server'
import { sqlSistema, comoEmpresa } from '@/lib/db'
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

  // fornecedor -> empresa dele, para a IA trabalhar depois dentro da construtora certa
  const paraLer = new Map<number, number>()
  const pedirTexto = new Map<number, number>()
  for (const m of mensagens) {
    // Um número só para todas as construtoras: se o fornecedor atende mais de uma, a mensagem vai para a
    // que falou com ele por último.
    // shortcut: fornecedor em duas construtoras ao mesmo tempo pode cair na errada; se acontecer, número por construtora.
    const [f] = await sqlSistema<{ id: number; empresaId: number }[]>`
      select f.id, f.empresa_id as "empresaId" from fornecedores f
      where f.whatsapp in ${sqlSistema(variantesWhatsapp(m.from))}
      order by (select max(id) from mensagens x where x.fornecedor_id = f.id and x.direcao = 'saida') desc nulls last, f.id desc
      limit 1`
    // shortcut: número que não é de fornecedor cadastrado é ignorado; se precisar, criar uma caixa de "desconhecidos".
    if (!f) {
      console.warn('WhatsApp de número não cadastrado:', m.from)
      continue
    }
    if (m.type === 'audio' || m.type === 'voice') {
      if (await comoEmpresa(f.empresaId, () => registrarEntrada(f.id, { texto: '[áudio]', whatsappId: m.id, paraIA: false }))) pedirTexto.set(f.id, f.empresaId)
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
    if ((await comoEmpresa(f.empresaId, () => registrarEntrada(f.id, { texto, anexo, whatsappId: m.id, paraIA: lerIA }))) && lerIA)
      paraLer.set(f.id, f.empresaId)
  }

  // Responde logo para a Meta (senão ela reenvia); a IA trabalha depois.
  after(async () => {
    for (const [id, empresaId] of pedirTexto) {
      await comoEmpresa(empresaId, async () => {
        const f = await carregarFornecedor(id)
        if (f) await responderAudio(f).catch((e) => console.error('Resposta de áudio falhou:', e))
      })
    }
    for (const [id, empresaId] of paraLer) {
      const aviso = await comoEmpresa(empresaId, () => processarFornecedor(id)).catch((e) => `erro: ${e}`)
      if (aviso) console.warn(`IA no fornecedor ${id}:`, aviso)
    }
  })
  return new Response('ok')
}
