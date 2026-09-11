const SUPABASE_URL = "https://lmjtlfhphdgpuhhlwynx.supabase.co";
const SUPABASE_KEY = "sb_publishable_QxrLpTNHgHLGDb5jWCoXWA_R6lMgCAD";
const SESSION_KEY = "yunni-dashboard-session";
const LEGACY_KEY = "yunni-dashboard-v2";
const OLD_TASKS_KEY = "study-dashboard-tasks";
const now = new Date();

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const todayKey = localDateKey();
let currentUser = null;
let currentFilter = "all";
let session = null;
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

function showAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle("error", isError);
}

function setSync(text, busy = false) {
  if (!syncStatus) return;
  syncStatus.textContent = `${busy ? "◌" : "●"} ${text}`;
}

function saveSession(data) {
  session = data?.access_token ? data : null;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch (_) { return null; }
}

async function authRequest(path, body, method = "POST") {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method,
    headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || "请求失败");
  return data;
}

async function refreshSession() {
  if (!session?.refresh_token) return false;
  try {
    const data = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
    saveSession(data);
    return true;
  } catch (_) {
    saveSession(null);
    return false;
  }
}

async function api(path, options = {}, retry = true) {
  const headers = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers });
  if (response.status === 401 && retry && await refreshSession()) return api(path, options, false);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || "云端请求失败");
  return data;
}

async function getCurrentUser() {
  if (!session?.access_token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` },
  });
  if (response.status === 401 && await refreshSession()) return getCurrentUser();
  if (!response.ok) return null;
  return response.json();
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
  return { id: row.id, text: row.text, category: row.category, priority: row.priority, taskDate: row.task_date, completed: row.completed, createdAt: row.created_at, completedAt: row.completed_at };
}
function normalizeRadar(row) {
  return { id: row.id, text: row.text, date: row.due_date || "", type: row.type, createdAt: row.created_at };
}

async function loadCloudData() {
  if (!currentUser) return;
  setSync("同步中…", true);
  try {
    const [tasksRows, radarRows] = await Promise.all([
      api("tasks?select=*&order=created_at.desc"),
      api("radar_items?select=*&order=created_at.desc"),
    ]);
    state.allTasks = (tasksRows || []).map(normalizeTask);
    state.tasks = state.allTasks.filter((task) => task.taskDate === todayKey);
    state.radar = (radarRows || []).map(normalizeRadar);
    renderAll();
    setSync("已同步");
  } catch (error) {
    console.error(error);
    setSync("同步失败");
  }
}

async function migrateLocalDataOnce() {
  if (!currentUser) return;
  const marker = `yunni-cloud-migrated:${currentUser.id}`;
  if (localStorage.getItem(marker)) return;
  let legacy = null;
  let oldTasks = [];
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch (_) {}
  try { oldTasks = JSON.parse(localStorage.getItem(OLD_TASKS_KEY) || "[]"); } catch (_) {}
  const taskSource = Array.isArray(legacy?.tasks) ? legacy.tasks : (Array.isArray(oldTasks) ? oldTasks : []);
  const radarSource = Array.isArray(legacy?.radar) ? legacy.radar : [];
  try {
    if (taskSource.length) {
      const rows = taskSource.filter((x) => x?.text).map((x) => ({
        user_id: currentUser.id,
        text: String(x.text).slice(0, 100),
        category: ["study", "school", "life"].includes(x.category) ? x.category : "study",
        priority: x.priority === "high" ? "high" : "normal",
        task_date: todayKey,
        completed: Boolean(x.completed),
        completed_at: x.completed ? (x.completedAt || new Date().toISOString()) : null,
        created_at: x.createdAt || new Date().toISOString(),
      }));
      await api("tasks", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
    }
    if (radarSource.length) {
      const rows = radarSource.filter((x) => x?.text).map((x) => ({
        user_id: currentUser.id,
        text: String(x.text).slice(0, 120),
        due_date: x.date || null,
        type: ["deadline", "exam", "project"].includes(x.type) ? x.type : "deadline",
        created_at: x.createdAt || new Date().toISOString(),
      }));
      await api("radar_items", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
    }
    localStorage.setItem(marker, "1");
  } catch (error) {
    console.warn("旧数据迁移失败", error);
  }
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
}

function updateTodayStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((t) => t.completed).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  $("#completed-count").textContent = completed;
  $("#total-count").textContent = total;
  $("#percentage").textContent = `${pct}%`;
  $("#high-priority-count").textContent = state.tasks.filter((t) => t.priority === "high" && !t.completed).length;
  $("#study-count").textContent = state.tasks.filter((t) => t.category === "study" && !t.completed).length;
  $("#progress-fill").style.width = `${pct}%`;
  $("#progress-pig").style.left = `${pct}%`;
  const copy = $("#focus-copy");
  copy.textContent = !total ? "先加一件今天最重要的事。" : pct === 100 ? "今天的清单已经清空啦，去休息一下 🐷" : pct >= 60 ? "已经过半，剩下的不用急着一口气做完。" : "从最小的一件开始，做完再看下一件。";
}

function renderTasks() {
  taskList.replaceChildren();
  const filtered = currentFilter === "all" ? state.tasks : state.tasks.filter((t) => t.category === currentFilter);
  filtered.forEach((task) => {
    const item = document.createElement("li"); item.className = `task-item${task.completed ? " completed" : ""}`;
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.className = "task-checkbox"; checkbox.checked = task.completed; checkbox.addEventListener("change", () => toggleTask(task));
    const content = document.createElement("div"); content.className = "task-content";
    const text = document.createElement("span"); text.className = "task-text"; text.textContent = task.text;
    const meta = document.createElement("div"); meta.className = "task-meta";
    const category = document.createElement("span"); category.className = "task-badge"; category.textContent = categoryLabel(task.category); meta.append(category); content.append(text, meta);
    const priority = document.createElement("span"); priority.className = `task-badge${task.priority === "high" ? " high" : ""}`; priority.textContent = task.priority === "high" ? "重要" : "普通";
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "delete-button"; remove.textContent = "×"; remove.addEventListener("click", () => deleteTask(task.id));
    item.append(checkbox, content, priority, remove); taskList.append(item);
  });
  emptyState.hidden = filtered.length > 0;
  updateTodayStats();
}

function renderRadar() {
  radarList.replaceChildren();
  [...state.radar].sort((a, b) => (!a.date ? 1 : !b.date ? -1 : a.date.localeCompare(b.date))).forEach((item) => {
    const row = document.createElement("div"); row.className = `radar-item ${item.type}`;
    const dot = document.createElement("span"); dot.className = "radar-dot";
    const content = document.createElement("div");
    const title = document.createElement("div"); title.className = "radar-title"; title.textContent = item.text;
    const meta = document.createElement("div"); meta.className = "radar-meta"; meta.textContent = radarTypeLabel(item.type); content.append(title, meta);
    const date = document.createElement("span"); date.className = "radar-date"; date.textContent = formatDate(item.date);
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "delete-button"; remove.textContent = "×"; remove.addEventListener("click", () => deleteRadar(item.id));
    row.append(dot, content, date, remove); radarList.append(row);
  });
  radarEmpty.hidden = state.radar.length > 0;
}

function startOfWeek(date = new Date()) { const copy = new Date(date); const day = copy.getDay() || 7; copy.setHours(0,0,0,0); copy.setDate(copy.getDate() - day + 1); return copy; }
function renderReview() {
  const start = startOfWeek();
  const created = state.allTasks.filter((t) => new Date(t.createdAt) >= start);
  const completed = state.allTasks.filter((t) => t.completedAt && new Date(t.completedAt) >= start);
  const rate = created.length ? Math.min(100, Math.round((completed.length / created.length) * 100)) : 0;
  $("#week-completed").textContent = completed.length;
  $("#week-rate").textContent = `${rate}%`;
  $("#week-study").textContent = completed.filter((t) => t.category === "study").length;
  $("#review-message").textContent = !created.length ? "这周还没有新任务。记录几项之后，这里会自动生成周复盘。" : rate >= 80 ? `这周完成了 ${completed.length} 项任务。下周不用加更多，保持这个节奏就好。` : rate >= 50 ? `这周完成了 ${completed.length} 项，已经过半。剩下的任务可以再拆小一点。` : `这周创建了 ${created.length} 项、完成 ${completed.length} 项。下周少放一点，会更接近真实能完成的量。`;
}
function renderAll() { renderTasks(); renderRadar(); renderReview(); }

async function toggleTask(task) {
  try { await api(`tasks?id=eq.${task.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ completed: !task.completed, completed_at: !task.completed ? new Date().toISOString() : null }) }); await loadCloudData(); } catch (e) { setSync("保存失败"); }
}
async function deleteTask(id) {
  if (!confirm("删除这项任务吗？")) return;
  try { await api(`tasks?id=eq.${id}`, { method: "DELETE" }); await loadCloudData(); } catch (e) { setSync("删除失败"); }
}
async function deleteRadar(id) {
  if (!confirm("从 Radar 删除这件事吗？")) return;
  try { await api(`radar_items?id=eq.${id}`, { method: "DELETE" }); await loadCloudData(); } catch (e) { setSync("删除失败"); }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAuthMessage("正在登录…");
  try {
    const data = await authRequest("token?grant_type=password", { email: authEmail.value.trim(), password: authPassword.value });
    saveSession(data);
    authForm.reset();
    await enterApp(data.user);
  } catch (error) {
    showAuthMessage(error.message === "Invalid login credentials" ? "邮箱或密码不对。" : error.message, true);
  }
});

$("#signup-button").addEventListener("click", async () => {
  if (!authEmail.checkValidity() || authPassword.value.length < 6) {
    showAuthMessage("先填写有效邮箱和至少 6 位密码。", true);
    return;
  }
  showAuthMessage("正在创建账号…");
  try {
    const data = await authRequest("signup", { email: authEmail.value.trim(), password: authPassword.value });
    if (data.access_token && data.user) {
      saveSession(data);
      await enterApp(data.user);
    } else {
      showAuthMessage("账号已创建，请去邮箱完成验证，再回来点登录。🐷");
    }
  } catch (error) {
    showAuthMessage(error.message, true);
  }
});

$("#logout-button").addEventListener("click", async () => { saveSession(null); leaveApp(); });
$("#refresh-button").addEventListener("click", loadCloudData);

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = taskInput.value.trim(); if (!text || !currentUser) return;
  try {
    await api("tasks", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: currentUser.id, text, category: taskCategory.value, priority: taskPriority.value, task_date: todayKey }) });
    taskForm.reset(); taskCategory.value = "study"; taskPriority.value = "normal"; await loadCloudData();
  } catch (e) { setSync("保存失败"); }
});

radarForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = radarInput.value.trim(); if (!text || !currentUser) return;
  try {
    await api("radar_items", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: currentUser.id, text, due_date: radarDate.value || null, type: radarType.value }) });
    radarForm.reset(); await loadCloudData();
  } catch (e) { setSync("保存失败"); }
});

document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach((x) => x.classList.remove("active")); button.classList.add("active"); currentFilter = button.dataset.filter; renderTasks();
}));
const viewTitles = { today: ["TODAY", "今天，慢慢完成就好。"], radar: ["RADAR", "把未来的重要事放在这里。"], review: ["REVIEW", "看看这一周，留下了什么。"] };
document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
  const target = button.dataset.view; document.querySelectorAll(".nav-item").forEach((x) => x.classList.toggle("active", x === button)); document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `${target}-view`)); $("#view-eyebrow").textContent = viewTitles[target][0]; $("#view-title").textContent = viewTitles[target][1];
}));

$("#weekday").textContent = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
$("#today").textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(now);

(async function boot() {
  session = loadSession();
  if (!session) return;
  const user = await getCurrentUser();
  if (user) await enterApp(user); else saveSession(null);
})();