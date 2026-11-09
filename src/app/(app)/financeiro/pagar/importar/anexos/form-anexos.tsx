'use client'

import { useRef, useState } from 'react'
import { Botao, BotaoLink, Cartao, Kpi, Mensagem } from '@ds'
import { codigoDaPasta, ignorarArquivo } from '@/lib/anexos-importados'
import { documentosDosCodigos, autorizarEnvio, registrarAnexos } from './acoes'

const n = (x: number) => x.toLocaleString('pt-BR')
const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} MB`
const LOTE = 25
const SIMULTANEOS = 4

type Arquivo = { arquivo: File; codigo: string; compraId: number }
type Leitura = { arquivos: Arquivo[]; pastas: number; semDocumento: string[]; tamanho: number }
type Andamento = { enviados: number; pulados: number; falhas: { nome: string; motivo: string }[]; total: number }

// O navegador sobe direto para o Storage, com o endereço que o servidor autorizou (um por arquivo).
async function subir(url: string, f: File) {
  const r = await fetch(url, { method: 'PUT', headers: { 'content-type': f.type || 'application/octet-stream', 'x-upsert': 'false' }, body: f })
  if (r.ok) return null
  const t = await r.text()
  // Já estava no Storage (envio anterior interrompido antes de anexar): só falta anexar.
  if (r.status === 409 || /already exists|duplicate/i.test(t)) return null
  return `erro ${r.status}`
}

async function emParalelo<T>(itens: T[], fn: (x: T) => Promise<void>) {
  const fila = [...itens]
  await Promise.all(Array.from({ length: SIMULTANEOS }, async () => {
    for (let x = fila.shift(); x; x = fila.shift()) await fn(x)
  }))
}

export function FormAnexos() {
  const [leitura, setLeitura] = useState<Leitura | null>(null)
  const [lendo, setLendo] = useState(false)
  const [andamento, setAndamento] = useState<Andamento | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const parar = useRef(false)

  async function escolher(lista: FileList | null) {
    setLeitura(null)
    setAndamento(null)
    setErro(null)
    if (!lista?.length) return
    setLendo(true)
    try {
      const porCodigo = new Map<string, File[]>()
      for (const f of Array.from(lista)) {
        const codigo = codigoDaPasta(f.webkitRelativePath || f.name)
        if (!codigo || ignorarArquivo(f.name)) continue
        porCodigo.set(codigo, [...(porCodigo.get(codigo) ?? []), f])
      }
      if (!porCodigo.size) return setErro('Não achei as pastas dos documentos (com o número, ex.: 001840). Escolha a pasta "Obra Prima - anexos".')
      const codigos = [...porCodigo.keys()].sort()
      const mapa: Record<string, number> = {}
      for (let i = 0; i < codigos.length; i += 1000) Object.assign(mapa, await documentosDosCodigos(codigos.slice(i, i + 1000)))
      const arquivos: Arquivo[] = []
      const semDocumento: string[] = []
      for (const c of codigos) {
        if (!mapa[c]) {
          semDocumento.push(c)
          continue
        }
        for (const f of porCodigo.get(c)!.sort((a, b) => a.name.localeCompare(b.name))) arquivos.push({ arquivo: f, codigo: c, compraId: mapa[c] })
      }
      setLeitura({ arquivos, pastas: codigos.length - semDocumento.length, semDocumento, tamanho: arquivos.reduce((t, a) => t + a.arquivo.size, 0) })
    } catch {
      setErro('Não consegui conferir os documentos. Recarregue a página e tente de novo.')
    } finally {
      setLendo(false)
    }
  }

  async function enviar() {
    if (!leitura) return
    parar.current = false
    setEnviando(true)
    setErro(null)
    const a: Andamento = { enviados: 0, pulados: 0, falhas: [], total: leitura.arquivos.length }
    setAndamento({ ...a })
    try {
      for (let i = 0; i < leitura.arquivos.length && !parar.current; i += LOTE) {
        const lote = leitura.arquivos.slice(i, i + LOTE)
        const r = await autorizarEnvio(lote.map((x, indice) => ({ indice, compraId: x.compraId, nome: x.arquivo.name })))
        if ('erro' in r) {
          a.falhas.push(...lote.map((x) => ({ nome: `${x.codigo}/${x.arquivo.name}`, motivo: r.erro })))
          setAndamento({ ...a })
          continue
        }
        const subidos: { compraId: number; nome: string; caminho: string }[] = []
        await emParalelo(r.ok, async (e) => {
          const x = lote[e.indice]
          if (!e.url) {
            a.pulados++
            return
          }
          const falha = await subir(e.url, x.arquivo).catch(() => 'sem conexão')
          if (falha) a.falhas.push({ nome: `${x.codigo}/${x.arquivo.name}`, motivo: falha })
          else subidos.push({ compraId: e.compraId, nome: e.nome, caminho: e.caminho })
        })
        if (subidos.length) {
          const g = await registrarAnexos(subidos)
          if ('erro' in g) a.falhas.push(...subidos.map((x) => ({ nome: x.nome, motivo: g.erro })))
          else a.enviados += subidos.length
        }
        setAndamento({ ...a })
      }
    } catch {
      setErro('A conexão caiu no meio do envio. Escolha a pasta de novo e envie: o que já subiu é pulado.')
    } finally {
      setEnviando(false)
    }
  }

  const feito = andamento ? andamento.enviados + andamento.pulados + andamento.falhas.length : 0
  const pct = andamento?.total ? Math.round((feito / andamento.total) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <Cartao className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-h2 font-normal">Pasta de anexos do sistema antigo</h2>
          <p className="text-[13px] text-ink-2">
            Escolha a pasta <strong>Obra Prima - anexos</strong>, que tem uma subpasta por documento, com o número dele (ex.: 001840). Cada arquivo é anexado ao documento importado com o
            mesmo número. Importe a planilha antes: pasta sem documento no sistema fica de fora.
          </p>
        </div>
        <label className="flex cursor-pointer flex-col items-start gap-2">
          <span className="text-label font-semibold text-ink-2">Pasta</span>
          <input
            type="file"
            multiple
            disabled={enviando || lendo}
            onChange={(e) => escolher(e.target.files)}
            className="text-[13px] file:mr-3 file:h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-surface-2 file:px-4 file:font-semibold file:text-ink"
            {...{ webkitdirectory: '', directory: '' }}
          />
        </label>
        {lendo && <p className="text-[12.5px] font-semibold text-ink-3">Conferindo os documentos…</p>}
        {erro && <Mensagem tom="erro" titulo="Não deu para enviar">{erro}</Mensagem>}
      </Cartao>

      {leitura && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <Kpi tom="escuro" rotulo="Arquivos para anexar" valor={n(leitura.arquivos.length)} detalhe={`${n(leitura.pastas)} documentos · ${mb(leitura.tamanho)}`} corDetalhe="acento" />
            <Kpi
              tom={leitura.semDocumento.length ? 'aviso' : 'padrao'}
              rotulo="Pastas sem documento aqui"
              valor={n(leitura.semDocumento.length)}
              detalhe={leitura.semDocumento.length ? `ficam de fora (ex.: ${leitura.semDocumento.slice(0, 3).join(', ')})` : 'todas têm documento'}
              corDetalhe={leitura.semDocumento.length ? 'aviso' : undefined}
            />
            <Kpi rotulo="Enviado" valor={`${pct}%`} detalhe={andamento ? `${n(andamento.enviados)} anexados · ${n(andamento.pulados)} já estavam` : 'ainda não começou'} />
          </section>

          <Cartao className="flex flex-col gap-3">
            {andamento && (
              <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
              </div>
            )}
            {andamento && !enviando && feito >= andamento.total && (
              <Mensagem tom={andamento.falhas.length ? 'erro' : 'ok'} titulo={andamento.falhas.length ? `${n(andamento.falhas.length)} arquivos não subiram` : 'Anexos enviados'}>
                {n(andamento.enviados)} arquivos anexados aos documentos{andamento.pulados ? `; ${n(andamento.pulados)} já estavam anexados` : ''}.
                {andamento.falhas.length > 0 && ' Envie a pasta de novo para tentar só os que faltam.'}
              </Mensagem>
            )}
            {andamento && andamento.falhas.length > 0 && (
              <ul className="max-h-40 overflow-y-auto text-caption text-ink-3">
                {andamento.falhas.slice(0, 50).map((f) => (
                  <li key={f.nome}>
                    {f.nome}: {f.motivo}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {enviando ? (
                <Botao type="button" variante="fantasma" onClick={() => (parar.current = true)}>
                  Parar
                </Botao>
              ) : (
                leitura.arquivos.length > 0 && (
                  <Botao type="button" variante="acento" tamanho="lg" onClick={enviar}>
                    {andamento ? 'Enviar de novo (pula o que já subiu)' : `Anexar ${n(leitura.arquivos.length)} arquivos`}
                  </Botao>
                )
              )}
              <BotaoLink href="/financeiro/pagar?origem=financeiro" variante="fantasma">
                Ver contas a pagar
              </BotaoLink>
            </div>
            {enviando && <p className="text-caption text-ink-3">Deixe esta página aberta até terminar. Se parar no meio, é só enviar a pasta de novo.</p>}
          </Cartao>
        </>
      )}
    </div>
  )
}
