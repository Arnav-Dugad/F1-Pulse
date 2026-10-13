// Apply the saved theme before first paint to avoid a flash (external file: the CSP forbids inline scripts).
try {
  var t = JSON.parse(localStorage.getItem("pulse-v2-theme") || "null");
  if (t !== "dark" && t !== "light") t = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.dataset.theme = t;
} catch (e) {}
