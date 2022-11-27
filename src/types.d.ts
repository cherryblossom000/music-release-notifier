// eslint-disable-next-line eslint-comments/disable-enable-pair -- whole file
/* eslint-disable unicorn/custom-error-definition -- definition file */

declare module 'spotify-web-api-node/src/response-error.js' {
	class NamedError extends Error {
		readonly name: string
	}

	class WebapiError extends NamedError {
		body: unknown
		headers: Record<string, string>
		statusCode: number
	}
}
