import type { LearnArticle } from "../learn-data";

export const GEAR_AND_SIZING_ARTICLES: LearnArticle[] = [
  {
    id: "gear-101",
    title: "Gear 101: what you actually need for your first day",
    description:
      "A first day on snow involves more gear than it might seem from the outside. Here's the general breakdown of what's typically needed, and what's usually provided if you're taking a lesson or renting.",
    list: [
      {
        label: "Skis or a snowboard, boots, and bindings",
        text: "The core equipment — usually rented as a package for a first day, since it's mounted and sized together at the shop.",
      },
      {
        label: "A helmet",
        text: "Widely rented alongside skis or a board, and increasingly the norm rather than the exception at most resorts.",
      },
      {
        label: "Goggles",
        text: "Protects eyes from wind, sun glare, and snow spray, and matters more than sunglasses once you're moving or it's snowing.",
      },
      {
        label: "Outerwear: a waterproof jacket and pants",
        text: "Everyday winter coats often aren't waterproof enough for sitting in snow or falling. Look for gear specifically described as waterproof, not just water-resistant.",
      },
      {
        label: "Base and mid layers",
        text: "Moisture-wicking base layers plus an insulating mid layer, rather than one heavy layer — it's easier to regulate temperature by adding or removing pieces.",
      },
      {
        label: "Gloves or mittens, and thick socks",
        text: "Waterproof gloves or mittens rated for snow, and a single pair of tall, non-cotton ski socks — extra socks tend to make boots fit worse, not warmer.",
      },
      {
        label: "Sun protection",
        text: "Sunscreen and lip balm — sun exposure is stronger at altitude and reflects off snow, so it adds up faster than it feels like on a cold day.",
      },
    ],
    paragraphs: [
      "Most first-timers rent the big-ticket items — skis or a board, boots, bindings, and often a helmet — rather than buying, since sizing and preferences are still unknown at that point. A resort or shop rental package typically covers all of that in one transaction.",
      "What people usually already own or borrow is the layering system: base layers, a mid layer, waterproof outerwear, gloves, and a warm hat for the lodge. If you don't have waterproof outerwear yet, some shops rent jackets and pants too.",
      "If you're booking a lesson, check what's included — many first-timer lesson packages bundle rental gear and a lift ticket with instruction, which can be simpler than sourcing everything separately.",
    ],
    links: [
      {
        label: "Buying vs. renting: how to decide",
        href: "#buying-vs-renting",
        internal: true,
      },
      {
        label: "Chatter gear library",
        href: "/gears/library",
        internal: true,
      },
    ],
    disclaimer:
      "Take this as a starting checklist, not a personalized packing list — your rental shop or the resort's own first-timer guidance will know exactly what's included and what's on you to bring.",
  },
  {
    id: "buying-vs-renting",
    title: "Buying vs. renting: how to decide",
    description:
      "Whether to rent or buy usually comes down to how often you expect to ride and how settled your preferences are, more than a fixed rule.",
    list: [
      {
        label: "Renting suits occasional riders",
        text: "If you're not sure yet how often you'll get out, renting avoids storage, maintenance, and the cost of gear you might outgrow in ability or preference.",
      },
      {
        label: "Renting suits still-developing preferences",
        text: "Ski and board feel, length, and flex are personal — renting a few times lets you try different setups before committing to a purchase.",
      },
      {
        label: "Buying suits frequent riders",
        text: "Once you're out often enough, rental costs across a season can add up to more than owning, and having your own gear means it's already sized and broken in.",
      },
      {
        label: "Boots are the exception",
        text: "Even people who rent everything else often buy boots first, since a well-fitted boot takes time to find and rental boots are rarely as dialed in as an owned pair.",
      },
      {
        label: "Season and multi-day rentals exist",
        text: "Many shops offer season-long or multi-day rental rates that land between a single-day rental and buying outright, worth asking about if you expect to ride more than a handful of days.",
      },
    ],
    paragraphs: [
      "There's no single day count or budget where renting stops making sense and buying starts — it depends on how much storage and maintenance you're willing to take on, and how confident you are in your gear preferences so far.",
      "Buying used or through a gear library is a common middle path: lower upfront cost than new gear, with less long-term commitment than a full retail purchase. See the used and secondhand gear article below for what to check.",
      "If cost is the main thing keeping you off the mountain, Chatter's gear library and similar community programs exist specifically to lower that barrier — it's worth checking what's available before assuming a purchase is required.",
    ],
    links: [
      {
        label: "Used & secondhand gear: what to check for",
        href: "#used-and-secondhand-gear",
        internal: true,
      },
      {
        label: "Chatter gear library",
        href: "/gears/library",
        internal: true,
      },
    ],
    disclaimer:
      "These are the general tradeoffs, not a verdict for your specific situation — a rental shop can also give you real local pricing to weigh against buying.",
  },
  {
    id: "skis-vs-snowboard",
    title: "Skis vs. snowboard: choosing your sport",
    description:
      "Neither sport is objectively easier — they just have different learning curves and feel. This is a general comparison, not a push toward either one.",
    list: [
      {
        label: "Skiing: feet move independently",
        text: "Each foot has its own ski, which often means a shorter path to basic mobility — turning, stopping, and getting on and off lifts tend to click sooner for many beginners.",
      },
      {
        label: "Skiing: linking turns takes longer to refine",
        text: "Comfortable, controlled skiing on varied terrain often takes longer to build than the initial basics, even though those basics come quickly.",
      },
      {
        label: "Snowboarding: both feet are fixed to one board",
        text: "This usually means more falling in the first day or two while your body learns to balance sideways, since there's no independent-leg recovery the way there is on skis.",
      },
      {
        label: "Snowboarding: often clicks faster once balance is there",
        text: "Many riders find that once the initial balance and falling phase passes, linking turns and general control comes together relatively quickly.",
      },
      {
        label: "Both involve a real first-day learning curve",
        text: "Neither sport is picked up in a single session for most people — a lesson helps with either one, and expecting some falling and frustration on day one is normal for both.",
      },
    ],
    paragraphs: [
      "People sometimes choose based on what feels more natural in related activities — skateboarding, surfing, or wakeboarding backgrounds sometimes translate toward snowboarding, while general athletic coordination doesn't strongly predict either way.",
      "Physical factors like knee or ankle sensitivity can also factor in, since the two sports load joints differently, but that's worth a conversation with a doctor or physical therapist if it's a real concern, not something to self-diagnose from an article.",
      "Trying both — through a lesson or a friend's gear — before committing to buying is a reasonable way to decide, since personal feel matters more here than any general comparison.",
    ],
    links: [
      {
        label: "Chatter programs — mentorship & beginner sessions",
        href: "/programs",
        internal: true,
      },
    ],
    disclaimer:
      "This is a general comparison, not a personal verdict — how each sport actually feels varies wildly person to person, and a lesson is the fastest way to find out for yourself.",
  },
  {
    id: "binding-din-settings",
    title: "Understanding binding DIN settings",
    description:
      "DIN (release setting) is how much force it takes for your binding to pop off in a fall. It comes from several factors together, never just one — so leave the actual number to a certified binding tech, not a chart.",
    list: [
      {
        label: "What DIN measures",
        text: "A numeric release-force setting on alpine ski bindings, balancing retention (staying locked in while skiing) against release (coming free in a fall to help prevent injury).",
      },
      {
        label: "What it depends on",
        text: "Skier weight, height, age, boot sole length, and skier type (how cautiously or aggressively you ski) — a technician weighs all of these together, not weight alone.",
      },
      {
        label: "Skier type categories",
        text: "Bindings are typically set relative to a Type I (cautious), Type II (average), or Type III (aggressive) profile, which reflects riding style and risk tolerance as much as ability.",
      },
      {
        label: "Snowboard bindings are different",
        text: "Snowboard bindings don't use a DIN release system the same way alpine ski bindings do — this concept is specific to skiing.",
      },
    ],
    paragraphs: [
      "DIN charts exist and are sometimes visible in shops or online, but they're a starting reference for a technician's judgment, not a lookup table for skiers to set their own bindings from. A shop visit for binding setup is standard, not optional, when you get new or different gear.",
      "Boot sole compatibility matters alongside the DIN number: GripWalk (rockered) soles need GripWalk-compatible or MNC bindings, while flat ISO 5355 soles need standard alpine bindings. A technician checks this fit as part of setting the binding, not as a separate step you need to figure out yourself.",
      "If a binding releases unexpectedly, feels loose, or doesn't release when it should, that's a shop visit, not a DIY adjustment — release settings drift and should be re-tested periodically, especially after a hard impact.",
    ],
    links: [
      {
        label: "Ski sizing & binding DIN reference",
        href: "/gears/sizing",
        internal: true,
      },
    ],
    disclaimer:
      "None of this is a setting recommendation — it's just what DIN is and what feeds into it. The actual number always comes from a certified binding tech working with your specific gear, not a chart and not this page.",
  },
  {
    id: "helmets-and-protective-gear",
    title: "Helmets & protective gear basics",
    description:
      "An overview of the protective gear people commonly wear on snow and roughly what each piece helps with — not medical guidance, and not a stand-in for a proper fitting.",
    list: [
      {
        label: "Helmets",
        text: "Widely worn at this point and required by many resorts in lessons, rental packages, and terrain parks. A helmet should fit snugly without pressure points and sit level, covering the forehead without tilting back.",
      },
      {
        label: "Goggles or eye protection",
        text: "Protects against wind, glare, and flying snow — most helmets are designed to pair with goggles rather than sunglasses for a secure, gap-free fit.",
      },
      {
        label: "Wrist guards",
        text: "Common for snowboarders, especially beginners, since wrists are one of the more frequently injured areas when learning to fall on a board.",
      },
      {
        label: "Impact shorts and padding",
        text: "Padded shorts, knee pads, or a back protector are worth considering for beginners and park riders, where falls tend to be more frequent or less predictable.",
      },
      {
        label: "Neck gaiters and face protection",
        text: "Helps with wind and cold on exposed lifts and colder days, more a comfort item than a safety one.",
      },
    ],
    paragraphs: [
      "Helmet fit matters as much as wearing one at all — an oversized or loosely strapped helmet doesn't protect the way a properly fitted one does. A shop can help fit a helmet the same way they'd fit boots.",
      "Helmets are generally treated as single-impact items: after a significant crash, the protective foam may be compromised even without visible damage, and manufacturers publish recommended replacement intervals regardless of impacts. See the gear care article on knowing when gear needs replacing for more.",
      "We're just covering what's out there, not giving medical advice — got a specific condition or injury history? Loop in a doctor. Someone actually hurt? Get them to ski patrol or a medical pro, not this page.",
    ],
    links: [
      {
        label: "Knowing when gear needs replacing",
        href: "/learn/gear-care",
        internal: true,
      },
    ],
    disclaimer:
      "Nothing here is medical or safety-certification guidance — for fit and what's actually right for you, ask a shop, and for any real injury, that's ski patrol or a medical professional, full stop.",
  },
  {
    id: "used-and-secondhand-gear",
    title: "Used & secondhand gear: what to check for",
    description:
      "Buying used is a common way to get on snow for less, but a few things are worth checking before handing over money — especially anything safety-related.",
    list: [
      {
        label: "Boots: check the liners and shell",
        text: "Packed-out liners (compressed and no longer supportive) are hard to spot without trying them on. Look for cracks in the plastic shell and check that buckles still hold tension.",
      },
      {
        label: "Skis and boards: check the base and edges",
        text: "Look for deep gouges (down to the core material, not just surface scratches), delamination (separating layers, often visible as bubbling or a soft spot), and heavily rusted or nicked edges.",
      },
      {
        label: "Bindings: check they're on an indemnified list",
        text: "Shops maintain lists of bindings they'll still test and service. If a shop won't work on a binding, it's effectively at the end of its usable life regardless of how it looks — worth asking a shop before buying gear with existing bindings.",
      },
      {
        label: "Helmets: generally avoid buying used",
        text: "Impact history usually isn't visible or known for a used helmet, and helmets are typically treated as single-impact items — this is one category where new is the safer default.",
      },
      {
        label: "Outerwear: check zippers, seams, and water repellency",
        text: "Worn-through fabric, failed taped seams, and broken zippers are harder to fix than a worn-off water-repellent finish, which can often be renewed.",
      },
    ],
    paragraphs: [
      "For skis, boards, and boots, a quick look-over by a shop before you buy — or shortly after — can catch issues that aren't obvious to a non-expert, especially delamination and binding compatibility.",
      "Gear swaps, community sales, and gear libraries are common sources for used equipment. Chatter's gear library is one option if you'd rather borrow than buy at all.",
      "Fit still matters as much on used gear as new — a good deal on boots or a helmet that doesn't actually fit isn't a good deal. Try things on rather than buying by size number alone where possible.",
    ],
    links: [
      {
        label: "Buying vs. renting: how to decide",
        href: "#buying-vs-renting",
        internal: true,
      },
      {
        label: "Chatter gear library",
        href: "/gears/library",
        internal: true,
      },
    ],
    disclaimer:
      "These are things worth checking, not a guarantee of any item's condition or safety — for bindings and anything safety-relevant, a shop tech's actual assessment beats an eyeball check every time.",
  },
];
