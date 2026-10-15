const API_URL = "/api/tasks";
const $ = (selector) => document.querySelector(selector);

const taskForm = $("#taskForm");
const taskInput = $("#taskInput");
const taskList = $("#taskList");
const emptyState = $("#emptyState");
const loadingState = $("#loadingState");
const errorBanner = $("#errorBanner");
const toast = $("#toast");
const clearCompletedButton = $("#clearCompleted");

let tasks = [];
let currentFilter = "all";
let toastTimeout;
let isSaving = false;

$("#currentDate").textContent = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric"
}).format(new Date());

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2400);
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

function clearError() {
  errorBanner.hidden = true;
  errorBanner.textContent = "";
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      message = data.detail || message;
    } catch (_) {}
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function loadTasks() {
  loadingState.hidden = false;
  taskList.hidden = true;
  emptyState.hidden = true;
  clearError();

  try {
    tasks = await request(API_URL);
    renderTasks();
  } catch (error) {
    showError(`Couldn't connect to the Orbit API. Make sure the FastAPI server is running, then refresh. (${error.message})`);
  } finally {
    loadingState.hidden = true;
  }
}

function updateStats() {
  const completed = tasks.filter(task => task.completed).length;
  const remaining = tasks.length - completed;
  const total = tasks.length;
  const completedPercent = total ? (completed / total) * 100 : 0;
  const remainingPercent = total ? (remaining / total) * 100 : 0;

  $("#totalCount").textContent = total;
  $("#completedCount").textContent = completed;
  $("#remainingCount").textContent = remaining;
  $("#taskCountBadge").textContent = `${total} ${total === 1 ? "task" : "tasks"}`;
  $("#allFilterCount").textContent = total;
  $("#activeFilterCount").textContent = remaining;
  $("#doneFilterCount").textContent = completed;
  $("#completedTrack").style.width = `${completedPercent}%`;
  $("#remainingTrack").style.width = `${remainingPercent}%`;

  $("#taskSummary").textContent = remaining === 0
    ? (total ? "All missions accomplished" : "Ready for your first mission")
    : `${remaining} ${remaining === 1 ? "task" : "tasks"} still in orbit`;

  clearCompletedButton.disabled = completed === 0 || isSaving;
}

function renderTasks() {
  taskList.replaceChildren();

  const visibleTasks = tasks.filter(task => {
    if (currentFilter === "active") return !task.completed;
    if (currentFilter === "completed") return task.completed;
    return true;
  });

  visibleTasks.forEach(task => {
    const item = document.createElement("article");
    item.className = `task-item${task.completed ? " completed" : ""}`;
    item.dataset.id = task.id;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";
    checkbox.checked = task.completed;
    checkbox.disabled = isSaving;
    checkbox.setAttribute("aria-label", `${task.completed ? "Reopen" : "Complete"} ${task.title}`);
    checkbox.addEventListener("change", () => toggleTask(task));

    const marker = document.createElement("span");
    marker.className = "task-marker";
    marker.textContent = task.completed ? "✓" : "↗";
    marker.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "task-content";

    const title = document.createElement("span");
    title.className = "task-text";
    title.textContent = task.title;

    const date = document.createElement("span");
    date.className = "task-date";
    if (task.created_at) {
      const parsedDate = new Date(task.created_at);
      date.textContent = Number.isNaN(parsedDate.getTime())
        ? "Mission logged"
        : `ADDED ${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(parsedDate).toUpperCase()}`;
    } else {
      date.textContent = "MISSION LOGGED";
    }
    content.append(title, date);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const status = document.createElement("span");
    status.className = `task-status ${task.completed ? "status-done" : "status-open"}`;
    status.textContent = task.completed ? "Complete" : "In progress";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.disabled = isSaving;
    deleteButton.setAttribute("aria-label", `Delete ${task.title}`);
    deleteButton.title = "Delete task";
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => deleteTask(task));

    actions.append(status, deleteButton);
    item.append(checkbox, marker, content, actions);
    taskList.append(item);
  });

  const hasTasks = visibleTasks.length > 0;
  taskList.hidden = !hasTasks;
  emptyState.hidden = hasTasks;

  if (currentFilter === "active") {
    $("#emptyTitle").textContent = "Nothing in the queue.";
    $("#emptyMessage").textContent = "You've cleared every active task. Take a breath.";
  } else if (currentFilter === "completed") {
    $("#emptyTitle").textContent = "Your wins go here.";
    $("#emptyMessage").textContent = "Complete a task and it'll appear in this space.";
  } else {
    $("#emptyTitle").textContent = "Your orbit is clear.";
    $("#emptyMessage").textContent = "Add a mission above and build some momentum.";
  }

  document.querySelectorAll(".filter-btn").forEach(button => {
    const active = button.dataset.filter === currentFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  updateStats();
}

async function addTask(event) {
  event.preventDefault();
  const title = taskInput.value.trim();

  if (!title) {
    showToast("Enter a mission before launching it.");
    taskInput.focus();
    return;
  }
  if (isSaving) return;

  setSaving(true);
  try {
    const created = await request(API_URL, {
      method: "POST",
      body: JSON.stringify({ title })
    });
    tasks.unshift(created);
    currentFilter = "all";
    taskInput.value = "";
    clearError();
    renderTasks();
    showToast("Mission launched. You've got this.");
    taskInput.focus();
  } catch (error) {
    showError(`Couldn't add the task: ${error.message}`);
  } finally {
    setSaving(false);
  }
}

async function toggleTask(task) {
  if (isSaving) return;
  setSaving(true);

  try {
    const updated = await request(`${API_URL}/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: !task.completed })
    });
    tasks = tasks.map(item => item.id === updated.id ? updated : item);
    clearError();
    renderTasks();
    showToast(updated.completed ? "Mission complete. Nice work!" : "Mission moved back into orbit.");
  } catch (error) {
    showError(`Couldn't update the task: ${error.message}`);
  } finally {
    setSaving(false);
  }
}

async function deleteTask(task) {
  if (isSaving) return;
  setSaving(true);

  try {
    await request(`${API_URL}/${task.id}`, { method: "DELETE" });
    tasks = tasks.filter(item => item.id !== task.id);
    clearError();
    renderTasks();
    showToast("Mission removed from your radar.");
  } catch (error) {
    showError(`Couldn't delete the task: ${error.message}`);
  } finally {
    setSaving(false);
  }
}

async function clearCompleted() {
  if (isSaving || !tasks.some(task => task.completed)) return;
  setSaving(true);

  try {
    const result = await request(API_URL, { method: "DELETE" });
    tasks = tasks.filter(task => !task.completed);
    clearError();
    renderTasks();
    const deleted = result && Number.isFinite(result.deleted)
      ? result.deleted
      : 0;
    showToast(`${deleted} completed ${deleted === 1 ? "task" : "tasks"} cleared.`);
  } catch (error) {
    showError(`Couldn't clear completed tasks: ${error.message}`);
  } finally {
    setSaving(false);
  }
}

function setSaving(value) {
  isSaving = value;
  taskForm.querySelector("button").disabled = value;
  taskInput.disabled = value;
  clearCompletedButton.disabled = value || !tasks.some(task => task.completed);
  renderTasks();
}

taskForm.addEventListener("submit", addTask);
clearCompletedButton.addEventListener("click", clearCompleted);

document.querySelectorAll(".filter-btn").forEach(button => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    renderTasks();
  });
});

loadTasks();
