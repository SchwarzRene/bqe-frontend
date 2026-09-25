// What the page shows and how: the view state (page, region, time zone,
// calendar settings), the last /api/news answer, and the region names.
// The viewer's choices are remembered in localStorage; the page works without it.

export const PAGES = [
  ['general', 'General'],
  ['stocks', 'Stocks'],
  ['commodities', 'Commodities'],
  ['calendar', 'Calendar'],
];
export const REGIONS = [['all', 'All regions'], ['us', 'United States'], ['eu', 'Europe'], ['asia', 'Asia'], ['ru', 'Russia']];
export const TZS = [['vie', 'Vienna'], ['ny', 'New York']];
export const TZ_ID = { vie: 'Europe/Vienna', ny: 'America/New_York' };
export const R_NAME = { us: 'US', eu: 'Europe', asia: 'Asia', ru: 'Russia', global: 'Global' };
// The API speaks the spec's region names; the filter uses short codes.
export const CODE = { us: 'us', europe: 'eu', asia: 'asia', russia: 'ru', global: 'global' };
export const OVERVIEW_KEY = { all: 'all', us: 'us', eu: 'europe', asia: 'asia', ru: 'russia' };

export const state = {
  page: 'general',
  region: 'all',
  tz: 'vie',
  mapOpen: false,
  hlTab: { general: 0, stocks: 0, commodities: 0 },
  cal: {
    view: 'month', // month | week
    cursor: null, // a YYYY-MM-DD inside the month or week shown
    selected: null, // the day open in the day panel
    cats: ['cb', 'speech', 'data', 'earnings', 'commodities'],
    minImp: 1, // 1 all, 2 notable and up, 3 key only
  },
};

/** The last /api/news answer, and the headlines by id. */
export const data = { D: null, byId: new Map(), loadError: '', notice: '' };

const PREFS_KEY = 'bqe:market-news';

export function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (REGIONS.some((r) => r[0] === p.region)) state.region = p.region;
    if (TZ_ID[p.tz]) state.tz = p.tz;
    if (p.cal) {
      if (p.cal.view === 'month' || p.cal.view === 'week') state.cal.view = p.cal.view;
      if (Array.isArray(p.cal.cats)) state.cal.cats = p.cal.cats.filter((c) => typeof c === 'string');
      if ([1, 2, 3].includes(p.cal.minImp)) state.cal.minImp = p.cal.minImp;
    }
  } catch { /* private mode, blocked storage: defaults */ }
}

export function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      region: state.region, tz: state.tz,
      cal: { view: state.cal.view, cats: state.cal.cats, minImp: state.cal.minImp },
    }));
  } catch { /* not stored: fine */ }
}

/** Whether something in region `code` passes the region filter. Global news always does. */
export const keep = (code) => state.region === 'all' || code === state.region || code === 'global';
export const regionOf = (x) => CODE[x.region] || 'global';

export const briefing = () => (data.D && data.D.briefing) || null;
export const items = () => (data.D ? data.D.items : []);
export const events = () => (data.D ? data.D.events : []);
export const ranks = () => (data.D && data.D.calendarRanks) || null;
