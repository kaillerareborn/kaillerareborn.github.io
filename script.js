const contentCache = new Map();
const abortControllers = new Map();

let activeSubPopup = null;
let lastFocusedElement = null;
let activeChipTrigger = null;

const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const skeletonHTML = `
  <div class="skeleton-wrapper">
    <div class="skeleton skeleton-title"></div>
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-text skeleton-text-short"></div>
  </div>
`;

const animateShow = (element) => {
  if (!element) return;
  element.dataset.isClosing = 'false';
  element.style.display = 'block';
  void element.offsetHeight;
  element.classList.add('show');
};

const animateHide = (element, onHidden = null) => {
  if (!element) return;
  element.dataset.isClosing = 'true';
  element.classList.remove('show');

  const handleTransitionEnd = (e) => {
    if (e.target !== element) return;
    if (element.dataset.isClosing !== 'true') return;
    element.style.display = 'none';
    if (onHidden) onHidden();
    delete element.dataset.isClosing;
  };

  element.addEventListener('transitionend', handleTransitionEnd, { once: true });
  setTimeout(() => {
    if (element.dataset.isClosing === 'true') {
      element.style.display = 'none';
      if (onHidden) onHidden();
      delete element.dataset.isClosing;
    }
  }, 300);
};

const toggleScrollLock = (shouldLock) => {
  document.body.classList.toggle('popup-open', shouldLock);
};

const closeActiveSubPopup = () => {
  if (!activeSubPopup) return;
  activeSubPopup.classList.remove('md3-subpopup-open');
  const prevCategory = activeSubPopup.closest('.md3-popup-category');
  if (prevCategory) {
    prevCategory.classList.remove('md3-popup-category--active');
    const trigger = prevCategory.querySelector('.md3-popup-link.md3-popup-with-arrow');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }
  activeSubPopup = null;
};

const closeAllChips = (exceptChip = null, restoreFocus = false) => {
  for (const chip of document.querySelectorAll('.md3-chip-popup')) {
    if (chip === exceptChip) continue;

    chip.classList.remove('md3-chip--active', 'md3-popup-right', 'md3-popup-up');

    const popup = chip.querySelector('.md3-small-popup');
    if (popup) animateHide(popup);

    const button = chip.querySelector('button');
    if (button) button.setAttribute('aria-expanded', 'false');
  }
  closeActiveSubPopup();

  if (restoreFocus && activeChipTrigger && !exceptChip) {
    if (document.body.contains(activeChipTrigger)) activeChipTrigger.focus();
    activeChipTrigger = null;
  }
};

const trapFocus = (element, event) => {
  const focusableContent = element.querySelectorAll(focusableSelector);
  if (focusableContent.length === 0) {
    event.preventDefault();
    return;
  }

  const firstFocusable = focusableContent[0];
  const lastFocusable = focusableContent[focusableContent.length - 1];
  const isShiftTab = event.shiftKey && document.activeElement === firstFocusable;
  const isTab = !event.shiftKey && document.activeElement === lastFocusable;

  if (isShiftTab || isTab) {
    (isShiftTab ? lastFocusable : firstFocusable).focus();
    event.preventDefault();
  }
};

const handlePopupKeydown = (e) => {
  const popup = document.getElementById('popup');
  if (!popup?.classList.contains('show') || e.key !== 'Tab') return;
  trapFocus(popup, e);
};

const openMainPopup = async (triggerElement, isOverlay = true) => {
  const popup = document.getElementById('popup');
  const popupContentWrapper = document.getElementById('popup-content-wrapper');
  const popupTitle = document.getElementById('popup-title');
  const popupDescription = document.getElementById('popup-description');
  const type = triggerElement.getAttribute('data-trigger-popup');
  const url = triggerElement.getAttribute('data-source');

  if (!url || !popup || !popupContentWrapper) return;

  closeAllChips(null, false);

  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (popupTitle) popupTitle.textContent = 'Loading...';
  if (popupDescription) popupDescription.textContent = 'Loading content...';

  popupContentWrapper.innerHTML = skeletonHTML;

  if (isOverlay) {
    toggleScrollLock(true);

    let overlay = document.querySelector('.overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'overlay';
      overlay.addEventListener('click', closeMainPopup);
      document.body.appendChild(overlay);
    }
    requestAnimationFrame(() => animateShow(overlay));
  }

  popup.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => animateShow(popup));

  document.addEventListener('keydown', handlePopupKeydown);

  const closeBtn = popup.querySelector('.close');
  if (closeBtn) closeBtn.focus();

  if (contentCache.has(type)) {
    renderPopupContent(contentCache.get(type), type, popupContentWrapper, popupTitle);
    return;
  }

  abortControllers.get(type)?.abort();
  const controller = new AbortController();
  abortControllers.set(type, controller);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Unable to load content');
    const htmlText = await response.text();
    contentCache.set(type, htmlText);
    renderPopupContent(htmlText, type, popupContentWrapper, popupTitle);
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('Error loading popup content:', error);
    popupContentWrapper.innerHTML = `<div role="alert" aria-live="assertive"><p>${error.message || 'Unable to load content. Please try again.'}</p></div>`;
    if (popupTitle) popupTitle.textContent = 'Error Loading Content';
  } finally {
    abortControllers.delete(type);
  }
};

const renderPopupContent = (htmlText, type, wrapper, titleEl) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');

  doc.querySelectorAll('script').forEach(script => script.remove());

  for (const el of doc.body.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    }
    const href = el.getAttribute('href');
    if (el.tagName === 'A' && href?.toLowerCase().startsWith('javascript:')) {
      el.setAttribute('href', '#');
    }
  }

  wrapper.innerHTML = doc.body.childNodes.length === 0
    ? '<p>No content available.</p>'
    : '';

  if (doc.body.childNodes.length > 0) {
    wrapper.append(...doc.body.childNodes);
  }

  if (titleEl) {
    titleEl.textContent = doc.querySelector('h1, h2')?.textContent || type[0].toUpperCase() + type.slice(1);
  }

  adjustPreWidths(wrapper);
};

const adjustPreWidths = (wrapper) => {
  const preElements = wrapper.querySelectorAll('pre');
  if (preElements.length === 0) return;

  requestAnimationFrame(() => {
    let maxWidth = 0;
    for (const pre of preElements) {
      maxWidth = Math.max(maxWidth, pre.scrollWidth);
    }

    if (maxWidth > 0) {
      for (const pre of preElements) {
        pre.style.width = `${maxWidth}px`;
      }
    }
  });
};

const closeMainPopup = () => {
  const popup = document.getElementById('popup');
  const overlay = document.querySelector('.overlay');

  document.removeEventListener('keydown', handlePopupKeydown);

  animateHide(popup, () => {
    popup.setAttribute('aria-hidden', 'true');
  });

  animateHide(overlay, () => {
    if (overlay && !overlay.classList.contains('show')) {
      overlay.remove();
    }
  });

  setTimeout(() => {
    toggleScrollLock(false);
    lastFocusedElement?.focus();
    lastFocusedElement = null;
  }, 250);
};

const handleGlobalClose = () => {
  closeAllChips(null, true);
  closeMainPopup();
};

const checkPopupPosition = (chip, popup) => {
  if (!popup || window.innerWidth <= 768) {
    chip?.classList.remove('md3-popup-right', 'md3-popup-up');
    return;
  }

  const wasHidden = !popup.classList.contains('show');
  if (wasHidden) {
    popup.classList.add('measuring');
  }

  const rect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  chip.classList.toggle('md3-popup-right', rect.right > viewportWidth);
  chip.classList.toggle('md3-popup-up', rect.bottom > viewportHeight);

  if (wasHidden) {
    popup.classList.remove('measuring');
  }
};

const ripplePool = new Map();

const createRipple = (event) => {
  const button = event.currentTarget;
  const diameter = Math.max(button.clientWidth, button.clientHeight);
  const radius = diameter / 2;
  const rect = button.getBoundingClientRect();

  let circle = ripplePool.get(button);
  if (!circle) {
    circle = document.createElement('span');
    circle.className = 'ripple';
    ripplePool.set(button, circle);
  }

  circle.style.animation = 'none';
  circle.offsetHeight;

  circle.style.width = `${diameter}px`;
  circle.style.height = `${diameter}px`;
  circle.style.left = `${event.clientX - rect.left - radius}px`;
  circle.style.top = `${event.clientY - rect.top - radius}px`;
  circle.style.animation = '';

  if (!circle.parentNode) {
    button.appendChild(circle);
  }

  circle.addEventListener('animationend', () => {
    circle.remove();
  }, { once: true });
};

document.addEventListener('click', (e) => {
  const target = e.target.closest('.ripple-target');
  if (target) createRipple({ currentTarget: target, clientX: e.clientX, clientY: e.clientY });

  const popupTrigger = e.target.closest('[data-trigger-popup]');
  if (popupTrigger) {
    e.preventDefault();
    openMainPopup(popupTrigger, true);
    return;
  }

  if (e.target.closest('.close')) {
    closeMainPopup();
    return;
  }

  const chip = e.target.closest('.md3-chip-popup');
  if (chip) {
    if (e.target.closest('.md3-popup-link, .md3-small-popup')) return;

    const button = chip.querySelector('button');
    const popup = chip.querySelector('.md3-small-popup');
    const wasOpen = popup?.classList.contains('show');

    closeAllChips(null, false);

    if (!wasOpen && popup) {
      activeChipTrigger = button;
      checkPopupPosition(chip, popup);
      animateShow(popup);
      button?.setAttribute('aria-expanded', 'true');
      chip.classList.add('md3-chip--active');
    } else {
      activeChipTrigger = null;
    }
    return;
  }

  if (!e.target.closest('.popup-content')) handleGlobalClose();
}, { capture: true });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') handleGlobalClose();

  if (e.key === 'Tab') {
    const activeChip = document.querySelector('.md3-chip-popup.md3-chip--active');
    if (activeChip) trapFocus(activeChip.querySelector('.md3-small-popup'), e);
  }
});

const initializeSubMenus = () => {
  for (const category of document.querySelectorAll('.md3-popup-category')) {
    const triggerBtn = category.querySelector('.md3-popup-link.md3-popup-with-arrow');
    const subPopup = category.querySelector('.md3-small-popup--level2');
    if (!triggerBtn || !subPopup) continue;

    const openSubmenu = () => {
      clearTimeout(window.hoverTimeout);
      if (activeSubPopup && activeSubPopup !== subPopup) closeActiveSubPopup();
      subPopup.classList.add('md3-subpopup-open');
      activeSubPopup = subPopup;
      category.classList.add('md3-popup-category--active');
      triggerBtn.setAttribute('aria-expanded', 'true');
    };

    const closeSubmenu = () => {
      if (activeSubPopup === subPopup) closeActiveSubPopup();
    };

    if (window.matchMedia('(hover: hover)').matches) {
      category.addEventListener('mouseenter', () => {
        if (window.innerWidth > 768) openSubmenu();
      });

      category.addEventListener('mouseleave', () => {
        if (window.innerWidth > 768) window.hoverTimeout = setTimeout(closeSubmenu, 500);
      });
    }

    triggerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      activeSubPopup === subPopup ? closeActiveSubPopup() : openSubmenu();
    });

    triggerBtn.addEventListener('focus', () => {
      if (activeSubPopup && activeSubPopup !== subPopup) closeActiveSubPopup();
    });

    subPopup.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeSubmenu();
        triggerBtn.focus();
      }
    });
  }
};

const retroArchData = [
  { text: 'Linux (x86_64)', url: 'https://kr.2manygames.fr/retroarch-k-linux' },
  { text: 'Windows (32-bit)', url: 'https://kr.2manygames.fr/retroarch-k-windows-x86' },
  { text: 'Windows (64-bit)', url: 'https://kr.2manygames.fr/retroarch-k-windows' }
];

const oldEmulatorsData = [
  {
    category: 'Arcade',
    id: 'arcade-menu',
    items: [
      { type: 'header', text: 'Arcade' },
      { type: 'link', text: 'MAME32k', url: 'https://kr.2manygames.fr/emulators/MAME32k%200.64%20(Feb%20%203%202003).zip' },
      { type: 'link', text: 'MAME32++', url: 'https://kr.2manygames.fr/emulators/MAME32++%200.119%20(Sep%2014%202007).zip' },
      { type: 'link', text: 'Houba', url: 'https://kr.2manygames.fr/emulators/Houba32K+%200.125%20R13%20(Jun%2027%202009).zip' }
    ]
  },
  {
    category: 'Atari',
    id: 'atari-menu',
    items: [
      { type: 'header', text: '8 bit systems' },
      { type: 'link', text: 'Atari800Win Plus', url: 'https://kr.2manygames.fr/emulators/Atari800Win%20PLus%204.1.zip' }
    ]
  },
  {
    category: 'Commodore',
    id: 'commodore-menu',
    items: [
      { type: 'header', text: 'Amiga' },
      { type: 'link', text: 'WinUAE-Kaillera', url: 'https://kr.2manygames.fr/emulators/WinUAE-Kaillera-2-2.zip' },
      { type: 'header', text: 'C64' },
      { type: 'link', text: 'CCS64', url: 'https://kr.2manygames.fr/emulators/CCS64%20V3.10.zip' }
    ]
  },
  {
    category: 'Mattel',
    id: 'mattel-menu',
    items: [
      { type: 'header', text: 'Intellivision' },
      { type: 'link', text: 'Nostalgia', url: 'https://kr.2manygames.fr/emulators/Nostalgia%205.0.zip' }
    ]
  },
  {
    category: 'Microsoft',
    id: 'microsoft-menu',
    items: [
      { type: 'header', text: 'MSX' },
      { type: 'link', text: 'Meisei', url: 'https://kr.2manygames.fr/emulators/Meisei%201.3.2.zip' }
    ]
  },
  {
    category: 'Nintendo',
    id: 'nintendo-menu',
    items: [
      { type: 'header', text: 'NES' },
      { type: 'link', text: 'Nestopia', url: 'https://kr.2manygames.fr/emulators/Nestopia%201.40.zip' },
      { type: 'header', text: 'SNES' },
      { type: 'link', text: 'Snes9k', url: 'https://kr.2manygames.fr/emulators/Snes9k%200.09z.zip' },
      { type: 'header', text: 'N64' },
      { type: 'link', text: 'Mupen64++', url: 'https://kr.2manygames.fr/emulators/Mupen64++%20Beta%200.1.3.12.zip' },
      { type: 'link', text: 'Project64k', url: 'https://kr.2manygames.fr/emulators/Project64k%200.13%20(01%20Aug%202003).zip' }
    ]
  },
  {
    category: 'Sega',
    id: 'sega-menu',
    items: [
      { type: 'header', text: 'Mega Drive' },
      { type: 'link', text: 'Gens', url: 'https://kr.2manygames.fr/emulators/Gens%202.10.zip' },
      { type: 'header', text: 'Dreamcast' },
      { type: 'link', text: 'DEmul', url: 'https://www.emu-france.com/?wpfb_dl=7038' }
    ]
  },
  {
    category: 'Sony',
    id: 'sony-menu',
    items: [
      { type: 'header', text: 'PlayStation' },
      { type: 'link', text: 'ePSXe', url: 'https://kr.2manygames.fr/emulators/ePSXe%201.6.0.zip' }
    ]
  }
];

const renderMultiMenu = (containerId, data) => {
  const container = document.getElementById(containerId);
  if (!container) return;

  const fragment = document.createDocumentFragment();

  data.forEach(({ category, id, items }) => {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'md3-popup-item md3-popup-category';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'md3-popup-link md3-popup-with-arrow ripple-target';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-controls', id);
    button.textContent = category;

    const submenuDiv = document.createElement('div');
    submenuDiv.id = id;
    submenuDiv.className = 'md3-small-popup md3-small-popup--level2';
    submenuDiv.setAttribute('aria-label', `${category} emulators`);

    for (const { type, text, url } of items) {
      if (type === 'header') {
        const headerDiv = document.createElement('div');
        headerDiv.className = 'md3-popup-header';
        headerDiv.textContent = text;
        const dividerDiv = document.createElement('div');
        dividerDiv.className = 'md3-popup-divider';
        submenuDiv.appendChild(headerDiv);
        submenuDiv.appendChild(dividerDiv);
      } else if (type === 'link') {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'md3-popup-item';
        const link = document.createElement('a');
        link.className = 'md3-popup-link ripple-target';
        link.href = url;
        link.textContent = text;
        itemDiv.appendChild(link);
        submenuDiv.appendChild(itemDiv);
      }
    }

    categoryDiv.append(button, submenuDiv);
    fragment.appendChild(categoryDiv);
  });

  container.appendChild(fragment);
};

const renderSingleMenu = (containerId, items) => {
  const container = document.getElementById(containerId);
  if (!container) return;

  const fragment = document.createDocumentFragment();
  for (const { url, text } of items) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'md3-popup-item';
    const link = document.createElement('a');
    link.className = 'md3-popup-link ripple-target';
    link.href = url;
    link.textContent = text;
    link.setAttribute('role', 'menuitem');
    itemDiv.appendChild(link);
    fragment.appendChild(itemDiv);
  }
  container.appendChild(fragment);
};

renderSingleMenu('retroarch-k-popup', retroArchData);
renderMultiMenu('old-emulators-popup', oldEmulatorsData);
initializeSubMenus();

const initIntersectionObserver = () => {
  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.1, rootMargin: '50px' });

  for (const card of document.querySelectorAll('.md3-card')) {
    observer.observe(card);
  }
};

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const handleResize = debounce(() => {
  const activeChip = document.querySelector('.md3-chip-popup.md3-chip--active');
  if (activeChip) checkPopupPosition(activeChip, activeChip.querySelector('.md3-small-popup'));
}, 150);

window.addEventListener('resize', handleResize);

const awaitReady = async () => {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    document.addEventListener('DOMContentLoaded', resolve, { once: true });
  });
};

let activeTab = 'servers';

const tablesState = {
  servers: {
    data: [],
    sortColumn: 'numUsers',
    sortDir: 'desc',
    tbodyId: 'server-table-body',
    tabId: 'servers-tab',
    url: 'https://kaillerareborn.2manygames.fr/server_list.json',
    lastFetchTime: 0,
    isFetching: false
  },
  games: {
    data: [],
    sortColumn: 'gameName',
    sortDir: 'asc',
    tbodyId: 'game-table-body',
    tabId: 'games-tab',
    url: 'https://kaillerareborn.2manygames.fr/game_list.json',
    lastFetchTime: 0,
    isFetching: false
  }
};

const REFRESH_COOLDOWN = 5000;

const fetchData = async (type) => {
  const state = tablesState[type];
  if (state.isFetching) return;
  state.isFetching = true;

  const refreshButton = document.getElementById('refresh-active-list');

  const now = Date.now();
  const timeSinceLast = now - state.lastFetchTime;
  const waitMs = Math.max(0, REFRESH_COOLDOWN - timeSinceLast);

  if (refreshButton && activeTab === type) {
    refreshButton.classList.add('rotating');
  }

  if (waitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  state.lastFetchTime = Date.now();

  try {
    const response = await fetch(state.url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();
    let data = Array.isArray(result.data) ? result.data : (Array.isArray(result) ? result : []);

    state.data = data;
    renderTable(type);
  } catch (error) {
    console.error(`Failed to fetch ${type} list:`, error);
    const tbody = document.getElementById(state.tbodyId);
    if (tbody) tbody.innerHTML = `<tr><td colspan="10">Failed to load ${type} list.</td></tr>`;
  } finally {
    if (refreshButton && activeTab === type) {
      refreshButton.classList.remove('rotating');
    }
    state.isFetching = false;
  }
};

let activeCopyButton = null;

const renderTable = (type) => {
  const state = tablesState[type];
  const tbody = document.getElementById(state.tbodyId);
  tbody.innerHTML = '';

  if (state.data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10">No data available.</td></tr>`;
    return;
  }

  const sortedData = [...state.data].sort((a, b) => {
    let valA = a[state.sortColumn] ?? '';
    let valB = b[state.sortColumn] ?? '';

    if (!isNaN(valA) && !isNaN(valB) && valA !== '' && valB !== '') {
      valA = Number(valA);
      valB = Number(valB);
    } else {
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
    }

    if (valA < valB) return state.sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return state.sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  sortedData.forEach(item => {
    const row = document.createElement('tr');

    if (type === 'servers') {
      row.innerHTML = `
        <td>${item.website ? `<a href="${item.website}" target="_blank" rel="noopener noreferrer">${item.serverName || 'N/A'}</a>` : (item.serverName || 'N/A')}</td>
        <td>${item.location || 'N/A'}</td>
        <td>${item.numUsers || 0}</td>
        <td>${item.numGames || 0}</td>
        <td>${item.version || 'N/A'}</td>
        <td>
          <button type="button" class="copy-btn-mini" onclick="copyToClipboard('${item.ipAddress}', this)">Copy</button>
        </td>
      `;
    } else {
      row.innerHTML = `
        <td>${item.gameName || 'N/A'}</td>
        <td>${item.emulatorName || 'N/A'}</td>
        <td>${item.userName || 'N/A'}</td>
        <td>${item.playerCount || 0}</td>
        <td>${item.serverName || 'N/A'}</td>
        <td>${item.location || 'N/A'}</td>
        <td>
          <button type="button" class="copy-btn-mini" onclick="copyToClipboard('${item.ipAddress}', this)">Copy</button>
        </td>
      `;
    }
    tbody.appendChild(row);
  });

  if (type === activeTab) {
    updateCounterText(type);
  }
};

window.copyToClipboard = (text, button) => {
  if (activeCopyButton && activeCopyButton !== button) {
    activeCopyButton.textContent = 'Copy';
    activeCopyButton.classList.remove('copied');
  }

  navigator.clipboard.writeText(text || '').then(() => {
    button.textContent = 'Copied!';
    button.classList.add('copied');
    activeCopyButton = button;
  }).catch(err => console.error('Copy failed', err));
};

const handleSort = (type, column, headerElement) => {
  const state = tablesState[type];
  if (state.sortColumn === column) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortColumn = column;
    state.sortDir = 'asc';
  }

  const table = headerElement.closest('table');
  table.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
  });
  headerElement.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');

  renderTable(type);
};

const switchTab = (tab) => {
  activeTab = tab;

  document.querySelectorAll('.tab-switcher .md3-chip').forEach(chip => {
    const isActive = chip.dataset.tab === tab;
    chip.classList.toggle('md3-chip--active', isActive);
    chip.setAttribute('aria-selected', isActive);
  });

  ['servers', 'games'].forEach(type => {
    const tabElement = document.getElementById(tablesState[type].tabId);
    if (tabElement) {
      tabElement.style.display = type === tab ? 'block' : 'none';
    }
  });
  fetchData(tab);
  updateCounterText(tab);
};

const updateCounterText = (type) => {
  const counter = document.getElementById('list-counter');
  if (!counter) return;
  const count = tablesState[type].data.length;
  const label = type === 'servers' ? 'servers' : 'games';
  counter.textContent = `${count} ${label}`;
};

const initializeTables = () => {
  document.querySelectorAll('.tab-switcher .md3-chip').forEach(chip => {
    chip.addEventListener('click', () => switchTab(chip.dataset.tab));
  });
  document.getElementById('refresh-active-list')?.addEventListener('click', () => fetchData(activeTab));

  ['servers', 'games'].forEach(type => {
    const state = tablesState[type];
    const table = document.getElementById(state.tbodyId).closest('table');
    table.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => handleSort(type, th.dataset.sort, th));
      if (th.dataset.sort === state.sortColumn) {
        th.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });

    if (type === activeTab) {
      fetchData(type);
    }
  });
};

await awaitReady();
initIntersectionObserver();
initializeTables();
