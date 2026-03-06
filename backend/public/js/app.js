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
      { href: "dashboard-minister.html", label: "Dashboard" },
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
      { href: "calendar.html", label: "Calendar" },
      { href: "library.html", label: "Library" },
      { href: "statistics.html", label: "Statistics" },
    ],
    collaborator: [
      { href: "dashboard-collab.html", label: "Dashboard" },
      { href: "calendar.html", label: "Calendar" },
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
        dashboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13.5a2 2 0 0 0 2 2h4.5v4.5a2 2 0 0 0 2 2h3.5a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v1.5zM4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z"/></svg>`,
        calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1zm14 8H3v9a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-9z"/></svg>`,
        library: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h10a3 3 0 0 1 3 3v15a1 1 0 0 1-1.5.86L11 19.5l-4.5 2.36A1 1 0 0 1 5 21V6a3 3 0 0 1-1-2.22V3zM18 6h2a2 2 0 0 1 2 2v13a1 1 0 0 1-1.5.86L18 20.5V6z"/></svg>`,
        stats: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21a1 1 0 0 1-1-1V4a1 1 0 0 1 2 0v15h16a1 1 0 1 1 0 2H4zm4-4a1 1 0 0 1-1-1V11a1 1 0 1 1 2 0v5a1 1 0 0 1-1 1zm5 0a1 1 0 0 1-1-1V7a1 1 0 1 1 2 0v9a1 1 0 0 1-1 1zm5 0a1 1 0 0 1-1-1V9a1 1 0 1 1 2 0v7a1 1 0 0 1-1 1z"/></svg>`,
        admin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1a2 2 0 0 1 2 2v1.06a7.01 7.01 0 0 1 2.09.87l.75-.75a2 2 0 1 1 2.83 2.83l-.75.75c.36.66.64 1.36.82 2.1H21a2 2 0 1 1 0 4h-1.06a7.01 7.01 0 0 1-.87 2.09l.75.75a2 2 0 1 1-2.83 2.83l-.75-.75A7.01 7.01 0 0 1 14 19.94V21a2 2 0 1 1-4 0v-1.06a7.01 7.01 0 0 1-2.09-.87l-.75.75a2 2 0 1 1-2.83-2.83l.75-.75A7.01 7.01 0 0 1 4.06 14H3a2 2 0 1 1 0-4h1.06c.18-.74.46-1.44.82-2.1l-.75-.75A2 2 0 1 1 6.96 4.3l.75.75A7.01 7.01 0 0 1 10 4.06V3a2 2 0 0 1 2-2zm0 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>`,
        logout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17a1 1 0 0 1-1-1v-1H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5V3a1 1 0 0 1 1-1h7a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3h-7zm9-5a1 1 0 0 0-1-1h-6a1 1 0 1 0 0 2h6a1 1 0 0 0 1-1z"/></svg>`
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

  // Unified workflow progress bar renderer used by all dashboards.
  // Uses a dedicated class name so older .gcp-progress CSS cannot override it.
  window.GCP.getWorkflowSteps = function(submitterRole){
    const raw = String(submitterRole || '').toLowerCase();
    const role = raw === 'chairman' ? 'deputy' : raw;
    if (role === 'minister') return ['Draft','Supervisor','Deputy','Minister','Approved'];
    if (role === 'supervisor') return ['Draft','Supervisor','Approved'];
    return ['Draft','Supervisor','Deputy','Approved'];
  };

  window.GCP.getWorkflowActiveIndex = function(status, submitterRole){
    const steps = window.GCP.getWorkflowSteps(submitterRole);
    const s = String(status || '').toLowerCase();
    if (!s || s === 'draft' || s === 'in_progress' || s === 'returned' || s.startsWith('returned_')) return 0;
    if (s === 'submitted_to_supervisor' || s === 'approved_by_supervisor') return Math.max(0, steps.indexOf('Supervisor'));
    if (s === 'submitted_to_chairman' || s === 'submitted_to_deputy' || s === 'approved_by_chairman') return Math.max(0, steps.indexOf('Deputy'));
    if (s === 'submitted_to_minister' || s === 'approved_by_minister') return Math.max(0, steps.indexOf('Minister'));
    if (s === 'approved' || s === 'locked') return Math.max(0, steps.indexOf('Approved'));
    return 0;
  };

  window.GCP.renderWorkflowProgress = function(status, submitterRole){
    const steps = window.GCP.getWorkflowSteps(submitterRole);
    const activeIndex = window.GCP.getWorkflowActiveIndex(status, submitterRole);
    const progressPct = steps.length <= 1 ? 0 : (activeIndex / (steps.length - 1)) * 100;

    let html = `<div class="wf-progress wf-progress--compact" style="--wf-count:${steps.length}" role="group" aria-label="Document status progress">`;
    html += `<div class="wf-progress__track" aria-hidden="true"><div class="wf-progress__fill" style="width:${progressPct}%;"></div></div>`;
    html += `<div class="wf-progress__steps">`;
    for (let i = 0; i < steps.length; i++) {
      const state = i < activeIndex ? 'is-done' : (i === activeIndex ? 'is-active' : 'is-todo');
      const circleText = i < activeIndex ? '✓' : String(i + 1);
      html += `
        <div class="wf-step ${state}">
          <div class="wf-step__circle" aria-hidden="true">${circleText}</div>
          <div class="wf-step__label">${escapeHtml(steps[i])}</div>
        </div>`;
    }
    html += `</div></div>`;
    return html;
  };

  window.GCP.renderStatusProgress = window.GCP.renderWorkflowProgress;

})();
