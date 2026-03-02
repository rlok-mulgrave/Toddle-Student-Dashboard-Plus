// 1. CONFIGURATION
const PRESET_COLORS = [
    "#FFADAD", "#FFD6A5", "#FDFFB6", "#CAFFBF",
    "#9BF6FF", "#A0C4FF", "#BDB2FF", "#FFC6FF",
    "#84DCC6",
    "rainbow",    // Pastel Rainbow
    "rainbow-2"   // Sunset Gradient
];

let classColors = {};
let studentTasks = []; 
let activeCardId = null;
let globalPopup = null;

// 2. LOAD DATA
chrome.storage.sync.get(['classColors', 'studentTasks'], (result) => {
    if (result.classColors) {
        classColors = result.classColors;
    }
    if (result.studentTasks) {
        studentTasks = result.studentTasks;
    }
    processClassCards(); 
});

// 3. CREATE GLOBAL POPUP (Singleton)
function createGlobalPopup() {
    if (document.querySelector('.toddle-palette-popup')) return;

    globalPopup = document.createElement('div');
    globalPopup.className = 'toddle-palette-popup';

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
            if (activeCardId) saveAndApplyColor(activeCardId, color);
            hidePopup();
        });
        globalPopup.appendChild(swatch);
    });

    const customWrapper = document.createElement('div');
    customWrapper.className = 'custom-picker-container';
    customWrapper.title = 'Color Wheel';
    
    const icon = document.createElement('div');
    icon.innerHTML = '🎨'; 
    icon.style.pointerEvents = 'none';
    
    const customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.className = 'toddle-custom-input';
    customInput.addEventListener('input', (e) => {
        if (activeCardId) saveAndApplyColor(activeCardId, e.target.value);
    });
    customInput.addEventListener('click', (e) => e.stopPropagation());

    customWrapper.appendChild(icon);
    customWrapper.appendChild(customInput);
    globalPopup.appendChild(customWrapper);

    document.body.appendChild(globalPopup);
}

// 4. POPUP LOGIC
function showPopup(btnElement, cardId) {
    if (!globalPopup) createGlobalPopup();

    activeCardId = cardId;
    const rect = btnElement.getBoundingClientRect();
    globalPopup.classList.add('visible');

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
    activeCardId = null;
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.toddle-palette-popup') && !e.target.closest('.toddle-color-btn')) {
        hidePopup();
    }
});

// --- TO-DO LIST LOGIC ---
function injectTodoTab() {
    const tabContainer = document.querySelector('.tabs-container');
    const overdueTab = document.querySelector('label[for*="OVERDUE"]');
    
    // We specifically target the parent container to add our class later
    const cardsContainer = document.querySelector('div[class*="ConsolidatedDeadlinesWidget__cardsContainer"]');

    if (!tabContainer || !overdueTab || !cardsContainer || document.getElementById('toddle-todo-tab')) return;

    const todoTab = document.createElement('label');
    todoTab.id = 'toddle-todo-tab';
    todoTab.className = overdueTab.className.replace('active-tab', 'non-active-tab') + ' todo-tab-custom';
    todoTab.innerHTML = `
        <div class="flex justify-center items-center w-full" style="padding: 8px 8px 10px;">
            <span class="truncate max-w-full">TO-DO</span>
        </div>
    `;

    overdueTab.parentNode.insertBefore(todoTab, overdueTab.nextSibling);

    const todoContainer = document.createElement('div');
    todoContainer.id = 'toddle-todo-container';
    todoContainer.innerHTML = `
        <div class="todo-input-wrapper">
            <input type="text" id="todo-new-task" placeholder="Add a task...">
            <button class="todo-add-btn">+</button>
        </div>
        <div class="todo-list-items" id="todo-items-list"></div>
        <button id="todo-clear-completed" class="todo-clear-btn">Clear Completed</button>
    `;
    
    // Append to the main container so it sits alongside the original list
    cardsContainer.appendChild(todoContainer);

    // --- CLICK HANDLER ---
    todoTab.addEventListener('click', () => {
        const allTabs = tabContainer.querySelectorAll('label');
        allTabs.forEach(t => t.classList.remove('active-tab-light-inline', 'text-textDefault'));
        allTabs.forEach(t => t.classList.add('non-active-tab-light-inline', 'text-textSubtle'));
        todoTab.classList.add('active-tab-light-inline', 'text-textDefault');
        todoTab.classList.remove('non-active-tab-light-inline', 'text-textSubtle');

        document.body.classList.add('toddle-todo-active');
        
        todoContainer.classList.add('active');
        renderTasks();
    });

    const toddleLabels = tabContainer.querySelectorAll('label:not(#toddle-todo-tab)');
    toddleLabels.forEach(tab => {
        tab.addEventListener('click', () => {
            todoTab.classList.remove('active-tab-light-inline', 'text-textDefault');
            document.body.classList.remove('toddle-todo-active');
            todoContainer.classList.remove('active');
        });
    });

    todoContainer.querySelector('.todo-add-btn').onclick = addNewTask;
    todoContainer.querySelector('#todo-new-task').onkeypress = (e) => { if(e.key === 'Enter') addNewTask(); };
    todoContainer.querySelector('#todo-clear-completed').onclick = clearCompleted;
}

function clearCompleted() {
    studentTasks = studentTasks.filter(t => !t.completed);
    chrome.storage.sync.set({ studentTasks }, () => renderTasks());
}

function addNewTask() {
    const input = document.getElementById('todo-new-task');
    if (!input.value.trim()) return;
    studentTasks.push({ id: Date.now(), text: input.value.trim() });
    input.value = '';
    chrome.storage.sync.set({ studentTasks }, () => renderTasks());
}

function renderTasks() {
    const list = document.getElementById('todo-items-list');
    const clearBtn = document.getElementById('todo-clear-completed');
    if (!list) return;

    list.innerHTML = studentTasks.length ? '' : '<div style="text-align:center; font-size:12px; color:#999; margin-top:20px;">No tasks yet!</div>';
    
    const hasCompleted = studentTasks.some(t => t.completed);
    if (clearBtn) clearBtn.style.display = hasCompleted ? 'block' : 'none';

    studentTasks.forEach((task) => {
        const item = document.createElement('div');
        item.className = `todo-item ${task.completed ? 'completed' : ''}`;
        
        item.innerHTML = `
            <input type="checkbox" class="todo-item-checkbox" ${task.completed ? 'checked' : ''}>
            <input type="text" class="todo-item-edit-input" value="${task.text}" title="Click to edit">
            <span class="todo-item-delete">✕</span>
        `;

        const editInput = item.querySelector('.todo-item-edit-input');
        const checkbox = item.querySelector('.todo-item-checkbox');

        checkbox.addEventListener('change', () => {
            task.completed = checkbox.checked;
            chrome.storage.sync.set({ studentTasks }, () => renderTasks());
        });

        editInput.addEventListener('blur', (e) => {
            updateTask(task.id, e.target.value);
        });

        editInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') e.target.blur();
        });

        item.querySelector('.todo-item-delete').onclick = () => {
            studentTasks = studentTasks.filter(t => t.id !== task.id);
            chrome.storage.sync.set({ studentTasks }, () => renderTasks());
        };
        
        list.appendChild(item);
    });
}

function updateTask(id, newText) {
    const taskIndex = studentTasks.findIndex(t => t.id === id);
    if (taskIndex > -1) {
        if (newText.trim() === "") {
            renderTasks();
            return;
        }
        studentTasks[taskIndex].text = newText.trim();
        chrome.storage.sync.set({ studentTasks });
    }
}

// 5. MAIN PROCESS LOOP
function processClassCards() {
    organizeLayout();
    moveProjectsToDock();
    injectTodoTab();
    injectQuickAddButtons();
    fetchAndInjectTimetable();

    if (!globalPopup) createGlobalPopup();

    const cards = document.querySelectorAll('div[class*="ClassCardV2__container"]');

    cards.forEach(card => {
        if (getComputedStyle(card).position !== 'relative') {
            card.style.position = 'relative';
        }
        
        const titleEl = card.querySelector('div[class*="ClassCardV2__classLabel"]');
        if (!titleEl) return;

        if (!titleEl.dataset.shortened) {
            let originalText = titleEl.textContent;
            
            if (originalText.startsWith("LEAP")) {
                const parts = originalText.split(' - ');
                if (parts.length > 2) {
                    titleEl.textContent = parts.slice(0, 2).join(' - ').trim();
                    titleEl.dataset.shortened = "true";
                }
            } else {
                if (originalText.includes(' - ')) {
                    titleEl.textContent = originalText.split(' - ')[0].trim();
                    titleEl.dataset.shortened = "true";
                }
            }
        }

        const cardId = titleEl.textContent.trim();
        applyVisuals(card, classColors[cardId]);

        if (!card.querySelector('.toddle-color-btn')) {
            const btn = document.createElement('div');
            btn.className = 'toddle-color-btn';
            btn.title = 'Customize Color';

            const indicator = document.createElement('div');
            indicator.className = 'toddle-color-indicator';
            updateIndicatorVisual(indicator, classColors[cardId]);

            btn.appendChild(indicator);

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (activeCardId === cardId && globalPopup.classList.contains('visible')) {
                    hidePopup();
                } else {
                    showPopup(btn, cardId);
                }
            });

            card.appendChild(btn);
        } else {
            const ind = card.querySelector('.toddle-color-indicator');
            if (ind) updateIndicatorVisual(ind, classColors[cardId]);
        }
    });
}

// 6. HELPER FUNCTIONS
function organizeLayout() {
    let dockContainer = document.getElementById('my-custom-dock');
    if (!dockContainer) {
        const labels = document.querySelectorAll('div[class*="ButtonCard__label"]');
        for (let label of labels) {
            if (label.textContent.trim() === 'Announcements') {
                const card = label.closest('div[class*="ButtonCard__container"]');
                if (card && card.parentElement) {
                    card.parentElement.id = "my-custom-dock"; 
                    break;
                }
            }
        }
    }
}

function moveProjectsToDock() {
    const dock = document.getElementById('my-custom-dock');
    if (!dock) return;

    const projectSelectors = [
        'div[data-test-id="button-dashboard-projectGroup-DP_CAS"]',
        'div[data-test-id="button-dashboard-projectGroup-DP_TOK_ESSAY"]'
    ];

    projectSelectors.forEach(selector => {
        const card = document.querySelector(selector);
        if (card && card.parentElement.id !== 'my-custom-dock') {
            dock.appendChild(card);
        }
    });

    const projectsContainer = document.querySelector('div[class*="GroupedProjectGroupList__container"]');
    if (projectsContainer) {
        projectsContainer.style.display = 'none';
    }
}

// --- QUICK-ADD LOGIC ---
function injectQuickAddButtons() {
    const deadlineItems = document.querySelectorAll('div[class*="ConsolidatedDeadlinesWidget__item___"]');

    deadlineItems.forEach(item => {
        // Prevent "+" button from appearing on our custom timetable cards
        if (item.classList.contains('is-timetable-card') || item.closest('#my-custom-timetable')) return;

        if (item.querySelector('.todo-quick-add-btn') || 
            item.classList.contains('ConsolidatedDeadlinesWidget__itemsWrapper___i6tIQ')) {
            return;
        }

        const quickAdd = document.createElement('div');
        quickAdd.className = 'todo-quick-add-btn';
        quickAdd.title = 'Add to TO-DO List';
        quickAdd.innerHTML = '+';

        quickAdd.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            const taskHeading = item.querySelector('div[class*="ConsolidatedDeadlinesWidget__heading"]');
            if (!taskHeading) return;

            const taskText = taskHeading.textContent.trim();
            
            studentTasks.push({ id: Date.now(), text: taskText });
            chrome.storage.sync.set({ studentTasks }, () => {
                item.classList.add('todo-item-added-success');
                setTimeout(() => item.classList.remove('todo-item-added-success'), 500);
                renderTasks();
            });
        });

        item.appendChild(quickAdd);
    });
}

// --- FETCH AND INJECT TIMETABLE VIA HIDDEN IFRAME ---
function fetchAndInjectTimetable() {
    if (document.getElementById('my-custom-timetable') || document.getElementById('timetable-fetch-iframe')) return;
    
    const currentUrl = window.location.href;
    if (!currentUrl.includes('/courses')) return;

    const timetableUrl = currentUrl.replace('/courses', '/timetable');
    
    const rightSidebar = document.querySelector('div[class*="StudentCourses__deadlinesWidgetContainerV2"]');
    if (!rightSidebar) return;

    const widget = document.createElement('div');
    widget.id = 'my-custom-timetable';
    widget.className = 'ConsolidatedDeadlinesWidget__containerV2___ONBa7';
    
    widget.innerHTML = `
        <div class="ConsolidatedDeadlinesWidget__todoHeader___cViri">
            <div class="ConsolidatedDeadlinesWidget__todoText___aoSHk">Today's Timetable</div>
        </div>
        <div class="ConsolidatedDeadlinesWidget__bodyContainer___fqU_3">
            <div id="timetable-loading-state" style="padding: 20px; text-align: center; color: #888; font-size: 14px;">
                Loading today's classes...
            </div>
            <div class="ConsolidatedDeadlinesWidget__cardsContainer___TL_ZY" style="display: none;" id="timetable-content-wrapper">
                <div class="ConsolidatedDeadlinesWidget__itemsWrapper___i6tIQ" id="timetable-events-list">
                </div>
            </div>
        </div>
    `;
    rightSidebar.appendChild(widget);

    const iframe = document.createElement('iframe');
    iframe.id = 'timetable-fetch-iframe';
    iframe.src = timetableUrl;
    
    // Instead of display: none, we position it off-screen but keep it fully sized so React-Big-Calendar renders its text
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    iframe.style.width = '1200px';
    iframe.style.height = '800px';
    iframe.style.border = 'none';
    
    let checkInterval;
    
    iframe.onload = () => {
        checkInterval = setInterval(() => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                const todayEventsContainer = iframeDoc.querySelector('.rbc-day-slot.rbc-today .rbc-events-container');
                
                if (todayEventsContainer) {
                    const eventEls = todayEventsContainer.querySelectorAll('.rbc-event');
                    
                    let isStillRendering = false;
                    for (let el of eventEls) {
                        if (!el.querySelector('div[class*="TimetableCalendarEvent__titleLabel"]')) {
                            isStillRendering = true;
                            break;
                        }
                    }

                    if (isStillRendering) return;

                    clearInterval(checkInterval);
                    
                    const listWrapper = document.getElementById('timetable-events-list');
                    
                    if (eventEls.length === 0) {
                        listWrapper.innerHTML = '<div style="padding: 15px; text-align: center; color: #888; font-size: 14px;">No classes scheduled for today!</div>';
                    } else {
                        eventEls.forEach(el => {
                            const time = el.querySelector('.rbc-event-label')?.textContent.trim() || '';
                            const title = el.querySelector('div[class*="TimetableCalendarEvent__titleLabel"]')?.textContent.trim() || 'Class';
                            const location = el.querySelector('div[class*="TimetableCalendarEvent__locationLabel"]')?.textContent.trim() || '';
                            
                            // Added "is-timetable-card" so our Quick Add script completely ignores this element
                            const eventHtml = `
                                <div class="ConsolidatedDeadlinesWidget__item___beyKO is-timetable-card" tabindex="0">
                                    <div class="ConsolidatedDeadlinesWidget__wrapper___bjJSL">
                                        <div class="ConsolidatedDeadlinesWidget__middleContainer___ARB7o">
                                            <div class="ConsolidatedDeadlinesWidget__nameWithTagContainer____vDz2">
                                                <div class="text-label-l ConsolidatedDeadlinesWidget__heading___BGhvo" dir="auto">${title}</div>
                                            </div>
                                            <div class="ConsolidatedDeadlinesWidget__dateText___FGTsx">${time}</div>
                                        </div>
                                        <div class="ConsolidatedDeadlinesWidget__middleContainer___ARB7o">
                                            <div class="FeedItem__subHeader___l1I5k">
                                                <div class="FeedItem__bottomTextTitle___BJO8H">${location}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                            listWrapper.insertAdjacentHTML('beforeend', eventHtml);
                        });
                    }
                    
                    document.getElementById('timetable-loading-state').style.display = 'none';
                    document.getElementById('timetable-content-wrapper').style.display = 'block';
                    iframe.remove();
                }
            } catch (e) {
                // Ignore cross-origin access errors during initial load
            }
        }, 500);

        setTimeout(() => {
            if (checkInterval) clearInterval(checkInterval);
            const loader = document.getElementById('timetable-loading-state');
            if (loader && loader.style.display !== 'none') {
                loader.textContent = 'Could not load timetable. Please refresh.';
                iframe.remove();
            }
        }, 10000);
    };
    
    document.body.appendChild(iframe);
}

function applyVisuals(element, colorValue) {
    if (!colorValue) return;
    const setStyle = (val) => element.setAttribute('style', `position: relative; background: ${val} !important; border-color: transparent !important;`);

    if (colorValue === "rainbow") {
        setStyle("linear-gradient(135deg, #FFADAD, #FFD6A5, #FDFFB6, #CAFFBF, #9BF6FF, #A0C4FF, #BDB2FF, #FFC6FF)");
    } else if (colorValue === "rainbow-2") {
        setStyle("linear-gradient(135deg, #845EC2, #D65DB1, #FF6F91, #FF9671, #FFC75F, #F9F871)");
    } else {
        element.style.setProperty('background', colorValue, 'important');
        element.style.setProperty('background-color', colorValue, 'important');
    }
}

function updateIndicatorVisual(indicatorElement, colorValue) {
    if (!colorValue) {
        indicatorElement.style.background = "#eeeeee";
        return;
    }
    if (colorValue === "rainbow") {
        indicatorElement.style.background = "linear-gradient(135deg, #FFADAD, #FFD6A5, #FDFFB6, #CAFFBF, #9BF6FF, #A0C4FF, #BDB2FF, #FFC6FF)";
    } else if (colorValue === "rainbow-2") {
        indicatorElement.style.background = "linear-gradient(135deg, #845EC2, #D65DB1, #FF6F91, #FF9671, #FFC75F, #F9F871)";
    } else {
        indicatorElement.style.background = colorValue;
    }
}

function saveAndApplyColor(cardId, color) {
    classColors[cardId] = color;
    chrome.storage.sync.set({ classColors: classColors });

    const cards = document.querySelectorAll('div[class*="ClassCardV2__container"]');
    cards.forEach(card => {
        const titleEl = card.querySelector('div[class*="ClassCardV2__classLabel"]');
        if (titleEl && titleEl.textContent.trim() === cardId) {
            applyVisuals(card, color);
            const ind = card.querySelector('.toddle-color-indicator');
            if (ind) updateIndicatorVisual(ind, color);
        }
    });
}

// 7. OBSERVER SETUP
const observer = new MutationObserver((mutations) => {
    processClassCards();
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial Run
processClassCards();