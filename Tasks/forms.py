from django.contrib.auth.forms import UserCreationForm
from django import forms
from .models import Task

class CustomUserCreationForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        fields = UserCreationForm.Meta.fields + ('email', )

class AddTaskForm(forms.ModelForm):
    class Meta:
        model = Task
        fields = ['title', 'due_date', 'is_completed']
        labels = {
            'title': 'Task',
            'due_date': 'Due Date',
            'is_completed': 'Completed'
        }
        widgets = {
            'due_date': forms.DateTimeInput(attrs={
                'type': 'datetime-local',
                'class': 'cursor-pointer'
                }),
            
        }