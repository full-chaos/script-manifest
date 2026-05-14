"use strict";

const { RuleTester } = require("eslint");
const plugin = require("./no-fetch-in-effect.cjs");

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

ruleTester.run("no-fetch-in-effect", plugin.rules["no-fetch-in-effect"], {
  valid: [
    { code: "useEffect(() => { setX(1); }, []);" },
    { code: "useEffect(() => { void mutate('/key'); }, []);" },
    { code: "useSWR('/key', fetcher);" },
    {
      code: "useEffect(() => { void trigger({ id: 1 }); }, [trigger]);",
    },
    {
      code: "async function load() { await fetch('/x'); } load();",
    },
    { code: "useLayoutEffect(() => { document.title = 'x'; }, []);" },
  ],
  invalid: [
    {
      code: "useEffect(() => { void fetch('/api/v1/x'); }, []);",
      errors: [{ messageId: "noFetchInEffect" }],
    },
    {
      code: "useEffect(() => { fetch('/api/v1/x').then(r => r.json()); }, []);",
      errors: [{ messageId: "noFetchInEffect" }],
    },
    {
      code: "useLayoutEffect(() => { fetch('/api/v1/x'); }, []);",
      errors: [{ messageId: "noFetchInEffect" }],
    },
    {
      code: "useEffect(() => { queueMicrotask(() => { void fetch('/api/v1/x'); }); }, []);",
      errors: [{ messageId: "noFetchInEffect" }],
    },
    {
      code: "React.useEffect(() => { fetch('/api/v1/x'); }, []);",
      errors: [{ messageId: "noFetchInEffect" }],
    },
  ],
});

console.log("no-fetch-in-effect: all rule cases passed");
