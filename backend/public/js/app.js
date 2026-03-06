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

    document.body.classList.add("gp-shell-ready");
    sidebar.classList.add("gp-sidebar");

    const role = String(user.role || "").toLowerCase();
    const items = ROLE_NAV[role] || [];
    const activeFile = location.pathname.split("/").pop();
    const displayName = user.fullName || user.username || "User";
    const initials = displayName.trim().split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()||"").join("") || "U";

    function iconSvg(name){
      const svgs = {
        dashboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13.5A2.5 2.5 0 0 1 5.5 11H11v10H5.5A2.5 2.5 0 0 1 3 18.5v-5ZM13 3h5.5A2.5 2.5 0 0 1 21 5.5V11h-8V3Zm0 10h8v5.5A2.5 2.5 0 0 1 18.5 21H13V13ZM3 5.5A2.5 2.5 0 0 1 5.5 3H11v6H3V5.5Z"/></svg>`,
        calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v11a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1Zm13 8H4v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8Z"/></svg>`,
        library: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5A2.5 2.5 0 0 1 8.5 1H19v18.5a1.5 1.5 0 0 1-2.4 1.2L13 18l-3.6 2.7A1.5 1.5 0 0 1 7 19.5V6H6a3 3 0 0 1 0-6h1v3.5ZM9 4v13l3-2.25L15 17V4H9Z"/></svg>`,
        stats: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20a1 1 0 0 1-1-1V5a1 1 0 1 1 2 0v13h15a1 1 0 1 1 0 2H4Zm4-3a1 1 0 0 1-1-1v-4a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1Zm5 0a1 1 0 0 1-1-1V8a1 1 0 1 1 2 0v8a1 1 0 0 1-1 1Zm5 0a1 1 0 0 1-1-1v-6a1 1 0 1 1 2 0v6a1 1 0 0 1-1 1Z"/></svg>`,
        admin: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 2h2.8l.5 2a7.7 7.7 0 0 1 1.8.8l1.8-1.1 2 2-1.1 1.8a7.7 7.7 0 0 1 .8 1.8l2 .5v2.8l-2 .5a7.7 7.7 0 0 1-.8 1.8l1.1 1.8-2 2-1.8-1.1a7.7 7.7 0 0 1-1.8.8l-.5 2h-2.8l-.5-2a7.7 7.7 0 0 1-1.8-.8l-1.8 1.1-2-2 1.1-1.8a7.7 7.7 0 0 1-.8-1.8l-2-.5V10l2-.5a7.7 7.7 0 0 1 .8-1.8L3.9 5.9l2-2 1.8 1.1a7.7 7.7 0 0 1 1.8-.8l.5-2ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>`,
        logout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3a1 1 0 0 1 1 1v2h6a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-6v2a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm-1 8H4a1 1 0 1 0 0 2h5v2.5a1 1 0 0 0 1.7.7l3.2-3.2a1 1 0 0 0 0-1.4l-3.2-3.2A1 1 0 0 0 9 9.5V11Z"/></svg>`,
        user: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2c-4.4 0-8 2.2-8 5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1c0-2.8-3.6-5-8-5Z"/></svg>`,
        menu: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5A1 1 0 0 1 4 7Zm0 5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm1 4a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H5Z"/></svg>`,
        close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.7 5.3a1 1 0 0 0-1.4 1.4L10.6 12l-5.3 5.3a1 1 0 0 0 1.4 1.4l5.3-5.3 5.3 5.3a1 1 0 0 0 1.4-1.4L13.4 12l5.3-5.3a1 1 0 0 0-1.4-1.4L12 10.6 6.7 5.3Z"/></svg>`
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

    const navHtml = items.map((it) => {
      const active = activeFile === it.href ? ' active' : '';
      return `<a href="${escapeHtml(it.href)}" class="gp-nav__link${active}"><span class="gp-nav__icon">${iconSvg(iconForLabel(it.label))}</span><span class="gp-nav__label">${escapeHtml(it.label)}</span></a>`;
    }).join('');

    sidebar.innerHTML = `
      <button class="gp-mobile-toggle" type="button" aria-label="Open menu">
        <span class="gp-mobile-toggle__icon">${iconSvg("menu")}</span>
      </button>
      <div class="gp-sidebar__scrim"></div>
      <div class="gp-sidebar__panel">
        <div class="gp-sidebar__top">
          <div class="gp-brand">
            <div class="gp-brand__mark">G</div>
            <div class="gp-brand__text">
              <div class="gp-brand__title">Gov Collab</div>
              <div class="gp-brand__sub">Portal</div>
            </div>
          </div>
          <button class="gp-mobile-close" type="button" aria-label="Close menu">${iconSvg("close")}</button>
        </div>

        <div class="gp-profile">
          <div class="gp-profile__avatar">${escapeHtml(initials)}</div>
          <div class="gp-profile__text">
            <div class="gp-profile__name">${escapeHtml(displayName)}</div>
            <div class="gp-profile__role">${escapeHtml(roleToTitle(role))}</div>
          </div>
        </div>

        <nav class="gp-nav">${navHtml}</nav>

        <div class="gp-sidebar__footer">
          <div class="gp-account">
            <span class="gp-account__icon">${iconSvg("user")}</span>
            <div class="gp-account__text">
              <div class="gp-account__title">Signed in</div>
              <div class="gp-account__sub">${escapeHtml(roleToTitle(role))}</div>
            </div>
          </div>
          <button class="gp-logout" id="logoutBtn" type="button">
            <span class="gp-nav__icon">${iconSvg("logout")}</span>
            <span class="gp-nav__label">Logout</span>
          </button>
        </div>
      </div>
    `;

    const body = document.body;
    const openMenu = () => body.classList.add('gp-menu-open');
    const closeMenu = () => body.classList.remove('gp-menu-open');
    const expandSidebar = () => body.classList.add('gp-sidebar-expanded');
    const collapseSidebar = () => body.classList.remove('gp-sidebar-expanded');

    sidebar.addEventListener('mouseenter', expandSidebar);
    sidebar.addEventListener('mouseleave', collapseSidebar);
    sidebar.addEventListener('focusin', expandSidebar);
    sidebar.addEventListener('focusout', (event) => {
      if (!sidebar.contains(event.relatedTarget)) collapseSidebar();
    });

    sidebar.querySelector('.gp-mobile-toggle')?.addEventListener('click', openMenu);
    sidebar.querySelector('.gp-mobile-close')?.addEventListener('click', closeMenu);
    sidebar.querySelector('.gp-sidebar__scrim')?.addEventListener('click', closeMenu);
    sidebar.querySelectorAll('.gp-nav__link').forEach((link) => link.addEventListener('click', closeMenu));

    sidebar.querySelector('#logoutBtn').addEventListener('click', () => {
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

  // ------------------------------
  // Dynamic document status progress bar
  // ------------------------------
  window.GCP.getStatusSteps = function(submitterRole){
    const raw = String(submitterRole || '').toLowerCase();
    const r = raw === 'chairman' ? 'deputy' : raw;
    if (r === 'supervisor') return ['Draft','Supervisor','Approved'];
    if (r === 'minister') return ['Draft','Supervisor','Deputy','Minister','Approved'];
    return ['Draft','Supervisor','Deputy','Approved'];
  };

  window.GCP.statusToStepIndex = function(status, submitterRole){
    const s = String(status || '').toLowerCase();
    const rawRole = String(submitterRole || '').toLowerCase();
    const r = rawRole === 'chairman' ? 'deputy' : rawRole;

    if (!s || s === 'draft' || s === 'returned' || s === 'in_progress') return 0;
    if (s === 'submitted_to_supervisor' || s === 'approved_by_supervisor') return 1;
    if (s === 'submitted_to_chairman' || s === 'submitted_to_deputy' || s === 'approved_by_chairman') return r === 'supervisor' ? 1 : 2;
    if (s === 'submitted_to_minister' || s === 'approved_by_minister') return r === 'minister' ? 3 : 0;
    if (s === 'approved' || s === 'locked') return window.GCP.getStatusSteps(r).length - 1;
    return 0;
  };

  window.GCP.renderWorkflowProgress = function(status, submitterRole){
    const steps = window.GCP.getStatusSteps(submitterRole);
    const active = window.GCP.statusToStepIndex(status, submitterRole);
    const maxIndex = Math.max(steps.length - 1, 1);
    const fillPercent = (active / maxIndex) * 100;
    const stepHtml = steps.map((label, idx) => {
      const state = idx < active ? 'done' : (idx === active ? 'active' : 'todo');
      return `
        <div class="wf-step ${state}" role="listitem" aria-current="${idx === active ? 'step' : 'false'}">
          <div class="wf-step__circle" aria-hidden="true">${idx + 1}</div>
          <div class="wf-step__label">${escapeHtml(label)}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="wf-progress" style="--wf-count:${steps.length};" role="group" aria-label="Document status progress">
        <div class="wf-progress__steps" role="list">${stepHtml}</div>
        <div class="wf-progress__track" aria-hidden="true">
          <div class="wf-progress__fill" style="width:${fillPercent}%;"></div>
        </div>
      </div>
    `;
  };

  window.GCP.renderStatusProgress = window.GCP.renderWorkflowProgress;

})();
