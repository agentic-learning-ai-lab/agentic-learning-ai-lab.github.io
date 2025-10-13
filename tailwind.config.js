/** @type {import('tailwindcss').Config} */
const { addDynamicIconSelectors } = require('@iconify/tailwind');

module.exports = {
	prefix: 'tw-',
	important: false,
	content: [
		"**/*.{html, jsx, js}",
		"**/*.js",
		"**/*.html",
		"*.html",
		"**/**/*.html",
	],
	theme: {
		extend: {
			colors: {
				primary: "#000",
				secondary: "#fff",
			},
			fontFamily: {
				serif: [
					'"Iowan Old Style"',
					'"Apple Garamond"',
					'Baskerville',
					'"Times New Roman"',
					'"Droid Serif"',
					'Times',
					'"Source Serif Pro"',
					'serif',
					'"Apple Color Emoji"',
					'"Segoe UI Emoji"',
					'"Segoe UI Symbol"',
				],
				mono: [
					'"Space Mono"',
					'"SF Mono"',
					'"Monaco"',
					'Consolas',
					'"Courier New"',
					'ui-monospace',
					'monospace',
				],
			},
			scale: {
				'200': '2',
				'120': '1.2',
				'110': '1.1',
			},
		},
	},
	plugins: [
		addDynamicIconSelectors(),
	],
}

