/* InstaMail All-in-Cloudflare Logic - Client Logic */

// Deteksi Endpoint API (menggunakan domain yang sama saat dipublikasikan, atau localhost:8787 saat pengembangan)
const getApiBase = () => {
  if (window.location.protocol.startsWith('http')) {
    return ''; // Relative path
  }
  return 'http://localhost:8787'; // Fallback lokal untuk file:///
};

const API_BASE = getApiBase();
let currentEmail = '';
let activeDomains = ['mail.example.com'];
let messagesList = [];
let knownMessageIds = new Set();
let activeMessageId = null;
let pollInterval = null;
let countdownTimer = null;
let soundEnabled = true;
const POLL_DURATION = 5; // detik
let countdownSec = POLL_DURATION;

// Elements
const emailAddressInput = document.getElementById('email-address');
const btnCopy = document.getElementById('btn-copy');
const btnQr = document.getElementById('btn-qr');
const btnRefresh = document.getElementById('btn-refresh');
const btnNew = document.getElementById('btn-new');
const toggleCustom = document.getElementById('toggle-custom');
const customCreatorBox = document.getElementById('custom-creator');
const customUsernameInput = document.getElementById('custom-username');
const customDomainSelect = document.getElementById('custom-domain');
const btnApplyCustom = document.getElementById('btn-apply-custom');
const countdownElement = document.getElementById('countdown');
const mailCountElement = document.getElementById('mail-count');
const mailListContainer = document.getElementById('mail-list');
const readerEmpty = document.getElementById('reader-empty');
const readerContent = document.getElementById('reader-content');
const readSubject = document.getElementById('read-subject');
const readFrom = document.getElementById('read-from');
const readDate = document.getElementById('read-date');
const senderAvatar = document.getElementById('sender-avatar');
const attachmentsSection = document.getElementById('attachments-section');
const attachmentsCount = document.getElementById('attachments-count');
const attachmentsList = document.getElementById('attachments-list');
const emailIframe = document.getElementById('email-iframe');
const btnSound = document.getElementById('btn-sound');
const soundIcon = document.getElementById('sound-icon');
const soundWave = document.getElementById('sound-wave');
const toast = document.getElementById('toast');
const refreshIcon = document.getElementById('refresh-icon');

// QR Modal Elements
const qrModal = document.getElementById('qr-modal');
const btnCloseQr = document.getElementById('btn-close-qr');
const qrImage = document.getElementById('qr-image');
const qrEmailVal = document.getElementById('qr-email-val');

// History Elements
const toggleHistory = document.getElementById('toggle-history');
const historyList = document.getElementById('history-list');
const historyArrow = document.getElementById('history-arrow');
const historyCount = document.getElementById('history-count');

// Reader Action Elements
const btnDownloadEmail = document.getElementById('btn-download-email');
const btnDeleteEmail = document.getElementById('btn-delete-email');

// INIT Halaman
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  loadSavedSoundPreference();
  await initConfig();
  loadOrCreateSession();
});

// Setup Event Listeners
function setupEventListeners() {
  btnCopy.addEventListener('click', copyEmailToClipboard);
  btnQr.addEventListener('click', openQrModal);
  btnCloseQr.addEventListener('click', closeQrModal);
  btnRefresh.addEventListener('click', forceRefresh);
  btnNew.addEventListener('click', createNewRandomMailbox);
  btnSound.addEventListener('click', toggleSound);
  
  toggleCustom.addEventListener('click', () => {
    customCreatorBox.classList.toggle('hidden');
  });
  
  btnApplyCustom.addEventListener('click', applyCustomMailbox);
  
  // Toggle History List
  toggleHistory.addEventListener('click', () => {
    historyList.classList.toggle('hidden');
    historyArrow.classList.toggle('rotated');
  });
  
  // Close QR modal on clicking outside
  qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) closeQrModal();
  });

  // Reader Actions
  btnDownloadEmail.addEventListener('click', downloadCurrentEmail);
  btnDeleteEmail.addEventListener('click', deleteCurrentEmail);
}

// Memuat Konfigurasi (Daftar Domain) dari Worker
async function initConfig() {
  try {
    const res = await fetch(`${API_BASE}/api/config`);
    if (res.ok) {
      const data = await res.json();
      if (data.domains && data.domains.length > 0) {
        activeDomains = data.domains;
      }
    }
  } catch (error) {
    console.error("Gagal memuat konfigurasi dari API, menggunakan fallback:", error);
  }
  
  // Isi dropdown domain
  customDomainSelect.innerHTML = '';
  activeDomains.forEach(domain => {
    const option = document.createElement('option');
    option.value = domain;
    option.textContent = domain;
    customDomainSelect.appendChild(option);
  });
}

// Load atau buat email baru
function loadOrCreateSession() {
  const savedEmail = localStorage.getItem('cf_temp_email');
  
  if (savedEmail) {
    currentEmail = savedEmail;
    updateEmailDisplay();
    startPolling();
  } else {
    createNewRandomMailbox();
  }
  updateHistoryUI();
}

// Membuat Mailbox Acak Baru
function createNewRandomMailbox() {
  stopPolling();
  resetTimer();
  
  // Generate random username (10 karakter: huruf & angka)
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let randomUser = '';
  for (let i = 0; i < 10; i++) {
    randomUser += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Pilih domain pertama
  const domain = activeDomains[0];
  currentEmail = `${randomUser}@${domain}`;
  
  // Simpan email aktif
  localStorage.setItem('cf_temp_email', currentEmail);
  
  // Masukkan ke riwayat di localStorage
  addToHistory(currentEmail);
  
  knownMessageIds.clear();
  messagesList = [];
  activeMessageId = null;
  
  updateEmailDisplay();
  updateMailboxUI();
  updateHistoryUI();
  
  showToast("Email acak baru berhasil dibuat!");
  startPolling();
}

// Menampilkan Alamat Email di Input UI
function updateEmailDisplay() {
  emailAddressInput.value = currentEmail;
  
  const parts = currentEmail.split('@');
  customUsernameInput.value = parts[0];
  customDomainSelect.value = parts[1];
}

// Menerapkan Email Kustom dari Pilihan Pengguna
function applyCustomMailbox() {
  const username = customUsernameInput.value.trim().toLowerCase();
  const domain = customDomainSelect.value;
  
  if (!username) {
    showToast("Nama depan email tidak boleh kosong!");
    return;
  }
  
  if (!/^[a-z0-9._-]+$/.test(username)) {
    showToast("Format nama hanya boleh huruf, angka, titik, strip, dan underscore.");
    return;
  }
  
  stopPolling();
  resetTimer();
  
  currentEmail = `${username}@${domain}`;
  
  // Simpan email aktif
  localStorage.setItem('cf_temp_email', currentEmail);
  
  // Tambah ke riwayat
  addToHistory(currentEmail);
  
  knownMessageIds.clear();
  messagesList = [];
  activeMessageId = null;
  
  updateEmailDisplay();
  updateMailboxUI();
  updateHistoryUI();
  
  customCreatorBox.classList.add('hidden');
  showToast("Email kustom berhasil diterapkan!");
  
  startPolling();
}

// Copy Alamat Email
function copyEmailToClipboard() {
  const email = emailAddressInput.value;
  if (!email || email === "Memuat...") return;
  
  navigator.clipboard.writeText(email).then(() => {
    const wrapper = document.querySelector('.email-address-wrapper');
    wrapper.classList.add('active-focus');
    setTimeout(() => wrapper.classList.remove('active-focus'), 1000);
    
    showToast("Alamat email disalin ke clipboard!");
  }).catch(err => {
    console.error("Gagal menyalin: ", err);
  });
}

// QR Code Modal
function openQrModal() {
  if (!currentEmail || currentEmail === "Memuat...") return;
  
  qrEmailVal.textContent = currentEmail;
  // Menggunakan API QR gratis tanpa token
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentEmail)}`;
  qrModal.classList.remove('hidden');
}

function closeQrModal() {
  qrModal.classList.add('hidden');
  qrImage.src = '';
}

// RIWAYAT EMAIL (LOCALSTORAGE)
function addToHistory(email) {
  let history = getHistory();
  
  // Hapus jika sudah ada di riwayat agar urutannya bergeser ke atas
  history = history.filter(item => item !== email);
  
  // Tambahkan ke awal array
  history.unshift(email);
  
  // Batasi maksimal 10 email terakhir
  if (history.length > 10) {
    history = history.slice(0, 10);
  }
  
  localStorage.setItem('cf_temp_history', JSON.stringify(history));
}

function getHistory() {
  const historyRaw = localStorage.getItem('cf_temp_history');
  return historyRaw ? JSON.parse(historyRaw) : [];
}

function deleteFromHistory(email, event) {
  if (event) event.stopPropagation(); // Mencegah terklik ganda memilih email
  
  let history = getHistory();
  history = history.filter(item => item !== email);
  localStorage.setItem('cf_temp_history', JSON.stringify(history));
  
  // Jika email yang aktif dihapus dari riwayat, pilih email pertama yang tersisa, atau generate baru
  if (currentEmail === email) {
    if (history.length > 0) {
      switchEmail(history[0]);
    } else {
      createNewRandomMailbox();
    }
  } else {
    updateHistoryUI();
  }
  showToast("Riwayat email dihapus.");
}

function switchEmail(email) {
  stopPolling();
  resetTimer();
  
  currentEmail = email;
  localStorage.setItem('cf_temp_email', currentEmail);
  
  // Posisikan ulang email ini ke riwayat teratas
  addToHistory(email);
  
  knownMessageIds.clear();
  messagesList = [];
  activeMessageId = null;
  
  updateEmailDisplay();
  updateMailboxUI();
  updateHistoryUI();
  
  showToast("Beralih ke email pilihan.");
  startPolling();
}

function updateHistoryUI() {
  const history = getHistory();
  historyCount.textContent = history.length;
  
  if (history.length === 0) {
    historyList.innerHTML = `<div class="history-item" style="color: var(--text-muted); justify-content: center; cursor: default;">Tidak ada riwayat.</div>`;
    return;
  }
  
  historyList.innerHTML = '';
  history.forEach(email => {
    const item = document.createElement('div');
    item.className = `history-item ${currentEmail === email ? 'active' : ''}`;
    
    item.innerHTML = `
      <span class="history-email">${email}</span>
      <button class="btn-history-delete" title="Hapus dari riwayat">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;
    
    item.addEventListener('click', () => switchEmail(email));
    item.querySelector('.btn-history-delete').addEventListener('click', (e) => deleteFromHistory(email, e));
    
    historyList.appendChild(item);
  });
}

// POLLING & REFRESH KOTAK MASUK
function startPolling() {
  checkInbox(true); // Memeriksa pertama kali tanpa suara
  
  countdownSec = POLL_DURATION;
  countdownElement.textContent = countdownSec;
  
  pollInterval = setInterval(() => {
    countdownSec--;
    if (countdownSec <= 0) {
      checkInbox(false);
      countdownSec = POLL_DURATION;
    }
    countdownElement.textContent = countdownSec;
  }, 1000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function resetTimer() {
  countdownSec = POLL_DURATION;
  countdownElement.textContent = countdownSec;
}

function forceRefresh() {
  refreshIcon.classList.add('spin');
  checkInbox(false).finally(() => {
    setTimeout(() => {
      refreshIcon.classList.remove('spin');
    }, 600);
  });
  countdownSec = POLL_DURATION;
  countdownElement.textContent = countdownSec;
  showToast("Kotak masuk diperbarui.");
}

// Mengambil Email dari Server Worker D1
async function checkInbox(isInitialLoad = false) {
  if (!currentEmail) return;
  
  const statusDot = document.querySelector('.status-dot');
  statusDot.classList.add('loading');
  
  try {
    const res = await fetch(`${API_BASE}/api/messages?address=${encodeURIComponent(currentEmail)}`);
    if (res.ok) {
      const messages = await res.json();
      processMessages(messages, isInitialLoad);
    }
  } catch (error) {
    console.error("Gagal memeriksa inbox:", error);
  } finally {
    statusDot.classList.remove('loading');
  }
}

// Memproses daftar pesan dan memberikan notifikasi
function processMessages(messages, isInitialLoad) {
  messagesList = messages;
  let hasNew = false;
  
  messages.forEach(msg => {
    if (!knownMessageIds.has(msg.id)) {
      knownMessageIds.add(msg.id);
      if (!isInitialLoad) {
        hasNew = true;
      }
    }
  });
  
  updateMailboxUI();
  
  if (hasNew) {
    playNotificationSound();
    showToast("Email baru telah masuk!");
  }
}

// Update Kotak Masuk List UI
function updateMailboxUI() {
  mailCountElement.textContent = messagesList.length;
  
  if (messagesList.length === 0) {
    mailListContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 12h-6l-2 3H10l-2-3H2"></path>
            <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
          </svg>
        </div>
        <p>Menunggu email masuk...</p>
        <p class="sub-text">Kirim email ke alamat di atas untuk melihatnya muncul di sini.</p>
      </div>
    `;
    
    readerEmpty.classList.remove('hidden');
    readerContent.classList.add('hidden');
    activeMessageId = null;
    return;
  }
  
  mailListContainer.innerHTML = '';
  
  messagesList.forEach(msg => {
    const item = document.createElement('div');
    item.className = `mail-item ${activeMessageId === msg.id ? 'active' : ''}`;
    item.dataset.id = msg.id;
    
    // Format Waktu
    let dateStr = '';
    try {
      const date = new Date(msg.created_at);
      dateStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch(e) {
      dateStr = msg.created_at;
    }
    
    const senderName = msg.sender_name || msg.sender.split('@')[0];
    
    item.innerHTML = `
      <div class="mail-item-header">
        <span class="mail-sender">${senderName}</span>
        <span class="mail-time">${dateStr}</span>
      </div>
      <div class="mail-subject">${msg.subject || '(Tidak ada subjek)'}</div>
    `;
    
    item.addEventListener('click', () => selectEmail(msg.id));
    mailListContainer.appendChild(item);
  });
}

function selectEmail(id) {
  activeMessageId = id;
  
  document.querySelectorAll('.mail-item').forEach(item => {
    if (item.dataset.id === id) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  viewEmail(id);
}

// Mengambil Email Detail Lengkap dari Worker
let currentFullEmailData = null; // Menyimpan data email aktif secara global
async function viewEmail(id) {
  readerEmpty.classList.add('hidden');
  readerContent.classList.remove('hidden');
  
  setIframeContent('<h4>Memuat konten email...</h4>', '');
  
  readSubject.textContent = "Memuat...";
  readFrom.textContent = "...";
  readDate.textContent = "...";
  senderAvatar.textContent = "?";
  attachmentsSection.classList.add('hidden');
  currentFullEmailData = null;
  
  try {
    const res = await fetch(`${API_BASE}/api/messages/${id}`);
    if (res.ok) {
      const data = await res.json();
      currentFullEmailData = data;
      
      // Update UI Header
      readSubject.textContent = data.subject || '(Tidak ada subjek)';
      readFrom.textContent = data.sender_name ? `${data.sender_name} <${data.sender}>` : data.sender;
      
      // Format Tanggal
      try {
        const date = new Date(data.created_at);
        readDate.textContent = date.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch(e) {
        readDate.textContent = data.created_at;
      }
      
      // Avatar inisial
      const senderInitialName = data.sender_name || data.sender;
      senderAvatar.textContent = senderInitialName.charAt(0).toUpperCase();
      
      // Tulis isi pesan di sandboxed iframe
      setIframeContent(data.body_html, data.body_text);
      
      // Tampilkan Lampiran
      if (data.attachments && data.attachments.length > 0) {
        attachmentsSection.classList.remove('hidden');
        attachmentsCount.textContent = data.attachments.length;
        renderAttachments(data.attachments);
      } else {
        attachmentsSection.classList.add('hidden');
      }
    }
  } catch (error) {
    console.error("Gagal membaca email:", error);
    setIframeContent('<h4>Gagal memuat konten email. Silakan muat ulang.</h4>', 'Klik ulang email di sebelah kiri.');
  }
}

// Menulis Konten ke Iframe Sandboxed dengan Aman
function setIframeContent(html, text) {
  const content = html || text || '<em style="color: #64748b; font-style: italic;">Pesan ini kosong.</em>';
  
  const iframeDoc = emailIframe.contentDocument || emailIframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <base target="_blank">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            color: #1e293b;
            padding: 20px;
            margin: 0;
            background-color: #ffffff;
            word-break: break-word;
          }
          a {
            color: #4f46e5;
            text-decoration: underline;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          pre {
            white-space: pre-wrap;
            background: #f1f5f9;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
          }
        </style>
      </head>
      <body>
        ${html ? html : `<pre>${text}</pre>`}
      </body>
    </html>
  `);
  iframeDoc.close();
}

// Menampilkan Lampiran
function renderAttachments(attachments) {
  attachmentsList.innerHTML = '';
  
  attachments.forEach(file => {
    const chip = document.createElement('div');
    
    // Jika ada error (misal file > 1MB)
    if (file.error) {
      chip.className = 'attachment-chip attachment-error';
      chip.title = file.error;
      chip.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <span>${shortenFilename(file.filename)}</span>
        <span style="color: var(--danger); font-size: 10px;">(Gagal)</span>
      `;
    } else {
      chip.className = 'attachment-chip';
      // Path absolut ke API
      const downloadUrl = `${API_BASE}${file.downloadUrl}`;
      chip.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>${shortenFilename(file.filename)}</span>
        <span style="color: var(--text-muted); font-size: 10px;">(${formatBytes(file.size)})</span>
      `;
      // Tambahkan event click untuk download
      chip.addEventListener('click', () => {
        window.open(downloadUrl, '_blank');
      });
    }
    
    attachmentsList.appendChild(chip);
  });
}

// UNDUH EMAIL SAAT INI
function downloadCurrentEmail() {
  if (!currentFullEmailData) return;
  
  const data = currentFullEmailData;
  const fileName = `InstaMail_${data.id}.html`;
  
  // Bangun konten file HTML lengkap
  const fileContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${data.subject}</title>
  <style>
    body { font-family: sans-serif; padding: 30px; color: #333; line-height: 1.5; }
    h1 { font-size: 22px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .meta { font-size: 13px; color: #666; margin-bottom: 20px; background: #f9f9f9; padding: 12px; border-radius: 6px; }
    .content { border: 1px solid #ddd; padding: 20px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>Subjek: ${data.subject}</h1>
  <div class="meta">
    <strong>Dari:</strong> ${data.sender_name ? `${data.sender_name} <${data.sender}>` : data.sender}<br>
    <strong>Kepada:</strong> ${data.address}<br>
    <strong>Tanggal:</strong> ${new Date(data.created_at).toLocaleString('id-ID')}
  </div>
  <div class="content">
    ${data.body_html || `<pre style="white-space: pre-wrap;">${data.body_text}</pre>`}
  </div>
</body>
</html>
  `;
  
  const blob = new Blob([fileContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Email berhasil diunduh.");
}

// HAPUS EMAIL SAAT INI DARI SERVER D1
async function deleteCurrentEmail() {
  if (!activeMessageId) return;
  
  const confirmDelete = confirm("Apakah Anda yakin ingin menghapus email ini secara permanen dari server Cloudflare D1?");
  if (!confirmDelete) return;
  
  try {
    const res = await fetch(`${API_BASE}/api/messages/${activeMessageId}`, {
      method: 'DELETE'
    });
    
    if (res.ok) {
      showToast("Email berhasil dihapus dari server.");
      knownMessageIds.delete(activeMessageId);
      
      // Hapus dari messagesList lokal
      messagesList = messagesList.filter(msg => msg.id !== activeMessageId);
      activeMessageId = null;
      
      updateMailboxUI();
    } else {
      throw new Error("Gagal menghapus");
    }
  } catch (err) {
    console.error(err);
    showToast("Gagal menghapus email dari server.");
  }
}

// HELPERS
function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function shortenFilename(name) {
  if (name.length <= 15) return name;
  const ext = name.split('.').pop();
  return name.substring(0, 10) + '...' + ext;
}

// SOUND NOTIFICATIONS
function loadSavedSoundPreference() {
  const saved = localStorage.getItem('sound_enabled');
  if (saved !== null) {
    soundEnabled = saved === 'true';
    updateSoundUI();
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('sound_enabled', soundEnabled);
  updateSoundUI();
  
  if (soundEnabled) {
    playNotificationSound();
    showToast("Suara notifikasi diaktifkan");
  } else {
    showToast("Suara notifikasi dimatikan");
  }
}

function updateSoundUI() {
  if (soundEnabled) {
    btnSound.classList.add('active');
    soundIcon.style.color = 'var(--primary)';
    if (soundWave) soundWave.style.display = 'block';
    btnSound.title = "Matikan Suara Notifikasi";
  } else {
    btnSound.classList.remove('active');
    soundIcon.style.color = 'var(--text-muted)';
    if (soundWave) soundWave.style.display = 'none';
    btnSound.title = "Aktifkan Suara Notifikasi";
  }
}

// Web Audio API untuk membunyikan bell notifikasi sintesis (Chime G5 -> C6)
function playNotificationSound() {
  if (!soundEnabled) return;
  
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Nada 1 (G5)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(783.99, audioCtx.currentTime); // G5
    gain1.gain.setValueAtTime(0, audioCtx.currentTime);
    gain1.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.28);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.3);
    
    // Nada 2 (C6) - jeda 120ms
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046.50, audioCtx.currentTime + 0.12); // C6
    gain2.gain.setValueAtTime(0, audioCtx.currentTime + 0.12);
    gain2.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.42);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(audioCtx.currentTime + 0.12);
    osc2.stop(audioCtx.currentTime + 0.45);
    
  } catch (error) {
    console.error("Gagal memutar suara notifikasi: ", error);
  }
}

// Toast Alert System
let toastTimeout = null;
function showToast(message) {
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add('show');
  toast.classList.remove('hidden');
  
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 350);
  }, 2500);
}
