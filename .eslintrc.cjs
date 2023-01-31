'use strict'

/** @type {import('eslint').Linter.Config} */
module.exports = {
	extends: '@cherryblossom/eslint-config/node/16',
	settings: {
		jsdoc: {mode: 'typescript'}
	},
	overrides: [
		{
			files: '.eslintrc.cjs',
			extends: '@cherryblossom/eslint-config/js/node/commonjs'
		},
		{
			files: 'src/**/*.ts',
			extends: [
				'@cherryblossom/eslint-config/ts/node/esm',
				'@cherryblossom/eslint-config/node/16'
			],
			parserOptions: {
				project: 'tsconfig.json',
				tsconfigRootDir: __dirname
			},
			settings: {'import/resolver': {typescript: {project: 'tsconfig.json'}}},
			rules: {
				'@typescript-eslint/naming-convention': 0
			}
		},
		{
			files: 'src/index.ts',
			rules: {'import/no-unused-modules': 0}
		}
	]
}
