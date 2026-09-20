import Marquee from "@/components/magicui/marquee";
import Section from "@/components/section";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import Image from "next/image";

export const Highlight = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <span
      className={cn(
        "bg-primary/20 p-1 py-0.5 font-bold text-primary dark:bg-primary/20 dark:text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
};

export interface TestimonialCardProps {
  name: string;
  role: string;
  img?: string;
  description: React.ReactNode;
  className?: string;
  [key: string]: any;
}

export const TestimonialCard = ({
  description,
  name,
  img,
  role,
  className,
  ...props // Capture the rest of the props
}: TestimonialCardProps) => (
  <div
    className={cn(
      "mb-4 flex w-full cursor-pointer break-inside-avoid flex-col items-center justify-between gap-6 rounded-xl p-4",
      // light styles
      " border border-border bg-card",
      // dark styles
      "dark:[box-shadow:0_-20px_80px_-20px_hsl(var(--foreground)/0.12)_inset]",
      className,
    )}
    {...props} // Spread the rest of the props here
  >
    <div className="select-none text-sm font-normal text-foreground/80 dark:text-muted-foreground">
      {description}
      <div className="flex flex-row py-1" role="img" aria-label="5 out of 5 stars">
        <Star className="size-4 text-status-warning fill-status-warning" aria-hidden="true" />
        <Star className="size-4 text-status-warning fill-status-warning" aria-hidden="true" />
        <Star className="size-4 text-status-warning fill-status-warning" aria-hidden="true" />
        <Star className="size-4 text-status-warning fill-status-warning" aria-hidden="true" />
        <Star className="size-4 text-status-warning fill-status-warning" aria-hidden="true" />
      </div>
    </div>

    <div className="flex w-full select-none items-center justify-start gap-5">
      <Image
        width={40}
        height={40}
        loading="lazy"
        src={img || ""}
        alt={name}
        className="h-10 w-10 rounded-full ring-1 ring-border ring-offset-4"
      />

      <div>
        <p className="font-medium text-muted-foreground">{name}</p>
        <p className="text-xs font-normal text-muted-foreground/80">{role}</p>
      </div>
    </div>
  </div>
);

/**
 * Testimonial content for the public landing page.
 * The copy stays focused on the kinds of outcomes applicants want from Vidicy.
 */
const testimonials = [
  {
    name: "Priya Sharma",
    role: "Software Engineer — US B1/B2 Visa",
    img: "https://randomuser.me/api/portraits/women/44.jpg",
    description: (
      <p>
        I was not looking forward to my US visa interview. The app caught a three-day gap in my
        bank statements and showed me that my employment letter was missing my exact joining date.
        <Highlight>I fixed both before the interview, and the officer barely asked anything.</Highlight>
      </p>
    ),
  },
  {
    name: "Ahmed Hassan",
    role: "Graduate Student — UK Student Visa",
    img: "https://randomuser.me/api/portraits/men/32.jpg",
    description: (
      <p>
        I was applying for a UK visa from Dubai, and the checklist asked for documents I would
        never have found on my own.
        <Highlight>The Dubai consulate had its own financial requirements, and I would have missed them.</Highlight>
      </p>
    ),
  },
  {
    name: "Maria Santos",
    role: "Freelancer — Schengen Visa (France)",
    img: "https://randomuser.me/api/portraits/women/65.jpg",
    description: (
      <p>
        Showing income as a freelancer is messy. The review flagged my "ties to home country"
        section and suggested I add my current client contracts.
        <Highlight>That ended up being the missing piece. My French Schengen visa came through in three days.</Highlight>
      </p>
    ),
  },
  {
    name: "David Okonkwo",
    role: "Business Owner — US B1/B2 Visa",
    img: "https://randomuser.me/api/portraits/men/76.jpg",
    description: (
      <p>
        I got a 214(b) rejection last year, so I went into this round pretty rattled. I uploaded my
        old DS-160 and documents, and the checker pointed out that my trip length did not match the
        cash I had available.
        <Highlight>I adjusted the itinerary and got approved.</Highlight>
      </p>
    ),
  },
  {
    name: "Yuki Tanaka",
    role: "Marketing Manager — US H-1B Visa",
    img: "https://randomuser.me/api/portraits/women/90.jpg",
    description: (
      <p>
        My company was slow with the H-1B paperwork, so I uploaded everything they sent over. Vidicy
        flagged a mismatch in the prevailing wage section before we filed.
        <Highlight>HR had not caught it, and I am glad I checked before we filed.</Highlight>
      </p>
    ),
  },
  {
    name: "Carlos Mendoza",
    role: "PhD Researcher — UK Global Talent Visa",
    img: "https://randomuser.me/api/portraits/men/85.jpg",
    description: (
      <p>
        I spent hours trying to figure out whether my PhD stipend counted as "employment." The
        chatbot broke down the Home Office rule in plain English and showed me how to label it.
        <Highlight>That was more useful than another night digging through Reddit.</Highlight>
      </p>
    ),
  },
  {
    name: "Fatima Al-Rashid",
    role: "Medical Doctor — Australia Skilled Visa",
    img: "https://randomuser.me/api/portraits/women/28.jpg",
    description: (
      <p>
        Applying for an Australian visa as an Egyptian living in Saudi Arabia got confusing fast.
        Vidicy generated a checklist that took my residency status into account.
        <Highlight>It showed me which documents needed certified translations, which saved a lot of back and forth.</Highlight>
      </p>
    ),
  },
  {
    name: "James O'Brien",
    role: "University Student — Schengen Visa (Germany)",
    img: "https://randomuser.me/api/portraits/men/52.jpg",
    description: (
      <p>
        I almost booked a hotel I could not cancel because some blog told me to. The system warned
        me that the German embassy prefers fully refundable bookings.
        <Highlight>It even gave me a cover letter template, which took a lot of stress out of the application.</Highlight>
      </p>
    ),
  },
  {
    name: "Ananya Gupta",
    role: "Entrepreneur — Canada Start-Up Visa",
    img: "https://randomuser.me/api/portraits/women/17.jpg",
    description: (
      <p>
        I uploaded my business plan and got flagged for weak market research. I fixed that section,
        uploaded it again, and my risk score dropped from "High" to "Low."
        <Highlight>It felt less like generic software and more like somebody had actually read the file.</Highlight>
      </p>
    ),
  },
  {
    name: "Robert Kim",
    role: "Software Developer — US O-1 Visa",
    img: "https://randomuser.me/api/portraits/men/22.jpg",
    description: (
      <p>
        I signed up mostly because the refund policy showed the company had real accountability.
        Then I ended up rebuilding my O-1 portfolio after the AI pointed out gaps in how I was
        presenting the "extraordinary ability" evidence.
        <Highlight>Even my lawyer said the final packet was stronger.</Highlight>
      </p>
    ),
  },
  {
    name: "Elena Petrova",
    role: "Academic Researcher — UK Skilled Worker Visa",
    img: "https://randomuser.me/api/portraits/women/39.jpg",
    description: (
      <p>
        I paid a consultant $500 last year and still got rejected. Vidicy caught a spelling mistake on
        my translated birth certificate that did not match my passport.
        <Highlight>Both the consultant and I missed it. That kind of detail is easy to overlook when you have been staring at the same documents for weeks.</Highlight>
      </p>
    ),
  },
  {
    name: "Wei Zhang",
    role: "Business Analyst — Schengen Visa (Italy)",
    img: "https://randomuser.me/api/portraits/men/67.jpg",
    description: (
      <p>
        I was applying through the Italian consulate in Guangzhou, and the checker flagged the Hukou
        translation requirement.
        <Highlight>Friends who applied in Beijing were not asked for the same thing. That is the kind of local detail people miss.</Highlight>
      </p>
    ),
  },
];

export default function Testimonials() {
  return (
    <Section
      id="testimonials"
      subtitle="Stories from applicants who used Vidicy to catch document issues before submission"
      className="max-w-8xl"
    >
      <div
        className="relative mt-6 max-h-screen overflow-hidden"
        aria-roledescription="carousel"
        aria-label="Applicant testimonials"
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
        }}
      >
        <div className="gap-4 md:columns-2 xl:columns-3 2xl:columns-4 motion-reduce:[&_*]:![animation-play-state:paused]">
          {Array(Math.ceil(testimonials.length / 3))
            .fill(0)
            .map((_, i) => (
              <Marquee
                vertical
                key={i}
                pauseOnHover
                className={cn("py-14 sm:py-20", {
                  "[--duration:60s]": i === 1,
                  "[--duration:30s]": i === 2,
                  "[--duration:70s]": i === 3,
                })}
              >
                {testimonials.slice(i * 3, (i + 1) * 3).map((card) => (
                  <div key={card.name} className="animate-fade-rise motion-reduce:animate-none">
                    <TestimonialCard {...card} />
                  </div>
                ))}
              </Marquee>
            ))}
        </div>
      </div>
    </Section>
  );
}
