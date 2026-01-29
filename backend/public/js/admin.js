// admin.js
(async function(){
  const me = await window.GCP.requireAuth();
  if (!me) return;

  if (String(me.role).toLowerCase() !== "admin"){
    document.getElementById("mainCard").innerHTML = `<div class="muted">Forbidden</div>`;
    return;
  }

  const tabUsers = document.getElementById("tabUsers");
  const tabSections = document.getElementById("tabSections");
  const tabAssignments = document.getElementById("tabAssignments");

  const usersPanel = document.getElementById("usersPanel");
  const sectionsPanel = document.getElementById("sectionsPanel");
  const assignmentsPanel = document.getElementById("assignmentsPanel");

  const tabs = [
    { btn: tabUsers, panel: usersPanel },
    { btn: tabSections, panel: sectionsPanel },
    { btn: tabAssignments, panel: assignmentsPanel },
  ];

  function show(panel){
    for (const t of tabs){
      t.btn.classList.toggle("primary", t.panel===panel);
      t.panel.style.display = (t.panel===panel) ? "block" : "none";
    }
  }

  tabUsers.addEventListener("click", () => show(usersPanel));
  tabSections.addEventListener("click", () => show(sectionsPanel));
  tabAssignments.addEventListener("click", () => show(assignmentsPanel));

  show(usersPanel);

  /** USERS **/
  const usersTbody = document.getElementById("usersTbody");
  const createUserForm = document.getElementById("createUserForm");
  const msgUsers = document.getElementById("msgUsers");

  async function loadUsers(){
    const users = await window.GCP.apiFetch("/users", { method:"GET" });
    usersTbody.innerHTML = "";
    for (const u of users){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(u.username)}</td>
        <td>${window.GCP.escapeHtml(u.fullName)}</td>
        <td>${window.GCP.escapeHtml(u.email || "")}</td>
        <td>${window.GCP.escapeHtml(window.GCP.roleToTitle(u.role))}</td>
        <td>${u.isActive ? 'Yes' : 'No'}</td>
        <td class="row">
          <button class="btn" data-act="edit">Edit</button>
          <button class="btn danger" data-act="deactivate">Deactivate</button>
        </td>
      `;
      tr.querySelector('[data-act="edit"]').addEventListener("click", async () => {
        const newFull = prompt("Full name:", u.fullName);
        if (newFull === null) return;
        const newEmail = prompt("Email:", u.email || "");
        if (newEmail === null) return;
        const newRole = prompt("Role (admin/minister/chairman(=deputy)/supervisor/protocol/super_collaborator/collaborator/viewer):", u.role);
        if (newRole === null) return;
        const pw = prompt("New password (leave blank to keep):", "");
        try{
          await window.GCP.apiFetch(`/users/${u.id}`, {
            method:"PUT",
            body: JSON.stringify({ fullName: newFull, email: newEmail || null, role: newRole, password: pw || undefined })
          });
          await loadUsers();
        }catch(err){ alert(err.message || "Failed"); }
      });
      tr.querySelector('[data-act="deactivate"]').addEventListener("click", async () => {
        if (!confirm("Deactivate this user?")) return;
        try{
          await window.GCP.apiFetch(`/users/${u.id}`, { method:"DELETE" });
          await loadUsers();
        }catch(err){ alert(err.message || "Failed"); }
      });
      usersTbody.appendChild(tr);
    }
  }

  createUserForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgUsers.textContent = "";
    const username = document.getElementById("newUsername").value.trim();
    const fullName = document.getElementById("newFullName").value.trim();
    const email = document.getElementById("newEmail").value.trim();
    const role = document.getElementById("newRole").value;
    const password = document.getElementById("newPassword").value;

    try{
      await window.GCP.apiFetch("/users", { method:"POST", body: JSON.stringify({ username, fullName, email: email || null, role, password }) });
      createUserForm.reset();
      await loadUsers();
    }catch(err){
      msgUsers.textContent = err.message || "Failed";
    }
  });

  /** SECTIONS **/
  const sectionsTbody = document.getElementById("sectionsTbody");
  const createSectionForm = document.getElementById("createSectionForm");
  const msgSections = document.getElementById("msgSections");

  async function loadSections(){
    const sections = await window.GCP.apiFetch("/sections", { method:"GET" });
    sectionsTbody.innerHTML = "";

    for (const s of sections){
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(s.key)}</td>
        <td>${window.GCP.escapeHtml(s.label)}</td>
        <td style="max-width:120px;">
          <input type="number" class="orderInput" value="${Number(s.order_index || 0)}" style="width:100%; padding:8px 10px; border:1px solid var(--border); border-radius:12px;" />
        </td>
        <td>${s.is_active ? 'Yes' : 'No'}</td>
        <td class="row">
          <button class="btn" data-act="rename">Rename</button>
          <button class="btn" data-act="saveOrder">Save order</button>
          <button class="btn ${s.is_active ? 'danger' : ''}" data-act="toggle">${s.is_active ? 'Deactivate' : 'Activate'}</button>
        </td>
      `;

      const orderInput = tr.querySelector('.orderInput');

      tr.querySelector('[data-act="rename"]').addEventListener('click', async () => {
        const newLabel = prompt('Section label:', s.label);
        if (newLabel === null) return;
        try{
          await window.GCP.apiFetch(`/sections/${s.id}`, { method:"PUT", body: JSON.stringify({ label: newLabel }) });
          await loadSections();
          await loadAssignmentsPicklists();
        }catch(err){ alert(err.message || 'Failed'); }
      });

      tr.querySelector('[data-act="saveOrder"]').addEventListener('click', async () => {
        const val = Number(orderInput.value);
        if (!Number.isFinite(val)) return alert('Order must be a number');
        try{
          await window.GCP.apiFetch(`/sections/${s.id}`, { method:"PUT", body: JSON.stringify({ orderIndex: val }) });
          await loadSections();
          await loadAssignmentsPicklists();
        }catch(err){ alert(err.message || 'Failed'); }
      });

      orderInput.addEventListener('keydown', async (ev) => {
        if (ev.key === 'Enter'){
          ev.preventDefault();
          tr.querySelector('[data-act="saveOrder"]').click();
        }
      });

      tr.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
        try{
          if (s.is_active){
            if (!confirm('Deactivate this section?')) return;
            await window.GCP.apiFetch(`/sections/${s.id}`, { method:"DELETE" });
          }else{
            await window.GCP.apiFetch(`/sections/${s.id}`, { method:"PUT", body: JSON.stringify({ isActive: true }) });
          }
          await loadSections();
          await loadAssignmentsPicklists();
        }catch(err){ alert(err.message || 'Failed'); }
      });

      sectionsTbody.appendChild(tr);
    }
  }

  createSectionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgSections.textContent = "";
    const key = document.getElementById("newSectionKey").value.trim();
    const label = document.getElementById("newSectionLabel").value.trim();
    const orderIndex = Number(document.getElementById("newSectionOrder").value || "0");

    try{
      await window.GCP.apiFetch("/sections", { method:"POST", body: JSON.stringify({ key, label, orderIndex }) });
      createSectionForm.reset();
      await loadSections();
      await loadAssignmentsPicklists();
    }catch(err){
      msgSections.textContent = err.message || "Failed";
    }
  });

  /** ASSIGNMENTS **/
  const assignmentTbody = document.getElementById("assignmentTbody");
  const assignForm = document.getElementById("assignForm");
  const assignUser = document.getElementById("assignUser");
  const assignSection = document.getElementById("assignSection");
  const msgAssign = document.getElementById("msgAssign");

  const assignCountriesForm = document.getElementById("assignCountriesForm");
  const assignCountryUser = document.getElementById("assignCountryUser");
  const countryGroupsEl = document.getElementById("countryGroups");
  const msgAssignCountries = document.getElementById("msgAssignCountries");

  let allCountries = [];
  let countryCheckboxIndex = {}; // countryId -> checkbox element

  const REGION_GROUPS = (function(){
    const EU = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"];
    const NEIGHBORS = ["BY","UA","MD","RU","AZ","AM","KZ","TJ","KG","UZ","TM"];
    const EUROPE_ALL = ["AL","AD","AT","BY","BE","BA","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GI","GR","HU","IS","IE","IT","XK","LV","LI","LT","LU","MT","MD","MC","ME","NL","MK","NO","PL","PT","RO","RU","SM","RS","SK","SI","ES","SE","CH","TR","UA","GB","VA"];
    const NORTH_AMERICA = ["US","CA","MX","GL","BM","PM"];
    const CENTRAL_AMERICA = ["BZ","GT","SV","HN","NI","CR","PA","BS","BB","CU","DM","DO","GD","HT","JM","KN","LC","VC","TT","AG","AI","AW","BQ","CW","KY","GP","MQ","MS","PR","SX","TC","VG","VI"];
    const SOUTH_AMERICA = ["AR","BO","BR","CL","CO","EC","GF","GY","PY","PE","SR","UY","VE","FK"];
    const AFRICA = ["DZ","AO","BJ","BW","BF","BI","CV","CM","CF","TD","KM","CG","CD","CI","DJ","EG","GQ","ER","SZ","ET","GA","GM","GH","GN","GW","KE","LS","LR","LY","MG","MW","ML","MR","MU","MA","MZ","NA","NE","NG","RW","ST","SN","SC","SL","SO","ZA","SS","SD","TZ","TG","TN","UG","ZM","ZW","EH"];
    const ASIA = ["AF","AM","AZ","BH","BD","BT","BN","KH","CN","GE","HK","MO","IN","ID","IR","IQ","IL","JP","JO","KZ","KW","KG","LA","LB","MY","MV","MN","MM","NP","KP","KR","OM","PK","PS","PH","QA","SA","SG","LK","SY","TW","TJ","TH","TL","TM","AE","UZ","VN","YE"];
    const OCEANIA = ["AU","NZ","FJ","PG","SB","VU","NC","PF","WS","TO","TV","NR","FM","MH","PW","KI","CK","NU","TK","AS","GU","MP"];
    return [
      { id:"eu", label:"European Union", codes: EU },
      { id:"other_europe", label:"Other European countries", codes: EUROPE_ALL.filter(c => !EU.includes(c)) },
      { id:"north_america", label:"North America", codes: NORTH_AMERICA },
      { id:"south_america", label:"South America", codes: SOUTH_AMERICA },
      { id:"central_america", label:"Central America & Caribbean", codes: CENTRAL_AMERICA },
      { id:"africa", label:"Africa", codes: AFRICA },
      { id:"asia", label:"Asia", codes: ASIA },
      { id:"oceania", label:"Australia & Oceania", codes: OCEANIA },
      { id:"neighbors", label:"Neighboring countries", codes: NEIGHBORS },
    ];
  })();

  function renderCountryGroups(countries){
    countryCheckboxIndex = {};
    const remaining = new Map(countries.map(c => [String(c.code).toUpperCase(), c]));
    const groupsHtml = [];

    for (const g of REGION_GROUPS){
      const items = [];
      for (const code of g.codes){
        const c = remaining.get(code);
        if (c){
          items.push(c);
          remaining.delete(code);
        }
      }
      if (!items.length) continue;
      items.sort((a,b) => String(a.name_en).localeCompare(String(b.name_en)));
      const groupId = `grp_${g.id}`;
      groupsHtml.push(`
        <div class="country-group">
          <div class="country-group-head">
            <label><input type="checkbox" id="${groupId}_all"> <b>${window.GCP.escapeHtml(g.label)}</b></label>
          </div>
          <div class="country-group-body" id="${groupId}_body">
            ${items.map(c => `
              <label class="country-item">
                <input type="checkbox" data-country-id="${c.id}">
                ${window.GCP.escapeHtml(c.name_en)}
              </label>
            `).join("")}
          </div>
        </div>
      `);
    }

    // Anything not mapped goes into "Other"
    const otherItems = Array.from(remaining.values()).sort((a,b) => String(a.name_en).localeCompare(String(b.name_en)));
    if (otherItems.length){
      const groupId = "grp_other";
      groupsHtml.push(`
        <div class="country-group">
          <div class="country-group-head">
            <label><input type="checkbox" id="${groupId}_all"> <b>Other</b></label>
          </div>
          <div class="country-group-body" id="${groupId}_body">
            ${otherItems.map(c => `
              <label class="country-item">
                <input type="checkbox" data-country-id="${c.id}">
                ${window.GCP.escapeHtml(c.name_en)}
              </label>
            `).join("")}
          </div>
        </div>
      `);
    }

    countryGroupsEl.innerHTML = groupsHtml.join("");

    // Build index for quick set/get
    countryGroupsEl.querySelectorAll('input[data-country-id]').forEach(cb => {
      const id = cb.getAttribute('data-country-id');
      countryCheckboxIndex[id] = cb;
    });

    // Wire group toggles
    countryGroupsEl.querySelectorAll('input[id$="_all"]').forEach(master => {
      const groupId = master.id.replace(/_all$/,"");
      const body = document.getElementById(groupId + "_body");
      const kids = Array.from(body.querySelectorAll('input[data-country-id]'));
      master.addEventListener("change", () => {
        kids.forEach(k => { k.checked = master.checked; });
      });
      kids.forEach(k => k.addEventListener("change", () => {
        const checked = kids.filter(x => x.checked).length;
        master.indeterminate = checked > 0 && checked < kids.length;
        master.checked = checked === kids.length;
      }));
    });
  }

  async function loadCountriesAndRender(){
    allCountries = await window.GCP.apiFetch("/countries", { method:"GET" });
    renderCountryGroups(allCountries);
  }

  async function loadCountryAssignmentsForUser(userId){
    const ids = await window.GCP.apiFetch(`/country-assignments?user_id=${encodeURIComponent(userId)}`, { method:"GET" });
    // reset
    Object.values(countryCheckboxIndex).forEach(cb => cb.checked = false);
    (ids || []).forEach(id => {
      const cb = countryCheckboxIndex[String(id)];
      if (cb) cb.checked = true;
    });

    // Recalculate master checkboxes
    countryGroupsEl.querySelectorAll('input[id$="_all"]').forEach(master => {
      const groupId = master.id.replace(/_all$/,"");
      const body = document.getElementById(groupId + "_body");
      const kids = Array.from(body.querySelectorAll('input[data-country-id]'));
      const checked = kids.filter(x => x.checked).length;
      master.indeterminate = checked > 0 && checked < kids.length;
      master.checked = checked === kids.length && kids.length > 0;
    });
  }

  function getSelectedCountryIds(){
    return Object.entries(countryCheckboxIndex)
      .filter(([id, cb]) => cb.checked)
      .map(([id]) => Number(id))
      .filter(Number.isFinite);
  }


  async function loadAssignmentsPicklists(){
    const users = await window.GCP.apiFetch("/users", { method:"GET" });
    const sections = await window.GCP.apiFetch("/sections", { method:"GET" });

    const collaborators = users.filter(u => ['collaborator','super_collaborator'].includes(String(u.role).toLowerCase()) && u.isActive);

    assignUser.innerHTML = collaborators.map(u => `<option value="${u.id}">${window.GCP.escapeHtml(u.fullName)} (${window.GCP.escapeHtml(u.username)})</option>`).join("");
    if (assignCountryUser) assignCountryUser.innerHTML = collaborators.map(u => `<option value="${u.id}">${window.GCP.escapeHtml(u.fullName)} (${window.GCP.escapeHtml(u.username)})</option>`).join("");
    assignSection.innerHTML = sections.filter(s => s.is_active).map(s => `<option value="${s.id}">${window.GCP.escapeHtml(s.label)}</option>`).join("");
  }

  async function loadAssignments(){
    const rows = await window.GCP.apiFetch("/section-assignments", { method:"GET" });
    assignmentTbody.innerHTML = "";
    for (const a of rows){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${window.GCP.escapeHtml(a.full_name)} (${window.GCP.escapeHtml(a.username)})</td>
        <td>${window.GCP.escapeHtml(a.section_label)}</td>
        <td>${window.GCP.escapeHtml(a.created_at)}</td>
        <td><button class="btn danger">Remove</button></td>
      `;
      tr.querySelector("button").addEventListener("click", async () => {
        if (!confirm("Remove assignment?")) return;
        try{
          await window.GCP.apiFetch(`/section-assignments/${a.id}`, { method:"DELETE" });
          await loadAssignments();
        }catch(err){ alert(err.message || "Failed"); }
      });
      assignmentTbody.appendChild(tr);
    }
  }

  assignForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgAssign.textContent = "";
    try{
      await window.GCP.apiFetch("/section-assignments", {
        method:"POST",
        body: JSON.stringify({ userId: assignUser.value, sectionId: assignSection.value })
      });
      await loadAssignments();
    }catch(err){
      msgAssign.textContent = err.message || "Failed";
    }
  });

  // Country assignments
  if (assignCountryUser){
    assignCountryUser.addEventListener("change", async () => {
      msgAssignCountries.textContent = "";
      const uid = assignCountryUser.value;
      if (!uid) return;
      try{
        await loadCountryAssignmentsForUser(uid);
      }catch(err){
        msgAssignCountries.textContent = err.message || "Failed to load country assignments";
      }
    });
  }

  if (assignCountriesForm){
    assignCountriesForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      msgAssignCountries.textContent = "";
      const uid = assignCountryUser.value;
      if (!uid){
        msgAssignCountries.textContent = "Please select a collaborator.";
        return;
      }
      const countryIds = getSelectedCountryIds();
      try{
        await window.GCP.apiFetch("/country-assignments", {
          method:"PUT",
          body: JSON.stringify({ userId: Number(uid), countryIds })
        });
        msgAssignCountries.textContent = "Saved.";
        msgAssignCountries.style.color = "var(--ok)";
      }catch(err){
        msgAssignCountries.textContent = err.message || "Failed";
        msgAssignCountries.style.color = "var(--danger)";
      }
    });
  }


  try{
    await loadUsers();
    await loadSections();
    await loadAssignmentsPicklists();
    await loadCountriesAndRender();
    await loadAssignments();
    if (assignCountryUser && assignCountryUser.value){
      try{ await loadCountryAssignmentsForUser(assignCountryUser.value); }catch(e){}
    }
  }catch(err){
    msgUsers.textContent = err.message || "Failed to load admin data";
  }
})();
