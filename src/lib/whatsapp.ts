import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

// WhatsApp Cloud API (oficial, da Meta). Sem WHATSAPP_TOKEN e WHATSAPP_PHONE_ID o sistema fica em
// modo simulado: as mensagens só ficam registradas, nada sai para a internet.
// shortcut: versão fixa da Graph API; a Meta mantém cada versão por cerca de 2 anos, atualizar quando avisar.
const API = 'https://graph.facebook.com/v23.0'

export const whatsappReal = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID)
const autorizacao = () => ({ Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` })

// Modelos (templates) que precisam estar aprovados na Meta com estes nomes e textos (veja o README).
// A primeira mensagem a um fornecedor, e qualquer uma depois de 24 h sem resposta dele, só pode ser modelo.
export const MODELOS = {
  pedido_cotacao: (p: string[]) =>
    `Olá, ${p[0]}! Aqui é da ${p[1]}. Gostaríamos de uma cotação para a obra ${p[2]}: ${p[3]}. Por favor, informe o preço de cada item, o frete, o prazo de entrega e a condição de pagamento a prazo. Responder até ${p[4]}. Cotação nº ${p[5]}.`,
  lembrete_cotacao: (p: string[]) =>
    `Olá, ${p[0]}! Ainda aguardamos os preços da cotação nº ${p[1]} (obra ${p[2]}). Consegue responder até ${p[3]}?`,
  pedido_compra: (p: string[]) =>
    `Olá, ${p[0]}! Pedido confirmado pela ${p[1]} (cotação nº ${p[2]}): ${p[3]}. Total ${p[4]}. Entrega na obra ${p[5]}. Obrigado!`,
}
export type Modelo = keyof typeof MODELOS

async function enviar(corpo: object): Promise<string | null> {
  if (!whatsappReal()) return null
  const r = await fetch(`${API}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { ...autorizacao(), 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...corpo }),
  })
  const j = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } }
  if (!r.ok) throw new Error(`O WhatsApp recusou a mensagem (${r.status}): ${j.error?.message ?? 'sem detalhe'}`)
  return j.messages?.[0]?.id ?? null
}

export const enviarTexto = (para: string, texto: string) => enviar({ to: para, type: 'text', text: { body: texto } })

// Parâmetros de modelo não podem ter quebra de linha (regra da Meta).
export const enviarModelo = (para: string, modelo: Modelo, parametros: string[]) =>
  enviar({
    to: para,
    type: 'template',
    template: {
      name: modelo,
      language: { code: 'pt_BR' },
      components: [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text: text.replace(/\s+/g, ' ') })) }],
    },
  })

// Código de entrada no sistema: modelo da categoria Autenticação, com o botão "Copiar código".
export const enviarCodigo = (para: string, codigo: string) =>
  enviar({
    to: para,
    type: 'template',
    template: {
      name: 'codigo_acesso',
      language: { code: 'pt_BR' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: codigo }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] },
      ],
    },
  })

// A Meta assina cada chamada do webhook com o segredo do app: sem assinatura válida, nada entra.
export function assinaturaValida(corpo: string, assinatura: string | null) {
  const segredo = process.env.WHATSAPP_APP_SECRET
  if (!segredo || !assinatura?.startsWith('sha256=')) return false
  const esperado = Buffer.from(createHmac('sha256', segredo).update(corpo).digest('hex'))
  const recebido = Buffer.from(assinatura.slice(7))
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
}

export async function baixarMidia(id: string) {
  const info = (await (await fetch(`${API}/${id}`, { headers: autorizacao() })).json()) as { url?: string; mime_type?: string }
  if (!info.url) throw new Error('Mídia do WhatsApp não encontrada')
  const r = await fetch(info.url, { headers: autorizacao() })
  if (!r.ok) throw new Error(`Falha ao baixar mídia do WhatsApp (${r.status})`)
  return { dados: await r.blob(), tipo: info.mime_type ?? 'application/octet-stream' }
}
