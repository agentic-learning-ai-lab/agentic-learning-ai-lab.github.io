#!/bin/bash
## Build to staging directory for local testing
## Usage: ./deploy.sh staging
##
## Production deployment is handled by GitHub Actions (push to main).

set -e

if [ "$1" != "staging" ]; then
    echo "Production deployment is now handled by GitHub Actions."
    echo "Push to main branch to deploy."
    echo ""
    echo "For local testing:"
    echo "  ./deploy.sh staging"
    exit 1
fi

echo "Building for local staging..."

rm -rf staging
mkdir -p staging

./build.sh

mv out staging/site

echo ""
echo "Staging build complete!"
echo ""
echo "To test locally:"
echo "  cd staging/site && python3 -m http.server 8000"
echo "  Then open http://localhost:8000"
echo ""
