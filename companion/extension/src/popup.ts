import type {
  VimCompanionBridgeRequest,
  VimCompanionBridgeResponse,
} from "./protocol";

document.addEventListener("DOMContentLoaded", () => {
  const hostStatus = document.getElementById("host-status");
  const strategyStatus = document.getElementById("strategy-status");
  const targetStatus = document.getElementById("target-status");
  const modeStatus = document.getElementById("mode-status");
  const testBtn = document.getElementById("test-btn");

  function queryStatus() {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      if (hostStatus) {
        hostStatus.textContent = "No Runtime";
        hostStatus.className = "value status-badge status-err";
      }
      return;
    }

    const req: VimCompanionBridgeRequest = {
      source: "note-web",
      channel: "vim-ime",
      id: `popup-${Date.now()}`,
      action: "get_state",
    };

    chrome.runtime.sendMessage(req, (resp: VimCompanionBridgeResponse) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        if (hostStatus) {
          hostStatus.textContent = "Disconnected";
          hostStatus.className = "value status-badge status-err";
        }
        if (modeStatus) modeStatus.textContent = "Unavailable";
        if (strategyStatus) strategyStatus.textContent = "None";
        if (targetStatus) targetStatus.textContent = "None";
        return;
      }

      if (hostStatus) {
        hostStatus.textContent = "Connected";
        hostStatus.className = "value status-badge status-ok";
      }
      if (strategyStatus) {
        strategyStatus.textContent = resp.strategy || "Auto (Strategy B)";
      }
      if (targetStatus) {
        targetStatus.textContent = resp.targetPid
          ? `PID: ${resp.targetPid}`
          : "Ready";
      }
      if (modeStatus) {
        modeStatus.textContent = resp.verified ? "ASCII" : "Normal";
      }
    });
  }

  testBtn?.addEventListener("click", () => {
    if (hostStatus) hostStatus.textContent = "Testing...";
    queryStatus();
  });

  queryStatus();
});
