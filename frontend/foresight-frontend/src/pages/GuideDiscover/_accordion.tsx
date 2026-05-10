/**
 * Radix Accordion trigger + content wrappers shared by every section of
 * the discover guide.
 *
 * @module pages/GuideDiscover/_accordion
 */

import React from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

export const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Accordion.Trigger> & {
    icon?: React.ReactNode;
  }
>(({ children, className, icon, ...props }, ref) => (
  <Accordion.Header className="flex">
    <Accordion.Trigger
      ref={ref}
      className={cn(
        "group flex flex-1 items-center gap-3 py-4 text-left text-lg font-semibold",
        "text-gray-900 dark:text-gray-100 transition-colors",
        "hover:text-brand-blue dark:hover:text-brand-light-blue",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue rounded",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="flex-shrink-0 text-brand-blue dark:text-brand-light-blue">
          {icon}
        </span>
      )}
      <span className="flex-1">{children}</span>
      <ChevronDown
        className="h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200 group-data-[state=open]:rotate-180"
        aria-hidden
      />
    </Accordion.Trigger>
  </Accordion.Header>
));
AccordionTrigger.displayName = "AccordionTrigger";

export const AccordionContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Accordion.Content>
>(({ children, className, ...props }, ref) => (
  <Accordion.Content
    ref={ref}
    className={cn(
      "overflow-hidden transition-all duration-200",
      "data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up",
      className,
    )}
    {...props}
  >
    <div className="pb-6 pt-1 pl-10 pr-2 text-gray-700 dark:text-gray-300 leading-relaxed text-[0.938rem]">
      {children}
    </div>
  </Accordion.Content>
));
AccordionContent.displayName = "AccordionContent";
