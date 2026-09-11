(() => {
  const SUPABASE_URL = "https://lmjtlfhphdgpuhhlwynx.supabase.co";
  const SUPABASE_KEY = "sb_publishable_QxrLpTNHgHLGDb5jWCoXWA_R6lMgCAD";
  const SESSION_KEY = "yunni-dashboard-session";

  const form = document.querySelector("#auth-form");
  const emailInput = document.querySelector("#auth-email");
  const passwordInput = document.querySelector("#auth-password");
  const signupButton = document.querySelector("#signup-button");
  const message = document.querySelector("#auth-message");

  if (!form || !emailInput || !passwordInput || !signupButton || !message) return;

  const show = (text, error = false) => {
    message.textContent = text;
    message.classList.toggle("error", error);
  };

  async function request(path, body) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.msg || data.error_description || data.message || "请求失败");
      error.code = data.error_code || data.code || "";
      throw error;
    }
    return data;
  }

  function storeSession(data) {
    if (!data?.access_token) throw new Error("登录成功但没有拿到会话，请重试。");
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  async function syncPassword(accessToken, password) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ password }),
      cache: "no-store",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.msg || data.message || "账号已进入，但密码同步失败。");
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    if (!email || !password) return show("请先填写邮箱和密码。", true);

    show("正在登录…");
    try {
      const data = await request("token?grant_type=password", { email, password });
      storeSession(data);
      show("登录成功，正在进入…");
      location.reload();
    } catch (error) {
      const suffix = error.code ? `（${error.code}）` : "";
      show(`登录失败：${error.message}${suffix}`, true);
    }
  }, true);

  signupButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    if (!emailInput.checkValidity() || password.length < 6) {
      return show("先填写有效邮箱和至少 6 位密码。", true);
    }

    show("正在注册…");
    try {
      const data = await request("signup", { email, password });
      if (!data?.access_token || !data?.user) {
        return show("这个邮箱已注册。请直接点“登录”。", true);
      }

      await syncPassword(data.access_token, password);
      storeSession(data);
      show("注册成功，正在进入…");
      location.reload();
    } catch (error) {
      const suffix = error.code ? `（${error.code}）` : "";
      show(`注册失败：${error.message}${suffix}`, true);
    }
  }, true);
})();