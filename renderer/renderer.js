(() => {
const api = window.api;

let processes = [];
let selectedId = null;

/* ----------------------------- elements -------------------------------- */
const els = {
  list: document.getElementById("list"),
  counts: document.getElementById("counts"),
  emptyState: document.getElementById("emptyState"),
  detailBody: document.getElementById("detailBody"),
  detailDot: document.getElementById("detailDot"),
  detailName: document.getElementById("detailName"),
  detailCommand: document.getElementById("detailCommand"),
  statusBadge: document.getElementById("statusBadge"),
  metaPid: document.getElementById("metaPid"),
  metaExit: document.getElementById("metaExit"),
  logs: document.getElementById("logs"),
  autoScroll: document.getElementById("autoScroll"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  restartBtn: document.getElementById("restartBtn"),
  editBtn: document.getElementById("editBtn"),
  deleteBtn: document.getElementById("deleteBtn"),
  clearBtn: document.getElementById("clearBtn"),
  addBtn: document.getElementById("addBtn"),
  emptyAddBtn: document.getElementById("emptyAddBtn"),
  // modal
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modalTitle"),
  fName: document.getElementById("fName"),
  fCommand: document.getElementById("fCommand"),
  saveBtn: document.getElementById("saveBtn"),
  cancelBtn: document.getElementById("cancelBtn"),
};

let modalMode = "add"; // "add" | "edit"

/* ------------------------------ helpers -------------------------------- */
function getProc(id) {
  return processes.find((p) => p.id === id);
}

function timeStr(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour12: false });
}

/* ----------------------------- rendering ------------------------------- */
function renderList() {
  els.list.innerHTML = "";
  for (const p of processes) {
    const item = document.createElement("div");
    item.className = "item" + (p.id === selectedId ? " active" : "");
    item.dataset.id = p.id;
    item.innerHTML = `
      <div class="item-top">
        <span class="dot ${p.status}"></span>
        <span class="item-name"></span>
      </div>
      <div class="item-cmd"></div>`;
    item.querySelector(".item-name").textContent = p.name;
    item.querySelector(".item-cmd").textContent = p.command;
    item.addEventListener("click", () => selectProcess(p.id));
    els.list.appendChild(item);
  }
  const running = processes.filter((p) => p.status === "running").length;
  els.counts.textContent = `${processes.length} process${
    processes.length === 1 ? "" : "es"
  } · ${running} running`;
}

function renderDetail() {
  const p = getProc(selectedId);
  if (!p) {
    els.emptyState.classList.remove("hidden");
    els.detailBody.classList.add("hidden");
    return;
  }
  els.emptyState.classList.add("hidden");
  els.detailBody.classList.remove("hidden");

  els.detailName.textContent = p.name;
  els.detailCommand.textContent = p.command;
  els.detailDot.className = "dot " + p.status;
  els.statusBadge.textContent = p.status;
  els.statusBadge.className = "badge " + p.status;
  els.metaPid.textContent = p.pid ?? "—";
  els.metaExit.textContent = p.exitCode == null ? "—" : p.exitCode;

  const running = p.status === "running";
  els.startBtn.disabled = running;
  els.stopBtn.disabled = !running;
  els.editBtn.disabled = running;
}

function renderLogs(logs) {
  els.logs.innerHTML = "";
  for (const entry of logs) appendLogEl(entry);
  scrollLogs();
}

function appendLogEl(entry) {
  const div = document.createElement("span");
  div.className = "log-line " + entry.stream;
  div.textContent = entry.text;
  els.logs.appendChild(div);
}

function scrollLogs() {
  if (els.autoScroll.checked) els.logs.scrollTop = els.logs.scrollHeight;
}

/* ----------------------------- actions --------------------------------- */
async function refresh() {
  processes = await api.list();
  if (!getProc(selectedId)) selectedId = null;
  renderList();
  renderDetail();
}

async function selectProcess(id) {
  selectedId = id;
  renderList();
  renderDetail();
  const res = await api.logs(id);
  if (res.ok) renderLogs(res.logs);
}

function openModal(mode) {
  modalMode = mode;
  if (mode === "edit") {
    const p = getProc(selectedId);
    if (!p) return;
    els.modalTitle.textContent = "Edit process";
    els.fName.value = p.name;
    els.fCommand.value = p.command;
  } else {
    els.modalTitle.textContent = "New process";
    els.fName.value = "";
    els.fCommand.value = "";
  }
  els.modal.classList.remove("hidden");
  els.fCommand.focus();
}

function closeModal() {
  els.modal.classList.add("hidden");
}

async function saveModal() {
  const name = els.fName.value.trim();
  const command = els.fCommand.value.trim();
  if (!command) {
    els.fCommand.focus();
    return;
  }
  if (modalMode === "edit") {
    await api.update(selectedId, name, command);
  } else {
    const res = await api.add(name, command);
    if (res.ok) selectedId = res.proc.id;
  }
  closeModal();
  await refresh();
  if (selectedId) selectProcess(selectedId);
}

/* ------------------------------ events --------------------------------- */
els.addBtn.addEventListener("click", () => openModal("add"));
els.emptyAddBtn.addEventListener("click", () => openModal("add"));
els.editBtn.addEventListener("click", () => openModal("edit"));
els.cancelBtn.addEventListener("click", closeModal);
els.saveBtn.addEventListener("click", saveModal);

els.modal.addEventListener("click", (e) => {
  if (e.target === els.modal) closeModal();
});
els.fCommand.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveModal();
});
els.fName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.fCommand.focus();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.modal.classList.contains("hidden"))
    closeModal();
});

els.startBtn.addEventListener("click", () => selectedId && api.start(selectedId));
els.stopBtn.addEventListener("click", () => selectedId && api.stop(selectedId));
els.restartBtn.addEventListener(
  "click",
  () => selectedId && api.restart(selectedId)
);

els.deleteBtn.addEventListener("click", async () => {
  if (!selectedId) return;
  const p = getProc(selectedId);
  if (!confirm(`Delete "${p?.name}"? This stops it if running.`)) return;
  await api.remove(selectedId);
  selectedId = null;
  await refresh();
});

els.clearBtn.addEventListener("click", async () => {
  if (!selectedId) return;
  await api.clearLogs(selectedId);
  els.logs.innerHTML = "";
});

/* --------------------------- live updates ------------------------------ */
api.onStatus((proc) => {
  const idx = processes.findIndex((p) => p.id === proc.id);
  if (idx >= 0) processes[idx] = proc;
  renderList();
  if (proc.id === selectedId) renderDetail();
});

api.onLog(({ id, entry }) => {
  if (id !== selectedId) return;
  appendLogEl(entry);
  scrollLogs();
});

/* ------------------------------- init ---------------------------------- */
refresh();
})();
