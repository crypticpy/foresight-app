/**
 * For You — personalized discovery queue. Mounts the `PersonalizedQueue`
 * component (which owns its own loading/error/empty states and header)
 * inside the standard page container.
 *
 * @module pages/ForYou
 */

import { PersonalizedQueue } from "../components/PersonalizedQueue";

export default function ForYou() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PersonalizedQueue />
    </div>
  );
}
