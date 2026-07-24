/**
 * PAIAgent Global Theme Management Module
 * Supports switching between 'dark' and 'light' themes.
 * Persists user preference in localStorage and handles non-FOUC initialization.
 */

(function () {
    const STORAGE_KEY = 'paia_theme';
    const DEFAULT_THEME = 'dark';

    function getSavedTheme() {
        try {
            return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
        } catch (e) {
            return DEFAULT_THEME;
        }
    }

    function applyTheme(themeName) {
        document.documentElement.setAttribute('data-theme', themeName);
    }

    // Apply theme immediately to prevent Flash Of Unstyled Content (FOUC)
    const currentTheme = getSavedTheme();
    applyTheme(currentTheme);

    window.PAIA_Theme = {
        get: getSavedTheme,
        set: function (themeName) {
            applyTheme(themeName);
            try {
                localStorage.setItem(STORAGE_KEY, themeName);
            } catch (e) {
                console.warn('Unable to save theme to localStorage:', e);
            }

            // Sync all theme dropdowns and button states on the page
            document.querySelectorAll('.cyber-theme-select').forEach(select => {
                if (select.value !== themeName) {
                    select.value = themeName;
                }
            });

            document.querySelectorAll('[data-theme-btn]').forEach(btn => {
                const btnTheme = btn.getAttribute('data-theme-btn');
                if (btnTheme === themeName) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // Dispatch global event for other components
            window.dispatchEvent(new CustomEvent('themechanged', { detail: { theme: themeName } }));
        },
        init: function () {
            const theme = this.get();
            applyTheme(theme);

            // Bind elements after DOM is ready
            document.addEventListener('DOMContentLoaded', () => {
                document.querySelectorAll('.cyber-theme-select').forEach(select => {
                    select.value = theme;
                    select.addEventListener('change', (e) => {
                        this.set(e.target.value);
                    });
                });

                document.querySelectorAll('[data-theme-btn]').forEach(btn => {
                    const btnTheme = btn.getAttribute('data-theme-btn');
                    if (btnTheme === theme) {
                        btn.classList.add('active');
                    }
                    btn.addEventListener('click', () => {
                        this.set(btnTheme);
                    });
                });
            });
        }
    };

    window.PAIA_Theme.init();
})();
