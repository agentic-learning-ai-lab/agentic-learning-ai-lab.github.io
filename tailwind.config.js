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
			}
		},
	},
	plugins: [
       addDynamicIconSelectors(),
    ],
	theme: {
	    extend: {
	        scale: {
	            '200': '2', // 200% scaling (doubles the size)
	        },
	        scale: {
	            '120': '1.2', // 120% scaling (doubles the size)
	        },
	        scale: {
	            '110': '1.1', // 110% scaling (doubles the size)
	        },
	    },
	},
}

