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

function handlePopupKeydown(e) {
  const popup = document.getElementById('popup');
  if (!popup || !popup.classList.contains('show')) return;

  if (e.key === 'Escape') {
    handleGlobalClose();
    return;
  }

  if (e.key === 'Tab') {
    const focusableContent = popup.querySelectorAll(focusableSelector);

    if (focusableContent.length === 0) {
      e.preventDefault();
      return;
    }

    const firstFocusable = focusableContent[0];
    const lastFocusable = focusableContent[focusableContent.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        lastFocusable.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        firstFocusable.focus();
        e.preventDefault();
      }
    }
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
    if (!smallPopup) return;

    const focusableContent = smallPopup.querySelectorAll(focusableSelector);
    if (focusableContent.length === 0) return;

    const firstFocusable = focusableContent[0];
    const lastFocusable = focusableContent[focusableContent.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
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
        openSubmenu();
      });

      category.addEventListener('mouseleave', () => {
        hoverTimeout = setTimeout(() => {
          closeSubmenu();
        }, 500);
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

    const subLinks = subPopup.querySelectorAll(focusableSelector);
    subLinks.forEach((link) => {
      link.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeSubmenu();
          triggerBtn.focus();
        }
      });
    });
  });
}

initializeSubMenus();