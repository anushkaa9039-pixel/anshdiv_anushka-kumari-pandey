// Tiny DOM helpers. Text always goes through textContent; styles through the CSSOM (CSP forbids inline styles).
export const $ = (s) => document.querySelector(s);
export const msg = (sel, t) => { $(sel).textContent = t; };

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "vars") for (const [n, x] of Object.entries(v)) el.style.setProperty(n, String(x));
    else el.setAttribute(k, v);
  }
  el.append(...kids);
  return el;
}

/** Short-lived notification, announced politely to screen readers, dismissible. */
export function toast(text, ms = 4500) {
  const t = h("div", { class: "toast" }, h("span", {}, text));
  const close = h("button", { type: "button", "aria-label": "Dismiss notification" }, "\u00d7");
  close.addEventListener("click", () => t.remove());
  t.append(close);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), ms);
}

const FIRST_BAD = { interests: "#hInterests input", loc: "#mapLink", team: "[name=teamMin]", faqs: "[name=faqQ]", timeline: "[name=tlLabel]", prizes: "[name=pzPlace]", mode: "[name=mode]", dateMode: "[name=dateMode]" };
/** Writes field errors, wires aria-invalid/aria-describedby, and focuses the first bad control. */
export function showErrors(form, errors) {
  let first = null;
  form.querySelectorAll("[data-err]").forEach((span) => {
    const key = span.dataset.err;
    if (key === "poster") return;
    span.textContent = errors[key] ?? "";
    span.id ||= `err-${key}`;
    const found = FIRST_BAD[key] ? form.querySelector(FIRST_BAD[key]) : form.elements[key];
    const control = found instanceof Element ? found : null;
    if (!control) return;
    if (errors[key]) { control.setAttribute("aria-invalid", "true"); control.setAttribute("aria-describedby", span.id); first ||= control; }
    else { control.removeAttribute("aria-invalid"); control.removeAttribute("aria-describedby"); }
  });
  first?.focus();
  return !first;
}
