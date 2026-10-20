// The contact form: validation.

import { describe, expect, it } from "vitest";
import { validateContact } from "../../worker/contact";

describe("validateContact", () => {
  const good = { name: "Ada", email: "ada@example.com", subject: "general", message: "Hello there, a question." };

  it("accepts a valid submission", () => {
    expect(validateContact(good)).toEqual({ ok: true, value: { ...good, phone: "" } });
  });

  it("rejects bad fields", () => {
    const r = validateContact({ ...good, email: "nope", subject: "spam", message: "short" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "message", "subject"]);
  });
});
