import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { installCaptureBrowser } from "../packages/browser-capture/src/browser.ts";
import { installHtmlBrowser, browserExecutablePath, recommendedBrowserVersion } from "../packages/provider-html-local/src/browser.ts";
const capture = await installCaptureBrowser({ cacheDirectory: resolve("node_modules/.cache/ci-browsers/capture") });
const htmlCache = resolve("node_modules/.cache/ci-browsers/html");
await installHtmlBrowser(htmlCache, recommendedBrowserVersion);
const html = browserExecutablePath({ browserCacheDirectory: htmlCache });
appendFileSync(process.env.GITHUB_ENV, `HYPIT_CAPTURE_TEST_BROWSER=${capture}\nHYPIT_TEST_CHROME_PATH=${html}\n`);
