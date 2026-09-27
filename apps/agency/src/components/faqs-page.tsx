"use client";

import Link from "next/link";
import React from "react";
import { SearchIcon, SearchSlashIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSection {
  title: string;
  items: readonly FaqItem[];
}

interface FaqsSectionProps {
  sections: readonly FaqSection[];
}

interface NormalizedFaq extends FaqItem {
  id: string;
  category: string;
}

function toCategoryId({ value }: { value: string }) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function FaqsSection({ sections }: FaqsSectionProps) {
  const [searchTerm, setSearchTerm] = React.useState("");

  const categories = React.useMemo(
    () =>
      sections.map((section) => ({
        id: toCategoryId({ value: section.title }),
        label: section.title,
      })),
    [sections],
  );
  const [activeCategory, setActiveCategory] = React.useState("");

  React.useEffect(() => {
    if (!categories.some((category) => category.id === activeCategory)) {
      setActiveCategory(categories[0]?.id ?? "");
    }
  }, [activeCategory, categories]);

  const normalizedFaqs = React.useMemo<NormalizedFaq[]>(
    () =>
      sections.flatMap((section, sectionIndex) =>
        section.items.map((item, itemIndex) => ({
          id: `faq-${sectionIndex}-${itemIndex}`,
          category: toCategoryId({ value: section.title }),
          question: item.question,
          answer: item.answer,
        })),
      ),
    [sections],
  );

  const filteredFaqs = React.useMemo(
    () =>
      normalizedFaqs.filter((faq) => {
        const matchesCategory = activeCategory ? faq.category === activeCategory : true;
        const loweredSearchTerm = searchTerm.toLowerCase();
        const matchesSearch =
          faq.question.toLowerCase().includes(loweredSearchTerm) ||
          faq.answer.toLowerCase().includes(loweredSearchTerm);

        return matchesCategory && matchesSearch;
      }),
    [activeCategory, normalizedFaqs, searchTerm],
  );

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="space-y-6">
        <div className="relative max-w-md">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search the FAQ..."
            aria-label="Search FAQ"
            className="pl-9"
          />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-1 border-b border-border/80 pb-2">
        {categories.map((category) => {
          const isActive = activeCategory === category.id;

          return (
            <button
              key={category.id}
              type="button"
              className="flex flex-col"
              aria-current={isActive ? "true" : undefined}
              onClick={() => setActiveCategory(category.id)}
            >
              <span
                className={cn(
                  "rounded-md px-2 py-1 text-base text-muted-foreground transition-colors hover:text-primary md:px-2.5 md:py-1.5",
                  isActive && "bg-primary/10 font-semibold text-primary ring-1 ring-primary/20",
                )}
              >
                {category.label}
              </span>
              {isActive && <span className="h-0.5 w-full rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>

      <Accordion type="single" collapsible className="mt-8 space-y-4">
        {filteredFaqs.map((faq) => (
          <AccordionItem
            key={faq.id}
            value={faq.id}
            className="rounded-2xl border border-border/80 bg-background px-4 shadow-sm sm:px-6"
          >
            <AccordionTrigger className="text-left text-base font-semibold text-foreground hover:no-underline">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="pb-5 pr-0 text-sm leading-7 text-foreground/80 sm:pb-6 sm:pr-6">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {filteredFaqs.length === 0 && (
        <div className="mt-10 rounded-2xl border border-border/70 bg-muted/20 px-5 py-6 text-center shadow-sm sm:px-6">
          <p className="text-sm font-semibold text-foreground">No FAQs found for that search.</p>
          <Button variant="outline" className="mt-3" onClick={() => setSearchTerm("")}>
            <SearchSlashIcon data-icon="inline-start" />
            Clear search
          </Button>
        </div>
      )}

      <div className="mt-10 rounded-2xl border bg-muted/30 px-5 py-6 text-center shadow-sm sm:px-6">
        <p className="text-sm font-semibold text-foreground">Still have questions?</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Tell us how your agency reviews client files today and what volume you want to handle.
        </p>
        <Link
          href="/enterprise"
          className="mt-3 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Talk to us
        </Link>
      </div>
    </div>
  );
}
