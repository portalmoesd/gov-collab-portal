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

    // Dock-style collapsible sidebar (hover to expand)
    sidebar.classList.add("sidebar-dock");

    const role = String(user.role || "").toLowerCase();
    const items = ROLE_NAV[role] || [];
    const activeFile = location.pathname.split("/").pop();

    const initials = (user.fullName || user.username || "U").trim().split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()||"").join("") || "U";

    function iconSvg(name){
      const svgs = {
        dashboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm10 0a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V4zM4 14a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6zm10 0a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-6z"/></svg>`,
        calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1zm14 8H3v9a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-9z"/></svg>`,
        library: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6a3 3 0 0 1 3-3h5.5a2.5 2.5 0 0 1 1.77.73l1 1A2.5 2.5 0 0 0 17.04 6H20a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6zm3-1a1 1 0 0 0-1 1v1h11.04c.66 0 1.3-.26 1.77-.73l.19-.19H7z"/></svg>`,
        stats: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21a1 1 0 0 1-1-1V4a1 1 0 0 1 2 0v15h16a1 1 0 1 1 0 2H4zm4-4a1 1 0 0 1-1-1V11a1 1 0 1 1 2 0v5a1 1 0 0 1-1 1zm5 0a1 1 0 0 1-1-1V7a1 1 0 1 1 2 0v9a1 1 0 0 1-1 1zm5 0a1 1 0 0 1-1-1V9a1 1 0 1 1 2 0v7a1 1 0 0 1-1 1z"/></svg>`,
        admin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a2 2 0 0 1 2 2v1.06a7.01 7.01 0 0 1 2.09.87l.75-.75a2 2 0 1 1 2.83 2.83l-.75.75c.36.66.64 1.36.82 2.1H21a2 2 0 1 1 0 4h-1.06a7.01 7.01 0 0 1-.87 2.09l.75.75a2 2 0 1 1-2.83 2.83l-.75-.75A7.01 7.01 0 0 1 14 19.94V21a2 2 0 1 1-4 0v-1.06a7.01 7.01 0 0 1-2.09-.87l-.75.75a2 2 0 1 1-2.83-2.83l.75-.75A7.01 7.01 0 0 1 4.06 14H3a2 2 0 1 1 0-4h1.06c.18-.74.46-1.44.82-2.1l-.75-.75A2 2 0 1 1 6.96 4.3l.75.75A7.01 7.01 0 0 1 10 4.06V3a2 2 0 0 1 2-2zm0 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>`,
        logout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a2 2 0 0 0-2 2v2a1 1 0 1 0 2 0V5h9a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-9v-2a1 1 0 1 0-2 0v2a2 2 0 0 0 2 2h9a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3h-9z"/><path d="M11.7 8.3a1 1 0 0 1 1.4 0l2.8 2.8a1 1 0 0 1 0 1.4l-2.8 2.8a1 1 0 1 1-1.4-1.4l1.1-1.1H4a1 1 0 1 1 0-2h8.4l-1.1-1.1a1 1 0 0 1 0-1.4z"/></svg>`
      };
      return svgs[name] || svgs.dashboard;
    }

    function iconForLabel(label){
      const l = String(label||"").toLowerCase();
      if (l.includes("calendar")) return "calendar";
      if (l.includes("library")) return "library";
      if (l.includes("stat")) return "stats";
      if (l.includes("admin")) return "admin";
      return "dashboard";
    }

    sidebar.innerHTML = `
      <div class="dock-top">
        <div class="dock-brand">
          <div class="dock-logo" aria-hidden="true"></div>
          <div class="dock-wordmark">
            <div class="dock-title">GOV COLLAB</div>
            <div class="dock-subtitle">Portal</div>
          </div>
        </div>
      </div>

      <div class="dock-user">
        <div class="dock-avatar" title="${escapeHtml(user.fullName || user.username || "")}">${escapeHtml(initials)}</div>
        <div class="dock-usertext">
          <div class="dock-name">${escapeHtml(user.fullName || user.username || "")}</div>
          <div class="dock-role">${escapeHtml(roleToTitle(role))}</div>
        </div>
      </div>

      <nav class="dock-nav" id="nav"></nav>

      <div class="dock-bottom">
        <button class="dock-link dock-logout" id="logoutBtn" type="button">
          <span class="dock-ic">${iconSvg("logout")}</span>
          <span class="dock-label">Logout</span>
        </button>
      </div>
    `;

    const nav = sidebar.querySelector("#nav");
    for (const it of items){
      const a = document.createElement("a");
      a.href = it.href;
      a.className = "dock-link";
      const ic = iconForLabel(it.label);
      a.innerHTML = `<span class="dock-ic">${iconSvg(ic)}</span><span class="dock-label">${escapeHtml(it.label)}</span>`;
      if (activeFile === it.href) a.classList.add("active");
      nav.appendChild(a);
    }

    sidebar.querySelector("#logoutBtn").addEventListener("click", () => {
      localStorage.removeItem("gcp_token");
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
