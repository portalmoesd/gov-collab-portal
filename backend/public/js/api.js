// GOV COLLAB PORTAL - api.js
(function(){
  async function apiFetch(path, options){
    const token = localStorage.getItem("gcp_token");
    const headers = Object.assign(
      {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache"
      },
      options && options.headers ? options.headers : {}
    );
    if (token) headers["Authorization"] = "Bearer " + token;

    // Avoid 304/ETag issues on Render by busting cache for GET requests
    const method = (options && options.method ? options.method : "GET").toUpperCase();
    let finalPath = path;
    if (method === "GET" && finalPath.indexOf("_ts=") === -1) {
      finalPath += (finalPath.indexOf("?") === -1 ? "?" : "&") + "_ts=" + Date.now();
    }

    const res = await fetch(API_BASE + finalPath, {window.GCP_API_BASE + path, Object.assign({}, options, { headers }));
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e){ data = { raw: text }; }

    if (!res.ok){
      const msg = (data && data.error) ? data.error : ("HTTP " + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function qs(){
    const params = new URLSearchParams(location.search);
    const obj = {};
    for (const [k,v] of params.entries()) obj[k]=v;
    return obj;
  }

  window.GCP = window.GCP || {};
  window.GCP.apiFetch = apiFetch;
  window.GCP.qs = qs;
})();
