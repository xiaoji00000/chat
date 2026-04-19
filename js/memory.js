export class MemoryManager {
    constructor() {
        this.storageKey = 'chat_lobe_memory';
        this.memory = this.load();
    }

    load() {
        const defaultMem = { identity: "", context: "", preferences: "", experience: "", activity: "" };
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? { ...defaultMem, ...JSON.parse(data) } : defaultMem;
        } catch (e) {
            return defaultMem;
        }
    }

    save(data) {
        this.memory = { ...this.memory, ...data };
        localStorage.setItem(this.storageKey, JSON.stringify(this.memory));
    }

    getSystemPrompt() {
        let parts = [];
        const m = this.memory;
        if (m.identity) parts.push(`[身份设定]\n${m.identity}`);
        if (m.context) parts.push(`[背景情境]\n${m.context}`);
        if (m.preferences) parts.push(`[输出偏好]\n${m.preferences}`);
        if (m.experience) parts.push(`[过往经验]\n${m.experience}`);
        if (m.activity) parts.push(`[当前活动]\n${m.activity}`);
        return parts.join('\n\n');
    }
}
