// src/projectui.js — DOM glue for the project constellation:
//   hover tip (name trailing the cursor), info panel, and the crawlable /
//   screen-reader mirror. Localized fields are picked by lang ("en"|"ko").

export function pick(project, field, lang) {
  if (lang === "ko" && project[field + "_ko"]) return project[field + "_ko"];
  return project[field] || "";
}

export function setupNodeTip() {
  const tip = document.getElementById("node-tip");
  let x = 0;
  let y = 0;
  const place = () => {
    tip.style.transform = `translate(${x}px, ${y}px) translate(-50%, -180%)`;
  };
  addEventListener(
    "pointermove",
    (e) => {
      x = e.clientX;
      y = e.clientY;
      if (tip.classList.contains("live")) place();
    },
    { passive: true },
  );
  return {
    show(name) {
      if (!name) {
        tip.classList.remove("live");
        return;
      }
      tip.textContent = name;
      place();
      tip.classList.add("live");
    },
    hide() {
      tip.classList.remove("live");
    },
  };
}

export function setupProjectPanel(onClose) {
  const panel = document.getElementById("project-panel");
  const close = () => {
    panel.hidden = true;
    if (onClose) onClose();
  };
  panel.querySelector(".project-panel-close").addEventListener("click", close);
  return {
    show(project, lang) {
      document.getElementById("project-panel-tags").textContent = (project.tags || []).join(" · ");
      document.getElementById("project-panel-name").textContent = pick(project, "name", lang);
      document.getElementById("project-panel-blurb").textContent = pick(project, "blurb", lang);
      document.getElementById("project-panel-impact").textContent = project.impact || "";
      const link = document.getElementById("project-panel-link");
      if (project.url) {
        link.href = project.url;
        link.hidden = false;
      } else {
        link.hidden = true;
      }
      panel.hidden = false;
    },
    hide: close,
    isOpen: () => !panel.hidden,
  };
}

// Real, indexable text mirrored from the single source data/projects.js.
export function renderProjectsMirror(projects, lang = "en") {
  const root = document.getElementById("projects");
  if (!root) return;
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  root.innerHTML =
    "<h2>Selected projects</h2>" +
    projects
      .map((p) => {
        const name = esc(pick(p, "name", lang));
        const blurb = esc(pick(p, "blurb", lang));
        const impact = esc(p.impact || "");
        const tags = esc((p.tags || []).join(", "));
        const link = p.url ? ` <a href="${esc(p.url)}">${esc(p.url)}</a>` : "";
        return `<article><h3>${name}</h3><p>${blurb}</p><p>${impact}</p><p>${tags}${link}</p></article>`;
      })
      .join("");
}
