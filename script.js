const SUPABASE_URL = "https://lmjtlfhphdgpuhhlwynx.supabase.co";
const SUPABASE_KEY = "sb_publishable_QxrLpTNHgHLGDb5jWCoXWA_R6lMgCAD";
const cloud = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const LEGACY_KEY = "yunni-dashboard-v2";
const OLD_TASKS_KEY = "study-dashboard-tasks";
const now = new Date();

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const todayKey = localDateKey();
let currentUser = null;
let currentFilter = "all";
let state = { tasks: [], allTasks: [], radar: [] };

const $ = (selector) => document.querySelector(selector);
const authScreen = $("#auth-screen");
const appShell = $("#app-shell");
const authForm = $("#auth-form");
const authEmail = $("#auth-email");
const authPassword = $("#auth-password");
const authMessage = $("#auth-message");
const syncStatus = $("#sync-status");
const taskForm = $("#task-form");
const taskInput = $("#task-input");
const taskCategory = $("#task-category");
const taskPriority = $("#task-priority");
const taskList = $("#task-list");
const emptyState = $("#empty-state");
const radarForm = $("#radar-form");
const radarInput = $("#radar-input");
const radarDate = $("#radar-date");
const radarType = $("#radar-type");
const radarList = $("#radar-list");
const radarEmpty = $("#radar-empty");

function setSync(text, busy = false) {
  if (!syncStatus) return;
  syncStatus.textContent = `${busy ? "◌" : "●"} ${text}`;
  syncStatus.classList.toggle("busy", busy);
}

function showAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle("error", isError);
}

function categoryLabel(category) {
  return { study: "学习", school: "学校", life: "生活" }[category] || "其他";
}

function radarTypeLabel(type) {
  return { deadline: "截止事项", exam: "考试", project: "长期项目" }[type] || "事项";
}

function formatDate(dateString) {
  if (!dateString) return "暂无日期";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(`${dateString}T00:00:00`));
}

function normalizeTask(row) {
  return {
    id: row.id,
    text: row.text,
    category: row.category,
    priority: row.priority,
    taskDate: row.task_date,
    completed: row.completed,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function normalizeRadar(row) {
  return {
    id: row.id,
    text: row.text,
    date: row.due_date || "",
    type: row.type,
    completed: row.completed,
    createdAt: row.created_at,
  };
}

async function loadCloudData() {
  if (!currentUser) return;
  setSync("同步中…", true);

  const [tasksResult, radarResult] = await Promise.all([
    cloud.from("tasks").select("*").order("created_at", { ascending: false }),
    cloud.from("radar_items").select("*").order("created_at", { ascending: false }),
  ]);

  if (tasksResult.error || radarResult.error) {
    console.error(tasksResult.error || radarResult.error);
    setSync("同步失败");
    return;
  }

  state.allTasks = tasksResult.data.map(normalizeTask);
  state.tasks = state.allTasks.filter((task) => task.taskDate === todayKey);
  state.radar = radarResult.data.map(normalizeRadar);
  renderAll();
  setSync("已同步");
}

async function migrateLocalDataOnce() {
  if (!currentUser) return;
  const marker = `yunni-cloud-migrated:${currentUser.id}`;
  if (localStorage.getItem(marker)) return;

  let legacy = null;
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch (_) {}
  let oldTasks = [];
  try { oldTasks = JSON.parse(localStorage.getItem(OLD_TASKS_KEY) || "[]"); } catch (_) {}

  const taskSource = Array.isArray(legacy?.tasks) ? legacy.tasks : (Array.isArray(oldTasks) ? oldTasks : []);
  const radarSource = Array.isArray(legacy?.radar) ? legacy.radar : [];

  if (taskSource.length) {
    const rows = taskSource.filter((item) => item?.text).map((item) => ({
      user_id: currentUser.id,
      text: String(item.text).slice(0, 100),
      category: ["study", "school", "life"].includes(item.category) ? item.category : "study",
      priority: item.priority === "high" ? "high" : "normal",
      task_date: todayKey,
      completed: Boolean(item.completed),
      completed_at: item.completed ? (item.completedAt || new Date().toISOString()) : null,
      created_at: item.createdAt || new Date().toISOString(),
    }));
    if (rows.length) await cloud.from("tasks").insert(rows);
  }

  if (radarSource.length) {
    const rows = radarSource.filter((item) => item?.text).map((item) => ({
      user_id: currentUser.id,
      text: String(item.text).slice(0, 120),
      due_date: item.date || null,
      type: ["deadline", "exam", "project"].includes(item.type) ? item.type : "deadline",
      created_at: item.createdAt || new Date().toISOString(),
    }));
    if (rows.length) await cloud.from("radar_items").insert(rows);
  }

  localStorage.setItem(marker, "1");
}

async function enterApp(user) {
  currentUser = user;
  authScreen.hidden = true;
  appShell.hidden = false;
  await migrateLocalDataOnce();
  await loadCloudData();
}

function leaveApp() {
  currentUser = null;
  state = { tasks: [], allTasks: [], radar: [] };
  appShell.hidden = true;
  authScreen.hidden = false;
  showAuthMessage("");
}

function updateTodayStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.completed).length;
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  $("#completed-count").textContent = completed;
  $("#total-count").textContent = total;
  $("#percentage").textContent = `${percentage}%`;
  $("#high-priority-count").textContent = state.tasks.filter((task) => task.priority === "high" && !task.completed).length;
  $("#study-count").textContent = state.tasks.filter((task) => task.category === "study" && !task.completed).length;
  $("#progress-fill").style.width = `${percentage}%`;
  $("#progress-pig").style.left = `${percentage}%`;
  $(".progress-track").setAttribute("aria-valuenow", percentage);

  const copy = $("#focus-copy");
  if (!total) copy.textContent = "先加一件今天最重要的事。";
  else if (percentage === 100) copy.textContent = "今天的清单已经清空啦，去休息一下 🐷";
  else if (percentage >= 60) copy.textContent = "已经过半，剩下的不用急着一口气做完。";
  else copy.textContent = "从最小的一件开始，做完再看下一件。";
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
    checkbox.addEventListener("change", () => toggleTask(task));

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
    const dot = document.createElement("span"); dot.className = "radar-dot";
    const content = document.createElement("div");
    const title = document.createElement("div"); title.className = "radar-title"; title.textContent = item.text;
    const meta = document.createElement("div"); meta.className = "radar-meta"; meta.textContent = radarTypeLabel(item.type);
    content.append(title, meta);
    const date = document.createElement("span"); date.className = "radar-date"; date.textContent = formatDate(item.date);
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "delete-button"; remove.textContent = "×";
    remove.addEventListener("click", () => deleteRadar(item.id));
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
  const createdThisWeek = state.allTasks.filter((task) => new Date(task.createdAt) >= start);
  const completedThisWeek = state.allTasks.filter((task) => task.completedAt && new Date(task.completedAt) >= start);
  const studyCompleted = completedThisWeek.filter((task) => task.category === "study").length;
  const rate = createdThisWeek.length ? Math.min(100, Math.round((completedThisWeek.length / createdThisWeek.length) * 100)) : 0;
  $("#week-completed").textContent = completedThisWeek.length;
  $("#week-rate").textContent = `${rate}%`;
  $("#week-study").textContent = studyCompleted;

  const message = $("#review-message");
  if (!createdThisWeek.length) message.textContent = "这周还没有新任务。记录几项之后，这里会自动生成周复盘。";
  else if (rate >= 80) message.textContent = `这周完成了 ${completedThisWeek.length} 项任务。下周不用加更多，保持这个节奏就好。`;
  else if (rate >= 50) message.textContent = `这周完成了 ${completedThisWeek.length} 项，已经过半。剩下的任务可以再拆小一点。`;
  else message.textContent = `这周创建了 ${createdThisWeek.length} 项、完成 ${completedThisWeek.length} 项。下周少放一点，会更接近真实能完成的量。`;
}

function renderAll() {
  renderTasks();
  renderRadar();
  renderReview();
}

async function toggleTask(task) {
  setSync("保存中…", true);
  const completed = !task.completed;
  const { error } = await cloud.from("tasks").update({ completed, completed_at: completed ? new Date().toISOString() : null }).eq("id", task.id);
  if (error) { console.error(error); setSync("保存失败"); return; }
  await loadCloudData();
}

async function deleteTask(id) {
  if (!confirm("删除这项任务吗？")) return;
  setSync("保存中…", true);
  const { error } = await cloud.from("tasks").delete().eq("id", id);
  if (error) { setSync("删除失败"); return; }
  await loadCloudData();
}

async function deleteRadar(id) {
  if (!confirm("从 Radar 删除这件事吗？")) return;
  setSync("保存中…", true);
  const { error } = await cloud.from("radar_items").delete().eq("id", id);
  if (error) { setSync("删除失败"); return; }
  await loadCloudData();
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAuthMessage("正在登录…");
  const { data, error } = await cloud.auth.signInWithPassword({ email: authEmail.value.trim(), password: authPassword.value });
  if (error) return showAuthMessage(error.message === "Invalid login credentials" ? "邮箱或密码不对。" : error.message, true);
  authForm.reset();
  await enterApp(data.user);
});

$("#signup-button").addEventListener("click", async () => {
  if (!authEmail.checkValidity() || authPassword.value.length < 6) {
    showAuthMessage("先填写有效邮箱和至少 6 位密码。", true); return;
  }
  showAuthMessage("正在创建账号…");
  const { data, error } = await cloud.auth.signUp({ email: authEmail.value.trim(), password: authPassword.value });
  if (error) return showAuthMessage(error.message, true);
  if (data.session && data.user) await enterApp(data.user);
  else showAuthMessage("账号已创建。请去邮箱完成验证，再回来登录。🐷");
});

$("#logout-button").addEventListener("click", async () => { await cloud.auth.signOut(); leaveApp(); });
$("#refresh-button").addEventListener("click", loadCloudData);

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text || !currentUser) return;
  setSync("保存中…", true);
  const { error } = await cloud.from("tasks").insert({ user_id: currentUser.id, text, category: taskCategory.value, priority: taskPriority.value, task_date: todayKey });
  if (error) { console.error(error); setSync("保存失败"); return; }
  taskForm.reset(); taskCategory.value = "study"; taskPriority.value = "normal";
  await loadCloudData();
  taskInput.focus();
});

radarForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = radarInput.value.trim();
  if (!text || !currentUser) return;
  setSync("保存中…", true);
  const { error } = await cloud.from("radar_items").insert({ user_id: currentUser.id, text, due_date: radarDate.value || null, type: radarType.value });
  if (error) { console.error(error); setSync("保存失败"); return; }
  radarForm.reset();
  await loadCloudData();
});

document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
  currentFilter = button.dataset.filter;
  renderTasks();
}));

const viewTitles = { today: ["TODAY", "今天，慢慢完成就好。"], radar: ["RADAR", "把未来的重要事放在这里。"], review: ["REVIEW", "看看这一周，留下了什么。"] };
document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
  const target = button.dataset.view;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `${target}-view`));
  $("#view-eyebrow").textContent = viewTitles[target][0];
  $("#view-title").textContent = viewTitles[target][1];
}));

$("#weekday").textContent = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
$("#today").textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(now);

cloud.auth.onAuthStateChange((_event, session) => {
  if (session?.user && !currentUser) enterApp(session.user);
  if (!session?.user && currentUser) leaveApp();
});

(async function boot() {
  const { data } = await cloud.auth.getSession();
  if (data.session?.user) await enterApp(data.session.user);
  else leaveApp();
})();
