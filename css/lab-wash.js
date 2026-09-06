/* Agentic Learning AI Lab — hero wash
   Paints the lab artwork's pastel bands onto a <canvas> that sits behind a
   .hero card. Static (no animation); redraw on theme change and resize.
   Reads --wash-1..5 and --wash-alpha from lab-tokens.css, so it follows
   the theme. Usage:
     <section class="hero lab"><canvas class="wash" aria-hidden="true"></canvas> …</section>
     load lab-wash.js with a script tag, then call labWash.all() once
*/
(function (global) {
  function token(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  var BLOBS = [
    ["--wash-1", 0.08, 0.15, 0.55], ["--wash-2", 0.42, 0.85, 0.5], ["--wash-3", 0.78, 0.25, 0.6],
    ["--wash-4", 0.95, 0.95, 0.45], ["--wash-5", 0.30, 0.45, 0.7]
  ];
  function draw(canvas) {
    var host = canvas.parentElement, r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    var ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.globalAlpha = parseFloat(token("--wash-alpha")) || 0.9;
    ctx.filter = "blur(" + Math.round(Math.max(40, r.width * 0.06)) + "px)";
    BLOBS.forEach(function (b) {
      var rad = r.width * 0.32 * b[3], x = b[1] * r.width, y = b[2] * r.height;
      var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, token(b[0])); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rad * 1.6, rad, 0, 0, Math.PI * 2); ctx.fill();
    });
    ctx.filter = "none"; ctx.globalAlpha = 1;
  }
  function all() { document.querySelectorAll("canvas.wash").forEach(draw); }
  var t; global.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(all, 120); });
  if (global.matchMedia) global.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", all);
  new MutationObserver(all).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  global.labWash = { draw: draw, all: all };
})(window);
