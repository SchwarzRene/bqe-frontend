/**
 * Research Filter - category filter and search on research/index.html.
 *
 * The project cards are plain markup, so the index reads in full without
 * script. This file only reveals the toolbar, counts each category, and
 * hides the cards that do not match the chosen category and the typed
 * words. A card matches the search when every word appears somewhere in its
 * text (title, category, description or stack), so "rust lz4" finds
 * BQE-DeComp.
 *
 * Adding a project: add its <li class="project-card"> to the grid and to
 * the footer's Research column; a new category also needs a filter button
 * and a .project-tag--<category> colour in research.css. Nothing here needs
 * to change.
 */

(function () {
  var controls = document.getElementById("projectsControls");
  var grid = document.getElementById("projectGrid");
  if (!controls || !grid) return;

  var options = Array.prototype.slice.call(controls.querySelectorAll(".filter-option"));
  var input = document.getElementById("projectSearch");
  var count = document.getElementById("projectsCount");
  var empty = document.getElementById("projectsEmpty");
  var reset = document.getElementById("projectsReset");
  var cards = Array.prototype.slice.call(grid.querySelectorAll(".project-card"));

  var state = { category: "all", words: [] };

  // Lower-cased once up front; the text never changes after load.
  var haystacks = cards.map(function (card) {
    return card.textContent.replace(/\s+/g, " ").toLowerCase();
  });

  // Each option shows how many projects it holds, counted from the markup
  // so the numbers can never drift from the grid.
  options.forEach(function (option) {
    var filter = option.dataset.filter;
    var n = cards.filter(function (card) {
      return filter === "all" || card.dataset.category === filter;
    }).length;
    var badge = document.createElement("span");
    badge.className = "filter-count";
    badge.textContent = n;
    option.appendChild(document.createTextNode(" "));
    option.appendChild(badge);
  });

  function matches(card, index) {
    var inCategory = state.category === "all" || card.dataset.category === state.category;
    if (!inCategory) return false;
    return state.words.every(function (word) {
      return haystacks[index].indexOf(word) !== -1;
    });
  }

  function render() {
    var shown = 0;
    cards.forEach(function (card, i) {
      var visible = matches(card, i);
      card.hidden = !visible;
      if (visible) shown++;
    });
    empty.hidden = shown !== 0;

    // Only announce a count once the visitor has narrowed the list, so the
    // live region stays quiet on load.
    var filtered = state.category !== "all" || state.words.length > 0;
    count.textContent = filtered
      ? "Showing " + shown + " of " + cards.length + " projects"
      : "";
  }

  function select(option) {
    options.forEach(function (o) {
      o.setAttribute("aria-pressed", o === option ? "true" : "false");
    });
    state.category = option.dataset.filter;
    render();
  }

  function onSearch() {
    state.words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    render();
  }

  options.forEach(function (option) {
    option.addEventListener("click", function () { select(option); });
  });
  input.addEventListener("input", onSearch);

  // Escape clears the search, as it does in most search fields; the native
  // clear button only exists in some browsers.
  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && input.value) {
      input.value = "";
      onSearch();
    }
  });

  if (reset) {
    reset.addEventListener("click", function () {
      input.value = "";
      state.words = [];
      select(options[0]);
      input.focus();
    });
  }

  controls.hidden = false;
})();
