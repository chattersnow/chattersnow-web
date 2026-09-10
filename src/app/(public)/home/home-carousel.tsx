"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Autoplay from "embla-carousel-autoplay";
import { PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { SiteImage } from "@/components/site-image";

/**
 * How long each slide holds. Long enough to read the image rather than to
 * notice the movement, and well past the 5 seconds after which WCAG 2.2.2
 * requires a way to stop it -- which is what the button below is.
 */
const AUTOPLAY_DELAY_MS = 6000;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export type HomeCarouselSlide = { key: string; url: string | null };

/**
 * The home page's hero carousel, advancing on its own.
 *
 * A client component rather than an option on the server-rendered `Carousel`,
 * because a plugin is a live object with functions on it: constructing it in
 * `page.tsx` and passing it across the server/client boundary is the violation
 * that only shows up in a browser. The slides cross that boundary as what they
 * are -- strings.
 *
 * Three ways it stops, and one rule holding them together
 * -------------------------------------------------------
 * The plugin handles the transient ones itself: it pauses while the pointer is
 * over the carousel, while focus is inside it, and while the tab is hidden,
 * and resumes when that ends (`stopOnInteraction: false` is what makes those
 * resume rather than kill it for good).
 *
 * The other two are settled here and are *sticky*: `prefers-reduced-motion`,
 * and the button. Those cannot be left to the plugin, because its own
 * `mouseleave` and `focusout` handlers call `startAutoplay()` directly -- so a
 * reader who pressed Pause while hovering would have it start again the moment
 * they moved the mouse away. `wantsPlay` is the intent, and the
 * `autoplay:play` listener enforces it against anything that starts the timer
 * behind our back.
 *
 * The button's label follows that intent, not the timer: it would be a strange
 * control that flipped to "Play" every time the pointer crossed the image.
 */
export function HomeCarousel({
  slides,
  alt,
}: {
  slides: readonly HomeCarouselSlide[];
  alt: string;
}) {
  // `playOnInit: false` so a reduced-motion reader never gets even the first
  // scheduled move: the effect below decides, once, whether the timer starts
  // at all.
  const [autoplay] = useState(() =>
    Autoplay({
      delay: AUTOPLAY_DELAY_MS,
      playOnInit: false,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
      stopOnFocusIn: true,
    }),
  );
  const [api, setApi] = useState<CarouselApi>();
  const [playing, setPlaying] = useState(true);
  const wantsPlay = useRef(true);
  /** Whether the reader has used the button. Their choice outranks the media query. */
  const chosen = useRef(false);

  useEffect(() => {
    if (!api) return;
    const media = window.matchMedia(REDUCED_MOTION);
    const apply = () => {
      if (chosen.current) return;
      wantsPlay.current = !media.matches;
      setPlaying(wantsPlay.current);
      if (wantsPlay.current) autoplay.play();
      else autoplay.stop();
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [api, autoplay]);

  useEffect(() => {
    if (!api) return;
    const enforce = () => {
      if (!wantsPlay.current) autoplay.stop();
    };
    api.on("autoplay:play", enforce);
    return () => {
      api.off("autoplay:play", enforce);
    };
  }, [api, autoplay]);

  const toggle = useCallback(() => {
    chosen.current = true;
    const next = !wantsPlay.current;
    wantsPlay.current = next;
    setPlaying(next);
    if (next) autoplay.play();
    else autoplay.stop();
  }, [autoplay]);

  return (
    <Carousel
      className="w-full max-w-5xl"
      opts={{ loop: true }}
      plugins={[autoplay]}
      setApi={setApi}
    >
      <CarouselContent>
        {slides.map((slide, index) => (
          <CarouselItem key={slide.key}>
            <SiteImage
              url={slide.url}
              alt={alt}
              className="aspect-[21/9] rounded-2xl"
              sizes="(min-width: 1024px) 1024px, 100vw"
              priority={index === 0}
              // The slide that is shown first gets `priority`; the ones behind
              // it are eager but ordinary. Left to default they are lazy, and
              // a lazy slide inside an `overflow-hidden` track is not fetched
              // until it intersects -- which, for a carousel that advances on
              // its own rather than on a scroll, is the moment it is already
              // being shown. The first rotation would arrive blank.
              loading={index === 0 ? undefined : "eager"}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="hidden sm:flex" />
      <CarouselNext className="hidden sm:flex" />
      {/* Inside the carousel's own region, and visible at every width -- the
          arrows are hidden below sm, and this is the one control that has to
          be there whether or not they are. */}
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={toggle}
        className="absolute right-2 bottom-2 touch-manipulation rounded-full"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
        <span className="sr-only">
          {playing ? "Pause the slideshow" : "Play the slideshow"}
        </span>
      </Button>
    </Carousel>
  );
}
