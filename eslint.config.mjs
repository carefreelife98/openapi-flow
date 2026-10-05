import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.ts'],
    ignores: ['**/types/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSTypeLiteral',
          message: 'Define object types in src/types/ and import them by name.',
        },
        {
          selector: 'TSTypeAliasDeclaration',
          message: 'Define type aliases in src/types/.',
        },
        {
          selector: 'TSInterfaceDeclaration',
          message: 'Define interfaces in src/types/.',
        },
      ],
    },
  },
);
