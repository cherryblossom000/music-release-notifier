# music-release-notifier

## Building

```sh
just bundle
```

Copy `bundle/music-release-notifier.js` to the NAS.

## Running

Create a `.env` file like this:

```sh
SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SPOTIFY_CLIENT_SECRET=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
SMTP_HOST=example.com
SMTP_PORT=465
EMAIL_USER=foo@example.com
EMAIL_PASS=examplePassword
```

Put this file in the same directory as the `music-release-notifier.js` file.

Run:

```sh
node path/to/music-release-notifier.js path/to/config
```

### Configuration

Before you start it you need to add a `subscriptions.yaml` file in
`path/to/config`:

```yml
email: foo@gmail.com
artists: # Spotify artist ids
- 6yhD1KjhLxIETFF7vIRf8B # you can also put comments so you know what artist the ids are for
- 7Ln80lUS6He07XvHI8qqHH
# etc
```

To obtain the Spotify artist id, find the artist on Spotify, and copy the link
to the artist (if using the app, right-click on the artist name and click ‘Copy
link to artist’ in the ‘Share’ menu). The link should be something like this:

```none
https://open.spotify.com/artist/XXXXXXXXXXXXXXXXXXXXXX?si=YYYYYYYYYYYYYYYYYYYYYY
```

The id is `XXXXXXXXXXXXXXXXXXXXXX`. There may or may not be a
`?si=YYYYYYYYYYYYYYYYYYYYYY` on the end of the URL which you can ignore.
