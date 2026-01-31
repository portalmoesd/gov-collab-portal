/* GOV COLLAB PORTAL - styles.css (Blueprint v2) */
:root{
  --bg:#f6f8fb;
  --card:#ffffff;
  --text:#1f2a37;
  --muted:#6b7280;
  --primary:#2b445b;
  --primary-2:#233e57;
  --border:#e5e7eb;
  --danger:#b91c1c;
  --success:#047857;
  --warn:#b45309;
  --shadow: 0 10px 22px rgba(0,0,0,.08);
  --radius:18px;
  --sidebar-w: 260px;
  --font: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
}

*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  font-family:var(--font);
  color:var(--text);
  background:var(--bg);
}

a{color:inherit;text-decoration:none}
button, input, select, textarea{font:inherit}

.layout{
  display:flex;
  min-height:100vh;
}

.sidebar{
  width:var(--sidebar-w);
  background:var(--primary);
  color:#fff;
  padding:18px 14px;
  position:sticky;
  top:0;
  height:100vh;
}

.brand{
  font-weight:800;
  letter-spacing:.3px;
  font-size:16px;
  margin:6px 8px 18px;
  opacity:.95;
}

.user-badge{
  background:rgba(255,255,255,.12);
  border:1px solid rgba(255,255,255,.14);
  padding:10px 12px;
  border-radius:14px;
  margin:0 6px 14px;
  line-height:1.25;
}

.user-badge .name{font-weight:700}
.user-badge .role{font-size:12px; opacity:.9}

.nav{
  display:flex;
  flex-direction:column;
  gap:8px;
  margin-top:10px;
}

.nav a{
  padding:10px 12px;
  border-radius:12px;
  display:flex;
  align-items:center;
  gap:10px;
  background:transparent;
  border:1px solid transparent;
  opacity:.95;
}
.nav a:hover{
  background:rgba(255,255,255,.10);
  border-color:rgba(255,255,255,.14);
}
.nav a.active{
  background:rgba(255,255,255,.15);
  border-color:rgba(255,255,255,.18);
}

.main{
  flex:1;
  padding:22px 22px 40px;
}

.topbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:16px;
}

.page-title{
  font-size:20px;
  font-weight:800;
}

.card{
  background:var(--card);
  border:1px solid var(--border);
  border-radius:var(--radius);
  box-shadow: var(--shadow);
  padding:16px;
}

.grid{
  display:grid;
  grid-template-columns: repeat(12, 1fr);
  gap:14px;
}

.col-12{grid-column: span 12;}
.col-8{grid-column: span 8;}
.col-6{grid-column: span 6;}
.col-4{grid-column: span 4;}
.col-3{grid-column: span 3;}

@media (max-width: 980px){
  .layout{display:block;}
  .sidebar{width:auto; height:auto; position:relative;}
  .main{padding:14px;}
  .grid{grid-template-columns: 1fr;}
  .col-8,.col-6,.col-4,.col-3,.col-12{grid-column: span 1;}
}

.row{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
label{font-size:12px; color:var(--muted); font-weight:700}
.field{display:flex; flex-direction:column; gap:6px; min-width:180px}

input[type="text"], input[type="password"], input[type="email"], input[type="date"], select, textarea{
  padding:10px 12px;
  border:1px solid var(--border);
  border-radius:12px;
  background:#fff;
  outline:none;
}
textarea{min-height:120px; resize:vertical}

.btn{
  padding:10px 14px;
  border-radius:12px;
  border:1px solid var(--border);
  background:#fff;
  cursor:pointer;
  font-weight:700;
}
.btn.primary{
  background:var(--primary-2);
  color:#fff;
  border-color:rgba(0,0,0,.05);
}
.btn.danger{
  background:var(--danger);
  color:#fff;
  border-color:rgba(0,0,0,.05);
}
.btn.success{
  background:var(--success);
  color:#fff;
  border-color:rgba(0,0,0,.05);
}
.btn:disabled{opacity:.55; cursor:not-allowed}

.table{
  width:100%;
  border-collapse:collapse;
  overflow:hidden;
  border-radius:14px;
}
.table th, .table td{
  text-align:left;
  padding:10px 10px;
  border-bottom:1px solid var(--border);
  vertical-align:top;
}
.table th{
  font-size:12px;
  color:var(--muted);
  text-transform:uppercase;
  letter-spacing:.06em;
}
.pill{
  display:inline-block;
  padding:4px 10px;
  border-radius:999px;
  font-size:12px;
  font-weight:800;
  border:1px solid var(--border);
}
.pill.draft{background:#f3f4f6;}
.pill.submitted{background:#e0f2fe;}
.pill.returned{background:#fee2e2; border-color:#fecaca;}
.pill.approved_by_supervisor{background:#dcfce7; border-color:#bbf7d0;}
.pill.approved_by_chairman{background:#d1fae5; border-color:#a7f3d0;}

.muted{color:var(--muted)}
.small{font-size:12px}

.modal-backdrop{
  position:fixed; inset:0;
  background:rgba(0,0,0,.5);
  display:none;
  align-items:center;
  justify-content:center;
  padding:18px;
}
.modal{
  width:min(1000px, 100%);
  max-height:85vh;
  overflow:auto;
  background:#fff;
  border-radius:18px;
  border:1px solid var(--border);
  box-shadow: var(--shadow);
  padding:16px;
}
.modal h2{margin:0 0 10px}
.modal .close-row{display:flex; justify-content:flex-end; margin-bottom:10px}


/* Checkbox lists (Calendar required sections, PDF export selections) */
.checklist{
  border:1px solid var(--border);
  background:#fff;
  border-radius:14px;
  padding:8px;
}
.checkitem{
  display:flex;
  gap:10px;
  align-items:flex-start;
  padding:6px 8px;
  border-radius:12px;
}
.checkitem:hover{ background:#f8fafc; }
.checkitem input{ margin-top:2px; }


/* Admin assignments layout */
.grid2{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media(max-width:900px){ .grid2{ grid-template-columns:1fr; } }
.cardSub{ background:#fff; border:1px solid #e6e6e6; border-radius:14px; padding:12px; }
.checklist{ max-height:380px; overflow:auto; padding:4px; }
.checklist .group{ margin:10px 0; }
.checklist .group-title{ font-weight:800; margin:8px 0 6px; }
.checklist label{ display:flex; gap:8px; align-items:center; padding:2px 0; }
.btn.secondary{ background:#eef2f7; color:#233e57; border:1px solid #cdd7e2; }


/* Grouped countries in admin assignments */
.groupbox{
  border:1px solid var(--border);
  background:#fff;
  border-radius:14px;
  padding:10px;
  margin:10px 0;
}
.grouphead{
  font-weight:800;
  color:var(--ink);
  margin:0 0 8px;
}
