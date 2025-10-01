document.addEventListener('DOMContentLoaded', function () {
  let currentOldEmuSubPopup = null;
  let originalBodyPaddingRight = '';
  let originalBodyOverflow = '';

  function closeOldEmuSubPopup() {
    if (currentOldEmuSubPopup) {
      currentOldEmuSubPopup.style.opacity = '0';
      currentOldEmuSubPopup.style.visibility = 'hidden';
      currentOldEmuSubPopup.style.pointerEvents = 'none';
      const prevCategory = currentOldEmuSubPopup.closest('.md3-popup-category');
      if (prevCategory) {
        prevCategory.classList.remove('md3-popup-category--active');
      }
      currentOldEmuSubPopup = null;
    }
  }

  function closeAll() {
    const chips = document.querySelectorAll('.md3-chip-popup');
    chips.forEach(chip => {
      chip.classList.remove('md3-chip--active');
      const popup = chip.querySelector('.md3-small-popup');
      if (popup) {
        popup.classList.remove('show');
      }
      const button = chip.querySelector('button');
      if (button) {
        button.setAttribute('aria-expanded', 'false');
      }
      const card = chip.closest('.md3-card');
      if (card) {
        card.classList.remove('md3-card--popup-open');
      }
    });
    closeOldEmuSubPopup();
  }

  function handlePopupClose() {
    closeAll();
    closePopup();
  }

  document.addEventListener('click', function (e) {
    const clickedInsideChip = e.target.closest('.md3-chip-popup');
    const clickedInsidePopup = e.target.closest('.md3-small-popup');
    const clickedOnInfoIcon = e.target.closest('.info-icon');
    const clickedInsideMainPopup = e.target.closest('.popup-content');

    if (!clickedInsideChip && !clickedInsidePopup && !clickedOnInfoIcon && !clickedInsideMainPopup) {
      handlePopupClose();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      handlePopupClose();
    }
  });

  document.querySelectorAll('.md3-chip-popup').forEach(chip => {
    const button = chip.querySelector('button');
    const popup = chip.querySelector('.md3-small-popup');
    const card = chip.closest('.md3-card');

    chip.addEventListener('click', function (e) {
      if (e.target.closest('.md3-popup-link')) return;
      const wasOpen = popup && popup.classList.contains('show');
      closeAll();
      if (!wasOpen && popup) {
        popup.classList.add('show');
        button.setAttribute('aria-expanded', 'true');
        chip.classList.add('md3-chip--active');
        card.classList.add('md3-card--popup-open');
      }
    });

    if (popup) {
      popup.addEventListener('click', function (e) {
        if (e.target.closest('.md3-popup-link')) return;
        e.stopPropagation();
      });
    }

    if (button) {
      button.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          chip.click();
        }
      });
    }
  });

  const oldEmulatorsPopup = document.getElementById('old-emulators-popup');
  if (oldEmulatorsPopup) {
    const categories = oldEmulatorsPopup.querySelectorAll('.md3-popup-category');
    categories.forEach(category => {
      const triggerBtn = category.querySelector('.md3-popup-link.md3-popup-with-arrow');
      const subPopup = category.querySelector('.md3-small-popup--level2');
      if (!triggerBtn || !subPopup) return;

      function openSubmenu() {
        closeOldEmuSubPopup();
        subPopup.style.opacity = '1';
        subPopup.style.visibility = 'visible';
        subPopup.style.pointerEvents = 'auto';
        currentOldEmuSubPopup = subPopup;
        category.classList.add('md3-popup-category--active');
      }

      function closeSubmenu() {
        if (currentOldEmuSubPopup === subPopup) {
          closeOldEmuSubPopup();
        }
      }

      category.addEventListener('mouseenter', openSubmenu);
      category.addEventListener('mouseleave', closeSubmenu);

      triggerBtn.addEventListener('focus', openSubmenu);
      triggerBtn.addEventListener('blur', () => {
        setTimeout(() => {
          if (!subPopup.contains(document.activeElement)) {
            closeSubmenu();
          }
        }, 50);
      });

      subPopup.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          triggerBtn.focus();
          closeSubmenu();
        }
      });
    });
  }

  window.openPopup = function (type, isOverlay = true) {
    const popup = document.getElementById('popup');
    const popupContent = document.getElementById('popup-content');
    const popupInner = document.querySelector('.popup-content');
    let url = '';

    if (type === 'emulators') {
      url = 'resources/emulators.html';
    } else if (type === 'servers') {
      url = 'resources/servers.html';
    }

    if (!url) return;

    if (isOverlay) {
      if (originalBodyPaddingRight === '') {
        const computedStyle = window.getComputedStyle(document.body);
        originalBodyPaddingRight = computedStyle.paddingRight;
        originalBodyOverflow = computedStyle.overflow;
      }

      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollBarWidth > 0) {
        document.body.style.paddingRight = scrollBarWidth + 'px';
      }
      document.body.classList.add('popup-open');
      document.body.style.overflow = 'hidden';
    }

    popup.setAttribute('aria-hidden', 'false');
    popup.style.display = 'block';
    setTimeout(() => {
      popup.classList.add('show');
      popupInner.classList.add('show');
    }, 10);

    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.text();
      })
      .then(htmlText => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const bodyContent = doc.body.innerHTML || '<p>No content found.</p>';

        popupContent.innerHTML = bodyContent;

        const popupTitle = document.getElementById('popup-title');
        if (popupTitle) {
          popupTitle.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        }

        const popupDescription = document.getElementById('popup-description');
        if (popupDescription) {
          popupDescription.textContent = '';
        }
      })
      .catch(error => {
        console.error('Error loading popup content:', error);
        popupContent.innerHTML = '<p>Error loading content.</p>';
      });

    const overlay = document.createElement('div');
    overlay.classList.add('overlay');
    document.body.appendChild(overlay);
    setTimeout(() => {
      overlay.classList.add('show');
    }, 10);
  };

  window.closePopup = function () {
    const popup = document.getElementById('popup');
    const popupInner = document.querySelector('.popup-content');
    popupInner.classList.remove('show');
    popup.classList.remove('show');
    setTimeout(() => {
      popup.style.display = 'none';
      document.body.classList.remove('popup-open');
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.paddingRight = originalBodyPaddingRight;
      popup.setAttribute('aria-hidden', 'true');
    }, 300);

    const overlay = document.querySelector('.overlay');
    if (overlay) {
      overlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(overlay);
      }, 300);
    }
  };

  document.querySelector('.close').addEventListener('click', closePopup);
  window.addEventListener('click', function (e) {
    const popup = document.getElementById('popup');
    if (e.target === popup) {
      closePopup();
    }
  });
});
