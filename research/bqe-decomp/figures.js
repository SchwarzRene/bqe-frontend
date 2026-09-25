// A figure whose image is missing is hidden rather than shown broken. (Was an
// inline onerror attribute, which the site's Content-Security-Policy refuses.)
for (const img of document.querySelectorAll("figure img")) {
  const hide = () => { img.style.display = "none"; };
  if (img.complete && img.naturalWidth === 0) hide();
  else img.addEventListener("error", hide);
}
