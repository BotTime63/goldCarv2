/* ==========================================================
    APP.JS - Night Edition (Right-Hand Thumb Optimized)
========================================================== */

const GITHUB_CONFIG = {
    owner: "bottime63",
    repo: "goldCarv2",
    token: localStorage.getItem("mediaViewerToken") || "",
    branch: "main"
};

const SEARCH_DELAY = 250;

let mediaUrls = [];
let workingList = [];
let currentIndex = 0;
let searchTimer = null;
let recentHistory = [];

const STORAGE = {
    heartMode: "mediaViewerHeartMode",
    swipeMode: "mediaViewerSwipeMode",
    visited: "mediaViewerVisited"
};

let seenItems = new Set();
let heartedItems = new Set();
let heartMode = localStorage.getItem(STORAGE.heartMode) === "true";
let swipeMode = localStorage.getItem(STORAGE.swipeMode) === "true";

/* ==========================================================
    INIT & AUTH
========================================================== */
function checkPassword(){
    const tokenInput = document.getElementById("passwordInput").value.trim();
    if(tokenInput.startsWith("ghp_") || tokenInput.startsWith("github_pat_")){
        GITHUB_CONFIG.token = tokenInput;
        localStorage.setItem("mediaViewerToken", tokenInput);
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("app").style.display = "block";
        initializeApp();
    } else {
        document.getElementById("loginError").textContent = "Invalid token format";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const loginBtn = document.getElementById("loginButton");
    const pwdInput = document.getElementById("passwordInput");

    if(loginBtn) loginBtn.addEventListener("click", checkPassword);
    if(pwdInput) pwdInput.addEventListener("keypress", (e) => { if(e.key === "Enter") checkPassword(); });

    if(GITHUB_CONFIG.token){
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("app").style.display = "block";
        initializeApp();
    }
});

/* ==========================================================
    GITHUB SYNC
========================================================== */
async function fetchGitHubFile(path) {
    try {
        const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`;
        const res = await fetch(url, { headers: { Authorization: `token ${GITHUB_CONFIG.token}` } });
        if(!res.ok) return null;
        const data = await res.json();
        return { content: JSON.parse(atob(data.content)), sha: data.sha };
    } catch(e) {
        return null;
    }
}

async function saveGitHubFile(path, dataArray) {
    const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`;
    const existing = await fetchGitHubFile(path);
    const sha = existing ? existing.sha : undefined;

    const jsonString = JSON.stringify(dataArray, null, 2);
    const contentBase64 = btoa(unescape(encodeURIComponent(jsonString)));

    const body = {
        message: `Update ${path} from Night Viewer`,
        content: contentBase64,
        branch: GITHUB_CONFIG.branch
    };
    if(sha) body.sha = sha;

    const res = await fetch(url, {
        method: "PUT",
        headers: { "Authorization": `token ${GITHUB_CONFIG.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    if(!res.ok) throw new Error(`Failed to save ${path}`);
}

async function loadServerData(){
    const heartsRes = await fetchGitHubFile("saved_hearts.json");
    if(heartsRes && Array.isArray(heartsRes.content)) heartedItems = new Set(heartsRes.content);

    const seenRes = await fetchGitHubFile("seen_media.json");
    if(seenRes && Array.isArray(seenRes.content)) seenItems = new Set(seenRes.content);

    updateStats();
}

async function manualSyncToGitHub(){
    const statusEl = document.getElementById("status");
    statusEl.style.color = "#38bdf8";
    statusEl.textContent = "💾 Saving to GitHub...";

    try {
        await saveGitHubFile("saved_hearts.json", [...heartedItems]);
        await saveGitHubFile("seen_media.json", [...seenItems]);
        statusEl.style.color = "#10b981";
        statusEl.textContent = "✅ Saved successfully!";
        setTimeout(() => { statusEl.textContent = ""; }, 3000);
    } catch(error) {
        statusEl.style.color = "#f87171";
        statusEl.textContent = "❌ Save failed";
    }
}

function saveSettings(){
    localStorage.setItem(STORAGE.heartMode, heartMode.toString());
    localStorage.setItem(STORAGE.swipeMode, swipeMode.toString());
}

/* ==========================================================
    STATS & WELCOME
========================================================== */
function updateStats(){
    const total = mediaUrls.length;
    const seen = seenItems.size;
    const hearts = heartedItems.size;

    const seenEl = document.getElementById("statSeen");
    const heartsEl = document.getElementById("statHearts");

    if(seenEl) seenEl.textContent = `${seen}/${total}`;
    if(heartsEl) heartsEl.textContent = hearts;

    // Update Dock Button States
    const heartBtn = document.getElementById("heartModeBtn");
    const heartIcon = document.getElementById("heartModeIcon");
    if(heartBtn && heartIcon){
        if(heartMode){
            heartBtn.classList.add("heart-active");
            heartIcon.textContent = "❤️";
        } else {
            heartBtn.classList.remove("heart-active");
            heartIcon.textContent = "♡";
        }
    }

    const swipeBtn = document.getElementById("swipeModeBtn");
    if(swipeBtn){
        swipeBtn.style.color = swipeMode ? "#c084fc" : "#ccc";
    }
}

function showWelcome(){
    if(!localStorage.getItem(STORAGE.visited)){
        const banner = document.getElementById("welcomeBanner");
        if(banner){
            banner.style.display = "block";
            setTimeout(() => { banner.style.display = "none"; }, 5000);
        }
        localStorage.setItem(STORAGE.visited, "true");
    }
}

/* ==========================================================
    MEDIA UTILS
========================================================== */
function isImage(url){
    return /\.(jpeg|jpg|png|gif|webp|heic|avif|bmp)$/i.test(url) || url.includes("pbs.twimg.com");
}

function isVideo(url){
    return /\.(mp4|webm|mov|m4v)$/i.test(url) || url.includes("video.twimg.com");
}

function normalizeImageURL(url){
    let src = url;
    if(src.includes("imgur.com/") && !src.includes("i.imgur.com")){
        src = src.replace("imgur.com/", "i.imgur.com/") + ".jpg";
    }
    return src;
}

function preloadUpcoming(){
    for(let i = currentIndex; i < Math.min(currentIndex + 3, workingList.length); i++){
        const item = workingList[i];
        if(item && isImage(item.url)){
            const img = new Image();
            img.src = normalizeImageURL(item.url);
        }
    }
}

function snapToTop(){
    const activeWrapper = document.querySelector(".media-container");
    if(activeWrapper){
        const topPos = activeWrapper.getBoundingClientRect().top + window.pageYOffset - 50;
        window.scrollTo({ top: Math.max(0, topPos), behavior: "smooth" });
    } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}

function shuffleArray(array){
    for(let i = array.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/* ==========================================================
    SEARCH
========================================================== */
function applySearch(){
    workingList = buildDisplayList();
    currentIndex = 0;
    render();
    snapToTop();
}

document.getElementById("searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applySearch, SEARCH_DELAY);
});

function buildDisplayList(){
    let list = [...mediaUrls];
    const query = document.getElementById("searchInput").value.toLowerCase().trim();

    if(query){
        const number = query.replace("#","");
        list = list.filter(item => item.url.toLowerCase().includes(query) || item.index.toString() === number);
    } else if(heartMode){
        list = list.filter(item => heartedItems.has(item.index));
    } else {
        list = list.filter(item => !seenItems.has(item.index));
    }
    return list;
}

/* ==========================================================
    HEARTS & INTERACTIONS
========================================================== */
function toggleHeart(index){
    if(heartedItems.has(index)) heartedItems.delete(index);
    else heartedItems.add(index);

    updateStats();

    document.querySelectorAll(`.heart-toggle-${index}`).forEach(el => {
        el.textContent = heartedItems.has(index) ? "❤️" : "♡";
    });

    if(heartMode && !heartedItems.has(index)) applySearch();
}

function handleDoubleTap(itemIndex, wrapperElement) {
    toggleHeart(itemIndex);
    const existing = wrapperElement.querySelector(".floating-heart");
    if(existing) existing.remove();

    const pop = document.createElement("div");
    pop.className = "floating-heart";
    pop.textContent = "❤️";
    wrapperElement.appendChild(pop);
    setTimeout(() => pop.remove(), 500);
}

function showHeartedOnly(){
    heartMode = !heartMode;
    saveSettings();
    workingList = buildDisplayList();
    shuffleArray(workingList);
    currentIndex = 0;
    render();
    snapToTop();
}

function toggleSwipeMode(){
    swipeMode = !swipeMode;
    saveSettings();
    currentIndex = 0;
    render();
    snapToTop();
}

/* ==========================================================
    HISTORY DRAWER
========================================================== */
function addToHistory(item){
    recentHistory = recentHistory.filter(i => i.index !== item.index);
    recentHistory.unshift(item);
    if(recentHistory.length > 25) recentHistory.pop();
}

function toggleHistoryModal(){
    const modal = document.getElementById("historyModal");
    modal.classList.toggle("hidden");
    if(!modal.classList.contains("hidden")) renderHistory();
}

function renderHistory(){
    const container = document.getElementById("historyListContainer");
    if(recentHistory.length === 0){
        container.innerHTML = '<p style="color:#555; text-align:center;">No history yet</p>';
        return;
    }
    container.innerHTML = recentHistory.map(item => `
        <div class="history-item" onclick="jumpToHistory(${item.index})">
            <div style="font-weight:bold; margin-right:12px; min-width:45px; color:#aaa;">#${item.index}</div>
            <div style="font-size:11px; color:#666; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.url}</div>
            <div>${heartedItems.has(item.index) ? "❤️" : ""}</div>
        </div>
    `).join("");
}

function jumpToHistory(index){
    toggleHistoryModal();
    const found = workingList.findIndex(i => i.index === index);
    if(found !== -1) currentIndex = found;
    else {
        const item = mediaUrls.find(i => i.index === index);
        if(item) { workingList.unshift(item); currentIndex = 0; }
    }
    render();
    snapToTop();
}

/* ==========================================================
    RENDER
========================================================== */
function render(){
    updateStats();
    preloadUpcoming();

    const container = document.getElementById("mediaContainer");
    container.innerHTML = "";
    document.getElementById("status").textContent = "";

    const pageSize = swipeMode ? 1 : 12;
    let shown = 0;
    let lastTap = 0;

    while(shown < pageSize && currentIndex < workingList.length){
        const item = workingList[currentIndex];
        currentIndex++;
        addToHistory(item);

        const wrapper = document.createElement("div");
        wrapper.className = "media-container";

        const numEl = document.createElement("div");
        numEl.className = "media-number";
        numEl.innerHTML = `#${item.index} ${(!heartMode && seenItems.has(item.index)) ? '<span class="seen-badge">Seen</span>' : ''}`;
        wrapper.appendChild(numEl);

        const link = document.createElement("a");
        link.href = item.url;
        link.target = "_blank";
        link.textContent = item.url;
        wrapper.appendChild(link);

        let media;
        if(isVideo(item.url)){
            media = document.createElement("video");
            media.src = item.url;
            media.controls = true;
            media.playsInline = true;
        } else if(isImage(item.url)){
            media = document.createElement("img");
            media.src = normalizeImageURL(item.url);
            media.loading = "eager";
        }

        if(media){
            media.addEventListener("click", () => {
                const now = Date.now();
                if(now - lastTap < 300) handleDoubleTap(item.index, wrapper);
                lastTap = now;
            });
            wrapper.appendChild(media);
        }

        // Swipe mode instant seen tracking
        if(swipeMode && !heartMode && !seenItems.has(item.index)){
            seenItems.add(item.index);
            updateStats();
        }

        // Swipe gestures
        if(swipeMode){
            let startX = 0;
            wrapper.addEventListener("touchstart", e => { startX = e.touches[0].clientX; }, {passive:true});
            wrapper.addEventListener("touchend", e => {
                const diff = e.changedTouches[0].clientX - startX;
                if(Math.abs(diff) > 60){
                    if(diff < 0) nextRandomPage();
                    else toggleHeart(item.index);
                }
            }, {passive:true});
        }

        container.appendChild(wrapper);
        shown++;
    }
}

function nextRandomPage(){
    snapToTop();
    if(heartMode){
        if(currentIndex >= workingList.length){
            shuffleArray(workingList);
            currentIndex = 0;
        }
    } else {
        workingList = buildDisplayList();
        shuffleArray(workingList);
        currentIndex = 0;
        if(workingList.length === 0){
            seenItems.clear();
            workingList = buildDisplayList();
            shuffleArray(workingList);
        }
    }
    render();
}

/* ==========================================================
    INITIALIZE
========================================================== */
async function initializeApp(){
    try {
        const res = await fetch("mediaNEW.json?t=" + Date.now());
        if(!res.ok) throw new Error("Failed to load mediaNEW.json");
        const data = await res.json();

        mediaUrls = data.map((url, i) => ({ url, index: i + 1 }));
        await loadServerData();
        showWelcome();

        workingList = buildDisplayList();
        shuffleArray(workingList);
        currentIndex = 0;
        render();
    } catch(e) {
        document.getElementById("status").textContent = "Error: " + e.message;
    }
}
