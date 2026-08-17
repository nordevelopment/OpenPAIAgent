class AIAgentChat {
    constructor() {
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.sessionId = null;
        this.isLoading = false;
        this.messageCount = 1;
        this.statusElement = document.getElementById('system-status');

        this.btnClearChat = document.getElementById('btnClearChat');
        this.btnClearMemory = document.getElementById('btnClearMemory');
        this.btnNewChat = document.getElementById('btnNewChat');
        this.sessionsList = document.getElementById('sessionsList');

        this.btnOpenAgents = document.getElementById('btnOpenAgents');
        this.btnOpenWorkspace = document.getElementById('btnOpenWorkspace');
        this.btnBackToChat = document.getElementById('btnBackToChat');
        this.btnCreateAgentTop = document.getElementById('btnCreateAgentTop');
        this.chatViewContainer = document.getElementById('chatViewContainer');
        this.agentsViewContainer = document.getElementById('agentsViewContainer');
        this.agentsGridContainer = document.getElementById('agentsGridContainer');
        this.activeAgentBadge = document.getElementById('activeAgentBadge');
        this.activeAgentId = 'main_agent';
        this.hasAiApiKey = true;

        this.inputImageFile = document.getElementById('input-image-file');
        this.imagePreviewContainer = document.getElementById('imagePreviewContainer');
        this.imagePreview = document.getElementById('imagePreview');
        this.btnRemoveImage = document.getElementById('btnRemoveImage');
        this.selectedImageBase64 = null;

        this.init();
    }

    async init() {
        // Setup marked options and custom renderer first, before loading agents and history
        const renderer = new marked.Renderer();
        renderer.link = function (href, title, text) {
            if (typeof href === 'object' && href !== null) {
                const obj = href;
                href = obj.href;
                title = obj.title;
                text = obj.text;
            }
            if (href && href.startsWith('/storage/')) {
                return `<div class="message-image-container"><a href="${href}" target="_blank"><img src="${href}" class="chat-message-image" alt="${text || ''}" /></a></div>`;
            }
            return `<a href="${href || ''}" title="${title || ''}" target="_blank" rel="noopener noreferrer">${text || ''}</a>`;
        };
        renderer.image = function (href, title, text) {
            if (typeof href === 'object' && href !== null) {
                const obj = href;
                href = obj.href;
                title = obj.title;
                text = obj.text;
            }
            return `<div class="message-image-container"><a href="${href || ''}" target="_blank"><img src="${href || ''}" class="chat-message-image" alt="${text || ''}" /></a></div>`;
        };

        marked.use({
            breaks: true,
            gfm: true,
            renderer: renderer
        });

        await this.getCurrentSession();

        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        if (this.inputImageFile) {
            this.inputImageFile.addEventListener('change', (e) => this.handleImageSelect(e));
        }
        if (this.btnRemoveImage) {
            this.btnRemoveImage.addEventListener('click', () => this.removeSelectedImage());
        }

        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
        });
        this.btnClearChat.addEventListener('click', () => this.clearChat());
        this.btnClearMemory.addEventListener('click', () => this.clearMemory());
        this.btnNewChat.addEventListener('click', () => this.createNewChat());

        if (this.btnOpenAgents) {
            this.btnOpenAgents.addEventListener('click', () => this.showAgentsView());
        }
        if (this.btnOpenWorkspace) {
            this.btnOpenWorkspace.addEventListener('click', () => this.openWorkspaceFolder());
        }
        if (this.btnBackToChat) {
            this.btnBackToChat.addEventListener('click', () => this.showChatView());
        }
        if (this.btnCreateAgentTop) {
            this.btnCreateAgentTop.addEventListener('click', () => this.createAgent());
        }

        this.initializeServices();

        // Ждем загрузки истории и сессий
        await this.loadAgents();
        await this.getHistory();
        await this.getSessions();
    }

    showAgentsView() {
        if (this.chatViewContainer && this.agentsViewContainer) {
            this.chatViewContainer.style.display = 'none';
            this.agentsViewContainer.style.display = 'flex';
            this.loadAgents();
        }
    }

    showChatView() {
        if (this.chatViewContainer && this.agentsViewContainer) {
            this.agentsViewContainer.style.display = 'none';
            this.chatViewContainer.style.display = 'flex';
        }
    }

    async openWorkspaceFolder() {
        try {
            const response = await fetch('/api/workspace/open', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `Server returned ${response.status}`);
            }
            const data = await response.json();
            if (data.success) {
                this.addSystemMessage(`Opened workspace folder: ${data.path}`, null, null, true, '📁');
            } else {
                alert(data.message || 'Failed to open workspace folder.');
            }
        } catch (error) {
            console.error('Error opening workspace:', error);
            alert(`Error opening workspace folder: ${error.message}`);
        }
    }

    updateActiveAgentBadge() {
        if (this.activeAgentBadge) {
            const name = (this.activeAgentId || 'main_agent').replace(/_/g, ' ').toUpperCase();
            this.activeAgentBadge.textContent = `AGENT: ${name}`;
            this.activeAgentBadge.style.display = 'inline-block';
        }
    }


    async getCurrentSession() {
        try {
            const response = await fetch('/api/sessions/current', {
                method: 'GET',
            });

            if (!response.ok) {
                console.error('Failed to get current session:', response.status);
                return;
            }

            const data = await response.json();
            console.log('Session API response:', data);
            this.sessionId = data.sessionId;
            if (data.agentId) {
                this.activeAgentId = data.agentId;
            }
            this.updateActiveAgentBadge();
            this.updateStatus({ status: 200 });
            console.log('Current session:', this.sessionId);
        } catch (error) {
            console.error('Failed to get current session:', error);
        }
    }

    async createNewChat(targetAgentId = null) {
        try {
            const agentId = targetAgentId || this.activeAgentId || 'main_agent';
            this.activeAgentId = agentId;
            const response = await fetch('/api/sessions/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ agentId }),
            });
            const data = await response.json();
            if (data.success) {
                this.sessionId = data.sessionId;
                this.chatMessages.innerHTML = '';
                this.updateActiveAgentBadge();
                this.updateStatus({ status: 200 });
                await this.getHistory();
                await this.getSessions();
            }
        } catch (error) {
            console.error('Failed to create new chat:', error);
        }
    }

    async startChatWithAgent(agentId) {
        this.activeAgentId = agentId;
        await this.createNewChat(agentId);
        this.showChatView();
    }

    async deleteSession(sessionId) {
        if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/api/sessions/${sessionId}`, {
                method: 'DELETE',
            });
            const data = await response.json();
            if (data.success) {
                // Если удалили текущую сессию, создаем новую
                if (sessionId === this.sessionId) {
                    await this.createNewChat();
                } else {
                    this.getSessions();
                }
            }
        } catch (error) {
            console.error('Failed to delete session:', error);
        }
    }

    async switchSession(sessionId) {
        try {
            const response = await fetch('/api/sessions/switch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sessionId }),
            });

            const data = await response.json();
            if (data.success) {
                this.sessionId = sessionId;
                if (data.agentId) {
                    this.activeAgentId = data.agentId;
                }
                this.chatMessages.innerHTML = '';
                this.updateActiveAgentBadge();
                this.updateStatus({ status: 200 });
                await this.getHistory();
                await this.getSessions();
            } else {
                console.error('Failed to switch session:', data.message);
            }
        } catch (error) {
            console.error('Failed to switch session:', error);
        }
    }

    async initializeServices() {
        try {
            const response = await fetch('/api/health', {
                method: 'GET',
            });

            this.updateStatus(response);

            // Check AI API Key status and show setup warning alert on chat page if missing
            const setupWarningAlert = document.getElementById('setupWarningAlert');
            const settingsResponse = await fetch('/api/settings');
            if (settingsResponse.ok) {
                const settings = await settingsResponse.json();
                this.hasAiApiKey = !!settings.hasAiApiKey;
                if (!settings.hasAiApiKey) {
                    if (setupWarningAlert) setupWarningAlert.style.display = 'block';
                } else {
                    if (setupWarningAlert) setupWarningAlert.style.display = 'none';
                }
            }

        } catch (error) {
            this.updateStatus('CONNECTION FAILED');
        }
    }

    updateStatus(response = { status: 200 }) {
        console.log('Status:', response);
        const isOk = typeof response === 'object' ? (response.status === 200 || response.ok) : response === 200;
        if (isOk) {
            const formattedAgent = (this.activeAgentId || 'main_agent').replace(/_/g, ' ').toUpperCase();
            this.statusElement.textContent = `${formattedAgent} :: READY`;
            this.statusElement.classList.add('cyber-text-glow');
        } else {
            this.statusElement.textContent = 'CRITICAL :: CONNECTION_LOST :: RETRYING...';
            this.statusElement.classList.remove('cyber-text-glow');
        }
    }

    handleImageSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.selectedImageBase64 = event.target.result;
            this.imagePreview.src = this.selectedImageBase64;
            this.imagePreviewContainer.classList.add('active');
        };
        reader.readAsDataURL(file);
    }

    removeSelectedImage() {
        this.selectedImageBase64 = null;
        this.imagePreview.src = '';
        this.imagePreviewContainer.classList.remove('active');
        if (this.inputImageFile) {
            this.inputImageFile.value = '';
        }
    }

    async sendMessage() {
        if (this.isLoading) return;
        const message = this.messageInput.value.trim();
        const image = this.selectedImageBase64;
        if (!message && !image) return;

        if (!this.hasAiApiKey) {
            this.addMessage('⚠️ **AI API Key is missing.** Please open [Settings](/settings) to configure your AI API Key to enable LLM chat functions.', 'agent');
            return;
        }

        console.log('Sending message:', { message, hasImage: !!image, sessionId: this.sessionId });

        this.isLoading = true;
        this.sendButton.disabled = true;
        this.messageInput.disabled = true;

        if (image) {
            this.addMessage([
                { type: 'text', text: message },
                { type: 'image_url', image_url: { url: image } }
            ], 'user');
        } else {
            this.addMessage(message, 'user');
        }

        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.removeSelectedImage();
        this.showTyping();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    sessionId: this.sessionId,
                    image: image
                }),
            });

            if (!response.ok) {
                throw new Error('NEURAL TRANSMISSION FAILED');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');

                // Keep the last partial event in the buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;

                    // Parse event and data
                    const eventMatch = line.match(/^event:\s*(.+)$/m);
                    const dataMatch = line.match(/^data:\s*(.+)$/m);

                    if (eventMatch && dataMatch) {
                        const eventName = eventMatch[1].trim();
                        let eventData = null;
                        try {
                            eventData = JSON.parse(dataMatch[1].trim());
                        } catch (e) {
                            console.error('Failed to parse SSE data:', e);
                            continue;
                        }

                        this.handleSSEEvent(eventName, eventData);
                    }
                }
            }

        } catch (error) {
            console.error('Chat error:', error);
            this.hideTyping();
            this.addMessage('⚠️ NEURAL INTERFACE ERROR. Retry transmission.', 'agent');
            if (window.robotPet) {
                window.robotPet.toError();
            }
        } finally {
            this.isLoading = false;
            this.sendButton.disabled = false;
            this.messageInput.disabled = false;
            this.messageInput.focus();
        }
    }

    handleSSEEvent(eventName, eventData) {
        if (eventName === 'tool_start') {
            const toolName = eventData.name;
            const args = eventData.arguments || {};
            let detailText = '';

            // Format details depending on the tool
            if (toolName === 'write_file' || toolName === 'read_file' || toolName === 'delete_item' || toolName === 'get_file_info' || toolName === 'generate_pdf') {
                detailText = `Path: ${args.path || ''}`;
            } else if (toolName === 'move_or_rename') {
                detailText = `From: ${args.source || ''} -> To: ${args.destination || ''}`;
            } else if (toolName === 'fetch_web_page') {
                detailText = `URL: ${args.url || ''}`;
            } else if (toolName === 'generate_image') {
                detailText = `Prompt: ${args.prompt || ''}`;
            } else if (toolName === 'save_memory' || toolName === 'delete_memory') {
                detailText = `Key: ${args.key || ''}`;
            } else {
                detailText = JSON.stringify(args);
            }

            // Update typing indicator text
            const typingTextEl = this.typingIndicator.querySelector('.typing-text');
            if (typingTextEl) {
                typingTextEl.textContent = `EXECUTING TOOL: ${toolName.toUpperCase()}...`;
            }

            this.addSystemMessage(`Tool execution started: ${toolName}`, detailText, null, false);
        } else if (eventName === 'tool_done') {
            const toolName = eventData.name;
            let resultText = '';

            if (typeof eventData.result === 'string') {
                resultText = eventData.result;
            } else {
                resultText = JSON.stringify(eventData.result, null, 2);
            }

            // Truncate overly long outputs (like list_directory or read_file)
            if (resultText && resultText.length > 250) {
                resultText = resultText.substring(0, 250) + '\n... [TRUNCATED]';
            }

            // Update typing indicator text
            const typingTextEl = this.typingIndicator.querySelector('.typing-text');
            if (typingTextEl) {
                typingTextEl.textContent = `TOOL ${toolName.toUpperCase()} COMPLETED`;
            }

            this.addSystemMessage(`Tool completed: ${toolName}`, null, `Result: ${resultText}`, true);
        } else if (eventName === 'skills_loaded') {
            const skills = eventData.skills || [];
            if (skills.length > 0) {
                this.addSystemMessage(`Active skills loaded: ${skills.join(', ')}`, null, null, false, '💡');
            }
        } else if (eventName === 'final') {
            this.hideTyping();

            // Restore default text to typing indicator for next execution
            const typingTextEl = this.typingIndicator.querySelector('.typing-text');
            if (typingTextEl) {
                typingTextEl.textContent = 'AI IS THINKING...';
            }

            this.addMessage(eventData.message, 'agent', eventData.reasoning || null);
            if (window.robotPet) {
                window.robotPet.toHappy();
            }
        } else if (eventName === 'error') {
            this.hideTyping();
            this.addMessage(`⚠️ SYSTEM ERROR: ${eventData.message}`, 'agent');
            if (window.robotPet) {
                window.robotPet.toError();
            }
        }
    }

    removeWelcomeState() {
        const welcomeContainer = document.getElementById('welcomeContainer');
        if (welcomeContainer) {
            welcomeContainer.remove();
        }
    }

    renderWelcomeState() {
        if (!this.chatMessages) return;
        this.chatMessages.innerHTML = `
            <div class="welcome-container" id="welcomeContainer">
                <div class="welcome-header">
                    <p class="welcome-title">Select a quick starter or enter your prompt below:</p>
                </div>
                <div class="welcome-cards">
                    <div class="welcome-card" data-prompt="Write clean and structured code">
                        <div class="welcome-card-header">
                            <span class="card-icon">💻</span>
                            <span class="card-title">Coding & Scripts</span>
                        </div>
                        <div class="card-desc">Code generation, refactoring, debugging & database integration</div>
                    </div>
                    <div class="welcome-card" data-prompt="Fetch web page content from URL: ">
                        <div class="welcome-card-header">
                            <span class="card-icon">🌐</span>
                            <span class="card-title">Web Scraper & Fetch</span>
                        </div>
                        <div class="card-desc">Extract text, markdown & content from any web page URL</div>
                    </div>
                    <div class="welcome-card" data-action="open-tasks">
                        <div class="welcome-card-header">
                            <span class="card-icon">📋</span>
                            <span class="card-title">Task Manager</span>
                        </div>
                        <div class="card-desc">Manage background tasks, schedules & recurring workflows</div>
                    </div>
                    <div class="welcome-card" data-action="open-agents">
                        <div class="welcome-card-header">
                            <span class="card-icon">🤖</span>
                            <span class="card-title">Agents Hub</span>
                        </div>
                        <div class="card-desc">Select or configure specialized AI agent personalities</div>
                    </div>
                    <div class="welcome-card" data-prompt="Generate an image: ">
                        <div class="welcome-card-header">
                            <span class="card-icon">🎨</span>
                            <span class="card-title">AI Image Generation</span>
                        </div>
                        <div class="card-desc">Create artwork, illustrations & visual assets with AI</div>
                    </div>
                    <div class="welcome-card" data-prompt="Create a structured report and save it to files for ">
                        <div class="welcome-card-header">
                            <span class="card-icon">📄</span>
                            <span class="card-title">Docs & Reports</span>
                        </div>
                        <div class="card-desc">Generate Markdown, PDF & office documents</div>
                    </div>
                </div>
            </div>
        `;

        const welcomeCards = this.chatMessages.querySelectorAll('.welcome-card');
        welcomeCards.forEach(card => {
            card.addEventListener('click', () => {
                const promptText = card.dataset.prompt;
                const action = card.dataset.action;
                if (promptText) {
                    this.messageInput.value = promptText;
                    this.messageInput.focus();
                    this.messageInput.style.height = 'auto';
                    this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
                } else if (action === 'open-tasks') {
                    window.location.href = '/tasks';
                } else if (action === 'open-agents') {
                    this.showAgentsView();
                }
            });
        });
    }

    addSystemMessage(title, subtitle, content, isDone = false, icon = '⚙️') {
        this.removeWelcomeState();
        const messageDiv = document.createElement('div');
        messageDiv.className = `message system`;
        messageDiv.style.alignSelf = 'flex-start';
        messageDiv.style.maxWidth = '90%';

        const bgColor = isDone ? 'rgba(0, 255, 136, 0.04)' : 'rgba(0, 255, 255, 0.04)';
        const borderColor = isDone ? 'var(--cyber-primary)' : 'var(--cyber-secondary)';

        if (subtitle || content) {
            messageDiv.innerHTML = `
                <details style="background: ${bgColor}; border: 1px dashed ${borderColor}; padding: 8px 12px; border-radius: 4px; font-family: var(--font-mono); font-size: 12px; line-height: 1.5; color: ${borderColor}; box-shadow: 0 0 5px ${bgColor}; width: 100%;">
                    <summary style="font-weight: bold; cursor: pointer; outline: none; user-select: none;">${icon} [SYSTEM] ${title}</summary>
                    <div style="margin-top: 8px; border-top: 1px dashed ${borderColor}; padding-top: 8px;">
                        ${subtitle ? `<div style="opacity: 0.8; font-size: 11px; margin-bottom: 4px;">${subtitle}</div>` : ''}
                        ${content ? `<pre style="margin: 5px 0 0 0; white-space: pre-wrap; font-size: 11px; opacity: 0.7; overflow-x: auto; max-height: 250px; background: rgba(0,0,0,0.2); padding: 5px; border-radius: 2px;">${content}</pre>` : ''}
                    </div>
                </details>
            `;
        } else {
            messageDiv.innerHTML = `
                <div style="background: ${bgColor}; border: 1px dashed ${borderColor}; padding: 8px 12px; border-radius: 4px; font-family: var(--font-mono); font-size: 12px; line-height: 1.5; color: ${borderColor}; box-shadow: 0 0 5px ${bgColor}; width: 100%; font-weight: bold;">
                    ${icon} [SYSTEM] ${title}
                </div>
            `;
        }

        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    addMessage(content, type, reasoning = null) {
        this.removeWelcomeState();
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        let displayContent = '';
        const escapeHtml = (text) => {
            if (!text) return '';
            return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        if (Array.isArray(content)) {
            let text = '';
            let imagesHtml = '';
            content.forEach(item => {
                if (item.type === 'text') {
                    text += item.text;
                } else if (item.type === 'image_url' && item.image_url) {
                    imagesHtml += `<div class="message-image-container"><a href="${item.image_url.url}" target="_blank"><img src="${item.image_url.url}" class="chat-message-image" alt="Uploaded Image" /></a></div>`;
                }
            });
            const parsedText = type === 'agent' ? marked.parse(text) : escapeHtml(text).replace(/\n/g, '<br>');
            displayContent = `${imagesHtml}<div>${parsedText}</div>`;
        } else if (typeof content === 'string') {
            if (content.startsWith('[')) {
                try {
                    const parsed = JSON.parse(content);
                    this.addMessage(parsed, type, reasoning);
                    return;
                } catch (e) {
                    // fallback
                }
            }
            let processedContent = content;
            if (type === 'agent') {
                const storagePathRegex = /`?(\/?storage[/\\](?:generated|images)[/\\][a-zA-Z0-9._-]+\.(?:png|jpg|jpeg|webp))`?/gi;
                processedContent = processedContent.replace(storagePathRegex, (match, pathGroup, offset) => {
                    let cleanPath = pathGroup.replace(/\\/g, '/');
                    if (!cleanPath.startsWith('/')) {
                        cleanPath = '/' + cleanPath;
                    }
                    if (offset > 0) {
                        const before = processedContent.substring(Math.max(0, offset - 3), offset);
                        if (before.includes('](') || before.includes('![')) {
                            return cleanPath;
                        }
                    }
                    return `![Generated Image](${cleanPath})`;
                });
            }
            displayContent = type === 'agent' ? marked.parse(processedContent) : escapeHtml(content).replace(/\n/g, '<br>');
        }

        let reasoningHtml = '';
        if (reasoning && type === 'agent') {
            reasoningHtml = `
                <div class="reasoning-box">
                    <div class="reasoning-title">NEURAL_REASONING</div>
                    <div class="reasoning-content">${marked.parse(reasoning)}</div>
                </div>
            `;
        }

        messageDiv.innerHTML = `
            <div class="message-box">
                <div class="message-content">
                    ${displayContent}
                    ${reasoningHtml}
                </div>
            </div>
        `;

        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    showTyping() {
        this.typingIndicator.classList.add('active');
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        if (window.robotPet) {
            window.robotPet.toThinking();
        }
    }

    hideTyping() {
        this.typingIndicator.classList.remove('active');
    }

    async loadAgents() {
        try {
            const response = await fetch('/api/agents', {
                method: 'GET',
            });

            if (!response.ok) {
                console.error('Failed to load agents:', response.status);
                return;
            }

            const data = await response.json();
            console.log('Agents data:', data);

            if (this.agentsGridContainer && data.agents && Array.isArray(data.agents)) {
                this.agentsGridContainer.innerHTML = '';
                data.agents.forEach(agentId => {
                    const card = document.createElement('div');
                    const isCurrent = (agentId === this.activeAgentId);
                    card.className = `agent-card ${isCurrent ? 'active' : ''}`;

                    const nameFormatted = agentId.replace(/_/g, ' ').toUpperCase();
                    let icon = '🤖';
                    if (agentId.includes('coder') || agentId.includes('developer') || agentId.includes('code')) icon = '💻';
                    else if (agentId.includes('search') || agentId.includes('scrape') || agentId.includes('web')) icon = '🕸️';
                    else if (agentId.includes('writer') || agentId.includes('doc') || agentId.includes('pdf')) icon = '📄';
                    else if (agentId.includes('art') || agentId.includes('image')) icon = '🎨';

                    const isMainAgent = agentId === 'main_agent';

                    card.innerHTML = `
                        <div>
                            <div class="agent-card-header">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 26px;">${icon}</span>
                                    <div>
                                        <div class="agent-card-title">${nameFormatted}</div>
                                        <div class="agent-card-id">ID: ${agentId}</div>
                                    </div>
                                </div>
                                ${isCurrent ? '<span class="cyber-tag--cyan">ACTIVE</span>' : ''}
                            </div>
                            <div class="agent-card-body">
                                ${isMainAgent ? 'Default primary assistant with full multi-tool execution capabilities.' : 'Custom specialized AI Agent personality and custom skills configuration.'}
                            </div>
                        </div>
                        <div class="agent-card-actions">
                            <button class="cyber-btn cyber-btn--green btn-start-agent-chat" data-agent-id="${agentId}" style="flex: 2; font-size: 11px; padding: 6px 10px;">
                                ⚡ START CHAT
                            </button>
                            <button class="cyber-btn btn-edit-agent" data-agent-id="${agentId}" style="flex: 1; font-size: 11px; padding: 6px 8px;">
                                ✏️ EDIT
                            </button>
                            ${!isMainAgent ? `
                                <button class="cyber-btn cyber-btn--magenta btn-delete-agent" data-agent-id="${agentId}" style="flex: 1; font-size: 11px; padding: 6px 8px;">
                                    🗑️ DELETE
                                </button>
                            ` : ''}
                        </div>
                    `;

                    card.querySelector('.btn-start-agent-chat').addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.startChatWithAgent(agentId);
                    });

                    card.querySelector('.btn-edit-agent').addEventListener('click', (e) => {
                        e.stopPropagation();
                        window.location.href = `/edit-agent/${agentId}`;
                    });

                    const deleteBtn = card.querySelector('.btn-delete-agent');
                    if (deleteBtn) {
                        deleteBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.deleteAgent(agentId);
                        });
                    }

                    this.agentsGridContainer.appendChild(card);
                });
            }
        } catch (error) {
            console.error('Error loading agents:', error);
        }
    }

    async getHistory() {
        if (!this.sessionId) {
            console.log('No sessionId, skipping history load');
            return;
        }

        try {
            const response = await fetch('/api/chat/get_history', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: '',
                    sessionId: this.sessionId,
                }),
            });

            if (!response.ok) {
                console.error('Failed to get history:', response.status);
                return;
            }

            const data = await response.json();
            console.log('History data:', data);

            let addedCount = 0;
            if (data.history && Array.isArray(data.history)) {
                data.history.forEach(message => {
                    if (message.role === 'tool') return;
                    if (message.role === 'assistant') {
                        if (!message.content && !message.reasoning) return;
                        this.addMessage(message.content, 'agent', message.reasoning);
                        addedCount++;
                    } else if (message.role === 'user') {
                        this.addMessage(message.content, 'user');
                        addedCount++;
                    }
                });
            }

            if (addedCount === 0) {
                this.renderWelcomeState();
            }

            return data.history;
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }

    async getSessions() {
        try {
            const response = await fetch('/api/sessions', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                console.error('Failed to get sessions:', response.status);
                return;
            }

            const data = await response.json();
            console.log('Sessions data:', data);

            // Очищаем список перед добавлением
            this.sessionsList.innerHTML = '';

            if (data.sessions && Array.isArray(data.sessions)) {
                data.sessions.forEach(session => {
                    const isCurrentSession = session.id === this.sessionId;
                    const sessionDiv = document.createElement('div');
                    sessionDiv.className = `session-item ${isCurrentSession ? 'active' : ''}`;
                    sessionDiv.dataset.sessionId = session.id;

                    const date = new Date(session.created_at).toLocaleString('ru-RU');
                    const hasCustomTitle = session.title && session.title.trim() !== '' && !session.title.startsWith('session_');
                    const displayTitle = hasCustomTitle ? session.title : '';

                    sessionDiv.innerHTML = `
                        <div class="session-info" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <div style="flex: 1; min-width: 0; cursor: pointer;">
                                <div class="session-time">[${date}]</div>
                                <div class="session-id" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${hasCustomTitle ? session.title : 'Click ✏️ to rename session'}">${displayTitle}</div>
                            </div>
                            <div style="display: flex; gap: 4px; align-items: center; margin-left: 10px;">
                                <button class="session-rename cyber-btn" data-session-id="${session.id}" title="RENAME SESSION" style="padding: 2px 6px; font-size: 11px;">✏️</button>
                                <button class="session-delete cyber-btn cyber-btn--magenta" data-session-id="${session.id}" title="PURGE SESSION" style="padding: 2px 6px; font-size: 11px;">×</button>
                            </div>
                        </div>`;

                    // Клик по сессии для переключения
                    sessionDiv.addEventListener('click', (e) => {
                        if (!e.target.classList.contains('session-delete') && !e.target.classList.contains('session-rename')) {
                            this.switchSession(session.id);
                        }
                    });

                    // Клик по кнопке переименования
                    const renameBtn = sessionDiv.querySelector('.session-rename');
                    renameBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.renameSession(session.id, session.title || '');
                    });

                    // Клик по кнопке удаления
                    const deleteBtn = sessionDiv.querySelector('.session-delete');
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deleteSession(session.id);
                    });

                    this.sessionsList.appendChild(sessionDiv);
                });
            }

            return data.sessions;
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    }

    async clearChat() {
        if (!confirm('Are you sure you want to clear the chat history? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch('/api/chat/clear_history', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sessionId: this.sessionId }),
            });

            const data = await response.json();
            if (!data.success) {
                throw new Error('Failed to clear chat');
            }

            this.chatMessages.innerHTML = '';
            this.renderWelcomeState();
        } catch (error) {
            console.error('Clear chat error:', error);
            alert('Failed to clear chat history. Please try again.');
        }
    }

    async clearMemory() {
        if (!confirm('Are you sure you want to clear all memory? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch('/api/memory/clear', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            });

            const data = await response.json();
            if (!data.success) {
                throw new Error('Failed to clear memory');
            }

            alert('Memory cleared successfully!');
        } catch (error) {
            console.error('Memory clear error:', error);
            alert('Failed to clear memory. Please try again.');
        }
    }

    async createAgent() {
        const rawInput = prompt('Enter a name for the new agent (e.g. "Coding Expert" or "code_reviewer"):');
        if (rawInput === null) return; // Cancelled

        let cleanedId = rawInput
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_')           // Automatically convert spaces to underscores
            .replace(/[^a-z0-9_-]/g, '');    // Remove unsupported special characters

        if (!cleanedId) {
            alert('Agent ID cannot be empty or contain only invalid characters.');
            return;
        }

        try {
            const response = await fetch('/api/agents/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ agentId: cleanedId }),
            });

            const data = await response.json();
            if (data.success) {
                alert(`Agent "${cleanedId}" successfully created!`);
                await this.loadAgents();
            } else {
                throw new Error(data.message || 'Failed to create agent');
            }
        } catch (error) {
            console.error('Create agent error:', error);
            alert(`Error creating agent: ${error.message}`);
        }
    }

    async deleteAgent(targetAgentId) {
        const selectedAgent = targetAgentId;
        if (!selectedAgent) return;

        if (selectedAgent === 'main_agent') {
            alert('Cannot delete the default "main_agent".');
            return;
        }

        const confirmMsg = `Are you sure you want to delete agent "${selectedAgent}"?\n\nThis will permanently delete all its prompt files on the server.\nAny chat sessions currently using this agent will be reverted to "main_agent".`;
        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            const response = await fetch(`/api/agents/${selectedAgent}`, {
                method: 'DELETE',
            });

            const data = await response.json();
            if (data.success) {
                alert(`Agent "${selectedAgent}" deleted successfully.`);
                if (this.activeAgentId === selectedAgent) {
                    this.activeAgentId = 'main_agent';
                }
                await this.loadAgents();
                await this.getSessions();
                await this.getHistory();
            } else {
                throw new Error(data.message || 'Failed to delete agent');
            }
        } catch (error) {
            console.error('Delete agent error:', error);
            alert(`Error deleting agent: ${error.message}`);
        }
    }

    async renameSession(sessionId, currentTitle) {
        const newTitle = prompt('Enter new session title:', currentTitle);
        if (newTitle === null) return; // Cancelled

        const trimmed = newTitle.trim();
        if (!trimmed) {
            alert('Session title cannot be empty.');
            return;
        }

        try {
            const response = await fetch(`/api/sessions/${sessionId}/title`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ title: trimmed }),
            });
            const data = await response.json();
            if (data.success) {
                await this.getSessions();
            } else {
                alert(`Error: ${data.message}`);
            }
        } catch (error) {
            console.error('Error renaming session:', error);
            alert('Failed to rename session.');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new AIAgentChat();
});
