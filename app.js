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
    hearts: "mediaViewerHearts",
    seen: "mediaViewerSeen"
};

let seenItems = new Set();
let heartedItems = new Set();
let heartMode = localStorage.getItem(STORAGE.heartMode) === "true";
let swipeMode = localStorage.getItem(STORAGE.swipeMode) === "true";

function checkPassword() {
    const password = document.getElementById("passwordInput").value.trim();

    if(password === "12345") {
        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("app").style.display = "block";
        initializeApp();
    } else {
        document.getElementById("loginError").textContent = "Invalid password";
    }
}

document.getElementById("loginButton").addEventListener("click", checkPassword);

document.getElementById("passwordInput").addEventListener("keydown", event => {
    if(event.key === "Enter") {
        checkPassword();
    }
});

async function loadData() {
    const response = await fetch("/load-data");

    if(!response.ok) {
        throw new Error("Could not load saved data");
    }

    const data = await response.json();

    if(!Array.isArray(data.hearts)) {
        throw new Error("Invalid hearts data");
    }

    if(!Array.isArray(data.seen)) {
        throw new Error("Invalid seen data");
    }

    heartedItems = new Set(data.hearts);
    seenItems = new Set(data.seen);

    saveLocalData();
}

async function saveData() {
    const status = document.getElementById("status");

    if(status) {
        status.style.color = "#00AAFF";
        status.textContent = "💾 Saving...";
    }

    try {
        const heartsResponse = await fetch("/save-hearts", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify([...heartedItems])
        });

        if(!heartsResponse.ok) {
            throw new Error("Could not save hearts");
        }

        const seenResponse = await fetch("/save-seen", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify([...seenItems])
        });

        if(!seenResponse.ok) {
            throw new Error("Could not save seen media");
        }

        saveLocalData();

        if(status) {
            status.style.color = "#2ecc71";
            status.textContent = "✅ Saved successfully";

            setTimeout(() => {
                if(status.textContent === "✅ Saved successfully") {
                    status.textContent = "";
                }
            }, 2500);
        }

        return true;
    } catch(error) {
        console.error("Save failed:", error);

        if(status) {
            status.style.color = "#ff6666";
            status.textContent = "❌ Save failed: " + error.message;
        }

        return false;
    }
}

function saveLocalData() {
    localStorage.setItem(
        STORAGE.hearts,
        JSON.stringify([...heartedItems])
    );

    localStorage.setItem(
        STORAGE.seen,
        JSON.stringify([...seenItems])
    );
}

function loadLocalBackup() {
    try {
        const hearts = JSON.parse(
            localStorage.getItem(STORAGE.hearts) || "[]"
        );

        const seen = JSON.parse(
            localStorage.getItem(STORAGE.seen) || "[]"
        );

        if(Array.isArray(hearts)) {
            heartedItems = new Set(hearts);
        }

        if(Array.isArray(seen)) {
            seenItems = new Set(seen);
        }
    } catch(error) {
        console.error("Could not load local backup:", error);
    }
}

async function manualSave() {
    await saveData();
}

function saveSettings() {
    localStorage.setItem(
        STORAGE.heartMode,
        heartMode.toString()
    );

    localStorage.setItem(
        STORAGE.swipeMode,
        swipeMode.toString()
    );
}

function updateStatsDashboard() {
    const total = mediaUrls.length;
    const seen = seenItems.size;
    const hearts = heartedItems.size;
    const remaining = Math.max(0, total - seen);
    const percentage = total > 0
        ? Math.round((seen / total) * 100)
        : 0;

    const progress = document.getElementById("statProgress");
    const seenElement = document.getElementById("statSeen");
    const heartsElement = document.getElementById("statHearts");
    const remainingElement = document.getElementById("statRemaining");

    if(progress) {
        progress.textContent = percentage + "%";
    }

    if(seenElement) {
        seenElement.textContent = `${seen} / ${total}`;
    }

    if(heartsElement) {
        heartsElement.textContent = hearts;
    }

    if(remainingElement) {
        remainingElement.textContent = remaining;
    }
}

function showWelcome() {
    if(localStorage.getItem(STORAGE.visited)) {
        return;
    }

    const banner = document.getElementById("welcomeBanner");

    if(banner) {
        banner.style.display = "block";

        setTimeout(() => {
            banner.style.display = "none";
        }, 5000);
    }

    localStorage.setItem(STORAGE.visited, "true");
}

function isImage(url) {
    return /\.(jpeg|jpg|png|gif|webp|heic|avif|bmp)$/i.test(url)
        || url.includes("pbs.twimg.com")
        || url.includes("abs.twimg.com");
}

function isVideo(url) {
    return /\.(mp4|webm|mov|m4v)$/i.test(url)
        || url.includes("video.twimg.com");
}

function normalizeImageURL(url) {
    let src = url;

    if(
        src.includes("imgur.com/")
        && !src.includes("i.imgur.com")
    ) {
        src = src.replace("imgur.com/", "i.imgur.com/") + ".jpg";
    }

    return src;
}

function createMediaElement(item) {
    if(isVideo(item.url)) {
        const video = document.createElement("video");

        video.src = item.url;
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";

        return video;
    }

    if(isImage(item.url)) {
        const img = document.createElement("img");

        img.src = normalizeImageURL(item.url);
        img.loading = "lazy";
        img.decoding = "async";

        img.onerror = () => {
            img.style.display = "none";
        };

        return img;
    }

    return null;
}

function snapToTop() {
    window.scrollTo({
        top: 0,
        behavior: "instant"
    });
}

function shuffleArray(array) {
    for(let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [array[i], array[j]] = [
            array[j],
            array[i]
        ];
    }

    return array;
}

function applySearch() {
    workingList = buildDisplayList();
    currentIndex = 0;

    render();
    snapToTop();
}

function debouncedSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(
        applySearch,
        SEARCH_DELAY
    );
}

const searchInput = document.getElementById("searchInput");

if(searchInput) {
    searchInput.addEventListener(
        "input",
        debouncedSearch
    );
}

async function toggleHeart(index) {
    if(heartedItems.has(index)) {
        heartedItems.delete(index);
    } else {
        heartedItems.add(index);
    }

    saveLocalData();
    updateStatsDashboard();

    document.querySelectorAll(".heart-btn").forEach(button => {
        if(Number(button.dataset.index) !== index) {
            return;
        }

        const active = heartedItems.has(index);

        button.textContent = active ? "❤️" : "♡";

        if(active) {
            button.classList.add("active");
        } else {
            button.classList.remove("active");
        }
    });

    if(heartMode && !heartedItems.has(index)) {
        applySearch();
    }
}

function handleDoubleTap(itemIndex, wrapperElement) {
    toggleHeart(itemIndex);

    const existingHeart =
        wrapperElement.querySelector(".floating-heart");

    if(existingHeart) {
        existingHeart.remove();
    }

    const heartPop = document.createElement("div");

    heartPop.className = "floating-heart";
    heartPop.textContent = "❤️";

    wrapperElement.appendChild(heartPop);

    setTimeout(() => {
        heartPop.remove();
    }, 600);
}

function showHeartedOnly() {
    heartMode = !heartMode;

    saveSettings();

    workingList = buildDisplayList();
    shuffleArray(workingList);

    currentIndex = 0;

    render();
    snapToTop();
}

function toggleSwipeMode() {
    swipeMode = !swipeMode;

    saveSettings();

    currentIndex = 0;

    render();
    snapToTop();
}

function addToHistory(item) {
    recentHistory = recentHistory.filter(
        historyItem => historyItem.index !== item.index
    );

    recentHistory.unshift(item);

    if(recentHistory.length > 20) {
        recentHistory.pop();
    }
}

function toggleHistoryModal() {
    const modal = document.getElementById("historyModal");

    if(!modal) {
        return;
    }

    modal.classList.toggle("hidden");

    if(!modal.classList.contains("hidden")) {
        renderHistoryList();
    }
}

function renderHistoryList() {
    const container =
        document.getElementById("historyListContainer");

    if(!container) {
        return;
    }

    if(recentHistory.length === 0) {
        container.innerHTML =
            '<p style="color:#777; text-align:center;">No recent history yet.</p>';

        return;
    }

    container.innerHTML = recentHistory.map(item => `
        <div class="history-item" onclick="jumpToHistoryItem(${item.index})">
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

function jumpToHistoryItem(index) {
    toggleHistoryModal();

    const foundIndex = workingList.findIndex(
        item => item.index === index
    );

    if(foundIndex !== -1) {
        currentIndex = foundIndex;
    } else {
        const item = mediaUrls.find(
            media => media.index === index
        );

        if(item) {
            workingList.unshift(item);
            currentIndex = 0;
        }
    }

    render();
    snapToTop();
}

async function clearAllData() {
    const confirmed = confirm(
        "Clear all hearts and seen media history?"
    );

    if(!confirmed) {
        return;
    }

    heartedItems.clear();
    seenItems.clear();
    recentHistory = [];

    saveLocalData();

    document.querySelectorAll(".heart-btn").forEach(button => {
        button.textContent = "♡";
        button.classList.remove("active");
    });

    updateStatsDashboard();

    workingList = buildDisplayList();
    currentIndex = 0;

    render();

    await saveData();
}

function buildDisplayList() {
    let list = [...mediaUrls];

    const queryElement =
        document.getElementById("searchInput");

    const query = queryElement
        ? queryElement.value.toLowerCase().trim()
        : "";

    if(query) {
        const number = query.replace("#", "");

        list = list.filter(item =>
            item.url.toLowerCase().includes(query)
            || item.index.toString() === number
        );
    } else if(heartMode) {
        list = list.filter(item =>
            heartedItems.has(item.index)
        );
    } else {
        list = list.filter(item =>
            !seenItems.has(item.index)
        );
    }

    return list;
}

function markSeen(index) {
    if(heartMode) {
        return;
    }

    if(seenItems.has(index)) {
        return;
    }

    seenItems.add(index);

    saveLocalData();
    updateStatsDashboard();

    const numberElement =
        document.getElementById(`num-${index}`);

    if(
        numberElement
        && !numberElement.querySelector(".seen-badge")
    ) {
        const badge = document.createElement("span");

        badge.className = "seen-badge";
        badge.style.marginLeft = "6px";
        badge.textContent = "👀 Seen";

        numberElement.appendChild(badge);
    }
}

function setupObserver() {
    if(observer) {
        observer.disconnect();
    }

    if(observerTimeout) {
        clearTimeout(observerTimeout);
    }

    observerTimeout = setTimeout(() => {
        observer = new IntersectionObserver(
            (entries, obs) => {
                entries.forEach(entry => {
                    if(!entry.isIntersecting) {
                        return;
                    }

                    const index =
                        Number(entry.target.dataset.index);

                    if(index) {
                        markSeen(index);
                        obs.unobserve(entry.target);
                    }
                });
            },
            {
                threshold: 0.5
            }
        );

        document
            .querySelectorAll(".media-container")
            .forEach(wrapper => {
                observer.observe(wrapper);
            });
    }, 500);
}

function renderControls() {
    const controls = `
        <button
            class="random-btn"
            onclick="nextRandomPage()"
        >
            🎲 Random
        </button>

        <button
            class="heart-mode-btn"
            onclick="showHeartedOnly()"
        >
            ${heartMode ? "❤️ Hearts" : "♡ Hearts"}
        </button>

        <button
            class="swipe-mode-btn"
            onclick="toggleSwipeMode()"
            style="background:${swipeMode ? "#d35400" : "#2980b9"}"
        >
            ${swipeMode ? "🎴 Swipe: ON" : "🎴 Swipe: OFF"}
        </button>

        <button
            class="history-btn"
            onclick="toggleHistoryModal()"
        >
            🕒 History
        </button>

        <button
            class="backup-btn"
            onclick="manualSave()"
        >
            💾 Save
        </button>
    `;

    const topControls =
        document.getElementById("topControls");

    const bottomControls =
        document.getElementById("bottomControls");

    if(topControls) {
        topControls.innerHTML = controls;
    }

    if(bottomControls) {
        bottomControls.innerHTML = controls;
    }
}

function render() {
    renderControls();
    updateStatsDashboard();

    const container =
        document.getElementById("mediaContainer");

    const status =
        document.getElementById("status");

    if(!container) {
        return;
    }

    container.innerHTML = "";

    if(status) {
        status.textContent = "";
    }

    const pageSize = swipeMode ? 1 : 15;

    let shown = 0;
    let lastTapTime = 0;

    while(
        shown < pageSize
        && currentIndex < workingList.length
    ) {
        const item = workingList[currentIndex];

        currentIndex++;

        addToHistory(item);

        const wrapper =
            document.createElement("div");

        wrapper.className = "media-container";
        wrapper.dataset.index = item.index;

        const number =
            document.createElement("div");

        number.className = "media-number";
        number.id = `num-${item.index}`;
        number.textContent = "#" + item.index;

        if(
            !heartMode
            && seenItems.has(item.index)
        ) {
            number.innerHTML +=
                ' <span class="seen-badge" style="margin-left:6px;">👀 Seen</span>';
        }

        wrapper.appendChild(number);

        const heart =
            document.createElement("button");

        heart.className = "heart-btn";
        heart.dataset.index = item.index;

        const isHearted =
            heartedItems.has(item.index);

        heart.textContent =
            isHearted ? "❤️" : "♡";

        if(isHearted) {
            heart.classList.add("active");
        }

        heart.onclick = () =>
            toggleHeart(item.index);

        wrapper.appendChild(heart);

        const link =
            document.createElement("a");

        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = item.url;

        wrapper.appendChild(link);

        const media =
            createMediaElement(item);

        if(media) {
            media.addEventListener("click", event => {
                const currentTime =
                    Date.now();

                const tapLength =
                    currentTime - lastTapTime;

                if(
                    tapLength < 300
                    && tapLength > 0
                ) {
                    event.preventDefault();

                    handleDoubleTap(
                        item.index,
                        wrapper
                    );
                }

                lastTapTime = currentTime;
            });

            wrapper.appendChild(media);
        }

        if(swipeMode) {
            const swipeActions =
                document.createElement("div");

            swipeActions.className =
                "swipe-actions";

            swipeActions.innerHTML = `
                <button
                    class="swipe-action-btn"
                    style="background:#7f8c8d;"
                    onclick="nextRandomPage()"
                >
                    ⏭️ Skip
                </button>

                <button
                    class="swipe-action-btn"
                    style="background:#e91e63;"
                    onclick="toggleHeart(${item.index})"
                >
                    ${heartedItems.has(item.index)
                        ? "❤️ Unheart"
                        : "❤️ Heart"}
                </button>
            `;

            wrapper.appendChild(swipeActions);

            markSeen(item.index);
        }

        container.appendChild(wrapper);

        shown++;
    }

    if(!swipeMode) {
        setupObserver();
    }
}

function nextRandomPage() {
    snapToTop();

    const status =
        document.getElementById("status");

    if(heartMode) {
        if(currentIndex >= workingList.length) {
            shuffleArray(workingList);
            currentIndex = 0;

            if(status) {
                status.textContent =
                    "❤️ All hearts viewed! Reshuffling hearts.";
            }
        }
    } else {
        workingList = buildDisplayList();

        shuffleArray(workingList);

        currentIndex = 0;

        if(workingList.length === 0) {
            seenItems.clear();

            saveLocalData();

            workingList = buildDisplayList();

            shuffleArray(workingList);

            if(status) {
                status.textContent =
                    "🎉 Cycle complete. Starting again.";
            }
        }
    }

    render();
}

async function initializeApp() {
    try {
        const response =
            await fetch(
                "mediaNEW.json?t=" + Date.now()
            );

        if(!response.ok) {
            throw new Error(
                "Could not load mediaNEW.json"
            );
        }

        const data =
            await response.json();

        if(!Array.isArray(data)) {
            throw new Error(
                "mediaNEW.json must contain an array"
            );
        }

        mediaUrls = data.map((url, index) => ({
            url: url,
            index: index + 1
        }));

        try {
            await loadData();
        } catch(error) {
            console.error(
                "Server data could not be loaded:",
                error
            );

            loadLocalBackup();

            const status =
                document.getElementById("status");

            if(status) {
                status.textContent =
                    "⚠️ Could not load server data. Using local backup.";
            }
        }

        showWelcome();

        workingList = buildDisplayList();

        shuffleArray(workingList);

        currentIndex = 0;

        render();
    } catch(error) {
        console.error(error);

        const status =
            document.getElementById("status");

        if(status) {
            status.textContent =
                "Error: " + error.message;
        }
    }
}
