const contentCache = {};

let activeSubPopup = null;
let lastFocusedElement = null;
let activeChipTrigger = null;
let hoverTimeout = null;

const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const skeletonHTML = `
  <div class="skeleton-wrapper">
    <div class="skeleton skeleton-title"></div>
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-text" style="width: 80%"></div>
  </div>
`;

function toggleScrollLock(shouldLock) {
  if (shouldLock) {
    document.body.classList.add('popup-open');
  } else {
    document.body.classList.remove('popup-open');
  }
}

function closeActiveSubPopup() {
  if (activeSubPopup) {
    activeSubPopup.classList.remove('md3-subpopup-open');
    const prevCategory = activeSubPopup.closest('.md3-popup-category');
    if (prevCategory) {
      prevCategory.classList.remove('md3-popup-category--active');
      const trigger = prevCategory.querySelector('.md3-popup-link.md3-popup-with-arrow');
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
      }
    }
    activeSubPopup = null;
  }
}

function closeAllChips(exceptChip = null, restoreFocus = false) {
  const chips = document.querySelectorAll('.md3-chip-popup');
  chips.forEach(chip => {
    if (chip === exceptChip) return;

    chip.classList.remove('md3-chip--active');
    chip.classList.remove('md3-popup-right');
    chip.classList.remove('md3-popup-up');

    const popup = chip.querySelector('.md3-small-popup');
    if (popup) popup.classList.remove('show');

    const button = chip.querySelector('button');
    if (button) button.setAttribute('aria-expanded', 'false');

    const card = chip.closest('.md3-card');
    if (card) {
      const activeSibling = card.querySelector('.md3-chip-popup.md3-chip--active');
      if (!activeSibling) {
        card.classList.remove('md3-card--popup-open');
      }
    }
  });
  closeActiveSubPopup();

  if (restoreFocus && activeChipTrigger && !exceptChip) {
    if (document.body.contains(activeChipTrigger)) {
      activeChipTrigger.focus();
    }
    activeChipTrigger = null;
  }
}

function trapFocus(element, event) {
  const focusableContent = element.querySelectorAll(focusableSelector);
  if (focusableContent.length === 0) {
    event.preventDefault();
    return;
  }

  const firstFocusable = focusableContent[0];
  const lastFocusable = focusableContent[focusableContent.length - 1];

  if (event.shiftKey) {
    if (document.activeElement === firstFocusable) {
      lastFocusable.focus();
      event.preventDefault();
    }
  } else {
    if (document.activeElement === lastFocusable) {
      firstFocusable.focus();
      event.preventDefault();
    }
  }
}

function handlePopupKeydown(e) {
  const popup = document.getElementById('popup');
  if (!popup || !popup.classList.contains('show')) return;

  if (e.key === 'Tab') {
    trapFocus(popup, e);
  }
}

function openMainPopup(triggerElement, isOverlay = true) {
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
      overlay.classList.add('overlay');
      overlay.addEventListener('click', closeMainPopup);
      document.body.appendChild(overlay);

      void overlay.offsetWidth;
    }
    overlay.classList.add('show');
  }

  popup.setAttribute('aria-hidden', 'false');
  popup.style.display = 'block';

  void popup.offsetWidth;

  popup.classList.add('show');

  document.addEventListener('keydown', handlePopupKeydown);

  const popupInner = document.querySelector('.popup-content');
  if (popupInner) {
    popupInner.classList.add('show');
    const firstFocusable = popupInner.querySelector(focusableSelector);
    const closeBtn = popup.querySelector('.close');
    if (closeBtn) {
      closeBtn.focus();
    } else if (firstFocusable) {
      firstFocusable.focus();
    } else {
      popupInner.focus();
    }
  }

  if (contentCache[type]) {
    renderPopupContent(contentCache[type], type, popupContentWrapper, popupTitle);
  } else {
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error('Unable to load content');
        return response.text();
      })
      .then(htmlText => {
        contentCache[type] = htmlText;
        renderPopupContent(htmlText, type, popupContentWrapper, popupTitle);
      })
      .catch(error => {
        console.error('Error loading popup content:', error);
        popupContentWrapper.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = 'Unable to load content.';
        p.style.color = 'var(--text-color)';
        popupContentWrapper.appendChild(p);

        if (popupTitle) popupTitle.textContent = 'Error';
      });
  }
}

function renderPopupContent(htmlText, type, wrapper, titleEl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');

  const scripts = doc.querySelectorAll('script');
  scripts.forEach(script => script.remove());

  const allElements = doc.body.querySelectorAll('*');
  allElements.forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
    if (el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href').toLowerCase().startsWith('javascript:')) {
      el.setAttribute('href', '#');
    }
  });

  wrapper.innerHTML = '';

  if (doc.body.childNodes.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No content available.';
    wrapper.appendChild(p);
  } else {
    Array.from(doc.body.childNodes).forEach(node => {
      wrapper.appendChild(node);
    });
  }

  const loadedTitle = doc.querySelector('h1, h2')?.textContent;
  if (titleEl) {
    titleEl.textContent = loadedTitle || (type.charAt(0).toUpperCase() + type.slice(1));
  }
}

function closeMainPopup() {
  const popup = document.getElementById('popup');
  const popupInner = document.querySelector('.popup-content');
  const overlay = document.querySelector('.overlay');

  document.removeEventListener('keydown', handlePopupKeydown);

  if (popupInner) popupInner.classList.remove('show');
  if (popup) popup.classList.remove('show');
  if (overlay) overlay.classList.remove('show');

  setTimeout(() => {
    if (popup && !popup.classList.contains('show')) {
      popup.style.display = 'none';
      popup.setAttribute('aria-hidden', 'true');
    }

    toggleScrollLock(false);

    if (overlay && overlay.parentNode && !overlay.classList.contains('show')) {
      overlay.parentNode.removeChild(overlay);
    }

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }, 300);
}

function handleGlobalClose() {
  closeAllChips(null, true);
  closeMainPopup();
}

function checkPopupPosition(chip, popup) {
  if (!popup) return;

  if (window.innerWidth <= 768) {
    chip.classList.remove('md3-popup-right', 'md3-popup-up');
    return;
  }

  const wasHidden = !popup.classList.contains('show');
  if (wasHidden) {
    popup.style.visibility = 'hidden';
    popup.style.display = 'block';
  }

  const rect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  if (rect.right > viewportWidth) {
    chip.classList.add('md3-popup-right');
  } else {
    chip.classList.remove('md3-popup-right');
  }

  if (rect.bottom > viewportHeight) {
    chip.classList.add('md3-popup-up');
  } else {
    chip.classList.remove('md3-popup-up');
  }

  if (wasHidden) {
    popup.style.visibility = '';
    popup.style.display = '';
  }
}

function createRipple(event) {
  const button = event.currentTarget;
  const circle = document.createElement('span');
  const diameter = Math.max(button.clientWidth, button.clientHeight);
  const radius = diameter / 2;

  const rect = button.getBoundingClientRect();
  const x = event.clientX - rect.left - radius;
  const y = event.clientY - rect.top - radius;

  circle.style.width = circle.style.height = `${diameter}px`;
  circle.style.left = `${x}px`;
  circle.style.top = `${y}px`;
  circle.classList.add('ripple');

  const ripple = button.getElementsByClassName('ripple')[0];
  if (ripple) {
    ripple.remove();
  }

  button.appendChild(circle);
}

document.addEventListener('click', (e) => {
  const target = e.target.closest('.ripple-target');
  if (target) {
    createRipple({
      currentTarget: target,
      clientX: e.clientX,
      clientY: e.clientY
    });
  }
}, {
  capture: true
});

document.addEventListener('click', (e) => {
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
    if (e.target.closest('.md3-popup-link') || e.target.closest('.md3-small-popup')) {
      if (!e.target.closest('a')) e.stopPropagation();
      return;
    }

    const button = chip.querySelector('button');
    const popup = chip.querySelector('.md3-small-popup');
    const card = chip.closest('.md3-card');

    const wasOpen = popup && popup.classList.contains('show');

    closeAllChips(null, false);

    if (!wasOpen && popup) {
      activeChipTrigger = button;
      checkPopupPosition(chip, popup);

      popup.classList.add('show');
      if (button) button.setAttribute('aria-expanded', 'true');
      chip.classList.add('md3-chip--active');
      if (card) card.classList.add('md3-card--popup-open');
    } else {
      activeChipTrigger = null;
    }
    return;
  }

  const clickedInsideMainPopup = e.target.closest('.popup-content');
  if (!clickedInsideMainPopup) {
    handleGlobalClose();
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    handleGlobalClose();
  }

  const activeChip = document.querySelector('.md3-chip-popup.md3-chip--active');
  if (activeChip && e.key === 'Tab') {
    const smallPopup = activeChip.querySelector('.md3-small-popup');
    if (smallPopup) {
      trapFocus(smallPopup, e);
    }
  }
});

function initializeSubMenus() {
  const categories = Array.from(document.querySelectorAll('.md3-popup-category'));

  categories.forEach((category) => {
    const triggerBtn = category.querySelector('.md3-popup-link.md3-popup-with-arrow');
    const subPopup = category.querySelector('.md3-small-popup--level2');

    if (!triggerBtn || !subPopup) return;

    function openSubmenu() {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }

      if (activeSubPopup && activeSubPopup !== subPopup) {
        closeActiveSubPopup();
      }
      subPopup.classList.add('md3-subpopup-open');
      activeSubPopup = subPopup;
      category.classList.add('md3-popup-category--active');
      triggerBtn.setAttribute('aria-expanded', 'true');
    }

    function closeSubmenu() {
      if (activeSubPopup === subPopup) {
        closeActiveSubPopup();
      }
    }

    if (window.matchMedia('(hover: hover)').matches) {
      category.addEventListener('mouseenter', () => {
        if (window.innerWidth > 768) {
          openSubmenu();
        }
      });

      category.addEventListener('mouseleave', () => {
        if (window.innerWidth > 768) {
          hoverTimeout = setTimeout(() => {
            closeSubmenu();
          }, 500);
        }
      });
    }

    triggerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (activeSubPopup === subPopup) {
        closeActiveSubPopup();
      } else {
        openSubmenu();
      }
    });

    triggerBtn.addEventListener('focus', () => {
      if (activeSubPopup && activeSubPopup !== subPopup) {
        closeActiveSubPopup();
      }
    });

    subPopup.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeSubmenu();
        triggerBtn.focus();
      }
    });
  });
}

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

function renderNestedMenu(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const fragment = document.createDocumentFragment();

  data.forEach(section => {
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'md3-popup-item md3-popup-category';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'md3-popup-link md3-popup-with-arrow ripple-target';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-controls', section.id);
    button.textContent = section.category;

    const submenuDiv = document.createElement('div');
    submenuDiv.id = section.id;
    submenuDiv.className = 'md3-small-popup md3-small-popup--level2';
    submenuDiv.setAttribute('aria-label', `${section.category} emulators`);

    section.items.forEach(item => {
      if (item.type === 'header') {
        const header = document.createElement('div');
        header.className = 'md3-popup-header';
        header.textContent = item.text;
        submenuDiv.appendChild(header);

        const divider = document.createElement('div');
        divider.className = 'md3-popup-divider';
        submenuDiv.appendChild(divider);
      } else if (item.type === 'link') {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'md3-popup-item';

        const a = document.createElement('a');
        a.className = 'md3-popup-link ripple-target';
        a.href = item.url;
        a.textContent = item.text;

        itemDiv.appendChild(a);
        submenuDiv.appendChild(itemDiv);
      }
    });

    categoryDiv.appendChild(button);
    categoryDiv.appendChild(submenuDiv);
    fragment.appendChild(categoryDiv);
  });

  container.appendChild(fragment);
}

function renderFlatMenu(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const fragment = document.createDocumentFragment();

  items.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'md3-popup-item';

    const a = document.createElement('a');
    a.className = 'md3-popup-link ripple-target';
    a.href = item.url;
    a.setAttribute('role', 'menuitem');
    a.textContent = item.text;

    itemDiv.appendChild(a);
    fragment.appendChild(itemDiv);
  });

  container.appendChild(fragment);
}

renderFlatMenu('retroarch-k-popup', retroArchData);
renderNestedMenu('old-emulators-popup', oldEmulatorsData);
initializeSubMenus();