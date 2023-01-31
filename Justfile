tag := "music-release-notifier"

build:
	docker build . -t {{tag}}
alias b := build

run *args:
	docker run -v "$(realpath config)":/app/config {{args}} {{tag}}
alias r := run

run-detach: (run "-d")
alias rd := run-detach

export: build
	docker save {{tag}} | gzip > {{tag}}.tar.gz

bundle:
	mkdir -p bundle
	dum esbuild \
		--bundle \
		--minify \
		--platform=node \
		--format=esm \
		--target=node18,es2022 \
		--outfile=bundle/index.js \
		--banner:js="'import{createRequire}from\"node:module\";const require=createRequire(import.meta.url)'" \
		src/index.ts
