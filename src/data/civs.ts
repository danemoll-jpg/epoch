// Civ and leader roster. Every leader lives in this one file so the list can be reviewed
// and swapped in one place before any public release (see CLAUDE.md IP guardrails).
// City names are real historical places; the first name is the capital.

export interface CivDef {
  id: string;
  /** Bare name, for labels and lists ("Franks"). */
  name: string;
  /**
   * Grammar for messages. `article: 'the'` for names that read as a people ("the Franks
   * declared war on you!"); `plural` picks "have"/"were" and the possessive "the Franks'".
   * Messages use civ names (with these) rather than leader names; offers name the leader.
   */
  article?: 'the';
  plural?: boolean;
  adjective: string;
  leader: string;
  /** Placeholder owner color until the art pass. */
  color: string;
  /**
   * AI personality, light (Milestone 5), each 1–5. Aggression pushes toward war, demands,
   * and fighting on; trade willingness toward tech deals and fair prices. Leader-specific
   * bonuses come in Milestone 8.
   */
  aggression: number;
  tradeWillingness: number;
  cityNames: string[];
}

export const CIVS: CivDef[] = [
  {
    id: 'babylon', name: 'Babylon', adjective: 'Babylonian', leader: 'Hammurabi', color: '#3f7fe0', aggression: 2, tradeWillingness: 4,
    cityNames: ['Babylon', 'Ur', 'Uruk', 'Nippur', 'Lagash', 'Eridu', 'Kish', 'Sippar', 'Larsa', 'Borsippa'],
  },
  {
    id: 'maurya', name: 'Maurya', adjective: 'Mauryan', leader: 'Ashoka', color: '#e0a030', aggression: 1, tradeWillingness: 4,
    cityNames: ['Pataliputra', 'Taxila', 'Ujjain', 'Tosali', 'Suvarnagiri', 'Vidisha', 'Mathura', 'Varanasi', 'Kaushambi', 'Sanchi'],
  },
  {
    id: 'mali', name: 'Mali', adjective: 'Malian', leader: 'Mansa Musa', color: '#d04a4a', aggression: 2, tradeWillingness: 5,
    cityNames: ['Niani', 'Timbuktu', 'Djenné', 'Gao', 'Walata', 'Kangaba', 'Koumbi Saleh', 'Tadmekka', 'Kaba', 'Mema'],
  },
  {
    id: 'inca', name: 'Inca', article: 'the', plural: true, adjective: 'Incan', leader: 'Pachacuti', color: '#40b070', aggression: 4, tradeWillingness: 2,
    cityNames: ['Cusco', 'Machu Picchu', 'Quito', 'Ollantaytambo', 'Vilcabamba', 'Tumebamba', 'Cajamarca', 'Huánuco Pampa', 'Pisac', 'Tambo Colorado'],
  },
  {
    id: 'franks', name: 'Franks', article: 'the', plural: true, adjective: 'Frankish', leader: 'Charlemagne', color: '#a060d0', aggression: 5, tradeWillingness: 2,
    cityNames: ['Aachen', 'Paris', 'Reims', 'Tours', 'Orléans', 'Metz', 'Soissons', 'Lyon', 'Rouen', 'Worms'],
  },
];
