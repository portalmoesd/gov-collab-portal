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
    deputy: [ // displayed as Deputy
      { href: "dashboard-deputy.html", label: "Dashboard" },
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
      { href: "dashboard-super-collab.html", label: "Dashboard" },
      { href: "calendar.html", label: "Calendar" },
      { href: "library.html", label: "Library" },
      { href: "statistics.html", label: "Statistics" },
    ],
    collaborator: [
      { href: "dashboard-collab-review.html", label: "Dashboard" },
      { href: "calendar.html", label: "Calendar" },
      { href: "statistics.html", label: "Statistics" },
    ],
    collaborator_3: [
      { href: "dashboard-collab-3.html", label: "Dashboard" },
      { href: "calendar.html", label: "Calendar" },
      { href: "statistics.html", label: "Statistics" },
    ],
    collaborator_2: [
      { href: "dashboard-collab-2.html", label: "Dashboard" },
      { href: "calendar.html", label: "Calendar" },
      { href: "statistics.html", label: "Statistics" },
    ],
    collaborator_1: [
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
      deputy:"Deputy",
      minister:"Minister",
      supervisor:"Supervisor",
      protocol:"Protocol",
      super_collaborator:"Super-collaborator",
      collaborator:"Collaborator",
      collaborator_3:"Curator",
      collaborator_2:"Head Collaborator",
      collaborator_1:"Collaborator I",
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
        logo: `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 350 350" xml:space="preserve" class="gp-brand__logo-img" width="42" height="42" aria-hidden="true"><style type="text/css">.st0{fill:#1D1D1B;}</style><g><path class="st0" d="M84.6,233.2c-8.4,8.5-8.4,22.3,0.1,30.8s22.3,8.7,30.7,0.1c8.7-8.7,8.8-22.6,0.3-31.1C107.2,224.7,93.1,224.7,84.6,233.2z"/><path class="st0" d="M277.9,24H72.1C46.1,24,25,45.1,25,71.1v205.7c0,26,21.1,47.1,47.1,47.1h205.7c26,0,47.1-21.1,47.1-47.1V71.1C325,45.1,303.9,24,277.9,24z M283.2,146.9c-11.8,16.9-28.3,25.6-49,25.2c-21.8-0.4-41.4,5.7-59,18.4c-3.5,2.5-6.7,5.3-9.8,8.2c-13.6,14.4-21.3,31.5-22.2,51.6c-1.6,32.6-35.9,52.4-64.3,37c-26.7-14.2-30.2-51.8-7-71.1c7.7-6.4,16.5-10.1,26.5-10.4c19.8-0.8,36.5-8.2,50.9-21.4c18.3-19.1,27.8-42.1,27.4-68.9c-0.2-17.3,5.7-31.9,18-44c20-19.6,53.1-21.6,75.9-4.5c2.2,1.6,4.2,3.4,6.3,5.1C296.3,91.7,299.3,123.8,283.2,146.9z"/><path class="st0" d="M208.7,86.8c-14.9,14.8-15,38.8-0.3,53.6c14.6,14.7,38.8,14.7,53.7,0c14.6-14.4,14.8-38.7,0.5-53.2C247.5,72.1,223.6,71.9,208.7,86.8z M235.3,134.5c-11.5,0-20.9-9.3-20.9-20.9s9.3-20.9,20.9-20.9c11.5,0,20.9,9.3,20.9,20.9S246.8,134.5,235.3,134.5z"/></g></svg>`,
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
            <div class="gp-brand__mark gp-brand__mark--logo">${iconSvg("logo")}</div>
            <div class="gp-brand__text">
              <div class="gp-brand__title"><span class="gp-brand__title-main">Vector</span><span class="gp-brand__title-sub">by MOESD</span></div>
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
          <button class="dm-toggle" id="dmToggleBtn" type="button" aria-label="Toggle dark mode">
            <span class="dm-icon" id="dmIcon" aria-hidden="true"></span>
            <span class="gp-nav__label dm-label" id="dmLabel">Dark mode</span>
          </button>
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

    const isDesktopSidebar = () => window.innerWidth > 980;

    sidebar.addEventListener('mouseenter', () => {
      if (isDesktopSidebar()) expandSidebar();
    });
    sidebar.addEventListener('mouseleave', () => {
      if (isDesktopSidebar()) collapseSidebar();
    });
    sidebar.addEventListener('focusin', () => {
      if (isDesktopSidebar()) expandSidebar();
    });
    sidebar.addEventListener('focusout', (event) => {
      if (isDesktopSidebar() && !sidebar.contains(event.relatedTarget)) collapseSidebar();
    });

    sidebar.querySelector('.gp-mobile-toggle')?.addEventListener('click', () => {
      collapseSidebar();
      openMenu();
    });
    sidebar.querySelector('.gp-mobile-close')?.addEventListener('click', closeMenu);
    sidebar.querySelector('.gp-sidebar__scrim')?.addEventListener('click', closeMenu);
    sidebar.querySelectorAll('.gp-nav__link').forEach((link) => link.addEventListener('click', () => {
      if (!isDesktopSidebar()) closeMenu();
    }));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', () => {
      if (isDesktopSidebar()) {
        closeMenu();
      } else {
        collapseSidebar();
      }
    });

    sidebar.querySelector('#logoutBtn').addEventListener('click', () => {
      localStorage.removeItem("gcp_token");
      location.href = "login.html";
    });

    // Dark mode toggle
    const SUN_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;"><path d="M12 4.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 12 4.5ZM18.364 6.343a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 1 1-1.06-1.06l1.06-1.061a.75.75 0 0 1 1.06 0ZM19.5 12a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 .75.75ZM17.303 17.303a.75.75 0 0 1-1.06 0l-1.061-1.06a.75.75 0 1 1 1.06-1.06l1.061 1.06a.75.75 0 0 1 0 1.06ZM12 18.75a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75ZM6.697 17.303a.75.75 0 0 1 0-1.06l1.06-1.061a.75.75 0 0 1 1.061 1.06L7.757 17.304a.75.75 0 0 1-1.06 0ZM4.5 12a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 4.5 12ZM6.697 6.343a.75.75 0 0 1 1.06 0l1.061 1.061a.75.75 0 0 1-1.06 1.06L6.697 7.403a.75.75 0 0 1 0-1.06ZM12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z"/></svg>`;
    const MOON_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;"><path fill-rule="evenodd" d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.7-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 0 1 .818.162Z" clip-rule="evenodd"/></svg>`;

    function applyTheme(dark) {
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      const dmIcon = document.getElementById('dmIcon');
      const dmLabel = document.getElementById('dmLabel');
      if (dmIcon) dmIcon.innerHTML = dark ? SUN_SVG : MOON_SVG;
      if (dmLabel) dmLabel.textContent = dark ? 'Light mode' : 'Dark mode';
    }

    const savedTheme = localStorage.getItem('gcp_theme') === 'dark';
    applyTheme(savedTheme);

    document.getElementById('dmToggleBtn')?.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      localStorage.setItem('gcp_theme', isDark ? 'light' : 'dark');
      applyTheme(!isDark);
    });
  }

  // Apply saved theme before auth (no flash)
  (function(){
    const t = localStorage.getItem('gcp_theme');
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  })();


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

  // --- Tbilisi timezone formatting ---
  function formatTbilisiDateTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const dateParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tbilisi', day: '2-digit', month: '2-digit', year: 'numeric',
    }).formatToParts(d);
    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tbilisi', hour: '2-digit', minute: '2-digit', hour12: false,
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
      timeZone: 'Asia/Tbilisi', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
  }

  window.GCP.formatDate = formatTbilisiDate;
  window.GCP.formatDateTime = formatTbilisiDateTime;

  // Collab simplified step index (supports skipping Curator when lsr === 'collaborator_2')
  // Maps a return_target_role to its step index in the progress bar
  function returnTargetStepIndex(rtr, skipCurator) {
    const r = String(rtr || '').toLowerCase();
    if (r === 'collaborator_1') return 0;
    if (r === 'collaborator_2') return 1;
    if (r === 'collaborator_3') return skipCurator ? 1 : 2;
    const base = skipCurator ? 2 : 3; // index of "Waiting for Approval"
    if (r === 'collaborator') return base;
    if (r === 'super_collaborator') return base; // same "Waiting for Approval" step
    if (r === 'supervisor') return base + 1; // Supervisor step
    return -1;
  }

  // Returns upper-tier step labels (after Super-Collaborator) based on document submitter role.
  function getUpperTierSteps(documentSubmitterRole) {
    const dsr = String(documentSubmitterRole || '').toLowerCase();
    const r = dsr === 'deputy' ? 'deputy' : dsr;
    if (r === 'supervisor') return ['Supervisor', 'Approved'];
    if (r === 'minister')   return ['Supervisor', 'Deputy', 'Minister', 'Approved'];
    return ['Supervisor', 'Deputy', 'Approved'];
  }

  // Returns 0-based index within the upper-tier steps for a given status.
  function upperTierStepIdx(status, documentSubmitterRole) {
    const s = String(status || '').toLowerCase();
    const dsr = String(documentSubmitterRole || '').toLowerCase();
    const r = dsr === 'deputy' ? 'deputy' : dsr;
    // Supervisor step (index 0)
    if (['approved_by_super_collaborator', 'submitted_to_supervisor',
         'returned_by_supervisor'].includes(s)) return 0;
    if (r === 'supervisor') return 1; // Approved
    // Deputy step (index 1 for deputy/minister)
    if (['approved_by_supervisor', 'submitted_to_deputy', 'returned_by_deputy'].includes(s)) return 1;
    if (r === 'deputy') return 2; // Approved
    // Minister step (index 2 for minister)
    if (['approved_by_deputy', 'submitted_to_minister', 'returned_by_minister'].includes(s)) return 2;
    return 3; // Approved (approved_by_minister reaches here)
  }

  window.GCP.collabSimpleStepIndex = function(status, lsr, returnTargetRole, documentSubmitterRole) {
    const s = String(status || 'draft').toLowerCase();
    const skipCurator = String(lsr || 'collaborator_2').toLowerCase() !== 'collaborator_3';
    const lowerStepCount = skipCurator ? 3 : 4; // number of lower-tier steps (excluding upper tier)
    // When section is returned and we know the explicit target, use it for the active step
    if (s.startsWith('returned_by') && returnTargetRole) {
      const rtiIdx = returnTargetStepIndex(returnTargetRole, skipCurator);
      if (rtiIdx >= 0) return rtiIdx;
    }
    if (skipCurator) {
      if (['draft', 'returned', 'returned_by_collaborator_2'].includes(s)) return 0;
      if (['submitted_to_collaborator_2', 'approved_by_collaborator_2'].includes(s)) return 1;
      if (['submitted_to_collaborator', 'returned_by_collaborator',
           'submitted_to_super_collaborator', 'returned_by_super_collaborator', 'approved_by_collaborator',
           'approved_by_collaborator_3'].includes(s)) return 2;
    } else {
      if (['draft', 'returned', 'returned_by_collaborator_2'].includes(s)) return 0;
      if (['submitted_to_collaborator_2'].includes(s)) return 1;
      if (['submitted_to_collaborator_3', 'approved_by_collaborator_2', 'returned_by_collaborator_3'].includes(s)) return 2;
      if (['submitted_to_collaborator', 'approved_by_collaborator_3', 'returned_by_collaborator',
           'submitted_to_super_collaborator', 'returned_by_super_collaborator', 'approved_by_collaborator'].includes(s)) return 3;
    }
    // Upper tier: offset by number of lower steps
    return lowerStepCount + upperTierStepIdx(s, documentSubmitterRole);
  };

  // Returns true when a section has never been acted on:
  // status is still 'draft' AND no actor names have been recorded yet.
  function isAwaitingFirstAction(status, stepNames) {
    if (String(status || '').toLowerCase() !== 'draft') return false;
    if (!stepNames || typeof stepNames !== 'object') return true;
    return !Object.values(stepNames).some(Boolean);
  }

  function awaitingProgressHtml() {
    return `<div class="wf-progress wf-progress--awaiting" role="group" aria-label="Section workflow progress">
      <span class="wf-progress__awaiting-label">Awaiting action</span>
    </div>`;
  }

  // Progress bar for Collaborator and Super-Collaborator dashboards.
  // Shows the full pipeline with explicit role names.
  // Steps before originalSubmitterRole are completely omitted (not greyed-out) so
  // the bar starts exactly where this section entered the pipeline.
  window.GCP.renderUpperTierProgress = function(status, stepNames, lsr, originalSubmitterRole, returnTargetRole, documentSubmitterRole) {
    if (isAwaitingFirstAction(status, stepNames)) return awaitingProgressHtml();
    const skipCurator = String(lsr || 'collaborator_2').toLowerCase() !== 'collaborator_3';
    const sn = stepNames && typeof stepNames === 'object' ? stepNames : {};
    const lowerCollabSteps = skipCurator
      ? [
          { label: 'Collaborator I',     name: sn.collabI      || null },
          { label: 'Head Collaborator',  name: sn.collabII     || null },
          { label: 'Collaborator',       name: sn.collaborator || null },
          { label: 'Super-Collaborator', name: sn.superCollab  || null },
        ]
      : [
          { label: 'Collaborator I',     name: sn.collabI      || null },
          { label: 'Head Collaborator',  name: sn.collabII     || null },
          { label: 'Curator',            name: sn.collabIII    || null },
          { label: 'Collaborator',       name: sn.collaborator || null },
          { label: 'Super-Collaborator', name: sn.superCollab  || null },
        ];
    const upperNameMap = { Supervisor: sn.supervisor || null, Deputy: sn.deputy || null, Minister: sn.minister || null, Approved: null };
    const upperSteps = getUpperTierSteps(documentSubmitterRole).map(label => ({ label, name: upperNameMap[label] || null }));
    const allSteps = lowerCollabSteps.concat(upperSteps);
    // Determine first visible step from originalSubmitterRole
    let startStep = 0;
    if (originalSubmitterRole) {
      const osr = String(originalSubmitterRole).toLowerCase();
      if (osr === 'collaborator_2')          startStep = 1;
      else if (osr === 'collaborator_3')     startStep = skipCurator ? 1 : 2;
      else if (osr === 'collaborator')       startStep = skipCurator ? 2 : 3;
      else if (osr === 'super_collaborator') startStep = skipCurator ? 3 : 4;
    }
    const visibleSteps = allSteps.slice(startStep);
    // For the upper-tier bar, Super-Collaborator is an explicit step so advance to it
    // for statuses that collabSimpleStepIndex would still show at Collaborator.
    const _s = String(status || '').toLowerCase();
    const _superIdx = skipCurator ? 3 : 4;
    const _simpleIdx = window.GCP.collabSimpleStepIndex(status, lsr, returnTargetRole, documentSubmitterRole);
    // collabSimpleStepIndex uses lowerStepCount equal to the simple bar's lower step count (3 or 4),
    // but the upper-tier bar has one extra explicit lower step (Super-Collaborator), so any index
    // at or above _superIdx is off by 1 — correct by adding 1.
    const activeAbs = (['submitted_to_super_collaborator', 'approved_by_collaborator'].includes(_s))
      ? _superIdx
      : (_simpleIdx >= _superIdx ? _simpleIdx + 1 : _simpleIdx);
    const active = Math.max(0, activeAbs - startStep);
    // Only show steps up to the one immediately after the active step;
    // tiers that haven't participated yet are hidden.
    const endIdx = Math.min(active + 2, visibleSteps.length);
    const shownSteps = visibleSteps.slice(0, endIdx);
    const fillPercent = shownSteps.length > 1 ? (active / (shownSteps.length - 1)) * 100 : 100;
    const stepHtml = shownSteps.map((step, idx) => {
      const state = idx < active ? 'done' : (idx === active ? 'active' : 'todo');
      const noActor = (state === 'done' && !step.name) ? ' no-actor' : '';
      const displayLabel = step.name ? escapeHtml(step.name) : escapeHtml(step.label);
      return `<div class="wf-step ${state}${noActor}" role="listitem" aria-current="${idx === active ? 'step' : 'false'}">
        <div class="wf-step__circle" aria-hidden="true">${idx + 1}</div>
        <div class="wf-step__label">${displayLabel}</div>
      </div>`;
    }).join('');
    return `<div class="wf-progress upper-tier-progress" style="--wf-count:${shownSteps.length};" role="group" aria-label="Section workflow progress">
      <div class="wf-progress__steps" role="list">${stepHtml}</div>
      <div class="wf-progress__track" aria-hidden="true">
        <div class="wf-progress__fill" style="width:${fillPercent}%;"></div>
      </div>
    </div>`;
  };

  // ---- Section history panel ----

  // Ordered pipeline stages for the history timeline
  const HISTORY_STAGES = [
    { role: 'collaborator_1',    label: 'Collaborator I' },
    { role: 'collaborator_2',    label: 'Head Collaborator' },
    { role: 'collaborator_3',    label: 'Curator' },
    { role: 'collaborator',      label: 'Collaborator' },
    { role: 'super_collaborator',label: 'Super-collaborator' },
    { role: 'supervisor',        label: 'Supervisor' },
    { role: 'deputy',          label: 'Deputy' },
    { role: 'minister',          label: 'Minister' },
  ];

  // Returns stage index based on the current status string
  // When skipCurator=true, curator stage (index 2) is removed so collab and beyond shift down by 1
  function historyStageLevel(status, skipCurator) {
    const s = String(status || '').toLowerCase();
    if (['submitted_to_collaborator_2','returned_by_collaborator_2','approved_by_collaborator_2'].includes(s)) return 1;
    if (!skipCurator && ['submitted_to_collaborator_3','returned_by_collaborator_3','approved_by_collaborator_3'].includes(s)) return 2;
    const collabIdx = skipCurator ? 2 : 3;
    if (['submitted_to_collaborator','returned_by_collaborator','approved_by_collaborator'].includes(s)) return collabIdx;
    if (['submitted_to_super_collaborator','returned_by_super_collaborator','approved_by_super_collaborator'].includes(s)) return collabIdx + 1;
    if (['submitted_to_supervisor','returned_by_supervisor','approved_by_supervisor'].includes(s)) return collabIdx + 2;
    if (['submitted_to_deputy','returned_by_deputy'].includes(s)) return collabIdx + 3;
    if (['approved_by_deputy','submitted_to_minister','approved_by_minister','approved','locked'].includes(s)) return collabIdx + 4;
    return 0; // draft / in_progress / returned_by_collaborator_1
  }

  function renderHistoryTimeline(history, currentStatus, lsr, originalSubmitterRole, documentSubmitterRole) {
    const historyArr = history || [];
    const s = String(currentStatus || 'draft').toLowerCase();

    // No actions recorded yet: show placeholder (mirrors progress bar behaviour)
    if (historyArr.length === 0 && s === 'draft') {
      return `<div class="sh-timeline sh-timeline--awaiting"><span class="wf-progress__awaiting-label">Awaiting action</span></div>`;
    }

    const skipCurator = String(lsr || 'collaborator_2').toLowerCase() !== 'collaborator_3';
    const currentLevel = historyStageLevel(currentStatus, skipCurator);

    // Build the ordered stage list, tagging each with its index in the skipCurator-aware
    // full array so comparisons with currentLevel remain correct after further filtering.
    const lowerRoleOrder = ['collaborator_1','collaborator_2','collaborator_3','collaborator','super_collaborator'];
    // Use originalSubmitterRole when available; otherwise derive from the first recorded history entry
    const firstEntryRole = historyArr.length > 0 ? (historyArr[0].user_role || '') : '';
    const effectiveOsr = originalSubmitterRole || firstEntryRole || 'collaborator_1';
    const osr = String(effectiveOsr).toLowerCase();
    const startRoleIdx = Math.max(0, lowerRoleOrder.indexOf(osr));

    // Determine which upper-tier stages to show (mirrors getUpperTierSteps logic)
    const dsr = String(documentSubmitterRole || '').toLowerCase();
    const dsrNorm = dsr === 'deputy' ? 'deputy' : dsr;
    const upperRolesToShow = new Set(['supervisor']);
    if (dsrNorm !== 'supervisor') upperRolesToShow.add('deputy');
    if (dsrNorm === 'minister')   upperRolesToShow.add('minister');

    const stages = (skipCurator ? HISTORY_STAGES.filter(s => s.role !== 'collaborator_3') : HISTORY_STAGES)
      .map((s, i) => ({ ...s, _idx: i }))
      // Include upper-tier stages based on documentSubmitterRole; drop lower-tier non-participants
      .filter(s => {
        if (['supervisor','deputy','minister'].includes(s.role)) return upperRolesToShow.has(s.role);
        return lowerRoleOrder.indexOf(s.role) < 0 || lowerRoleOrder.indexOf(s.role) >= startRoleIdx;
      });
    // Group history events by role
    const byRole = {};
    for (const ev of historyArr) {
      const r = ev.user_role || '';
      if (!byRole[r]) byRole[r] = [];
      byRole[r].push(ev);
    }

    const stagesHtml = stages.map((stage) => {
      const events = byRole[stage.role] || [];
      const hasEvents = events.length > 0;
      const isPast    = stage._idx < currentLevel;
      const isCurrent = stage._idx === currentLevel;
      // A stage is truly "pending" only if it's above current level AND has never had any events
      const isPending = stage._idx > currentLevel && !hasEvents;
      // A stage above current level that has events was previously visited but section was returned below it
      const isReturned = stage._idx > currentLevel && hasEvents;

      let dotClass;
      if (isPending) dotClass = 'sh-stage--pending';
      else if (isReturned) dotClass = 'sh-stage--returned';
      else if (isCurrent && hasEvents) dotClass = 'sh-stage--active';
      else if (isCurrent) dotClass = 'sh-stage--active';
      else if (isPast && hasEvents) dotClass = 'sh-stage--done';
      else dotClass = 'sh-stage--warn'; // passed without recorded action

      let eventsHtml = '';
      if (isPending) {
        eventsHtml = `<div class="sh-pending-label">Pending</div>`;
      } else if (events.length === 0) {
        eventsHtml = `<div class="sh-no-action">${isPast ? 'No action recorded' : 'In progress — no actions yet'}</div>`;
      } else {
        // Deduplicate: collapse consecutive saves by same actor into one
        const collapsed = [];
        for (const ev of events) {
          const last = collapsed[collapsed.length - 1];
          if (last && last.action === 'saved' && ev.action === 'saved' && last.user_name === ev.user_name) {
            last.acted_at = ev.acted_at; // keep latest save date
            last._count = (last._count || 1) + 1;
          } else {
            collapsed.push({ ...ev });
          }
        }
        eventsHtml = collapsed.map(ev => {
          const actor = escapeHtml(ev.user_name || 'Unknown');
          const date = ev.acted_at ? new Date(ev.acted_at).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
          if (ev.action === 'returned') {
            const noteInner = ev.note ? escapeHtml(ev.note) : '<span class="sh-return-note__empty">No comment provided</span>';
            return `<div class="sh-event"><span class="sh-actor">${actor}</span><details class="sh-return-details"><summary>Returned</summary><div class="sh-return-note">${noteInner}</div></details><span class="sh-date">${date}</span></div>`;
          }
          if (ev.action === 'asked_to_return') {
            const noteInner = ev.note ? escapeHtml(ev.note) : '<span class="sh-return-note__empty">No comment provided</span>';
            return `<div class="sh-event"><span class="sh-actor">${actor}</span><details class="sh-return-details sh-return-details--ask"><summary>Asked to Return</summary><div class="sh-return-note">${noteInner}</div></details><span class="sh-date">${date}</span></div>`;
          }
          const tagLabel = ev.action === 'saved' ? (ev._count > 1 ? `Edited (×${ev._count})` : 'Edited') :
                           ev.action === 'submitted' ? 'Submitted' :
                           ev.action === 'approved'  ? 'Approved'  : ev.action;
          const tagClass = `sh-action-tag sh-action-tag--${ev.action === 'saved' ? 'saved' : ev.action}`;
          return `<div class="sh-event"><span class="sh-actor">${actor}</span><span class="${tagClass}">${tagLabel}</span><span class="sh-date">${date}</span></div>`;
        }).join('');
      }

      // Stage header shows only the role title; actor names appear in the event rows below
      const stageLabelHtml = escapeHtml(stage.label);
      return `<div class="sh-stage ${dotClass}">
        <div class="sh-dot"></div>
        <div class="sh-body">
          <div class="sh-stage-label">${stageLabelHtml}</div>
          <div class="sh-events">${eventsHtml}</div>
        </div>
      </div>`;
    }).join('');

    return `<div class="sh-timeline">${stagesHtml}</div>`;
  }

  // Attaches a history toggle button + lazy-loaded history row to a table row (tr) or card element.
  // section: { sectionId, status }, eventId: number
  window.GCP.attachSectionHistoryToggle = function(container, section, eventId, isCard) {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'section-history-toggle';
    toggleBtn.innerHTML = `<span>History</span><span class="hist-arrow">▼</span>`;
    container.appendChild(toggleBtn);

    let loaded = false;
    let open = false;

    if (isCard) {
      // Card layout: inject a panel div directly
      const panel = document.createElement('div');
      panel.className = 'section-history-panel';
      panel.hidden = true;
      container.parentElement?.appendChild(panel);

      toggleBtn.addEventListener('click', async () => {
        open = !open;
        toggleBtn.classList.toggle('is-open', open);
        panel.hidden = !open;
        if (open && !loaded) {
          loaded = true;
          panel.innerHTML = '<div class="sh-no-action">Loading…</div>';
          try {
            const data = await window.GCP.apiFetch(`/tp/section-history?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(section.sectionId)}`, { method:'GET' });
            panel.innerHTML = renderHistoryTimeline(data.history || [], section.status, section.lowerSubmitterRole, section.originalSubmitterRole, section.documentSubmitterRole);
          } catch (e) {
            panel.innerHTML = `<div class="sh-no-action">Could not load history: ${escapeHtml(e.message||'error')}</div>`;
          }
        }
      });
    } else {
      // Table row layout: insert a sibling <tr> with colspan (deferred until tr is in DOM)
      const tr = container.closest('tr');
      if (!tr) return;
      const histRow = document.createElement('tr');
      histRow.className = 'section-history-row';
      histRow.hidden = true;
      histRow.innerHTML = `<td colspan="3"><div class="section-history-panel"></div></td>`;
      const panel = histRow.querySelector('.section-history-panel');

      toggleBtn.addEventListener('click', async () => {
        open = !open;
        toggleBtn.classList.toggle('is-open', open);
        // Lazily insert the histRow the first time it's needed (tr is in DOM by now)
        if (!histRow.parentNode && tr.parentNode) tr.after(histRow);
        histRow.hidden = !open;
        if (open && !loaded) {
          loaded = true;
          panel.innerHTML = '<div class="sh-no-action">Loading…</div>';
          try {
            const data = await window.GCP.apiFetch(`/tp/section-history?event_id=${encodeURIComponent(eventId)}&section_id=${encodeURIComponent(section.sectionId)}`, { method:'GET' });
            panel.innerHTML = renderHistoryTimeline(data.history || [], section.status, section.lowerSubmitterRole, section.originalSubmitterRole, section.documentSubmitterRole);
          } catch (e) {
            panel.innerHTML = `<div class="sh-no-action">Could not load history: ${escapeHtml(e.message||'error')}</div>`;
          }
        }
      });
    }
  };

  // ---- Comment dropdown (replaces browser prompt() for Return / Ask to Return) ----
  // showCommentDropdown(anchorEl, opts) → Promise<string|null>
  // opts: { placeholder, sendLabel, title }
  // Resolves with the trimmed comment string on Send, or null on Cancel/Escape/outside-click.
  window.GCP.showCommentDropdown = function(anchorEl, opts) {
    return new Promise(function(resolve) {
      const { placeholder = 'Add a comment…', sendLabel = 'Send', title = '' } = opts || {};

      // Remove any existing dropdown
      const existing = document.getElementById('gcp-comment-dropdown');
      if (existing) existing.remove();

      const panel = document.createElement('div');
      panel.id = 'gcp-comment-dropdown';
      panel.className = 'gcp-comment-dropdown';
      if (title) {
        const h = document.createElement('div');
        h.className = 'gcp-comment-dropdown__title';
        h.textContent = title;
        panel.appendChild(h);
      }
      const textarea = document.createElement('textarea');
      textarea.className = 'gcp-comment-dropdown__textarea';
      textarea.placeholder = placeholder;
      textarea.rows = 3;
      panel.appendChild(textarea);

      const actions = document.createElement('div');
      actions.className = 'gcp-comment-dropdown__actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'gcp-comment-dropdown__btn gcp-comment-dropdown__btn--cancel';
      cancelBtn.textContent = 'Cancel';

      const sendBtn = document.createElement('button');
      sendBtn.type = 'button';
      sendBtn.className = 'gcp-comment-dropdown__btn gcp-comment-dropdown__btn--send';
      sendBtn.textContent = sendLabel;

      actions.appendChild(cancelBtn);
      actions.appendChild(sendBtn);
      panel.appendChild(actions);
      document.body.appendChild(panel);

      // Position panel below or above anchor
      function positionPanel() {
        const rect = anchorEl.getBoundingClientRect();
        const panelH = 160;
        const spaceBelow = window.innerHeight - rect.bottom;
        panel.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
        if (spaceBelow >= panelH || spaceBelow >= rect.top) {
          panel.style.top = (rect.bottom + window.scrollY + 4) + 'px';
          panel.style.bottom = '';
        } else {
          panel.style.top = (rect.top + window.scrollY - panelH - 4) + 'px';
          panel.style.bottom = '';
        }
      }
      positionPanel();
      textarea.focus();

      function cleanup() {
        panel.remove();
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('mousedown', onOutside, true);
      }
      function onKey(e) {
        if (e.key === 'Escape') { cleanup(); resolve(null); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { doSend(); }
      }
      function onOutside(e) {
        if (!panel.contains(e.target) && e.target !== anchorEl) { cleanup(); resolve(null); }
      }
      function doSend() {
        const val = textarea.value.trim();
        cleanup();
        resolve(val);
      }
      cancelBtn.addEventListener('click', function() { cleanup(); resolve(null); });
      sendBtn.addEventListener('click', doSend);
      document.addEventListener('keydown', onKey, true);
      setTimeout(function() { document.addEventListener('mousedown', onOutside, true); }, 50);
    });
  };

})();