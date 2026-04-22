document.addEventListener('DOMContentLoaded', () => {
    const securedFileNames = new Set();
    const securedFileHashes = new Set();

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

    // Theme Toggling
    const themeSwitchCheckbox = document.getElementById('theme-switch-checkbox');
    const htmlEl = document.documentElement;
    
    // Check local storage or system preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        htmlEl.setAttribute('data-theme', savedTheme);
        if (savedTheme === 'light') themeSwitchCheckbox.checked = true;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        htmlEl.setAttribute('data-theme', 'light');
        themeSwitchCheckbox.checked = true;
    }

    themeSwitchCheckbox.addEventListener('change', () => {
        const newTheme = themeSwitchCheckbox.checked ? 'light' : 'dark';
        htmlEl.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Vault State Management
    function updateVaultBtnState() {
        const ownerInput = document.getElementById('owner-id');
        const fileList = document.getElementById('protect-file-list');
        const vaultBtn = document.getElementById('secure-vault-btn');
        if (!ownerInput || !fileList || !vaultBtn) return;
        
        if (ownerInput.value.trim() !== '' && fileList.children.length > 0) {
            vaultBtn.classList.remove('vault-btn-disabled');
        } else {
            vaultBtn.classList.add('vault-btn-disabled');
        }
    }

    const ownerInput = document.getElementById('owner-id');
    if (ownerInput) {
        ownerInput.addEventListener('input', () => {
            ownerInput.classList.remove('error-border');
            updateVaultBtnState();
        });
    }

    // Navigation Logic
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.view-section');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active button
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update active section
            const targetId = btn.getAttribute('data-target');
            sections.forEach(sec => {
                if (sec.id === targetId) {
                    sec.classList.add('active');
                } else {
                    sec.classList.remove('active');
                }
            });
        });
    });

    // Sidebar Logic
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const sidebarMenu = document.getElementById('sidebar-menu');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    function toggleSidebar() {
        sidebarMenu.classList.toggle('open');
        sidebarOverlay.classList.toggle('open');
    }

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', toggleSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

    // Sidebar Links Actions
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const action = link.getAttribute('data-action');
            
            if (link.id === 'account-dropdown-btn') {
                e.preventDefault();
                const arrow = link.querySelector('.dropdown-arrow');
                const submenu = document.getElementById('account-submenu');
                if (submenu.style.display === 'none') {
                    submenu.style.display = 'flex';
                    if (arrow) arrow.textContent = '>';
                } else {
                    submenu.style.display = 'none';
                    if (arrow) arrow.textContent = 'v';
                }
                return;
            }

            if (link.id === 'logout-btn') {
                e.preventDefault();
                const container = document.getElementById('toast-container');
                if (container) {
                    const toast = document.createElement('div');
                    toast.className = 'toast-msg';
                    toast.style.backgroundColor = '#ff3c3c';
                    toast.style.color = '#fff';
                    toast.textContent = 'Logging out...';
                    container.appendChild(toast);
                }
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 3000);
                return;
            }

            if (action) {
                e.preventDefault();
                toggleSidebar();
                
                setTimeout(() => {
                    switch(action) {
                        case 'settings':
                            showToast('Opening Settings...');
                            break;
                        case 'library':
                            showToast(`Opening Library... (${securedFileNames.size} files secured)`);
                            break;
                        case 'help':
                            showToast('Connecting to Support Team...');
                            break;
                        case 'account':
                            showToast('Opening Account Management...');
                            break;
                    }
                }, 300);
            }
        });
    });

    // Drag and Drop Logic Factory
    function setupDropZone(zoneId, inputId, listId, mode) {
        const dropZone = document.getElementById(zoneId);
        const fileInput = document.getElementById(inputId);
        const fileList = document.getElementById(listId);

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // Highlight drop zone
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('dragover');
            }, false);
        });

        // Handle dropped files
        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            handleFiles(files);
        });

        // Handle file input change
        fileInput.addEventListener('change', function() {
            handleFiles(this.files);
            this.value = ''; // Reset input value to allow selecting the same file again
        });

        function handleFiles(files) {
            Array.from(files).forEach(file => {
                // Check if image or video
                if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
                    alert('Please upload only images or videos.');
                    return;
                }
                
                displayFile(file);
            });
            
            if (mode === 'protect') {
                updateVaultBtnState();
            }
        }

        async function displayFile(file) {
            const size = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
            const statusMsg = mode === 'protect' ? 'Ready to secure' : 'Computing Hash...';
            const fileUrl = URL.createObjectURL(file);
            const iconSvg = file.type.startsWith('image') 
                ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'
                : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>';

            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    ${iconSvg}
                    <div>
                        <div class="file-name">${file.name}</div>
                        <div class="file-size">
                            ${size} <span style="margin: 0 8px; opacity: 0.5;">|</span>
                            <a href="${fileUrl}" target="_blank" class="view-file-link">View file</a>
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="file-status">${statusMsg}</div>
                    <button class="cancel-file-btn" title="Cancel" aria-label="Cancel file">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            `;
            fileList.appendChild(fileItem);

            const cancelBtn = fileItem.querySelector('.cancel-file-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    fileItem.style.animation = 'fadeOutUp 0.3s ease-in forwards';
                    setTimeout(() => {
                        fileItem.remove();
                        URL.revokeObjectURL(fileUrl);
                        if (mode === 'protect') {
                            updateVaultBtnState();
                        }
                    }, 300);
                });
            }

            // Calculate cryptographic hash
            try {
                const buffer = await file.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                fileItem.setAttribute('data-hash', hashHex);
                
                if (mode === 'verify') {
                    const statusEl = fileItem.querySelector('.file-status');
                    statusEl.textContent = 'Verifying with Backend...';
                    
                    try {
                        const response = await fetch(`http://localhost:8000/api/verify/${hashHex}`);
                        const result = await response.json();
                        
                        if (result.is_authentic) {
                            statusEl.textContent = `Authentic ✓ (Owner: ${result.owner_id})`;
                            statusEl.style.color = '#00e676';
                        } else {
                            statusEl.textContent = result.message;
                            statusEl.style.color = '#ff9900';
                        }
                    } catch (err) {
                        console.error("Backend error:", err);
                        statusEl.textContent = 'Backend unreachable';
                        statusEl.style.color = '#ff3c3c';
                    }
                }
            } catch (error) {
                console.error("Hashing error:", error);
                if (mode === 'verify') {
                    const statusEl = fileItem.querySelector('.file-status');
                    statusEl.textContent = 'Error processing file';
                    statusEl.style.color = '#ff3c3c';
                }
            }
        }
    }

    // Initialize both zones
    setupDropZone('protect-drop-zone', 'protect-file-input', 'protect-file-list', 'protect');
    setupDropZone('verify-drop-zone', 'verify-file-input', 'verify-file-list', 'verify');
    
    // Set initial vault button state
    updateVaultBtnState();

    // Secure Vault Logic
    const vaultBtn = document.getElementById('secure-vault-btn');
    if (vaultBtn) {
        vaultBtn.addEventListener('click', () => {
            const ownerInput = document.getElementById('owner-id');
            const ownerId = ownerInput.value.trim();
            const fileList = document.getElementById('protect-file-list');
            
            if (fileList.children.length === 0) {
                showToast('choose a file');
                return;
            }

            if (!ownerId) {
                showToast('user name not given');
                ownerInput.classList.add('error-border');
                ownerInput.focus();
                return;
            }
            
            const fileItems = Array.from(fileList.querySelectorAll('.file-item'));
            const filesData = fileItems.map(el => ({
                name: el.querySelector('.file-name').textContent,
                hash: el.getAttribute('data-hash')
            }));

            // Proceed with animation and backend save
            const vaultContainer = document.querySelector('.vault-container');
            const fallingFile = document.getElementById('falling-file');
            const statuses = fileList.querySelectorAll('.file-status');
            
            // 1. Hide the button (make it drop into vault)
            vaultBtn.style.transition = 'transform 0.4s ease-in, opacity 0.4s ease-in';
            vaultBtn.style.transform = 'translateY(40px) scale(0.5)';
            vaultBtn.style.opacity = '0';
            vaultBtn.disabled = true;
            
            // Update statuses to "Protecting..."
            statuses.forEach(statusEl => {
                statusEl.textContent = 'Protecting...';
                statusEl.style.color = '#00c6ff';
            });

            setTimeout(() => {
                // 2. Drop the file
                fallingFile.style.opacity = '1';
                fallingFile.style.transform = 'translateY(20px)';
                
                setTimeout(() => {
                    // 3. Close the lid
                    fallingFile.style.opacity = '0';
                    vaultContainer.classList.add('closing');
                    
                    // Update statuses to "Protected ✓"
                    statuses.forEach(statusEl => {
                        statusEl.textContent = 'Protected ✓';
                        statusEl.style.color = '#00e676';
                    });
                    
                    setTimeout(async () => {
                        let successCount = 0;
                        let errorCount = 0;
                        
                        for (const f of filesData) {
                            try {
                                const response = await fetch('http://localhost:8000/api/secure', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        owner_id: ownerId,
                                        file_name: f.name,
                                        file_hash: f.hash
                                    })
                                });
                                if (response.ok) {
                                    successCount++;
                                    securedFileNames.add(f.name);
                                } else {
                                    errorCount++;
                                }
                            } catch (e) {
                                console.error("Failed to secure", e);
                                errorCount++;
                            }
                        }

                        // 4. Success alert
                        if (errorCount === 0) {
                            alert(`Successfully secured ${successCount} files under Owner ID: ${ownerId}`);
                        } else {
                            alert(`Secured ${successCount} files. ${errorCount} failed (maybe already secured or backend is down).`);
                        }
                        
                        // Reset
                        fileList.innerHTML = '';
                        document.getElementById('owner-id').value = '';
                        updateVaultBtnState();
                        
                        // Reset animation states
                        vaultContainer.classList.remove('closing');
                        fallingFile.style.transition = 'none';
                        fallingFile.style.transform = 'translateY(-50px)';
                        fallingFile.style.opacity = '0';
                        
                        vaultBtn.style.transition = 'none';
                        vaultBtn.style.transform = 'translateY(0) scale(1)';
                        vaultBtn.style.opacity = '1';
                        vaultBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; vertical-align: middle;"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg> Secure Vault';
                        vaultBtn.disabled = false;
                        vaultBtn.style.background = '';
                        
                        // Restore transitions
                        setTimeout(() => {
                            fallingFile.style.transition = 'all 0.5s ease-in';
                            vaultBtn.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease';
                        }, 50);

                    }, 800);
                }, 500);
            }, 400);
        });
    }
});
