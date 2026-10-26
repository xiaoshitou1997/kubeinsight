SHELL := /bin/sh

.PHONY: install dev build start test typecheck smoke docker clean

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

start:
	npm start

test:
	npm test

typecheck:
	npm run typecheck

smoke:
	npm run smoke

docker:
	docker build -t kubeinsight:0.1.0 .

clean:
	npm run clean
