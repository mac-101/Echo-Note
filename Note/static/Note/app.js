const NOTES_STORAGE_KEY = 'notes_storage_notes';
const NOTES_STORAGE_VERSION_KEY = 'notes_storage_version';
const NOTES_STORAGE_VERSION = 1;

class NoteStorage {
    getNotes() {
        const rawNotes = localStorage.getItem(NOTES_STORAGE_KEY);
        if (!rawNotes) return [];

        const notes = JSON.parse(rawNotes);
        if (!Array.isArray(notes)) throw new Error('Saved notes have an invalid format.');
        return notes;
    }

    saveNotes(notes) {
        if (!Array.isArray(notes)) throw new Error('Notes must be stored as a list.');
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
        return notes;
    }

    getNote(noteId) {
        return this.getNotes().find((note) => String(note.id) === String(noteId)) || null;
    }

    createNote(title, content) {
        const now = new Date().toISOString();
        const randomId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const note = {
            id: `local-${randomId}`,
            title: title.trim(),
            content,
            created_at: now,
            updated_at: now,
            pinned: false,
        };
        this.saveNotes([note, ...this.getNotes()]);
        return note;
    }

    updateNote(noteId, title, content) {
        const notes = this.getNotes();
        const note = notes.find((item) => String(item.id) === String(noteId));
        if (!note) throw new Error('That note no longer exists.');
        note.title = title.trim();
        note.content = content;
        note.updated_at = new Date().toISOString();
        this.saveNotes(notes);
        return note;
    }

    deleteNote(noteId) {
        this.saveNotes(this.getNotes().filter((note) => String(note.id) !== String(noteId)));
    }

    togglePinned(noteId) {
        const notes = this.getNotes();
        const note = notes.find((item) => String(item.id) === String(noteId));
        if (!note) throw new Error('That note no longer exists.');
        note.pinned = !note.pinned;
        note.updated_at = new Date().toISOString();
        this.saveNotes(notes);
        return note;
    }

    async migrate() {
        const version = Number(localStorage.getItem(NOTES_STORAGE_VERSION_KEY) || 0);
        if (version >= NOTES_STORAGE_VERSION) return { migrated: false, imported: 0 };

        const existingNotes = this.getNotes();
        const response = await fetch('/notes/migration-data/', { cache: 'no-store' });
        if (!response.ok) throw new Error('The existing notes could not be loaded for migration.');
        const payload = await response.json();
        if (!payload || payload.version !== NOTES_STORAGE_VERSION || !Array.isArray(payload.notes)) {
            throw new Error('The migration data has an invalid format.');
        }

        const existingIds = new Set(existingNotes.map((note) => String(note.id)));
        const migratedNotes = payload.notes
            .map((note) => this.normalizeNote(note))
            .filter((note) => {
                if (existingIds.has(String(note.id))) return false;
                existingIds.add(String(note.id));
                return true;
            });

        this.saveNotes([...existingNotes, ...migratedNotes]);
        localStorage.setItem(NOTES_STORAGE_VERSION_KEY, String(NOTES_STORAGE_VERSION));
        return { migrated: true, imported: migratedNotes.length };
    }

    normalizeNote(note) {
        if (!note || typeof note !== 'object' || !String(note.id || '').trim()) {
            throw new Error('A note is missing its ID.');
        }
        if (typeof note.title !== 'string' || typeof note.content !== 'string') {
            throw new Error('A note has invalid title or content.');
        }
        const now = new Date().toISOString();
        const createdAt = this.validDate(note.created_at) ? new Date(note.created_at).toISOString() : now;
        const updatedAt = this.validDate(note.updated_at) ? new Date(note.updated_at).toISOString() : createdAt;
        return {
            id: String(note.id),
            title: note.title,
            content: note.content,
            created_at: createdAt,
            updated_at: updatedAt,
            pinned: Boolean(note.pinned ?? note.is_pinned),
        };
    }

    validDate(value) {
        return typeof value === 'string' && !Number.isNaN(Date.parse(value));
    }

    exportNotes() {
        const payload = JSON.stringify({ version: NOTES_STORAGE_VERSION, notes: this.getNotes() }, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    async importNotes(file) {
        const text = await file.text();
        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            throw new Error('This backup is not valid JSON.');
        }
        const imported = Array.isArray(payload) ? payload : payload?.notes;
        if (!Array.isArray(imported)) throw new Error('This backup does not contain a notes list.');

        const existingNotes = this.getNotes();
        const existingIds = new Set(existingNotes.map((note) => String(note.id)));
        const importedIds = new Set();
        const validNotes = imported.map((note) => this.normalizeNote(note));
        const newNotes = validNotes.filter((note) => {
            const id = String(note.id);
            if (existingIds.has(id) || importedIds.has(id)) return false;
            importedIds.add(id);
            return true;
        });
        this.saveNotes([...existingNotes, ...newNotes]);
        return { imported: newNotes.length, skipped: validNotes.length - newNotes.length };
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const storage = new NoteStorage();
    const root = document.documentElement;
    const statusElements = document.querySelectorAll('[data-storage-status]');

    const setStatus = (message, isError = false) => {
        statusElements.forEach((element) => {
            element.textContent = message;
            element.classList.toggle('is-error', isError);
        });
    };

    const escapeHtml = (value) => String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

    const formatTime = (value) => new Intl.DateTimeFormat(undefined, {
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(value));

    const formatDate = (value) => new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(value));

    const noteUrl = (noteId, suffix = '') => `/notes/${encodeURIComponent(noteId)}/${suffix}`;

    const renderNoteCard = (note) => {
        const preview = note.content.trim() || 'No content';
        return `<article class="note-card${note.pinned ? ' is-pinned' : ''}" data-note-id="${escapeHtml(note.id)}">
            <a class="note-card-link" href="${noteUrl(note.id)}">
                <div class="note-card-top"><time datetime="${escapeHtml(note.updated_at)}">${formatTime(note.updated_at)}</time>${note.pinned ? '<span class="pin-dot" title="Pinned" aria-label="Pinned">*</span>' : ''}</div>
                <h2>${escapeHtml(note.title)}</h2>
                <p>${escapeHtml(preview.length > 180 ? `${preview.slice(0, 177)}...` : preview)}</p>
            </a>
        </article>`;
    };

    const groupNotes = (notes) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const groups = [['Today', []], ['This week', []], ['This month', []], ['Earlier', []]];
        notes.forEach((note) => {
            const updated = new Date(note.updated_at);
            const updatedDate = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate());
            if (updatedDate >= today) groups[0][1].push(note);
            else if (updatedDate >= weekStart) groups[1][1].push(note);
            else if (updatedDate >= monthStart) groups[2][1].push(note);
            else groups[3][1].push(note);
        });
        return groups.filter(([, group]) => group.length);
    };

    const renderList = () => {
        const groupsElement = document.querySelector('[data-note-groups]');
        if (!groupsElement) return;
        const query = document.querySelector('#search-input')?.value.trim().toLowerCase() || '';
        const notes = storage.getNotes()
            .sort((left, right) => new Date(right.updated_at) - new Date(left.updated_at))
            .filter((note) => !query || `${note.title} ${note.content}`.toLowerCase().includes(query));
        const countElement = document.querySelector('[data-note-count]');
        if (countElement) countElement.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;
        groupsElement.innerHTML = groupNotes(notes).map(([label, group]) => `<section class="note-section"><div class="section-label"><span>${label}</span></div><div class="note-grid">${group.map(renderNoteCard).join('')}</div></section>`).join('');
        const emptyState = document.querySelector('[data-empty-state]');
        if (emptyState) {
            emptyState.hidden = notes.length !== 0;
            const hasQuery = Boolean(query);
            emptyState.querySelector('[data-empty-title]').textContent = hasQuery ? 'No matching notes' : 'No notes yet';
            emptyState.querySelector('[data-empty-message]').textContent = hasQuery ? 'Try a different search term.' : 'Capture an idea before it gets away.';
            emptyState.querySelector('[data-empty-action]').textContent = hasQuery ? 'Show all notes' : 'Create your first note';
            emptyState.querySelector('[data-empty-action]').href = hasQuery ? '/' : '/notes/new/';
        }
    };

    const initializeTheme = () => {
        const themeToggles = document.querySelectorAll('[data-theme-toggle]');
        const savedTheme = localStorage.getItem('notes-theme');
        if (savedTheme) root.dataset.theme = savedTheme;
        const updateThemeLabel = () => themeToggles.forEach((toggle) => {
            const light = root.dataset.theme === 'light';
            toggle.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
            toggle.querySelector('span').textContent = light ? '☾' : '☼';
        });
        updateThemeLabel();
        themeToggles.forEach((toggle) => toggle.addEventListener('click', () => {
            const nextTheme = root.dataset.theme === 'light' ? 'dark' : 'light';
            if (nextTheme === 'dark') delete root.dataset.theme;
            else root.dataset.theme = nextTheme;
            localStorage.setItem('notes-theme', nextTheme);
            updateThemeLabel();
        }));
    };

    const initializeList = () => {
        if (!document.querySelector('[data-note-list-app]')) return;
        const searchForm = document.querySelector('[data-note-search-form]');
        const searchInput = document.querySelector('#search-input');
        const clearSearch = document.querySelector('[data-clear-search]');
        searchForm?.addEventListener('submit', (event) => event.preventDefault());
        searchInput?.addEventListener('input', renderList);
        clearSearch?.addEventListener('click', () => { searchInput.value = ''; renderList(); });

        const searchButton = document.querySelector('.search-button');
        const searchPopover = document.querySelector('.search-popover');
        searchButton?.addEventListener('click', () => {
            searchPopover.classList.toggle('is-visible');
            if (searchPopover.classList.contains('is-visible')) searchInput.focus();
        });

        const backupMenu = document.querySelector('[data-backup-menu]');
        const backupPopover = backupMenu?.querySelector('.backup-popover');
        backupMenu?.querySelector('[data-backup-toggle]')?.addEventListener('click', () => {
            backupPopover.hidden = !backupPopover.hidden;
        });
        backupMenu?.querySelector('[data-export-notes]')?.addEventListener('click', () => {
            storage.exportNotes();
            setStatus('Notes exported.');
            backupPopover.hidden = true;
        });
        const importFile = backupMenu?.querySelector('[data-import-file]');
        backupMenu?.querySelector('[data-import-notes]')?.addEventListener('click', () => importFile.click());
        importFile?.addEventListener('change', async () => {
            if (!importFile.files[0]) return;
            try {
                const result = await storage.importNotes(importFile.files[0]);
                setStatus(`Imported ${result.imported} note${result.imported === 1 ? '' : 's'}${result.skipped ? `; skipped ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'}` : ''}.`);
                renderList();
            } catch (error) {
                setStatus(error.message, true);
            }
            importFile.value = '';
            backupPopover.hidden = true;
        });
        renderList();
    };

    const initializeEditor = () => {
        const form = document.querySelector('[data-note-form]');
        if (!form) return;
        const titleInput = form.querySelector('[name="title"]');
        const contentInput = form.querySelector('[name="content"]');
        const noteId = form.dataset.noteId;
        const existingNote = noteId ? storage.getNote(noteId) : null;
        if (noteId && !existingNote) {
            window.location.href = '/';
            return;
        }
        if (existingNote) {
            titleInput.value = existingNote.title;
            contentInput.value = existingNote.content;
        }
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const title = titleInput.value.trim();
            if (!title) {
                titleInput.focus();
                titleInput.setCustomValidity('A title is required.');
                titleInput.reportValidity();
                titleInput.setCustomValidity('');
                return;
            }
            const note = noteId ? storage.updateNote(noteId, title, contentInput.value) : storage.createNote(title, contentInput.value);
            window.location.href = noteUrl(note.id);
        });

        const importInput = document.querySelector('#note-import');
        importInput?.addEventListener('change', () => {
            const file = importInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.addEventListener('load', () => { contentInput.value = reader.result; });
            reader.readAsText(file);
        });
    };

    const initializeDetail = () => {
        const detail = document.querySelector('[data-note-detail]');
        if (!detail) return;
        const note = storage.getNote(detail.dataset.noteId);
        if (!note) return;
        detail.querySelector('[data-detail-title]').textContent = note.title;
        detail.querySelector('[data-detail-content]').innerHTML = escapeHtml(note.content).replaceAll('\n', '<br>');
        detail.querySelector('[data-detail-meta]').textContent = `Created ${formatDate(note.created_at)}${note.pinned ? ' · Pinned' : ''}`;
        detail.querySelector('[data-detail-edit]').href = noteUrl(note.id, 'edit/');
        detail.querySelector('[data-detail-delete]').href = noteUrl(note.id, 'delete/');
        const pinForm = detail.querySelector('[data-detail-pin-form]');
        const pinButton = detail.querySelector('[data-detail-pin-button]');
        const updatePinLabel = () => {
            const label = note.pinned ? 'Unpin note' : 'Pin note';
            pinButton.setAttribute('aria-label', label);
            pinButton.title = label;
        };
        updatePinLabel();
        pinForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const updatedNote = storage.togglePinned(note.id);
            note.pinned = updatedNote.pinned;
            note.updated_at = updatedNote.updated_at;
            updatePinLabel();
            detail.querySelector('[data-detail-meta]').textContent = `Created ${formatDate(note.created_at)}${note.pinned ? ' · Pinned' : ''}`;
        });
    };

    const initializeDelete = () => {
        const page = document.querySelector('[data-delete-page]');
        if (!page) return;
        const note = storage.getNote(page.dataset.noteId);
        if (!note) return;
        page.querySelector('[data-delete-title]').textContent = note.title;
        page.querySelector('[data-delete-form]').addEventListener('submit', (event) => {
            event.preventDefault();
            storage.deleteNote(note.id);
            window.location.href = '/';
        });
    };

    initializeTheme();
    try {
        const migration = await storage.migrate();
        if (migration.migrated && migration.imported) setStatus(`Imported ${migration.imported} existing note${migration.imported === 1 ? '' : 's'} from SQLite.`);
        initializeList();
        initializeEditor();
        initializeDetail();
        initializeDelete();
    } catch (error) {
        setStatus(`Storage migration failed: ${error.message}`, true);
    }
});
