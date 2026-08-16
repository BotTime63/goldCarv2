/* ==========================================================
   GITHUB CONFIGURATION
========================================================== */
const GITHUB_CONFIG = {
    owner: "BotTime63",
    repo: "goldCarv2",
    branch: "main",
    token: ""
};

/* ==========================================================
   GITHUB TOKEN
========================================================== */
function getGitHubToken(){
    return GITHUB_CONFIG.token.trim();
}

async function verifyGitHubToken(token){
    const res = await fetch("https://api.github.com/user", {
        headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github+json"
        }
    });

    if(!res.ok){
        let message = "GitHub rejected the token.";
        try {
            const data = await res.json();
            if(data.message) message = data.message;
        } catch(e) {}
        throw new Error(message);
    }

    return true;
}

/* ==========================================================
   LOGIN SYSTEM
========================================================== */
async function checkPassword(){
    const input = document.getElementById("passwordInput");
    const errorEl = document.getElementById("loginError");
    const button = document.getElementById("loginButton");

    const token = input.value.trim();

    if(!token.startsWith("ghp_") && !token.startsWith("github_pat_")){
        errorEl.textContent = "Invalid token format.";
        return;
    }

    button.disabled = true;
    button.textContent = "Checking...";
    errorEl.textContent = "";

    try {
        GITHUB_CONFIG.token = token;

        await verifyGitHubToken(token);

        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("app").style.display = "block";

        await initializeApp();
    } catch(error) {
        GITHUB_CONFIG.token = "";
        errorEl.textContent = "GitHub login failed: " + error.message;
        button.disabled = false;
        button.textContent = "Enter";
    }
}

document.getElementById("loginButton").addEventListener("click", checkPassword);

document.getElementById("passwordInput").addEventListener("keydown", event => {
    if(event.key === "Enter"){
        checkPassword();
    }
});

/* ==========================================================
   CONFIGURATION & STATE
========================================================== */
const SEARCH_DELAY = 250;

let mediaUrls = [];
let workingList = [];
let currentIndex = 0;
let searchTimer = null;
let observer = null;
let observerTimeout = null;
let recentHistory = [];

const STORAGE = {
    heartMode: "mediaViewerHeartMode",
    swipeMode: "mediaViewerSwipeMode",
    visited: "mediaViewerVisited",
    heartsLocal: "mediaViewerLocalHearts",
    seenLocal: "mediaViewerLocalSeen"
};

let seenItems = new Set(
    JSON.parse(localStorage.getItem(STORAGE.seenLocal) || "[]")
);

let heartedItems = new Set(
    JSON.parse(localStorage.getItem(STORAGE.heartsLocal) || "[]")
);

let heartMode = localStorage.getItem(STORAGE.heartMode) === "true";
let swipeMode = localStorage.getItem(STORAGE.swipeMode) === "true";

let heartsDirty = false;
let seenDirty = false;
let syncTimeout = null;

/* ==========================================================
   GITHUB API LOAD
========================================================== */
async function fetchGitHubFile(path){
    try {
        const token = getGitHubToken();

        if(!token){
            throw new Error("No GitHub token.");
        }

        const url =
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`;

        const res = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/vnd.github+json"
            }
        });

        if(!res.ok){
            let message = `GitHub returned ${res.status}.`;

            try {
                const data = await res.json();
                if(data.message) message = data.message;
            } catch(e) {}

            throw new Error(message);
        }

        const data = await res.json();

        const cleanBase64 = data.content.replace(/\s/g, "");
        const decoded = decodeURIComponent(
            Array.from(atob(cleanBase64))
                .map(char => "%" + char.charCodeAt(0).toString(16).padStart(2, "0"))
                .join("")
        );

        const content = JSON.parse(decoded);

        return {
            content,
            sha: data.sha
        };
    } catch(error) {
        console.error(`Could not load ${path} from GitHub:`, error);
        return null;
    }
}

/* ==========================================================
   GITHUB API SAVE
========================================================== */
async function saveGitHubFileDirect(path, dataArray, useKeepalive = false){
    const token = getGitHubToken();

    if(!token){
        throw new Error("No GitHub token.");
    }

    const url =
        `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`;

    try {
        const existing = await fetchGitHubFile(path);
        const sha = existing ? existing.sha : undefined;

        const json = JSON.stringify(dataArray, null, 2);

        const contentBase64 = btoa(
            unescape(
                encodeURIComponent(json)
            )
        );

        const body = {
            message: `Update ${path} from Media Viewer`,
            content: contentBase64,
            branch: GITHUB_CONFIG.branch
        };

        if(sha){
            body.sha = sha;
        }

        const options = {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        };

        if(useKeepalive){
            options.keepalive = true;
        }

        const res = await fetch(url, options);

        if(!res.ok){
            let message = `GitHub returned ${res.status}.`;

            try {
                const data = await res.json();
                if(data.message) message = data.message;
            } catch(e) {}

            throw new Error(message);
        }

        console.log(`Successfully saved ${path} to GitHub.`);
        return true;
    } catch(error) {
        console.error(`Failed to save ${path}:`, error);
        throw error;
    }
}

/* ==========================================================
   AUTOMATIC SYNC
========================================================== */
function triggerSync(){
    localStorage.setItem(
        STORAGE.heartsLocal,
        JSON.stringify([...heartedItems])
    );

    localStorage.setItem(
        STORAGE.seenLocal,
        JSON.stringify([...seenItems])
    );

    updateStatsDashboard();

    if(syncTimeout){
        clearTimeout(syncTimeout);
    }

    syncTimeout = setTimeout(async () => {
        try {
            if(heartsDirty){
                await saveGitHubFileDirect(
                    "saved_hearts.json",
                    [...heartedItems]
                );

                heartsDirty = false;
            }

            if(seenDirty){
                await saveGitHubFileDirect(
                    "seen_media.json",
                    [...seenItems]
                );

                seenDirty = false;
            }
        } catch(error) {
            console.error("Automatic GitHub sync failed:", error);
        }
    }, 3000);
}

/* ==========================================================
   FLUSH CHANGES
========================================================== */
function flushChanges(useKeepalive = false){
    if(syncTimeout){
        clearTimeout(syncTimeout);
        syncTimeout = null;
    }

    localStorage.setItem(
        STORAGE.heartsLocal,
        JSON.stringify([...heartedItems])
    );

    localStorage.setItem(
        STORAGE.seenLocal,
        JSON.stringify([...seenItems])
    );

    if(heartsDirty){
        saveGitHubFileDirect(
            "saved_hearts.json",
            [...heartedItems],
            useKeepalive
        ).catch(error => {
            console.error("Failed to flush hearts:", error);
        });

        heartsDirty = false;
    }

    if(seenDirty){
        saveGitHubFileDirect(
            "seen_media.json",
            [...seenItems],
            useKeepalive
        ).catch(error => {
            console.error("Failed to flush seen data:", error);
        });

        seenDirty = false;
    }
}

window.addEventListener("beforeunload", () => {
    flushChanges(true);
});

document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "hidden"){
        flushChanges(true);
    }
});

/* ==========================================================
   MANUAL GITHUB BACKUP
========================================================== */
async function manualBackupToGitHub(){
    const statusEl = document.getElementById("status");

    if(statusEl){
        statusEl.style.color = "#00AAFF";
        statusEl.textContent = "⏳ Saving hearts and seen data to GitHub...";
    }

    localStorage.setItem(
        STORAGE.heartsLocal,
        JSON.stringify([...heartedItems])
    );

    localStorage.setItem(
        STORAGE.seenLocal,
        JSON.stringify([...seenItems])
    );

    try {
        await saveGitHubFileDirect(
            "saved_hearts.json",
            [...heartedItems]
        );

        await saveGitHubFileDirect(
            "seen_media.json",
            [...seenItems]
        );

        heartsDirty = false;
        seenDirty = false;

        if(statusEl){
            statusEl.style.color = "#2ecc71";
            statusEl.textContent = "✅ Successfully saved to GitHub!";
        }

        setTimeout(() => {
            if(statusEl){
                statusEl.textContent = "";
            }
        }, 4000);
    } catch(error) {
        if(statusEl){
            statusEl.style.color = "#ff6666";
            statusEl.textContent = "❌ GitHub save failed: " + error.message;
        }
    }
}

/* ==========================================================
   LOAD GITHUB DATA
========================================================== */
async function loadServerData(){
    const heartsRes = await fetchGitHubFile("saved_hearts.json");

    if(heartsRes && Array.isArray(heartsRes.content)){
        heartedItems = new Set(heartsRes.content);
    }

    const seenRes = await fetchGitHubFile("seen_media.json");

    if(seenRes && Array.isArray(seenRes.content)){
        seenItems = new Set(seenRes.content);
    }

    localStorage.setItem(
        STORAGE.heartsLocal,
        JSON.stringify([...heartedItems])
    );

    localStorage.setItem(
        STORAGE.seenLocal,
        JSON.stringify([...seenItems])
    );

    updateStatsDashboard();
}

/* ==========================================================
   SAVE FLAGS
========================================================== */
function saveHearts(){
    heartsDirty = true;
    triggerSync();
}

function saveSeen(){
    seenDirty = true;
    triggerSync();
}

function saveSettings(){
    localStorage.setItem(
        STORAGE.heartMode,
        heartMode.toString()
    );

    localStorage.setItem(
        STORAGE.swipeMode,
        swipeMode.toString()
    );
}

/* ==========================================================
   STATS DASHBOARD
========================================================== */
function updateStatsDashboard(){
    const total = mediaUrls.length;
    const seen = seenItems.size;
    const hearts = heartedItems.size;
    const remaining = Math.max(0, total - seen);
    const percentage =
        total > 0 ? Math.round((seen / total) * 100) : 0;

    const progEl = document.getElementById("statProgress");
    const seenEl = document.getElementById("statSeen");
    const heartsEl = document.getElementById("statHearts");
    const remEl = document.getElementById("statRemaining");

    if(progEl){
        progEl.textContent = percentage + "%";
    }

    if(seenEl){
        seenEl.textContent = `${seen} / ${total}`;
    }

    if(heartsEl){
        heartsEl.textContent = hearts;
    }

    if(remEl){
        remEl.textContent = remaining;
    }
}

/* ==========================================================
   WELCOME BANNER
========================================================== */
function showWelcome(){
    const visited = localStorage.getItem(STORAGE.visited);

    if(!visited){
        const banner = document.getElementById("welcomeBanner");

        if(banner){
            banner.style.display = "block";

            setTimeout(() => {
                banner.style.display = "none";
            }, 5000);
        }

        localStorage.setItem(STORAGE.visited, "true");
    }
}

/* ==========================================================
   MEDIA DETECTION
========================================================== */
function isImage(url){
    return /\.(jpeg|jpg|png|gif|webp|heic|avif|bmp)$/i.test(url)
        || url.includes("pbs.twimg.com")
        || url.includes("abs.twimg.com");
}

function isVideo(url){
    return /\.(mp4|webm|mov|m4v)$/i.test(url)
        || url.includes("video.twimg.com");
}

function normalizeImageURL(url){
    let src = url;

    if(
        src.includes("imgur.com/")
        && !src.includes("i.imgur.com")
    ){
        src = src.replace(
            "imgur.com/",
            "i.imgur.com/"
        ) + ".jpg";
    }

    return src;
}

function createMediaElement(item){
    let element = null;

    if(isVideo(item.url)){
        const video = document.createElement("video");

        video.src = item.url;
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";

        element = video;
    } else if(isImage(item.url)){
        const img = document.createElement("img");

        img.src = normalizeImageURL(item.url);
        img.loading = "lazy";
        img.decoding = "async";

        img.onerror = () => {
            img.style.display = "none";
        };

        element = img;
    }

    return element;
}

/* ==========================================================
   HELPERS
========================================================== */
function snapToTop(){
    window.scrollTo({
        top: 0,
        behavior: "instant"
    });
}

function shuffleArray(array){
    for(let i = array.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));

        [array[i], array[j]] =
            [array[j], array[i]];
    }

    return array;
}

/* ==========================================================
   SEARCH SYSTEM
========================================================== */
function applySearch(){
    workingList = buildDisplayList();
    currentIndex = 0;

    render();
    snapToTop();
}

function debouncedSearch(){
    clearTimeout(searchTimer);

    searchTimer = setTimeout(
        applySearch,
        SEARCH_DELAY
    );
}

const searchInput =
    document.getElementById("searchInput");

if(searchInput){
    searchInput.addEventListener(
        "input",
        debouncedSearch
    );
}

/* ==========================================================
   HEART SYSTEM
========================================================== */
function toggleHeart(index){
    if(heartedItems.has(index)){
        heartedItems.delete(index);
    } else {
        heartedItems.add(index);
    }

    saveHearts();

    document.querySelectorAll(".heart-btn").forEach(btn => {
        if(Number(btn.dataset.index) === index){
            const active =
                heartedItems.has(index);

            btn.textContent =
                active ? "❤️" : "♡";

            if(active){
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        }
    });

    updateStatsDashboard();

    if(
        heartMode
        && !heartedItems.has(index)
    ){
        applySearch();
    }
}

function handleDoubleTap(
    itemIndex,
    wrapperElement
){
    toggleHeart(itemIndex);

    const existingHeart =
        wrapperElement.querySelector(
            ".floating-heart"
        );

    if(existingHeart){
        existingHeart.remove();
    }

    const heartPop =
        document.createElement("div");

    heartPop.className = "floating-heart";
    heartPop.textContent = "❤️";

    wrapperElement.appendChild(heartPop);

    setTimeout(() => {
        heartPop.remove();
    }, 600);
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
   RECENTLY VIEWED HISTORY
========================================================== */
function addToHistory(item){
    recentHistory =
        recentHistory.filter(
            i => i.index !== item.index
        );

    recentHistory.unshift(item);

    if(recentHistory.length > 20){
        recentHistory.pop();
    }
}

function toggleHistoryModal(){
    const modal =
        document.getElementById(
            "historyModal"
        );

    if(!modal) return;

    modal.classList.toggle("hidden");

    if(!modal.classList.contains("hidden")){
        renderHistoryList();
    }
}

function renderHistoryList(){
    const container =
        document.getElementById(
            "historyListContainer"
        );

    if(!container) return;

    if(recentHistory.length === 0){
        container.innerHTML =
            '<p style="color:#777; text-align:center;">No recent history yet.</p>';

        return;
    }

    container.innerHTML =
        recentHistory.map(item => `
            <div class="history-item"
                 onclick="jumpToHistoryItem(${item.index})">

                <div style="font-size:16px; margin-right:10px;">
                    #${item.index}
                </div>

                <div style="font-size:12px; color:#aaa; word-break:break-all; flex:1;">
                    ${item.url}
                </div>

                <div style="font-size:16px; margin-left:10px;">
                    ${heartedItems.has(item.index) ? "❤️" : ""}
                </div>
            </div>
        `).join("");
}

function jumpToHistoryItem(index){
    toggleHistoryModal();

    const foundIndex =
        workingList.findIndex(
            item => item.index === index
        );

    if(foundIndex !== -1){
        currentIndex = foundIndex;
    } else {
        const item =
            mediaUrls.find(
                i => i.index === index
            );

        if(item){
            workingList.unshift(item);
            currentIndex = 0;
        }
    }

    render();
    snapToTop();
}

/* ==========================================================
   CLEAR DATA
========================================================== */
function clearHearts(){
    if(!confirm(
        "Clear all hearts and seen media history?"
    )){
        return;
    }

    heartedItems.clear();
    seenItems.clear();
    recentHistory = [];

    saveHearts();
    saveSeen();

    document.querySelectorAll(".heart-btn")
        .forEach(btn => {
            btn.textContent = "♡";
            btn.classList.remove("active");
        });

    applySearch();
}

function clearAllData(){
    clearHearts();
}

/* ==========================================================
   BUILD DISPLAY LIST
========================================================== */
function buildDisplayList(){
    let list = [...mediaUrls];

    const queryElement =
        document.getElementById(
            "searchInput"
        );

    const query =
        queryElement
            ? queryElement.value.toLowerCase().trim()
            : "";

    if(query){
        const number =
            query.replace("#", "");

        list = list.filter(item =>
            item.url.toLowerCase().includes(query)
            || item.index.toString() === number
        );
    } else if(heartMode){
        list = list.filter(
            item => heartedItems.has(item.index)
        );
    } else {
        list = list.filter(
            item => !seenItems.has(item.index)
        );
    }

    return list;
}

/* ==========================================================
   TRACK SEEN MEDIA
========================================================== */
function setupObserver(){
    if(observer){
        observer.disconnect();
    }

    if(observerTimeout){
        clearTimeout(observerTimeout);
    }

    observerTimeout = setTimeout(() => {
        observer = new IntersectionObserver(
            (entries, obs) => {
                entries.forEach(entry => {
                    if(entry.isIntersecting){
                        const index =
                            Number(
                                entry.target.dataset.index
                            );

                        if(
                            index
                            && !heartMode
                            && !seenItems.has(index)
                        ){
                            seenItems.add(index);

                            saveSeen();

                            const numberEl =
                                document.getElementById(
                                    `num-${index}`
                                );

                            if(
                                numberEl
                                && !numberEl.querySelector(
                                    ".seen-badge"
                                )
                            ){
                                const badge =
                                    document.createElement(
                                        "span"
                                    );

                                badge.className =
                                    "seen-badge";

                                badge.style.marginLeft =
                                    "6px";

                                badge.textContent =
                                    "👀 Seen";

                                numberEl.appendChild(
                                    badge
                                );
                            }

                            obs.unobserve(
                                entry.target
                            );
                        }
                    }
                });
            },
            {
                threshold: 0.5
            }
        );

        document
            .querySelectorAll(
                ".media-container"
            )
            .forEach(wrapper => {
                observer.observe(wrapper);
            });
    }, 1500);
}

/* ==========================================================
   RENDER CONTROLS
========================================================== */
function renderControls(){
    const html = `
        <button
            class="random-btn"
            onclick="nextRandomPage()">
            🎲 Random
        </button>

        <button
            class="heart-mode-btn"
            onclick="showHeartedOnly()">
            ${heartMode ? "❤️ Hearts" : "♡ Hearts"}
        </button>

        <button
            class="swipe-mode-btn"
            onclick="toggleSwipeMode()"
            style="background:${swipeMode ? "#d35400" : "#2980b9"}">
            ${swipeMode ? "🎴 Swipe: ON" : "🎴 Swipe: OFF"}
        </button>

        <button
            class="history-btn"
            onclick="toggleHistoryModal()">
            🕒 History
        </button>

        <button
            class="backup-btn"
            onclick="manualBackupToGitHub()"
            style="background:#27ae60; color:white;">
            💾 Backup
        </button>
    `;

    const topCtrl =
        document.getElementById(
            "topControls"
        );

    const botCtrl =
        document.getElementById(
            "bottomControls"
        );

    if(topCtrl){
        topCtrl.innerHTML = html;
    }

    if(botCtrl){
        botCtrl.innerHTML = html;
    }
}

/* ==========================================================
   RENDER SYSTEM
========================================================== */
function render(){
    renderControls();
    updateStatsDashboard();

    const container =
        document.getElementById(
            "mediaContainer"
        );

    const statusEl =
        document.getElementById(
            "status"
        );

    if(!container) return;

    container.innerHTML = "";

    if(statusEl){
        statusEl.textContent = "";
    }

    const pageSize =
        swipeMode ? 1 : 15;

    let shown = 0;
    let lastTapTime = 0;

    while(
        shown < pageSize
        && currentIndex < workingList.length
    ){
        const item =
            workingList[currentIndex];

        currentIndex++;

        addToHistory(item);

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "media-container";

        wrapper.dataset.index =
            item.index;

        const number =
            document.createElement("div");

        number.className =
            "media-number";

        number.id =
            `num-${item.index}`;

        number.textContent =
            "#" + item.index;

        if(
            !heartMode
            && seenItems.has(item.index)
        ){
            number.innerHTML +=
                ' <span class="seen-badge" style="margin-left:6px;">👀 Seen</span>';
        }

        wrapper.appendChild(number);

        const heart =
            document.createElement("button");

        heart.className =
            "heart-btn";

        heart.dataset.index =
            item.index;

        const isHearted =
            heartedItems.has(item.index);

        heart.textContent =
            isHearted ? "❤️" : "♡";

        if(isHearted){
            heart.classList.add("active");
        }

        heart.onclick =
            () => toggleHeart(item.index);

        wrapper.appendChild(heart);

        const link =
            document.createElement("a");

        link.href =
            item.url;

        link.target =
            "_blank";

        link.textContent =
            item.url;

        wrapper.appendChild(link);

        const media =
            createMediaElement(item);

        if(media){
            media.addEventListener(
                "click",
                e => {
                    const currentTime =
                        new Date().getTime();

                    const tapLength =
                        currentTime -
                        lastTapTime;

                    if(
                        tapLength < 300
                        && tapLength > 0
                    ){
                        e.preventDefault();

                        handleDoubleTap(
                            item.index,
                            wrapper
                        );
                    }

                    lastTapTime =
                        currentTime;
                }
            );

            wrapper.appendChild(media);
        }

        if(swipeMode){
            const swipeActions =
                document.createElement(
                    "div"
                );

            swipeActions.className =
                "swipe-actions";

            swipeActions.innerHTML = `
                <button
                    class="swipe-action-btn"
                    style="background:#7f8c8d;"
                    onclick="nextRandomPage()">
                    ⏭️ Skip
                </button>

                <button
                    class="swipe-action-btn"
                    style="background:#e91e63;"
                    onclick="toggleHeart(${item.index})">
                    ${heartedItems.has(item.index)
                        ? "❤️ Unheart"
                        : "❤️ Heart"}
                </button>
            `;

            wrapper.appendChild(
                swipeActions
            );

            if(
                !heartMode
                && !seenItems.has(item.index)
            ){
                seenItems.add(item.index);
                saveSeen();
            }
        }

        container.appendChild(wrapper);

        shown++;
    }

    if(!swipeMode){
        setupObserver();
    }
}

/* ==========================================================
   RANDOM PAGE SYSTEM
========================================================== */
function nextRandomPage(){
    snapToTop();

    const statusEl =
        document.getElementById(
            "status"
        );

    if(heartMode){
        if(
            currentIndex >=
            workingList.length
        ){
            shuffleArray(
                workingList
            );

            currentIndex = 0;

            if(statusEl){
                statusEl.textContent =
                    "❤️ All hearts viewed! Reshuffling hearts.";
            }
        }
    } else {
        workingList =
            buildDisplayList();

        shuffleArray(
            workingList
        );

        currentIndex = 0;

        if(workingList.length === 0){
            seenItems.clear();

            saveSeen();

            workingList =
                buildDisplayList();

            shuffleArray(
                workingList
            );

            if(statusEl){
                statusEl.textContent =
                    "🎉 Cycle complete. Starting again.";
            }
        }
    }

    render();
}

/* ==========================================================
   START APPLICATION
========================================================== */
async function initializeApp(){
    try {
        const response =
            await fetch(
                "mediaNEW.json?t=" +
                new Date().getTime()
            );

        if(!response.ok){
            throw new Error(
                "Could not load mediaNEW.json"
            );
        }

        const data =
            await response.json();

        mediaUrls =
            data.map(
                (url, index) => ({
                    url: url,
                    index: index + 1
                })
            );

        await loadServerData();

        showWelcome();

        workingList =
            buildDisplayList();

        shuffleArray(
            workingList
        );

        currentIndex = 0;

        render();
    } catch(error) {
        const statusEl =
            document.getElementById(
                "status"
            );

        if(statusEl){
            statusEl.style.color =
                "#ff6666";

            statusEl.textContent =
                "Error: " +
                error.message;
        }
    }
}
