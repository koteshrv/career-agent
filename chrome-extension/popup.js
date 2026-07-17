document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const backBtn = document.getElementById('backBtn');
  const profileBtn = document.getElementById('profileBtn');
  
  const loginView = document.getElementById('loginView');
  const actionView = document.getElementById('actionView');
  const settingsView = document.getElementById('settingsView');
  const whitelistInput = document.getElementById('whitelistInput');
  
  const activeUserSpan = document.getElementById('activeUser');
  const statusDiv = document.getElementById('status');

  const queueList = document.getElementById('queueList');
  const queueCount = document.getElementById('queueCount');
  const processBtn = document.getElementById('processBtn');

  let jobQueue = [];
  let allowedSites = ['linkedin.com', 'naukri.com', 'indeed.com'];

  // Check auth status on load
  chrome.storage.local.get(['token', 'apiUrl', 'username', 'jobQueue', 'allowedSites'], (result) => {
    if (result.apiUrl) apiUrlInput.value = result.apiUrl;
    jobQueue = result.jobQueue || [];
    if (result.allowedSites) allowedSites = result.allowedSites;
    whitelistInput.value = allowedSites.join(', ');
    
    if (result.token) {
      showActionView(result.username || 'admin');
    } else {
      showLoginView();
    }
  });

  function showLoginView() {
    loginView.classList.remove('hidden');
    actionView.classList.add('hidden');
    settingsView.classList.add('hidden');
    profileBtn.classList.add('hidden');
    statusDiv.className = "";
    statusDiv.innerText = "";
  }

  function showActionView(username) {
    loginView.classList.add('hidden');
    settingsView.classList.add('hidden');
    actionView.classList.remove('hidden');
    profileBtn.classList.remove('hidden');
    
    activeUserSpan.innerText = `Connected as ${username}`;
    statusDiv.className = "";
    statusDiv.innerText = "";
    
    renderQueue();
  }
  
  function showSettingsView() {
    actionView.classList.add('hidden');
    settingsView.classList.remove('hidden');
    statusDiv.className = "";
    statusDiv.innerText = "";
  }

  profileBtn.addEventListener('click', showSettingsView);
  backBtn.addEventListener('click', () => {
    chrome.storage.local.get(['username'], (result) => {
      showActionView(result.username || 'admin');
    });
  });

  whitelistInput.addEventListener('change', (e) => {
    const raw = e.target.value;
    allowedSites = raw.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
    chrome.storage.local.set({ allowedSites });
  });

  function renderQueue() {
    queueList.innerHTML = '';
    queueCount.innerText = jobQueue.length;
    
    if (jobQueue.length > 0) {
      processBtn.disabled = false;
    } else {
      processBtn.disabled = true;
    }

    jobQueue.forEach((job, index) => {
      const li = document.createElement('li');
      li.className = 'queue-item';
      
      const span = document.createElement('span');
      span.innerText = job.page_title;
      span.title = job.page_title;
      
      const rmBtn = document.createElement('button');
      rmBtn.className = 'remove-btn';
      rmBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
      rmBtn.onclick = () => {
        jobQueue.splice(index, 1);
        chrome.storage.local.set({ jobQueue }, renderQueue);
      };

      li.appendChild(span);
      li.appendChild(rmBtn);
      queueList.appendChild(li);
    });
  }

  // Handle Login
  loginBtn.addEventListener('click', async () => {
    const apiUrl = apiUrlInput.value.replace(/\/$/, "");
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showStatus("Please enter credentials", "error");
      return;
    }

    loginBtn.disabled = true;
    loginBtn.innerText = "Authenticating...";
    statusDiv.className = "";
    statusDiv.innerText = "";

    try {
      const response = await fetch(`${apiUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        throw new Error("Invalid username or password");
      }

      const data = await response.json();
      
      chrome.storage.local.set({ 
        token: data.token, 
        apiUrl: apiUrl,
        username: username
      }, () => {
        showActionView(username);
      });
    } catch (err) {
      showStatus(err.message || "Failed to log in", "error");
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerText = "Log In & Sync";
    }
  });



  // Handle Process Queue
  processBtn.addEventListener('click', async () => {
    chrome.storage.local.get(['token', 'apiUrl'], async (stored) => {
      const { token, apiUrl } = stored;
      
      if (!token) {
        showStatus("Session expired. Please log in again.", "error");
        showLoginView();
        return;
      }

      if (jobQueue.length === 0) return;

      processBtn.disabled = true;
      
      let successCount = 0;
      let failCount = 0;

      // Copy queue to iterate, we will modify the real queue as we go
      const queueCopy = [...jobQueue];

      processBtn.innerHTML = `
        <svg class="pulse" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
          <polyline points="17 6 23 6 23 12"></polyline>
        </svg>
        Processing Batch...
      `;
      
      try {
        const payload = {
          jobs: queueCopy.map(job => ({
            url: job.url,
            page_title: job.page_title,
            description: job.description
          }))
        };

        const response = await fetch(`${apiUrl}/api/jobs/extension/batch`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          if (response.status === 401) {
            chrome.storage.local.remove(['token']);
            showLoginView();
            throw new Error("Session expired.");
          }
          throw new Error("Server error");
        }

        successCount = queueCopy.length;
        // Save processed URLs so the content script knows they are evaluated
        const processedUrls = queueCopy.map(j => j.url);
        chrome.storage.local.get(['processedJobs'], (res) => {
          const oldProcessed = res.processedJobs || [];
          const newProcessed = [...new Set([...oldProcessed, ...processedUrls])];
          // Clear queue and save processed list
          jobQueue = [];
          chrome.storage.local.set({ jobQueue, processedJobs: newProcessed }, () => {
            renderQueue();
          });
        });
        
      } catch (err) {
        failCount = queueCopy.length;
        console.error("Failed to process batch:", err);
      }

      processBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Process Queue
      `;
      processBtn.disabled = jobQueue.length === 0;
      
      if (failCount === 0) {
        showStatus(`Successfully processed ${successCount} job(s)`, "success");
      } else {
        showStatus(`Processed ${successCount}, Failed ${failCount}`, "error");
      }
    });
  });

  // Handle Logout
  logoutBtn.addEventListener('click', () => {
    chrome.storage.local.remove(['token', 'username', 'jobQueue'], () => {
      jobQueue = [];
      showLoginView();
    });
  });

  function showStatus(message, className) {
    statusDiv.className = className;
    statusDiv.innerText = message;
  }

  // Handle Auto-Scrape
  const autoScrapeBtn = document.getElementById('autoScrapeBtn');
  const stopScrapeBtn = document.getElementById('stopScrapeBtn');
  
  if (autoScrapeBtn && stopScrapeBtn) {
    // Check initial state when popup opens
    chrome.storage.local.get(['isScraping'], (res) => {
      if (res.isScraping) {
        autoScrapeBtn.style.display = 'none';
        stopScrapeBtn.style.display = 'flex';
      }
    });

    autoScrapeBtn.addEventListener('click', () => {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs.length === 0) return;
        const tab = tabs[0];
        
        if (!tab.url.includes('linkedin.com') && !tab.url.includes('naukri.com')) {
          showStatus("Auto-scrape only works on LinkedIn or Naukri.", "error");
          return;
        }
        
        const pagesToScrape = parseInt(document.getElementById('scrapePages').value) || 5;
        
        autoScrapeBtn.style.display = 'none';
        stopScrapeBtn.style.display = 'flex';
        chrome.storage.local.set({ 
          isScraping: true,
          targetPages: pagesToScrape,
          pagesScraped: 0
        });
        
        chrome.tabs.sendMessage(tab.id, { action: 'START_AUTO_SCRAPE' }, (response) => {
          if (chrome.runtime.lastError) {
            showStatus("Please refresh the page before scraping.", "error");
            autoScrapeBtn.style.display = 'flex';
            stopScrapeBtn.style.display = 'none';
            chrome.storage.local.set({ isScraping: false });
            return;
          }
        });
      });
    });

    stopScrapeBtn.addEventListener('click', () => {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs.length === 0) return;
        
        chrome.tabs.sendMessage(tabs[0].id, { action: 'STOP_AUTO_SCRAPE' });
        
        autoScrapeBtn.style.display = 'flex';
        stopScrapeBtn.style.display = 'none';
        chrome.storage.local.set({ isScraping: false });
        showStatus("Auto-scrape stopped.", "success");
      });
    });
  }
});
