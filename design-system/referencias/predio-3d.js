(function () {
  if (customElements.get('predio-3d')) return;
  var THREEP = null;
  function three() { return THREEP || (THREEP = import('https://esm.sh/three@0.160.0')); }
  var N = 8, H = 1.1, W = 6, D = 4, BASE = 0.3;
  var COLX = [-3, -1, 1, 3], COLZ = [-2, 0, 2];

  class Predio3D extends HTMLElement {
    static get observedAttributes() { return ['progress', 'andares', 'enquadre-x', 'enquadre-y', 'zoom']; }
    constructor() {
      super();
      this.p = { fundacao: 100, estrutura: 70, alvenaria: 45, instalacoes: 30, cobertura: 0, acabamento: 10 };
      this.prev = new Set(); this.anims = [];
    }
    attributeChangedCallback(n, o, v) {
      if (n === 'progress' && v) { try { this.p = Object.assign({}, this.p, JSON.parse(v)); } catch (e) {} }
      if (n === 'andares' && v) N = Math.max(2, Math.min(20, +v || 8));
      if (n !== 'progress' && n !== 'andares') { if (this.r) this.resize(); return; }
      if (this.T) this.rebuild();
    }
    connectedCallback() {
      if (!this.style.display) this.style.display = 'block';
      this.style.position = this.style.position || 'relative';
      if (!this.style.height) { this.style.width = '100%'; this.style.height = '100%'; }
      if (this._init) return; this._init = true;
      var self = this;
      three().then(function (T) { self.T = T; self.setup(); });
    }
    disconnectedCallback() { this._dead = true; if (this.ro) this.ro.disconnect(); window.removeEventListener('go-tema', this._onTema); }
    escuro() { return document.documentElement.getAttribute('data-tema') === 'escuro'; }
    setup() {
      var T = this.T, self = this;
      var r = this.r = new T.WebGLRenderer({ antialias: true, alpha: true });
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
      r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab';
      this.appendChild(r.domElement);
      var s = this.scene = new T.Scene();
      this.cam = new T.PerspectiveCamera(28, 1, 0.1, 300);
      s.add(new T.HemisphereLight(0xffffff, 0xb8b8b2, 1.15));
      var dl = new T.DirectionalLight(0xffffff, 1.7);
      dl.position.set(12, 22, 9); dl.castShadow = true;
      dl.shadow.mapSize.set(2048, 2048);
      var sc = dl.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.far = 80;
      dl.shadow.bias = -0.0005; s.add(dl);
      var g = new T.Mesh(new T.PlaneGeometry(80, 80), new T.ShadowMaterial({ opacity: 0.14 }));
      g.rotation.x = -Math.PI / 2; g.receiveShadow = true; s.add(g);
      this.world = new T.Group(); s.add(this.world);
      this.world.rotation.y = -0.6;
      this.grp = new T.Group(); this.world.add(this.grp);
      this.crane = new T.Group(); this.world.add(this.crane);
      var drag = null;
      r.domElement.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, ry: self.world.rotation.y }; r.domElement.style.cursor = 'grabbing'; });
      window.addEventListener('pointermove', function (e) { if (drag) self.world.rotation.y = drag.ry + (e.clientX - drag.x) * 0.01; });
      window.addEventListener('pointerup', function () { drag = null; r.domElement.style.cursor = 'grab'; });
      this._onTema = function () { self.prev = new Set(self.prev); self.rebuild(true); };
      window.addEventListener('go-tema', this._onTema);
      this.ro = new ResizeObserver(function () { self.resize(); }); this.ro.observe(this);
      this.resize(); this.rebuild();
      var t0 = performance.now();
      (function loop(t) {
        if (self._dead) return;
        requestAnimationFrame(loop);
        if (!drag) self.world.rotation.y += 0.0016;
        self.jib && (self.jib.rotation.y = Math.sin((t - t0) / 4000) * 0.9);
        var now = performance.now();
        self.anims = self.anims.filter(function (a) {
          var k = Math.min(1, (now - a.t) / 700); k = 1 - Math.pow(1 - k, 3);
          a.m.scale.y = Math.max(0.001, k * a.sy); return k < 1;
        });
        r.render(s, self.cam);
      })(t0);
    }
    resize() {
      var w = this.clientWidth || 300, h = this.clientHeight || 300;
      this.r.setSize(w, h, false);
      var a = w / h; this.cam.aspect = a;
      var dist = 34 * Math.max(1, 0.95 / a) / (parseFloat(this.getAttribute('zoom')) || 1);
      var dir = new this.T.Vector3(1, 0.62, 1).normalize();
      var tgt = new this.T.Vector3(0, N * H * 0.46, 0);
      this.cam.position.copy(tgt).addScaledVector(dir, dist);
      this.cam.lookAt(tgt);
      var ox = parseFloat(this.getAttribute('enquadre-x')) || 0, oy = parseFloat(this.getAttribute('enquadre-y')) || 0;
      if (ox || oy) this.cam.setViewOffset(w, h, -w * ox, -h * oy, w, h); else this.cam.clearViewOffset();
      this.cam.updateProjectionMatrix();
    }
    mats() {
      var T = this.T, dk = this.escuro();
      if (this._m && this._m.dk === dk) return this._m;
      var M = function (c, o) { return new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, metalness: 0 }, o || {})); };
      this._m = {
        dk: dk,
        pad: M(dk ? 0x1d1d1d : 0xe2e2de), found: M(0x9d9d97), conc: M(0xc4c4bf), slab: M(0xd9d9d4),
        block: M(0xcfc8bd), fin: M(0xf6f6f2), glass: M(0x1f2428, { roughness: 0.25, metalness: 0.45 }),
        acc: M(0xC6DF5F, { roughness: 0.6 }), dark: M(dk ? 0x3a3a3a : 0x1a1a1a, { roughness: 0.6 }), pipe: M(0x8a8a84),
        ghost: new T.LineBasicMaterial({ color: dk ? 0xffffff : 0x111111, transparent: true, opacity: dk ? 0.22 : 0.16 }),
        ghost2: new T.LineBasicMaterial({ color: dk ? 0xffffff : 0x111111, transparent: true, opacity: dk ? 0.1 : 0.07 })
      };
      return this._m;
    }
    box(key, w, h, d, x, y, z, mat, parent, noAnim) {
      var T = this.T, gm = new T.BoxGeometry(w, h, d); gm.translate(0, h / 2, 0);
      var m = new T.Mesh(gm, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      (parent || this.grp).add(m); this.keys.add(key);
      if (!noAnim && !this.prev.has(key)) { m.scale.y = 0.001; this.anims.push({ m: m, t: performance.now() + Math.random() * 180, sy: 1 }); }
      return m;
    }
    edges(w, h, d, x, y, z, mat) {
      var T = this.T, e = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w, h, d)), mat);
      e.position.set(x, y + h / 2, z); this.grp.add(e);
    }
    rebuild(skipAnim) {
      var T = this.T; if (!T) return;
      var M = this.mats(), p = this.p, self = this;
      this.grp.children.slice().forEach(function (c) { self.grp.remove(c); c.geometry && c.geometry.dispose(); });
      this.crane.children.slice().forEach(function (c) { self.crane.remove(c); });
      this.anims = []; this.keys = new Set();
      if (skipAnim === true) this.prev = new Set(['*all']);
      var all = this.prev.has('*all');
      if (all) this.prev = { has: function () { return true; } };
      var cl = function (v) { return Math.max(0, Math.min(100, +v || 0)) / 100; };
      var f = cl(p.fundacao), e = cl(p.estrutura) * N, a = Math.min(cl(p.alvenaria) * N, e), ins = Math.min(cl(p.instalacoes) * N, a);
      var cob = cl(p.estrutura) >= 1 ? cl(p.cobertura) : 0, ac = Math.min(cl(p.acabamento) * N, a);
      this.box('pad', W + 5, 0.06, D + 4, 0, 0, 0, M.pad, null, true);
      this.edges(W, N * H, D, 0, BASE, 0, M.ghost);
      for (var i = 1; i < N; i++) this.edges(W, 0.001, D, 0, BASE + i * H, 0, M.ghost2);
      // fundação
      var nf = Math.ceil(COLX.length * COLZ.length * f), c = 0;
      COLX.forEach(function (x) { COLZ.forEach(function (z) { if (c++ < nf) self.box('sap' + c, 0.9, BASE, 0.9, x, 0, z, M.found); }); });
      if (f >= 1) this.box('radier', W + 0.6, 0.12, D + 0.6, 0, BASE - 0.12, 0, M.found);
      // estrutura
      var cur = Math.floor(e);
      for (var fl = 0; fl < Math.ceil(e) && fl < N; fl++) {
        var frac = fl < cur ? 1 : e - cur, y0 = BASE + fl * H, partial = frac < 1;
        COLX.forEach(function (x, ix) { COLZ.forEach(function (z, iz) {
          var m = self.box('col' + fl + '_' + ix + iz, 0.26, (H - 0.16) * frac, 0.26, x, y0, z, partial ? M.acc : M.conc);
        }); });
        if (!partial) this.box('laje' + fl, W + 0.3, 0.16, D + 0.3, 0, y0 + H - 0.16, 0, M.slab);
      }
      // alvenaria + acabamento
      var curA = Math.floor(a), t = 0.12, wh;
      for (var fa = 0; fa < Math.ceil(a) && fa < N; fa++) {
        var fr = fa < curA ? 1 : a - curA; wh = (H - 0.16) * fr;
        var y = BASE + fa * H, mat = fa < Math.floor(ac) ? M.fin : M.block, k = 'w' + fa + (mat === M.fin ? 'f' : 'b');
        this.box(k + 'n', W - 0.1, wh, t, 0, y, D / 2 - t / 2, mat);
        this.box(k + 's', W - 0.1, wh, t, 0, y, -D / 2 + t / 2, mat);
        this.box(k + 'e', t, wh, D - 0.1, W / 2 - t / 2, y, 0, mat);
        this.box(k + 'o', t, wh, D - 0.1, -W / 2 + t / 2, y, 0, mat);
        if (fa < Math.floor(ac) && fr >= 1) {
          [-2, 0, 2].forEach(function (x, j) {
            self.box('gn' + fa + j, 1.1, 0.62, 0.04, x, y + 0.26, D / 2 + 0.01, M.glass);
            self.box('gs' + fa + j, 1.1, 0.62, 0.04, x, y + 0.26, -D / 2 - 0.01, M.glass);
          });
          [-1, 1].forEach(function (z, j) {
            self.box('ge' + fa + j, 0.04, 0.62, 1.1, W / 2 + 0.01, y + 0.26, z, M.glass);
            self.box('go' + fa + j, 0.04, 0.62, 1.1, -W / 2 - 0.01, y + 0.26, z, M.glass);
          });
        }
      }
      // instalações (prumada)
      if (ins > 0) this.box('pr' + Math.round(ins * 10), 0.12, ins * H, 0.12, -W / 2 - 0.18, BASE, D / 2 - 0.4, M.pipe);
      // cobertura
      if (cob > 0) {
        var top = BASE + N * H;
        this.box('cob', W + 0.3, 0.2, D + 0.3, 0, top - 0.02, 0, M.slab);
        if (cob >= 0.5) this.box('plat', W + 0.3, 0.35, 0.1, 0, top + 0.18, D / 2 + 0.1, M.fin), this.box('plat2', W + 0.3, 0.35, 0.1, 0, top + 0.18, -D / 2 - 0.1, M.fin);
        if (cob >= 0.8) this.box('cx', 1.8, 1, 1.4, 1.2, top + 0.18, 0, M.fin);
      }
      // grua
      var done = f >= 1 && e >= N && a >= N && cob >= 1 && ac >= N;
      this.jib = null;
      if (!done) {
        var hh = N * H + 3, cx = W / 2 + 2.2, cz = -D / 2 - 1.2;
        var mast = new T.Mesh(new T.BoxGeometry(0.32, hh, 0.32), M.dark); mast.position.set(cx, hh / 2, cz); mast.castShadow = true; this.crane.add(mast);
        var jib = new T.Group(); jib.position.set(cx, hh, cz); this.crane.add(jib); this.jib = jib;
        var arm = new T.Mesh(new T.BoxGeometry(10, 0.24, 0.24), M.acc); arm.position.set(-3.4, 0, 0); arm.castShadow = true; jib.add(arm);
        var cw = new T.Mesh(new T.BoxGeometry(0.9, 0.6, 0.6), M.dark); cw.position.set(1.4, -0.2, 0); jib.add(cw);
        var cab = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.5), M.dark); cab.position.set(0, -0.4, 0.3); jib.add(cab);
        var ln = new T.Mesh(new T.BoxGeometry(0.02, 2.4, 0.02), M.dark); ln.position.set(-6, -1.2, 0); jib.add(ln);
      }
      this.prev = this.keys;
    }
  }
  customElements.define('predio-3d', Predio3D);
})();
