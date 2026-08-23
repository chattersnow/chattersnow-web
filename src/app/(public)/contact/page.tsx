import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact Us | Chatter Snow",
};

export default function ContactPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="space-y-12">
          <section>
            <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Get in touch
            </h1>
            <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
              Questions, ideas, or want to get involved? Send us a message and
              we&apos;ll get back to you.
            </p>
          </section>

          <section className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Card>
              <CardContent>
                <Suspense fallback={null}>
                  <ContactForm />
                </Suspense>
              </CardContent>
            </Card>

            <div className="space-y-8">
              <div>
                <span className="app-eyebrow">Email us</span>
                <div className="app-muted mt-3 space-y-1 text-sm leading-relaxed sm:text-base">
                  <p>
                    <a
                      href="mailto:chattersnow@gmail.com"
                      className="hover:text-foreground underline underline-offset-4"
                    >
                      chattersnow@gmail.com
                    </a>
                  </p>
                  <p>
                    <a
                      href="mailto:info@chattersnow.org"
                      className="hover:text-foreground underline underline-offset-4"
                    >
                      info@chattersnow.org
                    </a>
                  </p>
                </div>
              </div>

              <div>
                <span className="app-eyebrow">Follow us</span>
                <div className="app-muted mt-3 text-sm leading-relaxed sm:text-base">
                  <p>
                    Instagram{" "}
                    <a
                      href="https://www.instagram.com/chattersnow"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground underline underline-offset-4"
                    >
                      @chattersnow
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
