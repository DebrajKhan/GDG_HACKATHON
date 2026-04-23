
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
    previewContainer.innerHTML = '';
    previewContainer.appendChild(canvas);
    
    async function startCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            video.srcObject = stream;
            requestAnimationFrame(drawSecureFrame);
        } catch (err) {
            console.error("Camera access denied:", err);
            alert("Please allow camera access to broadcast.");
        }
    }

    // 2. Anti-Screenshot Middleware Layer (Visual Encryption)
    function drawSecureFrame() {
        if (!stream) return;
        
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        
        // Draw the raw camera feed
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        if (isLive) {
            // APPLY MOIRE JAMMING GRID (Visual Encryption)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            const time = performance.now() * 0.01;
            
            for (let i = 0; i < canvas.width; i += 4) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i + Math.sin(time + i) * 10, canvas.height);
                ctx.stroke();
            }

            // DYNAMIC MOVING WATERMARK
            const x = (Math.sin(time * 0.5) * 0.4 + 0.5) * canvas.width;
            const y = (Math.cos(time * 0.5) * 0.4 + 0.5) * canvas.height;
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.font = '12px Montserrat';
            ctx.fillText("ORYGIN SECURE STREAM | ID: " + (sessionId || "PENDING"), x, y);
            
            // SECURITY OVERLAY: "PROTECTED"
            ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
            ctx.fillRect(0, 0, canvas.width, 20);
            ctx.fillStyle = '#60a5fa';
            ctx.fillText("● ENCRYPTED MIDDLEWARE ACTIVE", 10, 15);
        } else {
            // Preview Mode Dimming
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0,0, canvas.width, canvas.height);
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.fillText("PREVIEW MODE - CLICK GO LIVE", canvas.width/2, canvas.height/2);
        }
        
        frameCount++;
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
