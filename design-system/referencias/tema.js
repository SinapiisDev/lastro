(function () {
  var T = {
    claro: { bg:'#ECECEA', surface:'#FFFFFF', 'surface-2':'#F5F5F3', 'surface-3':'#EBEBE7', line:'#E3E3DF', ink:'#111111', 'ink-2':'#55554F', 'ink-3':'#86867F', 'on-ink':'#FFFFFF', night:'#101010', 'night-2':'#1C1C1C', accent:'#C6DF5F', 'accent-ink':'#4C6110', 'accent-bg':'#EEF5D2', neg:'#C3352D', 'neg-bg':'#FBEAE8', warn:'#A8650A', 'warn-bg':'#FBF0DB', ok:'#3C7421', 'ok-bg':'#E8F2DC', info:'#2D5DB0', 'info-bg':'#E5ECF8', pink:'#F4A6C6', 'pink-ink':'#9C2F5C', 'pink-bg':'#FBE6EF', focus:'#111111' },
    escuro: { bg:'#0B0B0B', surface:'#161616', 'surface-2':'#1F1F1F', 'surface-3':'#2A2A2A', line:'#2B2B2B', ink:'#F2F2EE', 'ink-2':'#B3B3AC', 'ink-3':'#85857E', 'on-ink':'#111111', night:'#000000', 'night-2':'#141414', accent:'#C6DF5F', 'accent-ink':'#C6DF5F', 'accent-bg':'#232B10', neg:'#FF7A70', 'neg-bg':'#3A1714', warn:'#F1B24E', 'warn-bg':'#33260E', ok:'#9FD36E', 'ok-bg':'#1C2A13', info:'#93B5F5', 'info-bg':'#16223A', pink:'#F4A6C6', 'pink-ink':'#F4A6C6', 'pink-bg':'#3A1826', focus:'#C6DF5F' }
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
