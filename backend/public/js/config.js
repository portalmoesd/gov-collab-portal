// GOV COLLAB PORTAL - config.js
// Set this to your backend origin (no trailing slash).
// Example: https://your-backend.onrender.com
window.GCP_API_ORIGIN = window.GCP_API_ORIGIN || "http://localhost:3000";
window.GCP_API_BASE = window.GCP_API_ORIGIN.replace(/\/$/, "") + "/api";
