import { MemoryManager } from './memory.js';
import { fetchChat } from './api.js';

const memory = new MemoryManager();
let currentImageBase64 = null;

let sessions = [];
let currentSessionId = null;
const SESSIONS_KEY = 'chat_sessions_v3';
const MAX_HISTORY_LENGTH = 20;

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

// === 核心逻辑：修复删除与切换 ===
function loadSessions() {
    const saved = localStorage.getItem(SESSIONS_KEY);
    sessions = saved ? JSON.parse(saved) : [];
    if (sessions.length === 0) {
        createNewSession();
    } else {
        const lastId = localStorage.getItem('current_session_id');
        // 确保上一次记录的 ID 依然存在于 session 列表中
        const targetId = sessions.find(s => s.id === lastId) ? lastId : sessions[0].id;
        switchSession(targetId);
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
    currentSessionId = id;
    saveSessions();
    renderSessionList();
    renderCurrentChat(); // 关键：强制刷新聊天区
}

function deleteCurrentSession() {
    if (sessions.length <= 1) {
        // 最后一个会话，清空内容而非删除条目
        const session = sessions[0];
        session.messages = [];
        session.title = '新对话';
    } else {
        // 过滤掉当前会话
        sessions = sessions.filter(s => s.id !== currentSessionId);
        // 自动指向列表第一个会话
        currentSessionId = sessions[0].id;
    }
    saveSessions();
    switchSession(currentSessionId); // 彻底重绘 UI
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
    els.historyBox.innerHTML = ''; // 必须先清空 DOM
    const session = sessions.find(s => s.id === currentSessionId);
    if (session && session.messages) {
        session.messages.forEach(msg => appendMessageUI(msg.role, msg.content, null, false));
    }
    els.historyBox.scrollTop = els.historyBox.scrollHeight;
}

function appendMessageUI(role, content, imageBase64 = null, shouldScroll = true) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (role === 'assistant') {
        div.innerHTML = marked.parse(content);
        div.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    } else {
        div.textContent = content;
    }
    if (imageBase64) {
        const img = document.createElement('img');
        img.src = imageBase64;
        div.appendChild(img);
    }
    els.historyBox.appendChild(div);
    if (shouldScroll) els.historyBox.scrollTop = els.historyBox.scrollHeight;
}

// === 设置与事件 ===
['input', 'change', 'blur'].forEach(evt => {
    els.apiKey.addEventListener(evt, (e) => localStorage.setItem('api_key', e.target.value.trim()));
});
els.model.addEventListener('change', (e) => localStorage.setItem('api_model', e.target.value));
els.newChatBtn.addEventListener('click', createNewSession);
els.deleteBtn.addEventListener('click', () => { if (confirm("确认删除当前会话？")) deleteCurrentSession(); });

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

    appendMessageUI('user', text, currentImageBase64);
    const session = sessions.find(s => s.id === currentSessionId);
    const currentMessages = session.messages;
    
    let userMsgContent = currentImageBase64 ? [
        { type: "text", text: text || "解释图片" },
        { type: "image_url", image_url: { url: currentImageBase64 } }
    ] : text;

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
