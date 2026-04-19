import { MemoryManager } from './memory.js';
import { fetchChat } from './api.js';

const memory = new MemoryManager();
let currentImageBase64 = null;

let sessions = [];
let currentSessionId = null;
const SESSIONS_KEY = 'chat_sessions_v2';

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

// === 会话管理 ===
function loadSessions() {
    const saved = localStorage.getItem(SESSIONS_KEY);
    sessions = saved ? JSON.parse(saved) : [];
    
    if (sessions.length === 0) {
        createNewSession();
    } else {
        const lastSessionId = localStorage.getItem('current_session_id') || sessions[0].id;
        switchSession(lastSessionId);
    }
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
    if (!sessions.find(s => s.id === id)) {
        id = sessions.length > 0 ? sessions[0].id : null;
    }
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
            session.title = newTitle.length > 12 ? newTitle.substring(0, 12) + '...' : newTitle;
        }
        saveSessions();
        renderSessionList();
    }
}

// === UI 渲染 ===
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
    const messages = getCurrentMessages();
    messages.forEach(msg => appendMessageUI(msg.role, msg.content, null, false));
}

function appendMessageUI(role, content, imageBase64 = null, shouldScroll = true) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = role === 'assistant' ? marked.parse(content) : content;

    if (imageBase64) {
        const img = document.createElement('img');
        img.src = imageBase64;
        div.appendChild(img);
    }

    els.historyBox.appendChild(div);
    if (shouldScroll) els.historyBox.scrollTop = els.historyBox.scrollHeight;
}

// === 核心设置实时自动保存逻辑 ===
els.apiKey.addEventListener('input', (e) => localStorage.setItem('api_key', e.target.value.trim()));
els.model.addEventListener('change', (e) => localStorage.setItem('api_model', e.target.value));

// === 其他事件绑定 ===
els.newChatBtn.addEventListener('click', createNewSession);
els.deleteBtn.addEventListener('click', () => { if (confirm("确定要删除当前对话吗？")) deleteCurrentSession(); });

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
    const btn = els.saveMemBtn;
    btn.textContent = '✅ 已保存记忆';
    setTimeout(() => btn.textContent = '保存记忆配置', 1000);
});

async function handleSend() {
    const text = els.input.value.trim();
    if (!text && !currentImageBase64) return;

    const apiKey = els.apiKey.value.trim();
    if (!apiKey) return alert("请先填写 API Key");

    appendMessageUI('user', text, currentImageBase64);
    const currentMessages = getCurrentMessages();
    
    let userMsgContent = currentImageBase64 ? [
        { type: "text", text: text || "请分析图片" },
        { type: "image_url", image_url: { url: currentImageBase64 } }
    ] : text;

    const requestMessages = [
        { role: 'system', content: memory.getSystemPrompt() },
        ...currentMessages,
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
        currentMessages.push({ role: 'user', content: text || "[图片消息]" });
        currentMessages.push({ role: 'assistant', content: reply });
        
        const titleExtract = text ? text : "图片对话";
        updateCurrentSession(currentMessages, titleExtract);
        
    } catch (err) {
        appendMessageUI('assistant', `❌ 错误: ${err.message}`);
    } finally {
        els.sendBtn.disabled = false;
        els.sendBtn.textContent = '发送';
        els.input.focus();
    }
}

els.sendBtn.addEventListener('click', handleSend);
els.input.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter') handleSend(); });

init();
