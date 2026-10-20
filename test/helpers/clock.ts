// Runs before every test file. Date is frozen, so no test depends on the time of day (or the
// date) it happens to run at: a run that starts at 23:59 UTC used to cross midnight mid-test.
// Only Date is faked; timers and promises keep running. A test that needs another instant calls
// vi.setSystemTime(), or passes its own `now` to the code under test.
//
// To try the suite at another moment:  TEST_NOW=2026-10-20T23:59:59Z npm test
import { afterEach, beforeEach, vi } from "vitest";

const NOW = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.TEST_NOW ?? "2026-10-20T12:00:00Z";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});
