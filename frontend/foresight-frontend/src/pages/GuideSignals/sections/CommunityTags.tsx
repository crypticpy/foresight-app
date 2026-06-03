/**
 * Accordion section 6/9 — Community Tags: shared, free-form labels that the team
 * can add to a signal, where to find them, and how to keep the vocabulary
 * tidy.
 *
 * @module pages/GuideSignals/sections/CommunityTags
 */

import * as Accordion from "@radix-ui/react-accordion";
import { Tags } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function CommunityTags() {
  return (
    <Accordion.Item value="tags" id="tags">
      <AccordionTrigger icon={<Tags className="h-5 w-5" />}>
        Community Tags
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Community tags are short, free-form labels that anyone on the team can
          add to a signal. They sit alongside the fixed strategic pillars and
          let you group and rediscover related signals in your own words &mdash;
          across pillars, workstreams, and time horizons.
        </p>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Where to find tags
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-5 text-sm">
          <li>
            <span className="font-medium">On a signal</span> &mdash; open any
            signal and look at the Tags panel on the Overview tab. Existing tags
            show up as small chips.
          </li>
          <li>
            <span className="font-medium">In quick search</span> &mdash; press
            &#8984;K (or Ctrl+K) to open the command palette, start typing a tag
            name, and choose &ldquo;Browse tag&rdquo; to jump straight to it.
          </li>
          <li>
            <span className="font-medium">On a tag page</span> &mdash; click any
            tag chip to open its page, which lists every signal that shares that
            tag.
          </li>
        </ul>

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Adding and removing tags
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-4 text-sm">
          <li>
            <span className="font-medium">Add a tag</span> &mdash; in the Tags
            panel, type a few letters. Pick a matching tag from the suggestions
            to reuse it, or choose &ldquo;Create&rdquo; if nothing fits.
          </li>
          <li>
            <span className="font-medium">Remove a tag</span> &mdash; remove a
            tag from a signal when it no longer applies. Tags are shared, so
            removing one takes it off the signal for everyone.
          </li>
        </ul>

        <ProTip defaultOpen>
          Reuse an existing tag before inventing a new one, and keep tags short
          and consistent &mdash; for example &ldquo;ai-procurement&rdquo; rather
          than &ldquo;Using AI in Procurement.&rdquo; A tidy, shared vocabulary
          makes tags far more useful for the whole team. Administrators can
          merge duplicates, rename, or remove tags to keep things clean.
        </ProTip>
      </AccordionContent>
    </Accordion.Item>
  );
}
