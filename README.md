# music-release-notifier

## Building

Create a `.env` file like this:

```sh
SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SPOTIFY_CLIENT_SECRET=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
SMTP_HOST=example.com
SMTP_PORT=465
EMAIL_USER=foo@example.com
EMAIL_PASS=examplePassword
```

Then run the following:

```sh
# Build
docker build -t music-release-notifier .
# Export the image
docker save music-release-notifier | gzip > music-release-notifier.tar.gz
```

## Running

On the NAS:

```sh
# Load
docker load -i music-release-notifier.tar.gz
# Run (/path/to/config is a placeholder)
docker run -v /path/to/config:/app/config music-release-notifier
```

### Configuration

Before you start it you need to add 2 files in `/path/to/config`:

- `schedule`: a [crontab schedule expression](https://crontab.guru) (e.g. `0 0 * * *`)
  for how often you want the program to run.
- `subscriptions.yaml`: something like this:

	```yml
	- email: email1@gmail.com
	  country: AU # Spotify market
	  artists: # Spotify artist ids
	  - 6yhD1KjhLxIETFF7vIRf8B # you can also put comments so you know what artist the ids are for
	  - 7Ln80lUS6He07XvHI8qqHH
	- email: email2@gmail.com
	  country: AU
	  artists:
	  - 1WgXqy2Dd70QQOU7Ay074N
	  - 0p4nmQO2msCgU4IF37Wi3j
	# etc
	```

To obtain the Spotify artist id, find the artist on Spotify, and copy the link
to the artist (if using the app, right-click on the artist name and click ‘Copy
link to artist’ in the ‘Share’ menu). The link should be something like this:

```
https://open.spotify.com/artist/XXXXXXXXXXXXXXXXXXXXXX?si=YYYYYYYYYYYYYYYYYYYYYY
```

The id is `XXXXXXXXXXXXXXXXXXXXXX`. There may or may not be a
`?si=YYYYYYYYYYYYYYYYYYYYYY` on the end of the URL which you should ignore.

Ensure that `/path/to/config` is writable by the Docker process as this program
adds a `last-checked` file to it to store when the program was last run.
