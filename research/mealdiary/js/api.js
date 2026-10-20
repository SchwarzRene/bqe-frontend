// The calls the page makes to the Worker (worker/diary/). Every one throws an
// Error whose message is fit to show; `status` is the HTTP status (0: offline).

async function request(method, path, { json, body, type } = {}) {
  const options = { method, credentials: "same-origin", headers: {} };
  if (json !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(json);
  } else if (body !== undefined) {
    options.headers["Content-Type"] = type;
    options.body = body;
  }
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw Object.assign(new Error("Can't reach the server — check your connection."), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data });
  return data;
}

export const diary = {
  day: (day) => request("GET", `/api/diary/day/${day}`),
  month: (month) => request("GET", `/api/diary/days?month=${month}`),
  addMeal: (meal) => request("POST", "/api/diary/meals", { json: meal }),
  updateMeal: (id, changes) => request("PATCH", `/api/diary/meals/${id}`, { json: changes }),
  deleteMeal: (id) => request("DELETE", `/api/diary/meals/${id}`),
  putPhoto: (id, blob) => request("PUT", `/api/diary/meals/${id}/photo`, { body: blob, type: blob.type }),
  deletePhoto: (id) => request("DELETE", `/api/diary/meals/${id}/photo`),
  saveNotes: (notes) => request("PUT", "/api/diary/settings", { json: { notes } }),
  suggest: (day) => request("POST", "/api/diary/suggest", { json: { day } }),
};

/** A photo's address. `v` changes when the photo does, so the browser's hour-long cache never shows the old one. */
export const photoUrl = (id, v = "") => `/api/diary/meals/${id}/photo${v ? `?v=${encodeURIComponent(v)}` : ""}`;
