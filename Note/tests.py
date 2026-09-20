from django.test import TestCase

from django.urls import reverse

from .models import Note


class NoteViewsTests(TestCase):
	def setUp(self):
		self.note = Note.objects.create(title='Planning', content='Write the first draft')

	def test_list_searches_title_and_content(self):
		response = self.client.get(reverse('note_list'), {'q': 'draft'})

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Planning')

	def test_create_detail_pin_and_delete(self):
		response = self.client.post(reverse('note_create'), {
			'title': 'Shopping',
			'content': 'Buy apples',
		})

		created_note = Note.objects.get(title='Shopping')
		self.assertRedirects(response, reverse('note_detail', args=[created_note.pk]))

		response = self.client.post(reverse('note_toggle_pin', args=[created_note.pk]))
		self.assertRedirects(response, reverse('note_detail', args=[created_note.pk]))
		created_note.refresh_from_db()
		self.assertTrue(created_note.is_pinned)

		response = self.client.post(reverse('note_delete', args=[created_note.pk]))
		self.assertRedirects(response, reverse('note_list'))
		self.assertFalse(Note.objects.filter(pk=created_note.pk).exists())
