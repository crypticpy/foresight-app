/**
 * Accordion section 7/9 — Discussion: the per-signal comment thread where the
 * team talks through what a signal means, captures context, and records
 * decisions next to the intelligence itself.
 *
 * @module pages/GuideSignals/sections/Discussion
 */

import * as Accordion from "@radix-ui/react-accordion";
import { MessageCircle } from "lucide-react";
import { ProTip } from "@/components/ProTip";
import { GuideFigure } from "@/components/GuideFigure";
import { AccordionTrigger, AccordionContent } from "../_accordion";

export function Discussion() {
  return (
    <Accordion.Item value="discussion" id="discussion">
      <AccordionTrigger icon={<MessageCircle className="h-5 w-5" />}>
        Discussion and Comments
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-4">
          Every signal has a Discussion tab where your team can talk through
          what it means &mdash; capturing context, questions, and decisions
          right next to the intelligence instead of scattering them across
          emails and chats.
        </p>

        <GuideFigure
          src="/guide/signal-discussion-thread.png"
          alt="The Discussion tab open on a signal, showing the comment composer with a Comment button and an invitation to start the first discussion."
          caption="The Discussion tab on a signal — post a comment, reply one level deep, or add a quick reaction."
        />

        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
          How it works
        </h4>
        <ul className="list-disc list-inside space-y-1 mb-4 text-sm">
          <li>
            <span className="font-medium">Open it</span> &mdash; go to a signal
            and select the Discussion tab.
          </li>
          <li>
            <span className="font-medium">Comment and reply</span> &mdash; post
            a comment, or reply to someone else&rsquo;s. Replies stay one level
            deep so threads remain easy to follow.
          </li>
          <li>
            <span className="font-medium">React</span> &mdash; add a quick
            reaction (a thumbs-up and a few others) when you want to acknowledge
            a point without writing a full reply.
          </li>
          <li>
            <span className="font-medium">Edit or remove</span> &mdash; fix a
            comment for a short window after posting, or remove one you no
            longer want.
          </li>
          <li>
            <span className="font-medium">Resolve</span> &mdash; mark a thread
            resolved once the question has been answered or the decision made.
          </li>
        </ul>

        <ProTip defaultOpen>
          Use the discussion to flag why a signal matters (&ldquo;this maps
          directly to our affordability priority&rdquo;), ask the team a
          question, or record a decision. It turns a static signal into a shared
          workspace that newcomers can catch up on later.
        </ProTip>

        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Discussion is a team collaboration feature. If your organization has
          collaboration turned off, the Discussion tab will simply stay empty.
        </p>
      </AccordionContent>
    </Accordion.Item>
  );
}
