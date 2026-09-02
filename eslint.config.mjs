import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

const browserGlobals = {
  Blob: 'readonly',
  Event: 'readonly',
  File: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLElement: 'readonly',
  ImageData: 'readonly',
  KeyboardEvent: 'readonly',
  MessageEvent: 'readonly',
  URL: 'readonly',
  Worker: 'readonly',
  createImageBitmap: 'readonly',
  document: 'readonly',
  globalThis: 'readonly',
  location: 'readonly',
  navigator: 'readonly',
  onBeforeUnmount: 'readonly',
  onMounted: 'readonly',
  ref: 'readonly',
  requestAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  useRoute: 'readonly',
  useRouter: 'readonly',
  useSeoMeta: 'readonly',
  useTheme: 'readonly',
  useToast: 'readonly',
  window: 'readonly',
  computed: 'readonly',
  nextTick: 'readonly',
  watch: 'readonly',
}

export default tseslint.config(
  {
    ignores: [
      '.nuxt*/**',
      '.output*/**',
      '.vite*/**',
      'dist/**',
      'node_modules/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['app/**/*.{ts,vue}'],
    languageOptions: {
      globals: browserGlobals,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'off',
      'no-irregular-whitespace': 'off',
      'no-useless-assignment': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
    },
  },
  {
    files: ['tests/**/*.{ts,vue}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'off',
      'no-irregular-whitespace': 'off',
      'no-useless-assignment': 'off',
    },
  },
  {
    files: ['nuxt.config.ts', 'vitest.config.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-undef': 'off',
      'no-irregular-whitespace': 'off',
      'no-useless-assignment': 'off',
    },
  },
  {
    files: ['scripts/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
      'no-irregular-whitespace': 'off',
      'no-useless-assignment': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    rules: {
      'no-undef': 'off',
      'no-irregular-whitespace': 'off',
      'no-useless-assignment': 'off',
    },
  },
)
