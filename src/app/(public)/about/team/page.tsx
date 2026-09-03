import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";

export const metadata: Metadata = {
  title: "Meet the Team | Chatter Snow",
};

type TeamMember = {
  name: string;
  photoKey: string;
  bio?: string[];
};

const TEAM: TeamMember[] = [
  { name: "Cass Lainez", photoKey: "about_team_photo_cass" },
  {
    name: "Rickie Cruz",
    photoKey: "about_team_photo_rickie",
    bio: [
      "Hi, I’m Rickie—a skier, software engineer, and one of Chatter’s token skiers, as Sofie likes to say. ⛷️",
      "Chatter and I have grown alongside each other. We both got serious about the sport and the LGBTQ+ ski and snowboard community around the same time. When Chatter held its first event, I had no gear of my own and knew very few queer people in the ski and snowboard community. By the end of that event, I had made connections and friendships that helped me become a better skier—and somehow walked away with a brand-new Burton jacket.",
      "I got involved with Chatter in late 2025, initially helping with social media and eventually supporting event planning. Today, I focus on building the technology and operational infrastructure behind Chatter—from our website and internal systems to an operations portal that helps us stay organized, manage our programs, and scale as the organization grows.",
      "For me, Chatter is about more than just getting on the mountain. It’s about the people you meet, the friendships you make, and finding a community that makes you want to keep showing up—on and off the mountain.",
      "And yes, I’m still one of the token skiers… for now. 🏳️‍🌈⛷️",
    ],
  },
  {
    name: "Sofie Chavez",
    photoKey: "about_team_photo_sofie",
    bio: [
      "I'm Sofie, but most friends call me Sof. I've been in the snowboarding world for 5 years and riding for 4. Learning to ride as an adult has been hard work that I enjoy every second of. I fell in love quickly when I linked my first turns at Big Snow, my home mountain/mall.",
      "Chatter was born from my frustration with the homophobia I kept seeing on many mountain pride posts, and the homophobic slurs I'd heard on hill. So in 2024 with the help of my friends and Park Affair, we brought the idea to life. The goal was simple: bring together the queer community and ease the barrier of entry.",
      "When I'm not putting on Chatter events you can usually find me volunteering on snow with Hoods to Wood, We're All Mental, and Black Boarders of CT. Or helping coach beginner park with Park Affair and East Coast Lady Boarders.",
      "When I'm off snow, you can find me playing saxophone, surfing, drawing, rock climbing, playing d&d or reading a comic. And that's the beauty of Chatter! I've made friends on snow that I can share my off snow hobbies with too.",
      "I hope if you're reading this and you're not sure what to do or where to start, just show up to an event. I promise you won't walk away without a new friend and maybe a new to you item!",
    ],
  },
];

export default async function TeamPage() {
  const supabase = await createSupabaseServerClient();
  const siteImages = await getSiteImageUrls(supabase);

  return (
    <div>
      <div className="w-fit">
        <div className="rainbow-accent w-full" />
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Meet the team
        </h1>
      </div>

      <SiteImage
        url={siteImages.about_team_hero_photo ?? null}
        alt="Chatter Snow community members"
        className="mt-6 aspect-[21/9] rounded-2xl"
      />

      <div className="mt-8 grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {TEAM.map((member) => (
          <Card key={member.name}>
            <CardHeader>
              <SiteImage
                url={
                  siteImages[member.photoKey] ??
                  siteImages.about_team_photo ??
                  null
                }
                alt={member.name}
                icon={UserRound}
              />
            </CardHeader>
            <CardContent>
              <CardTitle>{member.name}</CardTitle>
              <div className="app-muted mt-2 space-y-3 text-sm leading-relaxed sm:text-base">
                {member.bio ? (
                  member.bio.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))
                ) : (
                  <p>Bio coming soon.</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
