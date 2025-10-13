#!/bin/bash
## Run this from project root
## Usage:
##   ./deploy.sh          - Deploy to production (main branch)
##   ./deploy.sh staging  - Build to staging directory for local testing

set -e # Exit with nonzero exit code if anything fails

SOURCE_BRANCH="dev"
TARGET_BRANCH="main"
STAGING_MODE=false

# Check if staging mode
if [ "$1" = "staging" ]; then
    STAGING_MODE=true
    echo "Building for local staging..."
else
    echo "Deploying to production..."
fi

function doCompile {
    ./build.sh
}

if [ "$STAGING_MODE" = true ]; then
    # Staging mode: build to local staging directory

    # Clean staging directory
    rm -rf staging
    mkdir -p staging

    # Run our compile script to out/
    doCompile

    # Move out/ to staging/
    mv out staging/site

    echo ""
    echo "✓ Staging build complete!"
    echo ""
    echo "Files in staging/site:"
    find staging/site -type f | head -20
    echo "..."
    echo ""
    echo "To test locally:"
    echo "  cd staging/site && python3 -m http.server 8000"
    echo "  Then open http://localhost:8000"
    echo ""
else
    # Production mode: deploy to GitHub Pages

    # Save some useful information
    REPO=`git config remote.origin.url`
    SSH_REPO=${REPO/https:\/\/github.com\//git@github.com:}
    SHA=`git rev-parse --verify HEAD`

    # Clone the existing gh-pages for this repo into out/
    # Create a new empty branch if gh-pages doesn't exist yet (should only happen on first deply)
    rm -rf out
    git clone $REPO out
    cd out
    git checkout $TARGET_BRANCH || git checkout --orphan $TARGET_BRANCH
    cd ..

    # Clean out existing contents
    rm -rf out/**/* || exit 0

    # Run our compile script
    doCompile

    # Now let's go have some fun with the cloned repo
    cd out

    # Commit the "changes", i.e. the new version.
    # The delta will show diffs between new and old versions.
    git add --all .
    git commit -m "Deploy to GitHub Pages: ${SHA}"

    # Now that we're all set up, we can push.
    git push $REPO $TARGET_BRANCH

    echo ""
    echo "✓ Deployed to GitHub Pages!"
fi
