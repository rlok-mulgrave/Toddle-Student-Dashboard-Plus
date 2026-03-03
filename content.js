// =========================================
// 1. CONFIGURATION & STATE
// =========================================
const PRESET_COLORS = [
    "#FFADAD", "#FFD6A5", "#FDFFB6", "#CAFFBF",
    "#9BF6FF", "#A0C4FF", "#BDB2FF", "#FFC6FF",
    "#84DCC6",
    "rainbow",
    "rainbow-2"
];

let savedColors = {}; // Shared map for BOTH classes (dashboard) and courses (timetable)
let studentTasks = [];
let activeItemId = null; // Can be a card title or course name
let globalPopup = null;

// =========================================
// 2. DATA LOAD & CORE SYNC
// =========================================
function loadExtensionData() {
    // Migration check: Support both legacy keys if they exist
    chrome.storage.sync.get(['savedColors', 'classColors', 'courseColors', 'studentTasks'], (result) => {
        if (result.savedColors) {
            savedColors = result.savedColors;
        } else {
            // Merge legacy data into new unified map
            savedColors = { ...(result.classColors || {}), ...(result.courseColors || {}) };
        }

        if (result.studentTasks) studentTasks = result.studentTasks;

        runPageLogic();
    });
}

function runPageLogic() {
    const url = window.location.href;
    if (url.includes('/courses')) {
        processDashboardCards();
    } else if (url.includes('/timetable')) {
        processTimetableEvents();
    }
}

// =========================================
// 3. UNIFIED POPUP UI
// =========================================
function createGlobalPopup() {
    if (document.querySelector('.toddle-palette-popup')) return;

    globalPopup = document.createElement('div');
    globalPopup.className = 'toddle-palette-popup';

    // Preset Swatches
    PRESET_COLORS.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';

        if (color === "rainbow") {
            swatch.classList.add('rainbow-swatch');
            swatch.title = "Pastel Rainbow";
        } else if (color === "rainbow-2") {
            swatch.classList.add('rainbow-swatch-2');
            swatch.title = "Sunset Gradient";
        } else {
            swatch.style.backgroundColor = color;
        }

        swatch.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeItemId) saveAndApplyColor(activeItemId, color);
            hidePopup();
        });
        globalPopup.appendChild(swatch);
    });

    // Custom Color Picker (Wheel)
    const wheelWrapper = document.createElement('div');
    wheelWrapper.className = 'custom-picker-container';
    wheelWrapper.title = 'Color Wheel';
    wheelWrapper.innerHTML = '🎨';

    const wheelInput = document.createElement('input');
    wheelInput.type = 'color';
    wheelInput.className = 'toddle-custom-input';
    wheelInput.addEventListener('input', (e) => {
        if (activeItemId) saveAndApplyColor(activeItemId, e.target.value);
    });
    wheelInput.addEventListener('click', (e) => e.stopPropagation());

    wheelWrapper.appendChild(wheelInput);
    globalPopup.appendChild(wheelWrapper);

    // Custom Style (CSS Gradient) Area
    const customStyleBtn = document.createElement('div');
    customStyleBtn.className = 'custom-style-btn';
    customStyleBtn.textContent = 'Custom Style...';

    const customArea = document.createElement('div');
    customArea.className = 'custom-input-area';

    const customTextInput = document.createElement('input');
    customTextInput.type = 'text';
    customTextInput.className = 'custom-text-input';
    customTextInput.placeholder = 'CSS (e.g. linear-gradient...)';

    const applyBtn = document.createElement('button');
    applyBtn.className = 'apply-custom-btn';
    applyBtn.textContent = 'Apply Style';

    applyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeItemId && customTextInput.value.trim()) {
            saveAndApplyColor(activeItemId, customTextInput.value.trim());
        }
        hidePopup();
    });

    customTextInput.addEventListener('click', (e) => e.stopPropagation());
    customStyleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        customArea.classList.toggle('visible');
    });

    customArea.appendChild(customTextInput);
    customArea.appendChild(applyBtn);
    globalPopup.appendChild(customStyleBtn);
    globalPopup.appendChild(customArea);

    document.body.appendChild(globalPopup);
}

function showPopup(btnElement, itemId) {
    if (!globalPopup) createGlobalPopup();

    activeItemId = itemId;
    const rect = btnElement.getBoundingClientRect();
    globalPopup.classList.add('visible');

    // Reset custom area state
    const customArea = globalPopup.querySelector('.custom-input-area');
    if (customArea) customArea.classList.remove('visible');

    const popupHeight = globalPopup.offsetHeight;
    const popupWidth = globalPopup.offsetWidth;

    let top = rect.top - popupHeight - 10;
    let left = rect.left - (popupWidth / 2) + (rect.width / 2);

    if (top < 10) top = rect.bottom + 10;
    if (left + popupWidth > window.innerWidth) left = window.innerWidth - popupWidth - 10;

    globalPopup.style.top = `${top}px`;
    globalPopup.style.left = `${left}px`;
}

function hidePopup() {
    if (globalPopup) globalPopup.classList.remove('visible');
    activeItemId = null;
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.toddle-palette-popup') && !e.target.closest('.toddle-color-btn')) {
        hidePopup();
    }
});

// =========================================
// 4. DASHBOARD FEATURE LOGIC
// =========================================
function processDashboardCards() {
    organizeLayout();
    moveProjectsToDock();
    injectTodoTab();
    injectQuickAddButtons();
    fetchAndInjectTimetablePreview();

    const cards = document.querySelectorAll('div[class*="ClassCardV2__container"]');
    cards.forEach(card => {
        const titleEl = card.querySelector('div[class*="ClassCardV2__classLabel"]');
        if (!titleEl) return;

        // Remember the original name for storage key before we shorten it
        if (!titleEl.dataset.originalName) {
            titleEl.dataset.originalName = titleEl.textContent.trim();
        }

        // Label cleanup
        if (!titleEl.dataset.shortened) {
            titleEl.textContent = shortenClassName(titleEl.textContent);
            titleEl.dataset.shortened = "true";
        }

        const classId = titleEl.dataset.originalName;
        applyVisualStyle(card, savedColors[classId]);
        injectColorButton(card, classId);
    });
}

function organizeLayout() {
    if (document.getElementById('my-custom-dock')) return;
    const labels = document.querySelectorAll('div[class*="ButtonCard__label"]');
    for (let label of labels) {
        if (label.textContent.trim() === 'Announcements') {
            const card = label.closest('div[class*="ButtonCard__container"]');
            if (card?.parentElement) card.parentElement.id = "my-custom-dock";
            break;
        }
    }
}

function moveProjectsToDock() {
    const dock = document.getElementById('my-custom-dock');
    if (!dock) return;

    ['DP_CAS', 'DP_TOK_ESSAY'].forEach(id => {
        const card = document.querySelector(`div[data-test-id="button-dashboard-projectGroup-${id}"]`);
        if (card && card.parentElement.id !== 'my-custom-dock') dock.appendChild(card);
    });

    const projectsList = document.querySelector('div[class*="GroupedProjectGroupList__container"]');
    if (projectsList) projectsList.style.display = 'none';
}

// =========================================
// 5. TIMETABLE PAGE LOGIC
// =========================================
function processTimetableEvents() {
    const events = document.querySelectorAll('.rbc-event');
    events.forEach(eventWrapper => {
        const container = eventWrapper.querySelector('div[class*="TimetableCalendarEvent__eventContainer"]');
        if (!container) return;

        const titleEl = container.querySelector('div[class*="TimetableCalendarEvent__titleLabel"]');
        if (!titleEl) return;

        const courseName = titleEl.textContent.trim();
        applyVisualStyle(container, savedColors[courseName]);
        injectColorButton(container, courseName);
    });
}

// =========================================
// 6. SHARED HELPERS (VISUALS)
// =========================================
function injectColorButton(parent, itemId) {
    if (parent.querySelector('.toddle-color-btn')) {
        const indicator = parent.querySelector('.toddle-color-indicator');
        if (indicator) updateIndicatorColor(indicator, savedColors[itemId]);
        return;
    }

    const btn = document.createElement('div');
    btn.className = 'toddle-color-btn';
    btn.title = 'Customize Color';

    const indicator = document.createElement('div');
    indicator.className = 'toddle-color-indicator';
    updateIndicatorColor(indicator, savedColors[itemId]);

    btn.appendChild(indicator);
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (activeItemId === itemId && globalPopup?.classList.contains('visible')) {
            hidePopup();
        } else {
            showPopup(btn, itemId);
        }
    });

    parent.appendChild(btn);
}

function applyVisualStyle(element, color) {
    if (!color) return;

    // Gradient check
    if (color === "rainbow" || color === "rainbow-2" || color.includes('gradient') || color.includes('url')) {
        let styleVal = color;
        if (color === "rainbow") styleVal = "linear-gradient(135deg, #FFADAD, #FFD6A5, #FDFFB6, #CAFFBF, #9BF6FF, #A0C4FF, #BDB2FF, #FFC6FF)";
        if (color === "rainbow-2") styleVal = "linear-gradient(135deg, #845EC2, #D65DB1, #FF6F91, #FF9671, #FFC75F, #F9F871)";

        element.style.setProperty('background', styleVal, 'important');
        element.style.setProperty('background-image', styleVal, 'important');
        element.style.setProperty('background-color', 'transparent', 'important');
        element.style.setProperty('border-color', 'transparent', 'important');
    } else {
        // Solid color
        element.style.setProperty('background-image', 'none', 'important');
        element.style.setProperty('background-color', color, 'important');
        element.style.setProperty('background', color, 'important');
        element.style.setProperty('border-color', color, 'important');
    }
}

function updateIndicatorColor(indicator, color) {
    if (!color) {
        indicator.style.background = "#eee";
        return;
    }
    applyVisualStyle(indicator, color);
}

function shortenClassName(text) {
    if (!text) return "";
    let cleanText = text.trim();
    if (cleanText.startsWith("LEAP")) {
        const parts = cleanText.split(' - ');
        if (parts.length > 2) return parts.slice(0, 2).join(' - ').trim();
    } else if (cleanText.includes(' - ')) {
        return cleanText.split(' - ')[0].trim();
    }
    return cleanText;
}

function saveAndApplyColor(itemId, color) {
    savedColors[itemId] = color;
    chrome.storage.sync.set({ savedColors: savedColors });

    // Instantly update all instances on the page
    document.querySelectorAll('.toddle-color-btn').forEach(btn => {
        const parent = btn.parentElement;
        const potentialLabels = [
            { sel: 'div[class*="ClassCardV2__classLabel"]', attr: 'originalName' },
            { sel: 'div[class*="TimetableCalendarEvent__titleLabel"]' }
        ];

        for (let config of potentialLabels) {
            const label = parent.querySelector(config.sel);
            if (label) {
                const name = config.attr ? label.dataset[config.attr] : label.textContent.trim();
                if (name === itemId) {
                    applyVisualStyle(parent, color);
                    updateIndicatorColor(btn.querySelector('.toddle-color-indicator'), color);
                    break;
                }
            }
        }
    });
}

// =========================================
// 7. TO-DO & TIMETABLE PREVIEW (DASHBOARD ONLY)
// =========================================
function injectTodoTab() {
    const tabs = document.querySelector('.tabs-container');
    const cardsContainer = document.querySelector('div[class*="ConsolidatedDeadlinesWidget__cardsContainer"]');
    if (!tabs || !cardsContainer || document.getElementById('toddle-todo-tab')) return;

    const overdueTab = document.querySelector('label[for*="OVERDUE"]');
    if (!overdueTab) return;

    const todoTab = document.createElement('label');
    todoTab.id = 'toddle-todo-tab';
    todoTab.className = overdueTab.className.replace('active-tab', 'non-active-tab') + ' todo-tab-custom';
    todoTab.innerHTML = `<div class="flex justify-center items-center w-full" style="padding: 8px 8px 10px;"><span class="truncate max-w-full">TO-DO</span></div>`;
    overdueTab.parentNode.insertBefore(todoTab, overdueTab.nextSibling);

    const todoContainer = document.createElement('div');
    todoContainer.id = 'toddle-todo-container';
    todoContainer.innerHTML = `
        <div class="todo-input-wrapper"><input type="text" id="todo-new-task" placeholder="Add a task..."><button class="todo-add-btn">+</button></div>
        <div class="todo-list-items" id="todo-items-list"></div>
        <button id="todo-clear-completed" class="todo-clear-btn">Clear Completed</button>
    `;
    cardsContainer.appendChild(todoContainer);

    todoTab.addEventListener('click', () => {
        tabs.querySelectorAll('label').forEach(t => {
            t.classList.remove('active-tab-light-inline', 'text-textDefault');
            t.classList.add('non-active-tab-light-inline', 'text-textSubtle');
        });
        todoTab.classList.add('active-tab-light-inline', 'text-textDefault');
        todoTab.classList.remove('non-active-tab-light-inline', 'text-textSubtle');
        document.body.classList.add('toddle-todo-active');
        todoContainer.classList.add('active');
        renderTasks();
    });

    tabs.querySelectorAll('label:not(#toddle-todo-tab)').forEach(tab => {
        tab.addEventListener('click', () => {
            todoTab.classList.remove('active-tab-light-inline', 'text-textDefault');
            document.body.classList.remove('toddle-todo-active');
            todoContainer.classList.remove('active');
        });
    });

    todoContainer.querySelector('.todo-add-btn').onclick = addNewTask;
    todoContainer.querySelector('#todo-new-task').onkeypress = (e) => { if (e.key === 'Enter') addNewTask(); };
    todoContainer.querySelector('#todo-clear-completed').onclick = clearCompletedTasks;
}

function addNewTask() {
    const input = document.getElementById('todo-new-task');
    if (!input.value.trim()) return;
    studentTasks.push({ id: Date.now(), text: input.value.trim() });
    input.value = '';
    chrome.storage.sync.set({ studentTasks }, renderTasks);
}

function clearCompletedTasks() {
    studentTasks = studentTasks.filter(t => !t.completed);
    chrome.storage.sync.set({ studentTasks }, renderTasks);
}

function renderTasks() {
    const list = document.getElementById('todo-items-list');
    if (!list) return;

    list.innerHTML = studentTasks.length ? '' : '<div style="text-align:center; font-size:12px; color:#999; margin-top:20px;">No tasks yet!</div>';

    document.getElementById('todo-clear-completed').style.display = studentTasks.some(t => t.completed) ? 'block' : 'none';

    studentTasks.forEach(task => {
        const item = document.createElement('div');
        item.className = `todo-item ${task.completed ? 'completed' : ''}`;
        item.innerHTML = `
            <input type="checkbox" class="todo-item-checkbox" ${task.completed ? 'checked' : ''}>
            <input type="text" class="todo-item-edit-input" value="${task.text}">
            <span class="todo-item-delete">✕</span>
        `;

        item.querySelector('.todo-item-checkbox').onchange = (e) => {
            task.completed = e.target.checked;
            chrome.storage.sync.set({ studentTasks }, renderTasks);
        };

        const edit = item.querySelector('.todo-item-edit-input');
        edit.onblur = (e) => {
            if (!e.target.value.trim()) { renderTasks(); return; }
            task.text = e.target.value.trim();
            chrome.storage.sync.set({ studentTasks });
        };
        edit.onkeypress = (e) => { if (e.key === 'Enter') e.target.blur(); };

        item.querySelector('.todo-item-delete').onclick = () => {
            studentTasks = studentTasks.filter(t => t.id !== task.id);
            chrome.storage.sync.set({ studentTasks }, renderTasks);
        };
        list.appendChild(item);
    });
}

function injectQuickAddButtons() {
    document.querySelectorAll('div[class*="ConsolidatedDeadlinesWidget__item___"]').forEach(item => {
        if (item.querySelector('.todo-quick-add-btn') || item.closest('#my-custom-timetable')) return;

        const btn = document.createElement('div');
        btn.className = 'todo-quick-add-btn';
        btn.innerHTML = '+';
        btn.onclick = (e) => {
            e.stopPropagation();
            const heading = item.querySelector('div[class*="ConsolidatedDeadlinesWidget__heading"]');
            if (heading) {
                studentTasks.push({ id: Date.now(), text: heading.textContent.trim() });
                chrome.storage.sync.set({ studentTasks }, () => {
                    item.classList.add('todo-item-added-success');
                    setTimeout(() => item.classList.remove('todo-item-added-success'), 500);
                    renderTasks();
                });
            }
        };
        item.appendChild(btn);
    });
}

function fetchAndInjectTimetablePreview() {
    if (document.getElementById('my-custom-timetable') || !window.location.href.includes('/courses')) return;

    const sidebar = document.querySelector('div[class*="StudentCourses__deadlinesWidgetContainerV2"]');
    if (!sidebar) return;

    const widget = document.createElement('div');
    widget.id = 'my-custom-timetable';
    widget.className = 'ConsolidatedDeadlinesWidget__containerV2___ONBa7';
    widget.innerHTML = `
        <div class="ConsolidatedDeadlinesWidget__todoHeader___cViri"><div class="ConsolidatedDeadlinesWidget__todoText___aoSHk">Today's Timetable</div></div>
        <div id="timetable-loading" style="padding:20px; text-align:center; color:#888;">Loading classes...</div>
        <div id="timetable-content" style="display:none;" class="ConsolidatedDeadlinesWidget__cardsContainer___TL_ZY"><div id="timetable-list" class="toddle-timetable-items-wrapper"></div></div>
    `;
    sidebar.appendChild(widget);

    const iframe = document.createElement('iframe');
    iframe.src = window.location.href.replace('/courses', '/timetable');
    iframe.style.cssText = 'position:absolute; left:-9999px; width:1200px; height:800px;';

    iframe.onload = () => {
        let attempts = 0;
        const interval = setInterval(() => {
            try {
                const doc = iframe.contentDocument;
                const container = doc.querySelector('.rbc-day-slot.rbc-today .rbc-events-container');
                const events = container?.querySelectorAll('.rbc-event');

                if (container && events.length >= 0) {
                    clearInterval(interval);
                    const list = document.getElementById('timetable-list');
                    if (events.length === 0) {
                        list.innerHTML = '<div style="padding:15px; text-align:center; color:#888;">No classes today!</div>';
                    } else {
                        events.forEach(el => {
                            const time = el.querySelector('.rbc-event-label')?.textContent || '';
                            const rawTitle = el.querySelector('div[class*="TimetableCalendarEvent__titleLabel"]')?.textContent || 'Class';
                            const title = shortenClassName(rawTitle);
                            const loc = el.querySelector('div[class*="TimetableCalendarEvent__locationLabel"]')?.textContent || '';
                            list.insertAdjacentHTML('beforeend', `
                                <div class="ConsolidatedDeadlinesWidget__item___beyKO is-timetable-card">
                                    <div class="ConsolidatedDeadlinesWidget__wrapper___bjJSL">
                                        <div class="ConsolidatedDeadlinesWidget__middleContainer___ARB7o">
                                            <div class="text-label-l ConsolidatedDeadlinesWidget__heading___BGhvo">${title}</div>
                                            <div class="ConsolidatedDeadlinesWidget__dateText___FGTsx">${time}</div>
                                        </div>
                                        <div class="FeedItem__bottomTextTitle___BJO8H">${loc}</div>
                                    </div>
                                </div>
                            `);
                        });
                    }
                    document.getElementById('timetable-loading').style.display = 'none';
                    document.getElementById('timetable-content').style.display = 'block';
                    iframe.remove();
                }
            } catch (e) { }
            if (++attempts > 20) { clearInterval(interval); iframe.remove(); }
        }, 500);
    };
    document.body.appendChild(iframe);
}

// =========================================
// 8. OBSERVER & INITIALIZATION
// =========================================
const observer = new MutationObserver(() => runPageLogic());
observer.observe(document.body, { childList: true, subtree: true });

loadExtensionData();