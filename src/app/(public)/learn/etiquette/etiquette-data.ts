import type { LearnArticle } from "../learn-data";

export const ETIQUETTE_ARTICLES: LearnArticle[] = [
  {
    id: "basics",
    title: "Mountain & lift etiquette basics",
    description:
      "Most of what keeps a busy mountain running smoothly isn't posted anywhere — it's a set of habits everyone out there is quietly relying on each other to follow. This is an overview of the common ones, not any particular resort's rulebook.",
    list: [
      {
        label: "Stay predictable",
        text: "Other people are reading your line and planning around it. Sudden stops, sharp cuts across a trail, and unannounced direction changes are what tend to catch riders behind you off guard.",
      },
      {
        label: "Stop where you can be seen",
        text: "The usual habit is to pull over to the side of a trail and out of blind spots — below a roller, just past a lip, or around a bend is where an uphill rider has the least time to react.",
      },
      {
        label: "Look uphill before you go",
        text: "Merging onto a trail or starting again after a break generally means yielding to whoever's already coming down.",
      },
      {
        label: "Pack out what you bring",
        text: "Wrappers and cans dropped from a lift end up in the snow under it. Most base areas and lift lines have bins, and many resorts ask you to carry trash down rather than leave it on the hill.",
      },
      {
        label: "Respect closures and boundaries",
        text: "Ropes, fencing, and closure signs generally mean grooming, avalanche work, thin cover, or an incident in progress — reasons that usually aren't visible from where you're standing.",
      },
      {
        label: "Give beginners room",
        text: "Learning areas and slow zones exist because people fall there. Passing wide and at a lower speed is the norm through them.",
      },
    ],
    paragraphs: [
      "Etiquette on a mountain mostly comes down to one idea: the person below or ahead of you can't see you, so the responsibility for avoiding them sits with you. Nearly every specific convention — where to stop, when to yield, how to pass — is some version of that.",
      "Speed is the other half of it. What counts as reasonable depends on how crowded the trail is, how well you can see ahead, and the conditions that day, which is why slow zones near lift lines, trail merges, and learning areas are marked out separately.",
      "Ski patrol handles injuries, closures, and unsafe riding, and they're also generally the people to flag down if you come across an incident or something that looks wrong on the hill. Most resorts post how to reach them, and lift attendants can radio them.",
      "Resorts each have their own posted rules on top of the general norms — uphill travel policies, drone rules, leashes, and where personal cameras or speakers are welcome vary quite a bit. Checking a mountain's website or the signage at the base area is the reliable way to know.",
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
      "These are general, widely shared norms rather than any specific mountain's official rules — posted signage, a resort's own website, and ski patrol are the authority on how a particular place expects people to ride.",
  },
  {
    id: "lift-lines",
    title: "Lift line etiquette",
    description:
      "The lift line is where the most people are packed into the smallest space, so it's where etiquette gets noticed the fastest. Here's how lines usually work and what's generally expected while you're in one.",
    list: [
      {
        label: "Merge, don't cut",
        text: "Lines typically funnel through a maze and alternate as they merge. Slotting in beside someone who's been waiting is the thing most likely to get a reaction.",
      },
      {
        label: "Fill the chair",
        text: "Attendants often ask singles to pair up so chairs go out full, especially when the line is long. The singles line exists for exactly this.",
      },
      {
        label: "Sort out your group first",
        text: "Deciding who's riding with whom before you reach the loading point keeps the line moving; sorting it out at the gate tends to stop everyone behind you.",
      },
      {
        label: "Get your pass ready",
        text: "Scanners usually read a pass in a pocket or on a sleeve, but only if it's not buried under a layer you have to unzip at the gate.",
      },
      {
        label: "Mind your equipment",
        text: "Skis and boards in a line have edges. Keeping them flat, out from underfoot, and off the backs of the people ahead is the general courtesy.",
      },
      {
        label: "Load and unload smoothly",
        text: "Watch the chair, sit as it comes, and once you're off at the top, keep moving clear of the unload ramp rather than stopping to adjust gear there.",
      },
    ],
    paragraphs: [
      "On the chair itself, the bar convention varies by region and by resort — some mountains require it, some leave it to the riders. Asking or giving a heads-up before lowering or raising it is the usual courtesy, since it catches people off guard otherwise.",
      "If something goes wrong at loading or unloading — a fall, dropped equipment, a stuck rider — lift attendants can slow or stop the lift, and that's what the stop is there for. Trying to sort it out yourself while the chairs keep moving is generally how a small problem becomes a bigger one.",
      "Lines are also where a lot of first-timers feel most out of place. Attendants deal with new riders constantly and are used to being asked which line is which, whether a lift is beginner-friendly, and how to load — asking is normal, not an imposition.",
      "Practices differ between resorts and lift types, and gondolas, surface lifts, and magic carpets each have their own loading routine. Posted instructions at the base of the lift are the thing to go by.",
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
      "Lift procedures and rules vary by resort and by lift — follow the posted instructions and the lift attendants at the mountain you're at, not a general description like this one.",
  },
  {
    id: "right-of-way",
    title: "Sharing the trail: right-of-way basics",
    description:
      "Trails have no lanes and no signals, so who yields to whom is settled by a handful of conventions everyone is expected to know. This explains what those conventions are and the thinking behind them.",
    list: [
      {
        label: "The person ahead has right of way",
        text: "Whoever is downhill or in front of you generally can't see you coming, so avoiding them is on you — this is the foundation the rest of it sits on.",
      },
      {
        label: "Announce a close pass",
        text: 'A simple "on your left" or "on your right" when you\'re passing tight is the common courtesy, though leaving enough room that it isn\'t needed is better still.',
      },
      {
        label: "Merging means yielding",
        text: "Where trails join, riders coming onto the trail typically look uphill and wait for a gap rather than the through traffic slowing for them.",
      },
      {
        label: "Starting again is merging",
        text: "Getting up after a fall or a break puts you back into traffic, so the same look-uphill habit applies.",
      },
      {
        label: "Don't stop in a blind spot",
        text: "Just past a rise, under a lip, or around a corner leaves an uphill rider no time to react. Pulling to the edge with clear sightlines above you is the norm.",
      },
      {
        label: "Watch for the mountain's other traffic",
        text: "Snowmobiles, grooming machines, patrol sleds, uphill skinners, and lift maintenance all share the terrain, sometimes outside normal hours.",
      },
    ],
    paragraphs: [
      "Right of way on snow works differently than on a road because everyone's field of view points downhill. The rider above sees everything ahead of them; the rider below sees none of what's coming. Assigning the responsibility uphill is simply where it can actually be acted on.",
      "Speed control belongs to the same idea. Being able to stop or turn within the distance you can see is what makes yielding possible at all, and it's why crowded runs, flat light, and narrow cat tracks call for a lot more margin than an empty groomer does.",
      "Collisions between riders are one of the more common ways people get hurt on a mountain, and they tend to happen at merges, on crowded runs at the end of the day, and in the flat spots where people stop to regroup. If you're involved in one, stopping and exchanging information is expected the same way it would be after a car accident, and ski patrol should be involved if anyone is hurt.",
      "If someone is injured, get ski patrol rather than trying to assess or move them yourself — they're trained and equipped for on-mountain injuries. Planting crossed skis or a board upslope of the scene is a widely used signal to alert riders coming down.",
    ],
    links: [
      {
        label: "NSAA — Your Responsibility Code",
        href: "https://www.nsaa.org/NSAA/Safety/Your_Responsibility_Code.aspx",
      },
      {
        label: "Park riding & safety — terrain park etiquette",
        href: "/learn/park-riding-safety",
        internal: true,
      },
    ],
    disclaimer:
      "This is general orientation to how riders share terrain, not safety instruction or medical guidance. For anything involving an injury, ski patrol or a medical professional is the right call — and each resort's posted rules take precedence over any general description.",
  },
  {
    id: "responsibility-code",
    title: "Uphill/downhill traffic & the Responsibility Code",
    description:
      "Most of the etiquette on this page traces back to a published code of conduct posted at resorts across North America, plus a separate set of expectations for anyone traveling uphill. This covers what those are and where to read them.",
    list: [
      {
        label: "Your Responsibility Code",
        text: "A short list of shared expectations — control your speed, yield to those ahead of and below you, look uphill before merging or starting, observe signs and closures — published by the National Ski Areas Association and posted at most resorts.",
      },
      {
        label: "Downhill traffic",
        text: "The general rule for riders coming down: the person below or ahead of you has the right of way, and staying in control enough to avoid them is what makes that workable.",
      },
      {
        label: "Uphill traffic",
        text: "Skinning, splitboarding, or hiking up a resort's terrain is governed by that resort's own uphill policy, which typically sets designated routes, permitted hours, and whether a pass is required.",
      },
      {
        label: "Stay to the edge going up",
        text: "Where uphill travel is allowed, the usual expectation is single file at the side of the trail, out of the fall line and visible to riders coming down.",
      },
      {
        label: "Grooming and snowmaking hours",
        text: "Winch cats run cables across trails and snow guns run overnight, which is a large part of why uphill hours are restricted at all.",
      },
    ],
    paragraphs: [
      "The Responsibility Code isn't a law in most places, but it's the reference point resorts, ski patrol, and instructors generally use when describing what's expected, and some states and resorts do tie their own rules to it. It's worth reading in full once — it's about seven short lines.",
      "Uphill access policies vary far more than downhill etiquette does. Some resorts welcome uphill travel on marked routes during set hours, some require a specific pass or an orientation, and some prohibit it entirely, including outside operating hours. The policy is normally published on the resort's website and posted at the base area.",
      "Uphill travel outside a resort's operating hours generally means no patrol coverage, no lift evacuation, and machinery on the hill, which is why the policies are as specific as they are. Anyone considering it is best served reading the mountain's own policy first and asking guest services or patrol about anything unclear.",
      "Terrain outside a resort's boundary is a different matter again — that's backcountry, with avalanche risk, no patrol, and its own training and equipment expectations that go well beyond etiquette.",
    ],
    links: [
      {
        label: "NSAA — Your Responsibility Code",
        href: "https://www.nsaa.org/NSAA/Safety/Your_Responsibility_Code.aspx",
      },
      {
        label: "Park riding & safety — terrain park etiquette",
        href: "/learn/park-riding-safety",
        internal: true,
      },
    ],
    disclaimer:
      "This is a summary for orientation, not the code itself and not legal guidance — read the published code directly, and check the uphill and access policies of the specific resort you're visiting, since those differ from mountain to mountain.",
  },
];
