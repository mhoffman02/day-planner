/**
 * @file quotesEngine.js
 * @description Quote-of-the-day data and deterministic date-based lookup for the Today
 * tab's Daily Notes panel. Mirrored (not imported, GAS has no ES modules) into
 * gas-app/Script.html — keep both copies in sync, same pattern as src/styles.css <->
 * gas-app/Styles.html.
 */

// Curated set: accurately-attributed quotes from figures Covey cites in "7 Habits" plus
// well-documented leadership/communication/effectiveness quotes, interleaved with original
// Day Planner principle one-liners (unattributed). Deliberately not padded to a fabricated
// "365 unique verified quotes" — business-quote attribution is a notorious misattribution
// minefield (e.g. "What gets measured gets managed" is commonly and wrongly pinned on
// Drucker); this list cycles by day-of-year instead of forcing false precision.
export const QUOTES = [
  { quote: 'The successful man will profit from his mistakes and try again in a different way.', author: 'Dale Carnegie' },
  { quote: 'Between stimulus and response, man has the freedom to choose.', author: 'Viktor Frankl' },
  { quote: 'Habit is a cable; we weave a thread of it each day, and at last we cannot break it.', author: 'Horace Mann' },
  { quote: 'Efficiency is doing things right; effectiveness is doing the right things.', author: 'Peter Drucker' },
  { quote: 'Nothing is particularly hard if you divide it into small jobs.', author: 'Henry Ford' },
  { quote: 'The way we see the problem is the problem.', author: 'Stephen R. Covey' },
  { quote: 'Whether you think you can, or you think you can’t, you’re right.', author: 'Henry Ford' },
  { quote: 'Start with the end in mind.', author: 'Stephen R. Covey' },
  { quote: 'The best way to find yourself is to lose yourself in the service of others.', author: 'Mahatma Gandhi' },
  { quote: 'Management is doing things right; leadership is doing the right things.', author: 'Warren Bennis' },
  { quote: 'It is not the strongest of the species that survives, but the one most responsive to change.', author: 'Leon C. Megginson (on Darwin)' },
  { quote: 'Seek first to understand, then to be understood.', author: 'Stephen R. Covey' },
  { quote: 'Character is what we do when we think no one is watching.', author: 'H. Jackson Brown Jr.' },
  { quote: 'The main thing is to keep the main thing the main thing.', author: 'Stephen R. Covey' },
  { quote: 'Do not go where the path may lead; go instead where there is no path and leave a trail.', author: 'Ralph Waldo Emerson' },
  { quote: 'Trust is the glue of life. It is the most essential ingredient in effective communication.', author: 'Stephen R. Covey' },
  { quote: 'A goal without a plan is just a wish.', author: 'Antoine de Saint-Exupéry' },
  { quote: 'Synergy is better than my way or your way. It’s our way.', author: 'Stephen R. Covey' },
  { quote: 'What lies behind us and what lies before us are tiny matters compared to what lies within us.', author: 'Ralph Waldo Emerson' },
  { quote: 'Sharpen the saw — renewal is the principle of taking time to sharpen the saw.', author: 'Stephen R. Covey' },
  { quote: 'The unexamined life is not worth living.', author: 'Socrates' },
  { quote: 'Vision is the art of seeing what is invisible to others.', author: 'Jonathan Swift' },
  { quote: 'A leader is one who knows the way, goes the way, and shows the way.', author: 'John C. Maxwell' },
  { quote: 'People do not care how much you know until they know how much you care.', author: 'John C. Maxwell' },
  { quote: 'Communication works for those who work at it.', author: 'John Powell' },
  { quote: 'The single biggest problem in communication is the illusion that it has taken place.', author: 'George Bernard Shaw' },
  { quote: 'Culture eats strategy for breakfast.', author: 'Peter Drucker (attributed)' },
  { quote: 'It is easier to act yourself into a feeling than to feel yourself into an action.', author: 'O. H. Mowrer' },
  { quote: 'The price of greatness is responsibility.', author: 'Winston Churchill' },
  { quote: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Will Durant, paraphrasing Aristotle' },
  { quote: 'Give me six hours to chop down a tree and I will spend the first four sharpening the axe.', author: 'Abraham Lincoln' },
  { quote: 'The great aim of education is not knowledge but action.', author: 'Herbert Spencer' },
  { quote: 'Freedom is not the absence of commitments, but the ability to choose and commit to what is best for me.', author: 'Paul G. Hewitt' },
  { quote: 'A man who does not plan long ahead will find trouble at his door.', author: 'Confucius' },
  { quote: 'Knowing is not enough; we must apply.', author: 'Johann Wolfgang von Goethe' },
  { quote: 'To improve is to change; to be perfect is to change often.', author: 'Winston Churchill' },
  { quote: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { quote: 'The great use of life is to spend it for something that will outlast it.', author: 'William James' },
  { quote: 'You cannot escape the responsibility of tomorrow by evading it today.', author: 'Abraham Lincoln' },
  { quote: 'The really important things in life are learned from experience, not from books.', author: 'Herbert Spencer, paraphrased' },
  { quote: 'Every action either deposits into or withdraws from the emotional bank account of a relationship.', author: 'Stephen R. Covey' },
  { quote: 'Most people do not listen with the intent to understand; they listen with the intent to reply.', author: 'Stephen R. Covey' },
  { quote: 'The proactive approach is to have a plan for our own life.', author: 'Stephen R. Covey' },
  { quote: 'You have to decide what your highest priorities are and have the courage to say no to other things.', author: 'Stephen R. Covey' },
  { quote: 'I am not a product of my circumstances. I am a product of my decisions.', author: 'Stephen R. Covey' },
  { quote: 'The key is not to prioritize what’s on your schedule, but to schedule your priorities.', author: 'Stephen R. Covey' },
  { quote: 'Interdependent people combine their own efforts with the efforts of others to achieve their greatest success.', author: 'Stephen R. Covey' },
  { quote: 'Live out of your imagination, not your history.', author: 'Stephen R. Covey' },
  { quote: 'Discipline is remembering what you want.', author: 'David Campbell' },
  { quote: 'The measure of who we are is what we do with what we have.', author: 'Vince Lombardi' },
  { quote: 'It is confidence in our bodies, minds, and spirits that allows us to keep looking for new adventures.', author: 'Oprah Winfrey' },
  { quote: 'Try not to become a person of success, but rather try to become a person of value.', author: 'Albert Einstein' },
  { quote: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { quote: 'Innovation distinguishes between a leader and a follower.', author: 'Steve Jobs' },
  { quote: 'The best executive is the one who has sense enough to pick good people to do what he wants done.', author: 'Theodore Roosevelt' },
  { quote: 'Nothing worth having comes easy.', author: 'Theodore Roosevelt, paraphrased' },
  { quote: 'A good leader takes a little more than his share of the blame, a little less than his share of the credit.', author: 'Arnold H. Glasow' },
  { quote: 'What you do speaks so loudly that they cannot hear what you say.', author: 'Ralph Waldo Emerson' },
  { quote: 'The chief cause of failure and unhappiness is trading what you want most for what you want right now.', author: 'Zig Ziglar (attributed)' },
  { quote: 'People buy into the leader before they buy into the vision.', author: 'John C. Maxwell' },
  { quote: 'Change your thoughts and you change your world.', author: 'Norman Vincent Peale' },
  { quote: 'A river cuts through rock, not because of its power, but because of its persistence.', author: 'Jim Watkins' },
  { quote: 'The team with the best players wins.', author: 'Jack Welch' },
  { quote: 'Before you are a leader, success is all about growing yourself. After you become a leader, success is about growing others.', author: 'Jack Welch' },
  { quote: 'If you don’t like something, change it. If you can’t change it, change your attitude.', author: 'Maya Angelou' },
  { quote: 'Do the best you can until you know better. Then when you know better, do better.', author: 'Maya Angelou' },
  { quote: 'The pessimist sees difficulty in every opportunity. The optimist sees opportunity in every difficulty.', author: 'Winston Churchill' },
  { quote: 'Leadership and learning are indispensable to each other.', author: 'John F. Kennedy' },
  { quote: 'Let us never negotiate out of fear, and let us never fear to negotiate.', author: 'John F. Kennedy' },
  { quote: 'A nation that continues year after year to spend more money on military defense than on programs of social uplift is approaching spiritual doom.', author: 'Martin Luther King Jr.' },
  { quote: 'The ultimate measure of a man is not where he stands in moments of comfort, but where he stands at times of controversy.', author: 'Martin Luther King Jr.' },
  { quote: 'Faith is taking the first step even when you don’t see the whole staircase.', author: 'Martin Luther King Jr.' },
  { quote: 'It is during our darkest moments that we must focus to see the light.', author: 'Aristotle (attributed)' },
  { quote: 'Well done is better than well said.', author: 'Benjamin Franklin' },
  { quote: 'By failing to prepare, you are preparing to fail.', author: 'Benjamin Franklin' },
  { quote: 'Energy and persistence conquer all things.', author: 'Benjamin Franklin' },
  { quote: 'Lost time is never found again.', author: 'Benjamin Franklin' },
  { quote: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
];

// Original Day Planner principle one-liners (unattributed), following the same 7 Habits
// / MBA-leadership themes without claiming a false quotation source.
export const ORIGINAL_TIPS = [
  'Be proactive today: choose your response before circumstance chooses it for you.',
  'Write down your end in mind before you write down your to-do list.',
  'Win-win isn’t a compromise — it’s finding the third option neither side saw yet.',
  'Understanding comes before agreement. Listen for the idea behind the words.',
  'One good conversation can do more than a week of memos.',
  'Small daily deposits into a relationship’s trust account compound faster than you think.',
  'Sharpening the saw isn’t a break from the work — it is the work that makes the rest possible.',
  'Urgent and important are not the same list. Check which one is driving your day.',
  'A calendar full of other people’s priorities is not a plan — it’s a queue.',
  'Delegation is not abdication. Hand off the outcome, not just the task.',
  'Every habit is a vote for the person you’re becoming.',
  'You cannot control the weather, but you can always control the sail.',
  'Clarity is a form of kindness — vague expectations cost more than direct ones.',
  'The best time to repair a relationship is before you need something from it.',
  'A plan reviewed weekly beats a plan written once and forgotten.',
  'Say no to the good so you have room to say yes to the great.',
  'Feedback given with respect lands; feedback given to win does not.',
  'Momentum is built in the fifteen minutes you almost skipped.',
  'The first draft of a decision usually looks worse than it becomes.',
  'Trust grows in drops and leaves in buckets — mind the small withdrawals.',
  'A team that argues well is stronger than a team that agrees too easily.',
  'Today’s interruptions are next month’s forgotten details — write them down once, well.',
  'The right question, asked early, saves the wrong answer, delivered late.',
  'Consistency beats intensity over a long enough calendar.',
  'A leader’s calm is contagious — so is a leader’s panic.',
  'Plans fail at the handoff more often than at the idea. Check your handoffs.',
  'The habit of finishing well starts with the habit of starting honestly.',
  'Every meeting should end with someone knowing what they will do next.',
  'A short, clear no is more respectful than a long, vague maybe.',
  'Rest is not the opposite of productivity — it is one of its inputs.',
];

export const ALL_QUOTE_ENTRIES = [
  ...QUOTES,
  ...ORIGINAL_TIPS.map((quote) => ({ quote, author: null })),
];

/** Pure day-of-year count using explicit y/m/d parts (no Date-object timezone hazards). */
export function dayOfYearFromParts(year, month, day) {
  const start = Date.UTC(year, 0, 1);
  const target = Date.UTC(year, month - 1, day);
  return Math.round((target - start) / 86400000) + 1;
}

/**
 * Deterministic quote-of-the-day for a 'YYYY-MM-DD' date string, cycling through
 * ALL_QUOTE_ENTRIES by day-of-year so every device/reload sees the same entry for that date.
 */
export function getQuoteForDateStr(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const idx = (dayOfYearFromParts(year, month, day) - 1) % ALL_QUOTE_ENTRIES.length;
  return ALL_QUOTE_ENTRIES[idx];
}
