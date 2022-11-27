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
