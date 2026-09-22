import { formatRelativeDate } from "@/lib/utils";
import Image from "next/image";

export default function Author({
  name,
  image,
  twitterUsername,
  updatedAt,
  imageOnly,
  role,
  profileUrl,
}: {
  name: string;
  image: string;
  twitterUsername: string;
  updatedAt?: string;
  imageOnly?: boolean;
  role?: string;
  profileUrl?: string;
}) {
  if (imageOnly) {
    return (
      <Image
        src={image}
        alt={name}
        width={36}
        height={36}
        className="rounded-full transition-all group-hover:brightness-90"
      />
    );
  }

  const richAuthorMarkup = (
    <div className="flex items-center space-x-3">
      <Image
        src={image}
        alt={name}
        width={36}
        height={36}
        className="rounded-full"
      />
      <div className="flex flex-col">
        <p className="text-sm font-medium text-foreground/90">{name}</p>
        <p className="text-sm text-muted-foreground">{role ?? `@${twitterUsername}`}</p>
        {updatedAt ? (
          <time
            dateTime={updatedAt}
            className="text-sm font-light text-muted-foreground/80"
          >
            Last reviewed {formatRelativeDate(updatedAt)}
          </time>
        ) : null}
      </div>
    </div>
  );

  if (updatedAt || role || profileUrl) {
    return (
      <a
        href={profileUrl ?? `https://twitter.com/${twitterUsername}`}
        className="group"
        target="_blank"
        rel="noopener noreferrer"
      >
        {richAuthorMarkup}
      </a>
    );
  }

  return (
    <a
      href={`https://twitter.com/${twitterUsername}`}
      className="group flex items-center space-x-3"
      target="_blank"
      rel="noopener noreferrer"
    >
      <Image
        src={image}
        alt={name}
        width={40}
        height={40}
        className="rounded-full transition-all group-hover:brightness-90"
      />
      <div className="flex flex-col">
        <p className="font-semibold text-foreground/90">{name}</p>
        <p className="text-sm text-muted-foreground">@{twitterUsername}</p>
      </div>
    </a>
  );
}
