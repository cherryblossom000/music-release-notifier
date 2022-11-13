import {readFile, writeFile} from 'node:fs/promises'
import escapeHTML from 'escape-html'
import * as nodemailer from 'nodemailer'
import SpotifyWebAPI from 'spotify-web-api-node'
import 'dotenv/config'

const spotify = new SpotifyWebAPI({
	clientId: process.env.SPOTIFY_CLIENT_ID,
	clientSecret: process.env.SPOTIFY_CLIENT_SECRET
})

spotify.setAccessToken(
	(await spotify.clientCredentialsGrant()).body.access_token
)

const limit = 50
const getAllAlbums = async (
	artistId: string,
	country: string
): Promise<SpotifyApi.AlbumObjectSimplified[]> => {
	const {
		body: {total, items}
	} = await spotify.getArtistAlbums(artistId, {country, limit})
	return total > items.length
		? // eslint-disable-next-line unicorn/prefer-spread -- avoids .flat()
		  items.concat(
				...(await Promise.all(
					Array.from(
						{length: Math.ceil((total - items.length) / 50)},
						async (_, i) =>
							(
								await spotify.getArtistAlbums(artistId, {
									country,
									limit,
									offset: 50 * (i + 1)
								})
							).body.items
					)
				))
		  )
		: items
}

const dataFolder = new URL('../data/', import.meta.url)
const lastCheckedFile = new URL('last-checked', dataFolder)

const [lastChecked, subscriptions] = await Promise.all([
	/* eslint-disable unicorn/prefer-top-level-await -- Promise.all */
	readFile(lastCheckedFile, 'utf8').then(Number),
	readFile(new URL('subscriptions.json', dataFolder), 'utf8').then(
		/* eslint-enable unicorn/prefer-top-level-await */
		JSON.parse
	) as Promise<{email: string; country: string; artists: string[]}[]>
])

console.log('Last checked:', new Date(lastChecked))

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
											.filter(a => a.timestamp > lastChecked)
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

console.log(newReleases)

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
							body: {
								name: artistName,
								external_urls: {spotify: artistURL}
							}
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

await writeFile(lastCheckedFile, String(Date.now()))

console.log('Done')
