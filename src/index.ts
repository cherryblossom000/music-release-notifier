#!/usr/bin/env node

import {readFile, writeFile} from 'node:fs/promises'
import * as path from 'node:path'
import {inspect} from 'node:util'
import escapeHTML from 'escape-html'
import * as nodemailer from 'nodemailer'
import * as yaml from 'js-yaml'
import {z} from 'zod'
import * as Spotify from './spotify.js'
import 'dotenv/config'

const variousArtistsIds: ReadonlySet<string> = new Set([
	'0LyfQWJT6nXafLPZqxe9Of', // Various Artists
	'0wzdbYD0TtDPvbjQ5QT7nY', // ァリアス・アーティスト
])
const isSoundtrack = (name: string): boolean =>
	name.includes('soundtrack') || name.includes('motion picture')

const HELP_TEXT = `Usage: ./music-release-notifier <config-folder>

config-folder is the path to a folder containing a \`subscriptions.yaml\` file.
This file should have these properties:
- \`email\`: The email to send the new releases to
- \`artists\`: A list of Spotify artist ids
- \`country\` (optional, defaults to \`AU\`): The Spotify market`

const args = process.argv.slice(2)
if (args.length !== 1) {
	console.error(HELP_TEXT)
	process.exit(1)
}

const configFolder = args[0]!
const lastCheckedFile = path.join(configFolder, 'last-checked')

let lastCheckedString: string | undefined
try {
	lastCheckedString = await readFile(lastCheckedFile, 'utf8')
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
const lastChecked =
	lastCheckedString === undefined
		? undefined
		: z.number().parse(Number(lastCheckedString))

const newLastCheckedDate = new Date()
console.log('Now:', newLastCheckedDate)
const timezoneOffset = new Date('2023').getTimezoneOffset()
console.log('Timezone offset:', timezoneOffset)
newLastCheckedDate.setMinutes(
	newLastCheckedDate.getMinutes() + timezoneOffset - 12 * 60,
)
console.log('New last checked:', newLastCheckedDate)
const newLastChecked = newLastCheckedDate.getTime()

if (lastChecked === undefined) console.log('Running for the first time')
else {
	console.log('Last checked:', new Date(lastChecked))

	const {
		email,
		country = 'AU',
		artists: subscribedArtists,
	} = z
		.object({
			email: z.string(),
			country: z.string().optional(),
			artists: z.array(z.string().length(22)),
		})
		.parse(
			await yaml.load(
				await readFile(path.join(configFolder, 'subscriptions.yaml'), 'utf8'),
			),
		)

	const spotify = await Spotify.clientCredentialsClient(
		process.env.SPOTIFY_CLIENT_ID!,
		process.env.SPOTIFY_CLIENT_SECRET!,
	)

	const limit = 50
	const getAllAlbums = async (
		artistId: string,
		market: string,
	): Promise<Spotify.Album[]> => {
		const {total, items} = await spotify.getArtistAlbums(artistId, {
			market,
			limit,
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
										offset: 50 * (i + 1),
									})
								).items,
						),
					)),
			  )
			: items
	}

	const newReleases = (
		await Promise.all(
			subscribedArtists.map(async artistId => ({
				id: artistId,
				albums: (
					await getAllAlbums(artistId, country)
				)
					.map(album => ({
						...album,
						timestamp:
							new Date(album.release_date).getTime() + timezoneOffset * 60_000,
					}))
					.filter(
						a =>
							a.timestamp > lastChecked &&
							a.timestamp < newLastChecked &&
							!(
								a.album_group === 'appears_on' &&
								a.artists.length === 1 &&
								variousArtistsIds.has(a.artists[0]!.id) &&
								!isSoundtrack(a.name.toLowerCase())
							),
					)
					.sort((a, b) => a.timestamp - b.timestamp)
					.map(a => ({
						name: a.name,
						url: a.external_urls.spotify,
						releaseDate: a.release_date,
						artists: a.artists.map(({id, name}) => ({id, name})),
					})),
			})),
		)
	).filter(({albums}) => albums.length)

	console.log(inspect(newReleases, false, null, true))

	if (newReleases.length) {
		const emailUser = process.env.EMAIL_USER!
		const transporter = nodemailer.createTransport(
			{
				host: process.env.SMTP_HOST,
				port: Number(process.env.SMTP_PORT),
				secure: true,
				auth: {user: emailUser, pass: process.env.EMAIL_PASS},
			},
			{
				from: `New Music Releases <${emailUser}>`,
			},
		)
		await transporter.verify()

		const html = (
			await Promise.all(
				newReleases.map(async ({id: artistId, albums}) => {
					const {
						name: artistName,
						external_urls: {spotify: artistURL},
					} = await spotify.getArtist(artistId)
					return `<h2><a href="${artistURL}">${escapeHTML(
						artistName,
					)}</a></h2><ul>${albums
						.map(
							a =>
								`<li><em><a href="${a.url}">${escapeHTML(a.name)}</a></em>${
									a.artists.length === 1 && a.artists[0]!.id === artistId
										? ''
										: ` by ${a.artists.map(x => escapeHTML(x.name)).join(', ')}`
								} (${a.releaseDate})</li>`,
						)
						.join('')}</ul>`
				}),
			)
		).join('')
		await transporter.sendMail({
			to: `<${email}>`,
			subject: 'New Music Releases',
			html,
		})
	}
}

await writeFile(lastCheckedFile, String(newLastChecked))

console.log('Done')
