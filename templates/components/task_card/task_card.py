from django_components import component

@component.register("task_card")
class TaskCard(component.Component):
    template_name = "components/task_card/task_card.html"
    
    def get_context_data(self, task):
        return {
            "task": task
        }