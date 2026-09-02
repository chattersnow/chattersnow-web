import type { ParseResult } from "@/lib/forms";

export type ContactFormData = {
  name: string;
  email: string;
  topic: string;
  message: string;
};

export function parseContactForm(
  formData: FormData,
): ParseResult<ContactFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!email || !email.includes("@"))
    return { error: "A valid email is required." };
  if (!message) return { error: "Message is required." };
  if (name.length > 200) return { error: "Name is too long." };
  if (message.length > 5000) return { error: "Message is too long." };

  return {
    data: { name, email, topic: topic || "general", message },
  };
}
