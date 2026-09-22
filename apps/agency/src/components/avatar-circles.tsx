import { cn } from "@/lib/utils";
import Image from "next/image";
import { HTMLAttributes } from "react";

export interface AvatarCirclesProps extends HTMLAttributes<HTMLDivElement> {
  numPeople?: number;
  avatarUrls: string[];
}

export default function AvatarCircles({
  numPeople,
  avatarUrls,
  className,
}: AvatarCirclesProps) {
  return (
    <div className={cn("z-10 flex -space-x-4 rtl:space-x-reverse", className)}>
      {avatarUrls.map((url, index) => (
        <Image
          key={index}
          className="h-10 w-10 rounded-full border-2 border-background dark:border-border"
          src={url}
          width={40}
          height={40}
          alt={`Avatar ${index + 1}`}
        />
      ))}
      <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-foreground text-center text-xs font-medium text-background dark:border-border dark:bg-background dark:text-foreground">
        +{numPeople}
      </div>
    </div>
  );
}
