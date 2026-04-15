document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('extension-toggle');
    const statusText = document.getElementById('status-text');

    // Load current state
    chrome.storage.sync.get({ extensionEnabled: true }, (result) => {
        toggle.checked = result.extensionEnabled;
        updateStatusUI(result.extensionEnabled);
    });

    // Listen for changes
    toggle.addEventListener('change', () => {
        const isEnabled = toggle.checked;
        chrome.storage.sync.set({ extensionEnabled: isEnabled }, () => {
            updateStatusUI(isEnabled);
        });
    });

    function updateStatusUI(isEnabled) {
        if (isEnabled) {
            statusText.innerHTML = 'Status: <span class="status-badge enabled">Active</span>';
        } else {
            statusText.innerHTML = 'Status: <span class="status-badge disabled">Paused</span>';
        }
    }
});
