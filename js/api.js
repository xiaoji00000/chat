export async function fetchChat(apiKey, model, messages) {
    if (!apiKey) throw new Error("API Key 不能为空");
    
    const url = 'https://api.aipaibox.com/v1/chat/completions';
    const payload = {
        model: model,
        messages: messages,
        max_tokens: 4096
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errInfo = await response.text();
        throw new Error(`请求失败 (${response.status}): ${errInfo}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}
