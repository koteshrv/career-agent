chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'save_job') {
    saveJobToBackend(request.jobData, sendResponse);
    return true; // Keeps the message channel open for async sendResponse
  }
});

async function saveJobToBackend(jobData, sendResponse) {
  try {
    // Get URL and Token from storage where popup.js saves them
    chrome.storage.local.get(['apiUrl', 'token'], async (stored) => {
      const apiUrl = stored.apiUrl || 'http://localhost:8000';
      const token = stored.token;
      
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const response = await fetch(`${apiUrl}/api/jobs/extension`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(jobData)
        });

        if (response.ok) {
          const data = await response.json();
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon48.png',
            title: 'Job Saved to CareerAgent!',
            message: 'The AI is evaluating the job now.'
          });
          sendResponse({ success: true, data });
        } else {
          const errText = await response.text();
          console.error("Failed to save job:", response.status, errText);
          sendResponse({ success: false, error: errText });
        }
      } catch (err) {
        console.error("Network error saving job:", err);
        sendResponse({ success: false, error: err.message });
      }
    });
  } catch (err) {
    console.error("Storage error:", err);
    sendResponse({ success: false, error: err.message });
  }
}
