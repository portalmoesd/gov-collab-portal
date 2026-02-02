(function () {
  // Minimal API helper used across pages.
  // All calls are same-origin; we prefix "/api" automatically.
  const API_BASE = "";

  function getToken() {
    try { return localStorage.getItem("token"); } catch (_) { return null; }
  }

  async function apiFetch(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();

    // Ensure path starts with "/"
    const p = path.startsWith("/") ? path : ("/" + path);
    let url = API_BASE + "/api" + p;

    // Cache-bust GET requests (prevents 304s from proxies and broken UI states).
    if (method === "GET") {
      const sep = url.includes("?") ? "&" : "?";
      url = url + sep + "_ts=" + Date.now();
    }

    const token = getToken();
    const headers = Object.assign(
      {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
      options.headers || {}
    );

    if (token && !headers.Authorization) {
      headers.Authorization = "Bearer " + token;
    }

    const fetchOpts = Object.assign({}, options, {
      method,
      headers,
      cache: "no-store",
    });

    const res = await fetch(url, fetchOpts);

    let data = null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (res.status !== 204) {
      if (ct.includes("application/json")) data = await res.json().catch(() => null);
      else data = await res.text().catch(() => null);
    }

    if (!res.ok) {
      const msg = (data && data.error) ? data.error : ("HTTP " + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  window.GCP = window.GCP || {};
  window.GCP.apiFetch = apiFetch;
})();