#!/usr/bin/env node
// Entry point for the plugin hooks declared in hooks.json.
// Usage: node factory-hook.mjs <session-start|pre-tool-use|post-tool-use>
import { handle, readStdin } from "../lib/hook-main.mjs";

const event = process.argv[2];
let input = {};
try {
  input = await readStdin();
} catch {
  // Unparseable payload: stay out of the way.
  process.exit(0);
}
const { exitCode, stdout } = await handle(event, input);
if (stdout) process.stdout.write(stdout);
process.exitCode = exitCode;
