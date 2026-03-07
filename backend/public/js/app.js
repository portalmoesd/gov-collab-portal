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
        logo: `<svg viewBox="0 0 350 350" aria-hidden="true"><style>.st0{fill:#326BB3;}.st1{opacity:.49;fill:#326BB3;}.st2{opacity:.49;fill:#326BB3;stroke:#336BB3;stroke-width:5;stroke-linecap:round;stroke-miterlimit:10;}</style><g><circle class="st0" cx="175" cy="175" r="40.4"/><circle class="st1" cx="175" cy="175" r="48.7"/></g><g><circle class="st0" cx="301.3" cy="48.7" r="40.4"/><circle class="st1" cx="301.3" cy="48.7" r="48.7"/></g><g><circle class="st0" cx="48.7" cy="48.7" r="40.4"/><circle class="st1" cx="48.7" cy="48.7" r="48.7"/></g><g><circle class="st0" cx="48.7" cy="301.3" r="40.4"/><circle class="st1" cx="48.7" cy="301.3" r="48.7"/></g><g><circle class="st0" cx="301.3" cy="301.3" r="40.4"/><circle class="st1" cx="301.3" cy="301.3" r="48.7"/></g><line class="st2" x1="91.4" y1="91.4" x2="132.4" y2="132.4"/><line class="st2" x1="217.6" y1="217.6" x2="258.6" y2="258.6"/><line class="st2" x1="217.6" y1="132.4" x2="258.6" y2="91.4"/><line class="st2" x1="91.4" y1="258.6" x2="132.4" y2="217.6"/></svg>`,
        dashboard: `<svg viewBox="0 0 350 350" aria-hidden="true"><g><path d="M251.9,25c8,0,16,0,23.9,0c6,0,11.7,1,17.3,2.9c10.6,3.6,18.4,10.6,24.3,19.9c4.9,7.8,6.9,16.4,7,25.5c0.1,16.5,0.1,33,0,49.5c-0.1,13.1-4.5,24.5-13.7,34c-5,5.1-11,8.7-17.7,11.2c-5.8,2.1-11.7,2.9-17.8,2.9c-15.7,0.1-31.4,0.1-47.1,0c-7.1,0-14-1.1-20.6-4c-7.8-3.4-14.1-8.5-19.2-15.3c-3.1-4.1-5.3-8.6-7-13.4c-1.6-4.9-2.3-10.1-2.3-15.3c0-16.7,0-33.5,0-50.2c0-6.8,1.2-13.4,4-19.6c3.6-7.9,9-14.3,16-19.4c5-3.6,10.5-5.9,16.4-7.3c4.7-1.1,9.4-1.4,14.2-1.4C237.2,25,244.5,25,251.9,25z"/><path d="M251.7,179.1c8.3,0,16.5,0,24.8,0c5.7,0,11.2,1,16.6,2.9c11.6,4,19.9,11.7,25.8,22.2c2.9,5.2,4.7,10.8,5.1,16.8c0.3,3.8,0.5,7.5,0.5,11.3c0.1,14.4,0,28.7,0,43.1c0,5.8-0.6,11.5-2.4,17c-2.7,8.1-7.3,15-13.7,20.7c-4.5,4-9.6,6.8-15.2,8.9c-6,2.3-12.2,2.9-18.5,3c-15.7,0.1-31.3,0.1-47,0c-6.9,0-13.7-1.1-20.2-4c-9.1-4-16.1-10.2-21.4-18.6c-4.9-7.7-7-16.3-7-25.3c-0.1-16.8,0-33.6,0-50.3c0-6.7,1.2-13.2,3.9-19.3c4-8.9,10.2-16,18.6-21.3c8-5,16.8-7,26.2-7.1C235.8,179.1,243.7,179.1,251.7,179.1z"/><path d="M98.1,25c7.8,0,15.7,0.1,23.5,0c6.2-0.1,12.1,1,17.9,2.9c8.8,2.9,15.7,8.5,21.4,15.6c3.3,4.2,5.8,9,7.5,14.1c1.6,5.1,2.4,10.4,2.4,15.7c0.1,16.4,0.1,32.9,0,49.3c0,5.2-0.7,10.4-2.3,15.4c-3.2,9.5-8.8,17.3-16.8,23.3c-5.7,4.3-12.2,7.1-19.1,8.5c-3.3,0.7-6.8,0.9-10.2,1c-16.1,0.1-32.3,0.1-48.4,0c-13.2-0.1-24.8-4.2-34.3-13.6c-5-5-8.8-10.8-11.2-17.5c-2.2-6-2.9-12.2-2.9-18.5c0-15.9,0-31.7,0-47.6c0-5.5,0.6-10.9,2.3-16.1c2.5-7.4,6.5-13.9,12.3-19.3c4.2-4,8.8-7.4,14.2-9.5c6.1-2.4,12.4-3.8,18.9-3.8C81.5,25,89.8,25,98.1,25z"/><path d="M25.4,251.1c0-8,0-16.1,0-24.1c0-6.9,1.2-13.5,4-19.7c3.6-7.9,9-14.4,16-19.5c5-3.6,10.5-5.9,16.5-7.3c4.4-1,8.9-1.4,13.4-1.4c15.8,0,31.6,0,47.4,0c5.8,0,11.3,1,16.8,2.9c11.2,3.9,19.3,11.3,25.3,21.4c4.3,7.4,6,15.5,6.1,24c0.1,16.5,0.1,33.1,0,49.6c0,5.2-0.7,10.3-2.3,15.3c-3.2,9.5-8.8,17.4-16.9,23.4c-6.9,5-14.6,8.3-23.2,8.8c-3.7,0.2-7.3,0.5-11,0.5c-14.5,0.1-29,0.1-43.5,0c-6.9-0.1-13.6-1.2-20-4c-9-4-16.1-10.2-21.3-18.5c-5-7.9-7-16.5-7.1-25.7C25.3,268.2,25.4,259.6,25.4,251.1z"/></g></svg>`,
        calendar: `<svg viewBox="0 0 350 350" aria-hidden="true"><g><path d="M175.1,140.4c49.2,0,98.4,0,147.5,0c2.1,0,2.1,0,2.1,2.1c0,36,0,72,0,108c0,5.5-0.4,10.9-1.6,16.3c-1.3,6.1-3.3,11.9-6.1,17.5c-4.9,9.9-11.8,18.2-20.4,25.1c-6.3,5-13.3,8.7-20.9,11.4c-8.3,2.9-16.8,4.2-25.5,4.2c-50.1,0-100.3,0-150.4,0c-5.5,0-11-0.5-16.4-1.6c-6-1.2-11.8-3.3-17.4-6c-9.3-4.4-17-10.9-23.6-18.6c-4.4-5.1-7.8-10.8-10.6-16.9c-4.6-10.2-6.5-20.9-6.5-32.1c0.1-35.8,0-71.6,0-107.4c0-2,0-2,2-2C76.6,140.4,125.8,140.4,175.1,140.4z"/><path d="M323.7,117.2c-99.2,0-198.2,0-297.7,0c1.2-4.3,2.3-8.3,3.6-12.3c1.7-5.4,4.3-10.3,7.3-15c5.8-9.1,13.3-16.5,22.4-22.3c4.9-3.1,10.1-5.9,15.7-7.7c3-1,6.2-1.7,9.3-2.4c2.2-0.5,2.4-0.5,2.4-2.8c0-5.6,0-11.3,0-16.9c0-3.1,0.7-6,2.7-8.4c5.5-6.5,14.6-5.5,18.9,1.5c1.3,2.1,1.5,4.3,1.5,6.6c0,5.5,0,10.9,0,16.4c0,1.9,0.1,2,2,2c42.1,0,84.3,0,126.4,0c2,0,2.1-0.1,2.1-2.1c0-5.6,0-11.3,0-16.9c0-4.8,2.2-8.3,6.3-10.5c4.2-2.2,8.2-1.7,11.9,1c3.4,2.5,4.8,5.9,4.8,10c0,5.8,0,11.6,0,17.5c0,2.1,0.1,2.2,2.2,2.5c5.2,0.8,10.2,2.4,15,4.6c8,3.6,15.2,8.4,21.6,14.5c6.9,6.6,12.2,14.2,16.2,22.9C320.9,105,322.7,110.9,323.7,117.2z"/></g></svg>`,
        library: `<svg viewBox="0 0 350 350" aria-hidden="true"><path d="M296.8,325H53.2c-15.4,0-27.8-12.5-27.8-27.8V172.6c0-15.4,12.5-27.8,27.8-27.8h243.6c15.4,0,27.8,12.5,27.8,27.8v124.5C324.6,312.5,312.1,325,296.8,325z"/><path d="M272,115.1H76.2c-7.9,0-14.3-6.4-14.3-14.3v-1.6c0-7.9,6.4-14.3,14.3-14.3H272c7.9,0,14.3,6.4,14.3,14.3v1.6C286.3,108.7,279.9,115.1,272,115.1z"/><path d="M234.5,55.2H115.5c-7.9,0-14.3-6.4-14.3-14.3v-1.6c0-7.9,6.4-14.3,14.3-14.3h119.1c7.9,0,14.3,6.4,14.3,14.3v1.6C248.8,48.8,242.4,55.2,234.5,55.2z"/></svg>`,
        stats: `<svg viewBox="0 0 350 350" aria-hidden="true"><path d="M317.4,325H32.6c-4.2,0-7.6-3.4-7.6-7.6l0,0c0-4.2,3.4-7.6,7.6-7.6h284.8c4.2,0,7.6,3.4,7.6,7.6l0,0C325,321.6,321.6,325,317.4,325z"/><path d="M53.1,180.5L53.1,180.5c-11.4,0-20.6,9.2-20.6,20.6v101.4h41.2V201.1C73.7,189.7,64.5,180.5,53.1,180.5z"/><path d="M134.1,98L134.1,98c-11.4,0-20.6,9.2-20.6,20.6v183.9h41.2V118.6C154.7,107.2,145.5,98,134.1,98z"/><path d="M215.1,157.8L215.1,157.8c-11.4,0-20.6,9.2-20.6,20.6v124.1h41.2V178.4C235.7,167,226.5,157.8,215.1,157.8z"/><path d="M296,25L296,25c-11.4,0-20.6,9.2-20.6,20.6v256.9h41.2V45.6C316.6,34.2,307.4,25,296,25z"/></svg>`,
        logout: `<svg viewBox="0 0 350 350" aria-hidden="true"><g><path d="M171.3,175.6c0,36.4,0,72.8,0,109.2c0,0.5,0,1,0,1.4c0,0.9,0.3,1.4,1.3,1.4c0.2,0,0.4,0,0.7,0c26,0,52,0,78,0c2,0,3.5-0.5,4.2-2.5c0.2-0.6,0.3-1.4,0.3-2c0-9.8,0-19.6,0-29.4c0-5.6,2.6-9.5,7.7-11.6c6.9-2.9,12.8,0.7,14.8,7.1c0.4,1.4,0.6,3,0.6,4.5c0.1,9.5,0.2,19.1,0,28.6c-0.2,10.7-5.1,18.7-14.5,23.9c-4.3,2.4-9,3.2-13.8,3.2c-27.3,0-54.7,0-82,0c-1.8,0-3,0.5-4.1,1.9c-3.2,4-7.4,6.5-12.2,8c-4.5,1.4-9.1,1.8-13.8,1.3c-2.6-0.3-5.2-1.1-7.7-1.7c-3.4-0.8-6.8-1.7-10.2-2.6c-3.4-0.9-6.8-1.7-10.2-2.6c-3.3-0.8-6.6-1.6-9.9-2.5c-3.5-0.9-6.9-1.7-10.4-2.6c-3.3-0.8-6.6-1.6-9.9-2.5c-3.5-0.9-6.9-1.7-10.4-2.6c-3.3-0.8-6.6-1.6-9.9-2.5c-3.5-0.9-6.9-1.7-10.3-2.6c-2.6-0.7-5.2-1.3-7.7-2.3c-5.7-2.2-10.1-6.1-13.2-11.3c-2.3-4-3.5-8.3-3.6-12.9c0-1,0-2,0-3c0-63.3,0-126.5,0-189.8c0-10.8,5.2-18.7,14.7-23.7c2.7-1.4,5.8-2.1,8.8-3c3.3-1,6.7-1.8,10.1-2.6c3.2-0.8,6.5-1.6,9.7-2.4c3.5-0.9,6.9-1.7,10.4-2.6c3.3-0.8,6.6-1.6,9.9-2.5c3.5-0.9,6.9-1.7,10.4-2.6c3.3-0.8,6.6-1.6,9.9-2.5c3.5-0.9,6.9-1.7,10.4-2.6c3.3-0.8,6.6-1.6,9.9-2.5c2.5-0.6,5-1.3,7.4-1.9c5.1-1.3,10.2-1.4,15.3,0.1c5.4,1.6,10,4.4,13.4,8.9c0.6,0.8,1.4,0.9,2.3,0.9c12.5,0,25.1,0,37.6,0c15.1,0,30.2,0,45.3,0c6.6,0,12.8,1.6,18,5.8c4.4,3.5,7.5,7.9,9.1,13.3c1,3.4,1.4,6.9,1.4,10.4c0,9.2-0.1,18.5,0,27.7c0.1,5.8-3.3,10.4-8.6,11.8c-4.3,1.2-8.1,0.3-11.6-3.4c-2.1-2.3-3-5.1-3-8.2c0-9.9,0-19.8,0-29.6c0-2.1-0.9-3.5-2.8-4.3c-0.5-0.2-1.2-0.3-1.8-0.3c-26,0-52.1,0-78.1,0c-1.7,0-1.8,0.1-1.8,1.9c0,7.6,0,15.2,0,22.7C171.3,117.2,171.3,146.4,171.3,175.6z"/><path d="M285.3,187c-1,0-1.6-0.1-2.3-0.1c-25.5,0-51,0-76.5,0c-3.9,0-7-1.4-9.5-4.2c-4-4.6-3.4-12.1,1.2-16c2.4-2.1,5.2-3,8.4-3c25.5,0,50.9,0,76.4,0c0.7,0,1.4,0,2.1,0c0-0.1,0.1-0.2,0.1-0.3c-0.3-0.3-0.6-0.7-0.9-1c-3-2.9-5.9-5.9-8.9-8.8c-3.2-3.1-4.5-6.9-3.6-11.1c0.8-4,3.3-6.8,7-8.3c4.8-2,9.2-0.8,12.8,2.8c10,9.9,19.9,19.9,29.8,29.9c2.6,2.6,4.1,5.8,3.7,9.6c-0.3,2.7-1.4,5.1-3.3,7c-9.3,9.3-18.6,18.7-27.9,28.1c-1.9,1.9-3.7,3.9-6.2,5.1c-5.1,2.5-10.3,0.7-13.6-3c-3.9-4.5-3.9-11,0.2-15.3c3.2-3.5,6.7-6.7,10-10.1C284.5,187.9,284.8,187.5,285.3,187z"/></g></svg>`,
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
            <div class="gp-brand__mark gp-brand__mark--logo"><img src="assets/portal-logo-new.svg" alt="Government Collaboration Portal" class="gp-brand__logo-img"></div>
            <div class="gp-brand__text">
              <div class="gp-brand__title"><span class="gp-brand__title-main">Government Collaboration</span><span class="gp-brand__title-sub">Portal</span></div>
            </div>
          </div>
          <button class="gp-mobile-close" type="button" aria-label="Close menu">${iconSvg("close")}</button>
        </div>

        <div class="gp-profile gp-profile--top">
          <div class="gp-profile__avatar">${escapeHtml(initials)}</div>
          <div class="gp-profile__text">
            <div class="gp-profile__name">${escapeHtml(displayName)}</div>
            <div class="gp-profile__role">${escapeHtml(roleToTitle(role))}</div>
          </div>
        </div>

        <nav class="gp-nav">${navHtml}</nav>

        <div class="gp-sidebar__spacer"></div>

        <div class="gp-sidebar__footer">
          <button class="gp-logout" id="logoutBtn" type="button">
            <span class="gp-nav__icon">${iconSvg("logout")}</span>
            <span class="gp-nav__label">Logout</span>
          </button>
        </div>
      </div>
    `;

    const body = document.body;
    const isDesktopSidebar = () => window.innerWidth > 980;
    const openMenu = () => body.classList.add('gp-menu-open');
    const closeMenu = () => body.classList.remove('gp-menu-open');
    const expandSidebar = () => { if (isDesktopSidebar()) body.classList.add('gp-sidebar-expanded'); };
    const collapseSidebar = () => body.classList.remove('gp-sidebar-expanded');

    sidebar.addEventListener('mouseenter', () => { if (isDesktopSidebar()) expandSidebar(); });
    sidebar.addEventListener('mouseleave', () => { if (isDesktopSidebar()) collapseSidebar(); });
    sidebar.addEventListener('focusin', () => { if (isDesktopSidebar()) expandSidebar(); });
    sidebar.addEventListener('focusout', (event) => {
      if (isDesktopSidebar() && !sidebar.contains(event.relatedTarget)) collapseSidebar();
    });

    sidebar.querySelector('.gp-mobile-toggle')?.addEventListener('click', openMenu);
    sidebar.querySelector('.gp-mobile-close')?.addEventListener('click', closeMenu);
    sidebar.querySelector('.gp-sidebar__scrim')?.addEventListener('click', closeMenu);
    sidebar.querySelectorAll('.gp-nav__link').forEach((link) => link.addEventListener('click', closeMenu));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 980) {
        closeMenu();
      } else {
        collapseSidebar();
      }
    });

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
