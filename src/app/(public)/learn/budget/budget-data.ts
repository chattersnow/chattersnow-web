import type { LearnArticle } from "../learn-data";

export const BUDGET_ARTICLES: LearnArticle[] = [
  {
    id: "what-it-costs",
    title: "What skiing and snowboarding actually cost",
    description:
      "Snow sports have a reputation for being expensive, and the sticker prices are a big part of why. Here's a plain breakdown of where the money actually goes on a typical day out. Every figure below is a rough estimate as of the 2025–26 seasons in North America — prices vary enormously by region, resort, and how far ahead you buy, so treat these as orders of magnitude rather than quotes.",
    list: [
      {
        label: "Lift ticket",
        text: "Usually the single biggest line item. Walk-up window prices at large destination resorts have typically run somewhere in the $100–$250 range per day, while smaller local hills are often a fraction of that — commonly under $75, and sometimes well under. Buying online in advance is generally cheaper than at the window.",
      },
      {
        label: "Rentals",
        text: "A full ski or snowboard package — boards or skis, boots, and poles where applicable — typically runs somewhere around $40–$70 a day at a resort shop, and often less at an off-mountain shop in the nearest town.",
      },
      {
        label: "Lessons",
        text: "Group lessons are usually bundled with a beginner ticket-and-rental package; standalone group lessons typically fall in the $75–$200 range, and private instruction is generally several times that.",
      },
      {
        label: "Clothing",
        text: "Not a per-day cost, but a real one the first season. A jacket, snow pants, gloves, goggles, and base layers bought new typically add up to a few hundred dollars, though this is one of the easiest categories to cover secondhand or by borrowing.",
      },
      {
        label: "Getting there and being there",
        text: "Fuel or transit, parking (some resorts now charge for it or require a reservation), food, and lodging if it's not a day trip. These are easy to underestimate and can rival the lift ticket on a destination trip.",
      },
    ],
    paragraphs: [
      "Added up at full price, a first day at a large resort with rentals and a lesson can land in the several-hundred-dollar range per person. That number is real, but it's also close to the worst case — nearly every line item above has a cheaper version, and the articles in this category walk through them.",
      "The rough shape of it: a day at a small local hill with off-mountain rentals and borrowed clothing can come in at a small fraction of a full-price destination day. Same sport, very different bill.",
      "Costs also change with how much you go. Day tickets are the most expensive way to ski per day, rentals stop making sense at some point if you're out often, and season passes only pay off past a certain number of days — which is why it's worth having a rough sense of how many days you actually expect to ride before committing to anything.",
      "Chatter Snow's programs and gear library exist partly to take some of these numbers off the table for people they'd otherwise price out. If cost is the thing standing between you and a first day, that's worth a look.",
    ],
    links: [
      {
        label: "Chatter programs",
        href: "/programs",
        internal: true,
      },
      {
        label: "Chatter gear library",
        href: "/gears/library",
        internal: true,
      },
    ],
    disclaimer:
      "All figures here are rough estimates for general orientation, not quotes, and they change season to season and vary widely by region and resort. Check current prices directly with the resort or shop before planning around any number in this article.",
  },
  {
    id: "getting-on-the-mountain-for-less",
    title: "Budget guide: getting on the mountain for less",
    description:
      "Most of the ways people cut the cost of a ski day fall into a handful of categories. None of them require giving up much beyond flexibility — which day you go, which hill you go to, and how far ahead you decide.",
    list: [
      {
        label: "Ride smaller hills",
        text: "Local and community-owned areas typically charge a fraction of what destination resorts do, and for learning, less terrain is rarely the limiting factor. Many people spend their first several days somewhere small for this reason.",
      },
      {
        label: "Buy tickets ahead of time",
        text: "Most resorts price online tickets below the walk-up window, often significantly, and the discount usually gets steeper the earlier you commit. The trade-off is that advance tickets are frequently date-locked and non-refundable.",
      },
      {
        label: "Go midweek or off-peak",
        text: "Non-holiday weekdays are typically the cheapest days on the calendar, and often the least crowded. Some areas also sell discounted half-day, twilight, or night sessions.",
      },
      {
        label: "Look for beginner packages",
        text: "Learn-to-ski and learn-to-ride packages bundle a limited ticket, rentals, and a group lesson, and are commonly priced below what those three cost separately. They're usually limited to beginner terrain.",
      },
      {
        label: "Rent off-mountain",
        text: "Shops in the nearest town generally price below the resort's own rental counter, and multi-day rentals typically cost less per day than a series of single days.",
      },
      {
        label: "Bring your own food",
        text: "On-mountain food is priced like an airport. Packing lunch is an unremarkable and very common way to save $20–$40 a day per person.",
      },
      {
        label: "Split the drive",
        text: "Carpooling spreads fuel and parking costs, and some resorts reserve their cheapest or most convenient parking for cars arriving with several people in them.",
      },
    ],
    paragraphs: [
      "The single biggest lever for most people isn't a discount code — it's which mountain and which day. A midweek day at a small local hill and a Saturday at a destination resort can differ by several times over on the ticket alone, before rentals or food enter into it.",
      "Second biggest is planning distance. Nearly every discount structure in the sport rewards deciding early: advance tickets, season passes, multi-day rental rates, and lodging all get more expensive the closer you get to the day.",
      "It's also worth checking whether you already have access to something. Students, military members, seniors, kids under a certain age, and employees of some large organizations frequently qualify for discounted tickets, and some public libraries and community programs hand out free or reduced passes to local areas.",
      "Chatter Snow runs programs and a gear library aimed squarely at this problem — for some participants they cover the pieces that a discount code can't.",
    ],
    links: [
      {
        label: "Chatter programs",
        href: "/programs",
        internal: true,
      },
      {
        label: "Chatter gear library",
        href: "/gears/library",
        internal: true,
      },
      {
        label: "Learn — Getting Started",
        href: "/learn/getting-started",
        internal: true,
      },
    ],
    disclaimer:
      "Pricing structures, discount programs, and eligibility rules differ by resort and change every season, and any savings described here are general patterns rather than guarantees. Confirm current terms with the resort, shop, or program directly before counting on them.",
  },
  {
    id: "passes-and-deals",
    title: "Discount passes, deals & off-peak timing",
    description:
      "Beyond the day ticket, there's a whole layer of passes and promotions with different break-even points. Knowing roughly how many days you'll ride is what makes these comparable — the same pass can be an obvious saving or an expensive mistake depending on that number.",
    list: [
      {
        label: "Season passes",
        text: "Unlimited or near-unlimited access to one area for a season. Typically cheapest when bought in spring or early fall for the following winter, and the price generally climbs as the season approaches. The break-even against day tickets is often somewhere in the range of five to fifteen days, depending on the area.",
      },
      {
        label: "Multi-resort passes",
        text: "Products that bundle access to a network of resorts, usually with a set number of days at each or unlimited access at some. Priced for people who travel or ride a lot; rarely the cheapest option for someone riding a handful of local days.",
      },
      {
        label: "Multi-day and punch cards",
        text: "A block of days bought upfront, typically at a lower per-day rate than singles, often without the commitment of a full season pass. Common at smaller areas.",
      },
      {
        label: "Age-based and status discounts",
        text: "Many areas price differently for young children, teens, college students, seniors, military members, and ski patrol or industry workers. These are usually the largest single discounts available and often go unclaimed simply because people don't ask.",
      },
      {
        label: "Off-peak windows",
        text: "Non-holiday weekdays, early season, and late season are typically the cheapest times to ride. Early and late season come with a real trade-off in conditions and open terrain.",
      },
      {
        label: "Promotions and partner deals",
        text: "Resorts and their partners run seasonal promotions — retailer bundles, credit card or membership offers, local business tie-ins, opening-weekend rates. These come and go, and are worth a search before buying a ticket at full price.",
      },
    ],
    paragraphs: [
      "The useful mental exercise before buying any pass is a rough honest estimate of days: how many did you actually get out last season, and what's realistically changing this one? Passes are generally sold on optimism, and the break-even math only works if the days materialize.",
      "Watch the fine print as much as the price. Blackout dates around holidays, parking reservations, restrictions to particular terrain, whether a pass covers the whole family or just one person, and whether anything is refundable if the season goes sideways all change what a number is actually worth.",
      "Some passes bundle in extras that shift the comparison — buddy tickets, discounted lodging or rentals, or reciprocal days at other areas. Those can be worth real money, but only if you'd have spent it anyway.",
      "Prices, break-even points, and pass structures shift every season, so the specific comparison is always worth redoing rather than carrying forward from last year.",
    ],
    links: [
      {
        label: "Chatter programs",
        href: "/programs",
        internal: true,
      },
    ],
    disclaimer:
      "Any prices, break-even ranges, or discount categories described here are general estimates that vary by resort and change season to season — they aren't quotes or guarantees. Read the actual pass terms and confirm current pricing with the resort before buying.",
  },
  {
    id: "renting-vs-buying",
    title: "Renting vs. buying on a budget",
    description:
      "Purely on cost, this comes down to how many days you ride and how long the gear lasts you. The general shape of the trade-off is straightforward, even though the exact numbers depend on your local prices.",
    list: [
      {
        label: "Renting",
        text: "No upfront cost, no storage, no maintenance, and you're on reasonably current, shop-tuned equipment. Typically somewhere around $40–$70 a day for a full package at a resort, often less off-mountain or on a multi-day rate.",
      },
      {
        label: "Season rentals",
        text: "Many shops rent a package for the whole winter for roughly what a handful of day rentals would cost. A common middle step for people riding more than a few days but not ready to buy — and frequently offered for kids, who outgrow gear yearly.",
      },
      {
        label: "Demo programs",
        text: "Shops that rent higher-end equipment, sometimes crediting part of the demo fee toward a purchase. Costs more per day than a basic rental, and is mainly useful for trying specific gear before buying.",
      },
      {
        label: "Buying new",
        text: "The largest upfront cost and the lowest per-day cost over time, if you ride enough. It also means boots that are actually yours, which is the part most people notice first.",
      },
      {
        label: "Buying used",
        text: "Much lower upfront cost, with more responsibility on you to judge condition. Covered in the next article.",
      },
    ],
    paragraphs: [
      "A rough way to think about it: divide what a setup would cost you by a realistic day rental rate, and you get the number of days at which buying starts paying off. For a modestly priced used setup that number is often small; for a new setup at full retail it's often a season or more of regular riding.",
      "Boots are the usual exception to the whole calculation. They're the piece most tied to your own feet, rental boots are the most commonly cited source of a miserable first day, and many people buy boots well before they buy skis or a board for that reason rather than a financial one.",
      "There's a non-financial side too: owning means transporting, storing, drying, and maintaining gear, and eventually paying for tunes or repairs. Renting bundles all of that into the daily rate. If storage or a car is tight, renting can be the cheaper option in practice even when the math says otherwise.",
      "If you're leaning toward buying, sizing matters more than price — gear that doesn't fit is a bad deal at any discount. A shop fitter can confirm what sizes make sense for you before you start shopping, and Chatter Snow's gear library is another way to get on equipment without buying it.",
    ],
    links: [
      {
        label: "Chatter gear library",
        href: "/gears/library",
        internal: true,
      },
      {
        label: "Gear sizing guides",
        href: "/gears/sizing",
        internal: true,
      },
      {
        label: "Learn — Gear Care",
        href: "/learn/gear-care",
        internal: true,
      },
    ],
    disclaimer:
      "The rental rates and break-even framing here are rough estimates for orientation, not quotes, and they vary by region and shop. Sizing and fit decisions are best confirmed with a shop fitter or certified technician rather than an article.",
  },
  {
    id: "used-gear",
    title: "Finding used gear without overpaying",
    description:
      "The used market is where most of the real savings in this sport live, and it's also where it's easiest to buy something that doesn't work out. This is an overview of where people look and what tends to matter — not an appraisal guide.",
    list: [
      {
        label: "Ski swaps",
        text: "Seasonal sales run by clubs, schools, patrols, and shops, usually in fall. Typically the highest concentration of used gear in one place, often with knowledgeable people around to ask.",
      },
      {
        label: "Shop end-of-season sales",
        text: "Shops clear out rental fleets and last year's stock in spring. Rental gear has had a hard life but is usually maintained and honestly described.",
      },
      {
        label: "Online marketplaces",
        text: "The widest selection and the widest range of quality. Photos hide a lot, so this is where inspecting in person before paying matters most.",
      },
      {
        label: "Gear libraries and community programs",
        text: "Some nonprofits and community organizations lend equipment rather than selling it — worth checking locally before buying anything.",
      },
      {
        label: "Last season's new gear",
        text: "Not used at all, just outdated by a model year. Often discounted meaningfully once the new lineup lands, with none of the condition uncertainty.",
      },
    ],
    paragraphs: [
      "The general condition checks people apply: look at the base for deep gouges that reach the core, the edges for rust, cracks, or how much material is left after repeated tunes, and the topsheet and sidewall for delamination. On a snowboard or skis, bindings that shift under hand pressure or mounting holes that look reworked are worth asking about.",
      "For boots, condition matters less than fit, and fit is individual — a great price on the wrong shell shape is money spent on a bad day. Trying boots on, ideally with help from a shop fitter, is the part that's hard to shortcut on the used market.",
      "One thing that isn't a bargaining detail: used ski bindings need to be inspected and adjusted by a certified technician before they're used, and some bindings are old enough that shops won't work on them at all. Ask a shop whether a specific model is still serviceable before buying, and never set or adjust a DIN yourself — a certified technician does that.",
      "On price, the useful anchor is what the same item sells for new and what similar used listings ask. Gear that's been sitting for a decade, is missing parts, or shows structural damage is generally cheap for a reason, and getting it into usable shape can cost more than the discount saved.",
    ],
    links: [
      {
        label: "Chatter gear library",
        href: "/gears/library",
        internal: true,
      },
      {
        label: "Gear sizing guides",
        href: "/gears/sizing",
        internal: true,
      },
      {
        label: "Learn — Gear Care",
        href: "/learn/gear-care",
        internal: true,
      },
    ],
    disclaimer:
      "This is general orientation to the used market, not an inspection, appraisal, or safety certification. Any prices mentioned are estimates that vary widely, and the condition and safety of used equipment — especially bindings — should be assessed by a shop or certified technician, not by this article.",
  },
];
