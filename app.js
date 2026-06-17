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

  // Firebase Configuration (Provided by user)
  const firebaseConfig = {
    apiKey: "AIzaSyCquwYppcJ1W_6Zsf0F-vG2LBNd_WDBilA",
    authDomain: "temp-share-671c8.firebaseapp.com",
    projectId: "temp-share-671c8",
    storageBucket: "temp-share-671c8.firebasestorage.app",
    messagingSenderId: "635858753078",
    appId: "1:635858753078:web:318ae3c8f1b8570aae6a97",
    measurementId: "G-CHEXB2C2PH",
    // Fallback default Database URL (Adjust if Singapore/Europe region was chosen, e.g. with region prefix)
    databaseURL: "https://temp-share-671c8-default-rtdb.asia-southeast1.firebasedatabase.app"
  };

  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  const database = firebase.database();

  // Application State
  let currentPin = null;
  let expiresAt = null;
  let countdownInterval = null;
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
        <span>Saving...</span>
      `;
    } else if (state === 'saved') {
      syncStatus.classList.add('status-saved');
      syncStatus.innerHTML = `
        <i data-lucide="cloud-check" class="status-icon"></i>
        <span>Saved</span>
      `;
    } else if (state === 'error') {
      syncStatus.classList.add('status-error');
      syncStatus.innerHTML = `
        <i data-lucide="cloud-off" class="status-icon"></i>
        <span>Connection Error</span>
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
      
      showToast('Session detected via QR code.', 'info');
      
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
      showLoginError('Please enter a 6-digit PIN.');
      return;
    }

    const pin = `${prefix}${digits}`;
    handleLogin(pin);
  });

  const showLoginError = (msg) => {
    errorText.textContent = msg;
    loginError.classList.remove('hidden');
  };

  // Core Login logic (Firebase Serverless migration)
  const handleLogin = async (pin) => {
    setStatus('saving');
    try {
      const sessionRef = database.ref('sessions/' + pin);
      const snapshot = await sessionRef.once('value');
      const session = snapshot.val();
      const now = Date.now();

      if (session && session.expiresAt > now) {
        // Existing active session
        expiresAt = session.expiresAt;
        currentPin = pin;

        noteEditor.value = session.text || '';
        updateCharCount(session.text || '');
        setStatus('saved');
        showToast('Successfully connected to the existing session.', 'success');
      } else {
        // If it was expired, clean it first
        if (session) {
          await sessionRef.remove();
        }

        // Create new session
        expiresAt = now + 15 * 60 * 1000; // 15 mins
        currentPin = pin;

        await sessionRef.set({
          text: '',
          expiresAt: expiresAt
        });

        noteEditor.value = '';
        updateCharCount('');
        setStatus('saved');
        showToast('New sharing session started! Valid for 15 minutes.', 'success');
      }

      // Update URL query parameters silently
      const newUrl = `${window.location.origin}${window.location.pathname}?pin=${pin}`;
      window.history.pushState({ path: newUrl }, '', newUrl);

      // View Transitions
      loginView.classList.add('hidden');
      workspaceView.classList.remove('hidden');
      displayPin.textContent = `${pin.charAt(0)}-${pin.substring(1)}`;

      // Start Real-time WebSocket synchronization & Expiry Checkers
      startRealtimeSync();
      startCountdown();

    } catch (err) {
      console.error(err);
      showLoginError('Failed to connect to Firebase Database. Please check your database rules.');
    }
  };

  // Realtime database listener
  const startRealtimeSync = () => {
    if (!currentPin) return;
    const sessionRef = database.ref('sessions/' + currentPin);
    
    // Register listener
    sessionRef.on('value', (snapshot) => {
      const data = snapshot.val();
      
      // If deleted from firebase
      if (!data) {
        handleExpiredSession();
        return;
      }

      // If expired
      if (Date.now() > data.expiresAt) {
        sessionRef.remove();
        handleExpiredSession();
        return;
      }

      expiresAt = data.expiresAt;

      // Only update textarea if user is not actively editing it
      if (document.activeElement !== noteEditor && !isSaving) {
        noteEditor.value = data.text || '';
        updateCharCount(data.text || '');
        setStatus('saved');
      }
    });
  };

  // Note editor input listener
  noteEditor.addEventListener('input', (e) => {
    const text = e.target.value;
    updateCharCount(text);
    setStatus('saving');

    // Debounce saves
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (!currentPin) return;
      isSaving = true;
      
      database.ref('sessions/' + currentPin).update({ text })
        .then(() => {
          setStatus('saved');
          isSaving = false;
        })
        .catch((err) => {
          console.error(err);
          setStatus('error');
          isSaving = false;
        });
    }, 500);
  });

  const updateCharCount = (text) => {
    charCount.textContent = `Characters: ${text.length}`;
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
    showToast('This session has expired and its data has been deleted.', 'error');
  };

  // Reset to Login View
  const resetAppState = () => {
    // Unsubscribe database listeners
    if (currentPin) {
      database.ref('sessions/' + currentPin).off('value');
    }

    clearInterval(countdownInterval);
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
      showToast('No content to copy!', 'info');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(noteEditor.value);
      showToast('Note copied to clipboard successfully!', 'success');
    } catch (err) {
      // Fallback selector copy
      noteEditor.select();
      document.execCommand('copy');
      showToast('Note copied!', 'success');
    }
  });

  // Logout function (Exit workspace without deleting session)
  const handleLogoutClick = () => {
    resetAppState();
    showToast('Disconnected from session. (Data was not deleted and PIN remains active)', 'info');
  };

  btnLogout.addEventListener('click', handleLogoutClick);

  // Helper to reset delete button state
  const resetDestroyButton = () => {
    confirmDestroyActive = false;
    clearTimeout(destroyConfirmTimeout);
    destroyBtnText.textContent = 'Delete Note';
    btnDestroy.classList.remove('btn-danger-confirm');
  };

  // Destroy session immediately with custom 2-step confirmation
  btnDestroy.addEventListener('click', async () => {
    if (!currentPin) return;
    
    if (!confirmDestroyActive) {
      confirmDestroyActive = true;
      destroyBtnText.textContent = 'Are you sure? (Click again)';
      btnDestroy.classList.add('btn-danger-confirm');
      
      // Auto-reset after 4 seconds if not clicked again
      destroyConfirmTimeout = setTimeout(() => {
        resetDestroyButton();
      }, 4000);
      return;
    }

    // Second click: proceed with deletion
    try {
      await database.ref('sessions/' + currentPin).remove();
      resetAppState();
      showToast('Session and data have been permanently deleted.', 'success');
    } catch (err) {
      console.error(err);
      showToast('An error occurred while deleting the session.', 'error');
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
      showToast('Failed to generate QR code.', 'error');
    };
    
    qrImage.src = qrApiUrl;
  });

  // Copy QR share link
  btnCopyUrl.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(qrUrlText.textContent);
      showToast('Session link copied successfully!', 'success');
    } catch (err) {
      showToast('Failed to copy the session link.', 'error');
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
