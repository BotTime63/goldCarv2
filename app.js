/* ==========================================================
   APP.JS - Night Edition V8 (Smart iPhone 11 / Right-Hand UI)
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
let observer = null;
let observerTimeout = null;

const STORAGE = {
    heartMode: "mediaViewerHeartMode",
    swipeMode: "mediaViewerSwipeMode",
    visited: "mediaViewerVisited"
};

let seenItems = new Set();
let heartedItems = new Set();
let heartMode = localStorage.getItem(STORAGE.heartMode) === "true";
let swipeMode = localStorage.getItem(STORAGE.swipeMode) === "true";

// Auto Play State
let autoPlayActive = false;
let autoPlayTimer = null;
let autoPlayInterval = 2500;

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

/* ==========================================================
   SETTINGS & CLEAR DATA FUNCTIONALITY
========================================================== */
function toggleSettingsModal() {
    const modal = document.getElementById("settingsModal");
    modal.classList.toggle("hidden");
}

async function confirmClearData() {
    if(confirm("Are you sure you want to reset seen_media.json and saved_hearts.json?")) {
        seenItems.clear();
        heartedItems.clear();
        updateStats();
        toggleSettingsModal();
        await manualSyncToGitHub();
        applySearch();
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

    const autoIcon = document.getElementById("autoPlayIcon");
    const autoText = document.getElementById("autoPlayText");
    if(autoIcon && autoText){
        autoIcon.textContent = autoPlayActive ? "⏸️" : "▶️";
        autoText.textContent = autoPlayActive ? "Stop" : "Auto";
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
   MEDIA UTILS & CAMERA ROLL DOWNLOAD
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

async function saveToCameraRoll(url, index) {
    const statusEl = document.getElementById("status");
    statusEl.style.color = "#38bdf8";
    statusEl.textContent = `📥 Saving media #${index}...`;

    try {
        const absoluteUrl = normalizeImageURL(url);
        const response = await fetch(absoluteUrl, { mode: 'cors' });
        const blob = await response.blob();
        const fileExtension = isVideo(url) ? 'mp4' : 'jpg';
        const blobUrl = URL.createObjectURL(blob);
        
        // Single-tap direct download action trigger
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `media_${index}.${fileExtension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        statusEl.style.color = "#10b981";
        statusEl.textContent = `✅ Saved media #${index}!`;
        setTimeout(() => { statusEl.textContent = ""; }, 3000);
    } catch (err) {
        // Fallback open if CORS restrictions apply
        window.open(normalizeImageURL(url), '_blank');
        statusEl.textContent = "";
    }
}

function preloadUpcoming(){
    for(let i = currentIndex; i < Math.min(currentIndex + 8, workingList.length); i++){
        const item = workingList[i];
        if(item && isImage(item.url)){
            const img = new Image();
            img.src = normalizeImageURL(item.url);
        }
    }
}

function snapToTop(){
    if(swipeMode){
        const activeWrapper = document.querySelector(".media-container");
        if(activeWrapper){
            const topPos = activeWrapper.getBoundingClientRect().top + window.pageYOffset - 12;
            window.scrollTo({ top: Math.max(0, topPos), behavior: "smooth" });
        } else {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    } else {
        window.scrollTo({ top: 0, behavior: "instant" });
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
   AUTO PLAY SYSTEM
========================================================== */
function toggleAutoPlay(){
    autoPlayActive = !autoPlayActive;
    if(autoPlayActive){
        if(!swipeMode){
            swipeMode = true;
            saveSettings();
            currentIndex = 0;
            render();
        }
        startAutoPlay();
    } else {
        stopAutoPlay();
    }
    updateStats();
}

function startAutoPlay(){
    stopAutoPlay();
    autoPlayTimer = setInterval(() => {
        nextRandomPage();
    }, autoPlayInterval);
}

function stopAutoPlay(){
    if(autoPlayTimer) clearInterval(autoPlayTimer);
    autoPlayTimer = null;
}

function changeAutoPlaySpeed(val){
    autoPlayInterval = Number(val);
    if(autoPlayActive) startAutoPlay();
}

/* ==========================================================
   HEARTS & INTERACTIONS
========================================================== */
function toggleHeart(index, autoAdvance = false){
    const isHearted = heartedItems.has(index);
    if(isHearted) heartedItems.delete(index);
    else heartedItems.add(index);

    updateStats();

    document.querySelectorAll(".heart-btn").forEach(btn => {
        if(Number(btn.dataset.index) === index){
            const active = heartedItems.has(index);
            btn.textContent = active ? "❤️" : "♡";
            if(active) btn.classList.add("active");
            else btn.classList.remove("active");
        }
    });

    if(heartMode && !heartedItems.has(index)) applySearch();
    if(autoAdvance && swipeMode) {
        setTimeout(nextRandomPage, 150);
    }
}

function handleDoubleTap(itemIndex, wrapperElement) {
    toggleHeart(itemIndex, true);
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
    if(autoPlayActive && !swipeMode) toggleAutoPlay();
    currentIndex = 0;
    render();
    snapToTop();
}

/* ==========================================================
   SWIPE GESTURE CONTROLS (Swipe Right = Heart + Next, Swipe Left = Skip)
========================================================== */
function attachSwipeGestures(wrapperElement, itemIndex) {
    let startX = 0;
    let startY = 0;
    let distX = 0;
    let distY = 0;
    const threshold = 70; // minimum distance for swipe

    wrapperElement.addEventListener("touchstart", (e) => {
        if (!swipeMode) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    wrapperElement.addEventListener("touchmove", (e) => {
        if (!swipeMode) return;
        distX = e.touches[0].clientX - startX;
        distY = e.touches[0].clientY - startY;
        
        // If swiping horizontally more than vertically, provide slight smooth feedback
        if (Math.abs(distX) > Math.abs(distY) && Math.abs(distX) < 150) {
            wrapperElement.style.transform = `translateX(${distX * 0.4}px) rotate(${distX * 0.03}deg)`;
        }
    }, { passive: true });

    wrapperElement.addEventListener("touchend", () => {
        if (!swipeMode) return;
        wrapperElement.style.transform = "";

        if (Math.abs(distX) > threshold && Math.abs(distX) > Math.abs(distY)) {
            if (distX > 0) {
                // Swipe RIGHT -> Heart & Advance
                if (!heartedItems.has(itemIndex)) {
                    toggleHeart(itemIndex, false);
                }
                nextRandomPage();
            } else {
                // Swipe LEFT -> Skip without heart
                nextRandomPage();
            }
        }
        distX = 0;
        distY = 0;
    }, { passive: true });
}

/* ==========================================================
   HISTORY DRAWER WITH THUMBNAILS
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
    container.innerHTML = recentHistory.map(item => {
        const thumb = normalizeImageURL(item.url);
        const hasImg = isImage(item.url);
        return `
            <div class="history-item" onclick="jumpToHistory(${item.index})">
                ${hasImg ? `<img src="${thumb}" style="width:40px; height:40px; object-fit:cover; border-radius:6px; margin-right:12px; background:#000;" onerror="this.style.display='none'">` : `<div style="width:40px; height:40px; background:#222; border-radius:6px; margin-right:12px; display:flex; align-items:center; justify-content:center; font-size:16px;">🎬</div>`}
                <div style="font-weight:bold; margin-right:12px; min-width:45px; color:#aaa;">#${item.index}</div>
                <div style="font-size:11px; color:#666; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.url}</div>
                <div>${heartedItems.has(item.index) ? "❤️" : ""}</div>
            </div>
        `;
    }).join("");
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
   INTERSECTION OBSERVER (SEEN BADGE POP)
========================================================== */
function setupObserver(){
    if(observer) observer.disconnect();
    if(observerTimeout) clearTimeout(observerTimeout);

    observerTimeout = setTimeout(() => {
        observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if(entry.isIntersecting){
                    const index = Number(entry.target.dataset.index);
                    if(index && !heartMode && !seenItems.has(index)){
                        seenItems.add(index);
                        updateStats();

                        const numberEl = document.getElementById(`num-${index}`);
                        if(numberEl && !numberEl.querySelector(".seen-badge")) {
                            const badge = document.createElement("span");
                            badge.className = "seen-badge";
                            badge.textContent = "👀 Seen";
                            numberEl.appendChild(badge);
                        }
                        obs.unobserve(entry.target);
                    }
                }
            });
        }, { threshold: 0.5 });

        document.querySelectorAll(".media-container").forEach(wrapper => {
            observer.observe(wrapper);
        });
    }, 1000);
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
        shown++;
        addToHistory(item);

        const wrapper = document.createElement("div");
        wrapper.className = "media-container";
        wrapper.dataset.index = item.index;

        if (swipeMode) {
            attachSwipeGestures(wrapper, item.index);
        }

        const numEl = document.createElement("div");
        numEl.className = "media-number";
        numEl.id = `num-${item.index}`;
        numEl.textContent = `#${item.index}`;

        if(!heartMode && seenItems.has(item.index)){
            const badge = document.createElement("span");
            badge.className = "seen-badge";
            badge.textContent = "👀 Seen";
            numEl.appendChild(badge);
        }
        wrapper.appendChild(numEl);

        // Actions Row (Heart + Camera Roll Save Button)
        const actionsRow = document.createElement("div");
        actionsRow.className = "media-actions-row";

        const heartBtn = document.createElement("button");
        heartBtn.className = `heart-btn ${heartedItems.has(item.index) ? 'active' : ''}`;
        heartBtn.dataset.index = item.index;
        heartBtn.textContent = heartedItems.has(item.index) ? "❤️" : "♡";
        heartBtn.onclick = () => toggleHeart(item.index, swipeMode);
        actionsRow.appendChild(heartBtn);

        const saveBtn = document.createElement("button");
        saveBtn.className = "save-camera-btn";
        saveBtn.innerHTML = "📥 Save to Photos";
        saveBtn.onclick = () => saveToCameraRoll(item.url, item.index);
        actionsRow.appendChild(saveBtn);

        wrapper.appendChild(actionsRow);

        const link = document.createElement("a");
        link.href = item.url;
        link.target = "_blank";
        link.textContent = item.url;
        wrapper.appendChild(link);

        const innerWrapper = document.createElement("div");
        innerWrapper.className = "media-wrapper-inner";

        let media;
        if(isVideo(item.url)){
            media = document.createElement("video");
            media.src = item.url;
            media.controls = true;
            media.playsInline = true;
            media.preload = "auto";
        } else if(isImage(item.url)){
            media = document.createElement("img");
            media.src = normalizeImageURL(item.url);
            media.loading = "eager";
            media.decoding = "async";
            media.setAttribute("fetchpriority", "high");
        }

        if(media){
            media.addEventListener("click", () => {
                const now = Date.now();
                if(now - lastTap < 300) handleDoubleTap(item.index, wrapper);
                lastTap = now;
            });
            innerWrapper.appendChild(media);
        }
        wrapper.appendChild(innerWrapper);
        container.appendChild(wrapper);
    }

    if(currentIndex >= workingList.length && workingList.length > 0){
        currentIndex = 0; // Loop list cleanly
    }

    setupObserver();
}

function nextRandomPage(){
    render();
    snapToTop();
}

function initializeApp(){
    fetchGitHubFile("media_urls.json").then(res => {
        if(res && Array.isArray(res.content)){
            mediaUrls = res.content.map((url, idx) => ({ index: idx + 1, url }));
            loadServerData().then(() => {
                workingList = buildDisplayList();
                if(!heartMode) shuffleArray(workingList);
                render();
                showWelcome();
            });
        } else {
            document.getElementById("status").textContent = "❌ Failed to load media_urls.json from GitHub repository.";
        }
    });
}
