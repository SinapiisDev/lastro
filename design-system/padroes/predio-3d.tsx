'use client'

import { useEffect, useRef } from 'react'
import type * as THREE from 'three'

/**
 * Obra 3D (DESIGN.md §4): o prédio se constrói pelas etapas. Partes não executadas aparecem só em contorno.
 * Porte de design-system/referencias/predio-3d.js. A three.js só é baixada nas telas que usam este componente.
 */
export type Progresso = { fundacao: number; estrutura: number; alvenaria: number; instalacoes: number; cobertura: number; acabamento: number }

const H = 1.1,
  W = 6,
  D = 4,
  BASE = 0.3
const COLX = [-3, -1, 1, 3],
  COLZ = [-2, 0, 2]

// Cores do modelo 3D (materiais de obra; não são cores de interface).
const COR = { found: 0x9d9d97, conc: 0xc4c4bf, slab: 0xd9d9d4, block: 0xcfc8bd, fin: 0xf6f6f2, glass: 0x1f2428, acc: 0xc6df5f, pipe: 0x8a8a84 }

export function Predio3D({
  progresso,
  andares = 8,
  enquadreX = 0,
  enquadreY = 0,
  zoom = 1,
  className = '',
  rotulo = 'Prédio em 3D mostrando o avanço da obra',
}: {
  progresso: Progresso
  andares?: number
  enquadreX?: number
  enquadreY?: number
  zoom?: number
  className?: string
  rotulo?: string
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const cena = useRef<{ reconstruir: (p: Progresso) => void; enquadrar: () => void } | null>(null)
  const prog = useRef(progresso)
  const quadro = useRef({ enquadreX, enquadreY, zoom })

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    let vivo = true
    let limpar = () => {}
    import('three').then((T) => {
      if (!vivo) return
      limpar = montar(T, el, andares, prog, quadro, cena)
    })
    return () => {
      vivo = false
      limpar()
      cena.current = null
    }
  }, [andares])

  useEffect(() => {
    prog.current = progresso
    cena.current?.reconstruir(progresso)
  }, [progresso])
  useEffect(() => {
    quadro.current = { enquadreX, enquadreY, zoom }
    cena.current?.enquadrar()
  }, [enquadreX, enquadreY, zoom])

  return <div ref={caixa} role="img" aria-label={rotulo} className={`relative h-full w-full ${className}`} />
}

function montar(
  T: typeof THREE,
  el: HTMLDivElement,
  N: number,
  prog: { current: Progresso },
  quadro: { current: { enquadreX: number; enquadreY: number; zoom: number } },
  cena: { current: { reconstruir: (p: Progresso) => void; enquadrar: () => void } | null },
) {
  const escuro = () => document.documentElement.getAttribute('data-tema') === 'escuro'
  const r = new T.WebGLRenderer({ antialias: true, alpha: true })
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  r.shadowMap.enabled = true
  r.shadowMap.type = T.PCFSoftShadowMap
  r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab'
  el.appendChild(r.domElement)

  const s = new T.Scene()
  const cam = new T.PerspectiveCamera(28, 1, 0.1, 300)
  s.add(new T.HemisphereLight(0xffffff, 0xb8b8b2, 1.15))
  const dl = new T.DirectionalLight(0xffffff, 1.7)
  dl.position.set(12, 22, 9)
  dl.castShadow = true
  dl.shadow.mapSize.set(2048, 2048)
  Object.assign(dl.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, far: 80 })
  dl.shadow.bias = -0.0005
  s.add(dl)
  const chao = new T.Mesh(new T.PlaneGeometry(80, 80), new T.ShadowMaterial({ opacity: 0.14 }))
  chao.rotation.x = -Math.PI / 2
  chao.receiveShadow = true
  s.add(chao)
  const mundo = new T.Group()
  mundo.rotation.y = -0.6
  s.add(mundo)
  const grp = new T.Group()
  const grua = new T.Group()
  mundo.add(grp, grua)

  let jib: THREE.Group | null = null
  let anims: { m: THREE.Mesh; t: number }[] = []
  let anteriores = new Set<string>()
  let chaves = new Set<string>()
  let materiais: ReturnType<typeof criarMateriais> | null = null

  function criarMateriais(dk: boolean) {
    const M = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o })
    return {
      dk,
      pad: M(dk ? 0x1d1d1d : 0xe2e2de),
      found: M(COR.found),
      conc: M(COR.conc),
      slab: M(COR.slab),
      block: M(COR.block),
      fin: M(COR.fin),
      glass: M(COR.glass, { roughness: 0.25, metalness: 0.45 }),
      acc: M(COR.acc, { roughness: 0.6 }),
      dark: M(dk ? 0x3a3a3a : 0x1a1a1a, { roughness: 0.6 }),
      pipe: M(COR.pipe),
      ghost: new T.LineBasicMaterial({ color: dk ? 0xffffff : 0x111111, transparent: true, opacity: dk ? 0.22 : 0.16 }),
      ghost2: new T.LineBasicMaterial({ color: dk ? 0xffffff : 0x111111, transparent: true, opacity: dk ? 0.1 : 0.07 }),
    }
  }
  const mats = () => {
    const dk = escuro()
    if (!materiais || materiais.dk !== dk) materiais = criarMateriais(dk)
    return materiais
  }

  function caixaMesh(chave: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, semAnim = false, pai: THREE.Group = grp) {
    const g = new T.BoxGeometry(w, h, d)
    g.translate(0, h / 2, 0)
    const m = new T.Mesh(g, mat)
    m.position.set(x, y, z)
    m.castShadow = true
    m.receiveShadow = true
    pai.add(m)
    chaves.add(chave)
    if (!semAnim && !anteriores.has(chave)) {
      m.scale.y = 0.001
      anims.push({ m, t: performance.now() + Math.random() * 180 })
    }
    return m
  }
  function arestas(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
    const e = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w, h, d)), mat)
    e.position.set(x, y + h / 2, z)
    grp.add(e)
  }

  function reconstruir(p: Progresso, semAnim = false) {
    const M = mats()
    for (const c of [...grp.children]) {
      grp.remove(c)
      ;(c as THREE.Mesh).geometry?.dispose()
    }
    for (const c of [...grua.children]) grua.remove(c)
    anims = []
    chaves = new Set()
    if (semAnim) anteriores = new Set(['*'])
    const tudo = anteriores.has('*')
    if (tudo) anteriores = { has: () => true } as unknown as Set<string>
    const cl = (v: number) => Math.max(0, Math.min(100, +v || 0)) / 100
    const f = cl(p.fundacao),
      e = cl(p.estrutura) * N,
      a = Math.min(cl(p.alvenaria) * N, e),
      ins = Math.min(cl(p.instalacoes) * N, a)
    const cob = cl(p.estrutura) >= 1 ? cl(p.cobertura) : 0,
      ac = Math.min(cl(p.acabamento) * N, a)
    caixaMesh('pad', W + 5, 0.06, D + 4, 0, 0, 0, M.pad, true)
    arestas(W, N * H, D, 0, BASE, 0, M.ghost)
    for (let i = 1; i < N; i++) arestas(W, 0.001, D, 0, BASE + i * H, 0, M.ghost2)
    // fundação
    const nf = Math.ceil(COLX.length * COLZ.length * f)
    let c = 0
    for (const x of COLX) for (const z of COLZ) if (c++ < nf) caixaMesh('sap' + c, 0.9, BASE, 0.9, x, 0, z, M.found)
    if (f >= 1) caixaMesh('radier', W + 0.6, 0.12, D + 0.6, 0, BASE - 0.12, 0, M.found)
    // estrutura
    const cur = Math.floor(e)
    for (let fl = 0; fl < Math.ceil(e) && fl < N; fl++) {
      const frac = fl < cur ? 1 : e - cur,
        y0 = BASE + fl * H,
        parcial = frac < 1
      COLX.forEach((x, ix) => COLZ.forEach((z, iz) => caixaMesh(`col${fl}_${ix}${iz}`, 0.26, (H - 0.16) * frac, 0.26, x, y0, z, parcial ? M.acc : M.conc)))
      if (!parcial) caixaMesh('laje' + fl, W + 0.3, 0.16, D + 0.3, 0, y0 + H - 0.16, 0, M.slab)
    }
    // alvenaria e acabamento
    const curA = Math.floor(a),
      t = 0.12
    for (let fa = 0; fa < Math.ceil(a) && fa < N; fa++) {
      const fr = fa < curA ? 1 : a - curA,
        wh = (H - 0.16) * fr,
        y = BASE + fa * H
      const acabado = fa < Math.floor(ac),
        mat = acabado ? M.fin : M.block,
        k = 'w' + fa + (acabado ? 'f' : 'b')
      caixaMesh(k + 'n', W - 0.1, wh, t, 0, y, D / 2 - t / 2, mat)
      caixaMesh(k + 's', W - 0.1, wh, t, 0, y, -D / 2 + t / 2, mat)
      caixaMesh(k + 'e', t, wh, D - 0.1, W / 2 - t / 2, y, 0, mat)
      caixaMesh(k + 'o', t, wh, D - 0.1, -W / 2 + t / 2, y, 0, mat)
      if (acabado && fr >= 1) {
        ;[-2, 0, 2].forEach((x, j) => {
          caixaMesh(`gn${fa}${j}`, 1.1, 0.62, 0.04, x, y + 0.26, D / 2 + 0.01, M.glass)
          caixaMesh(`gs${fa}${j}`, 1.1, 0.62, 0.04, x, y + 0.26, -D / 2 - 0.01, M.glass)
        })
        ;[-1, 1].forEach((z, j) => {
          caixaMesh(`ge${fa}${j}`, 0.04, 0.62, 1.1, W / 2 + 0.01, y + 0.26, z, M.glass)
          caixaMesh(`go${fa}${j}`, 0.04, 0.62, 1.1, -W / 2 - 0.01, y + 0.26, z, M.glass)
        })
      }
    }
    // instalações (prumada)
    if (ins > 0) caixaMesh('pr' + Math.round(ins * 10), 0.12, ins * H, 0.12, -W / 2 - 0.18, BASE, D / 2 - 0.4, M.pipe)
    // cobertura
    if (cob > 0) {
      const topo = BASE + N * H
      caixaMesh('cob', W + 0.3, 0.2, D + 0.3, 0, topo - 0.02, 0, M.slab)
      if (cob >= 0.5) {
        caixaMesh('plat', W + 0.3, 0.35, 0.1, 0, topo + 0.18, D / 2 + 0.1, M.fin)
        caixaMesh('plat2', W + 0.3, 0.35, 0.1, 0, topo + 0.18, -D / 2 - 0.1, M.fin)
      }
      if (cob >= 0.8) caixaMesh('cx', 1.8, 1, 1.4, 1.2, topo + 0.18, 0, M.fin)
    }
    // grua (some quando a obra termina)
    const pronto = f >= 1 && e >= N && a >= N && cob >= 1 && ac >= N
    jib = null
    if (!pronto) {
      const hh = N * H + 3,
        cx = W / 2 + 2.2,
        cz = -D / 2 - 1.2
      const mastro = new T.Mesh(new T.BoxGeometry(0.32, hh, 0.32), M.dark)
      mastro.position.set(cx, hh / 2, cz)
      mastro.castShadow = true
      grua.add(mastro)
      const lanca = new T.Group()
      lanca.position.set(cx, hh, cz)
      grua.add(lanca)
      jib = lanca
      const braco = new T.Mesh(new T.BoxGeometry(10, 0.24, 0.24), M.acc)
      braco.position.set(-3.4, 0, 0)
      braco.castShadow = true
      const contrapeso = new T.Mesh(new T.BoxGeometry(0.9, 0.6, 0.6), M.dark)
      contrapeso.position.set(1.4, -0.2, 0)
      const cabine = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.5), M.dark)
      cabine.position.set(0, -0.4, 0.3)
      const cabo = new T.Mesh(new T.BoxGeometry(0.02, 2.4, 0.02), M.dark)
      cabo.position.set(-6, -1.2, 0)
      lanca.add(braco, contrapeso, cabine, cabo)
    }
    anteriores = chaves
  }

  function enquadrar() {
    const w = el.clientWidth || 300,
      h = el.clientHeight || 300
    r.setSize(w, h, false)
    const asp = w / h
    cam.aspect = asp
    const { enquadreX: ox, enquadreY: oy, zoom } = quadro.current
    const dist = (34 * Math.max(1, 0.95 / asp)) / (zoom || 1)
    const dir = new T.Vector3(1, 0.62, 1).normalize()
    const alvo = new T.Vector3(0, N * H * 0.46, 0)
    cam.position.copy(alvo).addScaledVector(dir, dist)
    cam.lookAt(alvo)
    if (ox || oy) cam.setViewOffset(w, h, -w * ox, -h * oy, w, h)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()
  }

  // Arrastar gira o prédio.
  let arrasto: { x: number; ry: number } | null = null
  const baixo = (e: PointerEvent) => {
    arrasto = { x: e.clientX, ry: mundo.rotation.y }
    r.domElement.style.cursor = 'grabbing'
  }
  const move = (e: PointerEvent) => {
    if (arrasto) mundo.rotation.y = arrasto.ry + (e.clientX - arrasto.x) * 0.01
  }
  const cima = () => {
    arrasto = null
    r.domElement.style.cursor = 'grab'
  }
  r.domElement.addEventListener('pointerdown', baixo)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', cima)
  const aoTema = () => reconstruir(prog.current, true)
  window.addEventListener('go-tema', aoTema)
  const ro = new ResizeObserver(enquadrar)
  ro.observe(el)
  // Fora da tela não desenha: poupa CPU/GPU em páginas longas.
  let visivel = true
  const io = new IntersectionObserver(([e]) => (visivel = e.isIntersecting))
  io.observe(el)

  // Respeita "reduzir movimento": sem giro automático.
  const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let quadroAnim = 0
  const t0 = performance.now()
  const laco = (t: number) => {
    quadroAnim = requestAnimationFrame(laco)
    if (!visivel) return
    if (!arrasto && !parado) mundo.rotation.y += 0.0016
    if (jib) jib.rotation.y = Math.sin((t - t0) / 4000) * 0.9
    const agora = performance.now()
    anims = anims.filter((a) => {
      let k = Math.min(1, Math.max(0, (agora - a.t) / 700))
      k = 1 - Math.pow(1 - k, 3)
      a.m.scale.y = Math.max(0.001, k)
      return k < 1
    })
    r.render(s, cam)
  }

  enquadrar()
  reconstruir(prog.current)
  quadroAnim = requestAnimationFrame(laco)
  cena.current = { reconstruir: (p) => reconstruir(p), enquadrar }

  return () => {
    cancelAnimationFrame(quadroAnim)
    ro.disconnect()
    io.disconnect()
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', cima)
    window.removeEventListener('go-tema', aoTema)
    r.dispose()
    r.domElement.remove()
  }
}
