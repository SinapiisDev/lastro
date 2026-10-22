(function () {
  var T = {
    claro: { bg:'#ECF0F4', surface:'#FBFCFD', 'surface-2':'#F3F6F9', 'surface-3':'#E3E9EF', line:'#D9E0E7', ink:'#24161B', 'ink-2':'#5B4C52', 'ink-3':'#7A6F75', 'on-ink':'#FBFCFD', night:'#1F1217', 'night-2':'#2C1C22', accent:'#2D62DB', 'accent-ink':'#2552C2', 'accent-bg':'#E1EAFB', neg:'#C9432A', 'neg-bg':'#FBE7E2', warn:'#9A5B0B', 'warn-bg':'#FAEFD9', ok:'#2F7A4D', 'ok-bg':'#E2F0E7', info:'#2552C2', 'info-bg':'#E1EAFB', pink:'#7C1F3B', 'pink-ink':'#7C1F3B', 'pink-bg':'#F5E3E9', focus:'#2D62DB' },
    escuro: { bg:'#110A0D', surface:'#1B1216', 'surface-2':'#251A1F', 'surface-3':'#2F2228', line:'#3A2B32', ink:'#EEF2F6', 'ink-2':'#B8C1CB', 'ink-3':'#8B95A0', 'on-ink':'#1B1216', night:'#0B0608', 'night-2':'#1A1014', accent:'#7FA3F4', 'accent-ink':'#9DB9F7', 'accent-bg':'#1B2744', neg:'#FF8A6E', 'neg-bg':'#3B1710', warn:'#F0B455', 'warn-bg':'#33250E', ok:'#8FD3A8', 'ok-bg':'#15291D', info:'#9DB9F7', 'info-bg':'#1B2744', pink:'#E07C9B', 'pink-ink':'#E07C9B', 'pink-bg':'#3A1624', focus:'#7FA3F4' }
  };
  function aplicar(el, nome) {
    var t = T[nome] || T.claro;
    for (var k in t) el.style.setProperty('--' + k, t[k]);
    el.setAttribute('data-tema', nome);
  }
  function set(nome) {
    try { localStorage.setItem('go-tema', nome); } catch (e) {}
    aplicar(document.documentElement, nome);
    window.dispatchEvent(new CustomEvent('go-tema', { detail: nome }));
  }
  function get() { try { return localStorage.getItem('go-tema') || 'claro'; } catch (e) { return 'claro'; } }
  window.goTema = { tokens: T, aplicar: aplicar, set: set, get: get, alternar: function () { set(get() === 'escuro' ? 'claro' : 'escuro'); } };
  aplicar(document.documentElement, get());
})();
