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

  function redirectByRole(role){
    const r = String(role||"").toLowerCase();
    if (r === "admin") location.href = "admin.html";
    else if (r === "chairman") location.href = "dashboard-chairman.html";
    else if (r === "supervisor") location.href = "dashboard-supervisor.html";
    else if (r === "collaborator") location.href = "dashboard-collab.html";
    else if (r === "protocol") location.href = "calendar.html";
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
      redirectByRole(data.user.role);
    }catch(err){
      errBox.textContent = err.message || "Login failed";
    }
  });
})();
