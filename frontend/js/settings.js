class SystemSettings {
    constructor() {
        this.btnBackToChat = document.getElementById('btnBackToChat');
        this.btnSaveSettings = document.getElementById('btnSaveSettings');
        this.setupWarningAlert = document.getElementById('setupWarningAlert');

        this.settingsAiApiKey = document.getElementById('settingsAiApiKey');
        this.settingsAiProvider = document.getElementById('settingsAiProvider');
        this.settingsAiApiUrl = document.getElementById('settingsAiApiUrl');
        this.settingsAiModelSelect = document.getElementById('settingsAiModelSelect');
        this.settingsAiDefaultModel = document.getElementById('settingsAiDefaultModel');
        this.settingsTelegramToken = document.getElementById('settingsTelegramToken');
        this.settingsAllowedTelegramUserIds = document.getElementById('settingsAllowedTelegramUserIds');
        this.settingsAppUser = document.getElementById('settingsAppUser');
        this.settingsAppPassword = document.getElementById('settingsAppPassword');
        this.settingsTogetherApiKey = document.getElementById('settingsTogetherApiKey');
        this.settingsTogetherImageModel = document.getElementById('settingsTogetherImageModel');
        this.settingsXaiApiKey = document.getElementById('settingsXaiApiKey');

        this.providers = [];
        this.openRouterModels = [];

        this.init();
    }

    init() {
        if (this.btnBackToChat) {
            this.btnBackToChat.addEventListener('click', () => {
                window.location.href = '/';
            });
        }
        if (this.btnSaveSettings) {
            this.btnSaveSettings.addEventListener('click', () => this.saveSettings());
        }
        if (this.settingsAiProvider) {
            this.settingsAiProvider.addEventListener('change', (e) => this.onProviderChange(e.target.value));
        }
        if (this.settingsAiApiUrl) {
            this.settingsAiApiUrl.addEventListener('input', () => this.syncProviderSelectFromUrl());
        }
        if (this.settingsAiModelSelect) {
            this.settingsAiModelSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val) {
                    this.settingsAiDefaultModel.value = val;
                    this.updatePriceBadgeForModel(val);
                }
            });
        }
        if (this.settingsAiDefaultModel) {
            this.settingsAiDefaultModel.addEventListener('input', () => {
                const val = this.settingsAiDefaultModel.value.trim();
                if (this.settingsAiModelSelect && Array.from(this.settingsAiModelSelect.options).some(o => o.value === val)) {
                    this.settingsAiModelSelect.value = val;
                } else if (this.settingsAiModelSelect) {
                    this.settingsAiModelSelect.value = '';
                }
                this.updatePriceBadgeForModel(val);
            });
        }

        // Load existing settings and check status
        this.loadSettings();
    }

    async loadSettings() {
        try {
            const response = await fetch('/api/settings');
            if (response.ok) {
                const settings = await response.json();

                this.providers = settings.providers || [];
                this.renderProviderOptions();

                // Show warning alert if key is missing
                if (!settings.hasAiApiKey) {
                    if (this.setupWarningAlert) this.setupWarningAlert.style.display = 'block';
                } else {
                    if (this.setupWarningAlert) this.setupWarningAlert.style.display = 'none';
                }

                // Set placeholders and values
                this.settingsAiApiUrl.value = settings.aiApiUrl || '';
                this.settingsAiDefaultModel.value = settings.aiDefaultModel || 'qwen/qwen3.7-flash';

                this.syncProviderSelectFromUrl();

                this.settingsAiApiKey.value = '';
                this.settingsAiApiKey.placeholder = settings.hasAiApiKey ? '****** (configured)' : 'Enter API Key';

                this.settingsTelegramToken.value = '';
                this.settingsTelegramToken.placeholder = settings.hasTelegramBotToken ? '****** (configured)' : 'Enter Telegram Bot Token';

                this.settingsAllowedTelegramUserIds.value = settings.allowedTelegramUserIds || '';
                this.settingsAppUser.value = settings.appUser || 'admin';

                this.settingsAppPassword.value = '';
                this.settingsAppPassword.placeholder = settings.hasAppPassword ? '****** (configured)' : 'Enter Password to enable Web Auth';

                this.settingsTogetherApiKey.value = '';
                this.settingsTogetherApiKey.placeholder = settings.hasTogetherApiKey ? '****** (configured)' : 'Enter Together AI API Key';

                if (this.settingsTogetherImageModel) {
                    this.settingsTogetherImageModel.value = settings.togetherImageModel || 'black-forest-labs/FLUX.2-dev';
                }

                this.settingsXaiApiKey.value = '';
                this.settingsXaiApiKey.placeholder = settings.hasXaiApiKey ? '****** (configured)' : 'Enter X.AI API Key';

                // Asynchronously fetch live OpenRouter models & pricing
                this.loadOpenRouterModels();
            }
        } catch (err) {
            console.error('Error loading settings:', err);
            alert('Failed to load system configuration.');
        }
    }

    async loadOpenRouterModels() {
        try {
            const response = await fetch('/api/ai/openrouter-models');
            if (response.ok) {
                const data = await response.json();
                if (data.success && Array.isArray(data.models)) {
                    this.openRouterModels = data.models;
                    this.renderOpenRouterModelSelect();
                    this.updatePriceBadgeForModel(this.settingsAiDefaultModel.value.trim());
                }
            }
        } catch (err) {
            console.warn('Failed to load live OpenRouter models:', err);
        }
    }

    toggleModelSelectVisibility(show) {
        if (!this.settingsAiModelSelect) return;
        if (window.jQuery && $.fn.select2) {
            const $select = $(this.settingsAiModelSelect);
            if (show) {
                $select.next('.select2-container').show();
            } else {
                $select.next('.select2-container').hide();
            }
        } else {
            this.settingsAiModelSelect.style.display = show ? 'block' : 'none';
        }
    }

    renderOpenRouterModelSelect() {
        if (!this.settingsAiModelSelect) return;

        const currentModel = (this.settingsAiDefaultModel.value || '').trim();

        if (window.jQuery && $.fn.select2 && $(this.settingsAiModelSelect).data('select2')) {
            $(this.settingsAiModelSelect).select2('destroy');
        }

        this.settingsAiModelSelect.innerHTML = '<option value="">-- Search 200+ OpenRouter models --</option>';

        this.openRouterModels.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.name || m.id} [${m.formattedPrice}]`.trim();
            this.settingsAiModelSelect.appendChild(opt);
        });

        if (currentModel && this.openRouterModels.some(m => m.id === currentModel)) {
            this.settingsAiModelSelect.value = currentModel;
        }

        const isOpenRouter = this.settingsAiProvider && this.settingsAiProvider.value === 'openrouter';

        if (window.jQuery && $.fn.select2) {
            const $select = $(this.settingsAiModelSelect);
            $select.select2({
                placeholder: 'Search 200+ OpenRouter models...',
                allowClear: true,
                width: '100%'
            });

            $select.off('change.select2').on('change.select2', (e) => {
                const val = e.target.value;
                if (val) {
                    this.settingsAiDefaultModel.value = val;
                    this.updatePriceBadgeForModel(val);
                }
            });

            this.toggleModelSelectVisibility(isOpenRouter);
        } else {
            this.settingsAiModelSelect.style.display = isOpenRouter ? 'block' : 'none';
        }
    }

    updatePriceBadgeForModel(modelId) {
        if (!this.aiModelPriceBadge) return;
        if (!modelId) {
            this.aiModelPriceBadge.style.display = 'none';
            return;
        }

        const modelInfo = this.openRouterModels.find(m => m.id === modelId);
        if (modelInfo) {
            this.aiModelPriceBadge.style.display = 'block';
            const ctxStr = modelInfo.context_length ? ` | <b>Context:</b> ${Math.round(modelInfo.context_length / 1024)}k` : '';
            if (modelInfo.isFree) {
                this.aiModelPriceBadge.innerHTML = `🎁 <b>Price:</b> FREE model${ctxStr}`;
            } else {
                const formatPrice = (num) => parseFloat(num.toFixed(4)).toString();
                this.aiModelPriceBadge.innerHTML = `💰 <b>Pricing (per 1M tokens):</b> Prompt: $${formatPrice(modelInfo.promptPricePerM)} | Comp: $${formatPrice(modelInfo.completionPricePerM)}${ctxStr}`;
            }
        } else {
            this.aiModelPriceBadge.style.display = 'none';
        }
    }

    renderProviderOptions() {
        if (!this.settingsAiProvider) return;
        this.settingsAiProvider.innerHTML = '';
        this.providers.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name;
            this.settingsAiProvider.appendChild(option);
        });
    }

    onProviderChange(providerId) {
        const selected = this.providers.find(p => p.id === providerId);
        if (!selected) return;

        if (selected.id !== 'custom') {
            if (selected.baseUrl) {
                this.settingsAiApiUrl.value = selected.baseUrl;
            }
            if (selected.defaultModel) {
                this.settingsAiDefaultModel.value = selected.defaultModel;
            }
        }

        const isOpenRouter = providerId === 'openrouter';
        if (isOpenRouter) {
            if (this.openRouterModels.length > 0) {
                this.renderOpenRouterModelSelect();
            } else {
                this.loadOpenRouterModels();
            }
        }
        this.toggleModelSelectVisibility(isOpenRouter);

        this.updatePriceBadgeForModel(this.settingsAiDefaultModel.value.trim());
    }

    syncProviderSelectFromUrl() {
        if (!this.settingsAiProvider || !this.providers.length) return;
        const currentUrl = (this.settingsAiApiUrl.value || '').trim();
        const matched = this.providers.find(p => p.id !== 'custom' && p.baseUrl === currentUrl);
        const isOpenRouter = matched && matched.id === 'openrouter';
        if (matched) {
            this.settingsAiProvider.value = matched.id;
        } else {
            this.settingsAiProvider.value = 'custom';
        }
        this.toggleModelSelectVisibility(isOpenRouter);
        this.updatePriceBadgeForModel(this.settingsAiDefaultModel.value.trim());
    }

    async saveSettings() {
        if (this.settingsAiApiUrl) this.settingsAiApiUrl.style.borderColor = '';

        const aiApiKey = this.settingsAiApiKey.value.trim();
        const aiApiUrl = this.settingsAiApiUrl.value.trim();
        const aiDefaultModel = this.settingsAiDefaultModel.value.trim();
        const telegramBotToken = this.settingsTelegramToken.value.trim();
        const allowedTelegramUserIds = this.settingsAllowedTelegramUserIds.value.trim();
        const appUser = this.settingsAppUser.value.trim();
        const appPassword = this.settingsAppPassword.value.trim();
        const togetherApiKey = this.settingsTogetherApiKey.value.trim();
        const togetherImageModel = this.settingsTogetherImageModel ? this.settingsTogetherImageModel.value.trim() : '';
        const xaiApiKey = this.settingsXaiApiKey.value.trim();

        // Validate required field: AI API URL
        if (aiApiUrl === '') {
            if (this.settingsAiApiUrl) {
                this.settingsAiApiUrl.style.borderColor = '#ff4444';
                this.settingsAiApiUrl.focus();
            }
            alert('⚠️ Validation Error: AI API URL is required!');
            return;
        }

        const payload = {};
        if (aiApiKey !== '') payload.aiApiKey = aiApiKey === '-' ? '' : aiApiKey;
        if (aiApiUrl !== '') payload.aiApiUrl = aiApiUrl;
        if (aiDefaultModel !== '') payload.aiDefaultModel = aiDefaultModel;
        if (telegramBotToken !== '') payload.telegramBotToken = telegramBotToken === '-' ? '' : telegramBotToken;
        if (allowedTelegramUserIds !== '') payload.allowedTelegramUserIds = allowedTelegramUserIds;
        if (appUser !== '') payload.appUser = appUser;
        if (appPassword !== '') payload.appPassword = appPassword === '-' ? '' : appPassword;
        if (togetherApiKey !== '') payload.togetherApiKey = togetherApiKey === '-' ? '' : togetherApiKey;
        if (togetherImageModel !== '') payload.togetherImageModel = togetherImageModel;
        if (xaiApiKey !== '') payload.xaiApiKey = xaiApiKey === '-' ? '' : xaiApiKey;

        // If no changes made in input fields, redirect to chat
        if (Object.keys(payload).length === 0) {
            window.location.href = '/';
            return;
        }

        this.btnSaveSettings.disabled = true;
        this.btnSaveSettings.textContent = 'SAVING...';

        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();
            if (data.success) {
                alert('Configuration saved successfully!');
                window.location.href = '/'; // Go back to main chat
            } else {
                throw new Error(data.message || 'Failed to save settings');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            alert(`Error saving configuration: ${error.message}`);
        } finally {
            this.btnSaveSettings.disabled = false;
            this.btnSaveSettings.textContent = 'SAVE CONFIG';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.systemSettings = new SystemSettings();
});
