# Search Functionality

This website now includes a client-side search feature that allows users to search through papers, people, and research areas.

## How It Works

### 1. Search Index Generation
- During the build process, `build/generate_search_index.js` reads data from YAML files in the `data/` directory
- It creates a searchable index with papers, people, and research areas
- The index is saved as `assets/search-index.json`

### 2. Client-Side Search
- `search.js` loads the search index when the page loads
- When users click the search button in the header, a modal opens
- As users type, the fuzzy search algorithm searches through titles, authors, descriptions, and keywords
- Results are ranked by relevance and displayed in real-time

### 3. Search Modal UI
- The search modal appears as a centered dropdown from the top of the page
- Fully responsive design that works on desktop, tablet, and mobile
- Shows up to 10 results, color-coded by type:
  - **Blue**: Papers
  - **Green**: People
  - **Purple**: Research Areas
- Smooth animations and transitions
- Users can navigate with keyboard (Enter to go to first result, Escape to close)
- Clicking outside the modal or the close button closes it
- Fixed positioning ensures it stays visible during scrolling
- Mobile-optimized layout with touch-friendly scrolling

## Files Modified/Added

### New Files:
- `build/generate_thumbnails.js` - Generates 120x120px center-cropped square thumbnails
- `build/generate_search_index.js` - Generates search index from YAML data with thumbnail paths
- `search.js` - Client-side search functionality with thumbnail support
- `assets/search-index.json` - Generated search index (created during build)
- `assets/images/thumbnails/` - Directory containing optimized thumbnails (4-25KB each)

### Modified Files:
- `templates/header.hbs` - Made search button active with `onclick="openSearch()"`
- `templates/head.hbs` - Added `<script src="/search.js"></script>`
- `css/index.css` - Added comprehensive search styles matching site design
- `package.json` - Updated build script to include thumbnail and search index generation
- `build.sh` - Added `search.js` to files copied to output directory

## Build Process

When you run `npm run build` or `./build.sh`, the following happens:

1. `npm run build:tailwind` compiles and minifies Tailwind CSS for production
2. `node ./build/generate_thumbnails.js` creates center-cropped 256x256px thumbnails
   - Converts WebP images to PNG thumbnails (sips limitation)
   - Skips thumbnails that are already up-to-date
   - Uses macOS `sips` command for image processing
3. `node ./build/generate_search_index.js` creates `assets/search-index.json` with thumbnail paths
4. `node ./build/build_pages.js` generates HTML pages
5. `build.sh` copies all files including `search.js` and thumbnails to the `out/` directory

## Design Choices

### Thumbnails
- **Size**: 256x256px square thumbnails for high-resolution displays
- **Display Size**: Scaled down to 80px (desktop), 60px (tablet), 50px (mobile)
- **Cropping**: Center-cropped to fill the square (no letterboxing)
- **Format**: PNG for compatibility (WebP sources converted to PNG)
- **File Size**: 50-140KB per thumbnail (higher resolution for 4K displays)
- **Total Size**: ~3.1MB for all 34 thumbnails

### Styling
- **Layout**: Rectangular boxes matching existing site design
- **Background**: Light gray (`#f3f3f3b4`) like paper/people cards
- **Borders**: 2px transparent, turns gray (`#4b5563`) on hover
- **No Rounded Corners**: Consistent with site's rectangular aesthetic
- **Badges**: Overlaid on top-left corner of thumbnails with 95% opacity
  - Positioned absolutely within thumbnail container
  - Small, compact size (9px font on desktop, scales down to 7px on mobile)
  - Color-coded by type with borders (Paper: blue, Person: green, Research Area: purple)
- **Space Efficient**: Badge overlay saves vertical space and creates cleaner alignment

## Testing Locally

After running the build:
1. Open any generated HTML file in the `out/` directory
2. Click the search button (magnifying glass icon) in the header
3. Type to search for papers, people, or research areas
4. Results should appear in real-time

## Customization

### Adjusting Search Algorithm
Edit the `fuzzySearch()` function in `search.js` to modify:
- Score weights for different match types
- Maximum number of results shown
- Match criteria

### Styling the Search Modal
The modal uses Tailwind CSS classes. Modify the HTML template in the `createSearchModal()` function in `search.js` to change the appearance.

### Adding More Searchable Content
To include additional content types:
1. Add them to `build/generate_search_index.js`
2. Update the color coding in `performSearch()` in `search.js`
