from django.urls import path
from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("register/", views.register_user, name="register"),
    path("delete/<int:id>", views.delete_task, name="delete_task"),
    path("login/", views.user_login, name="login"),
    path("add-task/", views.addTask, name="add_task"),
    path('tasks/<int:id>/toggle/', views.toggle_task, name='toggle_task'),
    path('task-completed/', views.completed_task, name='task_completed'),
]
