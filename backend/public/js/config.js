// GOV COLLAB PORTAL - config.js
// Default to same-origin API on Render/GitHub Pages deployments.
// You can override by setting window.GCP_API_ORIGIN before this script loads.
window.GCP_API_ORIGIN = window.GCP_API_ORIGIN || window.location.origin;

// API base is same-origin by default (recommended for Render single-service).
// You can override by setting window.GCP_API_BASE before this script loads.
window.GCP_API_BASE = window.GCP_API_BASE || "/api";
