# Meal Diary

Write down what you eat and when, add a photo, and let AI suggest new meals for each day so the
days do not all look alike. Lives at **/research/mealdiary/**.

## Who gets what

| | Diary | Meal ideas |
|---|---|---|
| **Guest** | the page asks to sign in — the diary is the account's, nothing is kept for guests | — |
| **Signed in** | entries, photos and notes in the account's D1 rows, on any device | needs **AI access**, like Market News's chat: an admin grants it in the admin terminal |

## How it works

- **One row per meal, per user, per day** (`diary_meals`: `day` `YYYY-MM-DD`, `time` `HH:MM`, slot
  breakfast / lunch / dinner / snack, a description). `day` and `time` are the user's own calendar and
  clock as the browser saw them, so a dinner at 23:30 stays on its day. Up to 20 entries a day and
  5,000 per account.
- **Photos** (`diary_photos`, one per meal). The browser shrinks a picture to a JPEG of at most
  1280 px and ~600 kB before sending it (`js/photo.js`) — which also leaves the camera's location
  behind. The Worker accepts JPEG, PNG and WebP by their first bytes (never SVG), up to 700 kB each and
  25 MB per account, stores them as base64 text in D1 and serves them only to their owner at
  `/api/diary/meals/:id/photo`.
- **Meal ideas** (`POST /api/diary/suggest`, `worker/diary/suggest.ts`). Gemini gets the last 14 days of
  the diary, what was already eaten that day and the user's notes ("About you": diet, allergies,
  dislikes, goals), and answers with one breakfast, lunch, dinner and snack as strict JSON. The system
  prompt asks for variety — no dish or main ingredient from the last 7 days — and for the notes to be
  kept to strictly. The ideas are saved per user and day (`diary_suggestions`) and shown again on every
  visit; **New ideas** replaces them. **I ate this** copies an idea into the add form. Photos are not
  sent to the model, only the descriptions.
- **The API key stays on Cloudflare.** It is the same `GEMINI_API_KEY` Worker secret Market News uses
  (`worker/news/gemini.ts`, with its model fallbacks) — the browser never sees it, and there is
  nothing to set up for the diary. `DIARY_AI_DAILY_LIMIT` in `wrangler.toml` (default 10) caps the sets
  of ideas per user per day; a call that got no answer does not count.

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
