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
        this.agentSelector = document.getElementById('agentSelector');
        this.btnEditAgent = document.getElementById('btnEditAgent');
        this.btnCreateAgent = document.getElementById('btnCreateAgent');
        this.btnDeleteAgent = document.getElementById('btnDeleteAgent');

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
        if (this.btnEditAgent) {
            this.btnEditAgent.addEventListener('click', () => {
                const selectedAgent = this.agentSelector.value;
                if (selectedAgent) {
                    window.location.href = `/edit-agent/${selectedAgent}`;
                } else {
                    alert('Please select an agent first.');
                }
            });
        }
        if (this.btnCreateAgent) {
            this.btnCreateAgent.addEventListener('click', () => this.createAgent());
        }
        if (this.btnDeleteAgent) {
            this.btnDeleteAgent.addEventListener('click', () => this.deleteAgent());
        }
        this.initializeServices();

        // Ждем загрузки истории и сессий
        await this.loadAgents();
        await this.getHistory();
        await this.getSessions();
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
            console.log('Current session:', this.sessionId);
        } catch (error) {
            console.error('Failed to get current session:', error);
        }
    }

    async createNewChat() {
        try {
            const agentId = this.agentSelector.value;
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
                this.getHistory();
                this.getSessions();
            }
        } catch (error) {
            console.error('Failed to create new chat:', error);
        }
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
                this.chatMessages.innerHTML = '';
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

            // Redirect to setup settings page if main AI key is missing
            const settingsResponse = await fetch('/api/settings');
            if (settingsResponse.ok) {
                const settings = await settingsResponse.json();
                if (!settings.hasAiApiKey) {
                    window.location.href = '/settings';
                }
            }

        } catch (error) {
            this.updateStatus('CONNECTION FAILED');
        }
    }

    updateStatus(response) {
        console.log('Status:', response);
        if (response.status === 200) {
            this.statusElement.textContent = 'ONLINE :: READY';
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

    addSystemMessage(title, subtitle, content, isDone = false, icon = '⚙️') {
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

            if (data.agents && Array.isArray(data.agents)) {
                this.agentSelector.innerHTML = '';
                data.agents.forEach(agent => {
                    const option = document.createElement('option');
                    option.value = agent;
                    option.textContent = agent.replace('_', ' ').toUpperCase();
                    this.agentSelector.appendChild(option);
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

            if (data.history && Array.isArray(data.history)) {
                data.history.forEach(message => {
                    if (message.role === 'tool') return;
                    if (message.role === 'assistant') {
                        if (!message.content && !message.reasoning) return;
                        this.addMessage(message.content, 'agent', message.reasoning);
                    } else if (message.role === 'user') {
                        this.addMessage(message.content, 'user');
                    }
                });
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
                    const displayTitle = session.title ? session.title : (session.id.substring(0, 20) + '...');

                    sessionDiv.innerHTML = `
                        <div class="session-info" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <div style="flex: 1; min-width: 0; cursor: pointer;">
                                <div class="session-time">[${date}]</div>
                                <div class="session-id" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${session.title || session.id}">${displayTitle}</div>
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
        const agentId = prompt('Enter a unique ID for the new agent (e.g. coding_expert). Only letters, numbers, dashes and underscores are allowed:');
        if (agentId === null) return; // Cancelled
        
        const trimmedId = agentId.trim().toLowerCase();
        if (!trimmedId) {
            alert('Agent ID cannot be empty.');
            return;
        }

        // Validate agent ID format
        const validFormat = /^[a-z0-9_-]+$/;
        if (!validFormat.test(trimmedId)) {
            alert('Invalid Agent ID. Only lowercase letters, numbers, dashes (-) and underscores (_) are allowed.');
            return;
        }

        try {
            const response = await fetch('/api/agents/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ agentId: trimmedId }),
            });

            const data = await response.json();
            if (data.success) {
                alert(`Agent "${trimmedId}" successfully created!`);
                await this.loadAgents();
                this.agentSelector.value = trimmedId;
            } else {
                throw new Error(data.message || 'Failed to create agent');
            }
        } catch (error) {
            console.error('Create agent error:', error);
            alert(`Error creating agent: ${error.message}`);
        }
    }

    async deleteAgent() {
        const selectedAgent = this.agentSelector.value;
        if (!selectedAgent) {
            alert('Please select an agent to delete.');
            return;
        }

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
                
                // Reload agent list
                await this.loadAgents();
                
                // Default back to main_agent
                this.agentSelector.value = 'main_agent';

                // Reload sessions and history to make sure database updates are synchronized on frontend
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
