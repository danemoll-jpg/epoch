// Civ and leader roster. Every leader lives in this one file so the list can be reviewed
// and swapped in one place before any public release (see CLAUDE.md IP guardrails).
// City names are real historical places; the first name is the capital.

export interface CivDef {
  id: string;
  name: string;
  adjective: string;
  leader: string;
  /** Placeholder owner color until the art pass. */
  color: string;
  cityNames: string[];
}

export const CIVS: CivDef[] = [
  {
    id: 'babylon', name: 'Babylon', adjective: 'Babylonian', leader: 'Hammurabi', color: '#3f7fe0',
    cityNames: ['Babylon', 'Ur', 'Uruk', 'Nippur', 'Lagash', 'Eridu', 'Kish', 'Sippar', 'Larsa', 'Borsippa'],
  },
  {
    id: 'maurya', name: 'Maurya', adjective: 'Mauryan', leader: 'Ashoka', color: '#e0a030',
    cityNames: ['Pataliputra', 'Taxila', 'Ujjain', 'Tosali', 'Suvarnagiri', 'Vidisha', 'Mathura', 'Varanasi', 'Kaushambi', 'Sanchi'],
  },
  {
    id: 'mali', name: 'Mali', adjective: 'Malian', leader: 'Mansa Musa', color: '#d04a4a',
    cityNames: ['Niani', 'Timbuktu', 'Djenné', 'Gao', 'Walata', 'Kangaba', 'Koumbi Saleh', 'Tadmekka', 'Kaba', 'Mema'],
  },
  {
    id: 'inca', name: 'Inca', adjective: 'Incan', leader: 'Pachacuti', color: '#40b070',
    cityNames: ['Cusco', 'Machu Picchu', 'Quito', 'Ollantaytambo', 'Vilcabamba', 'Tumebamba', 'Cajamarca', 'Huánuco Pampa', 'Pisac', 'Tambo Colorado'],
  },
  {
    id: 'franks', name: 'Franks', adjective: 'Frankish', leader: 'Charlemagne', color: '#a060d0',
    cityNames: ['Aachen', 'Paris', 'Reims', 'Tours', 'Orléans', 'Metz', 'Soissons', 'Lyon', 'Rouen', 'Worms'],
  },
];
