import { useState, type ReactNode } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProTipProps {
  children: ReactNode;
  title?: string;
  defaultOpen?: boolean;
}

export function ProTip({
  children,
  title = "Pro Tip",
  defaultOpen = false,
}: ProTipProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="my-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 print:break-inside-avoid">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold text-amber-600 dark:text-amber-400 transition-colors hover:text-amber-700 dark:hover:text-amber-300"
      >
        <Lightbulb
          className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <span className="flex-1">{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 flex-shrink-0 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {isOpen && (
        <div className="mt-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}
