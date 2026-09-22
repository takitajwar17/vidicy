interface SectionProps {
  id?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export default function Section({
  id,
  title,
  subtitle,
  description,
  children,
  className,
}: SectionProps) {
  const sectionId = title ? title.toLowerCase().replace(/\s+/g, "-") : id;

  return (
    <section id={id || sectionId} className="scroll-mt-24 sm:scroll-mt-28">
      <div className={className}>
        <div className="relative container mx-auto px-4 sm:px-6 py-12 sm:py-16 max-w-7xl">
          <div className="text-center space-y-3 sm:space-y-4 pb-4 sm:pb-6 mx-auto">
            {title && (
              <div className="inline-flex items-center rounded-full border border-border bg-secondary/80 px-3 py-1.5 backdrop-blur-sm">
                <p className="text-[10px] text-foreground/75 font-semibold tracking-[0.2em] uppercase">
                  {title}
                </p>
              </div>
            )}
            {subtitle && (
              <h2 className="mx-auto mt-3 sm:mt-4 max-w-full text-2xl sm:text-4xl md:text-5xl font-semibold leading-tight tracking-tight px-2 [font-family:var(--font-display)]">
                {subtitle}
              </h2>
            )}
            {description && (
              <p className="mt-4 sm:mt-6 text-base sm:text-lg leading-7 sm:leading-8 text-muted-foreground max-w-2xl mx-auto px-2">
                {description}
              </p>
            )}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
