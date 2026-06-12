const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  list: () => ipcRenderer.invoke("proc:list"),
  add: (name, command, autoStart) =>
    ipcRenderer.invoke("proc:add", { name, command, autoStart }),
  update: (id, name, command, autoStart) =>
    ipcRenderer.invoke("proc:update", { id, name, command, autoStart }),
  syncMongo: () => ipcRenderer.invoke("mongo:sync"),
  remove: (id) => ipcRenderer.invoke("proc:remove", { id }),
  start: (id) => ipcRenderer.invoke("proc:start", { id }),
  stop: (id) => ipcRenderer.invoke("proc:stop", { id }),
  restart: (id) => ipcRenderer.invoke("proc:restart", { id }),
  logs: (id) => ipcRenderer.invoke("proc:logs", { id }),
  clearLogs: (id) => ipcRenderer.invoke("proc:clearLogs", { id }),

  onLog: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("proc:log", handler);
    return () => ipcRenderer.removeListener("proc:log", handler);
  },
  onStatus: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("proc:status", handler);
    return () => ipcRenderer.removeListener("proc:status", handler);
  },
  onRefresh: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("proc:refresh", handler);
    return () => ipcRenderer.removeListener("proc:refresh", handler);
  },
});
