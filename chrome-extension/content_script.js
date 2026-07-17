console.log("CareerAgent: Content script initialized on", window.location.href);

function injectCareerAgentButton() {
  // Only run on LinkedIn or Naukri
  if (window.location.hostname.includes('linkedin.com')) {
    injectLinkedInJobPage();
    injectLinkedInFeed();
  } else if (window.location.hostname.includes('naukri.com')) {
    injectNaukriJobPage();
    injectNaukriListCards();
  }
}

function injectLinkedInJobPage() {
  // Look for any button or link that acts as Apply, Easy Apply, Save, or Saved
  // This bypasses LinkedIn's strict class/aria-label obfuscation which changes based on native state
  const allButtons = document.querySelectorAll('button, a');
  
  allButtons.forEach(nativeBtn => {
    const text = nativeBtn.innerText ? nativeBtn.innerText.trim().toLowerCase() : '';
    
    // Target the primary action buttons
    if (text === 'apply' || text.includes('easy apply') || text === 'save' || text === 'saved') {
      
      const nativeWrapper = nativeBtn.parentElement;
      const outerContainer = nativeWrapper?.parentElement;
      
      // Ensure we haven't already injected into this specific action row
      if (outerContainer && !outerContainer.querySelector('.ca-save-btn')) {
        
        // We only want to inject in actual action bars, which typically have multiple children or flex layout
        if (outerContainer.children.length > 0) {
          const caWrapper = document.createElement('div');
          // Inherit LinkedIn's exact wrapper classes for perfect margin/padding
          caWrapper.className = nativeWrapper.className;
          caWrapper.style.display = 'inline-flex';
          
          const btn = createSaveButton('Save to CareerAgent', getLinkedInJobData);
          caWrapper.appendChild(btn);
          
          checkQueueState(cleanUrl(window.location.href), btn);
          
          // Append to the end of the action bar row
          outerContainer.appendChild(caWrapper);
          
          console.log("CareerAgent: Button injected on Job Page!");
        }
      }
    }
  });
}

function checkQueueState(url, btn) {
  chrome.storage.local.get(['jobQueue', 'processedJobs'], (result) => {
    const queue = result.jobQueue || [];
    const processed = result.processedJobs || [];
    const isNative = btn.classList.contains('ca-feed-native-btn');
    
    if (processed.includes(url)) {
      if (isNative) {
        btn.style.color = '#22c55e'; // Vibrant Green
        const textSpan = btn.querySelector('span > span');
        if (textSpan) textSpan.innerText = 'Evaluated';
      } else {
        btn.innerText = 'Evaluated';
        btn.style.backgroundColor = '#22c55e'; // Vibrant Green
      }
      btn.style.pointerEvents = 'none';
      // Removed opacity: 0.8 so it stays vibrantly green
    } else if (queue.find(j => j.url === url)) {
      if (isNative) {
        btn.style.color = '#ea580c'; // Orange
        const textSpan = btn.querySelector('.ca-dynamic-text, .saveSpn, span > span');
        if (textSpan) textSpan.innerText = 'Queued';
      } else {
        btn.innerText = 'Saved to Queue';
        btn.style.backgroundColor = '#ea580c'; // Vibrant Orange indicating queued/pending
      }
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.8';
    }
  });
}

function injectLinkedInFeed() {
  // Like the Job page, bypass brittle CSS classes/aria-labels and look for the visible "Comment" or "Send" buttons
  const allButtons = document.querySelectorAll('button, a');
  
  allButtons.forEach(nativeBtn => {
    const text = nativeBtn.innerText ? nativeBtn.innerText.trim().toLowerCase() : '';
    const aria = nativeBtn.getAttribute('aria-label') ? nativeBtn.getAttribute('aria-label').toLowerCase() : '';
    
    if (text === 'comment' || text === 'send' || aria === 'comment' || aria === 'send' || aria.includes('comment on this post')) {
      // Find the flex container holding the action buttons
      let actionBar = nativeBtn.parentElement;
      
      // If the immediate parent is just a single-item wrapper, go up one more level
      if (actionBar && actionBar.children.length < 3 && actionBar.parentElement) {
        actionBar = actionBar.parentElement;
      }
      
      // If it looks like an action bar and we haven't injected yet
      if (actionBar && actionBar.children.length >= 3 && !actionBar.querySelector('.ca-save-btn')) {
        const postUrl = getPostUrl(actionBar);
        
        const btn = createFeedNativeButton(() => {
          const post = actionBar.closest('.feed-shared-update-v2, [data-urn^="urn:li:activity"]') || actionBar.parentElement?.parentElement;
          return { 
            url: postUrl, 
            description: post ? post.innerText : '', 
            page_title: document.title 
          };
        });
        
        checkQueueState(postUrl, btn);
        
        // Append our button to the end of the action bar row
        actionBar.appendChild(btn);
        
        console.log("CareerAgent: Button injected on Feed Post");
      }
    }
  });
}

function createFeedNativeButton(dataGetter) {
  const btn = document.createElement('button');
  // Use exact LinkedIn classes so it perfectly inherits padding, fonts, sizes, and hover states
  btn.className = 'artdeco-button artdeco-button--muted artdeco-button--4 artdeco-button--tertiary ember-view ca-save-btn ca-feed-native-btn';
  
  // Custom margin to separate slightly from 'Send'
  btn.style.marginLeft = '4px';
  btn.style.transition = 'color 0.2s';
  btn.style.border = 'none';
  btn.style.background = 'transparent';
  btn.style.fontFamily = '"Outfit", "Google Sans", sans-serif';
  
  // Unsaved: Blue
  btn.style.color = '#0a66c2';
  
  // Standard Bookmark / Save SVG
  const bookmarkSvg = `<svg role="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" data-supported-dps="24x24" fill="currentColor">
    <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
  </svg>`;

  btn.innerHTML = `
    <span class="artdeco-button__text" style="display: flex; align-items: center; color: inherit;">
      ${bookmarkSvg}
      <span aria-hidden="true" class="artdeco-button__text" style="margin-left: 4px; font-weight: 600;">
          Save
      </span>
    </span>
  `;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Queuing state (Orange)
    btn.style.color = '#ea580c';
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.8';
    
    const textSpan = btn.querySelector('span > span');
    if (textSpan) textSpan.innerText = 'Queued';
    
    showToast('✅ Saved to CareerAgent Queue!');
    
    const jobData = typeof dataGetter === 'function' ? dataGetter() : dataGetter;
    
    chrome.storage.local.get(['jobQueue'], (result) => {
      const queue = result.jobQueue || [];
      if (!queue.find(j => j.url === jobData.url)) {
        queue.push({
          url: jobData.url,
          page_title: jobData.page_title,
          description: jobData.description,
          id: Date.now().toString()
        });
        chrome.storage.local.set({ jobQueue: queue });
      }
    });
  });
  
  return btn;
}

function injectNaukriJobPage() {
  // Look for any button or link that acts as Apply or Save to bypass CSS module hashes
  const allButtons = document.querySelectorAll('button, a');
  
  allButtons.forEach(nativeBtn => {
    const text = nativeBtn.innerText ? nativeBtn.innerText.trim().toLowerCase() : '';
    
    // Target the primary action buttons
    if (text === 'apply' || text === 'save' || text.includes('apply on company site') || text.includes('apply on recruiter site')) {
      
      // Prevent injecting into list view cards since injectNaukriListCards handles them
      if (nativeBtn.closest('.jobTuple, .srp-jobtuple-wrapper, .cust-job-tuple')) return;
      
      const nativeWrapper = nativeBtn.parentElement;
      
      // Ensure we haven't already injected into this specific action row
      if (nativeWrapper && !nativeWrapper.querySelector('.ca-save-btn')) {
        
        // We only want to inject in actual action bars (flex containers holding multiple buttons)
        if (nativeWrapper.children.length > 0) {
          
          // Find the Apply button to steal its native classes for perfect styling
          const applyBtn = Array.from(nativeWrapper.querySelectorAll('button, a')).find(b => b.innerText && b.innerText.toLowerCase().includes('apply')) || nativeBtn;
          
          const btn = createSaveButton('Save to CareerAgent', () => {
            return { 
              url: cleanUrl(window.location.href), 
              description: document.body.innerText, 
              page_title: document.title 
            };
          }, true); // pass unstyled=true
          
          // Inherit all native classes for perfect size, shape, and height
          btn.className = `${applyBtn.className} ca-save-btn`;
          
          // CRITICAL FIX: Naukri's native class applies a fixed width to the "Apply" button.
          // Because our text ("Save to CareerAgent" or "Evaluated") is longer, it wraps 
          // and turns the button into a giant blob. We must override the width to stretch!
          btn.style.width = 'auto';
          btn.style.minWidth = 'max-content';
          btn.style.whiteSpace = 'nowrap';
          btn.style.marginLeft = '12px';
          
          checkQueueState(cleanUrl(window.location.href), btn);
          
          nativeWrapper.appendChild(btn);
        }
      }
    }
  });
}

function injectNaukriListCards() {
  // Search for Naukri job cards in list views
  const jobCards = document.querySelectorAll('.jobTuple, .srp-jobtuple-wrapper, .cust-job-tuple');
  
  jobCards.forEach(card => {
    if (!card.querySelector('.ca-save-btn')) {
      // Find the title element, which might be an <a> or a <p>
      const titleEl = card.querySelector('a.title, p.title, .title');
      if (titleEl) {
        
        let url = '';
        if (titleEl.tagName === 'A' && titleEl.href) {
          url = cleanUrl(titleEl.href);
        } else {
          // If no anchor, try to find any link in the card
          const anyLink = card.querySelector('a');
          if (anyLink && anyLink.href) {
            url = cleanUrl(anyLink.href);
          } else {
            // Fallback: Construct a dummy URL using the job ID so we can uniquely identify it
            const jobId = card.getAttribute('data-job-id') || card.id || Date.now().toString();
            url = `https://www.naukri.com/job-listings-${jobId}`;
          }
        }
        
        // Find the native save tag to inject next to it
        let saveTag = card.querySelector('.save-job-tag, .un-saved');
        if (!saveTag) {
          // Try alternative layout (.saveJobContainer containing 'save')
          const containers = card.querySelectorAll('.saveJobContainer');
          saveTag = Array.from(containers).find(el => el.innerText.toLowerCase().includes('save'));
        }
        
        if (saveTag && !saveTag.parentElement.classList.contains('ca-injected')) {
          saveTag.parentElement.classList.add('ca-injected'); // Mark container so we don't double inject
          const btn = cloneNaukriNativeButton(saveTag, async () => {
            const hideToast = showToast('Fetching full JD in background...', 0); // 0 means stay indefinitely until hideToast is called
            try {
              // Silently fetch the full job posting HTML to get the full context
              // Enforce a minimum 800ms wait so the toast doesn't flicker instantly if cached
              const minWait = new Promise(resolve => setTimeout(resolve, 800));
              const [res] = await Promise.all([fetch(url).catch(() => null), minWait]);
              
              if (res && res.ok) {
                const html = await res.text();
                
                // Parse HTML to extract just the body text or specific JD container
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const jdContainer = doc.querySelector('.job-desc, .dang-inner-html, section.job-desc, .styles_Jym__MvstK');
                const description = jdContainer ? jdContainer.innerText : doc.body.innerText;
                
                hideToast();
                return {
                  url: url,
                  description: description,
                  page_title: titleEl.innerText
                };
              } else {
                throw new Error('Could not fetch valid JD page');
              }
            } catch (e) {
              console.error('CareerAgent: Failed to fetch full JD in background, falling back to card text:', e);
              hideToast();
              return {
                url: url,
                description: card.innerText,
                page_title: titleEl.innerText
              };
            }
          });
          
          checkQueueState(url, btn);
          
          // The user wants to group the buttons on the right side next to the native save button
          // This provides a much better UX as all "save" actions are in the same logical area.
          const group = document.createElement('div');
          group.className = 'ca-action-group';
          group.style.display = 'inline-flex';
          group.style.alignItems = 'center';
          group.style.gap = '16px';
          
          const compStyle = window.getComputedStyle(saveTag);
          
          // Inherit layout mechanics from the native button onto our group wrapper
          if (compStyle.position === 'absolute') {
            group.style.position = 'absolute';
            group.style.right = compStyle.right;
            group.style.top = compStyle.top;
            group.style.bottom = compStyle.bottom;
            saveTag.style.setProperty('position', 'static', 'important');
          } else if (compStyle.float === 'right' || saveTag.classList.contains('fright')) {
            group.style.float = 'right';
            saveTag.style.setProperty('float', 'none', 'important');
          }
          
          saveTag.after(group);
          group.appendChild(btn); // Put our button first
          group.appendChild(saveTag); // Then the native save button
        }
      }
    }
  });
}

function cloneNaukriNativeButton(nativeSaveNode, dataGetter) {
  // Clone the exact DOM structure of Naukri's native button so we get identical styling/alignment
  const btn = nativeSaveNode.cloneNode(true);
  btn.classList.add('ca-save-btn', 'ca-feed-native-btn');
  btn.style.cursor = 'pointer';
  
  // Strip any IDs that Naukri's framework might use to attach native event listeners
  btn.removeAttribute('id');
  
  // Force the cloned button to flow statically in our flex group
  btn.style.setProperty('position', 'static', 'important');
  btn.style.setProperty('float', 'none', 'important');
  btn.style.setProperty('margin', '0', 'important');
  
  // Find the text node containing 'save' and replace it with our own span
  const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT, null, false);
  let textNodeToReplace = null;
  let node;
  while ((node = walker.nextNode())) {
     if (node.nodeValue.toLowerCase().includes('save')) {
         textNodeToReplace = node;
         break;
     }
  }
  
  if (textNodeToReplace) {
     const span = document.createElement('span');
     span.className = 'ca-dynamic-text';
     span.innerText = 'Agent Save';
     textNodeToReplace.parentNode.replaceChild(span, textNodeToReplace);
  } else {
     // Fallback if no text node was found
     const span = document.createElement('span');
     span.className = 'ca-dynamic-text';
     span.innerText = 'Agent Save';
     btn.appendChild(span);
  }
  
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    btn.style.pointerEvents = 'none';
    const textSpan = btn.querySelector('.ca-dynamic-text, .saveSpn, span > span');
    if (textSpan) textSpan.innerText = 'Queuing...';
    
    let jobData = typeof dataGetter === 'function' ? dataGetter() : dataGetter;
    if (jobData && typeof jobData.then === 'function') {
      jobData = await jobData;
    }
    
    showToast('✅ Saved to CareerAgent Queue!');
    
    chrome.storage.local.get(['jobQueue'], (result) => {
      const queue = result.jobQueue || [];
      if (!queue.find(j => j.url === jobData.url)) {
        queue.push({
          url: jobData.url,
          page_title: jobData.page_title,
          description: jobData.description,
          id: Date.now().toString()
        });
        chrome.storage.local.set({ jobQueue: queue }, () => {
          btn.style.color = '#ea580c';
          if (textSpan) textSpan.innerText = 'Queued';
        });
      } else {
        btn.style.color = '#ea580c';
        if (textSpan) textSpan.innerText = 'Queued';
      }
    });
  });
  
  return btn;
}

function createSaveButton(text, dataGetter, unstyled = false) {
  const btn = document.createElement('button');
  btn.className = 'ca-save-btn';
  btn.innerText = text;
  
  if (!unstyled) {
    // Base styling - mimics LinkedIn's primary button
    btn.style.backgroundColor = '#0a66c2';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '16px';
    btn.style.height = '32px';
    btn.style.padding = '0 16px';
    btn.style.fontWeight = '600';
    btn.style.fontSize = '14px';
    btn.style.fontFamily = '"Outfit", "Google Sans", sans-serif';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.boxSizing = 'border-box';
  }
  
  btn.style.cursor = 'pointer';
  
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    btn.innerText = 'Queuing...';
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.8';
    
    showToast('✅ Saved to CareerAgent Queue!');
    
    let jobData = typeof dataGetter === 'function' ? dataGetter() : dataGetter;
    
    // If it's a promise (e.g. from a background fetch), wait for it
    if (jobData && typeof jobData.then === 'function') {
      jobData = await jobData;
    }
    
    chrome.storage.local.get(['jobQueue'], (result) => {
      const queue = result.jobQueue || [];
      if (!queue.find(j => j.url === jobData.url)) {
        queue.push({
          url: jobData.url,
          page_title: jobData.page_title,
          description: jobData.description,
          id: Date.now().toString()
        });
        chrome.storage.local.set({ jobQueue: queue }, () => {
          btn.innerText = 'Saved to Queue';
          btn.style.backgroundColor = '#ea580c'; // Vibrant Orange
        });
      } else {
        btn.innerText = 'Saved to Queue';
        btn.style.backgroundColor = '#ea580c'; // Vibrant Orange
      }
    });
  });
  
  return btn;
}

function getLinkedInJobData() {
  // Extract visible text from the job description
  const jdContainer = document.querySelector('.jobs-description');
  let text = document.body.innerText;
  if (jdContainer) {
     text = jdContainer.innerText;
  }
  return {
    url: cleanUrl(window.location.href),
    description: text,
    page_title: document.title
  };
}

function cleanUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('linkedin.com')) {
      // If it's a search page with a selected job, construct a clean view URL
      const currentJobId = parsed.searchParams.get('currentJobId');
      if (currentJobId) {
        return `https://www.linkedin.com/jobs/view/${currentJobId}/`;
      }
      // If it's a direct job view, remove all tracking params
      if (parsed.pathname.includes('/jobs/view/')) {
        return `https://www.linkedin.com${parsed.pathname}`;
      }
    }
    // Default fallback: just remove query params to ensure consistent state
    return parsed.origin + parsed.pathname;
  } catch(e) {
    return url;
  }
}

function getPostUrl(actionBar) {
  // 1. Try to find the URN
  const urnNode = actionBar.closest('[data-urn]');
  if (urnNode) {
    const urn = urnNode.getAttribute('data-urn');
    return `https://www.linkedin.com/feed/update/${urn}/`;
  }
  
  // 2. Try to find a link to the post (usually the timestamp)
  const post = actionBar.closest('.feed-shared-update-v2') || actionBar.parentElement?.parentElement;
  if (post) {
     const links = post.querySelectorAll('a[href*="/feed/update/"], a[href*="/posts/"]');
     if (links.length > 0) {
       return links[0].href.split('?')[0]; // clean tracking
     }
     
     // 3. Hash the text as a fallback
     const text = post.innerText;
     if (text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) hash = Math.imul(31, hash) + text.charCodeAt(i) | 0;
        return `https://www.linkedin.com/feed/post/${Math.abs(hash)}`;
     }
  }
  
  return `https://www.linkedin.com/feed/post/${Math.random().toString().substring(2)}`;
}



// Run periodically to catch dynamic DOM changes (infinite scrolling)
setInterval(injectCareerAgentButton, 2000);

// Initial run
injectCareerAgentButton();

function injectToastStyles() {
  if (!document.getElementById('ca-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'ca-toast-styles';
    // Import Outfit from Google Fonts (looks very similar to Google Sans/Product Sans)
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap');
      
      .ca-checkmark-circle {
        stroke-dasharray: 166;
        stroke-dashoffset: 166;
        stroke-width: 4;
        stroke-miterlimit: 10;
        stroke: #22c55e;
        fill: none;
        animation: ca-stroke 0.4s cubic-bezier(0.65, 0, 0.45, 1) forwards;
      }
      .ca-checkmark-check {
        transform-origin: 50% 50%;
        stroke-dasharray: 48;
        stroke-dashoffset: 48;
        stroke-width: 4;
        stroke: #22c55e;
        fill: none;
        animation: ca-stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.3s forwards;
      }
      @keyframes ca-stroke {
        100% { stroke-dashoffset: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

// ----------------------------------------------------------------------
// Toast Notification System
// ----------------------------------------------------------------------
function showToast(message, duration = 4000) {
  injectToastStyles();
  let container = document.getElementById('ca-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ca-toast-container';
    container.style.position = 'fixed';
    container.style.bottom = '24px';
    container.style.left = '24px'; // Moved back to the left!
    // Removed translateX(-50%) so it aligns cleanly to the left edge
    container.style.display = 'flex';
    container.style.flexDirection = 'column-reverse'; // New toasts push old ones up
    container.style.gap = '12px';
    container.style.zIndex = '999999';
    container.style.pointerEvents = 'none'; // Don't block clicks underneath
    container.style.alignItems = 'flex-start'; // Ensure toasts align to the left of the container
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.backgroundColor = '#1e293b'; // Slate 800
  toast.style.color = '#f8fafc'; // Slate 50
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '8px'; // Standard shape
  toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
  toast.style.fontFamily = '"Outfit", "Google Sans", sans-serif';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '500';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(20px) scale(0.95)'; // Start slightly down and smaller
  toast.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
  
  // Decide icon and accent color based on message content
  let svgIcon = '';
  toast.style.borderLeft = '4px solid #10b981'; // Default Emerald
  
  if (message.includes('Fetching') || message.includes('Queuing') || message.includes('Started')) {
    toast.style.borderLeftColor = '#3b82f6'; // Blue
    svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
      </path>
    </svg>`;
  } else if (message.includes('Stopped') || message.includes('Failed')) {
    toast.style.borderLeftColor = '#ef4444'; // Red
    svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>`;
  } else {
    // Default green check
    svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52" style="width: 20px; height: 20px; ">
      <circle cx="26" cy="26" r="25" fill="none" stroke="#10b981" stroke-width="2" />
      <path fill="none" stroke="#10b981" stroke-width="2" d="M14.1 27.2l7.1 7.2 16.7-16.8" stroke-dasharray="34" stroke-dashoffset="34">
        <animate attributeName="stroke-dashoffset" from="34" to="0" dur="0.4s" fill="freeze" begin="0.2s" />
      </path>
    </svg>`;
  }

  // Strip emojis from message since we have cool SVGs now
  const cleanMessage = message.replace('✅ ', '').replace('🤖 ', '').replace('🛑 ', '');

  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; pointer-events: auto;">
      ${svgIcon}
      <span>${cleanMessage}</span>
    </div>
  `;
  
  // Insert at beginning (which displays at the bottom due to column-reverse)
  container.insertBefore(toast, container.firstChild);
  
  // Force reflow
  toast.offsetHeight;
  
  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0) scale(1)';
    toast.style.opacity = '1';
  });
  
  const removeToast = () => {
    if (!toast.parentNode) return;
    toast.style.opacity = '0';
    toast.style.transform = 'scale(0.95)';
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
      if (container.children.length === 0 && container.parentNode) container.remove();
    }, 400);
  };
  
  // Animate out and remove after duration (if greater than 0)
  if (duration > 0) {
    setTimeout(removeToast, duration);
  }
  
  return removeToast;
}

// ----------------------------------------------------------------------
// Auto-Scraper Logic
// ----------------------------------------------------------------------
let isAutoScraping = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_AUTO_SCRAPE') {
    if (!isAutoScraping) startAutoScrape();
    sendResponse({ started: true });
    return true;
  }
  
  if (request.action === 'STOP_AUTO_SCRAPE') {
    isAutoScraping = false;
    chrome.storage.local.set({ isScraping: false, pagesScraped: 0 });
    showToast('🛑 Auto-Scrape Stopped.');
    sendResponse({ stopped: true });
    return true;
  }
});

async function startAutoScrape() {
  isAutoScraping = true;
  
  const res = await new Promise(resolve => chrome.storage.local.get(['targetPages', 'pagesScraped'], resolve));
  const targetPages = res.targetPages || 5;
  const pagesScraped = res.pagesScraped || 0;
  
  showToast(`🤖 Auto-Scraper Started! (Page ${pagesScraped + 1} of ${targetPages}) Please do not click anything...`);
  
  const delay = (ms) => new Promise(res => setTimeout(res, ms));
  
  // Find all unqueued ca-save-btn buttons currently on the page
  let buttons = Array.from(document.querySelectorAll('.ca-save-btn:not([style*="pointer-events: none"])'));
  let savedCount = 0;
  
  // If no buttons, try scrolling down slightly to trigger lazy loading
  if (buttons.length === 0) {
    window.scrollBy(0, window.innerHeight);
    await delay(2000);
    buttons = Array.from(document.querySelectorAll('.ca-save-btn:not([style*="pointer-events: none"])'));
  }
  
  // Scrape up to 50 jobs at a time to avoid bans
  for (let i = 0; i < buttons.length && i < 50; i++) {
    if (!isAutoScraping) break; // Check if user stopped it
    
    const btn = buttons[i];
    
    // Scroll element into view smoothly
    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(800); // Small pause after scrolling
    
    if (!isAutoScraping) break;
    
    // Check if it's already queued (safety check)
    if (btn.style.pointerEvents === 'none') continue;
    
    btn.click();
    savedCount++;
    
    // Random delay between 2-5 seconds to mimic human reading/clicking
    const humanDelay = Math.floor(Math.random() * 3000) + 2000;
    await delay(humanDelay);
  }
  
  if (isAutoScraping) {
    const newPagesScraped = (res.pagesScraped || 0) + 1;
    
    if (newPagesScraped < targetPages) {
      showToast(`✅ Page finished! Moving to next page in 3 seconds...`);
      chrome.storage.local.set({ pagesScraped: newPagesScraped });
      
      await delay(3000);
      
      let nextBtn = null;
      // 1. Naukri pagination (finds the <a> or <button> containing "Next")
      const elements = Array.from(document.querySelectorAll('a, button'));
      for (const el of elements) {
         if (el.innerText && el.innerText.trim().toLowerCase() === 'next') {
            nextBtn = el;
            break;
         }
      }
      
      // 2. LinkedIn pagination fallback
      if (!nextBtn) {
         nextBtn = document.querySelector('button[aria-label="Next"]');
      }
      
      if (nextBtn) {
         nextBtn.click();
         
         // In Single Page Applications (like Naukri), clicking Next doesn't reload the page.
         // We must poll until the new job cards render and our script injects new unclicked buttons.
         let attempts = 0;
         const checkReady = setInterval(() => {
           attempts++;
           const unclickedButtons = document.querySelectorAll('.ca-save-btn:not([style*="pointer-events: none"])');
           if (unclickedButtons.length > 0 || attempts > 15) {
             clearInterval(checkReady);
             if (isAutoScraping) startAutoScrape(); // Restart the scraping engine for the new page
           }
         }, 1000);
         
         return; // Exit current engine instance

      } else {
         showToast(`🛑 No 'Next' button found! Stopping auto-scrape.`);
         isAutoScraping = false;
         chrome.storage.local.set({ isScraping: false, pagesScraped: 0 });
      }
    } else {
      showToast(`🎉 Auto-Scrape complete! Scraped ${targetPages} pages.`);
      isAutoScraping = false;
      chrome.storage.local.set({ isScraping: false, pagesScraped: 0 });
    }
  }
  
  // Only reset if we didn't return early (e.g., manually stopped or finished)
  if (!isAutoScraping) {
    chrome.storage.local.set({ isScraping: false });
  }
}

// Auto-resume scraping if page navigates while isScraping is active
chrome.storage.local.get(['isScraping'], (res) => {
  if (res.isScraping) {
    let attempts = 0;
    const checkReady = setInterval(() => {
      attempts++;
      const buttons = document.querySelectorAll('.ca-save-btn');
      // Wait for at least one button to be injected, or timeout after 15 seconds
      if (buttons.length > 0 || attempts > 15) {
        clearInterval(checkReady);
        if (!isAutoScraping) startAutoScrape();
      }
    }, 1000);
  }
});
