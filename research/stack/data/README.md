Last committed snapshot — do not edit by hand.

One JSON file per ticker plus an `index.json`. The site's Worker (`worker/stack.ts`) keeps fresher
copies in D1 and serves those at the same paths; these files are only the fallback until D1 has
prices for 90% of the list. If neither exists, the page uses its built-in simulated series and says
so in the header.
