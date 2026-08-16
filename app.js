/* ==========================================================
   APP.JS - Media Viewer V4.4
   Mobile UI + Swipe Preloading + Thumbnail History
========================================================== */

const GITHUB_CONFIG = {
    owner: "bottime63",
    repo: "goldCarv2",
    token: localStorage.getItem("mediaViewerToken") || "",
    branch: "main"
};

const SEARCH_DELAY = 250;
const HISTORY_LIMIT = 20;

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
    visited: "mediaViewerVisited"
};

let seenItems = new Set();
let heartedItems = new Set();

let heartMode =
    localStorage.getItem(STORAGE.heartMode) === "true";

let swipeMode =
    localStorage.getItem(STORAGE.swipeMode) === "true";


/* ==========================================================
   AUTO PLAY STATE
========================================================== */

let autoPlayActive = false;
let autoPlayTimer = null;
let autoPlayInterval = 5000;


/* ==========================================================
   MEDIA PRELOAD CACHE
========================================================== */

/*
   Keeps a small cache of media elements that have already
   been requested by the browser.

   We intentionally preload only a small number of items
   rather than trying to download thousands of files.
*/

const preloadCache = new Map();

const MAX_PRELOAD_CACHE = 6;


/* ==========================================================
   AUTHENTICATION & INITIALIZATION
========================================================== */

function checkPassword() {

    const tokenInput =
        document.getElementById("passwordInput").value.trim();

    if (
        tokenInput.startsWith("ghp_") ||
        tokenInput.startsWith("github_pat_")
    ) {

        GITHUB_CONFIG.token = tokenInput;

        localStorage.setItem(
            "mediaViewerToken",
            tokenInput
        );

        document.getElementById("loginScreen").style.display = "none";
        document.getElementById("app").style.display = "block";

        initializeApp();

    } else {

        document.getElementById("loginError").textContent =
            "Invalid token format (must start with ghp_ or github_pat_)";
    }
}


function logoutGitHub() {

    if (
        confirm(
            "Logout and remove saved GitHub token from this device?"
        )
    ) {

        localStorage.removeItem("mediaViewerToken");

        location.reload();
    }
}


document.addEventListener("DOMContentLoaded", () => {

    const loginBtn =
        document.getElementById("loginButton");

    const pwdInput =
        document.getElementById("passwordInput");


    if (loginBtn) {

        loginBtn.addEventListener(
            "click",
            checkPassword
        );
    }


    if (pwdInput) {

        pwdInput.addEventListener(
            "keypress",
            (e) => {

                if (e.key === "Enter") {
                    checkPassword();
                }

            }
        );
    }


    if (GITHUB_CONFIG.token) {

        document.getElementById("loginScreen").style.display =
            "none";

        document.getElementById("app").style.display =
            "block";

        initializeApp();
    }

});


/* ==========================================================
   GITHUB API SAVE & LOAD
========================================================== */

async function fetchGitHubFile(path) {

    try {

        const url =
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`;

        const res = await fetch(
            url,
            {
                headers: {
                    Authorization:
                        `token ${GITHUB_CONFIG.token}`
                }
            }
        );


        if (!res.ok) {
            return null;
        }


        const data = await res.json();

        const content =
            JSON.parse(
                atob(data.content)
            );


        return {
            content,
            sha: data.sha
        };


    } catch (e) {

        console.log(
            `Could not load ${path} from GitHub:`,
            e
        );

        return null;
    }
}


async function saveGitHubFile(path, dataArray) {

    const url =
        `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`;

    const existing =
        await fetchGitHubFile(path);

    const sha =
        existing ? existing.sha : undefined;


    const jsonString =
        JSON.stringify(
            dataArray,
            null,
            2
        );


    const contentBase64 =
        btoa(
            unescape(
                encodeURIComponent(jsonString)
            )
        );


    const body = {

        message:
            `Update ${path} from Mobile Viewer`,

        content:
            contentBase64,

        branch:
            GITHUB_CONFIG.branch
    };


    if (sha) {
        body.sha = sha;
    }


    const res =
        await fetch(
            url,
            {
                method: "PUT",

                headers: {
                    "Authorization":
                        `token ${GITHUB_CONFIG.token}`,

                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(body)
            }
        );


    if (!res.ok) {

        const errData =
            await res.json().catch(
                () => ({})
            );

        throw new Error(
            errData.message ||
            `Failed to commit ${path}`
        );
    }
}


async function loadServerData() {

    const heartsRes =
        await fetchGitHubFile(
            "saved_hearts.json"
        );


    if (
        heartsRes &&
        Array.isArray(heartsRes.content)
    ) {

        heartedItems =
            new Set(heartsRes.content);
    }


    const seenRes =
        await fetchGitHubFile(
            "seen_media.json"
        );


    if (
        seenRes &&
        Array.isArray(seenRes.content)
    ) {

        seenItems =
            new Set(seenRes.content);
    }


    updateStatsDashboard();
}


async function manualSyncToGitHub() {

    const statusEl =
        document.getElementById("status");


    if (statusEl) {

        statusEl.style.color =
            "#00AAFF";

        statusEl.textContent =
            "💾 Saving hearts and seen data to GitHub...";
    }


    try {

        await saveGitHubFile(
            "saved_hearts.json",
            [...heartedItems]
        );


        await saveGitHubFile(
            "seen_media.json",
            [...seenItems]
        );


        if (statusEl) {

            statusEl.style.color =
                "#2ecc71";

            statusEl.textContent =
                "✅ Successfully saved to GitHub!";

            setTimeout(
                () => {
                    statusEl.textContent = "";
                },
                4000
            );
        }


    } catch (error) {

        if (statusEl) {

            statusEl.style.color =
                "#ff6666";

            statusEl.textContent =
                "❌ Failed to save: " +
                error.message;
        }
    }
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


/* ==========================================================
   STATS DASHBOARD
========================================================== */

function updateStatsDashboard() {

    const total =
        mediaUrls.length;

    const seen =
        seenItems.size;

    const hearts =
        heartedItems.size;

    const remaining =
        Math.max(
            0,
            total - seen
        );


    const percentage =
        total > 0
            ? Math.round(
                (seen / total) * 100
            )
            : 0;


    const progEl =
        document.getElementById(
            "statProgress"
        );

    const seenEl =
        document.getElementById(
            "statSeen"
        );

    const heartsEl =
        document.getElementById(
            "statHearts"
        );

    const remEl =
        document.getElementById(
            "statRemaining"
        );


    if (progEl) {
        progEl.textContent =
            percentage + "%";
    }


    if (seenEl) {
        seenEl.textContent =
            `${seen} / ${total}`;
    }


    if (heartsEl) {
        heartsEl.textContent =
            hearts;
    }


    if (remEl) {
        remEl.textContent =
            remaining;
    }
}


/* ==========================================================
   WELCOME BANNER
========================================================== */

function showWelcome() {

    const visited =
        localStorage.getItem(
            STORAGE.visited
        );


    if (!visited) {

        const banner =
            document.getElementById(
                "welcomeBanner"
            );


        if (banner) {

            banner.style.display =
                "block";


            setTimeout(
                () => {
                    banner.style.display =
                        "none";
                },
                5000
            );
        }


        localStorage.setItem(
            STORAGE.visited,
            "true"
        );
    }
}


/* ==========================================================
   MEDIA DETECTION
========================================================== */

function isImage(url) {

    return (
        /\.(jpeg|jpg|png|gif|webp|heic|avif|bmp)$/i.test(url) ||
        url.includes("pbs.twimg.com") ||
        url.includes("abs.twimg.com")
    );
}


function isVideo(url) {

    return (
        /\.(mp4|webm|mov|m4v)$/i.test(url) ||
        url.includes("video.twimg.com")
    );
}


function normalizeImageURL(url) {

    let src = url;


    if (
        src.includes("imgur.com/") &&
        !src.includes("i.imgur.com")
    ) {

        src =
            src.replace(
                "imgur.com/",
                "i.imgur.com/"
            ) + ".jpg";
    }


    return src;
}


/* ==========================================================
   MEDIA ELEMENT CREATION
========================================================== */

function createMediaElement(item) {

    let element = null;


    if (isVideo(item.url)) {

        const video =
            document.createElement("video");


        video.src =
            item.url;

        video.controls =
            true;

        video.playsInline =
            true;

        video.preload =
            swipeMode
                ? "auto"
                : "metadata";


        element =
            video;


    } else if (isImage(item.url)) {

        const img =
            document.createElement("img");


        img.src =
            normalizeImageURL(
                item.url
            );


        /*
           Normal mode can still use lazy loading.
           Swipe Mode needs the media immediately.
        */

        img.loading =
            swipeMode
                ? "eager"
                : "lazy";


        img.decoding =
            "async";


        img.onerror =
            () => {
                img.style.display =
                    "none";
            };


        element =
            img;
    }


    return element;
}


/* ==========================================================
   MEDIA PRELOADING
========================================================== */

function preloadMedia(item) {

    if (!item || !item.url) {
        return;
    }


    const url =
        normalizeImageURL(
            item.url
        );


    if (preloadCache.has(url)) {
        return;
    }


    if (isImage(url)) {

        const img =
            new Image();

        img.decoding =
            "async";

        img.src =
            url;


        preloadCache.set(
            url,
            img
        );


    } else if (isVideo(url)) {

        const video =
            document.createElement(
                "video"
            );

        video.preload =
            "auto";

        video.muted =
            true;

        video.playsInline =
            true;

        video.src =
            url;


        /*
           load() asks the browser to begin
           fetching the video.
        */

        video.load();


        preloadCache.set(
            url,
            video
        );
    }


    /*
       Keep the cache small.
       We do not want an iPhone trying to
       remember thousands of media objects.
    */

    if (
        preloadCache.size >
        MAX_PRELOAD_CACHE
    ) {

        const oldestKey =
            preloadCache.keys().next().value;


        preloadCache.delete(
            oldestKey
        );
    }
}


/*
   Preload the next item in Swipe Mode.
*/

function preloadNextSwipeMedia() {

    if (!swipeMode) {
        return;
    }


    const nextItem =
        workingList[currentIndex];


    if (nextItem) {
        preloadMedia(nextItem);
    }
}


/* ==========================================================
   HELPERS
========================================================== */

function snapToTop() {

    window.scrollTo({
        top: 0,
        behavior: "instant"
    });
}


function shuffleArray(array) {

    for (
        let i = array.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() *
                (i + 1)
            );


        [
            array[i],
            array[j]
        ] =
        [
            array[j],
            array[i]
        ];
    }


    return array;
}


/* ==========================================================
   SEARCH SYSTEM
========================================================== */

function applySearch() {

    workingList =
        buildDisplayList();

    currentIndex =
        0;


    render();


    if (!swipeMode) {
        snapToTop();
    }
}


function debouncedSearch() {

    clearTimeout(
        searchTimer
    );


    searchTimer =
        setTimeout(
            applySearch,
            SEARCH_DELAY
        );
}


/* ==========================================================
   HEART SYSTEM
========================================================== */

function toggleHeart(index) {

    if (
        heartedItems.has(index)
    ) {

        heartedItems.delete(index);

    } else {

        heartedItems.add(index);
    }


    document
        .querySelectorAll(
            ".heart-btn"
        )
        .forEach(
            btn => {

                if (
                    Number(
                        btn.dataset.index
                    ) === index
                ) {

                    const active =
                        heartedItems.has(
                            index
                        );


                    btn.textContent =
                        active
                            ? "❤️"
                            : "♡";


                    if (active) {

                        btn.classList.add(
                            "active"
                        );

                    } else {

                        btn.classList.remove(
                            "active"
                        );
                    }
                }
            }
        );


    document
        .querySelectorAll(
            ".swipe-action-btn"
        )
        .forEach(
            btn => {

                if (
                    btn.dataset.index == index
                ) {

                    btn.textContent =
                        heartedItems.has(index)
                            ? "❤️ Unheart"
                            : "❤️ Heart";
                }
            }
        );


    updateStatsDashboard();


    if (
        heartMode &&
        !heartedItems.has(index)
    ) {

        applySearch();
    }


    if (
        swipeMode &&
        heartedItems.has(index)
    ) {

        setTimeout(
            () => {
                nextRandomPage();
            },
            350
        );
    }
}


function handleDoubleTap(
    itemIndex,
    wrapperElement
) {

    toggleHeart(itemIndex);


    const existingHeart =
        wrapperElement.querySelector(
            ".floating-heart"
        );


    if (existingHeart) {
        existingHeart.remove();
    }


    const heartPop =
        document.createElement(
            "div"
        );


    heartPop.className =
        "floating-heart";


    heartPop.textContent =
        "❤️";


    wrapperElement.appendChild(
        heartPop
    );


    setTimeout(
        () => {
            heartPop.remove();
        },
        600
    );
}


function showHeartedOnly() {

    heartMode =
        !heartMode;


    saveSettings();


    workingList =
        buildDisplayList();


    shuffleArray(
        workingList
    );


    currentIndex =
        0;


    render();


    if (!swipeMode) {
        snapToTop();
    }
}


/* ==========================================================
   SWIPE MODE
========================================================== */

function toggleSwipeMode() {

    swipeMode =
        !swipeMode;


    saveSettings();


    currentIndex =
        0;


    /*
       Tell CSS that we are entering/leaving
       full-screen-style Swipe Mode.
    */

    document.body.classList.toggle(
        "swipe-mode",
        swipeMode
    );


    /*
       Clear old preloads when switching modes.
       New ones will be generated for Swipe Mode.
    */

    preloadCache.clear();


    render();


    if (!swipeMode) {
        snapToTop();
    }
}


/* ==========================================================
   AUTO PLAY
========================================================== */

function toggleAutoPlay() {

    autoPlayActive =
        !autoPlayActive;


    if (autoPlayActive) {

        startAutoPlayTimer();

    } else {

        stopAutoPlayTimer();
    }


    renderControls();
}


function startAutoPlayTimer() {

    stopAutoPlayTimer();


    autoPlayTimer =
        setInterval(
            () => {
                nextRandomPage();
            },
            autoPlayInterval
        );
}


function stopAutoPlayTimer() {

    if (autoPlayTimer) {

        clearInterval(
            autoPlayTimer
        );
    }


    autoPlayTimer =
        null;
}


function changeAutoPlaySpeed(val) {

    autoPlayInterval =
        Number(val);


    if (autoPlayActive) {
        startAutoPlayTimer();
    }
}


/* ==========================================================
   HISTORY
========================================================== */

function addToHistory(item) {

    recentHistory =
        recentHistory.filter(
            i =>
                i.index !== item.index
        );


    recentHistory.unshift(
        item
    );


    if (
        recentHistory.length >
        HISTORY_LIMIT
    ) {

        recentHistory.pop();
    }
}


function toggleHistoryModal() {

    const modal =
        document.getElementById(
            "historyModal"
        );


    if (!modal) {
        return;
    }


    modal.classList.toggle(
        "hidden"
    );


    if (
        !modal.classList.contains(
            "hidden"
        )
    ) {

        renderHistoryList();
    }
}


/*
   Protect URLs before inserting them into
   HTML generated by this function.
*/

function escapeHTML(value) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


/*
   Build a thumbnail for History.

   Images:
       regular <img>

   Videos:
       small muted <video>

   Unknown media:
       placeholder
*/

function createHistoryThumbnail(item) {

    const safeUrl =
        escapeHTML(
            normalizeImageURL(
                item.url
            )
        );


    if (isImage(item.url)) {

        return `
            <img
                class="history-thumbnail"
                src="${safeUrl}"
                loading="lazy"
                decoding="async"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
            >
            <div
                class="history-thumbnail-placeholder"
                style="display:none;"
            >
                🖼️
            </div>
        `;

    }


    if (isVideo(item.url)) {

        return `
            <video
                class="history-thumbnail"
                src="${safeUrl}"
                muted
                playsinline
                preload="metadata"
            ></video>
        `;
    }


    return `
        <div class="history-thumbnail-placeholder">
            📄
        </div>
    `;
}


function renderHistoryList() {

    const container =
        document.getElementById(
            "historyListContainer"
        );


    if (!container) {
        return;
    }


    if (
        recentHistory.length === 0
    ) {

        container.innerHTML =
            '<p style="color:#777;text-align:center;">No recent history yet.</p>';

        return;
    }


    container.innerHTML =
        recentHistory
            .map(
                item => {

                    const heart =
                        heartedItems.has(
                            item.index
                        )
                            ? "❤️"
                            : "";


                    return `
                        <div
                            class="history-item"
                            onclick="jumpToHistoryItem(${item.index})"
                        >

                            ${createHistoryThumbnail(item)}

                            <div class="history-info">

                                <div class="history-number">
                                    #${item.index}
                                </div>

                                <div class="history-url">
                                    ${escapeHTML(item.url)}
                                </div>

                            </div>

                            <div class="history-heart">
                                ${heart}
                            </div>

                        </div>
                    `;
                }
            )
            .join("");
}


function jumpToHistoryItem(index) {

    toggleHistoryModal();


    const foundIndex =
        workingList.findIndex(
            item =>
                item.index === index
        );


    if (
        foundIndex !== -1
    ) {

        currentIndex =
            foundIndex;

    } else {

        const item =
            mediaUrls.find(
                i =>
                    i.index === index
            );


        if (item) {

            workingList.unshift(
                item
            );

            currentIndex =
                0;
        }
    }


    render();


    if (!swipeMode) {
        snapToTop();
    }
}


/* ==========================================================
   CLEAR ALL DATA
========================================================== */

async function clearAllData() {

    if (
        !confirm(
            "Clear all hearts and seen media history locally and on GitHub?"
        )
    ) {

        return;
    }


    heartedItems.clear();
    seenItems.clear();
    recentHistory = [];


    document
        .querySelectorAll(
            ".heart-btn"
        )
        .forEach(
            btn => {

                btn.textContent =
                    "♡";

                btn.classList.remove(
                    "active"
                );
            }
        );


    applySearch();


    const statusEl =
        document.getElementById(
            "status"
        );


    if (statusEl) {

        statusEl.style.color =
            "#00AAFF";

        statusEl.textContent =
            "🗑 Clearing data on GitHub...";
    }


    try {

        await saveGitHubFile(
            "saved_hearts.json",
            []
        );


        await saveGitHubFile(
            "seen_media.json",
            []
        );


        if (statusEl) {

            statusEl.style.color =
                "#2ecc71";

            statusEl.textContent =
                "✅ Successfully cleared and saved to GitHub!";


            setTimeout(
                () => {
                    statusEl.textContent =
                        "";
                },
                4000
            );
        }


    } catch (error) {

        if (statusEl) {

            statusEl.style.color =
                "#ff6666";

            statusEl.textContent =
                "❌ Failed to clear on GitHub: " +
                error.message;
        }
    }
}


/* ==========================================================
   BUILD DISPLAY LIST
========================================================== */

function buildDisplayList() {

    let list =
        [...mediaUrls];


    const queryEl =
        document.getElementById(
            "searchInput"
        );


    const query =
        queryEl
            ? queryEl.value
                .toLowerCase()
                .trim()
            : "";


    if (query) {

        const number =
            query.replace(
                "#",
                ""
            );


        list =
            list.filter(
                item =>
                    item.url
                        .toLowerCase()
                        .includes(query) ||

                    item.index
                        .toString() ===
                        number
            );


    } else if (heartMode) {

        list =
            list.filter(
                item =>
                    heartedItems.has(
                        item.index
                    )
            );


    } else {

        list =
            list.filter(
                item =>
                    !seenItems.has(
                        item.index
                    )
            );
    }


    return list;
}


/* ==========================================================
   TRACK SEEN MEDIA
========================================================== */

function setupObserver() {

    if (observer) {
        observer.disconnect();
    }


    if (observerTimeout) {
        clearTimeout(observerTimeout);
    }


    observerTimeout =
        setTimeout(
            () => {

                observer =
                    new IntersectionObserver(
                        (
                            entries,
                            obs
                        ) => {

                            entries.forEach(
                                entry => {

                                    if (
                                        entry.isIntersecting
                                    ) {

                                        const index =
                                            Number(
                                                entry.target
                                                    .dataset
                                                    .index
                                            );


                                        if (
                                            index &&
                                            !heartMode &&
                                            !seenItems.has(index)
                                        ) {

                                            seenItems.add(
                                                index
                                            );


                                            updateStatsDashboard();


                                            const numberEl =
                                                document.getElementById(
                                                    `num-${index}`
                                                );


                                            if (
                                                numberEl &&
                                                !numberEl.querySelector(
                                                    ".seen-badge"
                                                )
                                            ) {

                                                const badge =
                                                    document.createElement(
                                                        "span"
                                                    );


                                                badge.className =
                                                    "seen-badge";


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
                                }
                            );
                        },

                        {
                            threshold: 0.5
                        }
                    );


                document
                    .querySelectorAll(
                        ".media-container"
                    )
                    .forEach(
                        wrapper => {

                            observer.observe(
                                wrapper
                            );
                        }
                    );

            },
            1500
        );
}


/* ==========================================================
   RENDER CONTROLS
========================================================== */

function renderControls() {

    /*
       New mobile layout:

       LEFT:
           History
           Swipe
           Hearts
           Save
           Auto Play
           Speed

       RIGHT:
           BIG RANDOM
    */

    const html = `

        <div class="mobile-control-layout">

            <div class="control-left">

                <button
                    class="history-btn"
                    onclick="toggleHistoryModal()"
                >
                    🕒 History
                </button>


                <button
                    class="swipe-mode-btn"
                    onclick="toggleSwipeMode()"
                    style="background:${swipeMode ? "#d35400" : "#2980b9"}"
                >
                    ${swipeMode
                        ? "🎴 Swipe: ON"
                        : "🎴 Swipe: OFF"}
                </button>


                <button
                    class="heart-mode-btn"
                    onclick="showHeartedOnly()"
                >
                    ${heartMode
                        ? "❤️ Hearts"
                        : "♡ Hearts"}
                </button>

            </div>


            <div class="random-control">

                <button
                    class="random-btn"
                    onclick="nextRandomPage()"
                >
                    🎲 Random
                </button>

            </div>

        </div>


        <div class="secondary-controls">

            <button
                class="sync-btn"
                onclick="manualSyncToGitHub()"
            >
                💾 Save to GitHub
            </button>


            <button
                class="autoplay-btn"
                onclick="toggleAutoPlay()"
                style="background:${autoPlayActive
                    ? "#c0392b"
                    : "#16a085"}"
            >
                ${autoPlayActive
                    ? "⏹️ Stop Auto"
                    : "▶️ Auto Play"}
            </button>


            <select
    onchange="changeAutoPlaySpeed(this.value)"
>

    <option
        value="1000"
        ${autoPlayInterval === 1000
            ? "selected"
            : ""}
    >
        1s
    </option>


    <option
        value="2000"
        ${autoPlayInterval === 2000
            ? "selected"
            : ""}
    >
        2s
    </option>


    <option
        value="3000"
        ${autoPlayInterval === 3000
            ? "selected"
            : ""}
    >
        3s
    </option>


    <option
        value="5000"
        ${autoPlayInterval === 5000
            ? "selected"
            : ""}
    >
        5s
    </option>


                <option
                    value="8000"
                    ${autoPlayInterval === 8000
                        ? "selected"
                        : ""}
                >
                    8s
                </option>


                <option
                    value="12000"
                    ${autoPlayInterval === 12000
                        ? "selected"
                        : ""}
                >
                    12s
                </option>

            </select>

        </div>
    `;


    const topC =
        document.getElementById(
            "topControls"
        );


    const botC =
        document.getElementById(
            "bottomControls"
        );


    /*
       We intentionally use only the top controls.
       The old version duplicated the entire control
       panel at the bottom.
    */

    if (topC) {
        topC.innerHTML =
            html;
    }


    if (botC) {
        botC.innerHTML =
            "";
    }
}


/* ==========================================================
   RENDER
========================================================== */

function render() {

    /*
       Keep CSS synchronized with JavaScript state.
    */

    document.body.classList.toggle(
        "swipe-mode",
        swipeMode
    );


    renderControls();

    updateStatsDashboard();


    const container =
        document.getElementById(
            "mediaContainer"
        );


    if (!container) {
        return;
    }


    container.innerHTML =
        "";


    const statusEl =
        document.getElementById(
            "status"
        );


    if (statusEl) {
        statusEl.textContent =
            "";
    }


    /*
       Swipe Mode:
           one item

       Normal Mode:
           fifteen items
    */

    const pageSize =
        swipeMode
            ? 1
            : 15;


    let shown =
        0;

    let lastTapTime =
        0;


    while (
        shown < pageSize &&
        currentIndex <
        workingList.length
    ) {

        const item =
            workingList[currentIndex];


        currentIndex++;


        addToHistory(
            item
        );


        const wrapper =
            document.createElement(
                "div"
            );


        wrapper.className =
            "media-container";


        wrapper.dataset.index =
            item.index;


        /* ==================================================
           MEDIA NUMBER
        ================================================== */

        const number =
            document.createElement(
                "div"
            );


        number.className =
            "media-number";


        number.id =
            `num-${item.index}`;


        number.textContent =
            "#" + item.index;


        if (
            !heartMode &&
            seenItems.has(
                item.index
            )
        ) {

            const badge =
                document.createElement(
                    "span"
                );


            badge.className =
                "seen-badge";


            badge.textContent =
                "👀 Seen";


            number.appendChild(
                badge
            );
        }


        wrapper.appendChild(
            number
        );


        /* ==================================================
           HEART BUTTON
        ================================================== */

        const heart =
            document.createElement(
                "button"
            );


        heart.className =
            "heart-btn";


        heart.dataset.index =
            item.index;


        const isHearted =
            heartedItems.has(
                item.index
            );


        heart.textContent =
            isHearted
                ? "❤️"
                : "♡";


        if (isHearted) {

            heart.classList.add(
                "active"
            );
        }


        heart.onclick =
            () => {
                toggleHeart(
                    item.index
                );
            };


        wrapper.appendChild(
            heart
        );


        /* ==================================================
           URL
        ================================================== */

        const link =
            document.createElement(
                "a"
            );


        link.href =
            item.url;


        link.target =
            "_blank";


        link.rel =
            "noopener noreferrer";


        link.textContent =
            item.url;


        wrapper.appendChild(
            link
        );


        /* ==================================================
           MEDIA
        ================================================== */

        const media =
    createMediaElement(
        item
    );

if (media) {

    if (swipeMode) {

        media.style.maxWidth = "100%";
        media.style.maxHeight = "85vh";
        media.style.width = "auto";
        media.style.height = "auto";
        media.style.objectFit = "contain";
        media.style.display = "block";
        media.style.margin = "0 auto";
    }

    media.addEventListener(
        "click",
        (e) => {

            const currentTime =
                new Date().getTime();

            const tapLength =
                currentTime -
                lastTapTime;

            if (
                tapLength < 300 &&
                tapLength > 0
            ) {

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

    wrapper.appendChild(
        media
    );
}


        /* ==================================================
           SWIPE MODE
        ================================================== */

        if (swipeMode) {

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
                    onclick="nextRandomPage()"
                >
                    ⏭️ Skip
                </button>


                <button
                    class="swipe-action-btn"
                    data-index="${item.index}"
                    style="background:#e91e63;"
                    onclick="toggleHeart(${item.index})"
                >
                    ${
                        heartedItems.has(
                            item.index
                        )
                            ? "❤️ Unheart"
                            : "❤️ Heart"
                    }
                </button>

            `;


            wrapper.appendChild(
                swipeActions
            );


            /*
               Swipe Mode considers the media seen
               once it is presented.
            */

            if (
                !heartMode &&
                !seenItems.has(
                    item.index
                )
            ) {

                seenItems.add(
                    item.index
                );


                updateStatsDashboard();
            }


            /* ==================================================
               TOUCH SWIPES
            ================================================== */

            let touchStartX =
                0;

            let touchEndX =
                0;


            wrapper.addEventListener(
                "touchstart",
                (e) => {

                    if (
                        e.touches.length === 1
                    ) {

                        touchStartX =
                            e.changedTouches[0]
                                .screenX;
                    }

                },
                {
                    passive: true
                }
            );


            wrapper.addEventListener(
                "touchend",
                (e) => {

                    if (
                        e.changedTouches.length === 1
                    ) {

                        touchEndX =
                            e.changedTouches[0]
                                .screenX;


                        const diff =
                            touchEndX -
                            touchStartX;


                        if (
                            Math.abs(diff) > 70
                        ) {

                            if (
                                diff < 0
                            ) {

                                /*
                                   Swipe LEFT =
                                   next media
                                */

                                nextRandomPage();

                            } else {

                                /*
                                   Swipe RIGHT =
                                   heart
                                */

                                toggleHeart(
                                    item.index
                                );
                            }
                        }
                    }

                },
                {
                    passive: true
                }
            );
        }


        container.appendChild(
            wrapper
        );


        shown++;
    }


    /* ==================================================
       PRELOAD NEXT SWIPE ITEM
    ================================================== */

    if (swipeMode) {

        preloadNextSwipeMedia();

    } else {

        setupObserver();
    }
}


/* ==========================================================
   RANDOM PAGE SYSTEM
========================================================== */

function nextRandomPage() {

    /*
       Normal Mode can safely return to the top.

       Swipe Mode is handled by the viewport layout,
       so we avoid the jarring scroll-to-top operation.
    */

    if (!swipeMode) {
        snapToTop();
    }


    if (heartMode) {

        if (
            currentIndex >=
            workingList.length
        ) {

            shuffleArray(
                workingList
            );


            currentIndex =
                0;


            const statusEl =
                document.getElementById(
                    "status"
                );


            if (statusEl) {

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


        currentIndex =
            0;


        if (
            workingList.length === 0
        ) {

            seenItems.clear();


            workingList =
                buildDisplayList();


            shuffleArray(
                workingList
            );


            const statusEl =
                document.getElementById(
                    "status"
                );


            if (statusEl) {

                statusEl.textContent =
                    "🎉 Cycle complete. Starting again.";
            }
        }
    }


    render();
}


/* ==========================================================
   INITIALIZE APPLICATION
========================================================== */

async function initializeApp() {

    try {

        const response =
            await fetch(
                "mediaNEW.json?t=" +
                new Date().getTime()
            );


        if (!response.ok) {

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


        currentIndex =
            0;


        document.body.classList.toggle(
            "swipe-mode",
            swipeMode
        );


        render();


    } catch (error) {

        const statusEl =
            document.getElementById(
                "status"
            );


        if (statusEl) {

            statusEl.textContent =
                "Error: " +
                error.message;
        }
    }
}


/* ==========================================================
   SEARCH EVENT
========================================================== */

const searchInputEl =
    document.getElementById(
        "searchInput"
    );


if (searchInputEl) {

    searchInputEl.addEventListener(
        "input",
        debouncedSearch
    );
}
