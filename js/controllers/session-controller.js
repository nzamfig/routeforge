// Session persistence and URL hash sharing.
// Depends on: UI

const SessionController = (() => {

  let _onRestore  = null;
  let _sessionTimer = null;

  function init({ onRestore }) {
    _onRestore = onRestore;
  }

  // Call once at startup to handle ?#route= hash
  function checkURLHash() {
    const hash = location.hash;
    if (!hash.startsWith('#route=')) return;
    const data = UI.decodeRouteFromHash(hash.slice('#route='.length));
    if (!data) { UI.toast('Could not decode shared route from URL', 'error'); return; }
    if (_onRestore) _onRestore(data);
    history.replaceState(null, '', location.pathname);
  }

  // Call once at startup to show restore banner if a saved session exists
  function checkSessionRestore() {
    const data = UI.loadSession();
    if (!data?.segments?.flat().length) return;
    const banner = document.getElementById('restore-banner');
    banner.classList.remove('hidden');
    document.getElementById('restore-yes').addEventListener('click', () => {
      banner.classList.add('hidden');
      if (_onRestore) _onRestore(data);
    });
    document.getElementById('restore-no').addEventListener('click', () => {
      banner.classList.add('hidden');
      UI.clearSession();
    });
  }

  // Schedule an auto-save; getData() must return the session object or null
  function scheduleSessionSave(getData) {
    clearTimeout(_sessionTimer);
    _sessionTimer = setTimeout(() => {
      const data = getData();
      if (data) UI.saveSession(data);
    }, 5 * 60 * 1000);
  }

  return { init, checkURLHash, checkSessionRestore, scheduleSessionSave };
})();
