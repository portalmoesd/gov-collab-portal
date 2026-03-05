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
      location.href = "login.html";
    });
  }

  async function requireAuth(){
    const token = localStorage.getItem("gcp_token");
    if (!token){
      location.href = "login.html";
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
      location.href = "login.html";
      return null;
    }
  }

  window.GCP = window.GCP || {};
  window.GCP.requireAuth = requireAuth;
  window.GCP.escapeHtml = escapeHtml;
  window.GCP.roleToTitle = roleToTitle;

  // ------------------------------
  // Dynamic document status progress bar
  // ------------------------------
  // submitterRole: 'supervisor' | 'deputy' | 'minister' (or undefined)
  window.GCP.getStatusSteps = function(submitterRole){
    const raw = String(submitterRole || '').toLowerCase();
    const r = raw === 'chairman' ? 'deputy' : raw;
    if (r === 'supervisor') return ['Draft','Supervisor','Approved'];
    if (r === 'minister') return ['Draft','Supervisor','Deputy','Minister','Approved'];
    // default (deputy)
    return ['Draft','Supervisor','Deputy','Approved'];
  };

  // Map document_status.status to an index in the steps array
  window.GCP.statusToStepIndex = function(status, submitterRole){
    const s = String(status || '').toLowerCase();
    // Backend stores deputy as 'chairman'. Normalize to 'deputy' for UI.
    const rawRole = String(submitterRole || '').toLowerCase();
    const r = rawRole === 'chairman' ? 'deputy' : rawRole;

    if (!s || s === 'draft' || s === 'returned') return 0;
    if (s === 'submitted_to_supervisor') return 1;
    if (s === 'submitted_to_chairman') {
      // If the flow ends at Supervisor, we should never see this, but keep safe.
      return r === 'supervisor' ? 1 : 2;
    }
    if (s === 'submitted_to_minister') {
      // Draft -> Supervisor -> Deputy -> Minister
      return r === 'minister' ? 3 : 0;
    }
    if (s === 'approved') return window.GCP.getStatusSteps(r).length - 1;
    return 0;
  };

  window.GCP.renderStatusProgress = function(status, submitterRole){
    const steps = window.GCP.getStatusSteps(submitterRole);
    const active = window.GCP.statusToStepIndex(status, submitterRole);

    const stepsHtml = steps.map((label, idx) => {
      const isDone = idx < active;
      const isActive = idx === active;
      const cls = isActive ? 'gcp-step active' : (isDone ? 'gcp-step done' : 'gcp-step');
      return `\n        <div class="${cls}">\n          <div class="gcp-dot" aria-hidden="true"></div>\n          <div class="gcp-label">${escapeHtml(label)}</div>\n        </div>\n      `;
    }).join('');

    return `\n      <div class="gcp-progress" role="group" aria-label="Document status">\n        <div class="gcp-line" aria-hidden="true"></div>\n        ${stepsHtml}\n      </div>\n    `;
  };
})();
