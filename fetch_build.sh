#!/bin/sh

mkdir -p .build

version="$1"
image="compoundfinance/compound-protocol-alpha:$version"

docker pull "$image"
docker run "$image" cat .build/contracts.json > .build/contracts-$version.json
