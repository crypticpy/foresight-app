/**
 * Compare Page
 *
 * Renders the TrendComparisonView for comparing two cards side-by-side.
 * Card IDs are read from URL query params: /compare?card_ids=id1,id2
 */

import { TrendComparisonView } from "../components/visualizations/TrendComparisonView";

// Card-name links inside TrendComparisonView already navigate to the
// signal detail page, so we don't need an additional onCardClick handler.
const Compare = () => <TrendComparisonView />;

export default Compare;
