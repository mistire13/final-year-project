export function contactError(
  name: string,
  phone: string,
  email: string,
  emailRequired = false,
) {
  if (!name.trim()) return "Enter a full name.";
  if (phone.replace(/\D/g, "").length < 9) return "Enter a valid phone number.";
  if (
    (emailRequired || email.trim()) &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  )
    return "Enter a valid email address.";
  return "";
}
