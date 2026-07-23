(() => {
  let deferredPrompt = null;

  function showMessage(text, kind = 'success') {
    const box = document.getElementById('installMessage');
    if (!box) return;
    box.textContent = text;
    box.className = `message ${kind}`;
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    const button = document.getElementById('installAppButton');
    if (button) button.disabled = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const button = document.getElementById('installAppButton');
    if (button) button.disabled = true;
    showMessage('De Supertiebreak-app staat nu op het beginscherm.');
  });

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('installAppButton');
    if (button) {
      button.addEventListener('click', async () => {
        if (!deferredPrompt) {
          showMessage('Open het browsermenu en kies “Toevoegen aan startscherm”. Op iPhone gebruik je Safari → Deel → Zet op beginscherm.', 'info');
          return;
        }
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        button.disabled = true;
      });
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(error => {
        console.warn('Serviceworker kon niet worden geregistreerd:', error);
      });
    }
  });
})();
