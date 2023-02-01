build:
	dum build
alias b := build

out := "bundle/music-release-notifier.mjs"

bundle: build
	mkdir -p bundle
	dum esbuild \
		--bundle \
		--minify \
		--platform=node \
		--format=esm \
		--target=node18,es2022 \
		--outfile={{out}} \
		--banner:js="'import{createRequire}from\"node:module\";const require=createRequire(import.meta.url)'" \
		src/index.ts
	chmod +x {{out}}
alias n := bundle
