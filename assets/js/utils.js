// Shared helpers reused across page-specific scripts.

function waLink(whatsappNumber) {
  return `https://wa.me/${whatsappNumber.replace(/\D/g, "")}`;
}
