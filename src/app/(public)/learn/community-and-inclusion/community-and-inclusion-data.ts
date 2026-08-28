import type { LearnArticle } from "../learn-data";

export const COMMUNITY_AND_INCLUSION_ARTICLES: LearnArticle[] = [
  {
    id: "finding-your-place",
    title: "Finding your place in the snow sports community",
    description:
      "Snow sports can look like a closed circle from the outside — full of people who grew up doing it and already know each other. It isn't one, but finding a way in is easier when you know where people actually connect.",
    list: [
      {
        label: "Community programs & nonprofits",
        text: "Organizations built specifically to get new people on the mountain — beginner sessions, gear lending, group trips. They generally assume you're starting from zero, which is the whole point of them.",
      },
      {
        label: "Clubs & meetup groups",
        text: "Regional ski and snowboard clubs typically organize carpools, group days, and season trips. Many run separate beginner-friendly days, and it's reasonable to ask before signing up which of theirs those are.",
      },
      {
        label: "Affinity groups",
        text: "Groups organized around shared identity or background — among many others, riders of color, LGBTQ+ riders, women's collectives, and adaptive sports organizations. They exist because showing up somewhere you're not the only one changes the experience for a lot of people.",
      },
      {
        label: "Lessons & clinics",
        text: "A group lesson or a multi-week clinic puts you with other people at the same stage. The shared-progress part is a common way people end up with regular riding partners.",
      },
      {
        label: "Adaptive programs",
        text: "Adaptive snow sports organizations work with riders with disabilities, using specialized equipment and trained instructors. Availability varies by resort and region, so their own intake process is the place to start.",
      },
      {
        label: "Volunteering",
        text: "Gear sorting, event help, and program support are ways into a community that don't require riding well — or riding at all — and they tend to put you around people who ride.",
      },
    ],
    paragraphs: [
      "The sport carries a real history of being expensive and exclusive, and it's fair to notice that. What's also true is that a lot of organizations now exist specifically to widen who gets to participate, and most of them are actively looking for newcomers rather than waiting to be impressed by them.",
      "Community is usually built through repetition rather than a single introduction. Showing up to the same group day, clinic, or volunteer shift a few times generally does more than any one perfect first outing.",
      "You do not have to be good at this to belong in it. Most people on any given mountain are somewhere in the middle of their own learning, and the ones who have been at it longest have generally forgotten how quickly the early stages pass.",
      "If a particular group or space doesn't feel like a fit, that's information about that group, not about whether snow sports are for you. There are usually several communities around a single mountain, and they differ a lot in tone.",
    ],
    links: [
      {
        label: "Chatter programs — mentorship & beginner sessions",
        href: "/programs",
        internal: true,
      },
      {
        label: "Community events",
        href: "/events/community",
        internal: true,
      },
      {
        label: "Get involved & volunteer",
        href: "/get-involved",
        internal: true,
      },
    ],
    disclaimer:
      "This describes kinds of groups and programs in general terms, not an endorsement of any particular organization. What's available near you, who it serves, and how to join varies by region — check with the organization directly.",
  },
  {
    id: "beginner-buddy-guide",
    title: "Beginner buddy guide: riding with a mentor",
    description:
      "Plenty of first-timers learn alongside someone more experienced. That works well when both people are clear on what the day is for — and goes sideways when they aren't.",
    list: [
      {
        label: "A mentor isn't an instructor",
        text: "Riding well and being trained to teach are different things. A mentor can show you how a day works, where things are, and what the vocabulary means; certified instruction is a separate role and a separate qualification.",
      },
      {
        label: "Agree on the day before you get there",
        text: "How long you'll ride, what terrain you'll stay on, and when you'll stop are much easier to settle in the parking lot than partway down something you didn't expect.",
      },
      {
        label: "The beginner sets the pace",
        text: "The person with less experience is the one who knows when they're tired, cold, or done. A mentor's job is generally to make that easy to say out loud rather than something that has to be admitted.",
      },
      {
        label: "Terrain stays where the beginner is",
        text: "Being taken onto a run beyond your comfort is the most common way a mentor day goes badly. \"You'll be fine\" is not a terrain assessment, and it's reasonable to decline a run for any reason or no reason.",
      },
      {
        label: "Agree on a meeting plan",
        text: "Where to regroup, what happens if you get separated, and whether phones will actually work up there. Simple, decided in advance, and known by both people.",
      },
      {
        label: "Falling is expected",
        text: "It's a normal part of the early stages, not evidence the day is going wrong. A useful mentor treats it that way.",
      },
    ],
    paragraphs: [
      "If you're the mentor, most of the value you're adding is logistical and social rather than technical: where to park, how the rental shop works, what the lift is going to ask of you, and what the signs mean. That's genuinely useful, and it doesn't require you to teach technique you aren't qualified to teach.",
      'If you\'re the beginner, it\'s worth saying at the start what you actually want out of the day. "I want to get comfortable on the learning area and ride one lift" is a clearer target than "I want to try skiing," and it gives your mentor something concrete to work with.',
      "A common pattern is a lesson first and a mentor after — the lesson covers the technique, and the mentor covers the everything-else of a normal day. Neither replaces the other especially well.",
      "Both people should know that ski patrol handles anything that goes wrong on the mountain, and that patrol is called rather than worked around. If someone is hurt, the answer is patrol and medical attention, not a friend's assessment of how bad it looks.",
      "Mentorship also works as a formal arrangement. Programs that pair newer riders with experienced volunteers — ours among them — exist partly because not everyone has a friend who already rides.",
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
      {
        label: "Volunteer with Chatter Snow",
        href: "/get-involved/volunteer",
        internal: true,
      },
    ],
    disclaimer:
      "Riding with a friend is not a substitute for instruction from a certified instructor, and nothing here is technique guidance. If anyone is injured, contact ski patrol and seek medical attention.",
  },
  {
    id: "mixed-skill-levels",
    title: "Riding with mixed skill levels in your group",
    description:
      "Groups rarely arrive at the same ability. A day works better when that's planned around rather than discovered on the first chairlift.",
    list: [
      {
        label: "Split and regroup",
        text: "A common approach is riding separately by ability and meeting at set times and places — the base lodge at lunch, or the bottom of a shared lift each hour. Everyone gets the day they came for.",
      },
      {
        label: "Pick a shared home base",
        text: "One lift or one area that everyone can get back to, whatever they've been riding. It makes regrouping a location rather than a negotiation.",
      },
      {
        label: "Don't route by the strongest rider",
        text: "If terrain choice follows whoever rides best, the least experienced person in the group ends up somewhere they didn't choose. Routing by the person with the least experience is the version that keeps the group together.",
      },
      {
        label: "Say what you want from the day",
        text: "People in the same group often want different things — laps, sightseeing, a break in the lodge, or just to make it down once. None of those are wrong, and they're easier to accommodate when stated.",
      },
      {
        label: "Agree on when to stop",
        text: "Fatigue is uneven across a group, and later runs are where tired people tend to get hurt. Deciding in advance that anyone can call it done removes the pressure to keep up.",
      },
      {
        label: "Have a plan for getting separated",
        text: "Cell service is unreliable at many resorts. A fallback meeting point and time is worth more than an assumption that you can text.",
      },
    ],
    paragraphs: [
      "The recurring failure mode in mixed groups isn't skill, it's pace. A slower rider on their own terrain generally has a good day; the same rider trying to keep up with people on harder runs generally doesn't.",
      "Trail ratings are relative to a single resort, so \"it's just a blue\" means less than it sounds like, especially between mountains. Reading the trail map together at the start of the day gives everyone the same picture of what's actually on offer.",
      "If your group includes someone on their first day, they're often the person least likely to say they're uncomfortable. Checking in directly, and making \"let's stop\" a normal thing to hear, tends to work better than waiting for them to raise it.",
      "The responsibility code applies to everyone in the group individually — including responsibility for the people ahead of you on a trail and for stopping somewhere you can be seen. It's worth everyone having read it once, not just the newest rider.",
      "Groups that regularly ride together across levels usually end up with some version of this as a habit rather than a conversation. Setting it up on the first day just gets you there sooner.",
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
      "This is general guidance on organizing a group day, not advice about what terrain is appropriate for any particular person. Terrain choice and ability are best assessed with a certified instructor, and ski patrol handles anything that goes wrong on the mountain.",
  },
  {
    id: "first-timer-intimidation",
    title: "Overcoming first-timer intimidation",
    description:
      "Feeling out of place on a first day is extremely common, and it's usually about the unfamiliar logistics as much as the sport itself. Naming what's actually intimidating tends to shrink it.",
    list: [
      {
        label: '"Everyone can tell I\'m new"',
        text: "Some of them can, and most of them don't care — beginners are a normal, expected part of every resort's day, which is why learning areas and rental shops exist at the scale they do.",
      },
      {
        label: '"I don\'t know how any of this works"',
        text: "Base areas are genuinely confusing the first time. Guest services, the ticket window, and rental staff answer these questions constantly, and asking is faster than guessing.",
      },
      {
        label: '"I\'ll fall in front of people"',
        text: "You probably will, and so does everyone learning. Falling is part of the early stages rather than a sign something is going wrong.",
      },
      {
        label: '"The lift looks impossible"',
        text: "Lifts are the part most first-timers worry about most and stop thinking about soonest. Lift operators slow or stop chairs for people who need it — you can ask, and it's a routine request.",
      },
      {
        label: '"I don\'t look like the people in the photos"',
        text: "Snow sports marketing has historically shown a narrow slice of who actually rides. The mountain is more varied than the advertising, and it's getting more so.",
      },
      {
        label: '"I can\'t afford to look like a beginner"',
        text: "Borrowed, rented, and secondhand gear is common and unremarkable. Nobody on a lift is auditing your jacket.",
      },
    ],
    paragraphs: [
      "A lot of first-day anxiety is really about not knowing the sequence of a day — where to go, in what order, and what you'll be asked. Reading through what a first day looks like beforehand takes most of the unknown out of it, which is a large part of what the Getting Started articles are for.",
      "Going with someone else helps for most people, whether that's a friend, a group lesson, or a community beginner session. A group lesson in particular puts you with several other people who are also there for the first time.",
      "Progress in the early stages is uneven and person-specific. Measuring your first day against someone else's — especially someone who started as a kid — is a comparison with no useful information in it.",
      "It's also fine to have a small day. One or two hours in a learning area is a complete first outing, and stopping while you still have energy left is a common piece of advice from instructors for a reason.",
      "If cost is part of what makes this feel out of reach, that's a practical barrier rather than a personal one, and it's the specific problem community gear libraries, lending programs, and nonprofit beginner sessions were set up to address.",
    ],
    links: [
      {
        label: "Getting started on the mountain",
        href: "/learn/getting-started",
        internal: true,
      },
      {
        label: "Chatter programs — mentorship & beginner sessions",
        href: "/programs",
        internal: true,
      },
      {
        label: "Chatter Snow gear library",
        href: "/gears/library",
        internal: true,
      },
    ],
    disclaimer:
      "This is general encouragement and orientation, not instruction or advice about your own readiness or health. Anything involving technique or terrain choice belongs with a certified instructor, and anything involving a medical concern belongs with a qualified professional.",
  },
];
