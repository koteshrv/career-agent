document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  // Load saved API URL
  chrome.storage.local.get(['apiUrl'], (result) => {
    if (result.apiUrl) apiUrlInput.value = result.apiUrl;
  });

  saveBtn.addEventListener('click', async () => {
    const apiUrl = apiUrlInput.value.replace(/\/$/, "");
    chrome.storage.local.set({ apiUrl });
    
    saveBtn.disabled = true;
    saveBtn.innerText = "Extracting...";
    statusDiv.innerText = "";

    try {
      // 1. Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("No active tab found");

      // 2. Inject and execute content script
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // This runs inside the webpage
          // Basic cleanup to remove scripts/styles before taking innerText
          const clone = document.body.cloneNode(true);
          const elementsToRemove = clone.querySelectorAll('script, style, noscript, nav, footer, header');
          elementsToRemove.forEach(el => el.remove());
          
          return {
            url: window.location.href,
            page_title: document.title,
            description: clone.innerText.substring(0, 15000) // limit size
          };
        }
      });

      saveBtn.innerText = "Saving to Server...";

      // 3. Send payload to FastAPI backend
      const response = await fetch(`${apiUrl}/api/jobs/extension`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Server returned " + response.status);
      }

      const data = await response.json();
      statusDiv.className = "success";
      statusDiv.innerText = `Saved: ${data.company} - ${data.title}`;
    } catch (err) {
      statusDiv.className = "error";
      statusDiv.innerText = err.message || "Failed to save job";
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerText = "Save Active Job";
    }
  });
});
