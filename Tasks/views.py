from django.shortcuts import render, redirect, get_object_or_404
from .forms import CustomUserCreationForm, AddTaskForm
from django.contrib.auth import login
from django.http import HttpResponse
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import AuthenticationForm
from .models import Task


def register_user(request):
    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            form.save()
            return HttpResponse("Registered")
    else:
        form = CustomUserCreationForm()
    
    return render(request, 'register.html', {
        'form': form, 
        'form_type': 'register'
    })


def user_login(request):
    if request.method == "POST":
        form = AuthenticationForm(request, data=request.POST)
        if form.is_valid():
            user = form.get_user()
            login(request, user)
            return redirect('home')
    else:
        form = AuthenticationForm()
        
    return render(request, 'register.html', {
        'form': form, 
        'form_type': 'login'
    })


@login_required  
def home(request):
    tasks = Task.objects.filter(user=request.user, is_completed=False)
    form = AddTaskForm()  # Instantiate form for the modal
    
    return render(request, 'home.html', {
        'tasks': tasks,
        'in_completed': False,

        'form': form,  # Passed directly to home.html
    })
    
@login_required
def completed_task(request):
    tasks = Task.objects.filter(user=request.user, is_completed=True)
    form = AddTaskForm()  # Instantiate form for the modal
    
    return render(request, 'home.html', {
        'tasks': tasks,
        'in_completed': True,
        'form': form,  # Passed directly to completed_task.html
    })


@login_required
def addTask(request):
    # Only process POST requests coming from the modal form
    if request.method == 'POST':
        form = AddTaskForm(request.POST)
        if form.is_valid():
            task = form.save(commit=False)
            task.user = request.user
            task.save()
            return redirect("home")
            
    # If someone manually accesses /add-task/ via GET, send them back home
    return redirect("home")


def delete_task(request, id):
    task = get_object_or_404(Task, pk=id)
    
    if request.method == "POST":
        task.delete()
    return redirect("home")

@login_required
def toggle_task(request, id):
    # Fetch the task ensuring it belongs to the logged-in user
    task = get_object_or_404(Task, pk=id, user=request.user)
    
    # Flip the boolean state
    task.is_completed = not task.is_completed
    task.save()
    
    # Redirect back to the home/dashboard view
    return redirect('home')