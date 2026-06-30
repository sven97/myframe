const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString();

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error ?? msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

let orientation = "all";

/* ---------- folders ---------- */
async function loadFolders(selected) {
  const { folders } = await api("/api/folders");
  const wrap = $("folders");
  wrap.innerHTML = "";
  if (!folders.length) {
    $("folderHint").textContent = "no folders found — check the mount";
    return;
  }
  $("folderHint").textContent = `${folders.length} albums`;
  for (const { name, count } of folders) {
    const el = document.createElement("div");
    el.className = "folder" + (selected.includes(name) ? " on" : "");
    el.dataset.name = name;
    el.innerHTML =
      `<span class="check"></span>` +
      `<span class="fname" title="${name}">${name}</span>` +
      `<span class="fcount">${fmt(count)}</span>`;
    el.addEventListener("click", () => el.classList.toggle("on"));
    wrap.append(el);
  }
}

function selectedFolders() {
  return [...document.querySelectorAll(".folder.on")].map((c) => c.dataset.name);
}

/* ---------- orientation segmented control ---------- */
function setOrientation(value) {
  orientation = value;
  const segs = [...document.querySelectorAll(".seg")];
  const idx = Math.max(0, segs.findIndex((s) => s.dataset.value === value));
  segs.forEach((s, i) => s.classList.toggle("on", i === idx));
  $("orientation").querySelector(".seg-slider").style.transform =
    `translateX(${idx * 100}%)`;
}
document.querySelectorAll(".seg").forEach((s) =>
  s.addEventListener("click", () => setOrientation(s.dataset.value))
);

/* ---------- form ---------- */
function fillForm(s) {
  setOrientation(s.orientation);
  $("defaultWidth").value = s.defaultWidth;
  $("defaultHeight").value = s.defaultHeight;
  $("format").value = s.format;
  $("quality").value = s.quality;
  $("qualityVal").textContent = s.quality;
}
$("quality").addEventListener("input", (e) => ($("qualityVal").textContent = e.target.value));

function readForm() {
  return {
    folders: selectedFolders(),
    orientation,
    defaultWidth: Number($("defaultWidth").value),
    defaultHeight: Number($("defaultHeight").value),
    format: $("format").value,
    quality: Number($("quality").value),
  };
}

/* ---------- status / preview ---------- */
function setCount(n) {
  $("statusCount").textContent = fmt(n);
  $("frameEmpty").style.display = n > 0 ? "none" : "block";
}

function refreshPreview() {
  const img = $("preview");
  img.classList.remove("loaded");
  img.onload = () => img.classList.add("loaded");
  img.onerror = () => img.classList.remove("loaded");
  img.src = `/photo?t=${Date.now()}`;
}

/* ---------- scan progress ---------- */
function setScan(state, label, processed, total) {
  $("scanbar").dataset.state = state;
  $("statusPill").dataset.state = state === "scanning" ? "scanning" : "idle";
  $("scanLabel").textContent = label;
  if (state === "scanning") {
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
    $("scanFill").style.width = pct + "%";
    $("scanCount").textContent = total > 0 ? `${fmt(processed)} / ${fmt(total)}` : "";
  } else {
    $("scanFill").style.width = "100%";
    $("scanCount").textContent = "";
  }
}

async function pollScan() {
  for (let i = 0; i < 100000; i++) {
    const s = await api("/api/rescan/status");
    if (!s.running) break;
    setScan("scanning", "Scanning", s.processed, s.total);
    await new Promise((r) => setTimeout(r, 250));
  }
  const status = await api("/api/status");
  setCount(status.count);
  setScan("idle", `Indexed ${fmt(status.count)} frames`, 0, 0);
  refreshPreview();
}

let busy = false;
async function withScan(trigger, label) {
  if (busy) return;
  busy = true;
  $("save").disabled = $("rescan").disabled = true;
  try {
    setScan("scanning", label, 0, 0);
    await trigger();
    await pollScan();
  } catch (err) {
    setScan("idle", "Error", 0, 0);
    toast("✕ " + err.message, false);
  } finally {
    busy = false;
    $("save").disabled = $("rescan").disabled = false;
  }
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, ok = true) {
  const t = $("toast");
  t.innerHTML = ok ? `<span class="tick">✓</span>${msg}` : msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- actions ---------- */
$("save").addEventListener("click", () =>
  withScan(async () => {
    await api("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(readForm()),
    });
    toast("Settings saved");
  }, "Saving")
);

$("rescan").addEventListener("click", () =>
  withScan(() => api("/api/rescan", { method: "POST" }), "Rescanning")
);

$("refresh").addEventListener("click", refreshPreview);

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("frameUrl").textContent);
    toast("URL copied");
  } catch {
    toast("✕ copy failed", false);
  }
});

/* ---------- init ---------- */
async function init() {
  $("frameUrl").textContent = `${location.origin}/photo`;
  const { settings } = await api("/api/settings");
  fillForm(settings);
  await loadFolders(settings.folders);
  const status = await api("/api/status");
  setCount(status.count);
  if (status.scan?.running) {
    pollScan();
  } else {
    setScan("idle", status.count ? `Indexed ${fmt(status.count)} frames` : "Ready", 0, 0);
    refreshPreview();
  }
}

init().catch((err) => setScan("idle", "Error: " + err.message, 0, 0));
