import { redirect } from "next/navigation";

// This route has no direct nav entry (the "About" nav group only links to
// its /about/story, /about/mission, and /about/team children) and used to
// duplicate the "About Chatter" copy that /about/story already renders.
// Redirect rather than deleting the route so existing /about links still
// resolve to a real page instead of 404ing.
export default function AboutPage() {
  redirect("/about/story");
}
