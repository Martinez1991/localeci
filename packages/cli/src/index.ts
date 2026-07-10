/** Programmatic API (used by the GitHub Action wrapper). */
export { cmdInit } from "./commands/init.js";
export { cmdTranslate } from "./commands/translate.js";
export { cmdCheck } from "./commands/check.js";
export { cmdStatus } from "./commands/status.js";
export { translateProject, checkProject } from "./lib/engine.js";
export type { TranslateReport, CheckReport, FileLocaleResult, CheckIssue } from "./lib/engine.js";
export { loadConfig, loadGlossary, loadLock, saveLock } from "./lib/project.js";
export { detectProject } from "./lib/detect.js";
