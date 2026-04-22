console.log("🚀 VAULT VERSION 3.1 - SYNCED & SECURED");

// Initialize Supabase
const SUPABASE_URL = "https://coddjlrywyojgdmfkuph.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvZGRqbHJ5d3lvamdkbWZrdXBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NjgxMDMsImV4cCI6MjA5MjQ0NDEwM30.wXavTOBoYco3WE1iI3RRXKdZX5WKejQUV_AO3BhvftY";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', async () => {
    // --- AUTH SESSION CHECK ---
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    // Update Profile UI
    const profileName = document.querySelector('.profile-info h3');
    const profileSub = document.querySelector('.profile-info p');
    if (profileName) profileName.textContent = session.user.email.split('@')[0];
    if (profileSub) profileSub.textContent = session.user.email;
    
    // Pre-fill Owner ID
    const ownerIdInput = document.getElementById('owner-id');
    if (ownerIdInput) ownerIdInput.value = session.user.email.split('@')[0];

    const securedFileNames = new Set();
    const fileStore = new Map();

    // --- UI HELPERS ---
    function showToast(message, color = null) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast-msg';
        if (color) toast.style.backgroundColor = color;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    // Login Success Handling
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('login') && urlParams.get('login') === 'success') {
        showToast('Welcome back, Twin', 'rgba(0, 200, 83, 0.95)');
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({path:newUrl}, '', newUrl);
    }

    // --- NAVIGATION & SIDEBAR ---
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.view-section');
    const sidebar = document.getElementById('sidebar-menu');
    const overlay = document.getElementById('sidebar-overlay');

    function switchView(targetId) {
        sections.forEach(sec => sec.classList.toggle('active', sec.id === targetId));
        navBtns.forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-target') === targetId));
    }

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.getAttribute('data-target')));
    });

    // Sidebar Dropdown Logic
    const accountDropdownBtn = document.getElementById('account-dropdown-btn');
    if (accountDropdownBtn) {
        accountDropdownBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const submenu = document.getElementById('account-submenu');
            const arrow = accountDropdownBtn.querySelector('.dropdown-arrow');
            const isOpen = submenu.style.display === 'flex';
            submenu.style.display = isOpen ? 'none' : 'flex';
            if (arrow) arrow.textContent = isOpen ? 'v' : '>';
        });
    }

    // Logout Logic
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            showToast('Logging out...', '#ff3c3c');
            await supabaseClient.auth.signOut();
            setTimeout(() => { window.location.href = 'login.html'; }, 1000);
        });
    }

    // Sidebar Toggle
    const ham = document.getElementById('hamburger-btn');
    const close = document.getElementById('close-sidebar-btn');
    if (ham) ham.addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('open'); });
    if (close) close.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
    if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });

    // Library Links
    const libraryLinks = document.querySelectorAll('[data-action="library"]');
    libraryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchView('library-section');
            loadLibrary();
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
        });
    });

    // --- THEME TOGGLING ---
    const themeSwitch = document.getElementById('theme-switch-checkbox');
    if (themeSwitch) {
        themeSwitch.addEventListener('change', () => {
            document.documentElement.setAttribute('data-theme', themeSwitch.checked ? 'light' : 'dark');
        });
    }

    // --- DROP ZONE & HASHING ---
    async function setupDropZone(zoneId, inputId, listId, mode) {
        const dropZone = document.getElementById(zoneId);
        const fileInput = document.getElementById(inputId);
        const fileList = document.getElementById(listId);

        if (!dropZone || !fileInput) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => {
            dropZone.addEventListener(e, (ev) => { ev.preventDefault(); ev.stopPropagation(); });
        });

        dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

        async function handleFiles(files) {
            for (const file of files) {
                const id = Math.random().toString(36).substr(2, 9);
                fileStore.set(id, file);

                // Calculate Hash (Your Feature)
                const buffer = await file.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
                const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

                const item = document.createElement('div');
                item.className = 'file-item';
                item.setAttribute('data-id', id);
                item.setAttribute('data-hash', hashHex);
                item.innerHTML = `
                    <div class="file-info">
                        <div class="file-name">${file.name}</div>
                        <div class="file-size">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                    <div class="file-status">Ready</div>
                    <button class="cancel-file-btn">✕</button>
                `;

                item.querySelector('.cancel-file-btn').onclick = () => {
                    item.remove();
                    fileStore.delete(id);
                };
                fileList.appendChild(item);
            }
        }
    }

    setupDropZone('protect-drop-zone', 'protect-file-input', 'protect-file-list', 'protect');
    setupDropZone('verify-drop-zone', 'verify-file-input', 'verify-file-list', 'verify');

    // --- SEAL ASSETS (With Animation) ---
    const vaultBtn = document.getElementById('secure-vault-btn');
    if (vaultBtn) {
        vaultBtn.addEventListener('click', async () => {
            const ownerId = document.getElementById('owner-id').value.trim();
            const fileList = document.getElementById('protect-file-list');
            const items = Array.from(fileList.querySelectorAll('.file-item'));

            if (!ownerId || items.length === 0) {
                showToast("Identity Required!", "#ff3c3c");
                return;
            }

            // Animation Trigger
            const vaultContainer = document.querySelector('.vault-container');
            const fallingFile = document.getElementById('falling-file');
            
            vaultBtn.disabled = true;
            vaultBtn.style.transform = 'translateY(40px) scale(0.5)';
            vaultBtn.style.opacity = '0';
            
            // Sequential Upload to Supabase
            let successCount = 0;
            for (const item of items) {
                const id = item.getAttribute('data-id');
                const file = fileStore.get(id);
                const statusEl = item.querySelector('.file-status');

                statusEl.textContent = "Sealing...";
                
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch(`/seal?owner_id=${encodeURIComponent(ownerId)}`, {
                        method: 'POST',
                        body: formData
                    });
                    
                    const result = await response.json();

                    if (response.ok) {
                        statusEl.textContent = "✓ Secured";
                        statusEl.style.color = "#00e676";
                        successCount++;
                    } else {
                        statusEl.textContent = result.error || "Failed";
                        statusEl.style.color = "#ff3c3c";
                    }
                } catch (err) {
                    statusEl.textContent = "Connection Error";
                    statusEl.style.color = "#ff3c3c";
                }
            }

            // Reset UI
            setTimeout(() => {
                vaultBtn.disabled = false;
                vaultBtn.style.transform = 'translateY(0) scale(1)';
                vaultBtn.style.opacity = '1';
                showToast(`Secured ${successCount} assets!`);
            }, 1000);
        });
    }

    // --- LOAD LIBRARY ---
    async function loadLibrary() {
        const grid = document.getElementById('library-grid');
        grid.innerHTML = '<div class="loading-spinner">Decrypting Vault...</div>';

        try {
            const response = await fetch('/library');
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || `Server Error: ${response.status}`);
            }

            grid.innerHTML = '';
            
            if (data.length === 0) {
                grid.innerHTML = '<div class="no-assets">Vault is empty. Seal your first asset to begin.</div>';
                return;
            }

            data.forEach(item => {
                const card = document.createElement('div');
                card.className = 'asset-card';
                const displayId = item.transaction_id ? item.transaction_id.substr(0, 8) : 'PENDING';
                card.innerHTML = `
                    <div class="asset-header">
                        <span class="asset-owner">${item.owner_id}</span>
                        <span class="asset-date">${new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                    <div class="asset-id">ID: ${displayId}...</div>
                    <div class="asset-actions">
                        <a href="${item.original_url || '#'}" target="_blank" class="btn-small">Original</a>
                        <a href="${item.sealed_url || '#'}" target="_blank" class="btn-small btn-view-sealed">Sealed</a>
                    </div>
                `;
                grid.appendChild(card);
            });
        } catch (err) {
            console.error('Library Load Error:', err);
            grid.innerHTML = `<div class="error-msg">Library Error: ${err.message}</div>`;
        }
    }

    // --- VERIFY ASSET ---
    const verifyInput = document.getElementById('verify-file-input');
    if (verifyInput) {
        verifyInput.addEventListener('change', async () => {
            const file = verifyInput.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch('/verify', { method: 'POST', body: formData });
                const result = await response.json();
                alert(`Verification: ${result.status}\nOwner: ${result.owner_id || 'Unknown'}`);
            } catch (err) {
                alert("Verification failed.");
            }
        });
    }
});
