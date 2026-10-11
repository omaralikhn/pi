.PHONY: build build-offline check test install

build:
	npm run build

build-offline:
	npm run build:offline

check:
	npm run check

test:
	./test.sh

install:
	npm --prefix packages/coding-agent run build
	npm install --global --ignore-scripts $(CURDIR)/packages/coding-agent
	pi --version
