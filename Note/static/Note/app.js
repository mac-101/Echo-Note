document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.querySelector('#search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && searchInput.value) {
                searchInput.value = '';
                searchInput.form.submit();
            }
        });
    }
    const root = document.documentElement;
    const themeToggles = document.querySelectorAll('[data-theme-toggle]');
    const savedTheme = localStorage.getItem('notes-theme');

    if (savedTheme) root.dataset.theme = savedTheme;
    if (themeToggles.length) {
        const updateThemeLabel = () => {
            const light = root.dataset.theme === 'light';
            themeToggles.forEach((themeToggle) => {
                themeToggle.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
                themeToggle.querySelector('span').textContent = light ? '☾' : '☼';
            });
        };
        updateThemeLabel();
        themeToggles.forEach((themeToggle) => themeToggle.addEventListener('click', () => {
                const nextTheme = root.dataset.theme === 'light' ? 'dark' : 'light';
                if (nextTheme === 'dark') delete root.dataset.theme;
                else root.dataset.theme = nextTheme;
                localStorage.setItem('notes-theme', nextTheme);
                updateThemeLabel();
            }));
    }

    const searchButton = document.querySelector('.search-button');
    const searchForm = document.querySelector('.search-popover');
    if (searchButton && searchForm) {
        searchButton.addEventListener('click', () => {
            searchForm.classList.toggle('is-visible');
            if (searchForm.classList.contains('is-visible')) searchInput.focus();
        });
    }

    const importInput = document.querySelector('#note-import');
    const contentInput = document.querySelector('.content-field textarea');
    if (importInput && contentInput) {
        importInput.addEventListener('change', () => {
            const file = importInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                contentInput.value = reader.result;
                contentInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
            reader.readAsText(file);
        });
    }
});