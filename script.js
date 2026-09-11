const STORAGE_KEY = "yunni-dashboard-v2";
const OLD_TASKS_KEY = "study-dashboard-tasks";

const now = new Date();
const isoToday = now.toISOString().slice(0, 10);

const defaultState = {
  tasks: [],
  radar: [],
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.tasks) && Array.isArray(saved.radar)) return saved;
  } catch (error) {
    console.warn("无法读取 V2 数据", error);
  }

  let migrated = [];
  try {
    const oldTasks = JSON.parse(localStorage.getItem(OLD_TASKS_KEY) || "[]");
    if (Array.isArray(oldTasks)) {
      migrated = oldTasks.map((task) => ({
        id: task.id || Date.now() + Math.random(),
        text: task.text,
        completed: Boolean(task.completed),
        category: "study",
        priority: "normal",
        createdAt: new Date().toISOString(),
        completedAt: task.completed ? new Date().toISOString() : null,
      }));
    }
  } catch (error) {
    console.warn("旧数据迁移失败", error);
  }

  return { ...defaultState, tasks: migrated };
}

let state = loadState();
let currentFilter = "all";

const taskForm = document.querySelector("#task-form");
const taskInput = document.querySelector("#task-input");
const taskCategory = document.querySelector("#task-category");
const taskPriority = document.querySelector("#task-priority");
const taskList = document.querySelector("#task-list");
const emptyState = document.querySelector("#empty-state");
const progressTrack = document.querySelector(".progress-track");
const progressFill = document.querySelector("#progress-fill");
const progressPig = document.querySelector("#progress-pig");

const radarForm = document.querySelector("#radar-form");
const radarInput = document.querySelector("#radar-input");
const radarDate = document.querySelector("#radar-date");
const radarType = document.querySelector("#radar-type");
const radarList = document.querySelector("#radar-list");
const radarEmpty = document.querySelector("#radar-empty");

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function categoryLabel(category) {
  return { study: "学习", school: "学校", life: "生活" }[category] || "其他";
}

function radarTypeLabel(type) {
  return { deadline: "截止事项", exam: "考试", project: "长期项目" }[type] || "事项";
}

function formatDate(dateString) {
  if (!dateString) return "暂无日期";
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

function updateTodayStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.completed).length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

  document.querySelector("#completed-count").textContent = completed;
  document.querySelector("#total-count").textContent = total;
  document.querySelector("#percentage").textContent = `${percentage}%`;
  document.querySelector("#high-priority-count").textContent = state.tasks.filter((task) => task.priority === "high" && !task.completed).length;
  document.querySelector("#study-count").textContent = state.tasks.filter((task) => task.category === "study" && !task.completed).length;

  progressFill.style.width = `${percentage}%`;
  progressPig.style.left = `${percentage}%`;
  progressTrack.setAttribute("aria-valuenow", percentage);

  const copy = document.querySelector("#focus-copy");
  if (total === 0) copy.textContent = "先加一件今天最重要的事。";
  else if (percentage === 100) copy.textContent = "今天的清单已经清空啦，去休息一下 🐷";
  else if (percentage >= 60) copy.textContent = "已经过半，剩下的不用急着一口气做完。";
  else copy.textContent = "从最小的一件开始，做完再看下一件。";
}

function toggleTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.completed = !task.completed;
  task.completedAt = task.completed ? new Date().toISOString() : null;
  saveState();
  renderAll();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((item) => item.id !== id);
  saveState();
  renderAll();
}

function renderTasks() {
  taskList.replaceChildren();
  const filtered = currentFilter === "all" ? state.tasks : state.tasks.filter((task) => task.category === currentFilter);

  filtered.forEach((task) => {
    const item = document.createElement("li");
    item.className = `task-item${task.completed ? " completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `切换任务：${task.text}`);
    checkbox.addEventListener("change", () => toggleTask(task.id));

    const content = document.createElement("div");
    content.className = "task-content";

    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;

    const meta = document.createElement("div");
    meta.className = "task-meta";
    const category = document.createElement("span");
    category.className = "task-badge";
    category.textContent = categoryLabel(task.category);
    meta.append(category);
    content.append(text, meta);

    const priority = document.createElement("span");
    priority.className = `task-badge${task.priority === "high" ? " high" : ""}`;
    priority.textContent = task.priority === "high" ? "重要" : "普通";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.setAttribute("aria-label", `删除任务：${task.text}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => deleteTask(task.id));

    item.append(checkbox, content, priority, remove);
    taskList.append(item);
  });

  emptyState.hidden = filtered.length > 0;
  updateTodayStats();
}

function renderRadar() {
  radarList.replaceChildren();

  const sorted = [...state.radar].sort((a, b) => {
    if (!a.date && !b.date) return b.createdAt.localeCompare(a.createdAt);
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  sorted.forEach((item) => {
    const row = document.createElement("div");
    row.className = `radar-item ${item.type}`;

    const dot = document.createElement("span");
    dot.className = "radar-dot";

    const content = document.createElement("div");
    const title = document.createElement("div");
    title.className = "radar-title";
    title.textContent = item.text;
    const meta = document.createElement("div");
    meta.className = "radar-meta";
    meta.textContent = radarTypeLabel(item.type);
    content.append(title, meta);

    const date = document.createElement("span");
    date.className = "radar-date";
    date.textContent = formatDate(item.date);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `删除雷达事项：${item.text}`);
    remove.addEventListener("click", () => {
      state.radar = state.radar.filter((radar) => radar.id !== item.id);
      saveState();
      renderRadar();
    });

    row.append(dot, content, date, remove);
    radarList.append(row);
  });

  radarEmpty.hidden = sorted.length > 0;
}

function startOfWeek(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function renderReview() {
  const start = startOfWeek();
  const createdThisWeek = state.tasks.filter((task) => new Date(task.createdAt || 0) >= start);
  const completedThisWeek = state.tasks.filter((task) => task.completedAt && new Date(task.completedAt) >= start);
  const studyCompleted = completedThisWeek.filter((task) => task.category === "study").length;
  const rate = createdThisWeek.length === 0 ? 0 : Math.round((completedThisWeek.length / createdThisWeek.length) * 100);

  document.querySelector("#week-completed").textContent = completedThisWeek.length;
  document.querySelector("#week-rate").textContent = `${Math.min(rate, 100)}%`;
  document.querySelector("#week-study").textContent = studyCompleted;

  const message = document.querySelector("#review-message");
  if (createdThisWeek.length === 0) {
    message.textContent = "这周还没有新任务。等你开始记录后，这里会自动长出一份属于你的周复盘。";
  } else if (rate >= 80) {
    message.textContent = `这周完成了 ${completedThisWeek.length} 项任务，节奏很稳。下周不用加更多，先保持这种完成感。`;
  } else if (rate >= 50) {
    message.textContent = `这周完成了 ${completedThisWeek.length} 项。已经过半，可以看看剩下的任务是不是太大，拆小一点会更容易开始。`;
  } else {
    message.textContent = `这周一共创建了 ${createdThisWeek.length} 项、完成 ${completedThisWeek.length} 项。下周可以少放一点任务，让清单更接近真实能做完的量。`;
  }
}

function renderAll() {
  renderTasks();
  renderRadar();
  renderReview();
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text) return;

  state.tasks.unshift({
    id: Date.now(),
    text,
    completed: false,
    category: taskCategory.value,
    priority: taskPriority.value,
    createdAt: new Date().toISOString(),
    completedAt: null,
  });

  saveState();
  taskForm.reset();
  taskCategory.value = "study";
  taskPriority.value = "normal";
  renderAll();
  taskInput.focus();
});

radarForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = radarInput.value.trim();
  if (!text) return;

  state.radar.push({
    id: Date.now(),
    text,
    date: radarDate.value || "",
    type: radarType.value,
    createdAt: new Date().toISOString(),
  });

  saveState();
  radarForm.reset();
  renderRadar();
});

document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    currentFilter = button.dataset.filter;
    renderTasks();
  });
});

const viewTitles = {
  today: ["TODAY", "今天，慢慢完成就好。"],
  radar: ["RADAR", "把未来的重要事放在这里。"],
  review: ["REVIEW", "看看这一周，留下了什么。"],
};

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.view;
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `${target}-view`));
    document.querySelector("#view-eyebrow").textContent = viewTitles[target][0];
    document.querySelector("#view-title").textContent = viewTitles[target][1];
  });
});

document.querySelector("#export-button").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `yunni-dashboard-backup-${isoToday}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#import-input").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.tasks) || !Array.isArray(imported.radar)) throw new Error("格式不正确");
    state = imported;
    saveState();
    renderAll();
  } catch (error) {
    alert("这个备份文件好像不对，请换一个 JSON 备份文件。");
  }
  event.target.value = "";
});

document.querySelector("#weekday").textContent = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
document.querySelector("#today").textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(now);

renderAll();
