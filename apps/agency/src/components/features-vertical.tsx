"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { motion, useInView } from "motion/react";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  FeaturesAccordionItem as AccordionItem,
  FeaturesAccordionTrigger as AccordionTrigger,
} from "@/components/features-accordion";

export type FeaturesDataProps = {
  id: number;
  title: string;
  content: string;
  image?: string;
  video?: string;
  icon?: React.ReactNode;
};

export type FeaturesProps = {
  collapseDelay?: number;
  ltr?: boolean;
  linePosition?: "left" | "right" | "top" | "bottom";
  data: FeaturesDataProps[];
};

export default function Features({
  collapseDelay = 5000,
  ltr = false,
  linePosition = "left",
  data = [],
}: FeaturesProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const carouselRef = useRef<HTMLUListElement>(null);
  const currentIndexRef = useRef(currentIndex);
  const ref = useRef(null);
  const isInView = useInView(ref, {
    once: true,
    amount: 0.5,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isInView && data.length > 0) {
        currentIndexRef.current = 0;
        setCurrentIndex(0);
      } else {
        currentIndexRef.current = -1;
        setCurrentIndex(-1);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [data.length, isInView]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    if (carouselRef.current) {
      if (index < 0 || index >= data.length) {
        return;
      }
      const card = carouselRef.current.querySelectorAll<HTMLElement>(".card")[index];
      if (card) {
        const carouselWidth = carouselRef.current.clientWidth;
        const cardWidth = card.clientWidth;
        if (cardWidth <= 0 || carouselWidth <= 0) {
          return;
        }
        const targetLeft =
          card.offsetLeft -
          (carouselWidth - cardWidth) / 2;

        carouselRef.current.scrollTo({
          left: Math.max(0, targetLeft),
          behavior,
        });
      }
    }
  }, [data.length]);

  useEffect(() => {
    if (!isInView || data.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      const previousIndex = currentIndexRef.current;
      const normalizedPreviousIndex = previousIndex >= 0 ? previousIndex : 0;
      const nextIndex = (normalizedPreviousIndex + 1) % data.length;
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      scrollToIndex(nextIndex);
    }, collapseDelay);

    return () => window.clearInterval(timer);
  }, [collapseDelay, data.length, isInView, scrollToIndex]);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || data.length === 0) {
      return;
    }

    let frame = 0;
    const getActiveIndexFromScroll = () => {
      const cards = Array.from(
        carousel.querySelectorAll<HTMLElement>(".card")
      );
      if (cards.length === 0) {
        return null;
      }

      const viewportCenter = carousel.scrollLeft + carousel.clientWidth / 2;
      let closestIndex: number | null = null;
      let smallestDistance = Number.POSITIVE_INFINITY;

      cards.forEach((card, index) => {
        const cardWidth = card.offsetWidth;
        if (cardWidth <= 0) {
          return;
        }
        const cardCenter = card.offsetLeft + cardWidth / 2;
        const distance = Math.abs(cardCenter - viewportCenter);
        if (distance < smallestDistance) {
          smallestDistance = distance;
          closestIndex = index;
        }
      });

      if (closestIndex === null) {
        return null;
      }

      return Math.max(0, Math.min(closestIndex, data.length - 1));
    };

    const handleScroll = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const nextIndex = getActiveIndexFromScroll();
        if (nextIndex === null) {
          return;
        }

        currentIndexRef.current = nextIndex;
        setCurrentIndex((previousIndex) =>
          previousIndex === nextIndex ? previousIndex : nextIndex
        );
      });
    };

    carousel.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      carousel.removeEventListener("scroll", handleScroll);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [data.length]);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || data.length === 0) {
      return;
    }

    const recenterCurrentCard = () => {
      const index = currentIndexRef.current;
      if (index < 0 || index >= data.length) {
        return;
      }
      scrollToIndex(index, "auto");
    };

    const observer = new ResizeObserver(recenterCurrentCard);
    observer.observe(carousel);
    window.addEventListener("resize", recenterCurrentCard);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recenterCurrentCard);
    };
  }, [data.length, scrollToIndex]);

  return (
    <section ref={ref} aria-label="How it works steps">
      <div className="container">
        <div className="max-w-6xl mx-auto">
          <div className="mx-auto my-12 h-full grid lg:grid-cols-2 gap-10 items-center">
            <div
              className={` hidden lg:flex order-1 lg:order-[0] ${
                ltr ? "lg:order-2 lg:justify-end" : "justify-start"
              }`}
            >
              <Accordion.Root
                className=""
                type="single"
                defaultValue={`item-${currentIndex}`}
                value={`item-${currentIndex}`}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  const nextIndex = Number(value.split("-")[1]);
                  if (Number.isNaN(nextIndex) || nextIndex < 0 || nextIndex >= data.length) {
                    return;
                  }
                  currentIndexRef.current = nextIndex;
                  setCurrentIndex(nextIndex);
                  scrollToIndex(nextIndex);
                }}
              >
                {data.map((item, index) => (
                  <AccordionItem
                    key={item.id}
                    className="relative mb-8 last:mb-0"
                    value={`item-${index}`}
                  >
                    {linePosition === "left" || linePosition === "right" ? (
                      <div
                        className={`absolute bottom-0 top-0 h-full w-0.5 overflow-hidden rounded-lg bg-border/60 ${
                          linePosition === "right"
                            ? "left-auto right-0"
                            : "left-0 right-auto"
                        }`}
                      >
                        <div
                          className={`absolute left-0 top-0 w-full ${
                            currentIndex === index ? "h-full" : "h-0"
                          } origin-top bg-primary transition-all ease-linear`}
                          style={{
                            transitionDuration:
                              currentIndex === index
                                ? `${collapseDelay}ms`
                                : "0s",
                          }}
                        ></div>
                      </div>
                    ) : null}

                    {linePosition === "top" || linePosition === "bottom" ? (
                      <div
                        className={`absolute left-0 right-0 w-full h-0.5 overflow-hidden rounded-lg bg-border/60 ${
                          linePosition === "bottom" ? "bottom-0" : "top-0"
                        }`}
                      >
                        <div
                          className={`absolute left-0 ${
                            linePosition === "bottom" ? "bottom-0" : "top-0"
                          } h-full ${
                            currentIndex === index ? "w-full" : "w-0"
                          } origin-left bg-primary transition-all ease-linear`}
                          style={{
                            transitionDuration:
                              currentIndex === index
                                ? `${collapseDelay}ms`
                                : "0s",
                          }}
                        ></div>
                      </div>
                    ) : null}

                    <div className="flex items-center relative">
                      <div className="item-box w-12 h-12 bg-primary/10 rounded-full sm:mx-6 mx-2 shrink-0 flex items-center justify-center">
                        {item.icon}
                      </div>

                      <div>
                        <AccordionTrigger className="text-xl font-bold pl-0">
                          {item.title}
                        </AccordionTrigger>

                        <AccordionTrigger className="justify-start text-left leading-4 text-[16px] pl-0">
                          {item.content}
                        </AccordionTrigger>
                      </div>
                    </div>
                  </AccordionItem>
                ))}
              </Accordion.Root>
            </div>
            <div
              className={`h-[220px] sm:h-[350px] min-h-[180px] sm:min-h-[200px] w-auto  ${
                ltr && "lg:order-1"
              }`}
            >
              {data[currentIndex]?.image ? (
                <motion.img
                  key={currentIndex}
                  src={data[currentIndex].image}
                  alt={data[currentIndex].title}
                  loading="lazy"
                  width={1200}
                  height={700}
                  className="aspect-auto h-full w-full rounded-xl border border-border/60 object-cover object-left-top p-1 shadow-lg"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                />
              ) : data[currentIndex]?.video ? (
                <video
                  preload="auto"
                  src={data[currentIndex].video}
                  className="aspect-auto h-full w-full rounded-lg object-cover shadow-lg"
                  autoPlay
                  loop
                  muted
                />
              ) : (
                <div className="aspect-auto h-full w-full rounded-xl border border-border/60 bg-muted p-1"></div>
              )}
            </div>

            <ul
              ref={carouselRef}
              className=" flex h-full snap-x flex-nowrap overflow-x-auto py-10 [-ms-overflow-style:none] [-webkit-mask-image:linear-gradient(90deg,transparent,black_20%,white_80%,transparent)] [mask-image:linear-gradient(90deg,transparent,black_20%,white_80%,transparent)] [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden snap-mandatory"
              style={{
                padding: "50px calc(50%)",
              }}
            >
              {data.map((item, index) => (
                <div
                  key={item.id}
                  className="card relative mr-8 grid h-full max-w-60 shrink-0 items-start justify-center py-4 last:mr-0"
                  onClick={() => {
                    currentIndexRef.current = index;
                    setCurrentIndex(index);
                    scrollToIndex(index);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      currentIndexRef.current = index;
                      setCurrentIndex(index);
                      scrollToIndex(index);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`View feature: ${item.title}`}
                  style={{
                    scrollSnapAlign: "center",
                  }}
                >
                  <div className="absolute bottom-0 left-0 right-auto top-0 h-0.5 w-full overflow-hidden rounded-lg bg-border/60">
                    <div
                      className={`absolute left-0 top-0 h-full ${
                        currentIndex === index ? "w-full" : "w-0"
                      } origin-top bg-primary transition-all ease-linear`}
                      style={{
                        transitionDuration:
                          currentIndex === index ? `${collapseDelay}ms` : "0s",
                      }}
                    ></div>
                  </div>
                  <h2 className="text-xl font-bold">{item.title}</h2>
                  <p className="mx-0 max-w-sm text-balance text-sm">
                    {item.content}
                  </p>
                </div>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
