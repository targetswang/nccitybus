# Third-party notices

## React 19.1.1 / React DOM / Scheduler

`apps/h5/public/vendor/react-runtime.mjs` is a vendored production runtime extracted from the React module closure in the installed Playwright recorder asset. The dependency version was verified using `React.version`. It is not application business code. No third-party fonts are distributed.

Origin in the build environment: `playwright/driver/package/lib/vite/recorder/assets/index-DJqDAOZp.js`.
The runtime provides the same React/createRoot API without requiring a network npm install for this offline handoff. Replace it as a reviewed dependency upgrade, never patch minified vendor code by hand. Hashes are included in the delivery manifest.

MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Maps, public photographs, external services

Source URLs are retained as editorial candidates, not a declaration of copyright permission. Only authorized images should be imported into owned media storage and promoted to an approved release. No external photo is bundled without an established right to redistribute it.

## Production drivers

The PostgreSQL and MQTT adapters use `pg` and `mqtt`. These optional production dependencies are installed separately under the controlled integration lock workflow; they are not reimplemented as custom wire protocols. See `deploy/integrations/README.md` for the production acceptance gate.
