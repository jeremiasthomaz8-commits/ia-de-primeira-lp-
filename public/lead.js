const interests = new Set(["", "workshop", "raio-x", "ambos"]);
const text = value => typeof value === "string" ? value.trim() : "";
const digits = value => text(value).replace(/\D/g, "");

function nationalNumber(value) {
  const number = digits(value);
  return number.startsWith("55") && (number.length === 12 || number.length === 13)
    ? number.slice(2)
    : number;
}

export function formatWhatsApp(value) {
  const number = nationalNumber(value);
  if (!number) return "";
  if (number.length <= 2) return "(" + number;
  const split = number.length > 10 ? 7 : 6;
  const suffix = number.slice(split);
  return "(" + number.slice(0, 2) + ") " + number.slice(2, split) + (suffix ? "-" + suffix : "");
}

export function validateLead(input) {
  const data = {
    nome: text(input.nome),
    email: text(input.email),
    empresa: text(input.empresa),
    whatsapp: nationalNumber(input.whatsapp),
    interesse: text(input.interesse),
    desafio: text(input.desafio),
    consentimento: input.consentimento === true,
  };
  const errors = {};
  if (data.nome.length < 2 || data.nome.length > 120) errors.nome = "Informe seu nome completo.";
  if (data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = "Informe um e-mail profissional válido.";
  if (!data.empresa || data.empresa.length > 160) errors.empresa = "Informe o nome da empresa.";
  if (!/^\(?[\d\s()+-]+$/.test(text(input.whatsapp)) || !/^[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(data.whatsapp)) errors.whatsapp = "Informe um WhatsApp válido com DDD.";
  if (!interests.has(data.interesse)) errors.interesse = "Selecione uma das opções de interesse.";
  if (data.desafio.length > 1000) errors.desafio = "Use até 1.000 caracteres para descrever o desafio.";
  if (!data.consentimento) errors.consentimento = "Autorize o contato para enviar seu interesse.";
  return { data, errors };
}
