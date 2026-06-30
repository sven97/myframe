const $ = (id) => document.getElementById(id);

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

let settings = {};

async function loadFolders(selected) {
  const { folders } = await api("/api/folders");
  $("folders").innerHTML = "";
  for (const name of folders) {
    const li = document.createElement("li");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = name;
    cb.checked = selected.includes(name);
    li.append(cb, document.createTextNode(" " + name));
    $("folders").append(li);
  }
}

function selectedFolders() {
  return [...document.querySelectorAll("#folders input:checked")].map((c) => c.value);
}

function fillForm(s) {
  $("orientation").value = s.orientation;
  $("defaultWidth").value = s.defaultWidth;
  $("defaultHeight").value = s.defaultHeight;
  $("format").value = s.format;
  $("quality").value = s.quality;
}

function readForm() {
  return {
    folders: selectedFolders(),
    orientation: $("orientation").value,
    defaultWidth: Number($("defaultWidth").value),
    defaultHeight: Number($("defaultHeight").value),
    format: $("format").value,
    quality: Number($("quality").value),
  };
}

function setStatus(count) {
  $("status").textContent = `${count} photos indexed`;
  $("frameUrl").textContent = `${location.origin}/photo`;
}

function refreshPreview() {
  $("preview").src = `/photo?t=${Date.now()}`;
}

async function init() {
  const { settings: s } = await api("/api/settings");
  settings = s;
  fillForm(s);
  await loadFolders(s.folders);
  const status = await api("/api/status");
  setStatus(status.count);
  refreshPreview();
}

$("save").addEventListener("click", async () => {
  const body = readForm();
  const { count } = await api("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  setStatus(count);
  refreshPreview();
});

$("rescan").addEventListener("click", async () => {
  const { count } = await api("/api/rescan", { method: "POST" });
  setStatus(count);
});

$("refresh").addEventListener("click", refreshPreview);

init().catch((err) => ($("status").textContent = "Error: " + err.message));
