import { MemoryManager } from './memory.js';
import { fetchChat } from './api.js';

const memory = new MemoryManager();
let currentImageBase64 = null;

let sessions = [];
let currentSessionId = null;
const SESSIONS_KEY = 'chat_sessions_v3'; // 更新 KEY 防止旧数据冲突
const MAX_HISTORY_LENGTH = 20; // 截断策略：只带最近的 20 条消息 (10轮对话)

const els = {
    apiKey: document.getElementById('api-key'),
    model: document.getElementById('model-select'),
    input: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    historyBox: document.getElementById('chat-history'),
    imageUpload: document.getElementById('image-upload'),
    imagePreview: document.getElementById('image-preview'),
    sessionList: document.getElementById('session-list'),
    newChatBtn: document.getElementById('new-chat-btn'),
    deleteBtn: document.getElementById('delete-session-btn'),
    mem: {
        identity: document.getElementById('mem-identity'),
        context: document.getElementById('mem-context'),
        preferences: document.getElementById('mem-preferences'),
        experience: document.getElementById('mem-experience'),
        activity: document.getElementById('mem-activity')
    },
    saveMemBtn: document.getElementById('save-mem-btn')
};

function init() {
    els.apiKey.value = localStorage.getItem('api_key') || '';
    els.model.value = localStorage.getItem('api_model') || 'claude-opus-4-7';
    
    const memData = memory.memory;
    Object.keys(els.mem).forEach(key => els.mem[key].value = memData[key]);
    loadSessions();
}

function loadSessions() {
    const saved = localStorage.getItem(SESSIONS_KEY);
    sessions = saved ? JSON.parse(saved) : [];
    if (sessions.length === 0) createNewSession();
    else switchSession(localStorage.getItem('current_session_id') || sessions[0].id);
}

function saveSessions() {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    localStorage.setItem('current_session_id', currentSessionId);
}

function createNewSession() {
    const newSession = { id: Date.now().toString(), title: '新对话', messages: [] };
    sessions.unshift(newSession);
    switchSession(newSession.id);
}

function switchSession(id) {
    if (!sessions.find(s => s.id === id)) id = sessions.length > 0 ? sessions[0].id : null;
    currentSessionId = id;
    saveSessions();
    renderSessionList();
    renderCurrentChat();
}

function deleteCurrentSession() {
    if (sessions.length <= 1) {
        sessions[0].messages = [];
        sessions[0].title = '新对话';
    } else {
        sessions = sessions.filter(s => s.id !== currentSessionId);
    }
    saveSessions();
    switchSession(sessions[0].id);
}

function getCurrentMessages() {
    const session = sessions.find(s => s.id === currentSessionId);
    return session ? session.messages : [];
}

function updateCurrentSession(messages, newTitle = null) {
    const session = sessions.find(s => s.id === currentSessionId);
    if (session) {
        session.messages = messages;
        if (newTitle && session.title === '新对话') {
            session.title = newTitle.length > 15 ? newTitle.substring(0, 15) + '...' : newTitle;
        }
        saveSessions();
        renderSessionList();
    }
}

function renderSessionList() {
    els.sessionList.innerHTML = '';
    sessions.forEach(session => {
        const li = document.createElement('li');
        li.className = `session-item ${session.id === currentSessionId ? 'active' : ''}`;
        li.textContent = session.title;
        li.onclick = () => switchSession(session.id);
        els.sessionList.appendChild(li);
    });
}

function renderCurrentChat() {
    els.historyBox.innerHTML = '';
    getCurrentMessages().forEach(msg => appendMessageUI(msg.role, msg.content, null, false));
}

function appendMessageUI(role, content, imageBase64 = null, shouldScroll = true) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    // Markdown 解析
    if (role === 'assistant') {
        div.innerHTML = marked.parse(content);
        // 代码高亮渲染
        div.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    } else {
        div.textContent = content; // 用户输入作为纯文本防止注入
    }

    if (imageBase64) {
        const img = document.createElement('img');
        img.src = imageBase64;
        div.appendChild(img);
    }

    els.historyBox.appendChild(div);
    if (shouldScroll) els.historyBox.scrollTop = els.historyBox.scrollHeight;
}

// 事件监听与防抖保存
['input', 'change', 'blur'].forEach(evt => {
    els.apiKey.addEventListener(evt, (e) => {
        if(e.target.value.trim()) localStorage.setItem('api_key', e.target.value.trim());
    });
});
els.model.addEventListener('change', (e) => localStorage.setItem('api_model', e.target.value));
els.newChatBtn.addEventListener('click', createNewSession);
els.deleteBtn.addEventListener('click', () => { if (confirm("确认删除此对话？")) deleteCurrentSession(); });

els.imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        currentImageBase64 = ev.target.result;
        els.imagePreview.innerHTML = `<img src="${currentImageBase64}">`;
        els.imagePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
});

els.saveMemBtn.addEventListener('click', () => {
    const newMem = {};
    Object.keys(els.mem).forEach(key => newMem[key] = els.mem[key].value);
    memory.save(newMem);
    els.saveMemBtn.textContent = '✅ 已保存';
    setTimeout(() => els.saveMemBtn.textContent = '保存配置', 1000);
});

async function handleSend() {
    const text = els.input.value.trim();
    if (!text && !currentImageBase64) return;

    const apiKey = els.apiKey.value.trim();
    if (!apiKey) return alert("请填写 API Key");
    localStorage.setItem('api_key', apiKey); // 最终兜底保存

    appendMessageUI('user', text, currentImageBase64);
    const currentMessages = getCurrentMessages();
    
    // payload 构造
    let userMsgContent = currentImageBase64 ? [
        { type: "text", text: text || "解释图片内容" },
        { type: "image_url", image_url: { url: currentImageBase64 } }
    ] : text;

    // 核心：截取历史记录，防止 Token 超限 (取数组末尾的 MAX_HISTORY_LENGTH 条)
    const contextMessages = currentMessages.slice(-MAX_HISTORY_LENGTH);

    const requestMessages = [
        { role: 'system', content: memory.getSystemPrompt() },
        ...contextMessages,
        { role: 'user', content: userMsgContent }
    ];

    els.input.value = '';
    els.imagePreview.classList.add('hidden');
    currentImageBase64 = null;
    els.sendBtn.disabled = true;
    els.sendBtn.textContent = '...';

    try {
        const reply = await fetchChat(apiKey, els.model.value, requestMessages);
        appendMessageUI('assistant', reply);
        currentMessages.push({ role: 'user', content: text || "[图片]" });
        currentMessages.push({ role: 'assistant', content: reply });
        updateCurrentSession(currentMessages, text);
    } catch (err) {
        appendMessageUI('assistant', `❌ 系统错误: ${err.message}`);
    } finally {
        els.sendBtn.disabled = false;
        els.sendBtn.textContent = '发送';
        els.input.focus();
    }
}

els.sendBtn.addEventListener('click', handleSend);
els.input.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter') handleSend(); });

init();
