import { MemoryManager } from './memory.js';
import { fetchChat } from './api.js';

const memory = new MemoryManager();

let currentImageBase64 = null;
marked.setOptions({
    gfm: true,
    breaks: true, // 允许回车直接换行
});
let sessions = [];
let currentSessionId = null;
const SESSIONS_KEY = 'chat_sessions_v4'; // 升版本，防止旧脏数据干扰
const MAX_HISTORY_LENGTH = 20;

const els = {
    apiKey: document.getElementById('api-key'), // 恢复原版，绑定原始输入框
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

// === 核心修复：根据当前选中的模型，动态切换输入框里显示的 Key ===
function updateKeyInputByModel(modelName) {
    if (!els.apiKey) return;
    if (modelName.includes("gpt")) {
        els.apiKey.value = localStorage.getItem('api_key_openai') || '';
        els.apiKey.placeholder = "填 OpenAI 分组 Key";
    } else {
        els.apiKey.value = localStorage.getItem('api_key_cc') || '';
        els.apiKey.placeholder = "填 CC 分组 Key";
    }
}

function init() {
    els.model.value = localStorage.getItem('api_model') || 'claude-opus-4-7';
    // 初始化时，根据默认模型加载对应的 Key
    updateKeyInputByModel(els.model.value);
    
    const memData = memory.memory;
    Object.keys(els.mem).forEach(key => els.mem[key].value = memData[key]);
    loadSessions();
}

function loadSessions() {
    const saved = localStorage.getItem(SESSIONS_KEY);
    sessions = saved ? JSON.parse(saved) : [];
    if (sessions.length === 0) createNewSession();
    else {
        const lastId = localStorage.getItem('current_session_id');
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
    renderCurrentChat();
}

function deleteCurrentSession() {
    if (sessions.length <= 1) {
        sessions[0].messages = [];
        sessions[0].title = '新对话';
    } else {
        sessions = sessions.filter(s => s.id !== currentSessionId);
        currentSessionId = sessions[0].id;
    }
    saveSessions();
    switchSession(currentSessionId);
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

function showTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'message assistant typing-indicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    els.historyBox.appendChild(div);
    els.historyBox.scrollTop = els.historyBox.scrollHeight;
    return div;
}

// === 核心修复：输入 Key 时，根据当前模型存到对应的坑位 ===
['input', 'change', 'blur'].forEach(evt => {
    if (els.apiKey) {
        els.apiKey.addEventListener(evt, (e) => {
            const val = e.target.value.trim();
            const currentModel = els.model.value;
            if (currentModel.includes("gpt")) {
                localStorage.setItem('api_key_openai', val);
            } else {
                localStorage.setItem('api_key_cc', val);
            }
        });
    }
});

// === 核心修复：切换模型时，立马把输入框里的 Key 替换掉 ===
if (els.model) {
    els.model.addEventListener('change', (e) => {
        const selectedModel = e.target.value;
        localStorage.setItem('api_model', selectedModel);
        updateKeyInputByModel(selectedModel);
    });
}

els.newChatBtn.addEventListener('click', createNewSession);
els.deleteBtn.addEventListener('click', () => { if (confirm("确认删除此对话？")) deleteCurrentSession(); });

function handleImageFile(file) {
    if (!file || file.type.indexOf('image') === -1) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        currentImageBase64 = ev.target.result;
        els.imagePreview.innerHTML = `<img src="${currentImageBase64}">`;
        els.imagePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

els.imageUpload.addEventListener('change', (e) => handleImageFile(e.target.files[0]));

els.input.addEventListener('paste', (e) => {
    if (!e.clipboardData) return;

    let imageFile = null;
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
        for (let i = 0; i < e.clipboardData.files.length; i++) {
            if (e.clipboardData.files[i].type.startsWith('image/')) {
                imageFile = e.clipboardData.files[i];
                break;
            }
        }
    }

    if (!imageFile && e.clipboardData.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
            const item = e.clipboardData.items[i];
            if (item.type.indexOf('image') !== -1) {
                imageFile = item.getAsFile();
                break;
            }
        }
    }

    if (imageFile) {
        handleImageFile(imageFile);
        e.preventDefault(); 
    }
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
    
    // 发送时直接抓取当前框里的 Key，判断逻辑已经在切换模型时做完了
    const apiKey = els.apiKey ? els.apiKey.value.trim() : "";
    if (!apiKey) return alert("请填写对应的 API Key");

    appendMessageUI('user', text, currentImageBase64);
    
    const currentMessages = getCurrentMessages();
    currentMessages.push({ role: 'user', content: text || "[图片]" });
    updateCurrentSession(currentMessages, text || "图片对话");

    let userMsgContent = currentImageBase64 ? [
        { type: "text", text: text || "解释图片" },
        { type: "image_url", image_url: { url: currentImageBase64 } }
    ] : text;
    const requestMessages = [
        { role: 'system', content: memory.getSystemPrompt() },
        ...currentMessages.slice(-MAX_HISTORY_LENGTH).slice(0, -1),
        { role: 'user', content: userMsgContent }
    ];

    els.input.value = '';
    els.imagePreview.classList.add('hidden');
    currentImageBase64 = null;
    els.sendBtn.disabled = true;
    
    const typingBubble = showTypingIndicator();

    try {
        const reply = await fetchChat(apiKey, els.model.value, requestMessages);
        typingBubble.remove();
        appendMessageUI('assistant', reply);
        currentMessages.push({ role: 'assistant', content: reply });
        updateCurrentSession(currentMessages);
    } catch (err) {
        typingBubble.remove();
        appendMessageUI('assistant', `❌ 错误: ${err.message}`);
    } finally {
        els.sendBtn.disabled = false;
        els.input.focus();
    }
}

els.sendBtn.addEventListener('click', handleSend);
els.input.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter') handleSend(); });

init();
