// State Management
let allNotes = [];       // Flat list of individual updates parsed from XML
let filteredNotes = [];  // Notes matching current search and type filters
let selectedNote = null;  // Note currently loaded in the composer
let currentFilter = 'all';
let currentStyle = 'announcement'; // 'announcement', 'tech', 'minimal'
let isSearching = false;

// DOM Elements
const elements = {
    refreshBtn: document.getElementById('refresh-btn'),
    refreshIcon: document.getElementById('refresh-icon'),
    syncStatus: document.getElementById('sync-status'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search'),
    filterItems: document.querySelectorAll('.filter-item'),
    
    // States
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorMessage: document.getElementById('error-message'),
    retryBtn: document.getElementById('retry-btn'),
    emptyState: document.getElementById('empty-state'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    cardsContainer: document.getElementById('cards-container'),
    
    // Composer
    composerEmptyState: document.getElementById('composer-empty-state'),
    composerActiveState: document.getElementById('composer-active-state'),
    closeComposerBtn: document.getElementById('close-composer'),
    composerBadge: document.getElementById('composer-badge'),
    composerDate: document.getElementById('composer-date'),
    composerHtml: document.getElementById('composer-html'),
    composerLink: document.getElementById('composer-link'),
    
    // Tweet Workspace
    tweetTextarea: document.getElementById('tweet-textarea'),
    tweetCharCount: document.getElementById('tweet-char-count'),
    tweetCharProgress: document.getElementById('tweet-char-progress'),
    stylePills: document.querySelectorAll('.style-pill'),
    copyTweetBtn: document.getElementById('copy-tweet-btn'),
    copyBtnText: document.getElementById('copy-btn-text'),
    tweetBtn: document.getElementById('tweet-btn'),
    
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message'),
    
    // Sidebar counts
    countAll: document.getElementById('count-all'),
    countFeature: document.getElementById('count-feature'),
    countChanged: document.getElementById('count-changed'),
    countAnnouncement: document.getElementById('count-announcement'),
    countIssue: document.getElementById('count-issue'),
    countDeprecated: document.getElementById('count-deprecated')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    fetchReleaseNotes(false);
    setupEventListeners();
});

// Event Listeners Setup
function setupEventListeners() {
    // Refresh & Retry
    elements.refreshBtn.addEventListener('click', () => fetchReleaseNotes(true));
    elements.retryBtn.addEventListener('click', () => fetchReleaseNotes(true));
    
    // Search input
    elements.searchInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        elements.clearSearchBtn.style.display = value ? 'block' : 'none';
        filterAndRender();
    });
    
    // Clear search
    elements.clearSearchBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        elements.clearSearchBtn.style.display = 'none';
        elements.searchInput.focus();
        filterAndRender();
    });
    
    // Filter click
    elements.filterItems.forEach(item => {
        item.addEventListener('click', () => {
            elements.filterItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            currentFilter = item.getAttribute('data-type');
            filterAndRender();
        });
    });
    
    // Reset Filters button
    elements.resetFiltersBtn.addEventListener('click', resetFilters);
    
    // Composer Close
    elements.closeComposerBtn.addEventListener('click', deselectNote);
    
    // Tweet text change
    elements.tweetTextarea.addEventListener('input', handleTweetTextChange);
    
    // Tweet templates
    elements.stylePills.forEach(pill => {
        pill.addEventListener('click', () => {
            elements.stylePills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentStyle = pill.getAttribute('data-style');
            generateTweetDraft();
        });
    });
    
    // Copy Tweet Action
    elements.copyTweetBtn.addEventListener('click', copyTweetToClipboard);
    
    // Share on X Action
    elements.tweetBtn.addEventListener('click', shareOnTwitter);
}

// Fetch Notes from API
async function fetchReleaseNotes(force = false) {
    showLoading();
    
    try {
        const url = `/api/notes?force=${force}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Parse raw XML entries into granular updates
        processFeedEntries(data.notes);
        
        // Update Sync Status
        updateSyncStatus(data.last_updated, data.source, data.warning);
        
        // Count stats for sidebar badges
        updateCategoryCounts();
        
        // Filter and display
        filterAndRender();
        
    } catch (error) {
        console.error('Error fetching release notes:', error);
        showError(error.message);
    }
}

// Process XML Feed Entries: splits daily updates by h3 tag
function processFeedEntries(entries) {
    allNotes = [];
    
    entries.forEach(entry => {
        if (!entry.content) return;
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(entry.content, 'text/html');
        
        let currentType = 'General';
        let currentElements = [];
        let index = 0;
        
        const pushCurrentGroup = () => {
            if (currentElements.length > 0) {
                // Generate content HTML
                const container = document.createElement('div');
                currentElements.forEach(el => container.appendChild(el.cloneNode(true)));
                const htmlContent = container.innerHTML;
                
                // Text representation
                const textContent = container.textContent.trim().replace(/\s+/g, ' ');
                
                allNotes.push({
                    id: `${entry.id}#${index++}`,
                    date: entry.title, // e.g. "June 17, 2026"
                    isoDate: entry.updated,
                    link: entry.link,
                    type: currentType,
                    contentHtml: htmlContent,
                    contentText: textContent
                });
                currentElements = [];
            }
        };
        
        // Read children elements
        const children = Array.from(doc.body.children);
        
        if (children.length === 0) {
            // Raw text fallback
            allNotes.push({
                id: `${entry.id}#0`,
                date: entry.title,
                isoDate: entry.updated,
                link: entry.link,
                type: 'General',
                contentHtml: `<p>${entry.content}</p>`,
                contentText: doc.body.textContent.trim().replace(/\s+/g, ' ')
            });
            return;
        }
        
        children.forEach(child => {
            if (child.tagName === 'H3') {
                pushCurrentGroup();
                currentType = child.textContent.trim();
            } else {
                currentElements.push(child);
            }
        });
        
        pushCurrentGroup();
    });
}

// Update Sync status text
function updateSyncStatus(timestamp, source, warning) {
    const date = new Date(timestamp * 1000);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    elements.syncStatus.classList.remove('offline');
    
    if (warning) {
        elements.syncStatus.textContent = `Sync Error (fallback to cache at ${timeStr})`;
        elements.syncStatus.title = warning;
        showToast(warning, 'fa-triangle-exclamation', true);
    } else {
        const sourceLabel = source === 'cache' ? 'Cached' : 'Synced';
        elements.syncStatus.textContent = `${sourceLabel} today at ${timeStr}`;
        elements.syncStatus.title = `Source: ${source}`;
    }
}

// Update badges counter in the sidebar
function updateCategoryCounts() {
    const counts = {
        all: allNotes.length,
        Feature: 0,
        Changed: 0,
        Announcement: 0,
        Issue: 0,
        Deprecated: 0
    };
    
    allNotes.forEach(note => {
        if (counts[note.type] !== undefined) {
            counts[note.type]++;
        } else {
            counts.all++;
        }
    });
    
    elements.countAll.textContent = counts.all;
    elements.countFeature.textContent = counts.Feature;
    elements.countChanged.textContent = counts.Changed;
    elements.countAnnouncement.textContent = counts.Announcement;
    elements.countIssue.textContent = counts.Issue;
    elements.countDeprecated.textContent = counts.Deprecated;
}

// Reset Search & Category Filters
function resetFilters() {
    elements.searchInput.value = '';
    elements.clearSearchBtn.style.display = 'none';
    
    elements.filterItems.forEach(i => i.classList.remove('active'));
    document.querySelector('.filter-item[data-type="all"]').classList.add('active');
    
    currentFilter = 'all';
    filterAndRender();
}

// Filter and render updates list
function filterAndRender() {
    const searchQuery = elements.searchInput.value.toLowerCase().trim();
    
    filteredNotes = allNotes.filter(note => {
        // Type filter
        if (currentFilter !== 'all' && note.type !== currentFilter) {
            return false;
        }
        
        // Search filter
        if (searchQuery) {
            const matchesText = note.contentText.toLowerCase().includes(searchQuery);
            const matchesType = note.type.toLowerCase().includes(searchQuery);
            const matchesDate = note.date.toLowerCase().includes(searchQuery);
            return matchesText || matchesType || matchesDate;
        }
        
        return true;
    });
    
    renderNotesList();
}

// Render Notes Cards List
function renderNotesList() {
    elements.cardsContainer.innerHTML = '';
    
    if (filteredNotes.length === 0) {
        showEmptyState();
        return;
    }
    
    hideStates();
    elements.cardsContainer.style.display = 'flex';
    
    // Group notes by date
    const grouped = {};
    filteredNotes.forEach(note => {
        if (!grouped[note.date]) {
            grouped[note.date] = [];
        }
        grouped[note.date].push(note);
    });
    
    // Render groups
    Object.keys(grouped).forEach(date => {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'date-group';
        
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-group-header';
        dateHeader.textContent = date;
        dateGroup.appendChild(dateHeader);
        
        grouped[date].forEach(note => {
            const card = document.createElement('div');
            card.className = `update-card ${selectedNote && selectedNote.id === note.id ? 'selected' : ''}`;
            card.setAttribute('data-type', note.type);
            card.setAttribute('data-id', note.id);
            
            // Check if this type requires special custom tag color
            const typeStr = note.type;
            
            card.innerHTML = `
                <div class="card-header">
                    <span class="badge badge-type" data-type="${note.type}">${typeStr}</span>
                    <span class="card-date">${note.date}</span>
                </div>
                <div class="card-body">
                    ${note.contentHtml}
                </div>
                <div class="card-footer">
                    <button class="quick-tweet-btn" title="Compose Tweet for this update">
                        <i class="fa-brands fa-x-twitter"></i>
                        <span>Draft Tweet</span>
                    </button>
                </div>
            `;
            
            // Card selection click
            card.addEventListener('click', (e) => {
                // Prevent trigger twice if clicking the draft button
                if (e.target.closest('.quick-tweet-btn')) return;
                selectNote(note);
            });
            
            // Draft Tweet button click
            card.querySelector('.quick-tweet-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                selectNote(note);
                // On mobile, scroll or activate composer drawer
                const composerPanel = document.querySelector('.composer-panel');
                composerPanel.classList.add('mobile-active');
            });
            
            dateGroup.appendChild(card);
        });
        
        elements.cardsContainer.appendChild(dateGroup);
    });
}

// Select note to edit
function selectNote(note) {
    selectedNote = note;
    
    // Highlight active card
    document.querySelectorAll('.update-card').forEach(c => {
        c.classList.remove('selected');
        if (c.getAttribute('data-id') === note.id) {
            c.classList.add('selected');
        }
    });
    
    // Setup composer UI
    elements.composerEmptyState.style.display = 'none';
    elements.composerActiveState.style.display = 'flex';
    
    // Mobile responsive show
    document.querySelector('.composer-panel').classList.add('mobile-active');
    
    elements.composerBadge.textContent = note.type;
    elements.composerBadge.className = 'badge'; // Reset classes
    elements.composerBadge.setAttribute('data-type', note.type);
    
    // Add custom style back for type coloring
    elements.composerBadge.style.background = `var(--grad-${note.type.toLowerCase()}, var(--color-general))`;
    if (note.type === 'General') {
        elements.composerBadge.style.background = 'var(--color-general)';
    } else {
        elements.composerBadge.style.background = '';
    }
    
    elements.composerDate.textContent = note.date;
    elements.composerHtml.innerHTML = note.contentHtml;
    
    // Update link
    if (note.link) {
        elements.composerLink.href = note.link;
        elements.composerLink.style.display = 'inline-flex';
    } else {
        elements.composerLink.style.display = 'none';
    }
    
    // Reset copy button status
    elements.copyBtnText.textContent = "Copy Text";
    elements.copyTweetBtn.querySelector('i').className = "fa-solid fa-copy";
    
    // Generate draft
    generateTweetDraft();
    
    // Scroll details to top
    document.querySelector('.preview-scroll').scrollTop = 0;
}

// Deselect active note
function deselectNote() {
    selectedNote = null;
    document.querySelectorAll('.update-card').forEach(c => c.classList.remove('selected'));
    
    elements.composerActiveState.style.display = 'none';
    elements.composerEmptyState.style.display = 'flex';
    
    document.querySelector('.composer-panel').classList.remove('mobile-active');
}

// Generate Tweet Text based on style
function generateTweetDraft() {
    if (!selectedNote) return;
    
    const type = selectedNote.type;
    const date = selectedNote.date;
    const link = selectedNote.link || '';
    const rawText = selectedNote.contentText;
    
    // Tweet length calculations
    // URL in tweet takes exactly 23 characters on X, regardless of actual length.
    // However, when drafting we count the link's raw characters or 23 for accuracy.
    // We'll budget 23 characters for the link, plus 2 for spacing.
    const linkLengthBudget = link ? 25 : 0;
    
    let tweetTemplate = "";
    let baseText = "";
    
    if (currentStyle === 'announcement') {
        // Format: 📢 BigQuery [Type] Update ([Date]): [Text] \n\n🔗 Details: [Link]
        const header = `📢 BigQuery ${type} Update (${date}): `;
        const footer = link ? `\n\n🔗 Details: ${link}` : '';
        const budget = 280 - header.length - linkLengthBudget;
        
        let summary = rawText;
        if (summary.length > budget) {
            summary = summary.substring(0, budget - 3) + '...';
        }
        tweetTemplate = `${header}${summary}${footer}`;
        
    } else if (currentStyle === 'tech') {
        // Format: 🚀 New BigQuery Update!\n\n🛠️ [Type]: [Text]\n\n🔗 Read: [Link]
        const header = `🚀 New BigQuery Update!\n\n🛠️ ${type}: `;
        const footer = link ? `\n\n🔗 Read: ${link}` : '';
        const budget = 280 - header.length - linkLengthBudget;
        
        let summary = rawText;
        if (summary.length > budget) {
            summary = summary.substring(0, budget - 3) + '...';
        }
        tweetTemplate = `${header}${summary}${footer}`;
        
    } else {
        // Minimal style
        // Format: BigQuery ([Date]) | [Type]: [Text] [Link]
        const header = `BigQuery (${date}) | ${type}: `;
        const footer = link ? ` ${link}` : '';
        const budget = 280 - header.length - linkLengthBudget;
        
        let summary = rawText;
        if (summary.length > budget) {
            summary = summary.substring(0, budget - 3) + '...';
        }
        tweetTemplate = `${header}${summary}${footer}`;
    }
    
    elements.tweetTextarea.value = tweetTemplate;
    updateCharCounter(tweetTemplate.length);
}

// Handle Manual Changes in Tweet Composer Text Area
function handleTweetTextChange() {
    const text = elements.tweetTextarea.value;
    updateCharCounter(text.length);
}

// Update Char Counter UI
function updateCharCounter(length) {
    elements.tweetCharCount.textContent = `${length} / 280`;
    
    // Calculate percentage for progress bar
    const percent = Math.min((length / 280) * 100, 100);
    elements.tweetCharProgress.style.width = `${percent}%`;
    
    // Colors based on length
    elements.tweetCharCount.classList.remove('warning', 'danger');
    elements.tweetCharProgress.classList.remove('warning', 'danger');
    
    if (length > 280) {
        elements.tweetCharCount.classList.add('danger');
        elements.tweetCharProgress.classList.add('danger');
        elements.tweetBtn.disabled = true;
    } else if (length > 250) {
        elements.tweetCharCount.classList.add('warning');
        elements.tweetCharProgress.classList.add('warning');
        elements.tweetBtn.disabled = false;
    } else {
        elements.tweetBtn.disabled = false;
    }
}

// Copy Tweet to clipboard
function copyTweetToClipboard() {
    const text = elements.tweetTextarea.value;
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(() => {
        elements.copyBtnText.textContent = "Copied!";
        elements.copyTweetBtn.querySelector('i').className = "fa-solid fa-check";
        
        showToast("Tweet text copied to clipboard!");
        
        setTimeout(() => {
            elements.copyBtnText.textContent = "Copy Text";
            elements.copyTweetBtn.querySelector('i').className = "fa-solid fa-copy";
        }, 3000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        showToast("Failed to copy text.", 'fa-circle-xmark', true);
    });
}

// Share on Twitter Web Intent
function shareOnTwitter() {
    const text = elements.tweetTextarea.value;
    if (!text || text.length > 280) return;
    
    const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, '_blank');
}

// States Toggling functions
function showLoading() {
    elements.loadingState.style.display = 'flex';
    elements.errorState.style.display = 'none';
    elements.emptyState.style.display = 'none';
    elements.cardsContainer.style.display = 'none';
    
    // Spin refresh icon
    elements.refreshIcon.classList.add('spin-icon');
    elements.refreshBtn.disabled = true;
}

function showError(msg) {
    elements.loadingState.style.display = 'none';
    elements.errorState.style.display = 'flex';
    elements.emptyState.style.display = 'none';
    elements.cardsContainer.style.display = 'none';
    
    elements.errorMessage.textContent = msg;
    
    // Stop refresh icon spin
    elements.refreshIcon.classList.remove('spin-icon');
    elements.refreshBtn.disabled = false;
    
    elements.syncStatus.textContent = 'Sync failed';
    elements.syncStatus.classList.add('offline');
}

function showEmptyState() {
    elements.loadingState.style.display = 'none';
    elements.errorState.style.display = 'none';
    elements.emptyState.style.display = 'flex';
    elements.cardsContainer.style.display = 'none';
    
    elements.refreshIcon.classList.remove('spin-icon');
    elements.refreshBtn.disabled = false;
}

function hideStates() {
    elements.loadingState.style.display = 'none';
    elements.errorState.style.display = 'none';
    elements.emptyState.style.display = 'none';
    
    elements.refreshIcon.classList.remove('spin-icon');
    elements.refreshBtn.disabled = false;
}

// Toast System
function showToast(message, icon = 'fa-circle-check', isError = false) {
    const toastIcon = elements.toast.querySelector('.toast-icon');
    toastIcon.className = `fa-solid ${icon}`;
    
    if (isError) {
        elements.toast.style.backgroundColor = '#f43f5e';
    } else {
        elements.toast.style.backgroundColor = '#10b981';
    }
    
    elements.toastMessage.textContent = message;
    elements.toast.classList.add('show');
    
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}
