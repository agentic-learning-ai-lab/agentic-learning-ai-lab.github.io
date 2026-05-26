// initialization

const RESPONSIVE_WIDTH = 1024

let headerWhiteBg = false
let isHeaderCollapsed = window.innerWidth < RESPONSIVE_WIDTH
const collapseBtn = document.getElementById("collapse-btn")
const collapseHeaderItems = document.getElementById("collapsed-header-items")



function onHeaderClickOutside(e) {

    if (!collapseHeaderItems.contains(e.target)) {
        toggleHeader()
    }

}


function toggleHeader() {
    if (isHeaderCollapsed) {
        // collapseHeaderItems.classList.remove("max-md:tw-opacity-0")
        collapseHeaderItems.classList.add("opacity-100",)
        collapseHeaderItems.style.width = "160px"
        collapseBtn.classList.remove("bi-list")
        collapseBtn.classList.add("bi-x", "max-lg:tw-fixed")
        isHeaderCollapsed = false

        setTimeout(() => window.addEventListener("click", onHeaderClickOutside), 1)

    } else {
        collapseHeaderItems.classList.remove("opacity-100")
        collapseHeaderItems.style.width = "0vw"
        collapseBtn.classList.remove("bi-x", "max-lg:tw-fixed")
        collapseBtn.classList.add("bi-list")
        isHeaderCollapsed = true
        window.removeEventListener("click", onHeaderClickOutside)

    }
}

function responsive() {
    if (window.innerWidth > RESPONSIVE_WIDTH) {
        // Resized into desktop. Clear any inline width override left
        // behind from a mobile open/close cycle. Also tear down the
        // click-outside listener registered by toggleHeader() — if the
        // menu was open at the moment of resize, that listener would
        // still be active and the next desktop click would call
        // toggleHeader() and re-collapse the menu inline (width: 0vw),
        // which beats the desktop CSS since inline styles win.
        collapseHeaderItems.style.width = ""
        collapseHeaderItems.classList.remove("opacity-100")
        collapseBtn.classList.remove("bi-x", "max-lg:tw-fixed")
        collapseBtn.classList.add("bi-list")
        window.removeEventListener("click", onHeaderClickOutside)
        isHeaderCollapsed = true
    } else {
        isHeaderCollapsed = true
    }
}

window.addEventListener("resize", responsive)


// ------------- theme toggle ---------------
// Three-state cycle: system → light → dark → system → ...
// 'system' = no localStorage entry; resolved at load via matchMedia.
// 'light' / 'dark' = explicit override stored in localStorage.
// Synchronous bootstrap in head.hbs reads the same key + media query
// before paint so the icon below is just a UI mirror of state already
// applied to <html>.
const THEME_STATES = ['system', 'light', 'dark']
const THEME_ICONS = { system: 'bi-circle-half', light: 'bi-sun', dark: 'bi-moon' }

function getStoredTheme() {
    try {
        const v = localStorage.getItem('theme')
        return (v === 'light' || v === 'dark') ? v : 'system'
    } catch (_) { return 'system' }
}

function resolveTheme(state) {
    if (state === 'light' || state === 'dark') return state
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
}

function applyTheme(resolved) {
    if (resolved === 'dark') {
        document.documentElement.dataset.theme = 'dark'
    } else {
        delete document.documentElement.dataset.theme
    }
    // Notify in-page widgets (e.g. Plotly) that their colors need re-derivation
    document.documentElement.dispatchEvent(new CustomEvent('themechange', { detail: { theme: resolved } }))
}

function updateToggleUi(state) {
    const icon = document.getElementById('theme-toggle-icon')
    const label = document.getElementById('theme-toggle-label')
    const btn = document.getElementById('theme-toggle')
    if (!btn) return
    if (icon) icon.className = `bi ${THEME_ICONS[state]}`
    if (label) label.textContent = state
    btn.setAttribute('aria-label', `Theme (${state}) — click to switch`)
}

function cycleTheme() {
    const current = getStoredTheme()
    const next = THEME_STATES[(THEME_STATES.indexOf(current) + 1) % THEME_STATES.length]
    try {
        if (next === 'system') localStorage.removeItem('theme')
        else localStorage.setItem('theme', next)
    } catch (_) {}
    applyTheme(resolveTheme(next))
    updateToggleUi(next)
}

// Initial UI sync + live OS-theme listener (active only while in 'system' mode).
;(function initThemeToggle() {
    updateToggleUi(getStoredTheme())
    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        // addEventListener is the modern API; older Safari needs addListener.
        const listener = () => {
            if (getStoredTheme() === 'system') applyTheme(resolveTheme('system'))
        }
        if (mq.addEventListener) mq.addEventListener('change', listener)
        else if (mq.addListener) mq.addListener(listener)
    }
})()


/**
 * Animations
 */

// gsap.registerPlugin(ScrollTrigger)

// gsap.to(".reveal-hero-text", {
//     opacity: 0,
//     y: "100%",
// })

// gsap.to(".reveal-hero-img", {
//     opacity: 0,
//     y: "100%",
// })

gsap.to(".reveal-up", {
    opacity: 0,
    y: "100%",
})


window.addEventListener("load", () => {
    // // animate from initial position
    // gsap.to(".reveal-hero-text", {
    //     opacity: 1,
    //     y: "0%",
    //     duration: 0.8,
    //     // ease: "power3.out",
    //     stagger: 0.5, // Delay between each word's reveal,
    //     // delay: 3
    // })

    // gsap.to(".reveal-hero-img", {
    //     opacity: 1,
    //     y: "0%",
    // })

    
})

// ------------- reveal section animations ---------------
const sections = gsap.utils.toArray("section")
sections.forEach((sec) => {
    const revealUptimeline = gsap.timeline({paused: true, 
                                            scrollTrigger: {
                                                            trigger: sec,
                                                            start: "10% 80%", // top of trigger hits the top of viewport
                                                            end: "20% 90%",
                                                            // markers: true,
                                                            // scrub: 1,
                                                        }})

    revealUptimeline.to(sec.querySelectorAll(".reveal-up"), {
        opacity: 1,
        duration: 0.8,
        y: "0%",
        stagger: 0.2,
    })
})
