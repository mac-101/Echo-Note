# Notes

A clean, iOS-inspired note-taking web application built with Django.

This project is the first phase of a larger voice-enabled note-taking application. Phase 1 focuses on creating a reliable text-based note-taking experience before introducing speech-to-text and AI-powered features.

## Features

### Current — Phase 1

* Create notes
* Edit notes
* Delete notes
* View individual notes
* Search notes
* Pin and unpin notes
* Pinned notes section
* Responsive design
* Mobile-friendly interface
* Local-first browser persistence with one-time SQLite migration
* iOS-inspired user interface

### Planned

#### Phase 2 — Voice Transcription

* Live voice-to-text
* Upload audio and transcribe it
* Local speech-to-text processing
* Voice-created notes

#### Phase 3 — AI Features

* Quick voice notes
* Voice-to-task conversion
* Task extraction from natural speech
* AI-assisted organization of notes

## Tech Stack

* Python
* Django
* Django Templates
* HTML
* CSS
* Vanilla JavaScript
* Browser localStorage for normal note operations
* SQLite retained as a migration source for existing notes

Future versions may use a locally installed speech-to-text model such as Whisper or a faster Whisper implementation.

## Project Structure

```text
project/
│
├── Note/
│   ├── migrations/
│   ├── templates/
│   │   └── Note/
│   ├── static/
│   ├── forms.py
│   ├── models.py
│   ├── urls.py
│   └── views.py
│
├── project/
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
│
├── manage.py
├── requirements.txt
├── .gitignore
└── README.md
```

## Running Locally

### 1. Clone the repository

```bash
git clone YOUR_REPOSITORY_URL
cd YOUR_PROJECT_DIRECTORY
```

### 2. Create a virtual environment

Windows:

```bash
python -m venv venv
venv\Scripts\activate
```

macOS/Linux:

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Run migrations

```bash
python manage.py migrate
```

### 5. Start the development server

```bash
python manage.py runserver
```

Open the local development address shown by Django in your browser.

## Database

During local development, the project can use SQLite.

For production, PostgreSQL is recommended.

Django's ORM allows the application models and database operations to remain largely the same while changing the database backend.

## Production Deployment

The application can be deployed using a platform that supports Django and PostgreSQL.

A typical production architecture is:

```text
Browser
   ↓
Django application
   ↓
PostgreSQL
```

The production environment should provide:

* `SECRET_KEY`
* `DEBUG=False`
* `ALLOWED_HOSTS`
* PostgreSQL database credentials/connection URL

Before deployment, collect static files:

```bash
python manage.py collectstatic --no-input
```

Apply database migrations:

```bash
python manage.py migrate
```

The production application should be served using Gunicorn rather than Django's development server.

Example:

```bash
gunicorn project.wsgi:application
```

Replace `project` with the actual Django project package name.

## Development Status

### Phase 1

* [x] Text-based note creation
* [x] Note editing
* [x] Note deletion
* [x] Note search
* [x] Pin/unpin
* [x] Responsive UI
* [x] Local-first browser storage
* [x] SQLite-to-localStorage migration
* [x] JSON import and export backups

### Phase 2

* [ ] Live voice-to-text
* [ ] Audio upload transcription
* [ ] Voice-created notes

### Phase 3

* [ ] AI quick notes
* [ ] Voice tasking
* [ ] Natural-language task extraction

## License

This project is currently a personal development project.
