# Meal Diary

Write down what you eat and when, add a photo, and let AI suggest new meals for each day so the
days do not all look alike. Lives at **/research/mealdiary/**.

## Who gets what

| | Diary | AI features |
|---|---|---|
| **Guest** | the page asks to sign in — the diary is the account's, nothing is kept for guests | — |
| **Signed in** | entries, photos and notes in the account's D1 rows, on any device | photo descriptions, the summary and the ideas need **AI access**, like Market News's chat: an admin grants it in the admin terminal |

A guest never reaches the model: every diary route answers 401 without an account, and 403 without AI access, before anything is sent to Gemini.

## How it works

- **One row per meal, per user, per day** (`diary_meals`: `day` `YYYY-MM-DD`, `time` `HH:MM`, slot
  breakfast / lunch / dinner / snack, a description). `day` and `time` are the user's own calendar and
  clock as the browser saw them, so a dinner at 23:30 stays on its day. Up to 20 entries a day and
  5,000 per account.
- **Getting around the old days.** Above the day there is a **date strip**: swipe or scroll it sideways
  (the mouse wheel works too) and it keeps adding older days, up to three years back; days with
  entries have a dot, tapping a date opens it. The **Feed** tab is one vertical, snap-scrolling list
  of every day that has entries, newest first, with its meals and photos, loading older days as you
  scroll; **Open day** jumps to that day for editing. The address says which view is open
  (`#feed`, or `#2026-10-20` for a day), so reload and the back button work. The month **calendar**
  stays too. Server side: `GET /api/diary/days?from=&to=` (counts for the strip) and
  `GET /api/diary/history?before=` (a page of days with meals, the feed).
- **Photos** (`diary_photos`, one per meal). The browser shrinks a picture to a JPEG of at most
  1280 px and ~600 kB before sending it (`js/photo.js`) — which also leaves the camera's location
  behind. The Worker accepts JPEG, PNG and WebP by their first bytes (never SVG), up to 700 kB each and
  25 MB per account, stores them as base64 text in D1 and serves them only to their owner at
  `/api/diary/meals/:id/photo`.
- **The AI runs only when asked** — three buttons, nothing automatic:
  - **Describe the photo with AI** (add form and edit dialog; `POST /api/diary/describe`, or
    `/meals/:id/describe` for a saved photo, `worker/diary/describe.ts`). The picture goes to Gemini
    inline with the prompt and one sentence comes back, which fills the description box for the user to
    correct and save; nothing is saved by the call itself. A photo with no food in it is refused.
  - **Summarise & suggest** (`POST /api/diary/suggest`, `worker/diary/suggest.ts`). Gemini gets the last
    14 days of the diary, what was already eaten that day and the user's notes ("About you": diet,
    allergies, dislikes, goals), and answers with a short summary of the day and one breakfast, lunch,
    dinner and snack to cook next, as strict JSON. The prompt asks for variety — no dish or main
    ingredient from the last 7 days — and for the notes to be kept to strictly. Photos are not sent
    here, only the descriptions (so describe a photo first). The result is saved per user and day
    (`diary_suggestions`) and shown again on every visit; **Update** replaces it. **I ate this** copies
    an idea into the add form.
- **Failures are handled as in Market News**, because the calls go through the same
  `worker/news/gemini.ts`: an overloaded model is retried twice, a short per-minute limit is waited
  out once, then the fallback models are tried, and what is left is shown with Gemini's own reason
  (quota used up, wrong key, ...). A call that got no answer, or found no food, is not counted.
- **The API key stays on Cloudflare.** It is the same `GEMINI_API_KEY` Worker secret Market News uses
  (`worker/news/gemini.ts`, with its model fallbacks) — the browser never sees it, and there is
  nothing to set up for the diary. `DIARY_AI_DAILY_LIMIT` in `wrangler.toml` (default 20) caps the AI
  requests per user per day, descriptions and summaries together.

Everything is part of **Download my data** and goes with **Delete account** (photos are listed in the
export, with the address they can be saved from while signed in).

## Files

```
index.html     the page shell (loads /assets/js/session.js for sign-in)
css/style.css  the app's own styles, light and dark
js/main.js     the page: day navigation, add / edit / delete, photos, ideas, calendar, notes
js/api.js      the calls to /api/diary/*
js/photo.js    shrinks a picture before it is sent
```

Server side: `worker/diary/` (`index.ts` routes and entries, `photos.ts`, `suggest.ts`, `store.ts`
shared pieces), `migrations/0008_meal_diary.sql`, tests in `test/diary/`.
