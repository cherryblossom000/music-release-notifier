build:
	docker build . -t music-release-notifier
alias b := build

run *args:
	docker run -v "$(realpath data)":/app/data {{args}} music-release-notifier
alias r := run

run-detach: (run "-d")
alias rd := run-detach
