import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import unusedImports from "eslint-plugin-unused-imports";
import importPlugin from "eslint-plugin-import";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      ".open-next/**",
      ".wrangler/**",
      "*.config.js",
      "*.config.mjs",
      "*.config.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: {
      "unused-imports": unusedImports,
      import: importPlugin,
    },
    rules: {
      // Turn off the base @typescript-eslint/no-unused-vars rule
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",
      "prefer-const": "off",
      // Use the unused-imports plugin to handle unused vars
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      // eslint-plugin-import rules
      "import/no-unused-modules": "off",
    },
  },
  // Disable unused-modules rule for Next.js app directory files
  {
    files: [
      "src/app/**/page.tsx",
      "src/app/**/layout.tsx",
      "src/app/**/template.tsx",
      "src/app/**/loading.tsx",
      "src/app/**/error.tsx",
      "src/app/**/not-found.tsx",
      "src/app/**/route.ts",
      "src/app/**/default.tsx",
      "src/proxy.ts",
      "*.config.ts",
      "*.config.js",
      "*.config.mjs",
    ],
    rules: {
      "import/no-unused-modules": "off",
    },
  },
  // Disable unused-modules rule for UI components (they're meant to be reusable)
  {
    files: ["src/components/ui/**/*.tsx"],
    rules: {
      "import/no-unused-modules": "off",
    },
  },
];

export default eslintConfig;
