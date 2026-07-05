/* Site-wide auth via Amazon Cognito (ap-south-1). Include with:
   <script src="/auth.js" defer></script>
   Renders a Login button into .nav (top right); shows the user's name when signed in. */
(function () {
  const REGION = "ap-south-1";
  const CLIENT_ID = "6uk5jc5eebnd64dri691jbapun";
  const ENDPOINT = "https://cognito-idp." + REGION + ".amazonaws.com/";

  const store = {
    get idToken() { return localStorage.getItem("authIdToken"); },
    set idToken(v) { v ? localStorage.setItem("authIdToken", v) : localStorage.removeItem("authIdToken"); },
    get refreshToken() { return localStorage.getItem("authRefreshToken"); },
    set refreshToken(v) { v ? localStorage.setItem("authRefreshToken", v) : localStorage.removeItem("authRefreshToken"); }
  };

  function cognito(op, body) {
    return fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService." + op
      },
      body: JSON.stringify(body)
    }).then(async res => {
      const data = await res.json();
      if (!res.ok) {
        throw new Error((data.message || data.__type || "Request failed").replace(/^.*#/, ""));
      }
      return data;
    });
  }

  function parseJwt(token) {
    try {
      return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    } catch {
      return null;
    }
  }

  function currentUser() {
    const token = store.idToken;
    if (!token) { return null; }
    const claims = parseJwt(token);
    if (!claims) { return null; }
    return { name: claims.name || claims.email, email: claims.email, expired: claims.exp * 1000 < Date.now() };
  }

  async function tryRefresh() {
    if (!store.refreshToken) { return false; }
    try {
      const data = await cognito("InitiateAuth", {
        ClientId: CLIENT_ID,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN: store.refreshToken }
      });
      store.idToken = data.AuthenticationResult.IdToken;
      return true;
    } catch {
      store.idToken = null;
      store.refreshToken = null;
      return false;
    }
  }

  function signOut() {
    store.idToken = null;
    store.refreshToken = null;
    renderNav();
  }

  /* ---------- UI ---------- */

  const css = `
    .auth-area { display: flex; align-items: center; gap: 10px; margin-left: auto; }
    .auth-btn { border: 1px solid rgba(99,102,241,0.5); background: rgba(99,102,241,0.12); color: #c7d2fe;
      border-radius: 10px; padding: 8px 18px; font-size: 14px; font-weight: 600; cursor: pointer;
      font-family: inherit; box-shadow: none; }
    .auth-btn:hover { background: rgba(99,102,241,0.25); transform: none; box-shadow: none; }
    .auth-user { color: #e2e8f0; font-size: 14px; font-weight: 600; }
    .auth-link { background: none; border: none; color: #94a3b8; font-size: 13px; cursor: pointer;
      padding: 4px; text-decoration: underline; box-shadow: none; font-family: inherit; }
    .auth-link:hover { color: #ffffff; background: none; transform: none; box-shadow: none; }
    .auth-overlay { position: fixed; inset: 0; background: rgba(3,6,15,0.75); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
    .auth-modal { background: #0d1222; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.6); width: 100%; max-width: 380px; padding: 28px; color: #f8fafc;
      font-family: 'Inter', system-ui, sans-serif; text-align: left; }
    .auth-modal h2 { margin: 0 0 6px; font-size: 22px; color: #ffffff; }
    .auth-modal .auth-sub { color: #94a3b8; font-size: 14px; margin: 0 0 18px; }
    .auth-modal label { display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin: 12px 0 6px; }
    .auth-modal input { width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: #f8fafc; font-size: 15px;
      padding: 11px 13px; outline: none; }
    .auth-modal input:focus { border-color: #6366f1; }
    .auth-submit { width: 100%; margin-top: 18px; background: #6366f1; border: none; border-radius: 10px;
      color: white; cursor: pointer; font-size: 15px; font-weight: 700; padding: 12px; font-family: inherit; }
    .auth-submit:hover { background: #4f46e5; }
    .auth-submit:disabled { opacity: 0.6; cursor: wait; }
    .auth-error { color: #fda4af; font-size: 13px; min-height: 18px; margin: 10px 0 0; }
    .auth-switch { color: #94a3b8; font-size: 13px; margin-top: 16px; text-align: center; }
    .auth-close { position: absolute; background: none; border: none; color: #64748b; font-size: 22px;
      cursor: pointer; margin: -12px 0 0 316px; box-shadow: none; padding: 4px; }
    .auth-close:hover { color: #ffffff; background: none; transform: none; box-shadow: none; }
    .site-back { display: inline-flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; flex: 0 0 36px; background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: #94a3b8;
      font-size: 17px; line-height: 1; cursor: pointer; box-shadow: none; padding: 0;
      font-family: 'Inter', system-ui, sans-serif; transition: all 0.2s; }
    .site-back:hover { background: rgba(99,102,241,0.2); border-color: rgba(99,102,241,0.5);
      color: #ffffff; transform: none; box-shadow: none; }
    .site-back-fallback { position: fixed; bottom: 22px; left: 22px; z-index: 900;
      width: auto; padding: 10px 18px; border-radius: 99px; background: rgba(13,18,34,0.92);
      backdrop-filter: blur(8px); box-shadow: 0 8px 24px rgba(0,0,0,0.45); font-size: 14px; font-weight: 600; }
  `;

  let overlay = null;

  function closeModal() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function field(labelText, type, id, placeholder) {
    return '<label for="' + id + '">' + labelText + '</label>' +
      '<input type="' + type + '" id="' + id + '" placeholder="' + placeholder + '" autocomplete="off">';
  }

  function showModal(view, prefill) {
    closeModal();
    overlay = document.createElement("div");
    overlay.className = "auth-overlay";

    let inner = '<button class="auth-close" data-act="close">&times;</button>';
    if (view === "login") {
      inner += '<h2>Welcome back</h2><p class="auth-sub">Log in to your account</p>' +
        field("Email", "email", "authEmail", "you@example.com") +
        field("Password", "password", "authPass", "Your password") +
        '<button class="auth-submit" data-act="login">Log In</button>' +
        '<p class="auth-error" id="authErr"></p>' +
        '<p class="auth-switch">New here? <button class="auth-link" data-act="show-signup">Create an account</button></p>';
    } else if (view === "signup") {
      inner += '<h2>Create account</h2><p class="auth-sub">Sign up once — log in anytime after</p>' +
        field("Your name", "text", "authName", "Shown on leaderboards") +
        field("Email", "email", "authEmail", "you@example.com") +
        field("Password", "password", "authPass", "Min 8 characters") +
        '<button class="auth-submit" data-act="signup">Sign Up</button>' +
        '<p class="auth-error" id="authErr"></p>' +
        '<p class="auth-switch">Already have an account? <button class="auth-link" data-act="show-login">Log in</button></p>';
    } else {
      inner += '<h2>Check your email</h2><p class="auth-sub">We sent a 6-digit code to <b>' + prefill.email + '</b></p>' +
        field("Verification code", "text", "authCode", "123456") +
        '<button class="auth-submit" data-act="confirm">Verify &amp; Log In</button>' +
        '<p class="auth-error" id="authErr"></p>' +
        '<p class="auth-switch"><button class="auth-link" data-act="resend">Resend code</button></p>';
    }

    const modal = document.createElement("div");
    modal.className = "auth-modal";
    modal.innerHTML = inner;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", e => { if (e.target === overlay) { closeModal(); } });
    modal.addEventListener("click", async e => {
      const act = e.target.dataset && e.target.dataset.act;
      if (!act) { return; }
      const err = document.getElementById("authErr");
      const busy = on => { modal.querySelectorAll(".auth-submit").forEach(b => { b.disabled = on; }); };

      if (act === "close") { closeModal(); }
      if (act === "show-signup") { showModal("signup"); }
      if (act === "show-login") { showModal("login"); }

      if (act === "signup") {
        const name = document.getElementById("authName").value.trim();
        const email = document.getElementById("authEmail").value.trim();
        const pass = document.getElementById("authPass").value;
        if (!name || !email || pass.length < 8) { err.innerText = "Fill all fields (password min 8 chars)."; return; }
        busy(true);
        try {
          await cognito("SignUp", {
            ClientId: CLIENT_ID, Username: email, Password: pass,
            UserAttributes: [{ Name: "name", Value: name }, { Name: "email", Value: email }]
          });
          showModal("confirm", { email, pass });
        } catch (ex) { err.innerText = ex.message; busy(false); }
      }

      if (act === "confirm") {
        const code = document.getElementById("authCode").value.trim();
        if (!code) { err.innerText = "Enter the code from your email."; return; }
        busy(true);
        try {
          await cognito("ConfirmSignUp", { ClientId: CLIENT_ID, Username: prefill.email, ConfirmationCode: code });
          await doLogin(prefill.email, prefill.pass);
        } catch (ex) { err.innerText = ex.message; busy(false); }
      }

      if (act === "resend") {
        try {
          await cognito("ResendConfirmationCode", { ClientId: CLIENT_ID, Username: prefill.email });
          err.innerText = "Code re-sent.";
        } catch (ex) { err.innerText = ex.message; }
      }

      if (act === "login") {
        const email = document.getElementById("authEmail").value.trim();
        const pass = document.getElementById("authPass").value;
        if (!email || !pass) { err.innerText = "Enter email and password."; return; }
        busy(true);
        try {
          await doLogin(email, pass);
        } catch (ex) {
          if (ex.message === "UserNotConfirmedException" || /not confirmed/i.test(ex.message)) {
            try { await cognito("ResendConfirmationCode", { ClientId: CLIENT_ID, Username: email }); } catch {}
            showModal("confirm", { email, pass });
          } else {
            err.innerText = ex.message; busy(false);
          }
        }
      }
    });
  }

  async function doLogin(email, pass) {
    const data = await cognito("InitiateAuth", {
      ClientId: CLIENT_ID,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: email, PASSWORD: pass }
    });
    store.idToken = data.AuthenticationResult.IdToken;
    store.refreshToken = data.AuthenticationResult.RefreshToken;
    const user = currentUser();
    if (user && user.name) { localStorage.setItem("playerName", user.name.slice(0, 20)); }
    closeModal();
    renderNav();
  }

  function renderNav() {
    let area = document.querySelector(".auth-area");
    if (!area) {
      const nav = document.querySelector(".nav");
      if (!nav) { return; }
      area = document.createElement("div");
      area.className = "auth-area";
      nav.appendChild(area);
    }
    const user = currentUser();
    if (user && !user.expired) {
      area.innerHTML = '<span class="auth-user">👤 ' + user.name.replace(/[<>&]/g, "") + '</span>' +
        '<button class="auth-link" id="authOut">Logout</button>';
      document.getElementById("authOut").onclick = signOut;
    } else {
      area.innerHTML = '<button class="auth-btn" id="authIn">Login</button>';
      document.getElementById("authIn").onclick = () => showModal("login");
    }
  }

  window.siteAuth = { currentUser, showLogin: () => showModal("login"), signOut };

  function renderBackButton() {
    const path = location.pathname.replace(/index\.html$/, "");
    if (path === "/" || document.querySelector(".site-back")) { return; }
    const btn = document.createElement("button");
    btn.className = "site-back";
    btn.setAttribute("aria-label", "Go back to previous page");
    btn.setAttribute("title", "Back");
    btn.onclick = () => {
      let sameOrigin = false;
      try { sameOrigin = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch {}
      if (sameOrigin && history.length > 1) {
        history.back();
      } else {
        location.href = "/";
      }
    };
    const nav = document.querySelector(".nav");
    const brand = nav && nav.querySelector(".brand");
    if (nav && brand) {
      btn.innerHTML = "&larr;";
      const left = document.createElement("div");
      left.style.cssText = "display:flex;align-items:center;gap:12px;";
      nav.insertBefore(left, nav.firstChild);
      left.appendChild(btn);
      left.appendChild(brand);
    } else {
      btn.innerHTML = "&larr; Back";
      btn.classList.add("site-back-fallback");
      document.body.appendChild(btn);
    }
  }

  function init() {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const user = currentUser();
    if (user && user.expired) {
      tryRefresh().then(renderNav);
    }
    renderNav();
    renderBackButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
