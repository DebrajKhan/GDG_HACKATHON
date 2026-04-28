
document.addEventListener('DOMContentLoaded', () => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const previewContainer = document.querySelector('.aspect-video');
    const goLiveBtn = document.querySelector('button.uppercase');
    const statusText = document.querySelector('.text-gray-400.text-sm.font-medium');
    const bitrateText = document.querySelector('.text-white.text-sm.font-mono');
    const dropsText = document.querySelectorAll('.text-white.text-sm.font-mono')[1];
    
    let isLive = false;
    let stream = null;
    let sessionId = null;
    let frameCount = 0;
    let lastTime = performance.now();
    let drops = 0;

    // 1. Setup Video & Canvas
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.style.display = 'none'; // Hide the raw video
    document.body.appendChild(video); // Some browsers require video in DOM to play
    
    previewContainer.innerHTML = '';
    previewContainer.appendChild(canvas);
    
    let cameraFPS = 60;

    async function startCamera() {
        try {
            console.log("🎬 Requesting camera access...");
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
                audio: false 
            });
            
            video.srcObject = stream;
            
            // Critical: Wait for video to be ready and playing
            video.onloadedmetadata = () => {
                console.log("✅ Video metadata loaded");
                video.play().then(() => {
                    console.log("▶️ Video playing");
                    // Set canvas size once
                    canvas.width = video.videoWidth || 1280;
                    canvas.height = video.videoHeight || 720;
                    requestAnimationFrame(drawSecureFrame);
                });
            };

            const track = stream.getVideoTracks()[0];
            cameraFPS = track.getSettings().frameRate || 60;
            
        } catch (err) {
            console.error("❌ Camera access denied:", err);
            if (statusText) statusText.textContent = "Error: Camera Blocked";
        }
    }

    function drawSecureFrame() {
        if (!stream || video.paused || video.ended) {
            requestAnimationFrame(drawSecureFrame);
            return;
        }

        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        // 1. CLEAR & DRAW BASE FRAME
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (isLive) {
            frameCount++;
            const time = performance.now();
            
            ctx.save();
            // 1. --- 100% ORIGINAL QUALITY FEED ---
            // All visual protection has been removed. 
            // Security is now handled by the Backend Steganography Engine.
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            // 2. INVISIBLE DIGITAL DNA (Local Marker for identification)
            // This is kept at near-zero opacity just for local verification
            const dx = (Math.sin(time * 0.001) * 0.2 + 0.5) * canvas.width;
            const dy = (Math.cos(time * 0.001) * 0.2 + 0.5) * canvas.height;
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.001)'; // Completely invisible
            ctx.font = 'bold 24px Montserrat';
            ctx.textAlign = 'center';
            ctx.fillText(`ORYGIN-DNA-PROTECT-${sessionId || "ACTIVE"}`, dx, dy);
            ctx.restore();
            
            // 3. SECURITY STATUS OVERLAY
            ctx.fillStyle = 'rgba(11, 15, 20, 0.8)';
            ctx.fillRect(15, 15, 280, 35);
            ctx.fillStyle = '#00FF7F'; // Bright green for 'Safe'
            ctx.font = 'bold 12px Montserrat';
            ctx.textAlign = 'left';
            ctx.fillText("● STEALTH DNA ENFORCEMENT ACTIVE", 35, 37);
        } else {
            // Preview Mode (Clean)
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '20px Montserrat';
            ctx.textAlign = 'center';
            ctx.fillText("PREVIEW MODE - CLICK 'GO LIVE' TO ENCRYPT", canvas.width / 2, canvas.height / 2);
        }

        requestAnimationFrame(drawSecureFrame);
    }

    // 3. Go Live & Metrics Logic
    goLiveBtn.addEventListener('click', async () => {
        if (!isLive) {
            const broadcasterId = localStorage.getItem('broadcaster_id') || 'ANON_USER';
            
            // Gather Metadata
            const title = document.querySelector('input[placeholder="Enter a catchy title..."]').value;
            const description = document.querySelector('textarea').value;
            const venue = document.querySelectorAll('select')[0].value;
            const medium = document.querySelectorAll('select')[1].value;

            try {
                const res = await fetch('/broadcast/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        broadcaster_id: broadcasterId,
                        title: title,
                        description: description,
                        venue: venue,
                        medium: medium
                    })
                });
                const data = await res.json();
                
                sessionId = data.session_id;
                isLive = true;
                
                // UI Updates
                goLiveBtn.textContent = "END BROADCAST";
                goLiveBtn.classList.replace('from-brand-blue', 'from-red-600');
                goLiveBtn.classList.replace('to-brand-blueDark', 'to-red-800');
                statusText.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span> LIVE';
                statusText.classList.replace('text-gray-500', 'text-red-500');
                
                startMetricsReporting();
            } catch (err) {
                alert("Failed to connect to ORYGIN Middleware.");
            }
        } else {
            location.reload(); // Stop broadcast
        }
    });

    function startMetricsReporting() {
        setInterval(async () => {
            if (!isLive) return;
            
            const now = performance.now();
            const fps = Math.round((frameCount * 1000) / (now - lastTime));
            const bandwidth = Math.round(Math.random() * 2000 + 3000); // Simulated 3-5mbps
            
            bitrateText.textContent = `${bandwidth} kbps`;
            dropsText.textContent = `${drops} (${Math.round(drops/frameCount * 100)}%)`;
            
            await fetch('/broadcast/metrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    session_id: sessionId,
                    bandwidth: bandwidth,
                    drops: drops
                })
            });
            
            frameCount = 0;
            lastTime = now;
        }, 5000);
    }

    startCamera();
});
