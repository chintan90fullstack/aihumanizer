// Curated map of "robotic" AI phrasings -> natural human equivalents.
//
// These are deliberately conservative: each replacement is meaning-preserving
// (or meaning-neutral filler removal). This is the safest and highest-value
// transform for stripping LLM "tells" without distorting the text.
//
// Each entry has a stable `id` so the self-optimizing feedback loop can learn
// which replacements users keep vs. revert, and weight them accordingly.
//
// `from` is matched case-insensitively on word boundaries. An empty `to`
// means "delete this filler phrase" (whitespace/punctuation is cleaned up
// afterwards). Longer phrases are applied before shorter ones automatically.

export const PHRASE_MAP = [
  // --- Filler openers / meta-commentary (usually safe to drop) ---
  { id: "imp_note", from: "it is important to note that", to: "" },
  { id: "imp_note2", from: "it's important to note that", to: "" },
  { id: "worth_noting", from: "it is worth noting that", to: "" },
  { id: "worth_noting2", from: "it's worth noting that", to: "" },
  { id: "imp_understand", from: "it is important to understand that", to: "" },
  { id: "imp_remember", from: "it is important to remember that", to: "" },
  { id: "needless", from: "needless to say", to: "" },
  { id: "in_essence", from: "in essence", to: "" },
  { id: "essentially", from: "essentially", to: "" },
  { id: "basically", from: "basically", to: "" },
  { id: "in_conclusion", from: "in conclusion", to: "" },
  { id: "to_sum_up", from: "to sum up", to: "" },
  { id: "all_in_all", from: "all in all", to: "" },
  { id: "at_the_end_day", from: "at the end of the day", to: "" },

  // --- Wordy connectors -> simple ones ---
  { id: "furthermore", from: "furthermore", to: "also" },
  { id: "moreover", from: "moreover", to: "also" },
  { id: "additionally", from: "additionally", to: "also" },
  { id: "subsequently", from: "subsequently", to: "then" },
  { id: "consequently", from: "consequently", to: "so" },
  { id: "nevertheless", from: "nevertheless", to: "still" },
  { id: "nonetheless", from: "nonetheless", to: "still" },
  { id: "therefore", from: "therefore", to: "so" },
  { id: "thus", from: "thus", to: "so" },
  { id: "hence", from: "hence", to: "so" },

  // --- Wordy phrases -> concise ---
  { id: "in_order_to", from: "in order to", to: "to" },
  { id: "due_to_fact", from: "due to the fact that", to: "because" },
  { id: "owing_to_fact", from: "owing to the fact that", to: "because" },
  { id: "in_the_event", from: "in the event that", to: "if" },
  { id: "in_spite_fact", from: "in spite of the fact that", to: "although" },
  { id: "despite_fact", from: "despite the fact that", to: "although" },
  { id: "with_regard_to", from: "with regard to", to: "about" },
  { id: "with_respect_to", from: "with respect to", to: "about" },
  { id: "in_terms_of", from: "in terms of", to: "for" },
  { id: "the_fact_that", from: "the fact that", to: "that" },
  { id: "at_this_point", from: "at this point in time", to: "now" },
  { id: "for_purpose_of", from: "for the purpose of", to: "to" },
  { id: "has_ability_to", from: "has the ability to", to: "can" },
  { id: "have_ability_to", from: "have the ability to", to: "can" },
  { id: "is_able_to", from: "is able to", to: "can" },
  { id: "are_able_to", from: "are able to", to: "can" },
  { id: "prior_to", from: "prior to", to: "before" },
  { id: "subsequent_to", from: "subsequent to", to: "after" },
  { id: "in_the_realm", from: "in the realm of", to: "in" },
  { id: "a_wide_range", from: "a wide range of", to: "many" },
  { id: "a_variety_of", from: "a variety of", to: "many" },
  { id: "a_myriad_of", from: "a myriad of", to: "many" },
  { id: "myriad", from: "myriad", to: "many" },
  { id: "a_plethora_of", from: "a plethora of", to: "plenty of" },
  { id: "plethora", from: "plethora", to: "plenty" },
  { id: "vast_majority", from: "the vast majority of", to: "most" },
  { id: "vast_majority2", from: "vast majority of", to: "most" },
  { id: "a_number_of", from: "a number of", to: "several" },

  // --- Inflated vocabulary -> plain words ---
  { id: "utilize", from: "utilize", to: "use" },
  { id: "utilizes", from: "utilizes", to: "uses" },
  { id: "utilized", from: "utilized", to: "used" },
  { id: "utilizing", from: "utilizing", to: "using" },
  { id: "utilization", from: "utilization", to: "use" },
  { id: "leverage", from: "leverage", to: "use" },
  { id: "leverages", from: "leverages", to: "uses" },
  { id: "leveraging", from: "leveraging", to: "using" },
  { id: "facilitate", from: "facilitate", to: "help" },
  { id: "facilitates", from: "facilitates", to: "helps" },
  { id: "endeavor", from: "endeavor", to: "try" },
  { id: "commence", from: "commence", to: "start" },
  { id: "commences", from: "commences", to: "starts" },
  { id: "terminate", from: "terminate", to: "end" },
  { id: "demonstrate", from: "demonstrate", to: "show" },
  { id: "demonstrates", from: "demonstrates", to: "shows" },
  { id: "numerous", from: "numerous", to: "many" },
  { id: "approximately", from: "approximately", to: "about" },
  { id: "additional", from: "additional", to: "extra" },
  { id: "obtain", from: "obtain", to: "get" },
  { id: "acquire", from: "acquire", to: "get" },
  { id: "garner", from: "garner", to: "get" },
  { id: "ascertain", from: "ascertain", to: "find out" },
  { id: "endeavour", from: "endeavour", to: "try" },

  // --- Classic LLM clichés ---
  { id: "delve_into", from: "delve into", to: "explore" },
  { id: "delving_into", from: "delving into", to: "exploring" },
  { id: "navigate_complex", from: "navigate the complexities of", to: "handle" },
  { id: "fast_paced_world", from: "in today's fast-paced world", to: "today" },
  { id: "ever_evolving", from: "ever-evolving", to: "changing" },
  { id: "crucial_role", from: "plays a crucial role", to: "matters" },
  { id: "vital_role", from: "plays a vital role", to: "matters" },
  { id: "pivotal_role", from: "plays a pivotal role", to: "matters" },
  { id: "key_role", from: "plays a key role", to: "matters" },
  { id: "imperative_that_we", from: "it is imperative that we", to: "we must" },
  { id: "imperative_that", from: "it is imperative that", to: "" },
  { id: "paradigm_shift", from: "paradigm shift", to: "major change" },
  { id: "cutting_edge", from: "cutting-edge", to: "new" },
  { id: "state_of_art", from: "state-of-the-art", to: "advanced" },
  { id: "seamless", from: "seamless", to: "smooth" },
  { id: "seamlessly", from: "seamlessly", to: "smoothly" },
  { id: "robust", from: "robust", to: "strong" },
  { id: "holistic", from: "holistic", to: "complete" },
  { id: "synergy", from: "synergy", to: "teamwork" },
  { id: "testament_to", from: "a testament to", to: "a sign of" },
  { id: "underscores", from: "underscores", to: "highlights" },
  { id: "underscore", from: "underscore", to: "highlight" },
  { id: "fosters", from: "fosters", to: "builds" },
  { id: "foster", from: "foster", to: "build" },
  { id: "realm", from: "realm", to: "area" },
  { id: "landscape", from: "landscape", to: "scene" },
  { id: "unlock_potential", from: "unlock the potential", to: "make the most" },
  { id: "harness_power", from: "harness the power of", to: "use" },
];

// Sort longest phrase first so multi-word phrases match before their parts.
PHRASE_MAP.sort((a, b) => b.from.length - a.from.length);
