document.addEventListener('DOMContentLoaded', () => {
    // Persistent State
    const vaultHistory = [];
    const securedFileHashes = new Set();

    // Utility: Show Toast
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast-msg';
        if (type === 'success') toast.style.background = 'rgba(0, 230, 118, 0.9)';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    // --- NAVIGATION JUMP LOGIC ---
    const navJumpBtns = document.querySelectorAll('.nav-jump-btn');
    const sections = document.querySelectorAll('.view-section');

    function jumpToSection(targetId) {
        sections.forEach(sec => {
            sec.classList.toggle('active', sec.id === targetId);
        });
        navJumpBtns.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
        });
        
        // Close sidebar if open
        const sidebar = document.getElementById('sidebar-menu');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            overlay.classList.remove('open');
        }
    }

    navJumpBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            jumpToSection(targetId);
        });
    });

    // Theme Toggling
    const themeSwitchCheckbox = document.getElementById('theme-switch-checkbox');
    const htmlEl = document.documentElement;
    themeSwitchCheckbox.addEventListener('change', () => {
        const newTheme = themeSwitchCheckbox.checked ? 'light' : 'dark';
        htmlEl.setAttribute('data-theme', newTheme);
    });

    // --- BATCH PROCESSING LOGIC ---
    const protectFileInput = document.getElementById('protect-file-input');
    const protectFileList = document.getElementById('protect-file-list');

    protectFileInput.addEventListener('change', () => {
        Array.from(protectFileInput.files).forEach(file => {
            addFileToList(file, protectFileList, 'protect');
        });
    });

    function addFileToList(file, listEl, mode) {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <div class="file-info">
                <span class="file-name">${file.name}</span>
            </div>
            <div class="file-status">Ready</div>
        `;
        item.file = file; // Store file object for later
        listEl.appendChild(item);
    }

    // --- SECURE VAULT (BATCH) ---
    const secureBtn = document.getElementById('secure-vault-btn');
    secureBtn.addEventListener('click', async () => {
        const ownerId = document.getElementById('owner-id').value.trim();
        const fileItems = Array.from(protectFileList.children);

        if (!ownerId) return showToast("Please provide an Owner ID");
        if (fileItems.length === 0) return showToast("No files to secure");

        secureBtn.disabled = true;
        secureBtn.textContent = "Processing Batch...";

        for (const item of fileItems) {
            const statusEl = item.querySelector('.file-status');
            statusEl.textContent = "Sealing...";
            statusEl.style.color = "var(--accent-primary)";

            const formData = new FormData();
            formData.append('file', item.file);

            try {
                const response = await fetch(`/seal?owner_id=${encodeURIComponent(ownerId)}`, {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();

                if (response.ok) {
                    statusEl.textContent = "Protected ✓";
                    statusEl.style.color = "#00e676";
                    addToLibrary(item.file.name, ownerId, result.transaction_id);
                    createCertificate(item.file.name, ownerId, result.transaction_id);
                } else {
                    statusEl.textContent = "Failed";
                    statusEl.style.color = "#ff3c3c";
                }
            } catch (err) {
                statusEl.textContent = "Error";
            }
        }

        showToast("Batch processing complete!", "success");
        secureBtn.disabled = false;
        secureBtn.textContent = "Secure All Files";
    });

    // --- LIBRARY & CERTIFICATES ---
    function addToLibrary(name, owner, txId) {
        const grid = document.getElementById('library-grid');
        const empty = grid.querySelector('.empty-state');
        if (empty) empty.remove();

        const card = document.createElement('div');
        card.className = 'asset-card';
        card.innerHTML = `
            <div class="card-header">
                <span class="card-title">${name}</span>
                <span class="badge">SECURED</span>
            </div>
            <div class="card-meta">Owner: ${owner}<br>ID: ${txId.substring(0, 8)}...</div>
            <div class="card-actions">
                <a href="#" class="btn-small btn-outline share-btn" data-name="${name}">Share Status</a>
            </div>
        `;
        grid.appendChild(card);

        card.querySelector('.share-btn').addEventListener('click', (e) => {
            e.preventDefault();
            const text = encodeURIComponent(`I just secured my asset "${name}" in the Digital Vault! 🛡️ #Hackathon #CyberSecurity`);
            window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
        });
    }

    function createCertificate(name, owner, txId) {
        const container = document.getElementById('certificate-container');
        const empty = container.querySelector('.empty-state');
        if (empty) empty.remove();

        const cert = document.createElement('div');
        cert.className = 'cert-card';
        cert.innerHTML = `
            <div class="card-title">Certificate of Authenticity</div>
            <div class="card-meta">
                <strong>Asset:</strong> ${name}<br>
                <strong>Owner:</strong> ${owner}<br>
                <strong>Transaction:</strong> ${txId}<br>
                <strong>Date:</strong> ${new Date().toLocaleDateString()}
            </div>
            <div class="card-actions">
                <button class="btn-small btn-outline" onclick="window.print()">Download PDF</button>
            </div>
        `;
        container.appendChild(cert);
    }

    // --- VERIFY & TAMPER MAP ---
    const verifyInput = document.getElementById('verify-file-input');
    verifyInput.addEventListener('change', async () => {
        const file = verifyInput.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        showToast("Analyzing pixel integrity...");
        
        try {
            const response = await fetch('/verify', { method: 'POST', body: formData });
            const result = await response.json();
            
            displayTamperMap(file, result.status === 'Verified');
        } catch (err) {
            showToast("Verification failed", "error");
        }
    });

    function displayTamperMap(file, isAuthentic) {
        const container = document.getElementById('tamper-map-container');
        const resultBadge = document.getElementById('tamper-result-msg');
        container.style.display = 'block';

        resultBadge.textContent = isAuthentic ? "AUTHENTICITY VERIFIED ✓" : "TAMPERING DETECTED ⚠";
        resultBadge.style.background = isAuthentic ? "rgba(0, 230, 118, 0.2)" : "rgba(255, 60, 60, 0.2)";
        resultBadge.style.color = isAuthentic ? "#00e676" : "#ff3c3c";

        // Load image into canvases
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvasOrig = document.getElementById('canvas-original');
                const canvasHeat = document.getElementById('canvas-heatmap');
                
                [canvasOrig, canvasHeat].forEach(c => {
                    c.width = img.width;
                    c.height = img.height;
                });

                const ctxOrig = canvasOrig.getContext('2d');
                ctxOrig.drawImage(img, 0, 0);

                const ctxHeat = canvasHeat.getContext('2d');
                ctxHeat.drawImage(img, 0, 0);
                
                if (!isAuthentic) {
                    // Simulate heatmap for demonstration if tampered
                    ctxHeat.fillStyle = 'rgba(255, 0, 0, 0.5)';
                    for(let i=0; i<20; i++) {
                        ctxHeat.fillRect(Math.random()*img.width, Math.random()*img.height, 50, 50);
                    }
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Sidebar Toggle
    const ham = document.getElementById('hamburger-btn');
    const close = document.getElementById('close-sidebar-btn');
    const sidebar = document.getElementById('sidebar-menu');
    const overlay = document.getElementById('sidebar-overlay');

    if (ham) ham.addEventListener('click', () => { sidebar.classList.add('open'); overlay.classList.add('open'); });
    if (close) close.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
    if (overlay) overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); });
});
