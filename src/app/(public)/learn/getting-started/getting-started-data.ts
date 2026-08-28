import type { LearnArticle } from "../learn-data";

export const GETTING_STARTED_ARTICLES: LearnArticle[] = [
  {
    id: "first-day",
    title: "First day guide: what to expect at the mountain",
    description:
      "A first day is mostly logistics — parking, tickets, rentals, and finding the right building — long before it's anything to do with skiing or riding. Here's the general shape of a day at a resort so less of it is a surprise.",
    list: [
      {
        label: "Arriving & parking",
        text: "Lots typically fill earliest on weekends and holidays, and larger resorts often run shuttles from overflow lots to the base area. Some mountains reserve closer lots or charge for them on busy days.",
      },
      {
        label: "Tickets & passes",
        text: "Lift access is usually sold online in advance or at a ticket window, and advance online pricing is commonly lower than walk-up. Whatever you buy gets scanned at the lift, so keep it somewhere reachable.",
      },
      {
        label: "The rental shop",
        text: "Rental staff generally ask for height, weight, boot size, and how much experience you have, then fit you with equipment. Mornings are the busiest stretch of the day here.",
      },
      {
        label: "The lessons desk",
        text: "Lessons usually check in at their own desk or meeting spot, which is often a different place than the rental shop. Confirmation emails typically say where and when to show up.",
      },
      {
        label: "The base lodge",
        text: "Bathrooms, food, somewhere to warm up, and often day lockers for a small fee. It's the usual place to meet up with the people you came with.",
      },
      {
        label: "The learning area",
        text: "Most resorts have a dedicated beginner zone with gentle terrain and a slow lift — often a magic carpet, a moving belt you ride standing up — separate from the main trail network.",
      },
    ],
    paragraphs: [
      "The first hour or two of the day is when tickets, rentals, and lesson check-in are all busiest at once, so many first-timers find it helps to build in more buffer time than they think they need.",
      "Resort staff are used to first-timers asking where things are — guest services, the ticket window, and ski patrol are all reasonable places to start when you're not sure where to go.",
      "Lifts stop running before the light goes, and \"last chair\" times are usually posted at the base area and on the resort's website or app. Conditions and which trails and lifts are actually open change day to day, so a resort's conditions report is worth checking before the drive rather than after.",
      "The responsibility code that applies on the mountain is published by the National Ski Areas Association and posted at most resorts. Reading it once before your first day is a common way people get oriented to what's expected of everyone out there.",
    ],
    links: [
      {
        label: "NSAA — Your Responsibility Code",
        href: "https://www.nsaa.org/NSAA/Safety/Your_Responsibility_Code.aspx",
      },
      {
        label: "Chatter Snow events & mountain days",
        href: "/events",
        internal: true,
      },
    ],
    disclaimer:
      "Every resort runs its base area a little differently — this is a general picture, not any specific mountain's process. Check that resort's own website or guest services for how their day actually works.",
  },
  {
    id: "what-to-pack",
    title: "What to pack for your first day",
    description:
      "Rental shops cover the equipment; what you wear and carry is generally on you. This is an overview of what people typically bring and what a resort typically provides.",
    list: [
      {
        label: "Layers",
        text: "A base layer, an insulating mid layer, and a waterproof outer layer is the common approach, because it can be adjusted through the day. Cotton is generally avoided for the layers against your skin since it holds moisture rather than moving it away.",
      },
      {
        label: "Waterproof jacket & pants",
        text: "Snow melts on contact, and beginners spend more time in it than experienced riders do. Water-resistant is not the same as waterproof, and the difference shows up fastest while learning.",
      },
      {
        label: "Gloves or mittens",
        text: "Waterproof, and warm enough for the forecast rather than the parking lot. A spare pair is a common thing to leave in the car or a locker, since wet gloves rarely dry during the day.",
      },
      {
        label: "Goggles & sun protection",
        text: "UV exposure is stronger at altitude and reflects back off the snow, so sunscreen and eye protection matter even on overcast days. Goggles also handle wind and falling snow in a way sunglasses don't.",
      },
      {
        label: "Helmet",
        text: "Rental packages often include one, and many people bring their own. Fit is what makes a helmet work, so a shop or rental technician is the right person to check it.",
      },
      {
        label: "Socks",
        text: "One pair of tall socks made for ski or snowboard boots is the usual setup. Doubling up socks tends to make boots tighter rather than warmer.",
      },
      {
        label: "ID & payment",
        text: "Rental shops generally need identification and a card on file, and lessons or tickets may need a confirmation number.",
      },
      {
        label: "Water, snacks & small extras",
        text: "Lip balm, a snack, and water are easy to forget. A day locker or a small backpack covers whatever you don't want to carry on the lift.",
      },
    ],
    paragraphs: [
      "A rental package typically covers skis or a snowboard, boots, poles for skiers, and frequently a helmet. Clothing is generally not included, though some resorts and community programs do rent or lend jackets and pants — worth asking about rather than assuming either way.",
      "Rental and clothing prices vary widely by region, resort, and season, and change from year to year, so treat any number you see quoted anywhere as a rough estimate and confirm current pricing with the shop or resort directly.",
      "Borrowing or renting for a first day is common, since it avoids buying gear before you know what you like. Nonprofit gear libraries and community lending programs, including ours, exist partly for that reason.",
      "Nothing here has to be technical or expensive to work — warm, waterproof, and layered is the general idea, and plenty of first-timers get through their first day with borrowed or secondhand clothing.",
    ],
    links: [
      {
        label: "Chatter Snow gear library",
        href: "/gears/library",
        internal: true,
      },
      {
        label: "Equipment sizing guide",
        href: "/gears/sizing",
        internal: true,
      },
    ],
    disclaimer:
      "This is a general packing overview, not a recommendation for specific products or brands. Any prices mentioned are rough estimates that vary by region and season — confirm with the resort or shop. What works for conditions on a given day is best confirmed with the forecast and the people fitting your gear.",
  },
  {
    id: "skiing-101",
    title: "Skiing 101: the absolute basics",
    description:
      "What skiing actually involves at a concept level — the equipment, the vocabulary, and how people typically get started. This is orientation, not instruction: the physical technique belongs in a lesson.",
    list: [
      {
        label: "Skis",
        text: "Two separate boards, one per foot. Length and shape vary with a rider's height, weight, and the kind of terrain the ski is built for, which is why rental shops ask for measurements.",
      },
      {
        label: "Boots",
        text: "Stiff plastic shells that hold the ankle and lower leg and transfer movement to the ski. They fit far more snugly than normal footwear, and a boot fitter is the right person to sort out fit problems.",
      },
      {
        label: "Bindings",
        text: "The mechanism connecting boot to ski, designed to release the boot under certain forces. The release setting (often called DIN) depends on several rider-specific factors and is set and tested by a certified technician — never adjusted by the rider.",
      },
      {
        label: "Poles",
        text: "Used for timing, balance, and pushing along flat sections. Some beginner lessons start without them so there's less to manage at once.",
      },
      {
        label: "Trail ratings",
        text: "In North America, green circle, blue square, and black diamond mark relative difficulty within a single resort — they're not standardized between mountains, so a green at one resort may not feel like a green at another.",
      },
      {
        label: "Groomers",
        text: "Trails machine-smoothed overnight into a consistent corduroy-like surface. They're the most predictable terrain on the mountain and where most learning happens.",
      },
    ],
    paragraphs: [
      "A typical first day on skis stays in a learning area on very gentle terrain, working on balance, sliding, controlling speed, stopping, and eventually turning. Instructors usually introduce those in an order that builds on itself, which is a large part of what you're paying for in a lesson.",
      "How quickly any of that comes together varies enormously between people, and comparing your first day to someone else's is generally not a useful measure of anything.",
      "Skiing is physically demanding in ways that are easy to underestimate — cold, altitude at many resorts, and muscles used differently than usual. Taking breaks, drinking water, and stopping while you still have something left are common pieces of advice from instructors and patrollers.",
      "Anything involving actual technique, terrain choice for your ability, or binding settings is a conversation for a certified instructor or a shop technician who can see your equipment and watch you ride. An article can tell you what the pieces are; it can't tell you what to do with your body or your gear.",
    ],
    links: [
      {
        label: "Equipment sizing guide",
        href: "/gears/sizing",
        internal: true,
      },
      {
        label: "NSAA — Your Responsibility Code",
        href: "https://www.nsaa.org/NSAA/Safety/Your_Responsibility_Code.aspx",
      },
    ],
    disclaimer:
      "This is an overview of what skiing involves, not instruction and not a lesson plan. Technique belongs with a certified instructor, and anything to do with binding release settings belongs with a certified shop technician — never set or adjusted from an article.",
  },
  {
    id: "snowboarding-101",
    title: "Snowboarding 101: the absolute basics",
    description:
      "The same orientation, snowboard-specific: what the equipment is, how the vocabulary works, and what the first day generally looks like. Technique itself is left to instructors.",
    list: [
      {
        label: "The board",
        text: "A single board with both feet mounted across it, facing sideways. Length and width vary with rider size and the terrain the board is built for, which is why rental shops ask for measurements.",
      },
      {
        label: "Boots",
        text: "Usually softer and more flexible than ski boots, though still far snugger than everyday footwear. Fit is the thing that matters most, and a boot fitter is the right person to sort it out.",
      },
      {
        label: "Bindings",
        text: "Strap or attach each boot to the board. Unlike ski bindings, standard snowboard bindings are not designed to release, so there's no rider-adjustable release setting to think about — mounting and setup are still a shop's job.",
      },
      {
        label: "Stance",
        text: "Riding left-foot-forward is called regular and right-foot-forward is called goofy. Neither is better; which one feels natural varies by person, and instructors and rental staff have ways of helping people figure out their own.",
      },
      {
        label: "Riding lifts",
        text: "Snowboarders unstrap their back foot to load and unload lifts, then push along flat sections with it — often called skating. It's one of the more distinctly awkward parts of the first day for most people.",
      },
      {
        label: "Trail ratings",
        text: "Green circle, blue square, and black diamond mark relative difficulty within one resort, not across resorts. Beginner terrain and learning areas are usually mapped separately from the main trail network.",
      },
    ],
    paragraphs: [
      "First days on a snowboard generally stay in a learning area, covering how to strap in, how to stand up, how to slide and control speed on one edge, and how to stop. Instructors introduce those in a sequence, and falling is a normal part of the process rather than a sign it's going badly.",
      "Because falls while learning often go onto hands and wrists, wrist guards are common among new snowboarders, and helmets are close to standard across the sport. Whether particular protective gear suits you is worth discussing with an instructor or shop rather than deciding from an article.",
      "Skiing and snowboarding tend to feel different in the early stages — people often describe snowboarding as harder in the first days and skiing as harder to progress in later on — but that's a generalization with plenty of exceptions, not a rule to plan around.",
      "As with skiing, actual technique and terrain choice come from a lesson or an experienced instructor who can watch you ride. What's here is meant to make the first day less unfamiliar, not to teach you to ride.",
    ],
    links: [
      {
        label: "Equipment sizing guide",
        href: "/gears/sizing",
        internal: true,
      },
      {
        label: "NSAA — Your Responsibility Code",
        href: "https://www.nsaa.org/NSAA/Safety/Your_Responsibility_Code.aspx",
      },
    ],
    disclaimer:
      "This is an overview of what snowboarding involves, not instruction and not a lesson plan. Technique, equipment setup, and what protective gear makes sense for you are all questions for a certified instructor or a shop, not an article.",
  },
  {
    id: "lesson-vs-going-it-alone",
    title: "Booking a lesson vs. going it alone",
    description:
      "Both routes are common, and which one fits depends on your situation. These are the factors people generally weigh — not a recommendation either way.",
    list: [
      {
        label: "What a lesson usually includes",
        text: "A qualified instructor, a structured progression, and terrain chosen for your level. Beginner packages at many resorts bundle a lesson with a lift ticket and rentals.",
      },
      {
        label: "Group vs. private",
        text: "Group lessons cost less per person and move at the group's pace; private lessons cost more and move at yours. Both are typically booked in advance, and beginner slots often fill on weekends and holidays.",
      },
      {
        label: "Cost",
        text: "Lessons are usually the largest single line item on a first day, and prices vary widely by resort, season, and format. Treat any figure you find as an estimate and confirm current pricing with the resort.",
      },
      {
        label: "Going with an experienced friend",
        text: "Free, familiar, and flexible — but a friend who rides well isn't necessarily trained to teach, and a common failure mode is being taken onto terrain that's beyond a first-timer's comfort.",
      },
      {
        label: "Learning on your own",
        text: "Possible on beginner terrain, and some people prefer it. It does mean nobody is managing terrain choice or pacing for you, which is the part that most often goes wrong early on.",
      },
      {
        label: "Time & scheduling",
        text: "Lessons run on set times and check-in windows; unstructured days don't. If your group has one car and one schedule, that's often the deciding practical factor.",
      },
    ],
    paragraphs: [
      "The trade-off most people are actually weighing is cost and flexibility against structure and terrain management. Neither side of that is the objectively right answer, and plenty of people mix the two — a lesson on day one, friends after that, or the reverse.",
      "If cost is the constraint, it's worth knowing that beginner packages, weekday rates, off-peak timing, and community programs all exist specifically to lower it. Nonprofit and community organizations, ours included, run mentorship and beginner sessions in that space.",
      "Whichever route you take, the responsibility code applies the same way, and ski patrol is the resource for anything that goes wrong on the mountain. Choosing terrain within your current ability is the piece an instructor would otherwise be handling for you.",
      "If you're deciding for someone else — a child, or a first-timer in your group — resorts and programs usually have age minimums and their own formats for younger beginners, so their guest services or programs desk is the place to confirm what's actually available.",
    ],
    links: [
      {
        label: "Chatter programs — mentorship & beginner sessions",
        href: "/programs",
        internal: true,
      },
      {
        label: "NSAA — Your Responsibility Code",
        href: "https://www.nsaa.org/NSAA/Safety/Your_Responsibility_Code.aspx",
      },
    ],
    disclaimer:
      "This lays out factors to weigh, not a recommendation about how you should learn. Lesson formats, age minimums, and prices vary by resort and season — any figures are rough estimates, and the resort is the source of truth for what it currently offers.",
  },
];
