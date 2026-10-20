// Stack: reading the S&P 500 constituent table.

import { describe, expect, it } from "vitest";
import { parseConstituents } from "../../worker/stack";

describe("parseConstituents", () => {
  const html = `<p>x</p>
<table class="wikitable sortable" id="constituents"><tbody>
<tr><th>Symbol</th><th>Security</th><th>GICS Sector</th><th>GICS Sub-Industry</th></tr>
<tr><td><a rel="nofollow" class="external text" href="https://www.nyse.com/quote/XNYS:MMM">MMM</a></td>
<td><a href="/wiki/3M" title="3M">3M</a></td><td>Industrials</td><td>Industrial Conglomerates</td></tr>
<tr><td><a href="#">BRK.B</a></td><td><a href="/wiki/B">Berkshire Hathaway</a></td><td>Financials</td><td>x</td></tr>
<tr><td>AT&amp;T? no</td><td>bad</td><td>bad</td></tr>
</tbody></table><table id="changes"><tr><td>ZZZ</td></tr></table>`;

  it("reads the constituents table by its headers", () => {
    expect(parseConstituents(html)).toEqual([
      { s: "BRK.B", f: "BRK-B", n: "Berkshire Hathaway", sec: "Financials" },
      { s: "MMM", f: "MMM", n: "3M", sec: "Industrials" },
    ]);
  });

  it("gives up on a table whose headers changed", () => {
    expect(parseConstituents(html.replace("GICS Sector", "Sector"))).toEqual([]);
    expect(parseConstituents("<table id='other'></table>")).toEqual([]);
  });
});
