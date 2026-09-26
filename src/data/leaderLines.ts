// Round 19 (item 6): what a leader says in a full-screen scene, by moment and attitude. Our own
// words (never a quote from anywhere); the same for every leader, so adding one is data only.

export type SceneMoment = 'meet' | 'greet' | 'warOnYou' | 'warByYou' | 'peace' | 'demand' | 'peaceOffer' | 'nearWin';
export type SceneMood = 'friendly' | 'neutral' | 'hostile';

export const LEADER_LINES: Record<SceneMoment, Record<SceneMood, string>> = {
  meet: {
    friendly: 'Well met! Our peoples could do great things together.',
    neutral: 'So you are our new neighbors. We shall see what kind of neighbors you are.',
    hostile: 'Stay on your side of the hills, stranger, and we will get along.',
  },
  greet: {
    friendly: 'Always a pleasure, my friend. What can we do for each other?',
    neutral: 'You have my attention. Speak.',
    hostile: 'Make it quick. My patience with you is thin.',
  },
  warOnYou: {
    friendly: 'It gives me no joy, but our armies march on you today.',
    neutral: 'The time for talking is over. Defend yourselves!',
    hostile: 'At last! Your cities will fly our banners before long.',
  },
  warByYou: {
    friendly: 'I trusted you! You will regret this betrayal.',
    neutral: 'So be it. We will meet you on the field.',
    hostile: 'I knew it would come to this. Let us finish it.',
  },
  peace: {
    friendly: 'Enough blood has been spilled. Let us be friends again.',
    neutral: 'Very well: peace. Let us both lick our wounds.',
    hostile: 'Peace, for now. Do not mistake it for friendship.',
  },
  demand: {
    friendly: 'A small gift between friends would be… appreciated.',
    neutral: 'A tribute would keep our borders quiet. Think it over.',
    hostile: 'Pay, or we will come and take it ourselves.',
  },
  peaceOffer: {
    friendly: 'This war serves neither of us. Shall we end it?',
    neutral: 'We have both lost enough. I offer peace.',
    hostile: 'I tire of this war. Take my offer while it stands.',
  },
  nearWin: {
    friendly: 'Soon the whole world will know our name. You may cheer us on.',
    neutral: 'History is about to be written, and it will be ours.',
    hostile: 'Watch closely: this is how an empire wins.',
  },
};
