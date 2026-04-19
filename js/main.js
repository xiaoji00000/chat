import { MemoryManager } from './memory.js';
import { fetchChat } from './api.js';

const memory = new MemoryManager();
let currentImageBase64 = null;
let chatHistory = []; 
const HISTORY_KEY = 'chat_messages_history';

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

// 初始化
function init() {
    els.apiKey.value = localStorage.getItem('api_key') || '';
    els.model.value = localStorage.getItem('api_model') || 'claude-opus-4-7';
    
    // 加载分层记忆
    const memData = memory.memory;
    Object.keys(els.mem).forEach(key => els.mem[key].value = memData[key]);

    // 加载历史对话
    loadHistory();
}

function loadHistory() {
    try {
        const saved = localStorage.getItem(HISTORY_KEY);
        if (saved) {
            chatHistory = JSON.parse(saved);
            // 重新渲染历史记录到界面
            chatHistory.forEach(msg => {
                appendMessage(msg.role, msg.content, null, false);
            });
            scrollToBottom();
        }
    } catch (e) {
        console.error("加载历史对话失败", e);
        chatHistory = [];
    }
}

function saveHistory() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory));
}

function scrollToBottom() {
    els.historyBox.scrollTop = els.historyBox.scrollHeight;
}

// 渲染消息 (isHtml 参数防止渲染历史记录时 Markdown 重复转义)
function appendMessage(role, content, imageBase64 = null, parseMarkdown = true) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    // 如果是模型回复且要求解析，才过一遍 marked
    let htmlContent = (role === 'assistant' && parseMarkdown) ? marked.parse(content) : content;
    // 如果是加载历史记录里的 assistant 消息，直接作为 HTML 插入 (因为我们在保存前不需要把 markdown 存为 html，这里做了简化：历史消息读取时也实时 parse)
    if(role === 'assistant' && !parseMarkdown){
        htmlContent = marked.parse(content);
    }

    div.innerHTML = htmlContent;

    if (imageBase64) {
        const img = document.createElement('img');
        img.src = imageBase64;
        div.appendChild(img);
    }

    els.historyBox.appendChild(div);
    scrollToBottom();
}

// 清空历史
els.clearBtn.addEventListener('click', () => {
    if(confirm("确定要清空当前对话历史吗？这不会清除你的分层记忆设定。")) {
        chatHistory = [];
        saveHistory();
        els.historyBox.innerHTML = '';
    }
});

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

// 保存配置与记忆 (带视觉反馈)
els.saveMemBtn.addEventListener('click', () => {
    localStorage.setItem('api_key', els.apiKey.value);
    localStorage.setItem('api_model', els.model.value);
    
    const newMem = {};
    Object.keys(els.mem).forEach(key => newMem[key] = els.mem[key].value);
    memory.save(newMem);
    
    // UI 反馈
    const originalText = els.saveMemBtn.textContent;
    els.saveMemBtn.textContent = '✅ 已保存';
    els.saveMemBtn.style.backgroundColor = '#28a745';
    setTimeout(() => {
        els.saveMemBtn.textContent = originalText;
        els.saveMemBtn.style.backgroundColor = ''; // 恢复 CSS 默认
    }, 1500);
});

// 发送逻辑
async function handleSend() {
    const text = els.input.value.trim();
    if (!text && !currentImageBase64) return;

    const apiKey = els.apiKey.value;
    const model = els.model.value;

    if(!apiKey) {
        alert("请先在左侧配置 API Key");
        return;
    }

    let userPayload;
    if (currentImageBase64) {
        userPayload = [
            { type: "text", text: text || "请看这张图" },
            { type: "image_url", image_url: { url: currentImageBase64 } }
        ];
    } else {
        userPayload = text;
    }

    appendMessage('user', text, currentImageBase64);
    
    const systemPrompt = memory.getSystemPrompt();
    let requestMessages = [];
    if (systemPrompt) {
        requestMessages.push({ role: 'system', content: systemPrompt });
    }
    
    // 发送给 API 的消息数组包含之前的历史
    requestMessages = requestMessages.concat(chatHistory);
    requestMessages.push({ role: 'user', content: userPayload });

    // 清理 UI 状态
    els.input.value = '';
    els.imageUpload.value = '';
    els.imagePreview.classList.add('hidden');
    const tempImage = currentImageBase64;
    currentImageBase64 = null;
    
    els.sendBtn.disabled = true;
    els.sendBtn.textContent = '思考中...';

    try {
        const replyText = await fetchChat(apiKey, model, requestMessages);
        
        appendMessage('assistant', replyText);
        
        // 更新并持久化历史记录 (只存文本，图片直接丢弃防超限)
        chatHistory.push({ role: 'user', content: text || "[图片消息]" });
        chatHistory.push({ role: 'assistant', content: replyText });
        saveHistory();

    } catch (error) {
        appendMessage('assistant', `**错误:** ${error.message}`);
    } finally {
        els.sendBtn.disabled = false;
        els.sendBtn.textContent = '发送';
        els.input.focus();
    }
}

els.sendBtn.addEventListener('click', handleSend);
els.input.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') handleSend();
});

init();
