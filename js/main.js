import { MemoryManager } from './memory.js';
import { fetchChat } from './api.js';

const memory = new MemoryManager();
let currentImageBase64 = null;
let chatHistory = []; // 对话上下文

// DOM 元素
const els = {
    apiKey: document.getElementById('api-key'),
    model: document.getElementById('model-select'),
    input: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    historyBox: document.getElementById('chat-history'),
    imageUpload: document.getElementById('image-upload'),
    imagePreview: document.getElementById('image-preview'),
    mem: {
        identity: document.getElementById('mem-identity'),
        context: document.getElementById('mem-context'),
        preferences: document.getElementById('mem-preferences'),
        experience: document.getElementById('mem-experience'),
        activity: document.getElementById('mem-activity')
    },
    saveMemBtn: document.getElementById('save-mem-btn')
};

// 初始化：读取本地保存的数据
function init() {
    els.apiKey.value = localStorage.getItem('api_key') || '';
    els.model.value = localStorage.getItem('api_model') || 'claude-opus-4-7';
    
    const memData = memory.memory;
    Object.keys(els.mem).forEach(key => els.mem[key].value = memData[key]);
}

// 渲染消息到界面
function appendMessage(role, content, imageBase64 = null) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    let htmlContent = role === 'assistant' ? marked.parse(content) : content;
    div.innerHTML = htmlContent;

    if (imageBase64) {
        const img = document.createElement('img');
        img.src = imageBase64;
        div.appendChild(img);
    }

    els.historyBox.appendChild(div);
    els.historyBox.scrollTop = els.historyBox.scrollHeight;
}

// 处理图片上传
els.imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        currentImageBase64 = event.target.result;
        els.imagePreview.innerHTML = `<img src="${currentImageBase64}">`;
        els.imagePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
});

// 保存配置
els.saveMemBtn.addEventListener('click', () => {
    localStorage.setItem('api_key', els.apiKey.value);
    localStorage.setItem('api_model', els.model.value);
    
    const newMem = {};
    Object.keys(els.mem).forEach(key => newMem[key] = els.mem[key].value);
    memory.save(newMem);
    alert('记忆已保存到本地');
});

// 发送逻辑
async function handleSend() {
    const text = els.input.value.trim();
    if (!text && !currentImageBase64) return;

    const apiKey = els.apiKey.value;
    const model = els.model.value;

    // 组装发给大模型的 payload
    let userPayload;
    if (currentImageBase64) {
        userPayload = [
            { type: "text", text: text || "请看这张图" },
            { type: "image_url", image_url: { url: currentImageBase64 } }
        ];
    } else {
        userPayload = text;
    }

    // 1. UI 渲染用户输入
    appendMessage('user', text, currentImageBase64);
    
    // 2. 构建本次请求的完整 Messages
    const systemPrompt = memory.getSystemPrompt();
    let requestMessages = [];
    if (systemPrompt) {
        requestMessages.push({ role: 'system', content: systemPrompt });
    }
    // 压入之前的历史
    requestMessages = requestMessages.concat(chatHistory);
    // 压入当前输入
    requestMessages.push({ role: 'user', content: userPayload });

    // 3. 清理输入框状态
    els.input.value = '';
    els.imageUpload.value = '';
    els.imagePreview.classList.add('hidden');
    const tempImage = currentImageBase64;
    currentImageBase64 = null;
    els.sendBtn.disabled = true;
    els.sendBtn.textContent = '思考中...';

    // 4. 发送请求
    try {
        const replyText = await fetchChat(apiKey, model, requestMessages);
        
        // 渲染回复
        appendMessage('assistant', replyText);
        
        // 将此轮对话加入上下文 (注意：这里存的是纯文本，防止把 base64 图片存进历史导致 token 爆炸)
        chatHistory.push({ role: 'user', content: text || "[图片]" });
        chatHistory.push({ role: 'assistant', content: replyText });

    } catch (error) {
        appendMessage('assistant', `**错误:** ${error.message}`);
    } finally {
        els.sendBtn.disabled = false;
        els.sendBtn.textContent = '发送';
    }
}

els.sendBtn.addEventListener('click', handleSend);
els.input.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') handleSend();
});

init();
