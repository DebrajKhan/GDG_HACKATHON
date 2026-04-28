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

    // Resolve user details — session takes priority, fall back to localUser
    const userEmail = session ? session.user.email : localUser;
    // user_id is the Supabase Auth UUID; for localUser fallback use a stable hash
    const userId = session ? session.user.id : btoa(localUser || 'guest').replace(/=/g, '');

    // Update Profile UI
    const profileName = document.querySelector('.profile-info h3');
    const profileSub  = document.querySelector('.profile-info p');
    if (profileName) profileName.textContent = userEmail ? userEmail.split('@')[0] : 'User';
    if (profileSub)  profileSub.textContent  = userEmail || '';
    
    // Pre-fill Owner ID (safe — no crash when session is null)
    const ownerIdInput = document.getElementById('owner-id');
    if (ownerIdInput) ownerIdInput.value = userEmail ? userEmail.split('@')[0] : '';

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
                    // Pass both owner_id (display name) and user_id (Auth UUID) to /seal
                    const sealUrl = `/seal?owner_id=${encodeURIComponent(ownerId)}&user_id=${encodeURIComponent(userId)}`;
                    const response = await fetch(sealUrl, {
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
            // 1. Fetch THIS user's sealed assets count from real DB
            const libRes = await fetch(`/library?user_id=${encodeURIComponent(userId)}`);
            const library = await libRes.json();
            const totalAssets = document.getElementById('stat-total-assets');
            if (totalAssets) totalAssets.textContent = Array.isArray(library) ? library.length : 0;

            // 2. Fetch violations SCOPED to this user's assets (real DB)
            const violRes = await fetch(`/violations?user_id=${encodeURIComponent(userId)}`);
            const violations = await violRes.json();
            const activeViolations = document.getElementById('stat-active-violations');
            if (activeViolations) activeViolations.textContent = Array.isArray(violations) ? violations.length : 0;
            
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
                // Pass user_id so crawler only checks THIS user's assets
                const res = await fetch('/crawl/trigger', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: userId })
                });
                const data = await res.json();
                showToast(data.message, data.detections_found > 0 ? '#ff3c3c' : '#00d4ff');
                loadDashboard();
            } catch (err) {
                showToast('Crawler Signal Lost', '#ff3c3c');
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
            // Load only THIS user's sealed assets
            const response = await fetch(`/library?user_id=${encodeURIComponent(userId)}`);
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
    const runVerifyBtn   = document.getElementById('run-verify-btn');
    const verifyResult   = document.getElementById('verify-result-container');
    const verifyFileList = document.getElementById('verify-file-list');

    if (runVerifyBtn) {
        runVerifyBtn.addEventListener('click', async () => {
            const items = Array.from(verifyFileList.querySelectorAll('.file-item'));
            if (items.length === 0) return;

            const id   = items[0].getAttribute('data-id');
            const file = fileStore.get(id);
            if (!file) return;

            // UI Reset
            verifyResult.style.display = 'block';
            runVerifyBtn.disabled = true;
            runVerifyBtn.textContent = '🧬 SCANNING...';

            const badge      = document.getElementById('verify-badge');
            const statusText = document.getElementById('verify-status-text');
            const ownerInfo  = document.getElementById('verify-owner-info');
            const dnaBox     = document.getElementById('verify-dna-string');
            const aiDesc     = document.getElementById('verify-ai-desc');
            const certBtn    = document.getElementById('download-cert-btn');

            badge.className      = 'verification-badge';
            badge.textContent    = 'Scanning...';
            statusText.textContent = 'Querying Global Ownership Database...';
            ownerInfo.textContent  = '';
            dnaBox.textContent     = '...';
            aiDesc.textContent     = 'Waiting for analysis...';
            if (certBtn) certBtn.style.display = 'none';

            const formData = new FormData();
            formData.append('file', file);

            try {
                // Pass current user_id so backend can verify ownership
                const verifyUrl = `/verify?user_id=${encodeURIComponent(userId)}`;
                const response  = await fetch(verifyUrl, { method: 'POST', body: formData });
                const result    = await response.json();

                const isOriginal = result.verdict === 'ORIGINAL';

                if (isOriginal) {
                    badge.classList.add('badge-authentic');
                    badge.textContent      = '✅ ORIGINAL';
                    statusText.textContent = 'Verified — You Are The Original Owner';
                    ownerInfo.textContent  = `Registered Owner: ${result.owner_id || userEmail}`;
                    dnaBox.textContent     = result.phash || '—';
                    aiDesc.textContent     = `Transaction ID: ${result.transaction_id || '—'}  |  Sealed on: ${result.timestamp || '—'}`;
                    showToast('✅ Ownership Verified!', '#00ff7f');
                } else {
                    badge.classList.add('badge-tampered');
                    badge.textContent      = '⚠️ TAMPERED / NOT OWNER';
                    statusText.textContent = result.status || 'Verification Failed';
                    ownerInfo.textContent  = result.reason || 'This account is not the original owner.';
                    // Show real owner if we found one in DB (copyright alert)
                    if (result.owner_id) {
                        ownerInfo.textContent += ` Original owner: ${result.owner_id}.`;
                    }
                    dnaBox.textContent = result.phash || 'NOT_FOUND';
                    aiDesc.textContent = `Transaction ID: ${result.transaction_id || 'N/A'}  |  Sealed on: ${result.timestamp || 'N/A'}`;
                    showToast('⚠️ Tamper Alert!', '#ff3c3c');
                }

                // Show PDF download button
                if (certBtn) {
                    certBtn.style.display = 'inline-block';
                    certBtn.onclick = () => generateCertificatePDF({
                        verdict:        result.verdict || 'TAMPERED',
                        owner_id:       result.owner_id || 'Unknown',
                        current_user:   userEmail,
                        transaction_id: result.transaction_id || 'N/A',
                        timestamp:      result.timestamp || new Date().toISOString(),
                        phash:          result.phash || 'N/A',
                        reason:         result.reason || '',
                        filename:       file.name
                    });
                }

            } catch (err) {
                showToast('Verification failed: ' + err.message, '#ff3c3c');
                console.error('Verify error:', err);
            } finally {
                runVerifyBtn.disabled    = false;
                runVerifyBtn.textContent = '🔍 RUN VERIFICATION';
            }
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
//  PDF CERTIFICATE GENERATOR  (uses jsPDF loaded in photo_dashboard.html)
// ─────────────────────────────────────────────────────────────────────────────
function generateCertificatePDF(data) {
    if (typeof window.jspdf === 'undefined') {
        alert('PDF library not loaded. Please refresh the page and try again.');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc       = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const isOriginal  = data.verdict === 'ORIGINAL';
    const pageW       = doc.internal.pageSize.getWidth();
    const pageH       = doc.internal.pageSize.getHeight();
    const margin      = 20;
    const contentW    = pageW - margin * 2;

    // ── Background
    doc.setFillColor(10, 14, 26);
    doc.rect(0, 0, pageW, pageH, 'F');

    // ── Verdict banner
    if (isOriginal) {
        doc.setFillColor(0, 180, 80);
    } else {
        doc.setFillColor(200, 30, 30);
    }
    doc.rect(0, 0, pageW, 40, 'F');

    // ── ORYGIN header text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text('ORYGIN AI', pageW / 2, 15, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Content Authenticity Certificate', pageW / 2, 23, { align: 'center' });

    // ── Verdict
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(isOriginal ? '✔  ORIGINAL' : '✖  TAMPERED / UNAUTHORIZED', pageW / 2, 34, { align: 'center' });

    // ── Divider
    doc.setDrawColor(60, 130, 246);
    doc.setLineWidth(0.5);
    doc.line(margin, 46, pageW - margin, 46);

    // ── Helper to draw a labelled row
    let y = 56;
    const rowGap = 10;
    function drawRow(label, value, valueColor) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 165, 250);   // blue label
        doc.text(label.toUpperCase(), margin, y);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(valueColor ? valueColor[0] : 220,
                         valueColor ? valueColor[1] : 220,
                         valueColor ? valueColor[2] : 220);
        doc.setFontSize(10);
        // Wrap long values
        const lines = doc.splitTextToSize(String(value), contentW - 50);
        doc.text(lines, margin + 55, y);
        y += rowGap * lines.length;
    }

    drawRow('Verdict',          data.verdict,        isOriginal ? [0,200,100] : [255,80,80]);
    drawRow('Verified Owner',   data.owner_id);
    drawRow('Requesting User',  data.current_user);
    drawRow('File Name',        data.filename);
    drawRow('Transaction ID',   data.transaction_id);
    drawRow('Sealed On',        data.timestamp);
    drawRow('Perceptual Hash',  data.phash);
    if (data.reason) drawRow('Reason', data.reason);

    // ── Divider
    y += 4;
    doc.setDrawColor(40, 80, 160);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y);
    y += 8;

    // ── Note
    doc.setFontSize(8);
    doc.setTextColor(100, 120, 150);
    doc.setFont('helvetica', 'italic');
    const noteText = isOriginal
        ? 'This certificate confirms that the requesting account is the registered original owner of this content in the ORYGIN system.'
        : 'This certificate indicates that the requesting account does NOT match the registered owner, or the content has not been registered. This may constitute copyright infringement.';
    const noteLines = doc.splitTextToSize(noteText, contentW);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 5 + 8;

    // ── Footer
    doc.setFontSize(8);
    doc.setTextColor(60, 80, 120);
    doc.text(`Generated by ORYGIN AI  •  ${new Date().toUTCString()}`, pageW / 2, pageH - 12, { align: 'center' });
    doc.setDrawColor(40, 60, 120);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 16, pageW - margin, pageH - 16);

    // ── Save
    const filename = `ORYGIN_${data.verdict}_Certificate_${Date.now()}.pdf`;
    doc.save(filename);
}

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
