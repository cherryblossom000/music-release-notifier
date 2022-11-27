import {readFile, writeFile} from 'node:fs/promises'
import {inspect} from 'node:util'
import escapeHTML from 'escape-html'
import * as nodemailer from 'nodemailer'
import * as yaml from 'js-yaml'
import * as Spotify from './spotify.js'
import 'dotenv/config'

const isSoundtrack = (name: string): boolean =>
	name.includes('soundtrack') || name.includes('motion picture')

const configFolder = new URL('../config/', import.meta.url)
const lastCheckedFile = new URL('last-checked', configFolder)

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
		await readFile(new URL('subscriptions.yaml', configFolder), 'utf8')
	)) as {email: string; country: string; artists: string[]}[]

	const spotify = await Spotify.clientCredentialsClient(
		process.env.SPOTIFY_CLIENT_ID!,
		process.env.SPOTIFY_CLIENT_SECRET!
	)

	const limit = 50
	const getAllAlbums = async (
		artistId: string,
		market: string
	): Promise<Spotify.Album[]> => {
		const {total, items} = await spotify.getArtistAlbums(artistId, {
			market,
			limit
		})

		return total > items.length
			? // eslint-disable-next-line unicorn/prefer-spread -- avoids .flat()
			  items.concat(
					...(await Promise.all(
						Array.from(
							{length: Math.ceil((total - items.length) / 50)},
							async (_, i) =>
								(
									await spotify.getArtistAlbums(artistId, {
										market,
										limit,
										offset: 50 * (i + 1)
									})
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
												.filter(
													a =>
														a.timestamp > lastChecked! &&
														!(
															a.album_group === 'appears_on' &&
															a.artists.length === 1 &&
															a.artists[0]!.id === '0LyfQWJT6nXafLPZqxe9Of' &&
															!isSoundtrack(a.name.toLowerCase())
														)
												)
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
							} = await spotify.getArtist(artistId)
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
