#!/bin/sh

set -exo pipefail

if [ -z "$1" ]; then
  echo "usage: ./fetch_build.sh $version"
  exit 1
fi

mkdir -p .build

version="$1"
image="compoundfinance/compound-protocol-alpha:$version"

docker pull "$image"
docker run "$image" cat .build/contracts.json > .build/$version.json
