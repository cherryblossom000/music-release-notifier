import {readFile, writeFile} from 'node:fs/promises'
import {inspect} from 'node:util'
import escapeHTML from 'escape-html'
import * as nodemailer from 'nodemailer'
import * as yaml from 'js-yaml'
import SpotifyWebAPI from 'spotify-web-api-node'
import {WebapiError} from 'spotify-web-api-node/src/response-error.js'
import 'dotenv/config'

const wait = async (ms: number): Promise<void> =>
	new Promise(resolve => {
		setTimeout(resolve, ms)
	})

const dataFolder = new URL('../data/', import.meta.url)
const lastCheckedFile = new URL('last-checked', dataFolder)

let lastChecked: number | undefined
try {
	lastChecked = Number(await readFile(lastCheckedFile, 'utf8'))
} catch (error) {
	if (
		!(
			error instanceof Error &&
			'code' in error &&
			(error as {code: unknown}).code === 'ENOENT'
		)
	)
		throw error
}

if (lastChecked === undefined) console.log('Running for the first time')
else {
	console.log('Last checked:', new Date(lastChecked))

	const subscriptions = (await yaml.load(
		await readFile(new URL('subscriptions.yaml', dataFolder), 'utf8')
	)) as {email: string; country: string; artists: string[]}[]

	const spotify = new SpotifyWebAPI({
		clientId: process.env.SPOTIFY_CLIENT_ID,
		clientSecret: process.env.SPOTIFY_CLIENT_SECRET
	})

	spotify.setAccessToken(
		(await spotify.clientCredentialsGrant()).body.access_token
	)

	const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
		const go = async (retries: number): Promise<T> => {
			try {
				return await fn()
			} catch (error) {
				console.error(error)
				const newRetries = retries - 1
				if (!newRetries) throw error
				const delay = 2 ** newRetries * 100
				console.log(`${newRetries} retries left, waiting ${delay} ms`)
				await wait(delay)
				return go(newRetries)
			}
		}
		return go(5)
	}

	// TODO: export this type in DT
	interface Response<T> {
		body: T
		headers: Record<string, string>
		statusCode: number
	}
	const requestSpotify = async <T>(
		fn: () => Promise<Response<T>>
	): Promise<T> =>
		retry(async () => {
			const handleRateLimit = async (): Promise<T> => {
				let response: Response<T>
				try {
					response = await fn()
				} catch (error) {
					if (!(error instanceof WebapiError) || error.statusCode !== 429)
						throw error
					const retryAfter = Number(error.headers['retry-after'])
					console.log('rate limited, retrying after', retryAfter, 'seconds')
					await wait(retryAfter * 1000)
					return handleRateLimit()
				}
				return response.body
			}
			return handleRateLimit()
		})

	const limit = 50
	const getAllAlbums = async (
		artistId: string,
		country: string
	): Promise<SpotifyApi.AlbumObjectSimplified[]> => {
		const {total, items} = await requestSpotify(async () =>
			spotify.getArtistAlbums(artistId, {country, limit})
		)
		return total > items.length
			? // eslint-disable-next-line unicorn/prefer-spread -- avoids .flat()
			  items.concat(
					...(await Promise.all(
						Array.from(
							{length: Math.ceil((total - items.length) / 50)},
							async (_, i) =>
								(
									await requestSpotify(async () =>
										spotify.getArtistAlbums(artistId, {
											country,
											limit,
											offset: 50 * (i + 1)
										})
									)
								).items
						)
					))
			  )
			: items
	}

	const newReleases = (
		await Promise.all(
			subscriptions.map(
				async ({email, country, artists: subscribedArtists}) =>
					[
						email,
						(
							await Promise.all(
								subscribedArtists.map(
									async artistId =>
										[
											artistId,
											(
												await getAllAlbums(artistId, country)
											)
												.map(album => ({
													...album,
													timestamp: new Date(album.release_date).getTime()
												}))
												.filter(a => a.timestamp > lastChecked!)
												.sort((a, b) => a.timestamp - b.timestamp)
												.map(a => ({
													name: a.name,
													url: a.external_urls.spotify,
													releaseDate: a.release_date,
													artists: a.artists.map(({id, name}) => ({id, name}))
												}))
										] as const
								)
							)
						).filter(([, albums]) => albums.length)
					] as const
			)
		)
	).filter(([, artists]) => artists.length)

	console.log(inspect(newReleases, false, null, true))

	if (newReleases.length) {
		const emailUser = process.env.EMAIL_USER!
		const transporter = nodemailer.createTransport(
			{
				host: process.env.SMTP_HOST,
				port: Number(process.env.SMTP_PORT),
				secure: true,
				auth: {user: emailUser, pass: process.env.EMAIL_PASS}
			},
			{
				from: `New Music Releases <${emailUser}>`
			}
		)
		await transporter.verify()

		await Promise.all(
			newReleases.map(async ([email, artists]) => {
				const html = (
					await Promise.all(
						artists.map(async ([artistId, albums]) => {
							const {
								name: artistName,
								external_urls: {spotify: artistURL}
							} = await requestSpotify(async () => spotify.getArtist(artistId))
							return `<h2><a href="${artistURL}">${escapeHTML(
								artistName
							)}</a></h2><ul>${albums
								.map(
									a =>
										`<li><em><a href="${a.url}">${escapeHTML(a.name)}</a></em>${
											a.artists.length === 1 && a.artists[0]!.id === artistId
												? ''
												: ` by ${a.artists
														.map(x => escapeHTML(x.name))
														.join(', ')}`
										} (${a.releaseDate})</li>`
								)
								.join('')}</ul>`
						})
					)
				).join('')
				await transporter.sendMail({
					to: `<${email}>`,
					subject: 'New Music Releases',
					html
				})
			})
		)
	}
}

await writeFile(lastCheckedFile, String(Date.now()))

console.log('Done')
