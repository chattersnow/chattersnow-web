import type { LearnArticle } from "../learn-data";

export type MountainBasicsArticle = LearnArticle;

export const MOUNTAIN_BASICS_ARTICLES: MountainBasicsArticle[] = [
  {
    id: "trail-ratings",
    title: "Trail ratings explained: green, blue, black & beyond",
    description:
      "Trail ratings are a resort's own shorthand for how hard its runs are relative to each other. Understanding what the symbols mean — and what they don't — is one of the first things that makes a trail map readable.",
    list: [
      {
        label: "Green circle — easiest",
        text: "The gentlest terrain a mountain grooms, usually wide and low-angle. This is where most lessons and first days happen.",
      },
      {
        label: "Blue square — more difficult",
        text: "Steeper and often narrower than green terrain, typically still groomed. The widest category at most resorts, so blues can vary a lot from run to run.",
      },
      {
        label: "Black diamond — most difficult",
        text: "Steep, and frequently ungroomed, narrow, or a mix of both. Conditions matter more here than on gentler terrain.",
      },
      {
        label: "Double black diamond — expert only",
        text: "The steepest and most consequential terrain a resort marks, often with obstacles, cliffs, or mandatory line choices.",
      },
      {
        label: "Terrain park markings",
        text: "Parks use an orange oval and grade features by size (small, medium, large) rather than by trail difficulty.",
      },
    ],
    paragraphs: [
      "The most important thing to know about ratings is that they are relative to the mountain you're standing on, not standardized across the industry. A blue at a small local hill and a blue at a large mountain out west can be very different runs, and the same is true from region to region and country to country.",
      "Ratings also describe terrain, not conditions. A groomed black in soft snow and the same run scraped down to firm, icy snow late in the day are two different experiences, and the sign at the top says the same thing either way.",
      "Some resorts add their own variations — double green, double blue, a black-diamond-with-an-exclamation for extreme terrain — and those are local conventions rather than a wider standard. The trail map legend is the place to check what a given symbol means at that mountain.",
      "As a way to get oriented on an unfamiliar mountain, it's common to ride a run one tier easier than what you're used to first, and use it to calibrate how that resort grades its terrain. An instructor or someone who knows the mountain well can also tell you which specific runs are the friendlier ones in a category.",
    ],
    links: [
      {
        label: "NSAA — Your Responsibility Code",
        href: "https://www.nsaa.org/NSAA/Safety/Your_Responsibility_Code.aspx",
      },
      {
        label: "Chatter learn — getting started",
        href: "/learn/getting-started",
        internal: true,
      },
    ],
    disclaimer:
      "Trail ratings are set by each resort and are relative to that mountain only — they aren't a standardized measure, and they don't account for current conditions. Check the mountain's own map legend and ask ski patrol or an instructor if you're unsure whether a run suits your ability.",
  },
  {
    id: "trail-map",
    title: "Reading a trail map",
    description:
      "A trail map packs a lot into one sheet: difficulty, lift lines, base areas, and the routes that connect them. Knowing how to read one makes it much easier to plan a day and to find your way back.",
    list: [
      {
        label: "Legend",
        text: "Usually a corner box explaining every symbol on the map — difficulty markers, lift types, terrain parks, patrol stations, and food or restroom locations.",
      },
      {
        label: "Lifts",
        text: "Drawn as lines with their own symbols and names or numbers. The map generally shows where each one starts and ends, which is how you plan a route between areas.",
      },
      {
        label: "Base areas and lodges",
        text: "Your reference points for meeting people, warming up, and finding services. Larger mountains often have several, and they may not be walkable from one another.",
      },
      {
        label: "Ski patrol and first aid",
        text: "Marked with a cross or patrol symbol. Worth noting before you need it.",
      },
      {
        label: "Boundary lines",
        text: "Mark the edge of the patrolled ski area. Beyond them, the terrain isn't managed, marked, or patrolled the same way.",
      },
    ],
    paragraphs: [
      "Most printed trail maps are illustrations rather than to-scale drawings. Artists flatten and rotate faces of the mountain so everything fits on one panel, which means distances and steepness are hard to judge from the picture alone — a run that looks short on paper can be a long ride, and vice versa.",
      "A useful habit is to pick out the return route to your base area before you head up, especially at a mountain with multiple faces or base villages. Some runs only lead back to one side, and the connection you need may be a specific traverse or a last lift with an earlier closing time.",
      "Most resorts now have the same map in an app or on a mobile site, sometimes with lift status, grooming reports, and current openings layered on. That's often more current than a paper map printed at the start of the season, though phone batteries drain quickly in the cold, so plenty of people carry the paper version too.",
      "If you're piecing together a route on an unfamiliar mountain, lift operators and ski patrol are used to the question and can tell you which runs actually connect the way you're hoping.",
    ],
    links: [
      {
        label: "Chatter learn — mountain & lift etiquette",
        href: "/learn/etiquette",
        internal: true,
      },
      {
        label: "NSAA — Your Responsibility Code",
        href: "https://www.nsaa.org/NSAA/Safety/Your_Responsibility_Code.aspx",
      },
    ],
    disclaimer:
      "This is a general guide to how trail maps are usually laid out. Every resort draws its own map with its own conventions and keeps its own hours and lift schedules — check the mountain's current map, app, and posted information for anything you're relying on.",
  },
  {
    id: "lift-types",
    title: "Lift types & how to ride them",
    description:
      "Uphill transport comes in a handful of common forms, and each one loads a little differently. Here's what you're likely to run into and what generally distinguishes them.",
    list: [
      {
        label: "Magic carpet",
        text: "A conveyor belt at snow level, used on beginner terrain. You stand on it and ride up; nothing to grab or sit on.",
      },
      {
        label: "Rope tow / handle tow",
        text: "A moving rope or a series of handles that pull you uphill while you stay on your skis or board. Common on small learning slopes.",
      },
      {
        label: "Surface lifts (platter, T-bar, J-bar)",
        text: "A disc or bar that you brace against and that tows you up the hill. You stay standing on your equipment rather than sitting, and they're a common substitute for chairs on low-angle or wind-exposed terrain.",
      },
      {
        label: "Chairlift",
        text: "The most common type — a bench that scoops you up from a loading zone and carries you over the terrain. Ranges from slow doubles to high-speed detachable six-packs, and many have a safety bar overhead.",
      },
      {
        label: "Gondola and tram",
        text: "Enclosed cabins. Gondolas run continuously in small cabins and usually require removing skis or your board; trams are large cabins running on a fixed schedule.",
      },
    ],
    paragraphs: [
      "Loading is where most lift trouble happens, and the fix is usually just information: watch a cycle or two from the line, read the posted signs at the loading zone, and tell the lift operator it's your first time on that lift. Operators can slow or stop most lifts and do it routinely — asking is normal, not an imposition.",
      "Surface lifts catch a lot of people out because they tow rather than carry. The general idea is that you're being pulled along while your equipment stays on the snow, rather than sitting down on anything, and snowboarders ride them with one foot out. How that actually feels is easier to learn from an instructor or an experienced friend than from a description.",
      "On chairlifts, the common norms are to lower the safety bar if the chair has one and others agree, keep loose items and clothing clear of the seat and bar, and stay seated until the unloading ramp. If something does go wrong at unloading, moving clear of the ramp quickly matters most, because the next chair is right behind.",
      "Lifts also close before the mountain does, and last-ride times differ from lift to lift. On a big mountain, missing the last connecting lift can leave you a long way from your base area.",
    ],
    links: [
      {
        label: "Chatter learn — mountain & lift etiquette",
        href: "/learn/etiquette",
        internal: true,
      },
      {
        label: "Chatter programs — lessons & mentorship",
        href: "/programs",
        internal: true,
      },
    ],
    disclaimer:
      "This is an overview of common lift types, not instruction on riding any specific lift. Loading and unloading technique is best learned in person from an instructor, an experienced friend, or the lift operator at that lift — and posted instructions at the lift always take precedence.",
  },
  {
    id: "terrain-types",
    title: "Terrain types: groomed, moguls, trees & backcountry basics",
    description:
      "Beyond difficulty ratings, runs differ in what the snow surface itself is like. These categories explain most of what you'll see described on a trail map or in a grooming report.",
    list: [
      {
        label: "Groomed runs",
        text: "Snow tilled and smoothed overnight by grooming machines, leaving the corduroy-textured surface you see first thing in the morning. The most predictable surface on the mountain.",
      },
      {
        label: "Moguls",
        text: "Fields of snow bumps that form where skiers repeatedly turn on ungroomed terrain. Rhythmic and demanding, and the shape changes through the day as more people ride them.",
      },
      {
        label: "Tree runs / glades",
        text: "Marked runs through spaced trees. Visibility is short, the snow surface is uneven, and hazards like stumps, rocks, and tree wells can sit under the snow.",
      },
      {
        label: "Powder and off-piste",
        text: "Ungroomed snow inside the ski area boundary, patrolled but not smoothed. Depth and quality change quickly with weather and traffic.",
      },
      {
        label: "Backcountry / out-of-bounds",
        text: "Terrain outside the ski area boundary. Not patrolled, not avalanche-mitigated, and not marked — a fundamentally different activity from resort riding, with its own required training and equipment.",
      },
    ],
    paragraphs: [
      "Groomed terrain is where most people spend most of their time, and it's the surface trail ratings implicitly assume. When a run is left ungroomed, the same slope can feel considerably harder, which is part of why a grooming report is worth a look before you head up.",
      "Tree runs carry hazards that groomed terrain doesn't, including tree wells — the void of loose, unconsolidated snow that forms around the base of a conifer, which a person can fall into. Riding with a partner and keeping each other in sight is the standard advice you'll see from patrol and safety organizations for that reason.",
      "Backcountry travel sits well outside the scope of an orientation article. It involves avalanche terrain assessment, rescue equipment and the training to use it, weather and snowpack knowledge, and route-finding — the kind of thing people learn through recognized avalanche courses and time with experienced partners, not from reading. Snow that's within a ski area boundary has been assessed and mitigated by patrol; the same-looking slope on the other side of a boundary rope has not.",
      "If a type of terrain is new to you, the ordinary way in is a lesson, a guided group, or a day with someone who knows the mountain — and ski patrol can tell you what's open and what current conditions are like.",
    ],
    links: [
      {
        label: "NSAA — Your Responsibility Code",
        href: "https://www.nsaa.org/NSAA/Safety/Your_Responsibility_Code.aspx",
      },
      {
        label: "Chatter programs — lessons & mentorship",
        href: "/programs",
        internal: true,
      },
      {
        label: "Chatter learn — park riding & safety",
        href: "/learn/park-riding-safety",
        internal: true,
      },
    ],
    disclaimer:
      "This is a general description of terrain types, not instruction or a safety assessment for any specific slope or day. Backcountry and out-of-bounds travel in particular requires avalanche education, proper equipment, and experienced partners — seek out a recognized avalanche course and qualified instruction rather than treating this as preparation.",
  },
  {
    id: "signage-and-closures",
    title: "Mountain signage & closures: what they mean",
    description:
      "Signs, ropes, and markers are how a mountain communicates with everyone on it. Most of it is consistent enough across resorts to be worth recognizing on sight.",
    list: [
      {
        label: "Difficulty signs",
        text: "Posted at the top of runs and at junctions, matching the symbols on the trail map. They mark where a run starts and what the resort rates it.",
      },
      {
        label: "Slow zones",
        text: "Marked areas — often near base areas, lift lines, and merges — where the mountain asks everyone to reduce speed. Resorts do enforce these.",
      },
      {
        label: "Closure ropes and signs",
        text: "A rope, fence, or sign marking terrain that is closed. Closed means closed, regardless of how the snow looks from outside the rope.",
      },
      {
        label: "Hazard markers",
        text: "Bamboo poles, crossed poles, padding, or coloured flags marking rocks, thin cover, snowmaking equipment, or other obstacles.",
      },
      {
        label: "Boundary markers",
        text: "Signs and ropes at the edge of the patrolled ski area, usually stating that terrain beyond is unpatrolled and unmitigated.",
      },
    ],
    paragraphs: [
      "Closures usually exist for a reason you can't see from the top: avalanche mitigation in progress, thin cover or exposed hazards, snowmaking or grooming operations, an incident being managed, or wind damage. The reason isn't always posted, and patrol generally won't have time to explain it in the moment.",
      "Ducking a rope is treated seriously by resorts. Beyond the risk to yourself, it can put patrol in the position of running a rescue in terrain they've closed, and it commonly results in a pass being pulled — many mountains state this explicitly on the sign or in their pass conditions.",
      "Signage also changes through the day and the season. Runs open and close with conditions, hazard markers move as coverage changes, and a run that was open yesterday may not be today. Grooming and lift-status reports, whether posted at the base or in the resort's app, are the current picture.",
      "If a sign is unclear, or a rope's position doesn't seem to match what's on your map, ski patrol or a lift operator is the right person to ask. Reporting a hazard you come across — a downed rope, an exposed rock, someone in trouble — to patrol is also part of how the system works.",
    ],
    links: [
      {
        label: "NSAA — Your Responsibility Code",
        href: "https://www.nsaa.org/NSAA/Safety/Your_Responsibility_Code.aspx",
      },
      {
        label: "Chatter learn — mountain & lift etiquette",
        href: "/learn/etiquette",
        internal: true,
      },
    ],
    disclaimer:
      "Signage conventions vary between resorts, regions, and countries, and this is a general overview rather than any mountain's official rules. Posted signage, ropes, and ski patrol instructions at the mountain you're on always take precedence over anything described here.",
  },
];
