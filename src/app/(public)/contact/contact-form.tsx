"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CONTACT_EMAIL = "info@chattersnow.org";

export function ContactForm() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const subject = `Message from ${name || "the Chatter Snow website"}`;
    const body = `${message}\n\n— ${name}`;
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = mailto;
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="contact-name">Name</FieldLabel>
          <Input
            id="contact-name"
            required
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="contact-message">Message</FieldLabel>
          <Textarea
            id="contact-message"
            required
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </Field>

        <Button type="submit" className="w-full sm:w-fit">
          Send message
        </Button>
      </FieldGroup>
    </form>
  );
}
