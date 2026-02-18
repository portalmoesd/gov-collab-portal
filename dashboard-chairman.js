// login.js
(async function(){
  const token = localStorage.getItem("gcp_token");
  if (token){
    // Try to validate and redirect
    try{
      const me = await window.GCP.apiFetch("/auth/me", { method:"GET" });
      localStorage.setItem("gcp_user", JSON.stringify(me));
      redirectByRole(me.role);
      return;
    }catch(e){
      localStorage.removeItem("gcp_token");
      localStorage.removeItem("gcp_user");
    }
  }

    function safeNext() {
    const raw = new URLSearchParams(window.location.search).get('next');
    if (!raw) return null;
    let decoded;
    try { decoded = decodeURIComponent(raw); } catch { decoded = raw; }
    // allow only same-origin relative pages
    if (decoded.includes('://') || decoded.startsWith('//')) return null;
    const allowed = /^(dashboard-[a-z-]+\.html|calendar\.html|library\.html|admin\.html|tp-editor\.html|editor\.html)([?#].*)?$/i;
    return allowed.test(decoded) ? decoded : null;
  }

function redirectByRole(role){
    const r = String(role||"").toLowerCase();
    if (r === "admin") location.href = "admin.html";
    else if (r === "chairman") location.href = "dashboard-chairman.html"; // Deputy
    else if (r === "supervisor") location.href = "dashboard-supervisor.html";
    else if (r === "super_collaborator") location.href = "dashboard-collab.html";
    else if (r === "collaborator") location.href = "dashboard-collab.html";
    else if (r === "protocol") location.href = "calendar.html";
    else if (r === "minister") location.href = "calendar.html";
    else location.href = "statistics.html";
  }
  const form = document.getElementById("loginForm");
  const errBox = document.getElementById("errBox");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.textContent = "";
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    try{
      const data = await window.GCP.apiFetch("/auth/login", {
        method:"POST",
        body: JSON.stringify({ username, password })
      });
      localStorage.setItem("gcp_token", data.token);
      localStorage.setItem("gcp_user", JSON.stringify(data.user));
      const next = safeNext();
      if (next) return (window.location.href = next);
      redirectByRole(data.user.role);
    }catch(err){
      errBox.textContent = err.message || "Login failed";
    }
  });
})();
