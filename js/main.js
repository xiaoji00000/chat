import { MemoryManager } from './memory.js';
import { fetchChat } from './api.js';

const memory = new MemoryManager();
let currentImageBase64 = null;
let chatHistory = []; 
const HISTORY_KEY = 'chat_history_v1';

const els = {
    apiKey: document.getElementById('api-key'),
    model: document.getElementById('model-select'),
    input: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    historyBox: document.getElementById('chat-history'),
    imageUpload: document.getElementById('image-upload'),
    imagePreview: document.getElementById('image-preview'),
    clearBtn: document.getElementById('clear-history-btn'),
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

    // 加载并渲染历史记录
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
        chatHistory = JSON.parse(saved);
        chatHistory.forEach(msg => appendMessage(msg.role, msg.content, null, false));
    }
}

function appendMessage(role, content, imageBase64 = null, shouldScroll = true) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    // 只有回复消息才过 markdown
    div.innerHTML = role === 'assistant' ? marked.parse(content) : content;

    if (imageBase64) {
        const img = document.createElement('img');
        img.src = imageBase64;
        div.appendChild(img);
    }

    els.historyBox.appendChild(div);
    if (shouldScroll) els.historyBox.scrollTop = els.historyBox.scrollHeight;
}

els.clearBtn.addEventListener('click', () => {
    if (confirm("确定清空对话历史吗？记忆设置会保留。")) {
        chatHistory = [];
        localStorage.removeItem(HISTORY_KEY);
        els.historyBox.innerHTML = '';
    }
});

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
    localStorage.setItem('api_key', els.apiKey.value);
    localStorage.setItem('api_model', els.model.value);
    const newMem = {};
    Object.keys(els.mem).forEach(key => newMem[key] = els.mem[key].value);
    memory.save(newMem);
    
    // 视觉反馈
    const btn = els.saveMemBtn;
    btn.textContent = '✅ 已保存';
    setTimeout(() => btn.textContent = '保存配置与记忆', 1000);
});

async function handleSend() {
    const text = els.input.value.trim();
    if (!text && !currentImageBase64) return;

    const apiKey = els.apiKey.value;
    const model = els.model.value;

    if (!apiKey) return alert("请先填写 API Key");

    // UI 渲染
    appendMessage('user', text, currentImageBase64);
    
    // 构造 Payload
    let userMsgContent = currentImageBase64 ? [
        { type: "text", text: text || "请分析图片" },
        { type: "image_url", image_url: { url: currentImageBase64 } }
    ] : text;

    const requestMessages = [
        { role: 'system', content: memory.getSystemPrompt() },
        ...chatHistory,
        { role: 'user', content: userMsgContent }
    ];

    // 重置输入状态
    els.input.value = '';
    els.imagePreview.classList.add('hidden');
    const imgBackup = currentImageBase64;
    currentImageBase64 = null;
    els.sendBtn.disabled = true;
    els.sendBtn.textContent = '...';

    try {
        const reply = await fetchChat(apiKey, model, requestMessages);
        appendMessage('assistant', reply);
        
        // 存入历史（不存 Base64，否则 LocalStorage 会爆）
        chatHistory.push({ role: 'user', content: text || "[图片消息]" });
        chatHistory.push({ role: 'assistant', content: reply });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory));
    } catch (err) {
        appendMessage('assistant', `❌ 错误: ${err.message}`);
    } finally {
        els.sendBtn.disabled = false;
        els.sendBtn.textContent = '发送';
    }
}

els.sendBtn.addEventListener('click', handleSend);
els.input.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter') handleSend(); });

init();
