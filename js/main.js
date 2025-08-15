// main.js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => {
        console.log('SW registered:', reg);
        
        // Listen for the beforeinstallprompt event
        window.addEventListener('beforeinstallprompt', (e) => {
          console.log('beforeinstallprompt event fired');
          // Prevent the mini-infobar from appearing on mobile
          e.preventDefault();
          // Stash the event so it can be triggered later
          window.deferredPrompt = e;
          // Show your custom install button/prompt
          showInstallPromotion();
        });
      })
      .catch(err => console.log('SW registration failed:', err));
  });
}

function showInstallPromotion() {
  const installButton = document.createElement('button');
  installButton.id = 'installButton';
  installButton.textContent = 'Install App';
  installButton.style.position = 'fixed';
  installButton.style.bottom = '20px';
  installButton.style.right = '20px';
  installButton.style.zIndex = '1000';
  installButton.style.padding = '10px 20px';
  installButton.style.backgroundColor = '#007aff';
  installButton.style.color = 'white';
  installButton.style.border = 'none';
  installButton.style.borderRadius = '5px';
  
  installButton.addEventListener('click', async () => {
    if (window.deferredPrompt) {
      window.deferredPrompt.prompt();
      const { outcome } = await window.deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      window.deferredPrompt = null;
    }
  });
  
  document.body.appendChild(installButton);
}