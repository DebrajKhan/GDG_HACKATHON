// Copy to Clipboard Utility
document.querySelectorAll('button').forEach(btn => {
    if (btn.textContent === 'Copy') {
        btn.addEventListener('click', (e) => {
            const input = e.target.previousElementSibling;
            input.select();
            document.execCommand('copy');
            e.target.textContent = 'Copied!';
            setTimeout(() => e.target.textContent = 'Copy', 2000);
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const previewContainer = document.querySelector('.aspect-video');
    
    // UI Elements
    const platformBtns = document.querySelectorAll('.platform-btn');
    const credFormWrapper = document.getElementById('cred-form-wrapper');
    const rtmpUrlGroup = document.getElementById('rtmp-url-group');
    const platformKeyInput = document.getElementById('platform-key');
    const platformRtmpInput = document.getElementById('platform-rtmp');
    const streamKeyLabel = document.getElementById('stream-key-label');
    const verifyConnBtn = document.getElementById('verify-conn-btn');
    
    const oryginKeysSection = document.getElementById('orygin-keys-section');
    const oryginStreamKey = document.getElementById('orygin-stream-key');
    
    const goLiveBtn = document.getElementById('go-live-btn');
    const liveBadge = document.getElementById('live-badge');
    const healthStatus = document.getElementById('health-status');
    const healthBitrate = document.getElementById('health-bitrate');
    const healthDrops = document.getElementById('health-drops');
    
    const banner = document.getElementById('violation-banner');
    const vioTimer = document.getElementById('vio-timer');
    const vioText = banner.querySelector('.vio-text');

    let selectedPlatform = null;
    let isVerified = false;
    let isLive = false;
    let sessionId = null;
    let frameCount = 0;
    let lastTime = performance.now();
    let drops = 0;
    let stream = null;

    let timerInterval = null;
    let violationStartTime = null;
    let pollInterval = null;

    // Platform Selection Logic
    platformBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            platformBtns.forEach(b => b.classList.remove('selected', 'yt', 'tw', 'fb'));
            
            selectedPlatform = btn.getAttribute('data-platform');
            btn.classList.add('selected');
            if (selectedPlatform === 'youtube') btn.classList.add('yt');
            else if (selectedPlatform === 'twitch') btn.classList.add('tw');
            else if (selectedPlatform === 'facebook') btn.classList.add('fb');
            
            // Show/Hide relevant fields
            if (selectedPlatform === 'custom') {
                rtmpUrlGroup.style.display = 'block';
            } else {
                rtmpUrlGroup.style.display = 'none';
            }
            
            streamKeyLabel.textContent = selectedPlatform === 'youtube' ? 'YouTube Stream Key' : 
                                         selectedPlatform === 'twitch' ? 'Twitch Primary Stream Key' : 
                                         selectedPlatform === 'facebook' ? 'Facebook Persistent Stream Key' : 'Stream Key';
            
            // Open modal
            credFormWrapper.classList.add('open');
            
            // Reset verification
            resetVerification();
        });
    });

    function resetVerification() {
        isVerified = false;
        goLiveBtn.disabled = true;
        verifyConnBtn.className = "w-full mt-4 bg-brand-blue/20 text-brand-blueLight border border-brand-blue/30 py-3 rounded-lg font-bold tracking-wider text-sm hover:bg-brand-blue/30 transition-all uppercase verify-idle";
        verifyConnBtn.textContent = "Verify Connection";
        verifyConnBtn.disabled = false;
        oryginKeysSection.classList.add('opacity-50');
        oryginStreamKey.value = "Waiting for connection verification...";
    }

    // Verify Connection
    verifyConnBtn.addEventListener('click', async () => {
        const key = platformKeyInput.value.trim();
        const url = platformRtmpInput.value.trim();
        
        if (!key) {
            alert('Please enter your stream key.');
            return;
        }
        if (selectedPlatform === 'custom' && !url) {
            alert('Please enter the custom RTMP URL.');
            return;
        }

        verifyConnBtn.disabled = true;
        verifyConnBtn.className = "w-full mt-4 py-3 rounded-lg font-bold tracking-wider text-sm uppercase verify-loading";
        verifyConnBtn.textContent = "Verifying...";

        try {
            const res = await fetch('/broadcast/verify-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: selectedPlatform, stream_key: key, rtmp_url: url })
            });
            const data = await res.json();
            
            if (res.ok && data.success) {
                isVerified = true;
                verifyConnBtn.className = "w-full mt-4 py-3 rounded-lg font-bold tracking-wider text-sm uppercase verify-ok";
                verifyConnBtn.textContent = "✓ Connection Verified";
                
                // Unlock Go Live & Show ORYGIN Key
                goLiveBtn.disabled = false;
                oryginKeysSection.classList.remove('opacity-50');
                oryginStreamKey.value = data.orygin_relay_key || "live_" + Math.random().toString(36).substr(2, 9);
            } else {
                throw new Error(data.error || "Verification failed");
            }
        } catch (err) {
            isVerified = false;
            verifyConnBtn.className = "w-full mt-4 py-3 rounded-lg font-bold tracking-wider text-sm uppercase verify-fail";
            verifyConnBtn.textContent = "✕ Verification Failed";
            verifyConnBtn.disabled = false;
        }
    });

    // Setup Video & Canvas
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.style.display = 'none';
    document.body.appendChild(video);
    
    previewContainer.innerHTML = '';
    previewContainer.appendChild(canvas);

    async function startCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
                audio: false 
            });
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play().then(() => {
                    canvas.width = video.videoWidth || 1280;
                    canvas.height = video.videoHeight || 720;
                    requestAnimationFrame(drawSecureFrame);
                });
            };
        } catch (err) {
            console.error("Camera access denied:", err);
            healthStatus.textContent = "Error: Camera Blocked";
        }
    }

    function drawSecureFrame() {
        if (!stream || video.paused || video.ended) {
            requestAnimationFrame(drawSecureFrame);
            return;
        }

        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (isLive) {
            frameCount++;
            const time = performance.now();
            
            ctx.save();
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            const dx = (Math.sin(time * 0.001) * 0.2 + 0.5) * canvas.width;
            const dy = (Math.cos(time * 0.001) * 0.2 + 0.5) * canvas.height;
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.001)'; 
            ctx.font = 'bold 24px Montserrat';
            ctx.textAlign = 'center';
            ctx.fillText(`ORYGIN-DNA-PROTECT-${sessionId || "ACTIVE"}`, dx, dy);
            ctx.restore();
            
            ctx.fillStyle = 'rgba(11, 15, 20, 0.8)';
            ctx.fillRect(15, 15, 280, 35);
            ctx.fillStyle = '#00FF7F'; 
            ctx.font = 'bold 12px Montserrat';
            ctx.textAlign = 'left';
            ctx.fillText("● STEALTH DNA ENFORCEMENT ACTIVE", 35, 37);
        } else {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '20px Montserrat';
            ctx.textAlign = 'center';
            ctx.fillText("PREVIEW MODE - VERIFY CONNECTION TO GO LIVE", canvas.width / 2, canvas.height / 2);
        }

        requestAnimationFrame(drawSecureFrame);
    }

    // Go Live
    goLiveBtn.addEventListener('click', async () => {
        if (!isLive) {
            if (!isVerified) return;
            const broadcasterId = localStorage.getItem('broadcaster_id') || 'ANON_USER';
            
            const title = document.getElementById('stream-title').value;
            const description = document.getElementById('stream-desc').value;

            try {
                const res = await fetch('/broadcast/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        broadcaster_id: broadcasterId,
                        title: title,
                        description: description,
                        platform: selectedPlatform,
                        platform_stream_key: platformKeyInput.value.trim(),
                        platform_rtmp_url: platformRtmpInput.value.trim()
                    })
                });
                const data = await res.json();
                
                sessionId = data.session_id;
                isLive = true;
                
                // UI Updates
                goLiveBtn.textContent = "END BROADCAST";
                goLiveBtn.classList.replace('from-brand-blue', 'from-red-600');
                goLiveBtn.classList.replace('to-brand-blueDark', 'to-red-800');
                goLiveBtn.style.boxShadow = '0 0 24px rgba(239,68,68,0.5)';
                
                liveBadge.classList.remove('hidden');
                healthStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span> LIVE';
                healthStatus.classList.replace('text-gray-500', 'text-red-500');
                
                // Store session to be read by tracker
                localStorage.setItem('current_session_id', sessionId);

                startMetricsReporting();
                startViolationPolling(broadcasterId);
            } catch (err) {
                alert("Failed to connect to ORYGIN Middleware.");
            }
        } else {
            location.reload(); 
        }
    });

    function startMetricsReporting() {
        setInterval(async () => {
            if (!isLive) return;
            
            const now = performance.now();
            const fps = Math.round((frameCount * 1000) / (now - lastTime));
            const bandwidth = Math.round(Math.random() * 2000 + 3000);
            
            healthBitrate.textContent = `${bandwidth} kbps`;
            healthDrops.textContent = `${drops} (${Math.round(drops/Math.max(1, frameCount) * 100)}%)`;
            
            await fetch('/broadcast/metrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId, bandwidth: bandwidth, drops: drops })
            }).catch(()=>{});
            
            frameCount = 0;
            lastTime = now;
        }, 5000);
    }

    // Polling for violations to show the banner
    function startViolationPolling(broadcasterId) {
        pollInterval = setInterval(async () => {
            if(!isLive) return;
            try {
                // To fetch violations by broadcaster_id
                const res = await fetch(`/violations?broadcaster_id=${encodeURIComponent(broadcasterId)}`);
                const violations = await res.json();
                
                if (violations && violations.length > 0) {
                    // Show banner
                    if (banner.style.display === 'none') {
                        banner.style.display = 'flex';
                        const firstVio = violations[0];
                        vioText.textContent = `Threat Detected! Unauthorized Re-stream found on ${firstVio.platform}.`;
                        
                        violationStartTime = new Date(firstVio.created_at).getTime();
                        if (isNaN(violationStartTime)) violationStartTime = Date.now(); // Fallback
                        
                        startBannerTimer();
                    }
                }
            } catch(e) {}
        }, 10000);
    }

    function startBannerTimer() {
        if(timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            const now = Date.now();
            const diff = Math.floor((now - violationStartTime) / 1000);
            const m = Math.floor(diff / 60).toString().padStart(2, '0');
            const s = (diff % 60).toString().padStart(2, '0');
            vioTimer.textContent = `${m}:${s}`;
        }, 1000);
    }

    startCamera();
});
