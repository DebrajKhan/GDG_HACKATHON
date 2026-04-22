console.log("🚀 VAULT VERSION 2.0 ACTIVE");
document.addEventListener('DOMContentLoaded', () => {
    const securedFileNames = new Set();
    const securedFileHashes = new Set();

    // --- UI HELPERS ---
    function showToast(message) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast-msg';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
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

    const ham = document.getElementById('hamburger-btn');
    const close = document.getElementById('close-sidebar-btn');
    if (ham) ham.addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('open'); });
    if (close) close.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
    if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });

    // Sidebar Library Trigger (Attaching to all instances)
    const libraryLinks = document.querySelectorAll('[data-action="library"]');
    console.log(`🔍 Found ${libraryLinks.length} Library Links.`);

    libraryLinks.forEach((link, index) => {
        link.addEventListener('click', (e) => {
            console.log(`🖱️ Library Link #${index + 1} Clicked!`);
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

    // --- DROP ZONE & FILE LISTING ---
    const fileStore = new Map(); // Store File objects for later upload

    function setupDropZone(zoneId, inputId, listId, mode) {
        const dropZone = document.getElementById(zoneId);
        const fileInput = document.getElementById(inputId);
        const fileList = document.getElementById(listId);

        if (!dropZone || !fileInput) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => {
            dropZone.addEventListener(e, (ev) => { ev.preventDefault(); ev.stopPropagation(); });
        });

        ['dragenter', 'dragover'].forEach(e => {
            dropZone.addEventListener(e, () => dropZone.classList.add('dragover'));
        });

        ['dragleave', 'drop'].forEach(e => {
            dropZone.addEventListener(e, () => dropZone.classList.remove('dragover'));
        });

        dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

        function handleFiles(files) {
            Array.from(files).forEach(file => {
                const id = Math.random().toString(36).substr(2, 9);
                fileStore.set(id, file);

                const item = document.createElement('div');
                item.className = 'file-item';
                item.setAttribute('data-id', id);
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
            });
        }
    }

    setupDropZone('protect-drop-zone', 'protect-file-input', 'protect-file-list', 'protect');
    setupDropZone('verify-drop-zone', 'verify-file-input', 'verify-file-list', 'verify');

    // --- REAL BACKEND CALLS ---

    // 1. Seal Assets
    const vaultBtn = document.getElementById('secure-vault-btn');
    if (vaultBtn) {
        vaultBtn.addEventListener('click', async () => {
            const ownerId = document.getElementById('owner-id').value.trim();
            const fileList = document.getElementById('protect-file-list');
            const items = Array.from(fileList.querySelectorAll('.file-item'));

            if (!ownerId || items.length === 0) {
                showToast("Enter Owner ID and add files!");
                return;
            }

            vaultBtn.disabled = true;
            vaultBtn.textContent = "Processing...";

            for (const item of items) {
                const id = item.getAttribute('data-id');
                const file = fileStore.get(id);
                const statusEl = item.querySelector('.file-status');

                statusEl.textContent = "Uploading...";

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch(`/seal?owner_id=${encodeURIComponent(ownerId)}`, {
                        method: 'POST',
                        body: formData
                    });
                    const res = await response.json();

                    if (response.ok) {
                        statusEl.textContent = "Sealed ✓";
                        statusEl.style.color = "#00e676";
                    } else {
                        statusEl.textContent = "Error";
                        statusEl.style.color = "#ff3c3c";
                    }
                } catch (err) {
                    statusEl.textContent = "Failed";
                }
            }

            vaultBtn.disabled = false;
            vaultBtn.textContent = "Secure Vault";
            showToast("Vault operations complete!");
        });
    }

    // 2. Load Library
    async function loadLibrary() {
        const grid = document.getElementById('library-grid');
        grid.innerHTML = '<div class="loading-spinner">Fetching from Supabase...</div>';

        try {
            const response = await fetch('http://localhost:8080/library');
            const data = await response.json();

            grid.innerHTML = '';
            if (!data || data.length === 0) {
                grid.innerHTML = '<div class="loading-spinner">No assets in your vault.</div>';
                return;
            }

            data.forEach(item => {
                const card = document.createElement('div');
                card.className = 'asset-card';
                card.innerHTML = `
                    <div class="asset-header">
                        <span class="asset-owner">${item.owner_id}</span>
                        <span class="asset-date">${new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                    <div class="asset-id">TX: ${item.transaction_id}</div>
                    <div class="asset-actions">
                        <a href="${item.original_url}" target="_blank" class="btn-small btn-view-original">Original</a>
                        <a href="${item.sealed_url}" target="_blank" class="btn-small btn-view-sealed">Sealed</a>
                    </div>
                `;
                grid.appendChild(card);
            });
        } catch (err) {
            console.error("❌ Library Fetch Error:", err);
            grid.innerHTML = '<div class="loading-spinner">Failed to load vault. (Check Console)</div>';
        }
    }

    // 3. Verify Asset
    const verifyInput = document.getElementById('verify-file-input');
    if (verifyInput) {
        verifyInput.addEventListener('change', async () => {
            const file = verifyInput.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch('http://localhost:8080/verify', { method: 'POST', body: formData });
                const result = await response.json();
                alert(`Verification Result: ${result.status}\nOwner: ${result.owner_id || 'N/A'}`);
            } catch (err) {
                alert("Verification request failed.");
            }
        });
    }
});
