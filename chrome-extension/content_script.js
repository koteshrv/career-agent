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
      
      // Prevent injecting into side-rail job cards or discover cards
      if (nativeBtn.closest('.job-card-container, .job-card-list, .discover-entity-type-card, .artdeco-list, .scaffold-layout__list')) return;
      
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
          
          const btn = createSaveButton('Queue', getLinkedInJobData);
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


function setButtonActiveState(btn, isActive, isEvaluated = false) {
  const path = btn.querySelector('svg path');
  if (path) {
    if (isActive) {
      // Filled Bookmark
      path.setAttribute('d', 'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z');
    } else {
      // Outline Bookmark
      path.setAttribute('d', 'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2zm-7-6.2l5 2.85V5H7v12.65z');
    }
  }
  
  if (isEvaluated) {
    btn.style.color = '#057642'; // LinkedIn Success Green
  } else if (isActive) {
    btn.style.color = '#0a66c2'; // LinkedIn Active Blue (same as Like)
  } else {
    btn.style.color = '#666666'; // LinkedIn Muted Gray
  }
}

function checkQueueState(url, btn) {
  chrome.storage.local.get(['jobQueue', 'processedJobs'], (result) => {
    const queue = result.jobQueue || [];
    const processed = result.processedJobs || [];
    const isNative = btn.classList.contains('ca-feed-native-btn');
    
    if (processed.includes(url)) {
      if (isNative) {
        setButtonActiveState(btn, true, true);
        const textSpan = btn.querySelector('.ca-dynamic-text, span > span');
        if (textSpan) textSpan.innerText = 'Evaluated';
      } else {
        btn.innerText = 'Evaluated';
        btn.style.backgroundColor = '#057642'; // Green
      }
      btn.style.pointerEvents = 'none';
    } else if (queue.find(j => j.url === url)) {
      if (isNative) {
        setButtonActiveState(btn, true, false);
        const textSpan = btn.querySelector('.ca-dynamic-text, .saveSpn, span > span');
        if (textSpan) textSpan.innerText = 'Queued';
      } else {
        btn.innerText = 'Queued';
        btn.style.backgroundColor = '#0a66c2'; // Blue
      }
    } else {
      if (isNative) {
        setButtonActiveState(btn, false, false);
      }
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
          let current = actionBar;
          let attempts = 0;
          let descriptionText = '';
          
          while (current && attempts < 15) {
            // Find the container that holds the main post text (usually has 'update-components-text' or is just a huge block)
            const textBlock = current.querySelector('.update-components-text, .feed-shared-update-v2__description-wrapper, [dir="ltr"]');
            if (textBlock && textBlock.innerText.length > 20) {
              descriptionText = textBlock.innerText;
              break;
            }
            current = current.parentElement;
            attempts++;
          }
          
          // Fallback to grabbing whatever large text is near the action bar
          if (!descriptionText) {
             const wrapper = actionBar.parentElement?.parentElement?.parentElement;
             descriptionText = wrapper ? wrapper.innerText : '';
          }

          return { 
            url: postUrl, 
            description: descriptionText.trim(), 
            page_title: document.title 
          };
        }, nativeBtn);
        
        checkQueueState(postUrl, btn);
        
        // Append our button to the end of the action bar row
        actionBar.appendChild(btn);
        
        console.log("CareerAgent: Button injected on Feed Post");
      }
    }
  });
}

function createFeedNativeButton(dataGetter, templateNode = null) {
  let btn;
  const bookmarkSvg = `<svg class="ca-icon" role="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2zm-7-6.2l5 2.85V5H7v12.65z"></path>
  </svg>`;

  if (templateNode) {
    // Exact structural clone
    btn = document.createElement('button');
    btn.className = templateNode.className + ' ca-save-btn ca-feed-native-btn';
    btn.style.cssText = templateNode.style.cssText;
    btn.innerHTML = templateNode.innerHTML;
    
    // Replace SVG
    const svgEl = btn.querySelector('svg');
    if (svgEl) {
      const parent = svgEl.parentNode;
      const parser = new DOMParser();
      const newSvg = parser.parseFromString(bookmarkSvg, 'image/svg+xml').querySelector('svg');
      // Copy vital classes from old SVG if needed
      newSvg.className.baseVal = svgEl.className.baseVal;
      parent.replaceChild(newSvg, svgEl);
    }
    
    // Replace Text
    const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT, null, false);
    let textNode;
    while(textNode = walker.nextNode()) {
      if(textNode.nodeValue.trim().length > 0) {
        textNode.nodeValue = 'Queue';
        if (textNode.parentNode) {
          textNode.parentNode.classList.add('ca-dynamic-text');
        }
        break;
      }
    }
  } else {
    // Fallback if no template provided
    btn = document.createElement('button');
    btn.className = 'ca-save-btn ca-feed-native-btn';
    btn.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; background: transparent; border: none; color: #666666; font-family: inherit; font-size: 14px; font-weight: 600; min-height: 48px; padding: 8px; cursor: pointer;';
    btn.innerHTML = `
      <span style="display: flex; flex-direction: column; align-items: center;">
        ${bookmarkSvg}
        <span class="ca-dynamic-text" style="margin-top: 2px;">Queue</span>
      </span>
    `;
  }
  
  btn.style.transition = 'color 0.2s';


  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const textSpan = btn.querySelector('.ca-dynamic-text, span > span');
    let jobData = typeof dataGetter === 'function' ? dataGetter() : dataGetter;
    if (jobData && typeof jobData.then === 'function') {
      if (textSpan) textSpan.innerText = 'Queuing...';
      jobData = await jobData;
    }
    
    chrome.storage.local.get(['jobQueue'], (result) => {
      let queue = result.jobQueue || [];
      const existingIdx = queue.findIndex(j => j.url === jobData.url);
      
      if (existingIdx === -1) {
        queue.push({
          url: jobData.url,
          page_title: jobData.page_title,
          description: jobData.description,
          id: Date.now().toString()
        });
        chrome.storage.local.set({ jobQueue: queue }, () => {
          setButtonActiveState(btn, true, false);
          if (textSpan) textSpan.innerText = 'Queued';
          showToast('✅ Saved to CareerAgent Queue!');
        });
      } else {
        queue.splice(existingIdx, 1);
        chrome.storage.local.set({ jobQueue: queue }, () => {
          setButtonActiveState(btn, false, false);
          if (textSpan) textSpan.innerText = 'Queue';
          showToast('🛑 Removed from Queue');
        });
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
          
          const btn = createSaveButton('Queue', () => {
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
     span.innerText = 'Queue';
     textNodeToReplace.parentNode.replaceChild(span, textNodeToReplace);
  } else {
     // Fallback if no text node was found
     const span = document.createElement('span');
     span.className = 'ca-dynamic-text';
     span.innerText = 'Queue';
     btn.appendChild(span);
  }
  
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const textSpan = btn.querySelector('.ca-dynamic-text, .saveSpn, span > span');
    
    let jobData = typeof dataGetter === 'function' ? dataGetter() : dataGetter;
    if (jobData && typeof jobData.then === 'function') {
      if (textSpan) textSpan.innerText = 'Queuing...';
      jobData = await jobData;
    }
    
    chrome.storage.local.get(['jobQueue'], (result) => {
      let queue = result.jobQueue || [];
      const existingIdx = queue.findIndex(j => j.url === jobData.url);
      
      if (existingIdx === -1) {
        queue.push({
          url: jobData.url,
          page_title: jobData.page_title,
          description: jobData.description,
          id: Date.now().toString()
        });
        chrome.storage.local.set({ jobQueue: queue }, () => {
          btn.style.color = '#ea580c';
          if (textSpan) textSpan.innerText = 'Queued';
          showToast('✅ Saved to CareerAgent Queue!');
        });
      } else {
        queue.splice(existingIdx, 1);
        chrome.storage.local.set({ jobQueue: queue }, () => {
          btn.style.color = 'inherit';
          if (textSpan) textSpan.innerText = 'Queue';
          showToast('🛑 Removed from Queue');
        });
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
    
    let jobData = typeof dataGetter === 'function' ? dataGetter() : dataGetter;
    if (jobData && typeof jobData.then === 'function') {
      btn.innerText = 'Queuing...';
      jobData = await jobData;
    }
    
    chrome.storage.local.get(['jobQueue'], (result) => {
      let queue = result.jobQueue || [];
      const existingIdx = queue.findIndex(j => j.url === jobData.url);
      
      if (existingIdx === -1) {
        // ADD
        queue.push({
          url: jobData.url,
          page_title: jobData.page_title,
          description: jobData.description,
          id: Date.now().toString()
        });
        chrome.storage.local.set({ jobQueue: queue }, () => {
          btn.innerText = 'Queued';
          btn.style.backgroundColor = '#ea580c'; // Vibrant Orange
          showToast('✅ Saved to CareerAgent Queue!');
        });
      } else {
        // REMOVE
        queue.splice(existingIdx, 1);
        chrome.storage.local.set({ jobQueue: queue }, () => {
          btn.innerText = 'Queue';
          btn.style.backgroundColor = '#2563eb'; // Blue back to normal
          showToast('🛑 Removed from Queue');
        });
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
  let current = actionBar;
  let attempts = 0;
  
  // Walk up the DOM tree up to 15 levels to find the main post container
  while (current && attempts < 15) {
    // Look for data-urn or data-id (LinkedIn often uses these for the main post wrapper)
    const urn = current.getAttribute('data-urn') || current.getAttribute('data-id');
    if (urn && urn.includes('activity')) {
      return `https://www.linkedin.com/feed/update/${urn}/`;
    }
    
    // Look for the timestamp link inside this container
    // We only search within this container if it looks like a large wrapper
    if (current.innerText && current.innerText.length > 50) {
      const links = current.querySelectorAll('a[href*="urn:li:activity"], a[href*="/posts/"]');
      if (links.length > 0) {
        // Find the one that actually looks like a post link (usually contains the timestamp)
        for (const link of links) {
          if (link.href.includes('activity:') || link.href.includes('/posts/')) {
            return link.href.split('?')[0];
          }
        }
      }
    }
    
    current = current.parentElement;
    attempts++;
  }
  
  // Fallback: Just grab the first activity link on the entire screen that comes BEFORE our button 
  // (A bit hacky, but better than a random hash!)
  const allLinks = Array.from(document.querySelectorAll('a[href*="urn:li:activity"]'));
  if (allLinks.length > 0) {
     // Find the closest one above us in the DOM
     // For now, just return the most recent one we can guess
     return allLinks[allLinks.length - 1].href.split('?')[0];
  }

  return `https://www.linkedin.com/feed/`; // Ultimate fallback to home feed so it's not a broken 404 page
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
