const API_BASE_URL = "http://localhost:8000";

// --- Tab Navigation ---
function showSection(section) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    document.getElementById(`${section}-section`).classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${section}`).classList.add('active');
}

// --- File Selection logic ---
const sealFileInput = document.getElementById('seal-file-input');
const sealDropZone = document.getElementById('seal-drop-zone');
const sealFileName = document.getElementById('seal-file-name');

const verifyFileInput = document.getElementById('verify-file-input');
const verifyDropZone = document.getElementById('verify-drop-zone');
const verifyFileName = document.getElementById('verify-file-name');

sealDropZone.onclick = () => sealFileInput.click();
verifyDropZone.onclick = () => verifyFileInput.click();

sealFileInput.onchange = e => {
    if (e.target.files.length) sealFileName.innerText = e.target.files[0].name;
};

verifyFileInput.onchange = e => {
    if (e.target.files.length) verifyFileName.innerText = e.target.files[0].name;
};

// --- API Calls ---

async function handleSeal() {
    const ownerId = document.getElementById('owner-id').value;
    const file = sealFileInput.files[0];
    const resultBox = document.getElementById('seal-result');

    if (!ownerId || !file) {
        showToast("Please provide both Owner ID and an Image", "error");
        return;
    }

    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `
        <div class="loader-container">
            <div class="loader"></div>
            <p>Processing perceptual fingerprint & encoding seal...</p>
        </div>
    `;

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch(`${API_BASE_URL}/seal?owner_id=${encodeURIComponent(ownerId)}`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.status === 200) {
            resultBox.innerHTML = `
                <h3 style="color: var(--success); margin-bottom: 1rem;">✅ Asset Sealed Successfully</h3>
                <div class="data-row"><span class="data-label">pHash:</span><span class="data-value">${data.pHash}</span></div>
                <div class="data-row"><span class="data-label">Transaction ID:</span><span class="data-value">${data.transaction_id}</span></div>
                <div class="data-row"><span class="data-label">Storage URL:</span><a href="${data.storage_url}" target="_blank" class="data-value" style="color: var(--primary)">View Sealed File</a></div>
                <p style="font-size: 0.8rem; margin-top: 1rem; opacity: 0.8">The sealed version is now registered to ${ownerId}.</p>
            `;
            showToast("Success! Ownership Registered.", "success");
        } else if (response.status === 409) {
            resultBox.innerHTML = `
                <h3 style="color: var(--error); margin-bottom: 1rem;">❌ Already Claimed</h3>
                <p>This image (or a perceptually similar one) has already been registered by another owner.</p>
                <div class="data-row" style="margin-top: 1rem;"><span class="data-label">Existing Owner:</span><span class="data-value">${data.owner_id}</span></div>
                <div class="data-row"><span class="data-label">Timestamp:</span><span class="data-value">${new Date(data.timestamp).toLocaleString()}</span></div>
            `;
            showToast("Conflict: Asset already claimed", "error");
        } else {
            throw new Error(data.detail || "Server Error");
        }
    } catch (error) {
        resultBox.innerHTML = `<p style="color: var(--error)">Error: ${error.message}</p>`;
        showToast("Processing failed", "error");
    }
}

async function handleVerify() {
    const file = verifyFileInput.files[0];
    const resultBox = document.getElementById('verify-result');

    if (!file) {
        showToast("Please upload a sealed image to verify", "error");
        return;
    }

    resultBox.classList.remove('hidden');
    resultBox.innerHTML = `
        <div class="loader-container">
            <div class="loader"></div>
            <p>Decoding seal and verifying structural integrity...</p>
        </div>
    `;

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch(`${API_BASE_URL}/verify`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.status === 200) {
            resultBox.innerHTML = `
                <div class="verified-card" style="padding-left: 10px;">
                    <h3 style="color: var(--success); margin-bottom: 1rem;">🛡️ Authenticity Verified</h3>
                    <div class="data-row"><span class="data-label">Verified Owner:</span><span class="data-value">${data.owner_id}</span></div>
                    <div class="data-row"><span class="data-label">Transaction ID:</span><span class="data-value">${data.transaction_id}</span></div>
                    <p style="font-size: 0.85rem; margin-top: 1rem; color: var(--success)">✓ Bit-plane patterns match private key signature.</p>
                    
                    <div class="secure-viewer-container" style="margin-top: 2rem;">
                        <p style="font-size: 0.9rem; margin-bottom: 1rem; font-weight: 600;">🔒 AquaGuard Secure View (Anti-Screenshot Active):</p>
                        <canvas id="secure-canvas" style="width: 100%; max-height: 400px; border-radius: 12px; border: 1px solid var(--primary-dim); cursor: crosshair;"></canvas>
                        <p style="font-size: 0.75rem; opacity: 0.6; margin-top: 0.5rem;">The image is flickering at 60Hz. Your brain sees the full image, but a screenshot will capture a scrambled version.</p>
                    </div>
                </div>
            `;
            showToast("Verified: Authentic Asset", "success");
            
            if (data.pov_frames) {
                setTimeout(() => initSecureViewer(data.pov_frames), 100);
            }
        } else {
            resultBox.innerHTML = `
                <div class="tampered-card" style="padding-left: 10px;">
                    <h3 style="color: var(--error); margin-bottom: 0.5rem;">⚠️ Tampered or Unregistered</h3>
                    <p style="font-size: 0.9rem; margin-bottom: 1rem;">The seal is broken or no ownership record was found for this image.</p>
                    <p style="font-size: 0.8rem; color: var(--text-dim)">Reason: ${data.message || "Pattern mismatch"}</p>
                </div>
            `;
            showToast("Warning: Tampered Asset", "error");
        }
    } catch (error) {
        resultBox.innerHTML = `<p style="color: var(--error)">Error: ${error.message}</p>`;
        showToast("Verification failed", "error");
    }
}

// --- Utils ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 2rem;
        border-radius: 8px;
        background: ${type === 'success' ? 'var(--success)' : 'var(--error)'};
        color: var(--bg-dark);
        font-weight: 700;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    toast.innerText = message;

    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function initSecureViewer(frames) {
    const canvas = document.getElementById('secure-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const imgA = new Image();
    const imgB = new Image();
    imgA.src = frames.a;
    imgB.src = frames.b;

    let currentFrame = 0;
    
    imgA.onload = () => {
        canvas.width = imgA.width;
        canvas.height = imgA.height;
        
        function animate() {
            ctx.drawImage(currentFrame % 2 === 0 ? imgA : imgB, 0, 0);
            currentFrame++;
            requestAnimationFrame(animate);
        }
        animate();
    };
}

const style = document.createElement('style');
style.innerHTML = `
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
`;
document.head.appendChild(style);
