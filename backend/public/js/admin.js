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
          <button class="btn danger" data-act="deactivate">Delete</button>
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
        if (!confirm("Delete this user? (soft delete)")) return;
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
          await loadAssignmentsMeta();
        }catch(err){ alert(err.message || 'Failed'); }
      });

      tr.querySelector('[data-act="saveOrder"]').addEventListener('click', async () => {
        const val = Number(orderInput.value);
        if (!Number.isFinite(val)) return alert('Order must be a number');
        try{
          await window.GCP.apiFetch(`/sections/${s.id}`, { method:"PUT", body: JSON.stringify({ orderIndex: val }) });
          await loadSections();
          await loadAssignmentsMeta();
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
          await loadAssignmentsMeta();
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
      await loadAssignmentsMeta();
    }catch(err){
      msgSections.textContent = err.message || "Failed";
    }
  });

  /** ASSIGNMENTS **/
  const assignUserSelect = document.getElementById("assignUserSelect");
  const assignUserRole = document.getElementById("assignUserRole");
  const saveAssignmentsBtn = document.getElementById("saveAssignmentsBtn");
  const assignmentsMsg = document.getElementById("assignmentsMsg");
  const sectionsChecklist = document.getElementById("sectionsChecklist");
  const countriesChecklist = document.getElementById("countriesChecklist");

  let sectionsCache = [];
  let countriesCache = [];
  let assignableUsersCache = [];

  function setAssignMsg(text, isError=false){
    assignmentsMsg.textContent = text || '';
    assignmentsMsg.style.color = isError ? 'crimson' : '#2b445b';
  }

  function renderCheckboxList(container, items, selectedSet){
    container.innerHTML = "";
    for (const it of items){
      const id = String(it.id);
      const label = it.label || it.name || it.name_en || it.nameEn || it.code || String(it.id);
      const wrap = document.createElement("label");
      wrap.className = "checkitem";
      wrap.innerHTML = `<input type="checkbox" value="${window.GCP.escapeHtml(id)}" ${selectedSet.has(id) ? "checked" : ""}/> <span>${window.GCP.escapeHtml(label)}</span>`;
      container.appendChild(wrap);
    }
  }

  function getCheckedIds(container){
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(el => Number(el.value)).filter(Number.isFinite);
  }

  // Region grouping by ISO-2 country code
  const NEIGHBORS = new Set(['BY','UA','MD','RU','AZ','AM','KZ','TJ','KG','UZ','TM']);
  const EU = new Set(['EU','AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']);

  const OTHER_EUROPE = new Set([
    'AL','AD','BA','CH','IS','LI','MC','ME','MK','NO','RS','SM','TR','GB','VA','GE','MD','UA','BY','RU','XK'
  ]);

  const NORTH_AMERICA = new Set(['US','CA','MX','GL','BM']);
  const CENTRAL_CARIBBEAN = new Set([
    'BZ','CR','SV','GT','HN','NI','PA',
    'AG','BS','BB','CU','DM','DO','GD','HT','JM','KN','LC','VC','TT','PR','BS','AI','AW','BQ','CW','GP','KY','MF','MQ','MS','SX','TC','VG','VI','BL','BQ','CW'
  ]);
  const SOUTH_AMERICA = new Set(['AR','BO','BR','CL','CO','EC','GY','PY','PE','SR','UY','VE','FK','GF']);
  const AFRICA = new Set([
    'DZ','AO','BJ','BW','BF','BI','CV','CM','CF','TD','KM','CG','CD','CI','DJ','EG','GQ','ER','SZ','ET','GA','GM','GH','GN','GW','KE','LS','LR','LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW','ST','SN','SC','SL','SO','ZA','SS','SD','TZ','TG','TN','UG','ZM','ZW','EH'
  ]);
  const ASIA = new Set([
    'AF','BH','BD','BT','BN','KH','CN','TL','IN','ID','IR','IQ','IL','JP','JO','KW','LA','LB','MY','MV','MN','MM','NP','KP','OM','PK','PS','PH','QA','SA','SG','KR','LK','SY','TW','TH','AE','VN','YE','HK','MO'
  ]);
  const OCEANIA = new Set([
    'AU','NZ','FJ','FM','KI','MH','NR','PW','PG','WS','SB','TO','TV','VU','CK','NC','PF','GU','MP','AS'
  ]);

  function countryGroup(code){
    const c = String(code || '').toUpperCase();
    if (!c) return 'Other/Uncategorized';
    if (NEIGHBORS.has(c)) return 'Neighbors';
    if (EU.has(c)) return 'EU + EU countries';
    if (OTHER_EUROPE.has(c)) return 'Other Europe';
    if (NORTH_AMERICA.has(c)) return 'North America';
    if (CENTRAL_CARIBBEAN.has(c)) return 'Central America & Caribbean';
    if (SOUTH_AMERICA.has(c)) return 'South America';
    if (AFRICA.has(c)) return 'Africa';
    if (ASIA.has(c)) return 'Asia';
    if (OCEANIA.has(c)) return 'Australia & Oceania';
    return 'Other/Uncategorized';
  }

  function renderCountriesGrouped(selectedSet){
    countriesChecklist.innerHTML = "";

    const groupsOrder = [
      'EU + EU countries',
      'Other Europe',
      'North America',
      'Central America & Caribbean',
      'South America',
      'Africa',
      'Asia',
      'Australia & Oceania',
      'Neighbors',
      'Other/Uncategorized'
    ];

    const groups = new Map();
    for (const c of countriesCache){
      const g = countryGroup(c.code);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(c);
    }
    for (const g of groupsOrder){
      const items = groups.get(g) || [];
      if (!items.length) continue;

      items.sort((a,b) => String(a.name_en || a.nameEn || '').localeCompare(String(b.name_en || b.nameEn || ''), 'en'));
      const box = document.createElement("div");
      box.className = "groupbox";
      box.innerHTML = `<div class="grouphead">${window.GCP.escapeHtml(g)}</div>`;
      const inner = document.createElement("div");
      inner.className = "checklist";
      renderCheckboxList(inner, items.map(x => ({ id:x.id, label:x.name_en || x.nameEn || x.code })), selectedSet);
      box.appendChild(inner);
      countriesChecklist.appendChild(box);
    }
  }

  async function loadAssignmentsMeta(){
    sectionsCache = await window.GCP.apiFetch("/sections", { method:"GET" });
    countriesCache = await window.GCP.apiFetch("/countries", { method:"GET" });

    // Users eligible for assignment
    const users = await window.GCP.apiFetch("/users", { method:"GET" });
    assignableUsersCache = (users || []).filter(u => {
      const rk = String(u.role || '').toLowerCase();
      return (rk === 'collaborator' || rk === 'super_collaborator') && u.isActive;
    });

    assignUserSelect.innerHTML = `<option value="">Select…</option>` + assignableUsersCache.map(u => {
      return `<option value="${u.id}">${window.GCP.escapeHtml(u.fullName)} (${window.GCP.escapeHtml(u.username)})</option>`;
    }).join("");

    // Default empty UI
    renderCheckboxList(sectionsChecklist, sectionsCache.map(s => ({ id:s.id, label:s.label })), new Set());
    renderCountriesGrouped(new Set());
  }

  async function loadUserAssignments(){
    setAssignMsg("");
    const userId = Number(assignUserSelect.value);
    if (!Number.isFinite(userId)){
      assignUserRole.value = "";
      renderCheckboxList(sectionsChecklist, sectionsCache.map(s => ({ id:s.id, label:s.label })), new Set());
      renderCountriesGrouped(new Set());
      saveAssignmentsBtn.disabled = true;
      return;
    }

    const u = assignableUsersCache.find(x => x.id === userId);
    assignUserRole.value = u ? window.GCP.roleToTitle(u.role) : "";
    saveAssignmentsBtn.disabled = false;

    const a = await window.GCP.apiFetch(`/admin/assignments/${userId}`, { method:"GET" });
    const secSet = new Set((a.sectionIds || []).map(String));
    const cSet = new Set((a.countryIds || []).map(String));

    renderCheckboxList(sectionsChecklist, sectionsCache.map(s => ({ id:s.id, label:s.label })), secSet);
    renderCountriesGrouped(cSet);
  }

  assignUserSelect.addEventListener("change", loadUserAssignments);

  saveAssignmentsBtn.addEventListener("click", async () => {
    setAssignMsg("");
    const userId = Number(assignUserSelect.value);
    if (!Number.isFinite(userId)) return;

    const sectionIds = getCheckedIds(sectionsChecklist);
    const countryIds = getCheckedIds(countriesChecklist);

    try{
      await window.GCP.apiFetch("/admin/assignments", {
        method:"POST",
        body: JSON.stringify({ userId, sectionIds, countryIds })
      });
      setAssignMsg("Saved.");
    }catch(err){
      setAssignMsg(err.message || "Failed to save", true);
    }
  });


try{
    await loadUsers();
    await loadSections();
    await loadAssignmentsMeta();
    saveAssignmentsBtn.disabled = true;
  }catch(err){
    msgUsers.textContent = err.message || "Failed to load admin data";
  }
})();
