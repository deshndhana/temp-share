document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const loginView = document.getElementById('login-view');
  const workspaceView = document.getElementById('workspace-view');
  const loginForm = document.getElementById('login-form');
  const prefixSelect = document.getElementById('prefix-select');
  const pinDigitsInput = document.getElementById('pin-digits');
  const loginError = document.getElementById('login-error');
  const errorText = document.getElementById('error-text');
  const displayPin = document.getElementById('display-pin');
  const countdownTimer = document.getElementById('countdown-timer');
  const noteEditor = document.getElementById('note-editor');
  const syncStatus = document.getElementById('sync-status');
  const statusText = document.getElementById('status-text');
  const charCount = document.getElementById('char-count');
  const btnCopy = document.getElementById('btn-copy');
  const btnQr = document.getElementById('btn-qr');
  const btnLogout = document.getElementById('btn-logout');
  const btnDestroy = document.getElementById('btn-destroy');
  const destroyBtnText = document.getElementById('destroy-btn-text');
  
  // Modal Elements
  const qrModal = document.getElementById('qr-modal');
  const modalClose = document.getElementById('modal-close');
  const qrImage = document.getElementById('qr-image');
  const qrUrlText = document.getElementById('qr-url-text');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const toastContainer = document.getElementById('toast-container');

  // Application State
  let currentPin = null;
  let expiresAt = null;
  let countdownInterval = null;
  let syncInterval = null;
  let saveTimeout = null;
  let isSaving = false;
  
  let confirmDestroyActive = false;
  let destroyConfirmTimeout = null;

  // Initialize Lucide Icons
  lucide.createIcons();

  // Toast System
  const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconName = 'check-circle';
    if (type === 'error') iconName = 'x-circle';
    if (type === 'info') iconName = 'info';

    toast.innerHTML = `
      <i data-lucide="${iconName}" class="toast-icon"></i>
      <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    lucide.createIcons({ attrs: { class: 'toast-icon' } });

    setTimeout(() => {
      toast.style.animation = 'slide-in 0.3s ease reverse forwards';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  };

  // Status Indicator helper
  const setStatus = (state) => {
    syncStatus.className = 'status-indicator';
    
    if (state === 'saving') {
      syncStatus.classList.add('status-saving');
      syncStatus.innerHTML = `
        <i data-lucide="refresh-cw" class="status-icon spin"></i>
        <span>සුරැකෙමින් පවතී...</span>
      `;
    } else if (state === 'saved') {
      syncStatus.classList.add('status-saved');
      syncStatus.innerHTML = `
        <i data-lucide="cloud-check" class="status-icon"></i>
        <span>සුරැකුණා</span>
      `;
    } else if (state === 'error') {
      syncStatus.classList.add('status-error');
      syncStatus.innerHTML = `
        <i data-lucide="cloud-off" class="status-icon"></i>
        <span>සම්බන්ධතා දෝෂයක්</span>
      `;
    }
    lucide.createIcons({ attrs: { class: 'status-icon' } });
  };

  // Format PIN Input to only allow 6 digits
  pinDigitsInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, ''); // strip non-digits
    if (value.length > 6) {
      value = value.substring(0, 6);
    }
    e.target.value = value;
  });

  // Handle Query Parameters on Page Load
  const checkUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    const pinParam = params.get('pin');
    
    if (pinParam && /^[A-Z]\d{6}$/i.test(pinParam.trim())) {
      const pin = pinParam.trim().toUpperCase();
      const prefix = pin.charAt(0);
      const digits = pin.substring(1);
      
      // Auto pre-fill
      prefixSelect.value = prefix;
      pinDigitsInput.value = digits;
      
      showToast('QR කේතය හරහා සැසිය හඳුනා ගන්නා ලදී.', 'info');
      
      // Automate login
      handleLogin(pin);
    }
  };

  // Login Form Submission
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');

    const prefix = prefixSelect.value;
    const digits = pinDigitsInput.value;

    if (digits.length !== 6) {
      showLoginError('කරුණාකර ඉලක්කම් 6ක PIN අංකයක් ඇතුළත් කරන්න.');
      return;
    }

    const pin = `${prefix}${digits}`;
    handleLogin(pin);
  });

  const showLoginError = (msg) => {
    errorText.textContent = msg;
    loginError.classList.remove('hidden');
  };

  // Core Login logic
  const handleLogin = async (pin) => {
    try {
      const response = await fetch(`/api/session/${pin}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json();
        showLoginError(errorData.error || 'සැසිය නිර්මාණය කිරීමේ දෝෂයක් සිදු විය.');
        return;
      }

      const data = await response.json();
      currentPin = pin;
      expiresAt = data.expiresAt;

      // Update browser URL query parameter silently
      const newUrl = `${window.location.origin}${window.location.pathname}?pin=${pin}`;
      window.history.pushState({ path: newUrl }, '', newUrl);

      // Load content
      await fetchSessionContent();

      // View Transitions
      loginView.classList.add('hidden');
      workspaceView.classList.remove('hidden');
      displayPin.textContent = `${pin.charAt(0)}-${pin.substring(1)}`;

      // Start timers
      startCountdown();
      startSyncing();
      
      if (data.status === 'created') {
        showToast('නව සටහන් සැසියක් ආරම්භ විය! විනාඩි 15ක් වලංගු වේ.', 'success');
      } else {
        showToast('පවතින සටහන් සැසියකට සාර්ථකව සම්බන්ධ විය.', 'success');
      }

    } catch (err) {
      console.error(err);
      showLoginError('සර්වර් එක සමඟ සම්බන්ධ වීමට අපොහොසත් විය.');
    }
  };

  // Fetch Session Content
  const fetchSessionContent = async () => {
    if (!currentPin) return;
    try {
      const response = await fetch(`/api/session/${currentPin}`);
      
      if (response.status === 404) {
        handleExpiredSession();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        
        // Update countdown expiry target in case of drift
        expiresAt = data.expiresAt;

        // ONLY update value if user is not currently focusing/typing in it
        if (document.activeElement !== noteEditor && !isSaving) {
          noteEditor.value = data.text;
          updateCharCount(data.text);
        }
      }
    } catch (err) {
      console.warn('Sync updates error:', err);
    }
  };

  // Save Content
  const saveContent = async () => {
    if (!currentPin) return;
    isSaving = true;
    setStatus('saving');

    try {
      const response = await fetch(`/api/session/${currentPin}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteEditor.value })
      });

      if (response.status === 404) {
        handleExpiredSession();
        return;
      }

      if (response.ok) {
        setStatus('saved');
      } else {
        setStatus('error');
      }
    } catch (err) {
      console.error(err);
      setStatus('error');
    } finally {
      isSaving = false;
    }
  };

  // Note editor input listener
  noteEditor.addEventListener('input', (e) => {
    const text = e.target.value;
    updateCharCount(text);
    setStatus('saving');

    // Debounce saves
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveContent, 600);
  });

  const updateCharCount = (text) => {
    charCount.textContent = `අකුරු: ${text.length}`;
  };

  // Active Sync interval
  const startSyncing = () => {
    clearInterval(syncInterval);
    syncInterval = setInterval(fetchSessionContent, 3000); // sync every 3 seconds
  };

  // Countdown timer logic
  const startCountdown = () => {
    clearInterval(countdownInterval);
    
    const updateTimer = () => {
      const timeLeft = expiresAt - Date.now();
      
      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
        handleExpiredSession();
        return;
      }

      const totalSeconds = Math.floor(timeLeft / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      
      const formattedMin = String(minutes).padStart(2, '0');
      const formattedSec = String(seconds).padStart(2, '0');
      
      countdownTimer.textContent = `${formattedMin}:${formattedSec}`;

      // Highlight urgent time
      if (totalSeconds < 120) {
        countdownTimer.parentElement.classList.add('timer-urgent');
      } else {
        countdownTimer.parentElement.classList.remove('timer-urgent');
      }
    };

    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
  };

  // Expiration Handler
  const handleExpiredSession = () => {
    resetAppState();
    showToast('මෙම සටහන් සැසියේ කාලය අවසන් වී දත්ත මැකී ගොස් ඇත.', 'error');
  };

  // Reset to Login View
  const resetAppState = () => {
    clearInterval(countdownInterval);
    clearInterval(syncInterval);
    clearTimeout(saveTimeout);
    
    if (confirmDestroyActive) {
      resetDestroyButton();
    }

    currentPin = null;
    expiresAt = null;
    noteEditor.value = '';
    updateCharCount('');

    // Reset browser URL search params
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.pushState({ path: cleanUrl }, '', cleanUrl);

    workspaceView.classList.add('hidden');
    loginView.classList.remove('hidden');
    pinDigitsInput.value = '';
    
    loginError.classList.add('hidden');
  };

  // Copy text to clipboard
  btnCopy.addEventListener('click', async () => {
    if (!noteEditor.value) {
      showToast('පිටපත් කිරීමට දත්ත කිසිවක් නැත!', 'info');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(noteEditor.value);
      showToast('සටහන සාර්ථකව Clipboard එකට පිටපත් විය!', 'success');
    } catch (err) {
      // Fallback selector copy
      noteEditor.select();
      document.execCommand('copy');
      showToast('සටහන පිටපත් විය!', 'success');
    }
  });

  // Logout function (Exit workspace without deleting session)
  const handleLogoutClick = () => {
    resetAppState();
    showToast('සැසියෙන් සාර්ථකව පිටවූවා. (දත්ත මකා නොදැමූ අතර PIN එක වලංගුව පවතී)', 'info');
  };

  btnLogout.addEventListener('click', handleLogoutClick);

  // Helper to reset delete button state
  const resetDestroyButton = () => {
    confirmDestroyActive = false;
    clearTimeout(destroyConfirmTimeout);
    destroyBtnText.textContent = 'සටහන මකන්න';
    btnDestroy.classList.remove('btn-danger-confirm');
  };

  // Destroy session immediately with custom 2-step confirmation
  btnDestroy.addEventListener('click', async () => {
    if (!currentPin) return;
    
    if (!confirmDestroyActive) {
      confirmDestroyActive = true;
      destroyBtnText.textContent = 'ස්ථිරද? (නැවත ක්ලික් කරන්න)';
      btnDestroy.classList.add('btn-danger-confirm');
      
      // Auto-reset after 4 seconds if not clicked again
      destroyConfirmTimeout = setTimeout(() => {
        resetDestroyButton();
      }, 4000);
      return;
    }

    // Second click: proceed with deletion
    try {
      const response = await fetch(`/api/session/${currentPin}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        resetAppState();
        showToast('සැසිය සහ දත්ත සර්වර් එකෙන් සම්පූර්ණයෙන්ම මකා දමන ලදී.', 'success');
      } else {
        showToast('සැසිය මකා දැමීමට අපොහොසත් විය.', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('සැසිය මකා දැමීමේ දෝෂයක් සිදු විය.', 'error');
    } finally {
      resetDestroyButton();
    }
  });

  // ==========================================================================
  // QR CODE MODAL LOGIC
  // ==========================================================================

  btnQr.addEventListener('click', () => {
    if (!currentPin) return;

    // Use current URL
    const shareUrl = `${window.location.origin}${window.location.pathname}?pin=${currentPin}`;
    qrUrlText.textContent = shareUrl;

    // Use zero-dependency API to generate QR Code image instantly
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&color=0a66c2&data=${encodeURIComponent(shareUrl)}`;
    
    qrImage.onload = () => {
      // Open modal once loaded
      qrModal.classList.remove('hidden');
    };
    
    qrImage.onerror = () => {
      showToast('QR කේතය සෑදීමට අපොහොසත් විය.', 'error');
    };
    
    qrImage.src = qrApiUrl;
  });

  // Copy QR share link
  btnCopyUrl.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(qrUrlText.textContent);
      showToast('සැසි ලින්ක් එක පිටපත් විය!', 'success');
    } catch (err) {
      showToast('ලින්ක් එක පිටපත් වීමට අපොහොසත් විය.', 'error');
    }
  });

  // Close Modal
  const closeModal = () => {
    qrModal.classList.add('hidden');
  };

  modalClose.addEventListener('click', closeModal);
  
  // Close modal on click outside content
  document.querySelector('.modal-overlay').addEventListener('click', closeModal);

  // Check URL parameters on load
  checkUrlParams();
});
