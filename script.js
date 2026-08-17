// ============================================
// CONFIGURATION - FIXED FOR VERCEL
// ============================================

// This works for both local and production
const API_URL = window.location.origin;
const IS_VERCEL = window.location.hostname.includes('vercel.app') || 
                  window.location.hostname !== 'localhost';

console.log(`🌐 Environment: ${IS_VERCEL ? 'Production (Vercel)' : 'Local'}`);
console.log(`📍 API URL: ${API_URL}`);

let userId = localStorage.getItem('userId') || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
let isThinking = false;
let messageCount = 0;

// Save userId
localStorage.setItem('userId', userId);

// ============================================
// DOM REFS
// ============================================
const messages = document.getElementById('messages');
const queryInput = document.getElementById('queryInput');
const sendBtn = document.getElementById('sendBtn');
const inputStatus = document.getElementById('inputStatus');
const queryCount = document.getElementById('queryCount');
const userCount = document.getElementById('userCount');
const subscriberCount = document.getElementById('subscriberCount');

// ============================================
// LOAD STATS ON START
// ============================================
loadStats();

// ============================================
// SEND QUERY - UPDATED WITH BETTER ERROR HANDLING
// ============================================
async function sendQuery() {
  const query = queryInput.value.trim();
  
  if (!query || isThinking) return;

  // Add user message
  addMessage('user', query);
  queryInput.value = '';
  queryInput.style.height = 'auto';
  
  // Show thinking state
  isThinking = true;
  sendBtn.disabled = true;
  inputStatus.textContent = '🤔 Thinking...';
  inputStatus.className = 'input-status thinking';
  
  // Add loading message
  const loadingMsg = addMessage('agent', 'Thinking...', true);

  try {
    // IMPORTANT: Use relative path for API calls
    const response = await fetch(`/api/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        query, 
        userId,
        context: 'personal brand agent'
      }),
    });

    // Check if response is OK
    if (!response.ok) {
      const text = await response.text();
      console.error('Server response:', text);
      
      // Check if we got HTML back (indicates wrong endpoint)
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
        throw new Error('Server returned HTML instead of JSON. The API endpoint might be wrong.');
      }
      
      try {
        const error = JSON.parse(text);
        throw new Error(error.details || error.error || 'Failed to get response');
      } catch (e) {
        throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
      }
    }

    const data = await response.json();
    
    // Remove loading message
    loadingMsg.remove();
    
    // Add response
    addMessage('agent', data.response, false, data.intent);
    
    // Update stats
    messageCount++;
    if (messageCount % 3 === 0) {
      loadStats();
    }

  } catch (error) {
    console.error('Full error:', error);
    loadingMsg.remove();
    addMessage('agent', `⚠️ ${error.message || 'Something went wrong. Please try again.'}`);
  } finally {
    isThinking = false;
    sendBtn.disabled = false;
    inputStatus.textContent = '🟢 Ready';
    inputStatus.className = 'input-status ready';
    queryInput.focus();
  }
}

// ============================================
// ADD MESSAGE (same as before)
// ============================================
function addMessage(role, content, isLoading = false, intent = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}-message`;
  
  if (isLoading) {
    messageDiv.classList.add('loading');
  }

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? '👤' : '🤖';

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  const header = document.createElement('div');
  header.className = 'message-header';

  const author = document.createElement('span');
  author.className = 'message-author';
  author.textContent = role === 'user' ? 'You' : "[Your Name]'s Agent";

  const time = document.createElement('span');
  time.className = 'message-time';
  time.textContent = new Date().toLocaleTimeString();

  header.appendChild(author);
  header.appendChild(time);

  const body = document.createElement('div');
  
  if (isLoading) {
    body.innerHTML = '<span class="loading-dots">Thinking</span>';
  } else {
    // Convert markdown-like formatting
    let html = content;
    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Lists
    html = html.replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = `<p>${html}</p>`;
    
    body.innerHTML = html;

    // Add intent badge if available
    if (intent) {
      const intentBadge = document.createElement('div');
      intentBadge.style.cssText = `
        margin-top: 8px;
        font-size: 10px;
        color: var(--text-secondary);
        opacity: 0.5;
        display: flex;
        gap: 8px;
        align-items: center;
      `;
      intentBadge.innerHTML = `
        <span>🎯 ${intent.type || 'advice'}</span>
        <span>·</span>
        <span>${intent.complexity || 'medium'} complexity</span>
        <span>·</span>
        <span>${Math.round((intent.confidence || 0.8) * 100)}% confidence</span>
      `;
      contentDiv.appendChild(intentBadge);
    }
  }

  contentDiv.appendChild(header);
  contentDiv.appendChild(body);
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  
  messages.appendChild(messageDiv);
  
  // Scroll to bottom
  messages.scrollTop = messages.scrollHeight;
  
  return messageDiv;
}

// ============================================
// HANDLE KEYBOARD
// ============================================
function handleKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendQuery();
  }
  
  // Auto-resize textarea
  const textarea = event.target;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

// ============================================
// QUICK ACTIONS
// ============================================
document.querySelectorAll('.quick-action').forEach(btn => {
  btn.addEventListener('click', () => {
    queryInput.value = btn.dataset.query;
    sendQuery();
  });
});

// ============================================
// RESEARCH MODE
// ============================================
let researchVisible = false;

function toggleResearch() {
  researchVisible = !researchVisible;
  const container = document.getElementById('researchContainer');
  const btn = document.querySelector('.toggle-btn');
  
  container.style.display = researchVisible ? 'block' : 'none';
  btn.textContent = researchVisible ? '💬 Switch to Chat Mode' : '🔍 Switch to Research Mode';
}

async function researchTopic() {
  const topic = document.getElementById('researchTopic').value.trim();
  if (!topic) return;

  const resultsDiv = document.getElementById('researchResults');
  resultsDiv.innerHTML = '<div class="loading">🔍 Researching...</div>';

  try {
    const response = await fetch(`/api/research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ topic })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    
    let html = `<h3>📋 Research Report: ${data.topic}</h3>`;
    html += `<div>${data.synthesis.replace(/\n/g, '<br>')}</div>`;
    html += `<h3>📝 Key Questions</h3>`;
    data.findings.forEach(f => {
      html += `<div style="margin: 8px 0; padding: 8px; background: var(--bg); border-radius: 6px;">
        <strong>${f.question}</strong>
        <p style="font-size: 13px;">${f.answer.substring(0, 150)}...</p>
      </div>`;
    });
    
    resultsDiv.innerHTML = html;
  } catch (error) {
    resultsDiv.innerHTML = `<div style="color: var(--secondary);">Error: ${error.message}</div>`;
  }
}

// ============================================
// LOAD STATS - UPDATED
// ============================================
async function loadStats() {
  try {
    const response = await fetch(`/api/stats`);
    if (!response.ok) return;
    
    const stats = await response.json();
    
    queryCount.textContent = stats.total_queries || 0;
    userCount.textContent = stats.unique_users || 0;
    subscriberCount.textContent = stats.total_subscribers || 0;
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// ============================================
// SUBSCRIBE - UPDATED
// ============================================
async function subscribe() {
  const email = prompt('📧 Enter your email to get updates:');
  if (!email) return;

  try {
    const response = await fetch(`/api/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email, 
        query: 'subscribed from website'
      })
    });

    const data = await response.json();
    alert(data.message || '✅ Subscribed successfully!');
    loadStats();
  } catch (error) {
    alert('❌ Failed to subscribe. Please try again.');
  }
}

// ============================================
// SHOW CHANGELOG - UPDATED
// ============================================
async function showChangelog() {
  try {
    const response = await fetch(`/api/changelog`);
    if (!response.ok) throw new Error('Failed to load');
    
    const data = await response.json();
    
    let msg = '📋 Changelog\n\n';
    data.updates.forEach(u => {
      msg += `${u.date}\n${u.feature}\n${u.description}\n\n`;
    });
    
    alert(msg);
  } catch (error) {
    alert('Failed to load changelog');
  }
}

// ============================================
// SHOW STATS
// ============================================
function showStats() {
  loadStats();
  alert(`📊 Stats:\n\nQueries: ${queryCount.textContent}\nUsers: ${userCount.textContent}\nSubscribers: ${subscriberCount.textContent}`);
}

// ============================================
// INIT
// ============================================
queryInput.focus();

console.log('🤖 [Your Name]\'s Agent loaded');
console.log(`👤 User ID: ${userId}`);
console.log(`🌐 Environment: ${IS_VERCEL ? 'Vercel' : 'Local'}`);
console.log('💬 Type your query and hit Enter');