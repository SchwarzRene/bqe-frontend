#!/usr/bin/env node
// Set an account's password without a password ever being committed.
//
//   node scripts/set-password.mjs ceo [--iterations 50000] [--remote|--local]
//
// Asks for the password (hidden), hashes it here with the Worker's scheme
// (PBKDF2-SHA256, random salt, see worker/auth.ts derive) and prints the one
// wrangler command that stores the hash and signs the account out everywhere.
// Nothing is written to disk. The command contains the hash, not the
// password; run it, then clear your shell history if you want it gone too.

import { pbkdf2Sync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const username = args.find((a) => !a.startsWith("--"));
const at = args.indexOf("--iterations");
const iterations = at >= 0 ? Number(args[at + 1]) : 50_000;
const where = args.includes("--local") ? "--local" : "--remote";
if (!username || !/^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/.test(username) || !(iterations >= 50_000)) {
  console.error("usage: node scripts/set-password.mjs <username> [--iterations N>=50000] [--remote|--local]");
  process.exit(1);
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    if (process.stdin.isTTY) {
      // Hide what is typed.
      rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (process.stdin.isTTY) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = await ask(`New password for ${username} (at least 12 characters): `);
if (password.length < 12 || password.length > 200) {
  console.error("The password needs 12 to 200 characters.");
  process.exit(1);
}
if (process.stdin.isTTY && (await ask("Repeat it: ")) !== password) {
  console.error("The passwords don't match.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(Buffer.from(password, "utf8"), salt, iterations, 32, "sha256").toString("hex");
const sql =
  `UPDATE users SET password_hash = '${hash}', password_salt = '${salt.toString("hex")}', password_iterations = ${iterations} WHERE username = '${username}'; ` +
  `DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = '${username}');`;
console.log("\nRun this to store it:\n");
console.log(`npx wrangler d1 execute bqe ${where} --command "${sql}"`);
