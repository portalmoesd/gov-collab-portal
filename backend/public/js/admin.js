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

const assignCountriesForm = document.getElementById('assignCountriesForm');
const assignUserCountries = document.getElementById('assignUserCountries');
const countryChecklist = document.getElementById('countryChecklist');
const msgAssignCountries = document.getElementById('msgAssignCountries');
const countryAssignTbody = document.getElementById('countryAssignTbody');

const COUNTRY_GROUP_BY_CODE = {
    "AD": "Other European countries",
    "AE": "Asia",
    "AF": "Asia",
    "AG": "Central America & Caribbean",
    "AI": "Central America & Caribbean",
    "AL": "Other European countries",
    "AM": "Neighboring countries",
    "AO": "Africa",
    "AQ": "Antarctica & Territories",
    "AR": "South America",
    "AS": "Australia & Oceania",
    "AT": "European Union",
    "AU": "Australia & Oceania",
    "AW": "Central America & Caribbean",
    "AX": "Other European countries",
    "AZ": "Neighboring countries",
    "BA": "Other European countries",
    "BB": "Central America & Caribbean",
    "BD": "Asia",
    "BE": "European Union",
    "BF": "Africa",
    "BG": "European Union",
    "BH": "Asia",
    "BI": "Africa",
    "BJ": "Africa",
    "BL": "Central America & Caribbean",
    "BM": "North America",
    "BN": "Asia",
    "BO": "South America",
    "BQ": "Central America & Caribbean",
    "BR": "South America",
    "BS": "Central America & Caribbean",
    "BT": "Asia",
    "BV": "Antarctica & Territories",
    "BW": "Africa",
    "BY": "Neighboring countries",
    "BZ": "Central America & Caribbean",
    "CA": "North America",
    "CC": "Australia & Oceania",
    "CD": "Africa",
    "CF": "Africa",
    "CG": "Africa",
    "CH": "Other European countries",
    "CI": "Africa",
    "CK": "Australia & Oceania",
    "CL": "South America",
    "CM": "Africa",
    "CN": "Asia",
    "CO": "South America",
    "CR": "Central America & Caribbean",
    "CU": "Central America & Caribbean",
    "CV": "Africa",
    "CW": "Central America & Caribbean",
    "CX": "Australia & Oceania",
    "CY": "European Union",
    "CZ": "European Union",
    "DE": "European Union",
    "DJ": "Africa",
    "DK": "European Union",
    "DM": "Central America & Caribbean",
    "DO": "Central America & Caribbean",
    "DZ": "Africa",
    "EC": "South America",
    "EE": "European Union",
    "EG": "Africa",
    "EH": "Africa",
    "ER": "Africa",
    "ES": "European Union",
    "ET": "Africa",
    "FI": "European Union",
    "FJ": "Australia & Oceania",
    "FK": "South America",
    "FM": "Australia & Oceania",
    "FO": "Other European countries",
    "FR": "European Union",
    "GA": "Africa",
    "GB": "Other European countries",
    "GD": "Central America & Caribbean",
    "GE": "Asia",
    "GF": "South America",
    "GG": "Other European countries",
    "GH": "Africa",
    "GI": "Other European countries",
    "GL": "North America",
    "GM": "Africa",
    "GN": "Africa",
    "GP": "Central America & Caribbean",
    "GQ": "Africa",
    "GR": "European Union",
    "GS": "South America",
    "GT": "Central America & Caribbean",
    "GU": "Australia & Oceania",
    "GW": "Africa",
    "GY": "South America",
    "HK": "Asia",
    "HM": "Antarctica & Territories",
    "HN": "Central America & Caribbean",
    "HR": "European Union",
    "HT": "Central America & Caribbean",
    "HU": "European Union",
    "ID": "Asia",
    "IE": "European Union",
    "IL": "Asia",
    "IM": "Other European countries",
    "IN": "Asia",
    "IO": "Africa",
    "IQ": "Asia",
    "IR": "Asia",
    "IS": "Other European countries",
    "IT": "European Union",
    "JE": "Other European countries",
    "JM": "Central America & Caribbean",
    "JO": "Asia",
    "JP": "Asia",
    "KE": "Africa",
    "KG": "Neighboring countries",
    "KH": "Asia",
    "KI": "Australia & Oceania",
    "KM": "Africa",
    "KN": "Central America & Caribbean",
    "KP": "Asia",
    "KR": "Asia",
    "KW": "Asia",
    "KY": "Central America & Caribbean",
    "KZ": "Neighboring countries",
    "LA": "Asia",
    "LB": "Asia",
    "LC": "Central America & Caribbean",
    "LI": "Other European countries",
    "LK": "Asia",
    "LR": "Africa",
    "LS": "Africa",
    "LT": "European Union",
    "LU": "European Union",
    "LV": "European Union",
    "LY": "Africa",
    "MA": "Africa",
    "MC": "Other European countries",
    "MD": "Neighboring countries",
    "ME": "Other European countries",
    "MF": "Central America & Caribbean",
    "MG": "Africa",
    "MH": "Australia & Oceania",
    "MK": "Other European countries",
    "ML": "Africa",
    "MM": "Asia",
    "MN": "Asia",
    "MO": "Asia",
    "MP": "Australia & Oceania",
    "MQ": "Central America & Caribbean",
    "MR": "Africa",
    "MS": "Central America & Caribbean",
    "MT": "European Union",
    "MU": "Africa",
    "MV": "Asia",
    "MW": "Africa",
    "MX": "Central America & Caribbean",
    "MY": "Asia",
    "MZ": "Africa",
    "NA": "Africa",
    "NC": "Australia & Oceania",
    "NE": "Africa",
    "NF": "Australia & Oceania",
    "NG": "Africa",
    "NI": "Central America & Caribbean",
    "NL": "European Union",
    "NO": "Other European countries",
    "NP": "Asia",
    "NR": "Australia & Oceania",
    "NU": "Australia & Oceania",
    "NZ": "Australia & Oceania",
    "OM": "Asia",
    "PA": "Central America & Caribbean",
    "PE": "South America",
    "PF": "Australia & Oceania",
    "PG": "Australia & Oceania",
    "PH": "Asia",
    "PK": "Asia",
    "PL": "European Union",
    "PM": "North America",
    "PN": "Australia & Oceania",
    "PR": "Central America & Caribbean",
    "PS": "Asia",
    "PT": "European Union",
    "PW": "Australia & Oceania",
    "PY": "South America",
    "QA": "Asia",
    "RE": "Africa",
    "RO": "European Union",
    "RS": "Other European countries",
    "RU": "Neighboring countries",
    "RW": "Africa",
    "SA": "Asia",
    "SB": "Australia & Oceania",
    "SC": "Africa",
    "SD": "Africa",
    "SE": "European Union",
    "SG": "Asia",
    "SH": "Africa",
    "SI": "European Union",
    "SJ": "Other European countries",
    "SK": "European Union",
    "SL": "Africa",
    "SM": "Other European countries",
    "SN": "Africa",
    "SO": "Africa",
    "SR": "South America",
    "SS": "Africa",
    "ST": "Africa",
    "SV": "Central America & Caribbean",
    "SX": "Central America & Caribbean",
    "SY": "Asia",
    "SZ": "Africa",
    "TC": "Central America & Caribbean",
    "TD": "Africa",
    "TF": "Antarctica & Territories",
    "TG": "Africa",
    "TH": "Asia",
    "TJ": "Neighboring countries",
    "TK": "Australia & Oceania",
    "TL": "Asia",
    "TM": "Neighboring countries",
    "TN": "Africa",
    "TO": "Australia & Oceania",
    "TR": "Asia",
    "TT": "Central America & Caribbean",
    "TV": "Australia & Oceania",
    "TW": "Asia",
    "TZ": "Africa",
    "UA": "Neighboring countries",
    "UG": "Africa",
    "UM": "Australia & Oceania",
    "US": "North America",
    "UY": "South America",
    "UZ": "Neighboring countries",
    "VA": "Other European countries",
    "VC": "Central America & Caribbean",
    "VE": "South America",
    "VG": "Central America & Caribbean",
    "VI": "Central America & Caribbean",
    "VN": "Asia",
    "VU": "Australia & Oceania",
    "WF": "Australia & Oceania",
    "WS": "Australia & Oceania",
    "YE": "Asia",
    "YT": "Africa",
    "ZA": "Africa",
    "ZM": "Africa",
    "ZW": "Africa"
  };

const COUNTRY_GROUP_ORDER = [
  "European Union",
  "Other European countries",
  "North America",
  "Central America & Caribbean",
  "South America",
  "Africa",
  "Asia",
  "Australia & Oceania",
  "Neighboring countries",
  "Antarctica & Territories",
  "Americas (Other)",
  "Other"
];

  async function loadAssignmentsPicklists(){
    const users = await window.GCP.apiFetch("/users", { method:"GET" });
    const sections = await window.GCP.apiFetch("/sections", { method:"GET" });

    const collaborators = users.filter(u => ['collaborator','super_collaborator'].includes(String(u.role).toLowerCase()) && u.isActive);

    assignUser.innerHTML = collaborators.map(u => `<option value="${u.id}">${window.GCP.escapeHtml(u.fullName)} (${window.GCP.escapeHtml(u.username)})</option>`).join("");
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

  try{
    await loadUsers();
    await loadSections();
    await loadAssignmentsPicklists();
    await loadAssignments();
  }catch(err){
    msgUsers.textContent = err.message || "Failed to load admin data";
  }
})();
