import {readFile} from 'node:fs/promises'
import * as nodemailer from 'nodemailer'
import SpotifyWebAPI from 'spotify-web-api-node'
import 'dotenv/config'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

const dev = process.env.NODE_ENV !== 'production'

let transporterOptions: SMTPTransport.Options & {auth: {user: string}}

if (dev) {
	const {smtp, user, pass} = await nodemailer.createTestAccount()
	transporterOptions = {
		host: smtp.host,
		port: smtp.port,
		secure: smtp.secure,
		auth: {user, pass}
	}
} else {
	transporterOptions = {
		host: process.env.SMTP_HOST,
		port: Number(process.env.SMTP_PORT),
		secure: true,
		auth: {user: process.env.EMAIL_USER!, pass: process.env.EMAIL_PASS}
	}
}

const transporter = nodemailer.createTransport(transporterOptions, {
	from: `New Music Releases ${transporterOptions.auth.user}`
})
await transporter.verify()

const spotify = new SpotifyWebAPI({
	clientId: process.env.SPOTIFY_CLIENT_ID,
	clientSecret: process.env.SPOTIFY_CLIENT_SECRET
})

const lastChecked = Number(
	await readFile(new URL('last-checked', import.meta.url), 'utf8')
)

const info = await transporter.sendMail({to: '', subject: '', text: ''})
if (dev) console.log(nodemailer.getTestMessageUrl(info))
