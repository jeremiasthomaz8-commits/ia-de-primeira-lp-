import { formatWhatsApp, validateLead } from "./lead.js";

const menuButton = document.querySelector(".menu-toggle");
const menu = document.querySelector("#menu");

function setMenu(open) {
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
}

menuButton.hidden = false;
menuButton.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") === "false"));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    menuButton.focus();
  }
});

const navigation = [...menu.querySelectorAll("a")];
for (const link of navigation) {
  link.addEventListener("click", () => {
    if (menuButton.getAttribute("aria-expanded") === "true") {
      setMenu(false);
      const target = document.querySelector(link.hash);
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  });
}

function updateNavigation() {
  for (const link of navigation) {
    if (link.hash === (location.hash || "#inicio")) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
}
window.addEventListener("hashchange", updateNavigation);
updateNavigation();

const siteHeader = document.querySelector(".site-header");
let headerFrame;

function updateHeader() {
  headerFrame = undefined;
  const isCompact = siteHeader.hasAttribute("data-compact");
  // Separate the thresholds so small movements near the top do not restart the transition.
  siteHeader.toggleAttribute("data-compact", window.scrollY > (isCompact ? 8 : 24));
  const bounds = siteHeader.getBoundingClientRect();
  const lightSection = [bounds.top + 16, bounds.bottom - 16].some(y =>
    document.elementsFromPoint(bounds.width / 2, y)
      .some(element => element.matches("main .cream"))
  );
  const background = lightSection ? "light" : "dark";
  if (siteHeader.dataset.glassBackground !== background) {
    siteHeader.dataset.glassBackground = background;
  }
}

function scheduleHeaderUpdate() {
  headerFrame ??= requestAnimationFrame(updateHeader);
}

window.addEventListener("scroll", scheduleHeaderUpdate, { passive: true });
window.addEventListener("resize", scheduleHeaderUpdate);
scheduleHeaderUpdate();

if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const headingObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("text-blur-reveal");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.2 });

  for (const heading of document.querySelectorAll("main h2")) {
    headingObserver.observe(heading);
  }
}

const form = document.querySelector(".lead-form");
const interest = form.elements.interesse;
const whatsapp = form.elements.whatsapp;
const submit = form.querySelector(".submit");
const status = document.querySelector("#form-status");
const submitLabel = submit.querySelector("span");
let available = false;

document.querySelector("#ano").textContent = new Date().getFullYear();
form.noValidate = true;

for (const link of document.querySelectorAll("[data-interest]")) {
  link.addEventListener("click", () => {
    interest.value = link.dataset.interest;
    clearError(interest);
  });
}

whatsapp.addEventListener("input", () => {
  const previous = whatsapp.value;
  const position = whatsapp.selectionStart;
  const digitsBeforeCursor = previous.slice(0, position).replace(/\D/g, "").length;
  whatsapp.value = formatWhatsApp(previous);
  if (position === previous.length) return;
  let caret = 0;
  let digits = 0;
  while (caret < whatsapp.value.length && digits < digitsBeforeCursor) {
    if (/\d/.test(whatsapp.value[caret])) digits++;
    caret++;
  }
  whatsapp.setSelectionRange(caret, caret);
});

function clearError(field) {
  const error = document.getElementById("erro-" + field.name);
  if (!error) return;
  field.removeAttribute("aria-invalid");
  error.textContent = "";
}

function showErrors(errors) {
  let firstField;
  for (const [name, message] of Object.entries(errors)) {
    const field = form.elements.namedItem(name);
    const error = document.getElementById("erro-" + name);
    if (!field || !error) continue;
    field.setAttribute("aria-invalid", "true");
    error.textContent = message;
    firstField ??= field;
  }
  firstField?.focus();
}

form.addEventListener("input", event => clearError(event.target));

function setStatus(message, state = "") {
  status.textContent = message;
  status.dataset.state = state;
}

async function loadConfig() {
  try {
    const response = await fetch(form.action, { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const config = await response.json();
    if (config.privacyUrl) {
      for (const link of document.querySelectorAll("[data-privacy]")) {
        link.href = config.privacyUrl;
        link.hidden = false;
      }
    }
    available = config.available === true;
    submit.disabled = !available;
    if (available) setStatus("");
  } catch {
    // A versão estática mantém o aviso de indisponibilidade.
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!available || submit.disabled) return;
  const payload = Object.fromEntries(new FormData(form));
  payload.consentimento = form.elements.consentimento.checked;
  const { errors } = validateLead(payload);
  for (const field of form.elements) clearError(field);
  if (Object.keys(errors).length) {
    setStatus("Confira os campos indicados e tente novamente.");
    showErrors(errors);
    return;
  }

  submit.disabled = true;
  submitLabel.textContent = "Enviando seu interesse…";
  form.setAttribute("aria-busy", "true");
  setStatus("Enviando seu interesse…");

  try {
    const response = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (response.ok && result.ok === true) {
      form.reset();
      setStatus("Seu interesse foi recebido. A equipe da IA de Primeira poderá entrar em contato.", "success");
    } else {
      setStatus(result.message || "Não foi possível enviar agora. Tente novamente em instantes.");
      if (result.errors) showErrors(result.errors);
    }
  } catch {
    setStatus("Não foi possível confirmar o envio. Confira sua conexão e tente novamente.");
  } finally {
    submit.disabled = !available;
    submitLabel.textContent = "Quero dar o primeiro passo";
    form.removeAttribute("aria-busy");
  }
});

loadConfig();
