from django.urls import path

from . import views


urlpatterns = [
    path('', views.note_list, name='note_list'),
    path('notes/migration-data/', views.note_migration_data, name='note_migration_data'),
    path('notes/new/', views.note_create, name='note_create'),
    path('notes/<str:pk>/', views.note_detail, name='note_detail'),
    path('notes/<str:pk>/edit/', views.note_edit, name='note_edit'),
    path('notes/<str:pk>/delete/', views.note_delete, name='note_delete'),
    path('notes/<str:pk>/pin/', views.note_toggle_pin, name='note_toggle_pin'),
]