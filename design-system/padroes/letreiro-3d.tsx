'use client'

import { useEffect, useRef } from 'react'
import type * as THREE from 'three'

/**
 * Letreiro 3D da entrada: cada letra é um prédio erguido andar por andar (fundação, blocos subindo em lima,
 * cor final quando prontos), enquanto a câmera gira até ficar de frente e o nome aparece.
 * A three.js só é baixada nas telas que usam este componente (mesma regra do Predio3D).
 */

// Letras numa grade 5×7, de cima para baixo. shortcut: só as letras de LASTRO; outra palavra precisa das suas letras aqui.
const FONTE: Record<string, string[]> = {
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
}

// Cores do modelo 3D (materiais, não interface): lima da obra; bloco pronto escuro no claro e claro no escuro.
const COR = { obra: 0xc6df5f, prontoClaro: 0x1f1f1f, prontoEscuro: 0xe6e6e1, fundacao: 0x9d9d97 }

const ANDAR = 0.5 // s entre um andar e o próximo
const LETRA = 0.16 // s de atraso de uma letra para a seguinte
const CRESCER = 0.55 // s que cada bloco leva para subir
const FUNDACAO = 0.6 // s da fundação antes do primeiro andar

export function Letreiro3D({ texto = 'LASTRO', className = '', rotulo }: { texto?: string; className?: string; rotulo?: string }) {
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    let vivo = true
    let limpar = () => {}
    import('three').then((T) => {
      if (vivo) limpar = montar(T, el, texto.toUpperCase())
    })
    return () => {
      vivo = false
      limpar()
    }
  }, [texto])

  return <div ref={caixa} role="img" aria-label={rotulo ?? texto} className={`relative h-full w-full ${className}`} />
}

function montar(T: typeof THREE, el: HTMLDivElement, texto: string) {
  const escuro = () => document.documentElement.getAttribute('data-tema') === 'escuro'
  const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const r = new T.WebGLRenderer({ antialias: true, alpha: true })
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  r.shadowMap.enabled = true
  r.shadowMap.type = T.PCFSoftShadowMap
  r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
  el.appendChild(r.domElement)

  const s = new T.Scene()
  const cam = new T.PerspectiveCamera(26, 1, 0.1, 400)
  s.add(new T.HemisphereLight(0xffffff, 0xb8b8b2, 1.2))
  const luz = new T.DirectionalLight(0xffffff, 1.6)
  luz.position.set(14, 26, 16)
  luz.castShadow = true
  luz.shadow.mapSize.set(2048, 2048)
  Object.assign(luz.shadow.camera, { left: -26, right: 26, top: 16, bottom: -16, far: 90 })
  luz.shadow.bias = -0.0005
  s.add(luz)
  const chao = new T.Mesh(new T.PlaneGeometry(160, 160), new T.ShadowMaterial({ opacity: 0.13 }))
  chao.rotation.x = -Math.PI / 2
  chao.receiveShadow = true
  s.add(chao)

  const mat = (c: number) => new T.MeshStandardMaterial({ color: c, roughness: 0.8 })
  const obra = mat(COR.obra)
  const pronto = mat(escuro() ? COR.prontoEscuro : COR.prontoClaro)
  const fundacao = mat(COR.fundacao)
  const aoTema = () => pronto.color.setHex(escuro() ? COR.prontoEscuro : COR.prontoClaro)
  window.addEventListener('go-tema', aoTema)

  // Monta os blocos de cada letra; cada um sabe quando começa a subir.
  const letras = [...texto].filter((c) => FONTE[c])
  const largura = letras.length * 6 - 1
  const BASE = 0.22
  type Bloco = { m: THREE.Mesh; inicio: number; pronto: boolean }
  const blocos: Bloco[] = []
  const caixaMesh = (w: number, h: number, d: number, x: number, y: number, material: THREE.Material) => {
    const g = new T.BoxGeometry(w, h, d)
    g.translate(0, h / 2, 0)
    const m = new T.Mesh(g, material)
    m.position.set(x, y, 0)
    m.castShadow = m.receiveShadow = true
    s.add(m)
    return m
  }
  letras.forEach((letra, li) => {
    const x0 = li * 6 - largura / 2 + 0.5
    const atraso = li * LETRA
    blocos.push({ m: caixaMesh(5.4, BASE, 2, x0 + 2, 0, fundacao), inicio: atraso, pronto: true })
    FONTE[letra].forEach((linha, r) => {
      const andar = 6 - r
      ;[...linha].forEach((v, c) => {
        if (v !== '1') return
        const m = caixaMesh(0.94, 0.94, 1.5, x0 + c, BASE + andar * 0.98, obra)
        blocos.push({ m, inicio: FUNDACAO + atraso + andar * ANDAR + c * 0.03, pronto: false })
      })
    })
  })
  const total = Math.max(...blocos.map((b) => b.inicio)) + CRESCER

  // Câmera: começa de lado e do alto, termina quase de frente para ler o nome.
  const alvo = new T.Vector3(0, 3.6, 0)
  const DE = { az: 0.95, el: 0.55 },
    PARA = { az: 0.14, el: 0.16 }
  let dist = 40
  // Tamanho do quadro: só quando a área muda (setSize recria o buffer da tela).
  const medir = () => {
    const w = el.clientWidth || 300,
      h = el.clientHeight || 300
    r.setSize(w, h, false)
    cam.aspect = w / h
    const vfov = (cam.fov * Math.PI) / 180
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect)
    dist = Math.max((largura / 2 + 1) / Math.tan(hfov / 2), (7 / 2 + 1.5) / Math.tan(vfov / 2))
    cam.updateProjectionMatrix()
  }
  const enquadrar = (az: number, el2: number) => {
    cam.position.set(
      alvo.x + dist * Math.cos(el2) * Math.sin(az),
      alvo.y + dist * Math.sin(el2),
      alvo.z + dist * Math.cos(el2) * Math.cos(az),
    )
    cam.lookAt(alvo)
  }
  const suave = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

  let az = parado ? PARA.az : DE.az,
    el2 = parado ? PARA.el : DE.el
  const ro = new ResizeObserver(() => {
    medir()
    enquadrar(az, el2)
    r.render(s, cam)
  })
  ro.observe(el)
  let visivel = true
  const io = new IntersectionObserver(([e]) => (visivel = e.isIntersecting))
  io.observe(el)

  // Movimento reduzido: o nome já aparece pronto, de frente, parado.
  for (const b of blocos) {
    b.m.scale.y = parado ? 1 : 0.001
    b.m.visible = parado // antes da hora de subir, o bloco não aparece (nem como placa no chão)
    if (parado && !b.pronto) b.m.material = pronto
  }
  medir()
  enquadrar(az, el2)
  r.render(s, cam)
  if (parado)
    return () => {
      ro.disconnect()
      io.disconnect()
      window.removeEventListener('go-tema', aoTema)
      r.dispose()
      r.domElement.remove()
    }

  let quadro = 0
  const t0 = performance.now()
  const laco = () => {
    quadro = requestAnimationFrame(laco)
    if (!visivel) return
    const t = (performance.now() - t0) / 1000
    for (const b of blocos) {
      const k = Math.min(1, Math.max(0, (t - b.inicio) / CRESCER))
      b.m.visible = t >= b.inicio
      b.m.scale.y = Math.max(0.001, 1 - Math.pow(1 - k, 3))
      if (k >= 1 && !b.pronto) {
        b.pronto = true
        b.m.material = pronto
      }
    }
    // Gira até ficar de frente durante a obra; depois, só um balanço leve.
    const k = suave(Math.min(1, t / (total + 0.6)))
    az = DE.az + (PARA.az - DE.az) * k + (t > total + 0.6 ? Math.sin((t - total - 0.6) / 3) * 0.06 : 0)
    el2 = DE.el + (PARA.el - DE.el) * k
    enquadrar(az, el2)
    r.render(s, cam)
  }
  quadro = requestAnimationFrame(laco)

  return () => {
    cancelAnimationFrame(quadro)
    ro.disconnect()
    io.disconnect()
    window.removeEventListener('go-tema', aoTema)
    r.dispose()
    r.domElement.remove()
  }
}
