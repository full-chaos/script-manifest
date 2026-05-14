"use strict";

const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect"]);

function isEffectCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee.type === "Identifier") return EFFECT_HOOKS.has(callee.name);
  if (callee.type === "MemberExpression" && callee.property?.type === "Identifier") {
    return EFFECT_HOOKS.has(callee.property.name);
  }
  return false;
}

function isFetchCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee.type === "Identifier" && callee.name === "fetch") return true;
  if (
    callee.type === "MemberExpression" &&
    callee.property?.type === "Identifier" &&
    callee.property.name === "fetch"
  ) {
    return true;
  }
  return false;
}

function walkForFetch(node, onFetch, depth = 0) {
  if (!node || typeof node !== "object" || depth > 60) return;
  if (isFetchCall(node)) {
    onFetch(node);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walkForFetch(child, onFetch, depth + 1);
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      walkForFetch(value, onFetch, depth + 1);
    }
  }
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow `fetch()` inside React effect hooks. Use SWR (useSWR / useSWRMutation) or a Server Component instead.",
      recommended: false,
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      noFetchInEffect:
        "Avoid calling fetch() inside {{hook}}. Use useSWR for reads, useSWRMutation for writes, or convert this page to a Server Component. See docs/frontend/data-fetching.md.",
      suggestUseSwr: "Replace this useEffect+fetch with useSWR (see docs/frontend/data-fetching.md).",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isEffectCall(node)) return;
        const callback = node.arguments[0];
        if (!callback) return;
        if (
          callback.type !== "ArrowFunctionExpression" &&
          callback.type !== "FunctionExpression"
        ) {
          return;
        }
        walkForFetch(callback, (fetchNode) => {
          const hookName =
            node.callee.type === "Identifier"
              ? node.callee.name
              : node.callee.property?.name ?? "useEffect";
          context.report({
            node: fetchNode,
            messageId: "noFetchInEffect",
            data: { hook: hookName },
            suggest: [
              {
                messageId: "suggestUseSwr",
                fix: () => null,
              },
            ],
          });
        });
      },
    };
  },
};

module.exports = {
  rules: {
    "no-fetch-in-effect": rule,
  },
};
