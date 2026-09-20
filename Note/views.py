from django.contrib import messages
from django.db.models import Q
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from datetime import timedelta

from .forms import NoteForm
from .models import Note


def note_list(request):
	query = request.GET.get('q', '').strip()
	notes = Note.objects.all()
	if query:
		notes = notes.filter(Q(title__icontains=query) | Q(content__icontains=query))

	now = timezone.localtime()
	today = now.date()
	week_start = today - timedelta(days=today.weekday())
	month_start = today.replace(day=1)
	note_groups = [
		('Today', notes.filter(updated_at__date=today)),
		('This week', notes.filter(updated_at__date__gte=week_start, updated_at__date__lt=today)),
		('This month', notes.filter(updated_at__date__gte=month_start, updated_at__date__lt=week_start)),
		('Earlier', notes.filter(updated_at__date__lt=month_start)),
	]

	context = {
		'query': query,
		'note_groups': [(label, group) for label, group in note_groups if group.exists()],
		'has_notes': notes.exists(),
		'total_notes': notes.count(),
	}
	return render(request, 'Note/note_list.html', context)


def note_create(request):
	form = NoteForm(request.POST or None)
	if request.method == 'POST' and form.is_valid():
		note = form.save()
		messages.success(request, 'Note created.')
		return redirect('note_detail', pk=note.pk)
	return render(request, 'Note/note_form.html', {'form': form, 'page_title': 'New note'})


def note_detail(request, pk):
	note = get_object_or_404(Note, pk=pk)
	return render(request, 'Note/note_detail.html', {'note': note})


def note_edit(request, pk):
	note = get_object_or_404(Note, pk=pk)
	form = NoteForm(request.POST or None, instance=note)
	if request.method == 'POST' and form.is_valid():
		form.save()
		messages.success(request, 'Note updated.')
		return redirect('note_detail', pk=note.pk)
	return render(request, 'Note/note_form.html', {'form': form, 'page_title': 'Edit note', 'note': note})


def note_delete(request, pk):
	note = get_object_or_404(Note, pk=pk)
	if request.method == 'POST':
		note.delete()
		messages.success(request, 'Note deleted.')
		return redirect('note_list')
	return render(request, 'Note/note_confirm_delete.html', {'note': note})


def note_toggle_pin(request, pk):
	note = get_object_or_404(Note, pk=pk)
	if request.method == 'POST':
		note.is_pinned = not note.is_pinned
		note.save(update_fields=['is_pinned', 'updated_at'])
		messages.success(request, 'Note pinned.' if note.is_pinned else 'Note unpinned.')
	return redirect('note_detail', pk=note.pk)
