// ==============================================
// NEXUS AI - SISTEM UTAMA
// ==============================================

// State Aplikasi
let currentChatId = generateId();
let chats = {};
let settings = {
    darkMode: true,
    animations: true,
    detailLevel: 'sedang',
    showSources: true,
    showConfidence: true,
    autoTTS: false
};
let tokenCount = 0;
let isGenerating = false;
let abortController = null;

// Sumber Data
const SOURCES = {
    web: {
        name: "Pencarian Web Umum",
        url: "https://api.duckduckgo.com/?q=",
        priority: 8
    },
    wikipedia: {
        name: "Wikipedia",
        url: "https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=true&explaintext=true&titles=",
        priority: 9
    }
};

// Inisialisasi Aplikasi
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    loadData();
    renderChatHistory();
    updateStats();
    hljs.highlightAll();
});

function initApp() {
    // Loading Screen
    setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hidden');
    }, 1200);

    // Sidebar
    document.getElementById('openSidebar').addEventListener('click', () => toggleSidebar(true));
    document.getElementById('closeSidebar').addEventListener('click', () => toggleSidebar(false));
    document.getElementById('overlay').addEventListener('click', () => toggleSidebar(false));

    // Chat
    document.getElementById('newChatBtn').addEventListener('click', createNewChat);
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('userInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    document.getElementById('userInput').addEventListener('input', autoResizeTextarea);

    // Pencarian Chat
    document.getElementById('searchChat').addEventListener('input', searchChat);

    // Tema
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Pengaturan
    document.getElementById('settingsBtn').addEventListener('click', () => openModal('settingsModal'));
    document.querySelectorAll('.close-btn, .modal').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === el) closeModal('settingsModal');
        });
    });

    // Ekspor & Hapus
    document.getElementById('exportAllChat').addEventListener('click', exportAllChat);
    document.getElementById('clearAllChat').addEventListener('click', clearAllChat);

    // Input Tambahan
    document.getElementById('voiceInput').addEventListener('click', startVoiceInput);
    document.getElementById('imageBtn').addEventListener('click', () => document.getElementById('imageUpload').click());
    document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
    document.getElementById('stopGenerate').addEventListener('click', stopGeneration);
}

// ==============================================
// SISTEM MULTI SOURCE INTELLIGENCE
// ==============================================

async function processQuery(query) {
    updateTokenCount(query.length);
    
    tampilkanIndikatorMengetik(true);
    abortController = new AbortController();

    try {
        // 1. Kumpulkan data dari semua sumber
        const results = await collectData(query);
        
        // 2. Analisis dan peringkat
        const analyzed = analyzeData(results, query);
        
        // 3. Buat jawaban akhir
        const finalAnswer = generateFinalAnswer(analyzed, query);
        
        // 4. Tampilkan hasil
        tampilkanPesan('nexus', finalAnswer);
        simpanChat();

    } catch (error) {
        if (error.name !== 'AbortError') {
            tampilkanPesan('nexus', `⚠️ Terjadi kesalahan saat memproses permintaan. Silakan coba lagi.\n\nDetail: ${error.message}`);
        }
    } finally {
        tampilkanIndikatorMengetik(false);
        abortController = null;
    }
}

async function collectData(query) {
    const results = [];
    
    // Ambil dari pencarian web
    try {
        const res = await fetch(`${SOURCES.web.url}${encodeURIComponent(query)}&format=json`, {
            signal: abortController.signal
        });
        const data = await res.json();
        if (data.Abstract) {
            results.push({
                source: SOURCES.web.name,
                content: data.Abstract,
                priority: SOURCES.web.priority,
                url: data.AbstractURL || ''
            });
        }
    } catch (e) {}

    // Ambil dari Wikipedia
    try {
        const res = await fetch(`${SOURCES.wikipedia.url}${encodeURIComponent(query)}`, {
            signal: abortController.signal
        });
        const data = await res.json();
        const pages = data.query?.pages || {};
        for (const page of Object.values(pages)) {
            if (page.extract && page.extract.length > 100) {
                results.push({
                    source: SOURCES.wikipedia.name,
                    content: page.extract.slice(0, 1500),
                    priority: SOURCES.wikipedia.priority,
                    url: `https://id.wikipedia.org/wiki/${encodeURIComponent(page.title)}`
                });
                break;
            }
        }
    } catch (e) {}

    return results;
}

function analyzeData(results, query) {
    if (results.length === 0) {
        return {
            answer: `Saya belum menemukan informasi yang cukup untuk pertanyaan Anda: "${query}".\n\nSilakan coba susun ulang pertanyaan atau gunakan kata kunci yang lebih spesifik.`,
            confidence: 0,
            sources: []
        };
    }

    // Hitung skor relevansi
    const queryWords = query.toLowerCase().split(' ');
    results.forEach(item => {
        const contentLower = item.content.toLowerCase();
        let matchCount = 0;
        queryWords.forEach(word => {
            if (contentLower.includes(word)) matchCount++;
        });
        item.relevance = matchCount / queryWords.length;
        item.quality = (item.priority / 10) * 0.6 + (item.relevance * 0.4);
    });

    // Urutkan berdasarkan kualitas
    results.sort((a, b) => b.quality - a.quality);

    // Gabungkan informasi terbaik
    const topResults = results.slice(0, 3);
    const combinedContent = topResults.map(r => r.content).join('\n\n---\n\n');
    
    // Hitung tingkat kepercayaan
    const confidence = Math.round(Math.min(topResults.reduce((sum, r) => sum + r.quality, 0) / topResults.length, 1) * 100);

    return {
        answer: combinedContent,
        confidence: confidence,
        sources: topResults.map(r => ({ name: r.source, url: r.url }))
    };
}

function generateFinalAnswer(analyzed, query) {
    let answer = '';

    // Tambahkan tingkat kepercayaan
    if (settings.showConfidence && analyzed.confidence > 0) {
        const level = analyzed.confidence >= 75 ? 'high' : analyzed.confidence >= 50 ? 'medium' : 'low';
        answer += `<div class="confidence ${level}">Tingkat Kepercayaan: ${analyzed.confidence}%</div>\n\n`;
    }

    // Isi jawaban
    answer += `**Jawaban untuk: ${query}**\n\n${analyzed.answer}\n\n`;

    // Tambahkan sumber
    if (settings.showSources && analyzed.sources.length > 0) {
        answer += `<div class="source-box">\n📚 **Sumber Referensi:**\n`;
        analyzed.sources.forEach((s, i) => {
            answer += `${i+1}. ${s.name} ${s.url ? `- <a href="${s.url}" target="_blank">Buka</a>` : ''}\n`;
        });
        answer += `</div>`;
    }

    return answer;
}

// ==============================================
// FUNGSI UTAMA
// ==============================================

function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    
    if (!message || isGenerating) return;

    tampilkanPesan('user', message);
    input.value = '';
    autoResizeTextarea();
    
    processQuery(message);
}

function tampilkanPesan(type, content) {
    const container = document.getElementById('chatMessages');
    const messageId = generateId();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.dataset.id = messageId;

    let avatar = type === 'nexus' ? 'N' : 'U';
    let processedContent = content;

    if (type === 'nexus') {
        processedContent = marked.parse(content);
    } else {
        processedContent = escapeHtml(content).replace(/\n/g, '<br>');
    }

    messageDiv.innerHTML = `
        <div class="avatar ${type === 'nexus' ? 'nexus' : 'user'}">${avatar}</div>
        <div class="message-content">${processedContent}</div>
        <div class="message-actions">
            <button class="icon-btn btn-sm copy-btn" title="Salin">📋</button>
            ${type === 'nexus' ? `
                <button class="icon-btn btn-sm tts-btn" title="Bacakan">🔊</button>
                <button class="icon-btn btn-sm regenerate-btn" title="Buat Ulang">🔄</button>
            ` : ''}
        </div>
    `;

    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;

    // Event listener
    messageDiv.querySelector('.copy-btn').addEventListener('click', () => copyText(content));
    if (type === 'nexus') {
        messageDiv.querySelector('.tts-btn').addEventListener('click', () => textToSpeech(content));
        messageDiv.querySelector('.regenerate-btn').addEventListener('click', () => regenerateMessage(messageId));
    }

    // Highlight kode
    messageDiv.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
}

function tampilkanIndikatorMengetik(show) {
    isGenerating = show;
    const indicator = document.getElementById('typingIndicator');
    indicator.classList.toggle('hidden', !show);
}

function stopGeneration() {
    if (abortController) abortController.abort();
    tampilkanIndikatorMengetik(false);
}

// ==============================================
// PENYIMPANAN & RIWAYAT
// ==============================================

function simpanChat() {
    const messages = Array.from(document.querySelectorAll('.message')).map(el => ({
        type: el.classList.contains('nexus') ? 'nexus' : 'user',
        content: el.querySelector('.message-content').textContent
    }));

    if (!chats[currentChatId]) {
        chats[currentChatId] = {
            id: currentChatId,
            title: messages[0]?.content.slice(0, 30) || 'Obrolan Baru',
            createdAt: Date.now(),
            messages: messages
        };
    } else {
        chats[currentChatId].messages = messages;
    }

    localStorage.setItem('nexus_ai_chats', JSON.stringify(chats));
    localStorage.setItem('nexus_ai_settings', JSON.stringify(settings));
    localStorage.setItem('nexus_ai_token', tokenCount);

    renderChatHistory();
    updateStats();
}

function loadData() {
    const savedChats = localStorage.getItem('nexus_ai_chats');
    const savedSettings = localStorage.getItem('nexus_ai_settings');
    const savedToken = localStorage.getItem('nexus_ai_token');

    if (savedChats) chats = JSON.parse(savedChats);
    if (savedSettings) {
        settings = { ...settings, ...JSON.parse(savedSettings) };
        applySettings();
    }
    if (savedToken) tokenCount = parseInt(savedToken) || 0;
}

function renderChatHistory() {
    const container = document.getElementById('chatHistory');
    container.innerHTML = '';

    Object.values(chats)
        .sort((a, b) => b.createdAt - a.createdAt)
        .forEach(chat => {
            const item = document.createElement('div');
            item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
            item.innerHTML = `
                <div class="chat-title">${chat.title}</div>
                <div class="chat-date text-sm">${formatDate(chat.createdAt)}</div>
            `;
            item.addEventListener('click', () => loadChat(chat.id));
            container.appendChild(item);
        });
}

function loadChat(chatId) {
    currentChatId = chatId;
    const chat = chats[chatId];
    
    document.getElementById('chatMessages').innerHTML = '';
    chat.messages.forEach(msg => tampilkanPesan(msg.type, msg.content));
    document.getElementById('currentChatTitle').textContent = chat.title;
    
    renderChatHistory();
    toggleSidebar(false);
}

function createNewChat() {
    currentChatId = generateId();
    document.getElementById('chatMessages').innerHTML = `
        <div class="welcome-message glass">
            <h2>👋 Mulai Obrolan Baru</h2>
            <p>Ajukan pertanyaan apa saja, dan saya akan mencari informasi dari berbagai sumber terpercaya untuk Anda.</p>
        </div>
    `;
    document.getElementById('currentChatTitle').textContent = 'Obrolan Baru';
    renderChatHistory();
    toggleSidebar(false);
}

// ==============================================
// FUNGSI BANTUAN
// ==============================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function autoResizeTextarea() {
    const textarea = document.getElementById('userInput');
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

function toggleSidebar(open) {
    document.getElementById('sidebar').classList.toggle('open', open);
    document.getElementById('overlay').classList.toggle('active', open);
}

function toggleTheme() {
    settings.darkMode = !settings.darkMode;
    document.body.classList.toggle('dark-theme', settings.darkMode);
    document.body.classList.toggle('light-theme', !settings.darkMode);
    document.getElementById('themeIcon').textContent = settings.darkMode ? '🌙' : '☀️';
    localStorage.setItem('nexus_ai_settings', JSON.stringify(settings));
}

function applySettings() {
    document.getElementById('darkModeSetting').checked = settings.darkMode;
    document.getElementById('animSetting').checked = settings.animations;
    document.getElementById('detailLevel').value = settings.detailLevel;
    document.getElementById('showSources').checked = settings.showSources;
    document.getElementById('showConfidence').checked = settings.showConfidence;
    document.getElementById('autoTTS').checked = settings.autoTTS;
    
    toggleTheme();
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function copyText(text) {
    navigator.clipboard.writeText(text);
    showToast('Teks disalin!');
}

function textToSpeech(text) {
    if (!window.speechSynthesis) {
        showToast('Fitur suara tidak didukung browser Anda');
        return;
    }
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#]/g, ''));
    utterance.lang = 'id-ID';
    speechSynthesis.speak(utterance);
}

function updateTokenCount(amount = 0) {
    tokenCount += amount;
    document.getElementById('tokenCount').textContent = tokenCount.toLocaleString();
}

function updateStats() {
    document.getElementById('chatCount').textContent = Object.keys(chats).length;
    document.getElementById('tokenCount').textContent = tokenCount.toLocaleString();
}

function searchChat() {
    const keyword = document.getElementById('searchChat').value.toLowerCase();
    document.querySelectorAll('.chat-item').forEach(item => {
        const title = item.querySelector('.chat-title').textContent.toLowerCase();
        item.style.display = title.includes(keyword) ? 'block' : 'none';
    });
}

function exportAllChat() {
    let content = `=== NEXUS AI - EKSPOR SEMUA OBROLAN ===\nTanggal: ${new Date().toLocaleString('id-ID')}\n\n`;
    Object.values(chats).forEach(chat => {
        content += `--- ${chat.title} ---\n`;
        chat.messages.forEach(msg => {
            const sender = msg.type === 'user' ? 'Anda' : 'NEXUS AI';
            content += `[${sender}]: ${msg.content}\n\n`;
        });
        content += `\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NEXUS_AI_Chat_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Semua obrolan berhasil diekspor!');
}

function clearAllChat() {
    if (confirm('Hapus SEMUA riwayat obrolan? Tindakan ini tidak dapat dibatalkan!')) {
        chats = {};
        tokenCount = 0;
        localStorage.removeItem('nexus_ai_chats');
        localStorage.removeItem('nexus_ai_token');
        createNewChat();
        updateStats();
        showToast('Semua riwayat berhasil dihapus!');
    }
}

function regenerateMessage(messageId) {
    const messages = document.querySelectorAll('.message');
    let found = false;
    let userQuery = '';
    
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].dataset.id === messageId) {
            messages[i].remove();
            found = true;
        } else if (found && messages[i].classList.contains('user')) {
            userQuery = messages[i].querySelector('.message-content').textContent;
            break;
        }
    }

    if (userQuery) processQuery(userQuery);
}

function startVoiceInput() {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
        showToast('Input suara tidak didukung browser Anda');
        return;
    }

    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;

    recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        document.getElementById('userInput').value = text;
        autoResizeTextarea();
    };

    recognition.start();
    showToast('Silakan bicara...');
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        tampilkanPesan('user', `[Gambar diunggah: ${file.name}]`);
        tampilkanPesan('nexus', `Saya menerima gambar: **${file.name}**\n\nSaat ini sistem mendukung analisis teks dan informasi. Dukungan analisis gambar akan hadir dalam pembaruan berikutnya.`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}
