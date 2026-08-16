/* ==========================================================
   APP.JS - Media Viewer V4.5
   Mobile UI + Swipe Preloading + Thumbnail History
   GitHub Sync + Auto Play + Search + Hearts + Seen
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
   AUTO PLAY
========================================================== */

let autoPlayActive = false;
let autoPlayTimer = null;
let autoPlayInterval = 5000;


/* ==========================================================
   PRELOAD CACHE
========================================================== */

const preloadCache = new Map();

const MAX_PRELOAD_CACHE = 8;


/* ==========================================================
   AUTHENTICATION
========================================================== */

function checkPassword() {

    const tokenInput =
        document.getElementById("passwordInput")
            ?.value
            .trim();

    if (
        tokenInput &&
        (
            tokenInput.startsWith("ghp_") ||
            tokenInput.startsWith("github_pat_")
        )
    ) {

        GITHUB_CONFIG.token = tokenInput;

        localStorage.setItem(
            "mediaViewerToken",
            tokenInput
        );

        document.getElementById("loginScreen").style.display =
            "none";

        document.getElementById("app").style.display =
            "block";

        initializeApp();

    } else {

        const error =
            document.getElementById("loginError");

        if (error) {

            error.textContent =
                "Invalid token format (must start with ghp_ or github_pat_)";
        }
    }
}


function logoutGitHub() {

    if (
        confirm(
            "Logout and remove saved GitHub token from this device?"
        )
    ) {

        localStorage.removeItem(
            "mediaViewerToken"
        );

        location.reload();
    }
}


document.addEventListener(
    "DOMContentLoaded",
    () => {

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

    }
);


/* ==========================================================
   GITHUB API
========================================================== */

async function fetchGitHubFile(path) {

    try {

        const url =
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`;

        const res =
            await fetch(
                url,
                {
                    headers: {
                        Authorization:
                            `token ${GITHUB_CONFIG.token}`,
                        Accept:
                            "application/vnd.github+json"
                    },
                    cache: "no-store"
                }
            );


        if (!res.ok) {
            return null;
        }


        const data =
            await res.json();


        const binary =
            atob(
                data.content.replace(/\n/g, "")
            );


        const bytes =
            Uint8Array.from(
                binary,
                char => char.charCodeAt(0)
            );


        const decoded =
            new TextDecoder().decode(bytes);


        return {
            content:
                JSON.parse(decoded),

            sha:
                data.sha
        };


    } catch (e) {

        console.error(
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


    const jsonString =
        JSON.stringify(
            dataArray,
            null,
            2
        );


    const encoder =
        new TextEncoder();


    const bytes =
        encoder.encode(
            jsonString
        );


    let binary = "";

    const chunkSize = 0x8000;


    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {

        binary += String.fromCharCode(
            ...bytes.subarray(
                i,
                i + chunkSize
            )
        );
    }


    const contentBase64 =
        btoa(binary);


    const body = {

        message:
            `Update ${path} from Media Viewer`,

        content:
            contentBase64,

        branch:
            GITHUB_CONFIG.branch
    };


    if (existing?.sha) {
        body.sha = existing.sha;
    }


    const res =
        await fetch(
            url,
            {
                method: "PUT",

                headers: {
                    Authorization:
                        `token ${GITHUB_CONFIG.token}`,

                    Accept:
                        "application/vnd.github+json",

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


    return true;
}


async function loadServerData() {

    const heartsRes =
        await fetchGitHubFile(
            "saved_hearts.json"
        );


    if (
        heartsRes &&
        Array.isArray(
            heartsRes.content
        )
    ) {

        heartedItems =
            new Set(
                heartsRes.content
                    .map(Number)
            );
    }


    const seenRes =
        await fetchGitHubFile(
            "seen_media.json"
        );


    if (
        seenRes &&
        Array.isArray(
            seenRes.content
        )
    ) {

        seenItems =
            new Set(
                seenRes.content
                    .map(Number)
            );
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


/* ==========================================================
   SETTINGS
========================================================== */

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
   STATS
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
   WELCOME
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
        /\.(jpeg|jpg|png|gif|webp|heic|avif|bmp)(\?.*)?$/i.test(url) ||
        url.includes("pbs.twimg.com") ||
        url.includes("abs.twimg.com") ||
        url.includes("i.redd.it")
    );
}


function isVideo(url) {

    return (
        /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url) ||
        url.includes("video.twimg.com")
    );
}


function normalizeImageURL(url) {

    let src =
        url;


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
   MEDIA ELEMENT
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

        video.muted =
            false;


        element =
            video;


    } else if (isImage(item.url)) {

        const img =
            document.createElement("img");


        img.src =
            normalizeImageURL(
                item.url
            );


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
   PRELOAD
========================================================== */

function preloadMedia(item) {

    if (!item?.url) {
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
            document.createElement("video");


        video.preload =
            "auto";

        video.muted =
            true;

        video.playsInline =
            true;

        video.src =
            url;


        video.load();


        preloadCache.set(
            url,
            video
        );
    }


    while (
        preloadCache.size >
        MAX_PRELOAD_CACHE
    ) {

        const oldestKey =
            preloadCache.keys()
                .next()
                .value;


        preloadCache.delete(
            oldestKey
        );
    }
}


function preloadSwipeItems() {

    if (!swipeMode) {
        return;
    }


    /*
       Preload several items ahead.

       This is deliberately small so an iPhone
       does not start downloading hundreds of files.
    */

    for (
        let offset = 0;
        offset < 3;
        offset++
    ) {

        const item =
            workingList[
                currentIndex + offset
            ];


        if (item) {
            preloadMedia(item);
        }
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
   SEARCH
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
        .querySelectorAll(".heart-btn")
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


                    btn.classList.toggle(
                        "active",
                        active
                    );
                }
            }
        );


    document
        .querySelectorAll(".swipe-action-btn")
        .forEach(
            btn => {

                if (
                    Number(
                        btn.dataset.index
                    ) === index
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

                if (swipeMode) {
                    nextRandomPage();
                }

            },
            350
        );
    }
}


function handleDoubleTap(
    itemIndex,
    wrapperElement
) {

    toggleHeart(
        itemIndex
    );


    const existingHeart =
        wrapperElement.querySelector(
            ".floating-heart"
        );


    if (existingHeart) {
        existingHeart.remove();
    }


    const heartPop =
        document.createElement("div");


    heartPop.className =
        "floating-heart";


    heartPop.textContent =
        "❤️";


    wrapperElement.appendChild(
        heartPop
    );


    setTimeout(
        () => {

            if (heartPop.parentNode) {
                heartPop.remove();
            }

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


    document.body.classList.toggle(
        "swipe-mode",
        swipeMode
    );


    preloadCache.clear();


    workingList =
        buildDisplayList();


    shuffleArray(
        workingList
    );


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
                onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
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
                class="history-thumbnail"
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


    updateStatsDashboard();


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
   SEEN OBSERVER
========================================================== */

function setupObserver() {

    if (observer) {
        observer.disconnect();
    }


    if (observerTimeout) {
        clearTimeout(
            observerTimeout
        );
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
            500
        );
}


/* ==========================================================
   CONTROLS
========================================================== */

function renderControls() {

    /*
       IMPORTANT:

       We render the same control layout into BOTH
       topControls and bottomControls.

       Therefore Random exists at the top AND bottom.
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
                    style="background:${swipeMode
                        ? "#d35400"
                        : "#2980b9"}"
                >
                    ${
                        swipeMode
                            ? "🎴 Swipe: ON"
                            : "🎴 Swipe: OFF"
                    }
                </button>


                <button
                    class="heart-mode-btn"
                    onclick="showHeartedOnly()"
                >
                    ${
                        heartMode
                            ? "❤️ Hearts"
                            : "♡ Hearts"
                    }
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
                ${
                    autoPlayActive
                        ? "⏹️ Stop Auto"
                        : "▶️ Auto Play"
                }
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


    if (topC) {

        topC.innerHTML =
            html;
    }


    if (botC) {

        botC.innerHTML =
            html;
    }
}


/* ==========================================================
   RENDER
========================================================== */

function render() {

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
           NUMBER
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


        heart.classList.toggle(
            "active",
            isHearted
        );


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


        link.className =
            "media-url";


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

            /*
               Swipe Mode:

               Keep the ORIGINAL aspect ratio.
               Never force width + height simultaneously.
               This prevents cropping/stretching.
            */

            if (swipeMode) {

                media.style.display =
                    "block";

                media.style.maxWidth =
                    "100%";

                media.style.maxHeight =
                    "72vh";

                media.style.width =
                    "auto";

                media.style.height =
                    "auto";

                media.style.objectFit =
                    "contain";

                media.style.margin =
                    "0 auto";
            }


            media.addEventListener(
                "click",
                (e) => {

                    const currentTime =
                        Date.now();


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
           SWIPE ACTIONS
        ================================================== */

        if (swipeMode) {

            /*
               Buttons are OUTSIDE the media element.
            */

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
               Swipe Mode marks the item seen
               immediately when displayed.
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

            let touchStartY =
                0;


            wrapper.addEventListener(
                "touchstart",
                (e) => {

                    if (
                        e.touches.length === 1
                    ) {

                        touchStartX =
                            e.touches[0]
                                .screenX;

                        touchStartY =
                            e.touches[0]
                                .screenY;
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
                        e.changedTouches.length !== 1
                    ) {
                        return;
                    }


                    const touchEndX =
                        e.changedTouches[0]
                            .screenX;


                    const touchEndY =
                        e.changedTouches[0]
                            .screenY;


                    const diffX =
                        touchEndX -
                        touchStartX;


                    const diffY =
                        touchEndY -
                        touchStartY;


                    /*
                       Only treat it as a horizontal
                       swipe when horizontal movement
                       is clearly larger.
                    */

                    if (
                        Math.abs(diffX) > 70 &&
                        Math.abs(diffX) >
                        Math.abs(diffY) * 1.25
                    ) {

                        if (
                            diffX < 0
                        ) {

                            /*
                               LEFT = NEXT
                            */

                            nextRandomPage();

                        } else {

                            /*
                               RIGHT = HEART
                            */

                            toggleHeart(
                                item.index
                            );
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
       PRELOAD
    ================================================== */

    if (swipeMode) {

        preloadSwipeItems();

    } else {

        setupObserver();
    }
}


/* ==========================================================
   RANDOM PAGE
========================================================== */

function nextRandomPage() {

    /*
       Stop autoplay from accidentally stacking
       multiple timers by keeping the same timer.
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

            /*
               Entire collection has been seen.
               Reset the seen cycle.
            */

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


    preloadCache.clear();


    render();
}


/* ==========================================================
   INITIALIZE
========================================================== */

async function initializeApp() {

    try {

        const response =
            await fetch(
                "mediaNEW.json?t=" +
                Date.now(),
                {
                    cache: "no-store"
                }
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
                    url:
                        String(url),

                    index:
                        index + 1
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

        console.error(
            error
        );


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

document.addEventListener(
    "DOMContentLoaded",
    () => {

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

    }
);
