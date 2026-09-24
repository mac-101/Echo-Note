const NOTES_STORAGE_KEY = 'notes_storage_notes';
const NOTES_STORAGE_VERSION_KEY = 'notes_storage_version';
const NOTES_STORAGE_VERSION = 1;

class NoteStorage {
    getNotes() {
        const rawNotes = localStorage.getItem(NOTES_STORAGE_KEY);
        if (!rawNotes) return [];

        const savedNotes = JSON.parse(rawNotes);
        if (!Array.isArray(savedNotes)) throw new Error('Saved notes have an invalid format.');

        const notes = savedNotes.map((note) => this.normalizeNote(note));
        const normalizedNotes = JSON.stringify(notes);
        if (normalizedNotes !== rawNotes) localStorage.setItem(NOTES_STORAGE_KEY, normalizedNotes);
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

// console.log('NEW APP.JS LOADED');

document.addEventListener('DOMContentLoaded', async () => {
    const storage = new NoteStorage();
    const root = document.documentElement;
    const statusElements = document.querySelectorAll('[data-storage-status]');

    // Pre-warm the Whisper pipeline immediately on page load to eliminate warm-up latency
    let transcriptionPipelinePromise = null;
    const getTranscriptionPipeline = (progressCallback) => {
        if (!transcriptionPipelinePromise) {
            transcriptionPipelinePromise = (async () => {
                const transformers = await import('/static/Note/transformers.bundle.js');
                return transformers.pipeline(
                    'automatic-speech-recognition',
                    'Xenova/whisper-tiny.en',
                    {
                        device: 'wasm',
                        dtype: 'q8',
                        num_threads: navigator.hardwareConcurrency || 4,
                        progress_callback: progressCallback,
                    }
                );
            })();
        }
        return transcriptionPipelinePromise;
    };
    getTranscriptionPipeline().catch(() => { });

    const convertToWhisperAudio = async (audioBuffer) => {
        const targetSampleRate = 16000;
        if (
            audioBuffer.sampleRate === targetSampleRate &&
            audioBuffer.numberOfChannels === 1
        ) {
            return audioBuffer.getChannelData(0);
        }

        const targetLength = Math.ceil(audioBuffer.duration * targetSampleRate);
        const offlineContext = new OfflineAudioContext(1, targetLength, targetSampleRate);

        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start(0);

        const rendered = await offlineContext.startRendering();
        return rendered.getChannelData(0);
    };

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
        return renderList;
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

    const initializeAudioRecorder = () => {
        const recordButton = document.querySelector('[data-record-button]');
        const recordingPanel = document.querySelector('[data-recording-panel]');
        const stopButton = document.querySelector('[data-recording-stop]');
        const pauseButton = document.querySelector('[data-recording-pause]');
        const timeElement = document.querySelector('[data-recording-time]');
        const canvas = document.querySelector('[data-recording-waveform]');
        const errorElement = document.querySelector('[data-recording-error]');
        const recordingStatus = document.querySelector('[data-recording-status]');
        const contentInput = document.querySelector('[data-note-form] [name="content"]');
        const cancelButton = document.querySelector('[data-recording-cancel]');

        if (
            !recordButton ||
            !recordingPanel ||
            !stopButton ||
            !pauseButton ||
            !timeElement ||
            !canvas
        ) {
            return;
        }

        let mediaRecorder = null;
        let mediaStream = null;
        let audioContext = null;
        let analyser = null;
        let animationFrame = null;
        let timer = null;
        let startedAt = 0;
        let recordedAudioBlob = null;

        let elapsedBeforePause = 0;
        let cancelRequested = false;
        let chunks = [];

        const canvasContext = canvas.getContext('2d');

        const showMessage = (message) => {
            if (errorElement) {
                errorElement.textContent = message;
            }

            const status = document.querySelector('[data-storage-status]');

            if (status) {
                status.textContent = message;
                status.classList.add('is-error');
            }
        };

        const updateTime = () => {
            if (!startedAt) return;

            const elapsedSeconds = Math.floor(
                (elapsedBeforePause + Date.now() - startedAt) / 1000
            );

            const minutes = String(
                Math.floor(elapsedSeconds / 60)
            ).padStart(2, '0');

            const seconds = String(
                elapsedSeconds % 60
            ).padStart(2, '0');

            timeElement.textContent = `${minutes}:${seconds}`;
        };

        const drawWaveform = () => {
            if (!analyser || !canvasContext) return;

            const values = new Uint8Array(analyser.fftSize);

            analyser.getByteTimeDomainData(values);

            const width = canvas.width;
            const height = canvas.height;

            canvasContext.clearRect(0, 0, width, height);

            canvasContext.strokeStyle = getComputedStyle(
                document.documentElement
            )
                .getPropertyValue('--accent')
                .trim();

            canvasContext.lineWidth = 2;
            canvasContext.beginPath();

            values.forEach((value, index) => {
                const x = (index / (values.length - 1)) * width;
                const y = (value / 255) * height;

                if (index === 0) {
                    canvasContext.moveTo(x, y);
                } else {
                    canvasContext.lineTo(x, y);
                }
            });

            canvasContext.stroke();

            animationFrame = requestAnimationFrame(drawWaveform);
        };

        const stopTracksAndAudio = () => {
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }

            if (timer) {
                clearInterval(timer);
                timer = null;
            }

            if (mediaStream) {
                mediaStream.getTracks().forEach((track) => {
                    track.stop();
                });

                mediaStream = null;
            }

            if (audioContext && audioContext.state !== 'closed') {
                audioContext.close().catch(() => { });
            }

            audioContext = null;
            analyser = null;
            startedAt = 0;
        };

        const resetRecordingUI = () => {
            recordButton.classList.remove('is-recording');

            recordButton.setAttribute(
                'aria-label',
                'Record audio'
            );

            recordButton.title = 'Record audio';

            pauseButton.classList.remove('is-paused');

            pauseButton.setAttribute(
                'aria-label',
                'Pause recording'
            );

            pauseButton.title = 'Pause recording';

            pauseButton.disabled = false;
            pauseButton.hidden = false;

            stopButton.disabled = false;

            stopButton.classList.remove('is-record-again');

            stopButton.setAttribute(
                'aria-label',
                'Stop recording'
            );

            stopButton.title = 'Stop recording';

            recordingStatus.classList.remove('is-transcribing');

            timeElement.textContent = '00:00';
        };

        const cleanupRecording = () => {
            stopTracksAndAudio();

            mediaRecorder = null;
            recordedAudioBlob = null;

            chunks = [];

            cancelRequested = false;

            elapsedBeforePause = 0;

            recordButton.dataset.audioReady = 'false';

            resetRecordingUI();

            recordingStatus.textContent = 'Ready';

            recordingPanel.hidden = true;
        };

        const stopRecording = () => {
            if (
                !mediaRecorder ||
                mediaRecorder.state === 'inactive'
            ) {
                return;
            }

            mediaRecorder.stop();

            recordButton.classList.remove('is-recording');

            recordButton.setAttribute(
                'aria-label',
                'Record audio'
            );

            recordButton.title = 'Record audio';

            recordingPanel.hidden = false;

            recordingStatus.textContent = 'Transcribing...';

            recordingStatus.classList.add('is-transcribing');

            stopButton.disabled = true;
            pauseButton.disabled = true;
            pauseButton.hidden = true;

            stopTracksAndAudio();
        };

        const transcribeRecording = async (audioBlob) => {
            let audioContextForDecode = null;

            try {
                if (cancelRequested) {
                    return;
                }

                const transcriptionPipeline = await getTranscriptionPipeline((progress) => {
                    if (cancelRequested) return;
                    if (progress.status === 'progress' && progress.total) {
                        const percent = Math.round((progress.loaded / progress.total) * 100);
                        recordingStatus.textContent = `Loading model ${percent}%`;
                    } else if (progress.status === 'initiate') {
                        recordingStatus.textContent = 'Loading Whisper model...';
                    }
                });

                if (cancelRequested) {
                    return;
                }

                recordingStatus.textContent =
                    'Transcribing...';

                const AudioContextClass =
                    window.AudioContext ||
                    window.webkitAudioContext;

                audioContextForDecode =
                    new AudioContextClass({ sampleRate: 16000 });

                const audioBuffer =
                    await audioContextForDecode.decodeAudioData(
                        await audioBlob.arrayBuffer()
                    );

                if (cancelRequested) {
                    return;
                }

                const channel =
                    await convertToWhisperAudio(
                        audioBuffer
                    );

                if (cancelRequested) {
                    return;
                }

                const result =
                    await transcriptionPipeline(
                        channel,
                        {
                            chunk_length_s: 30,
                            stride_length_s: 5,
                            return_timestamps: false,
                            no_speech_threshold: 0.6,
                        }
                    );

                if (cancelRequested) {
                    return;
                }

                const text =
                    result?.text?.trim() ||
                    '(No speech detected)';

                if (contentInput) {
                    const existingText =
                        contentInput.value.trim();

                    contentInput.value = existingText
                        ? `${existingText}\n\n${text}`
                        : text;

                    contentInput.dispatchEvent(
                        new Event('input', {
                            bubbles: true,
                        })
                    );
                }
            } catch (error) {
                if (!cancelRequested) {
                    showMessage(
                        `Transcription failed: ${error.message ||
                        'Unknown error.'
                        }`
                    );
                }
            } finally {
                if (
                    audioContextForDecode &&
                    audioContextForDecode.state !==
                    'closed'
                ) {
                    audioContextForDecode
                        .close()
                        .catch(() => { });
                }

                if (!cancelRequested) {
                    recordingStatus.textContent =
                        'Recording complete';

                    recordingStatus.classList.remove(
                        'is-transcribing'
                    );

                    stopButton.disabled = false;

                    stopButton.classList.add(
                        'is-record-again'
                    );

                    stopButton.setAttribute(
                        'aria-label',
                        'Record again'
                    );

                    stopButton.title =
                        'Record again';

                    recordingPanel.hidden = false;
                }
            }
        };

        const startRecording = async () => {
            cancelRequested = false;
            chunks = [];
            recordedAudioBlob = null;

            const AudioContextClass =
                window.AudioContext ||
                window.webkitAudioContext;

            if (
                !navigator.mediaDevices?.getUserMedia ||
                !window.MediaRecorder ||
                !AudioContextClass
            ) {
                showMessage(
                    'Audio recording is not supported in this browser.'
                );

                return;
            }

            try {
                mediaStream =
                    await navigator.mediaDevices.getUserMedia(
                        {
                            audio: {
                                sampleRate: 16000,
                                channelCount: 1,
                                echoCancellation: true,
                                noiseSuppression: true,
                                autoGainControl: true,
                            },
                        }
                    );

                mediaRecorder =
                    new MediaRecorder(mediaStream);

                mediaRecorder.addEventListener(
                    'dataavailable',
                    (event) => {
                        if (event.data.size) {
                            chunks.push(event.data);
                        }
                    }
                );

                mediaRecorder.addEventListener(
                    'stop',
                    () => {
                        if (cancelRequested) {
                            cleanupRecording();
                            return;
                        }

                        recordedAudioBlob =
                            new Blob(chunks, {
                                type:
                                    mediaRecorder.mimeType ||
                                    'audio/webm',
                            });

                        recordButton.dataset.audioReady =
                            'true';

                        const blobToTranscribe =
                            recordedAudioBlob;

                        chunks = [];

                        transcribeRecording(
                            blobToTranscribe
                        );
                    }
                );

                audioContext =
                    new AudioContextClass();

                analyser =
                    audioContext.createAnalyser();

                analyser.fftSize = 256;

                audioContext
                    .createMediaStreamSource(
                        mediaStream
                    )
                    .connect(analyser);

                mediaRecorder.start();

                startedAt = Date.now();

                elapsedBeforePause = 0;

                timeElement.textContent =
                    '00:00';

                timer = setInterval(
                    updateTime,
                    250
                );

                recordingPanel.hidden = false;

                recordingStatus.textContent =
                    'Recording';

                recordingStatus.classList.remove(
                    'is-transcribing'
                );

                stopButton.disabled = false;

                pauseButton.disabled = false;

                pauseButton.hidden = false;

                stopButton.classList.remove(
                    'is-record-again'
                );

                stopButton.setAttribute(
                    'aria-label',
                    'Stop recording'
                );

                stopButton.title =
                    'Stop recording';

                pauseButton.classList.remove(
                    'is-paused'
                );

                pauseButton.setAttribute(
                    'aria-label',
                    'Pause recording'
                );

                pauseButton.title =
                    'Pause recording';

                recordButton.classList.add(
                    'is-recording'
                );

                recordButton.setAttribute(
                    'aria-label',
                    'Stop recording'
                );

                recordButton.title =
                    'Stop recording';

                drawWaveform();
            } catch (error) {
                stopTracksAndAudio();

                mediaRecorder = null;

                if (
                    error.name ===
                    'NotAllowedError'
                ) {
                    showMessage(
                        'Microphone permission was denied.'
                    );
                } else {
                    showMessage(
                        'The microphone could not be started.'
                    );
                }
            }
        };

        recordButton.addEventListener(
            'click',
            () => {
                if (
                    mediaRecorder?.state ===
                    'recording'
                ) {
                    stopRecording();
                } else {
                    startRecording();
                }
            }
        );

        pauseButton.addEventListener(
            'click',
            () => {
                if (
                    !mediaRecorder ||
                    mediaRecorder.state ===
                    'inactive'
                ) {
                    return;
                }

                if (
                    mediaRecorder.state ===
                    'recording'
                ) {
                    mediaRecorder.pause();

                    elapsedBeforePause +=
                        Date.now() - startedAt;

                    if (timer) {
                        clearInterval(timer);
                        timer = null;
                    }

                    recordingStatus.textContent =
                        'Paused';

                    pauseButton.classList.add(
                        'is-paused'
                    );

                    pauseButton.setAttribute(
                        'aria-label',
                        'Resume recording'
                    );

                    pauseButton.title =
                        'Resume recording';
                } else if (
                    mediaRecorder.state ===
                    'paused'
                ) {
                    mediaRecorder.resume();

                    startedAt = Date.now();

                    timer = setInterval(
                        updateTime,
                        250
                    );

                    recordingStatus.textContent =
                        'Recording';

                    pauseButton.classList.remove(
                        'is-paused'
                    );

                    pauseButton.setAttribute(
                        'aria-label',
                        'Pause recording'
                    );

                    pauseButton.title =
                        'Pause recording';
                }
            }
        );

        stopButton.addEventListener(
            'click',
            () => {
                if (
                    stopButton.classList.contains(
                        'is-record-again'
                    )
                ) {
                    startRecording();
                } else {
                    stopRecording();
                }
            }
        );

        if (cancelButton) {
            cancelButton.addEventListener(
                'click',
                () => {
                    cancelRequested = true;

                    if (
                        mediaRecorder &&
                        mediaRecorder.state !==
                        'inactive'
                    ) {
                        mediaRecorder.stop();
                    } else {
                        cleanupRecording();
                    }
                }
            );
        }
    };

    const initializeQuickVoice = () => {
        const trigger = document.querySelector('[data-quick-voice]');
        const panel = document.querySelector('[data-quick-recording-panel]');
        const stopButton = document.querySelector('[data-quick-recording-stop]');
        const timeElement = document.querySelector('[data-quick-recording-time]');
        const canvas = document.querySelector('[data-quick-recording-waveform]');
        const statusElement = document.querySelector('[data-quick-recording-status]');
        const errorElement = document.querySelector('[data-quick-recording-error]');
        const cancelButton = document.querySelector('[data-quick-recording-cancel]');

        if (!trigger || !panel || !stopButton || !timeElement || !canvas) return;

        let mediaRecorder;
        let mediaStream;
        let audioContext;
        let analyser;
        let animationFrame;
        let timer;
        let startedAt;
        let cancelRequested = false;

        const canvasContext = canvas.getContext('2d');

        const showError = (message) => {
            errorElement.textContent = message;
            statusElement.textContent = 'Recording failed';
        };

        const updateTime = () => {
            const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
            const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
            const seconds = String(elapsedSeconds % 60).padStart(2, '0');
            timeElement.textContent = `${minutes}:${seconds}`;
        };

        const drawWaveform = () => {
            if (!analyser) return;

            const values = new Uint8Array(analyser.fftSize);
            analyser.getByteTimeDomainData(values);

            canvasContext.clearRect(0, 0, canvas.width, canvas.height);
            canvasContext.strokeStyle =
                getComputedStyle(document.documentElement)
                    .getPropertyValue('--accent')
                    .trim();

            canvasContext.lineWidth = 2;
            canvasContext.beginPath();

            values.forEach((value, index) => {
                const x = (index / (values.length - 1)) * canvas.width;
                const y = (value / 255) * canvas.height;

                if (index === 0) canvasContext.moveTo(x, y);
                else canvasContext.lineTo(x, y);
            });

            canvasContext.stroke();
            animationFrame = requestAnimationFrame(drawWaveform);
        };

        const cleanup = () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
            if (timer) clearInterval(timer);

            mediaStream?.getTracks().forEach((track) => track.stop());

            if (audioContext && audioContext.state !== 'closed') {
                audioContext.close();
            }

            mediaStream = null;
            audioContext = null;
            analyser = null;
        };

        const transcribe = async (audioBlob) => {
            try {
                statusElement.textContent = 'Loading Whisper...';

                const transcriptionPipeline = await getTranscriptionPipeline();

                statusElement.textContent = 'Transcribing...';

                const audioContextForDecode =
                    new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });

                const audioBuffer =
                    await audioContextForDecode.decodeAudioData(
                        await audioBlob.arrayBuffer()
                    );

                const channelData = await convertToWhisperAudio(audioBuffer);

                const result = await transcriptionPipeline(
                    channelData,
                    {
                        chunk_length_s: 30,
                        stride_length_s: 5,
                        return_timestamps: false,
                        no_speech_threshold: 0.6,
                    }
                );

                if (audioContextForDecode.state !== 'closed') {
                    audioContextForDecode.close();
                }

                const text = result?.text?.trim();

                if (!text) {
                    throw new Error('No speech was detected.');
                }

                // Create the local note.
                const note = storage.createNote(
                    text.slice(0, 60),
                    text
                );

                panel.hidden = true;
                cleanup();

                renderList();

                // Open the newly created note.
                window.location.href = noteUrl(note.id);

            } catch (error) {
                cleanup();
                showError(
                    `Transcription failed: ${error.message || 'Unknown error.'}`
                );
                stopButton.disabled = false;
            }
        };

        const startRecording = async () => {
            cancelRequested = false;

            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            if (
                !navigator.mediaDevices?.getUserMedia ||
                !window.MediaRecorder ||
                !AudioContextClass
            ) {
                showError('Audio recording is not supported in this browser.');
                return;
            }

            try {
                errorElement.textContent = '';

                mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        sampleRate: 16000,
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });

                let chunks = [];

                mediaRecorder = new MediaRecorder(mediaStream);

                mediaRecorder.addEventListener('dataavailable', (event) => {
                    if (event.data.size) {
                        chunks.push(event.data);
                    }
                });

                mediaRecorder.addEventListener('stop', async () => {
                    if (cancelRequested) {
                        cancelRequested = false;
                        chunks = [];
                        cleanup();
                        return;
                    }

                    const audioBlob = new Blob(chunks, {
                        type: mediaRecorder.mimeType
                    });

                    chunks = [];

                    await transcribe(audioBlob);
                });

                audioContext = new AudioContextClass();
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;

                audioContext
                    .createMediaStreamSource(mediaStream)
                    .connect(analyser);

                mediaRecorder.start();

                startedAt = Date.now();
                timeElement.textContent = '00:00';
                timer = setInterval(updateTime, 250);

                panel.hidden = false;
                statusElement.textContent = 'Recording';
                stopButton.disabled = false;

                drawWaveform();

            } catch (error) {
                cleanup();

                showError(
                    error.name === 'NotAllowedError'
                        ? 'Microphone permission was denied.'
                        : 'The microphone could not be started.'
                );
            }
        };

        const stopRecording = () => {
            if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

            statusElement.textContent = 'Transcribing...';
            stopButton.disabled = true;

            mediaRecorder.stop();
        };

        trigger.addEventListener('click', startRecording);

        stopButton.addEventListener('click', stopRecording);
        cancelButton.addEventListener('click', () => {
            cancelRequested = true;

            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            } else {
                panel.hidden = true;
                cleanup();
            }
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
    initializeAudioRecorder();
    initializeQuickVoice();
    const refreshList = initializeList();
    initializeEditor();
    initializeDetail();
    initializeDelete();
    try {
        const migration = await storage.migrate();
        if (migration.migrated && migration.imported) setStatus(`Imported ${migration.imported} existing note${migration.imported === 1 ? '' : 's'} from SQLite.`);
        refreshList?.();
    } catch (error) {
        setStatus(`Storage migration failed: ${error.message}`, true);
    }
});