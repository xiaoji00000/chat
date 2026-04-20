import { MemoryManager } from './memory.js';
import { fetchChat } from './api.js';

const memory = new MemoryManager();

let currentImageBase64 = null;
// === 在 const memory = new MemoryManager(); 下方添加这行 ===
marked.setOptions({
    gfm: true,
    breaks: true, // 允许回车直接换行
});
let sessions = [];
let currentSessionId = null;
const SESSIONS_KEY = 'chat_sessions_v4'; // 升版本，防止旧脏数据干扰
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

// === 新增：动态加载动画 UI ===
function showTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'message assistant typing-indicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    els.historyBox.appendChild(div);
    els.historyBox.scrollTop = els.historyBox.scrollHeight;
    return div;
}

// 基础事件绑定
['input', 'change', 'blur'].forEach(evt => els.apiKey.addEventListener(evt, (e) => localStorage.setItem('api_key', e.target.value.trim())));
els.model.addEventListener('change', (e) => localStorage.setItem('api_model', e.target.value));
els.newChatBtn.addEventListener('click', createNewSession);
els.deleteBtn.addEventListener('click', () => { if (confirm("确认删除此对话？")) deleteCurrentSession(); });

// 图片转 Base64 逻辑封装
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

// 按钮上传图片
els.imageUpload.addEventListener('change', (e) => handleImageFile(e.target.files[0]));

// === 终极修复：兼容所有截图软件和浏览器的粘贴事件 ===
els.input.addEventListener('paste', (e) => {
    // 阻止浏览器报错，确保剪贴板对象存在
    if (!e.clipboardData) return;

    let imageFile = null;

    // 策略 1: 优先从 files 集合里找 (兼容直接复制的本地图片文件)
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
        for (let i = 0; i < e.clipboardData.files.length; i++) {
            if (e.clipboardData.files[i].type.startsWith('image/')) {
                imageFile = e.clipboardData.files[i];
                break;
            }
        }
    }

    // 策略 2: 如果 files 里没有，再从 items 集合里找 (兼容 QQ/微信/Snipping Tool 的内存截图)
    if (!imageFile && e.clipboardData.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
            const item = e.clipboardData.items[i];
            if (item.type.indexOf('image') !== -1) {
                imageFile = item.getAsFile();
                break;
            }
        }
    }

    // 如果成功提取到了图片
    if (imageFile) {
        handleImageFile(imageFile);
        e.preventDefault(); // 关键：截断事件，防止浏览器把图片当成乱码文本塞进输入框
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
    const apiKey = els.apiKey.value.trim();
    if (!apiKey) return alert("请填写 API Key");

    // 1. 立即上屏展示
    appendMessageUI('user', text, currentImageBase64);
    
    // === 核心修复：不管 API 成不成功，先把用户发的东西死死写入本地缓存 ===
    const currentMessages = getCurrentMessages();
    currentMessages.push({ role: 'user', content: text || "[图片]" });
    updateCurrentSession(currentMessages, text || "图片对话");

    // 构造请求数据 (只带最后20条防爆炸)
    let userMsgContent = currentImageBase64 ? [
        { type: "text", text: text || "解释图片" },
        { type: "image_url", image_url: { url: currentImageBase64 } }
    ] : text;
    const requestMessages = [
        { role: 'system', content: memory.getSystemPrompt() },
        ...currentMessages.slice(-MAX_HISTORY_LENGTH).slice(0, -1), // 截取历史并剃掉刚刚压入还未发送的最新条目
        { role: 'user', content: userMsgContent }
    ];

    // 清空输入区，按钮进入锁定状态
    els.input.value = '';
    els.imagePreview.classList.add('hidden');
    currentImageBase64 = null;
    els.sendBtn.disabled = true;
    
    // 2. 呼出打字机动画
    const typingBubble = showTypingIndicator();

    try {
        const reply = await fetchChat(apiKey, els.model.value, requestMessages);
        // 请求成功：移除动画，渲染回复，写入缓存
        typingBubble.remove();
        appendMessageUI('assistant', reply);
        currentMessages.push({ role: 'assistant', content: reply });
        updateCurrentSession(currentMessages);
    } catch (err) {
        // 请求失败：移除动画，渲染红色报错。因为前面已经执行了 updateCurrentSession，所以你打的字不会丢
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
