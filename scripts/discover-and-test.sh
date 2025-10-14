#!/bin/bash

# Discover all project websites and test theme application
# This is a DRY RUN by default - use --apply to actually make changes

set -e

PAPERS_YAML="data/papers.yaml"
ORG="agentic-learning-ai-lab"
WORK_DIR="/tmp/lab-project-test"
DRY_RUN=true

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ "$1" = "--apply" ]; then
    DRY_RUN=false
    echo -e "${YELLOW}⚠ APPLY MODE - will make actual changes${NC}"
else
    echo -e "${GREEN}DRY RUN MODE - no changes will be made${NC}"
    echo "Use --apply to actually push changes"
fi
echo ""

# Extract project names from webpage URLs
project_slugs=$(grep "webpage:" "$PAPERS_YAML" | \
    grep -v "webpage: ''" | \
    sed "s/.*webpage: '//" | \
    sed "s/'$//" | \
    grep "agenticlearning.ai" | \
    sed 's|https://agenticlearning.ai/||' | \
    sed 's|/$||' | \
    sort -u)

echo "Found project slugs in papers.yaml:"
echo "$project_slugs"
echo ""

# Create work directory
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

# Track results
found_repos=()
missing_repos=()
updated_repos=()

echo "Attempting to discover GitHub repos..."
echo ""

for slug in $project_slugs; do
    echo "========================================"
    echo "Project: $slug"
    echo "========================================"

    # Try different repo name variations
    repo_variants=("$slug" "${slug//-/_}" "${slug//_/-}")

    found=false
    for repo_name in "${repo_variants[@]}"; do
        repo_url="git@github.com:$ORG/$repo_name.git"

        # Try to clone
        if git clone "$repo_url" "$repo_name-test" 2>/dev/null; then
            cd "$repo_name-test"

            # Check for web branches
            branches=$(git branch -r | grep -v HEAD | sed 's/origin\///' | tr -d ' ')

            web_branch=""
            for branch in html website gh-pages main; do
                if echo "$branches" | grep -q "^$branch$"; then
                    # Check if this branch has index.html
                    git checkout "$branch" 2>/dev/null
                    if [ -f "index.html" ]; then
                        web_branch="$branch"
                        break
                    fi
                fi
            done

            if [ -n "$web_branch" ]; then
                echo -e "${GREEN}✓ Found repo: $ORG/$repo_name (branch: $web_branch)${NC}"
                found_repos+=("$repo_name|$web_branch")

                # Check current status
                has_theme=$(grep -q "lab-theme.css" index.html && echo "yes" || echo "no")
                has_attr=$(grep -q "lab-attribution" index.html && echo "yes" || echo "no")

                echo "  Current status:"
                echo "    - Lab theme CSS: $has_theme"
                echo "    - Lab attribution: $has_attr"

                if [ "$has_theme" = "no" ]; then
                    echo ""
                    echo "  Would add lab theme CSS and attribution..."

                    if [ "$DRY_RUN" = false ]; then
                        echo "  Applying changes..."

                        # Backup
                        cp index.html index.html.backup

                        # Add lab theme CSS
                        # Find last CSS link and add before it
                        last_css_line=$(grep -n 'rel="stylesheet"' index.html | grep -v 'lab-theme' | tail -1 | cut -d: -f1)
                        if [ -n "$last_css_line" ]; then
                            sed -i '' "${last_css_line}i\\
  <link rel=\"stylesheet\" href=\"https://agenticlearning.ai/css/lab-theme.css\">
" index.html
                        fi

                        # Add lab attribution
                        if grep -q "</footer>" index.html; then
                            sed -i '' '/<\/footer>/i\
          <div class="lab-attribution">\
            Part of the <a href="https://agenticlearning.ai/" target="_blank">Agentic Learning AI Lab</a> at New York University\
          </div>
' index.html
                        fi

                        # Fix BibTeX section structure to match other sections
                        # Transform from: <section class="section" id="BibTeX">
                        #                   <div class="container is-max-desktop content">
                        # To:             <section class="hero is-small" id="BibTeX">
                        #                   <div class="hero-body">
                        #                     <div class="container">
                        #                       <div class="columns is-centered">
                        #                         <div class="column is-four-fifths">

                        if grep -q 'id="BibTeX"' index.html; then
                            echo "  Restructuring BibTeX section..."

                            # Use Python for complex HTML transformation
                            python3 << 'PYTHON_SCRIPT'
import re

with open('index.html', 'r') as f:
    content = f.read()

# Pattern to match BibTeX section with old structure
pattern = r'(<section class="section" id="BibTeX">)\s*(<div class="container is-max-desktop content">)'

# Check if it needs transformation
if re.search(pattern, content):
    # Find the closing tags for this section
    # Replace opening tags
    content = re.sub(
        pattern,
        r'<section class="hero is-small" id="BibTeX">\n      <div class="hero-body">\n        <div class="container">\n          <div class="columns is-centered">\n            <div class="column is-four-fifths">',
        content
    )

    # Find and replace the closing div before </section> for BibTeX
    # We need to be careful to only modify BibTeX section
    # Look for the pattern: </div>\n    </section> right after BibTeX content
    bibtex_pattern = r'(id="BibTeX"[\s\S]*?)(</div>)\s*(</section>)'

    def replace_bibtex_closing(match):
        section_content = match.group(1)
        # Add the additional closing divs
        return section_content + '</div>\n            </div>\n          </div>\n        </div>\n      ' + match.group(3)

    content = re.sub(bibtex_pattern, replace_bibtex_closing, content)

    with open('index.html', 'w') as f:
        f.write(content)

    print("  BibTeX section restructured successfully")
else:
    print("  BibTeX section already has correct structure or not found")
PYTHON_SCRIPT
                        fi

                        # Check if there are changes
                        if ! git diff --quiet index.html; then
                            echo "  Changes made. Diff:"
                            git diff index.html | head -50
                            echo ""

                            # Commit and push
                            git add index.html
                            git commit -m "Add unified lab theme styling

- Added lab-theme.css from main lab website
- Added lab attribution in footer
- Restructured BibTeX section to match other sections
- Maintains existing project styling"

                            echo "  Pushing to origin/$web_branch..."
                            git push origin "$web_branch"

                            updated_repos+=("$repo_name")
                            echo -e "${GREEN}  ✓ Successfully updated $repo_name${NC}"
                        else
                            echo "  No changes needed (modifications had no effect)"
                        fi
                    else
                        # Show what would be added
                        echo "  [DRY RUN] Would add before last CSS link:"
                        echo '    <link rel="stylesheet" href="https://agenticlearning.ai/css/lab-theme.css">'
                        echo ""
                        echo "  [DRY RUN] Would add before </footer>:"
                        echo '    <div class="lab-attribution">'
                        echo '      Part of the <a href="https://agenticlearning.ai/">Agentic Learning AI Lab</a> at NYU'
                        echo '    </div>'
                    fi
                else
                    echo -e "${YELLOW}  ⚠ Already has lab theme, skipping${NC}"
                fi
            else
                echo -e "${YELLOW}⚠ Repo exists but no index.html found in any branch${NC}"
            fi

            cd ..
            found=true
            break
        fi
    done

    if [ "$found" = false ]; then
        echo -e "${RED}✗ No repo found for: $slug${NC}"
        missing_repos+=("$slug")
    fi

    echo ""
done

# Summary
echo ""
echo "========================================"
echo "SUMMARY"
echo "========================================"
echo -e "${GREEN}Found repos: ${#found_repos[@]}${NC}"
if [ ${#found_repos[@]} -gt 0 ]; then
    for item in "${found_repos[@]}"; do
        echo "  - ${item%|*} (branch: ${item#*|})"
    done
fi
echo ""

if [ "$DRY_RUN" = false ]; then
    echo -e "${GREEN}Updated repos: ${#updated_repos[@]}${NC}"
    if [ ${#updated_repos[@]} -gt 0 ]; then
        for repo in "${updated_repos[@]}"; do
            echo "  - $repo"
        done
    fi
    echo ""
fi

echo -e "${RED}Missing repos: ${#missing_repos[@]}${NC}"
if [ ${#missing_repos[@]} -gt 0 ]; then
    for slug in "${missing_repos[@]}"; do
        echo "  - $slug"
    done
fi
echo ""

# Cleanup
cd ..
if [ "$DRY_RUN" = true ]; then
    echo "Work directory: $WORK_DIR (kept for inspection)"
    echo "To clean up: rm -rf $WORK_DIR"
else
    rm -rf "$WORK_DIR"
    echo "Work directory cleaned up"
fi

echo ""
echo "Done!"
