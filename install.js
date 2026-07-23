(() => {
  function showMessage(text, kind = 'info') {
    const box = document.getElementById('installMessage');
    if (!box) return;
    box.textContent = text;
    box.className = `message ${kind}`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const helpButton = document.getElementById('showAndroidInstallHelp');
    if (helpButton) {
      helpButton.addEventListener('click', () => {
        showMessage('Gebruik het menu van je browser en kies “Toevoegen aan startscherm”. Kies niet voor het installeren van een APK of onbekende app.', 'info');
      });
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(error => {
        console.warn('Serviceworker kon niet worden geregistreerd:', error);
      });
    }
  });
})();
