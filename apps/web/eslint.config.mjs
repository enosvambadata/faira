import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // React Compiler's set-state-in-effect rule is aggressive: it flags the
      // common fetch-on-mount pattern (`useEffect(() => void load())` where a
      // useCallback sets loading state) as well as genuine cascading-render
      // smells. Kept as a warning so it still surfaces without failing CI on
      // the existing dispatch pages; new code should still avoid synchronous
      // setState directly in an effect body.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
