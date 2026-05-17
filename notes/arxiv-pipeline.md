# ArXiv Papers Integration

This document describes how to display arXiv papers as HTML on your website with MathJax support.

## Overview

The system downloads pre-rendered HTML from arXiv's ar5iv service and displays them with a toggle between:
- **Abstract view** (default): Shows metadata and abstract
- **Full Paper view**: Shows the complete rendered paper with MathJax equations

## Prerequisites

None! The system downloads pre-rendered HTML from arXiv, so you don't need to install any tools.

## How to Add a Paper

### 1. Update papers.yaml

Add the `enable_full_paper: true` field to your paper entry in `data/papers.yaml`:

```yaml
- title: "My Amazing Paper"
  image: "/assets/images/papers/my-paper.png"
  authors:
    - "Author One"
    - "Author Two"
  short_abstract: "Brief summary here"
  abstract: "Full abstract here..."
  arxiv: "https://arxiv.org/abs/2XXX.XXXXX"
  pdf: "https://arxiv.org/pdf/2XXX.XXXXX"
  permalink: "my-paper"
  enable_full_paper: true  # <-- Add this line
  research_areas:
    - "your-research-area"
  date: 2025-01-15
  journal: "Conference Name"
  is_recent: true
```

### 2. Build the Site

Run the build process:

```bash
npm run build
```

This will:
1. Download the pre-rendered HTML from ar5iv.labs.arxiv.org (only for papers that don't already have it)
2. Extract and clean the article content
3. Generate paper pages with toggle functionality
4. Copy all files to the output directory

**Build options:**
- `npm run build` - Normal build (skips already downloaded papers)
- `npm run build:arxiv` - Only download arXiv papers (skips existing)
- `npm run build:arxiv:force` - Force re-download all papers (even if they exist)

### 3. Preview

Open the paper page in your browser:
```
http://localhost:8000/research/my-paper/
```

You should see:
- Abstract view by default
- A toggle button to switch to "Full Paper"
- Properly rendered math equations with MathJax

## Directory Structure

```
.
├── papers-html/               # Optional: Store downloaded HTML for reference
├── data/
│   └── papers.yaml            # Paper metadata (add enable_full_paper here)
├── research/
│   └── my-paper/
│       ├── index.html         # Generated paper page
│       └── paper-content.json # Downloaded arXiv HTML content
└── css/
    └── arxiv-paper.css        # Styling for arXiv content
```

## Build Process Details

### What Happens During Build

1. **ArXiv HTML Download** (`npm run build:arxiv`):
   - Reads `data/papers.yaml`
   - For each paper with `enable_full_paper: true` and `arxiv` link:
     - Checks if `paper-content.json` already exists
     - If exists: skips download (unless `--force` flag is used)
     - If not exists: downloads from ar5iv.labs.arxiv.org
     - Extracts arXiv ID from the URL
     - Extracts article content and styles
     - Saves to `research/{permalink}/paper-content.json`

2. **Page Generation** (`node ./build/build_pages.js`):
   - Creates paper pages with toggle functionality
   - Sets `has_full_paper` flag for papers with `enable_full_paper: true`
   - Includes MathJax script and custom CSS

### When to Use Force Mode

Use `npm run build:arxiv:force` when:
- ArXiv updated the paper and you want the latest version
- The downloaded HTML is corrupted or incomplete
- You made changes to the download script and want to regenerate

**Note:** Force mode will re-download all papers, which takes longer and uses bandwidth. Use it only when necessary.

### Troubleshooting ArXiv HTML Download

If download fails, check:

1. **ArXiv URL is valid:**
   ```bash
   # Make sure the arxiv field in papers.yaml has the correct URL
   arxiv: "https://arxiv.org/abs/2508.15717"
   ```

2. **ArXiv has HTML version:**
   - Visit https://ar5iv.labs.arxiv.org/html/YOUR_ARXIV_ID
   - Not all papers on arXiv have HTML versions yet
   - Older papers may not be available

3. **Check build output:**
   ```bash
   npm run build:arxiv
   ```

4. **Common issues:**
   - Network connectivity: Ensure you can reach ar5iv.labs.arxiv.org
   - Missing arxiv field: Paper must have both `arxiv` and `enable_full_paper` fields
   - Invalid arXiv ID: Check that the arXiv URL format is correct

## Customization

### Styling

Edit `css/arxiv-paper.css` to customize:
- Typography (fonts, sizes)
- Colors and spacing
- Equation display
- Figure and table styling

The default style matches your site's monospace font theme.

### MathJax Configuration

Edit `paper.hbs` to customize MathJax settings:

```javascript
MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    // Add packages, macros, etc.
  }
};
```

## Advanced Features

### Direct Linking to Full Paper

Users can link directly to the full paper view:
```
https://agenticlearning.ai/research/my-paper/#full-paper
```

### Lazy Loading

The paper HTML is only loaded when the user clicks "Full Paper", reducing initial page load time.

### Image Handling

ar5iv automatically:
- Converts images to web formats
- Maintains relative paths
- Includes images in the HTML

### Bibliography

ar5iv processes BibTeX references and creates:
- Inline citations with links
- Bibliography section
- Clickable reference links

## Example Workflow

1. **Add paper to papers.yaml:**
   ```yaml
   enable_full_paper: true
   arxiv: "https://arxiv.org/abs/2508.15717"
   ```

2. **Build:**
   ```bash
   npm run build
   ```

3. **Deploy:**
   ```bash
   ./deploy.sh
   ```

## Notes

- Papers without `enable_full_paper: true` will only show the abstract view (no toggle)
- ArXiv HTML download happens during build time, not at runtime
- The generated `paper-content.json` can be version controlled
- MathJax loads from CDN (works offline if cached)
- Not all arXiv papers have HTML versions available

## Support

For issues with:
- **ArXiv HTML availability**: Check https://ar5iv.labs.arxiv.org
- **MathJax rendering**: Check MathJax documentation
- **Build process**: Check console output during `npm run build`
- **Styling**: Edit `css/arxiv-paper.css`
