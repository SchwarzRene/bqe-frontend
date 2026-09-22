/**
 * Component Loader - Loads Header & Footer HTML snippets
 * Ensures DRY principle: changes in header/footer apply to all pages
 */

async function loadComponent(placeholderId, componentPath) {
  const placeholder = document.getElementById(placeholderId);
  if (!placeholder) return;

  try {
    const response = await fetch(componentPath);
    if (!response.ok) throw new Error(`Failed to load ${componentPath}`);
    const html = await response.text();
    placeholder.outerHTML = html; // Replace placeholder with actual component
  } catch (error) {
    console.error(`Component load error (${componentPath}):`, error);
    // Fallback: keep placeholder visible (graceful degradation)
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Load header and footer in parallel
  await Promise.all([
    loadComponent('header-placeholder', '/components/header.html'),
    loadComponent('footer-placeholder', '/components/footer.html'),
  ]);

  // After components are loaded, set active nav link
  // (initMobileNav is handled by MutationObserver in navigation.js)
  setTimeout(() => {
    setActiveNavLink();
  }, 0);

  // Update year in footer
  const yearSpan = document.getElementById('current-year');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }
});

/**
 * Set aria-current="page" on the active navigation link
 * Helps screen reader users understand which page they're on
 */
function setActiveNavLink() {
  // Reduce a path to its last segment without the .html extension, so that
  // "/research/", "/research/index.html" and "/research" all compare equal.
  const nameOf = (path) => (path || '')
    .replace(/\/$/, '')
    .split('/')
    .pop()
    .replace(/\.html$/, '') || 'index';

  const activePath = nameOf(window.location.pathname);

  document.querySelectorAll('nav a').forEach((link) => {
    if (nameOf(link.getAttribute('href')) === activePath) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

// --- Cookie logic ---

// Function for setting a cookie
function setCookie(name, value, days) {
  let expires = "";
  if (days) {
    let date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

// Function for reading a cookie
function getCookie(name) {
  let nameEQ = name + "=";
  let ca = document.cookie.split(';');
  for(let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

// Initialisation of the banner
document.addEventListener('DOMContentLoaded', () => {
  const cookieBanner = document.getElementById('cookie-banner');
  const acceptButton = document.getElementById('accept-cookies');

  if (cookieBanner && acceptButton) {
    // If the "bqe_cookie_consent" cookie does not exist, show the banner
    if (!getCookie('bqe_cookie_consent')) {
      cookieBanner.style.display = 'block';
    }

    // When Accept is clicked
    acceptButton.addEventListener('click', () => {
      // Set the cookie for 365 days
      setCookie('bqe_cookie_consent', 'accepted', 365);
      // Hide the banner
      cookieBanner.style.display = 'none';
      
      // Here you could then start your tracking scripts (e.g. Google Analytics)
      console.log("Cookies have been accepted!");
    });
  }
});