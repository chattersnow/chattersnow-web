"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { labelFor } from "@/lib/inventory";

const CONTACT_EMAIL = "info@chattersnow.org";

const CONTACT_TOPICS = [
  { value: "general", label: "General inquiry" },
  { value: "partnership", label: "Partnerships & sponsorship" },
  { value: "volunteer", label: "Volunteering" },
  { value: "gear", label: "Gear" },
];

export function ContactForm() {
  const searchParams = useSearchParams();
  const requestedTopic = searchParams.get("topic");
  const initialTopic = CONTACT_TOPICS.some((option) => option.value === requestedTopic)
    ? (requestedTopic as string)
    : CONTACT_TOPICS[0].value;

  const [name, setName] = useState("");
  const [topic, setTopic] = useState(initialTopic);
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const topicLabel = labelFor(CONTACT_TOPICS, topic) ?? "General inquiry";
    const subject = `Message from ${name || "the Chatter Snow website"} — ${topicLabel}`;
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
          <FieldLabel htmlFor="contact-topic">Topic</FieldLabel>
          <Select
            value={topic}
            onValueChange={(value) => setTopic(value ?? CONTACT_TOPICS[0].value)}
          >
            <SelectTrigger id="contact-topic">
              <SelectValue placeholder="Topic" />
            </SelectTrigger>
            <SelectContent>
              {CONTACT_TOPICS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
