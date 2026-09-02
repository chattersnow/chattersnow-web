import type { LearnArticle } from "../learn-data";

export const GEAR_CARE_ARTICLES: LearnArticle[] = [
  {
    id: "between-trips",
    title: "Gear care 101: between-trip basics",
    description:
      "Most of what keeps snow gear working is unglamorous — drying things out and putting them away properly. Here's the general shape of what people do between trips, and why each piece of it matters.",
    list: [
      {
        label: "Dry everything",
        text: "Boot liners, gloves, and base layers hold a surprising amount of moisture after a day out. Air-drying them at room temperature is the usual approach; direct heat from a radiator, wood stove, or car heater can warp or crack liners and shell plastics over time.",
      },
      {
        label: "Wipe down edges",
        text: "Skis and boards come off the mountain wet, and steel edges rust. Drying the bases and edges with a towel before the gear goes in a bag is the common habit that heads that off.",
      },
      {
        label: "Loosen buckles and straps",
        text: "Boots are typically stored buckled loosely rather than cranked down or fully open, so the shell keeps its shape without being held under tension.",
      },
      {
        label: "Don't leave gear in the car",
        text: "A cold trunk is a wet, temperature-swinging place to store equipment, and gear left there tends to stay damp between trips rather than drying out.",
      },
      {
        label: "Look things over",
        text: "A quick check for loose screws, cracked buckles, delaminating base material, or a torn jacket seam is easier to act on now than the morning of the next trip.",
      },
    ],
    paragraphs: [
      "The short version of between-trip care is: get it dry, get the water off the metal, and store it somewhere stable. Almost everything else is refinement on top of those three things.",
      "Outerwear generally benefits from being washed less often than everyday clothes but not never — most technical fabrics have manufacturer care instructions on the tag, and following the instructions for the specific garment is more reliable than any general rule an article can offer.",
      "If something looks structurally wrong — a binding that shifts under hand pressure, a boot shell with a crack in it, a base gouge deep enough to show the core — that's shop territory rather than a between-trip fix. A shop tech can tell you whether it's cosmetic or worth repairing.",
    ],
    links: [
      {
        label: "Chatter gear library",
        href: "/gears/library",
        internal: true,
      },
    ],
    disclaimer:
      "These are general habits, not manufacturer instructions — care requirements vary by product, so whatever's on the care tag or manual for your specific gear wins over anything written here.",
  },
  {
    id: "waxing",
    title: "Waxing & base care explained",
    description:
      "Wax is a consumable: it wears off as you ride and gets reapplied. This explains what waxing does and the general options for getting it done, rather than walking through a tuning-bench procedure.",
    list: [
      {
        label: "What wax does",
        text: "The base of a ski or board is a porous plastic that absorbs wax. Wax reduces friction against the snow and helps keep the base from drying out, which is why an unwaxed base can feel slow and look chalky or white-ish, especially along the edges.",
      },
      {
        label: "Hot wax",
        text: "Wax melted onto the base with an iron, allowed to cool, then scraped and brushed off. It's the standard shop approach and generally lasts longer than the alternatives.",
      },
      {
        label: "Rub-on and paste wax",
        text: "Applied cold without an iron. Quicker and less involved, but typically wears off faster — often thought of as a top-up between real waxes rather than a replacement.",
      },
      {
        label: "Temperature-specific wax",
        text: "Waxes are commonly sold graded by snow temperature range, plus all-temperature blends. The graded ones matter most to racers; recreational riders often just use an all-temp wax.",
      },
      {
        label: "Frequency",
        text: "How often gear needs wax depends on how much you ride, the snow conditions, and how picky you are. Some people wax every handful of days out; others go a season. There's no single correct interval.",
      },
    ],
    paragraphs: [
      "Shops sell waxing as part of a tune, usually bundled with a base grind or edge work. As a rough sense of scale, a basic wax is typically among the cheaper shop services and a full tune costs more; actual prices vary a lot by region and shop, so treat any number you see online as an estimate and ask locally for a real one.",
      "Home waxing is common enough that irons, scrapers, and brushes are widely sold, but it involves a hot iron, a solid work surface, and some practice to avoid overheating the base. If you want to learn it, having someone show you in person — a shop tech, a tuning clinic, or an experienced friend — is the usual way people pick it up.",
      "Some bases and some gear aren't good candidates for a home iron at all, including rental equipment you don't own and boards with graphics or sintered bases you'd rather not risk. When in doubt, a shop is the low-risk option.",
    ],
    links: [
      {
        label: "Chatter gear library",
        href: "/gears/library",
        internal: true,
      },
    ],
    disclaimer:
      "This explains what waxing is, not how to do it — hot waxing involves heat and equipment that can damage a base, so a shop tech or someone showing you in person is the right place to actually start.",
  },
  {
    id: "edge-tuning",
    title: "Edge tuning: what it is and when to see a shop",
    description:
      "Edge tuning is shaping and sharpening the steel edges of a ski or board. It affects how the gear grips and releases, and it's a job most people hand to a shop — this covers what the terms mean so the conversation at the counter makes sense.",
    list: [
      {
        label: "Base edge and side edge",
        text: "Edges are filed on two faces — the one along the base and the one along the sidewall — each set to a small angle. Those angles are what a tune actually adjusts.",
      },
      {
        label: "Bevel",
        text: "The angle each edge face is filed to, measured in degrees. Different combinations trade off grip on hard snow against how forgiving the gear feels, and manufacturers publish a factory spec for their own equipment.",
      },
      {
        label: "Detuning",
        text: "Deliberately dulling short stretches of edge, often near the tip and tail or along a board's contact points, so the edge is less likely to catch. Common for park riding and for beginners.",
      },
      {
        label: "Burrs",
        text: "Small rough spots raised in the steel by rocks or rails. They're what makes an edge feel grabby or snag, and removing them is a routine part of a tune.",
      },
      {
        label: "Base grind",
        text: "Machine-resurfacing the base to make it flat again and cut a texture into it. It's a bigger service than a wax or an edge tune and is done on shop machinery.",
      },
    ],
    paragraphs: [
      "Edge angles are specific to the equipment and to the rider — the right setup depends on the gear's design spec, the conditions you ride, your ability, and your discipline. That combination is a judgment call for a shop technician who can look at your actual gear, not something to pick from a chart or an article. This is the same reasoning behind leaving binding release (DIN) settings to a certified binding technician.",
      "Signs that commonly send people to the shop include an edge that catches or feels grabby, visible nicks or rust along the steel, a base gouge, or gear that slips on firm snow when it used to hold. A shop can tell you whether it needs a tune, a repair, or nothing at all.",
      "Getting a tune before the season starts and after any hard rock hit is a common rhythm. Shops are typically busiest right at the start of the season and around holidays, so turnaround times tend to be longer then.",
    ],
    links: [
      {
        label: "Ski sizing & binding DIN reference",
        href: "/gears/sizing",
        internal: true,
      },
    ],
    disclaimer:
      "This is here so the terminology makes sense at the counter, not a how-to for tuning your own edges — and it's not a recommendation on any particular bevel. Edge angles and binding settings are a qualified shop tech's call, working with your actual gear.",
  },
  {
    id: "off-season-storage",
    title: "Off-season storage basics",
    description:
      "Gear spends more of the year in storage than on snow, and how it's stored is a common reason equipment comes out of the closet in worse shape than it went in.",
    list: [
      {
        label: "Store it dry",
        text: "Everything goes away fully dry — boots, liners, gloves, outerwear, and bases. Damp gear in a sealed bag is how mildew and rusted edges happen over a summer.",
      },
      {
        label: "Somewhere stable",
        text: "A cool, dry, temperature-stable indoor space is the usual recommendation. Unconditioned attics, garages, and sheds swing hard between hot and cold, and sustained heat is hard on plastics, glues, and base material.",
      },
      {
        label: "Storage wax",
        text: "A thick coat of wax left unscraped over the base and edges is the common way people protect gear over the summer. It's scraped off before the first day back on snow.",
      },
      {
        label: "Release binding tension",
        text: "Backing off ski binding spring tension for the off-season is a frequently suggested practice. Because it changes the release setting, it's worth having the shop do it — and having them reset and test it before you ride again.",
      },
      {
        label: "Out of direct sun",
        text: "UV is hard on topsheets, straps, and outerwear fabric. Storing gear out of sunlight is a small thing that adds up over years.",
      },
      {
        label: "Boots keep their shape",
        text: "Boots are typically stored buckled loosely with the liners in and dry, rather than crushed under other gear or left unbuckled to splay open.",
      },
    ],
    paragraphs: [
      "The end of the season is also a natural time to deal with anything you noticed but rode through — a torn seam, a stripped screw, a base gouge. Shops are usually quieter in spring and summer than in the fall rush.",
      "Batteries are worth pulling out of anything that has them — heated gloves, avalanche transceivers, boot heaters — since batteries left in storage can leak and corrode contacts.",
      "If you're storing borrowed or program gear rather than your own, follow whatever the lending program asks for; those requirements exist so the next person gets equipment in usable shape.",
    ],
    links: [
      {
        label: "Chatter gear library",
        href: "/gears/library",
        internal: true,
      },
    ],
    disclaimer:
      "These are general storage habits, nothing more. Binding tension or release settings are a certified binding technician's job to handle and re-test, and your gear's own manufacturer storage instructions beat anything written here.",
  },
  {
    id: "when-to-replace",
    title: "Knowing when gear needs replacing",
    description:
      "Snow gear doesn't all wear out on the same schedule, and some of it fails in ways you can't see. This is a general sense of what to watch for and who to ask — not a verdict on any particular piece of your equipment.",
    list: [
      {
        label: "Helmets",
        text: "Helmets are generally treated as single-impact items: after a significant crash, the protective foam may be compromised even with no visible damage. Manufacturers also publish a recommended replacement interval regardless of impacts, commonly measured in a handful of years.",
      },
      {
        label: "Bindings",
        text: "Manufacturers and shops maintain indemnified lists of bindings they'll still test and service. Once a binding drops off that list, shops typically won't work on it, which in practice is the end of its usable life.",
      },
      {
        label: "Boots",
        text: "Boots wear out from the inside — liners pack out and lose volume, and shells eventually lose stiffness. Cracked shells and worn-through sole blocks are the visible versions; a boot fitter can tell you whether a boot has more life in it or needs replacing.",
      },
      {
        label: "Skis and boards",
        text: "Bases can only be ground so many times before there isn't enough material left, edges can only be filed so far, and delamination or a soft, dead feel underfoot are signs the construction is going. None of these have a fixed mileage.",
      },
      {
        label: "Outerwear",
        text: "Jackets and pants usually fail gradually — the water-repellent finish wears off first and can often be renewed, while worn-through fabric, failed taped seams, and broken zippers are the point where repair or replacement is the question.",
      },
      {
        label: "Avalanche safety equipment",
        text: "Transceivers, airbags, and similar equipment have their own manufacturer service life, firmware, and inspection requirements. Follow the manufacturer's guidance for the specific device rather than any general rule.",
      },
    ],
    paragraphs: [
      "For anything protective — helmets and avalanche gear especially — the manufacturer's own guidance for that specific model is the authority, and a shop can help you find it. Erring toward replacement is the common posture with safety equipment precisely because the failure mode isn't visible.",
      "Age alone isn't automatically disqualifying for skis, boards, and outerwear; condition and how it's been stored matter more. A shop tech looking at the actual gear can tell you far more than a rule of thumb can.",
      "If cost is what's standing between you and replacing something that's genuinely worn out, gear libraries, swaps, and community programs exist for that. Chatter's gear library is one option, and many local shops and clubs run season-opening swaps.",
    ],
    links: [
      {
        label: "Chatter gear library",
        href: "/gears/library",
        internal: true,
      },
    ],
    disclaimer:
      "This is general awareness, not an assessment of your actual equipment — whether a specific helmet, binding, or piece of avalanche gear is still safe to use is a question for the manufacturer's guidance and a qualified shop technician, not this page.",
  },
];
