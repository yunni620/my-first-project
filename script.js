const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const taskList = document.querySelector("#task-list");
const emptyState = document.querySelector("#empty-state");
const completedCount = document.querySelector("#completed-count");
const totalCount = document.querySelector("#total-count");
const percentageText = document.querySelector("#percentage");
const progressTrack = document.querySelector(".progress-track");
const progressFill = document.querySelector("#progress-fill");

const savedTasks = localStorage.getItem("study-dashboard-tasks");
let tasks = savedTasks ? JSON.parse(savedTasks) : [];

function saveTasks() {
  localStorage.setItem("study-dashboard-tasks", JSON.stringify(tasks));
}

function updateProgress() {
  const completed = tasks.filter((task) => task.completed).length;
  const percentage = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);

  completedCount.textContent = completed;
  totalCount.textContent = tasks.length;
  percentageText.textContent = `${percentage}%`;
  progressFill.style.width = `${percentage}%`;
  progressTrack.setAttribute("aria-valuenow", percentage);
  emptyState.hidden = tasks.length > 0;
}

function toggleTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);

  if (task) {
    task.completed = !task.completed;
    saveTasks();
    renderTasks();
  }
}

function renderTasks() {
  taskList.replaceChildren();

  tasks.forEach((task) => {
    const listItem = document.createElement("li");
    const checkbox = document.createElement("input");
    const taskText = document.createElement("span");

    listItem.className = `task-item${task.completed ? " completed" : ""}`;
    checkbox.className = "task-checkbox";
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `标记“${task.text}”为${task.completed ? "未完成" : "完成"}`);
    taskText.className = "task-text";
    taskText.textContent = task.text;

    listItem.append(checkbox, taskText);
    listItem.addEventListener("click", () => toggleTask(task.id));
    listItem.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleTask(task.id);
      }
    });
    listItem.tabIndex = 0;
    taskList.append(listItem);
  });

  updateProgress();
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const taskText = taskInput.value.trim();

  if (!taskText) {
    return;
  }

  tasks.push({
    id: Date.now(),
    text: taskText,
    completed: false,
  });

  saveTasks();
  renderTasks();
  taskForm.reset();
  taskInput.focus();
});

const now = new Date();
document.querySelector("#weekday").textContent = new Intl.DateTimeFormat("zh-CN", {
  weekday: "long",
}).format(now);
document.querySelector("#today").textContent = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
}).format(now);

renderTasks();
