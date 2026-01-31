//
function formatTbilisiDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  const dateParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tbilisi',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tbilisi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const dd = dateParts.find(p => p.type === 'day')?.value;
  const mm = dateParts.find(p => p.type === 'month')?.value;
  const yyyy = dateParts.find(p => p.type === 'year')?.value;
  const hh = timeParts.find(p => p.type === 'hour')?.value;
  const min = timeParts.find(p => p.type === 'minute')?.value;

  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function formatTbilisiDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tbilisi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

// GOV COLLAB PORTAL - app.js (shared layout + auth)
(function(){
  // Navigation per role (file names stay the same; labels reflect the renamed roles)
  const ROLE_NAV = {
    admin: [
      { href: "admin.html", label: "Admin" },
      { href: "calendar.html", label: "Calendar" },
      { href: "library.html", label: "Library" },
      { href: "statistics.html", label: "Statistics" },
    ],
    chairman: [ // displayed as Deputy
      { href: "dashboard-chairman.html", label: "Dashboard" },
      { href: "calendar.html", label: "Calendar" },
      { href: "library.html", label: "Library" },
      { href: "statistics.html", label: "Statistics" },
    ],
    minister: [
      { href: "calendar.html", label: "Calendar" },
      { href: "library.html", label: "Library" },
      { href: "statistics.html", label: "Statistics" },
    ],
    supervisor: [
      { href: "dashboard-supervisor.html", label: "Dashboard" },
      { href: "calendar.html", label: "Calendar" },
      { href: "library.html", label: "Library" },
      { href: "statistics.html", label: "Statistics" },
    ],
    protocol: [
      { href: "calendar.html", label: "Calendar" },
      { href: "library.html", label: "Library" },
      { href: "statistics.html", label: "Statistics" },
    ],
    super_collaborator: [
      { href: "dashboard-collab.html", label: "Dashboard" },
      { href: "calendar.html", label: "Calendar (Read)" },
      { href: "library.html", label: "Library" },
      { href: "statistics.html", label: "Statistics" },
    ],
    collaborator: [
      { href: "dashboard-collab.html", label: "Dashboard" },
      { href: "calendar.html", label: "Calendar (Read)" },
      { href: "statistics.html", label: "Statistics" },
    ],
    viewer: [
      { href: "statistics.html", label: "Statistics" },
    ],
  };

  function escapeHtml(s){
    return String(s || "").replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function roleToTitle(r){
    const map = {
      admin:"Admin",
      chairman:"Deputy",
      minister:"Minister",
      supervisor:"Supervisor",
      protocol:"Protocol",
      super_collaborator:"Super-collaborator",
      collaborator:"Collaborator",
      viewer:"Viewer"
    };
    return map[String(r||"").toLowerCase()] || r;
  }

  function buildSidebar(user){
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    const role = String(user.role || "").toLowerCase();
    const items = ROLE_NAV[role] || [];

    const activeFile = location.pathname.split("/").pop();

    sidebar.innerHTML = `
      <div class="brand">GOV COLLAB PORTAL</div>
      <div class="user-badge">
        <div class="name">${escapeHtml(user.fullName || user.username || "")}</div>
        <div class="role">${escapeHtml(roleToTitle(role))}</div>
      </div>
      <nav class="nav" id="nav"></nav>
      <div style="margin-top:auto; padding:14px 6px 0;">
        <button class="btn" id="logoutBtn" style="width:100%;">Logout</button>
      </div>
    `;

    const nav = sidebar.querySelector("#nav");
    for (const it of items){
      const a = document.createElement("a");
      a.href = it.href;
      a.textContent = it.label;
      if (activeFile === it.href) a.classList.add("active");
      nav.appendChild(a);
    }

    sidebar.querySelector("#logoutBtn").addEventListener("click", () => {
      localStorage.removeItem("gcp_token");
      localStorage.removeItem("gcp_user");
      const next = encodeURIComponent(window.location.pathname.split("/").pop() + window.location.search + window.location.hash);
      location.href = `login.html?next=${next}`;
    });
  }

  async function requireAuth(){
    const token = localStorage.getItem("gcp_token");
    if (!token){
      const next = encodeURIComponent(window.location.pathname.split("/").pop() + window.location.search + window.location.hash);
      location.href = `login.html?next=${next}`;
      return null;
    }
    try{
      const me = await window.GCP.apiFetch("/auth/me", { method:"GET" });
      localStorage.setItem("gcp_user", JSON.stringify(me));
      buildSidebar(me);
      return me;
    }catch(err){
      localStorage.removeItem("gcp_token");
      localStorage.removeItem("gcp_user");
      const next = encodeURIComponent(window.location.pathname.split("/").pop() + window.location.search + window.location.hash);
      location.href = `login.html?next=${next}`;
      return null;
    }
  }

  window.GCP = window.GCP || {};
  window.GCP.requireAuth = requireAuth;
  window.GCP.escapeHtml = escapeHtml;
  window.GCP.roleToTitle = roleToTitle;
  window.GCP.formatDate = formatTbilisiDate;
  window.GCP.formatDateTime = formatTbilisiDateTime;
})();
