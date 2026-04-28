console.log("🚀 VAULT VERSION 3.1 - SYNCED & SECURED");

// Initialize Supabase
const SUPABASE_URL = "https://coddjlrywyojgdmfkuph.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvZGRqbHJ5d3lvamdkbWZrdXBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NjgxMDMsImV4cCI6MjA5MjQ0NDEwM30.wXavTOBoYco3WE1iI3RRXKdZX5WKejQUV_AO3BhvftY";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', async () => {
    // --- PERSISTENT SESSION CHECK ---
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    // Check if we have a locally stored session override for demo
    const localUser = localStorage.getItem('orygin_user');
    
    if (!session && !localUser) {
        window.location.href = 'login.html';
        return;
    }

    // Use localUser if available
    const userEmail = session ? session.user.email : localUser;

    // Update Profile UI
    const profileName = document.querySelector('.profile-info h3');
    const profileSub = document.querySelector('.profile-info p');
    if (profileName) profileName.textContent = userEmail.split('@')[0];
    if (profileSub) profileSub.textContent = userEmail;
    
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
    window.showToast = showToast;

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
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            switchView(target);
            if (target === 'dashboard-section') loadDashboard();
            if (target === 'library-section') loadLibrary();
        });
    });

    // Auto-load Dashboard on Start
    loadDashboard();

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

        ['dragenter', 'dragover'].forEach(e => {
            dropZone.addEventListener(e, (ev) => { 
                ev.preventDefault(); 
                ev.stopPropagation(); 
                dropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(e => {
            dropZone.addEventListener(e, (ev) => { 
                ev.preventDefault(); 
                ev.stopPropagation(); 
                dropZone.classList.remove('drag-over');
            });
        });

        dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

        async function handleFiles(files) {
            const runVerifyBtn = document.getElementById('run-verify-btn');
            if (mode === 'verify' && files.length > 0) {
                runVerifyBtn.style.display = 'inline-block';
                // Clear previous files in verify mode (only check one at a time)
                fileList.innerHTML = '';
            }
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
    const aiModal = document.getElementById('ai-progress-modal');
    
    if (vaultBtn) {
        vaultBtn.addEventListener('click', async () => {
            const ownerId = document.getElementById('owner-id').value.trim();
            const username = document.querySelector('.profile-info h3').textContent;
            const fileList = document.getElementById('protect-file-list');
            const items = Array.from(fileList.querySelectorAll('.file-item'));

            if (!ownerId || items.length === 0) {
                showToast("Identity Required!", "#ff3c3c");
                return;
            }

            // Show AI Progress Modal
            aiModal.style.display = 'flex';
            const steps = {
                tagging: document.getElementById('step-tagging'),
                dna: document.getElementById('step-dna'),
                upload: document.getElementById('step-upload')
            };

            // Reset Steps
            Object.values(steps).forEach(s => {
                s.className = 'process-step';
                s.querySelector('.step-status').textContent = 'Pending';
            });

            let lastSealedUrl = "";

            for (const item of items) {
                const id = item.getAttribute('data-id');
                const file = fileStore.get(id);

                // STEP 1: AI TAGGING
                steps.tagging.className = 'process-step active';
                steps.tagging.querySelector('.step-status').textContent = 'Processing...';

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch(`/seal?owner_id=${encodeURIComponent(ownerId)}&username=${encodeURIComponent(username)}`, {
                        method: 'POST',
                        body: formData
                    });
                    
                    const result = await response.json();

                    if (response.ok) {
                        // STEP 2: DNA INJECTION
                        steps.tagging.className = 'process-step completed';
                        steps.tagging.querySelector('.step-status').textContent = 'Done';
                        
                        steps.dna.className = 'process-step active';
                        steps.dna.querySelector('.step-status').textContent = 'Injecting...';
                        await new Promise(r => setTimeout(r, 1000)); // Visual pause

                        // STEP 3: UPLOAD
                        steps.dna.className = 'process-step completed';
                        steps.dna.querySelector('.step-status').textContent = 'Injected';
                        
                        steps.upload.className = 'process-step active';
                        steps.upload.querySelector('.step-status').textContent = 'Storing...';
                        await new Promise(r => setTimeout(r, 800));

                        steps.upload.className = 'process-step completed';
                        steps.upload.querySelector('.step-status').textContent = 'Secure';

                        lastSealedUrl = result.sealed_url;
                        
                        // Show success
                        document.getElementById('success-actions').style.display = 'block';
                        const downloadBtn = document.getElementById('download-sealed-btn');
                        downloadBtn.href = result.sealed_url;
                        
                        showToast("Asset DNA Secured!");
                    } else {
                        throw new Error(result.error);
                    }
                } catch (err) {
                    showToast("AI Lab Error: " + err.message, "#ff3c3c");
                    aiModal.style.display = 'none';
                }
            }
        });
    }
    
    // --- DASHBOARD & CRAWLER ---
    async function loadDashboard() {
        try {
            // 1. Fetch Library for count
            const libRes = await fetch('/library');
            const library = await libRes.json();
            const totalAssets = document.getElementById('stat-total-assets');
            if (totalAssets) totalAssets.textContent = library.length || 0;

            // 2. Fetch Violations
            const violRes = await fetch('/violations');
            const violations = await violRes.json();
            const activeViolations = document.getElementById('stat-active-violations');
            if (activeViolations) activeViolations.textContent = violations.length || 0;
            
            // 3. Render Violations Feed
            const feed = document.getElementById('violations-feed');
            if (!feed) return;
            feed.innerHTML = '';
            
            if (violations.length === 0) {
                feed.innerHTML = '<div class="no-assets">No active threats detected. System is secure.</div>';
            } else {
                violations.forEach(v => {
                    const item = document.createElement('div');
                    item.className = 'file-item';
                    item.style.background = 'rgba(255, 60, 60, 0.05)';
                    item.style.borderLeft = '4px solid #ff3c3c';
                    item.style.marginBottom = '10px';
                    item.innerHTML = `
                        <div class="file-info">
                            <div class="file-name" style="color: #ff3c3c; font-weight: bold;">
                                [${v.platform.toUpperCase()}] Unauthorized Re-stream Detected
                            </div>
                            <div class="file-size" style="font-family: monospace; font-size: 0.75rem; opacity: 0.7;">
                                SOURCE: ${v.violating_url}
                            </div>
                        </div>
                        <div class="file-status" style="color: #ff3c3c;">RISK: ${v.risk_score}%</div>
                        <div style="display: flex; gap: 10px;">
                            <button class="btn-primary" onclick="generateDMCA('${v.id}')" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; background: #ff3c3c; border: none;">Generate DMCA</button>
                            <button class="btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.7rem; background: transparent; border: 1px solid #444;">Ignore</button>
                        </div>
                    `;
                    feed.appendChild(item);
                });
            }
        } catch (err) {
            console.error('Dashboard Load Error:', err);
        }
    }

    const scanBtn = document.getElementById('trigger-scan-btn');
    if (scanBtn) {
        scanBtn.addEventListener('click', async () => {
            scanBtn.disabled = true;
            scanBtn.textContent = 'SCANNING GLOBAL WEB...';
            try {
                const res = await fetch('/crawl/trigger', { method: 'POST' });
                const data = await res.json();
                showToast(data.message, data.detections_found > 0 ? '#ff3c3c' : '#00d4ff');
                loadDashboard();
            } catch (err) {
                showToast("Crawler Signal Lost", "#ff3c3c");
            } finally {
                scanBtn.disabled = false;
                scanBtn.textContent = 'Manual System Scan';
            }
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
    const runVerifyBtn = document.getElementById('run-verify-btn');
    const verifyResult = document.getElementById('verify-result-container');
    const verifyFileList = document.getElementById('verify-file-list');
    
    if (runVerifyBtn) {
        runVerifyBtn.addEventListener('click', async () => {
            const items = Array.from(verifyFileList.querySelectorAll('.file-item'));
            if (items.length === 0) return;

            const id = items[0].getAttribute('data-id');
            const file = fileStore.get(id);
            if (!file) return;

            // UI Reset
            verifyResult.style.display = 'block';
            runVerifyBtn.disabled = true;
            runVerifyBtn.textContent = '🧬 SCANNING...';
            
            const badge = document.getElementById('verify-badge');
            const statusText = document.getElementById('verify-status-text');
            const ownerInfo = document.getElementById('verify-owner-info');
            const dnaBox = document.getElementById('verify-dna-string');
            const aiDesc = document.getElementById('verify-ai-desc');

            badge.className = 'verification-badge';
            badge.textContent = 'Scanning...';
            statusText.textContent = 'Extracting Invisible DNA...';
            ownerInfo.textContent = '';
            dnaBox.textContent = '...';
            aiDesc.textContent = 'Waiting for analysis...';

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch('/verify', { method: 'POST', body: formData });
                const result = await response.json();

                if (result.status === "Authentic") {
                    badge.classList.add('badge-authentic');
                    badge.textContent = 'Authentic';
                    statusText.textContent = 'Digital DNA Verified';
                    ownerInfo.textContent = `Asset Owner: ${result.details.owner_id || 'Verified User'}`;
                    dnaBox.textContent = result.dna;
                    aiDesc.textContent = result.details.ai_description || "Certified authentic asset.";
                    showToast("DNA Match Found!", "#00ff7f");
                } else {
                    badge.classList.add('badge-tampered');
                    badge.textContent = 'Tampered';
                    statusText.textContent = 'Verification Failed';
                    ownerInfo.textContent = 'No matching DNA found in this asset.';
                    dnaBox.textContent = 'CORRUPTED_OR_MISSING';
                    aiDesc.textContent = "Warning: This asset does not contain a valid ORYGIN AI forensic watermark.";
                    showToast("Tamper Alert!", "#ff3c3c");
                }
            } catch (err) {
                showToast("Verification failed.", "#ff3c3c");
            } finally {
                runVerifyBtn.disabled = false;
                runVerifyBtn.textContent = '🔍 RUN AI DIAGNOSTIC';
            }
        });
    }
});

// --- GLOBAL ACTION HANDLERS ---
window.generateDMCA = async function(violationId) {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = "GENERATING...";
    btn.disabled = true;

    try {
        const response = await fetch('/generate-dmca', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ violation_id: violationId })
        });
        const result = await response.json();
        
        if (result.success) {
            alert(`SUCCESS: Forensic evidence package generated for ${violationId}.\n\nURL: ${result.package_url}\n\nNotice has been sent to the platform legal team.`);
            const toast = document.querySelector('.toast-msg'); // Simple global find
            if (window.showToast) window.showToast("DMCA Package Ready", "#00ff7f");
        }
    } catch (err) {
        alert("Legal System Error: Could not generate package.");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
};
