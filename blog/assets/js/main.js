(function () {
  "use strict";

  /* ---------- theme ---------- */
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");
  var KEY = "theme";

  function effectiveTheme() {
    var t = root.dataset.theme || "auto";
    if (t === "dark" || t === "light") return t;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch (e) {}
    });
  }

  /* ---------- code copy ---------- */
  document.querySelectorAll(".prose pre").forEach(function (pre) {
    var btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.type = "button";
    btn.textContent = "复制";
    btn.addEventListener("click", function () {
      var code = pre.querySelector("code");
      var text = code ? code.innerText : pre.innerText;
      var done = function () {
        btn.textContent = "已复制";
        setTimeout(function () { btn.textContent = "复制"; }, 1500);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, function () {});
      } else {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
    pre.appendChild(btn);
  });

  /* ---------- toc active heading ---------- */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc-aside .toc a"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var byId = {};
    tocLinks.forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute("href") || "").replace(/^#/, "");
      if (id) byId[id] = a;
    });
    var headings = Object.keys(byId)
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    var visible = {};
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) visible[en.target.id] = true;
        else delete visible[en.target.id];
      });
      var active = null;
      headings.forEach(function (h) { if (!active && visible[h.id]) active = h.id; });
      tocLinks.forEach(function (a) {
        var id = decodeURIComponent(a.getAttribute("href") || "").replace(/^#/, "");
        a.classList.toggle("is-active", id === active);
      });
    }, { rootMargin: "-6rem 0px -65% 0px", threshold: 0 });
    headings.forEach(function (h) { obs.observe(h); });
  }

  /* ---------- search ---------- */
  var box = document.getElementById("search");
  if (!box) return;
  var input = document.getElementById("search-input");
  var results = document.getElementById("search-results");
  var openBtn = document.getElementById("search-open");
  var posts = null;
  var loading = false;

  function load() {
    if (posts || loading) return;
    loading = true;
    fetch("/index.json")
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) { posts = Array.isArray(data) ? data : []; })
      .catch(function () { posts = []; })
      .then(function () { loading = false; if (input.value.trim()) render(input.value.trim()); });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function mark(text, q) {
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }

  function render(q) {
    if (!posts) { results.innerHTML = '<p class="search-hint">正在载入索引…</p>'; load(); return; }
    var ql = q.toLowerCase();
    var hits = posts.filter(function (p) {
      return (p.title || "").toLowerCase().indexOf(ql) > -1 ||
        (p.summary || "").toLowerCase().indexOf(ql) > -1 ||
        (p.tags || []).join(" ").toLowerCase().indexOf(ql) > -1;
    }).slice(0, 20);

    if (!hits.length) {
      results.innerHTML = '<p class="search-hint">没有找到「' + esc(q) + "」相关内容</p>";
      return;
    }
    results.innerHTML = hits.map(function (p) {
      return '<a class="search-hit" href="' + p.url + '">' +
        '<div class="search-hit-title">' + mark(p.title, q) + "</div>" +
        '<div class="search-hit-meta">' + p.date + (p.tags && p.tags.length ? " · " + esc(p.tags.join(" / ")) : "") + "</div>" +
        "</a>";
    }).join("");
  }

  function open() {
    box.hidden = false;
    document.body.style.overflow = "hidden";
    load();
    setTimeout(function () { input.focus(); }, 20);
  }

  function close() {
    box.hidden = true;
    document.body.style.overflow = "";
  }

  if (openBtn) openBtn.addEventListener("click", open);
  box.addEventListener("click", function (e) {
    if (e.target.hasAttribute("data-close")) close();
  });
  input.addEventListener("input", function () {
    var q = input.value.trim();
    if (!q) { results.innerHTML = '<p class="search-hint">输入关键词开始搜索</p>'; return; }
    render(q);
  });

  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (e.key === "Escape" && !box.hidden) { close(); return; }
    if (e.key === "/" && tag !== "input" && tag !== "textarea" && box.hidden) {
      e.preventDefault();
      open();
    }
  });
})();
