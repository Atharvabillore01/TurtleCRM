import React, { useState } from "react";
import TasksView from "../components/tasks/TasksView";
import { initialTasks } from "../data/mockData";

export default function TasksPage() {
  const [tasks, setTasks] = useState(initialTasks);

  function handleCreateTask(taskForm: any) {
    setTasks((current) => [
      {
        id: `TSK-${String(current.length + 1001)}`,
        client: taskForm.client,
        assignedTo: taskForm.assignedTo,
        advisors: taskForm.advisors,
        title: taskForm.title,
        description: taskForm.description,
        createdAt: taskForm.createdAt || new Date().toISOString().slice(0, 10),
        dueDate: taskForm.dueDate,
        status: "Pending",
        scope: taskForm.scope || "Internal",
      },
      ...current,
    ]);
  }

  function handleUpdateTask(updatedTask: any) {
    setTasks((current) =>
      current.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
    );
  }

  return (
    <TasksView
      tasks={tasks}
      onCreateTask={handleCreateTask}
      onUpdateTask={handleUpdateTask}
    />
  );
}
