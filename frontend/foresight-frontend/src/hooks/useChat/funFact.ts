/**
 * Loads a random fun-fact string from `fetchChatStats` and forwards
 * it to a setter, swallowing errors since fun facts are decorative.
 *
 * @module hooks/useChat/funFact
 */

import { fetchChatStats } from "../../lib/chat-api";

export async function loadFunFact(
  setFunFact: (fact: string | null) => void,
  isStillMounted: () => boolean = () => true,
): Promise<void> {
  try {
    const data = await fetchChatStats();
    if (!isStillMounted()) return;
    if (data.facts.length === 0) return;
    const fact = data.facts[Math.floor(Math.random() * data.facts.length)];
    if (fact) setFunFact(fact);
  } catch {
    // Decorative — fail silently.
  }
}
