build:
	docker build . -t music-release-notifier
alias b := build

run:
	docker run -v "$(realpath data)":/app/data music-release-notifier
alias r := run
