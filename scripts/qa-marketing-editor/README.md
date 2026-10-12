# Unified marketing editor browser regression

This optional QA runner bundles the actual admin/editor components against synthetic six-card data and mocked HTTP. It is not an authenticated production end-to-end test. No real AI, photo upload, approval or publishing requests are sent.

Install optional QA tools outside the application dependency tree:

```sh
npm install --prefix /tmp/roundy-editor-tools --no-save esbuild@0.28.2 playwright@1.64.0
/tmp/roundy-editor-tools/node_modules/.bin/playwright install chromium
ROUNDY_QA_TOOLS=/tmp/roundy-editor-tools node scripts/qa-marketing-editor/run.mjs
```

On Amazon Linux/serverless sandboxes, add `@sparticuz/chromium@153.0.0` to the temporary tools directory, install NSS/NSPR shared libraries, and set `ROUNDY_QA_SERVERLESS=1`.

The runner covers Korean/English at 360, 390, 768 and 1440 pixels, one full-card preview, collapsed advanced controls, current-versus-stale preflight, unsaved text protection, selected-card manual and AI payloads, local photo editing and no publication side effects. It writes synthetic screenshots into `quality-artifacts/unified-editor`. Inspect those images before release; they are not actual Instagram media or evidence of publication.
