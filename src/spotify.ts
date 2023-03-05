import {fetch as undiciFetch, type Response} from 'undici'

const wait = async (ms: number): Promise<void> =>
	new Promise(resolve => {
		setTimeout(resolve, ms)
	})

const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
	const go = async (retries: number, delay: number): Promise<T> => {
		try {
			return await fn()
		} catch (error) {
			console.error(error)
			const newRetries = retries - 1
			if (!newRetries) throw error
			console.log(`${newRetries} retries left, waiting ${delay} ms`)
			await wait(delay)
			return go(newRetries, delay * 2)
		}
	}
	return go(5, 3000)
}

const fetch = async (
	message: string,
	...args: Parameters<typeof undiciFetch>
): Promise<Response> => {
	const response = await undiciFetch(...args)
	if (!response.ok && response.status !== 429) {
		throw new Error(
			`${response.status} (${response.statusText}) when ${message}
${await response.text()}`
		)
	}
	return response
}

interface WithExternalURLs {
	external_urls: {spotify: string}
}

interface Artist extends WithExternalURLs {
	id: string
	name: string
}

export interface Album extends WithExternalURLs {
	album_group?: 'album' | 'appears_on' | 'compilation' | 'single'
	artists: Artist[]
	name: string
	release_date: string
}

export const clientCredentialsClient = async (
	clientId: string,
	clientSecret: string
): Promise<{
	getArtist: (artistId: string) => Promise<Artist>
	getArtistAlbums: (
		artistId: string,
		options?: {market?: string; limit?: number; offset?: number}
	) => Promise<{
		items: Album[]
		total: number
	}>
}> => {
	const token = await fetch(
		'requesting token',
		'https://accounts.spotify.com/api/token',
		{
			method: 'POST',
			headers: {
				authorization: `Basic ${Buffer.from(
					`${clientId}:${clientSecret}`
				).toString('base64')}`,
				'content-type': 'application/x-www-form-urlencoded'
			},
			body: 'grant_type=client_credentials'
		}
	)
		.then(async r => r.json())
		.then(b => (b as {access_token: string}).access_token)

	type Lock = [promise: Promise<void>, timestamp: number]
	let retryLock: Lock | undefined
	const request = async <T>(message: string, path: string): Promise<T> =>
		retry(async () => {
			const handleRateLimit = async (): Promise<T> => {
				while (retryLock) {
					// eslint-disable-next-line no-await-in-loop -- waiting for rate limit
					await retryLock[0]
					if (Date.now() >= ((retryLock as Lock | undefined)?.[1] ?? 0))
						retryLock = undefined
				}
				const response = await fetch(
					message,
					`https://api.spotify.com/v1/${path}`,
					{
						headers: {authorization: `Bearer ${token}`}
					}
				)
				if (response.status === 429) {
					const retryAfter = Number(response.headers.get('retry-after'))
					// console.log('rate limited, retrying after', retryAfter, 'seconds')
					const retryAfterMs = retryAfter * 1000
					const timestamp =
						new Date(response.headers.get('date')!).getTime() + retryAfterMs
					if (timestamp > ((retryLock as Lock | undefined)?.[1] ?? 0))
						retryLock = [wait(retryAfterMs), timestamp]
					return handleRateLimit()
				}
				return response.json() as Promise<T>
			}
			return handleRateLimit()
		})

	return {
		getArtist: async artistId =>
			request(`fetching artist ${artistId}`, `artists/${artistId}`),
		getArtistAlbums: async (artistId, options = {}) =>
			request(
				`fetching albums from artist ${artistId}`,
				`artists/${artistId}/albums?${Object.entries(options)
					.map(([key, value]) => `${key}=${value}`)
					.join('&')}`
			)
	}
}
