// discord/bot/commands/data/superpowers.js
//
// Englische Sätze für /superkraft (/superpower in englischen Discord-Apps) — Server mit Bot-Sprache Englisch.
// Eigene Witze, keine Übersetzung der deutschen Liste (superkraefte.js): Wortspiele tragen nicht über die Sprache.
// Zwei Blöcke wie dort: USELESS (der große Haufen) und ACTUALLY_GOOD (bewusst seltener). Ohne NSFW-Block.

const USELESS = [
    'You can turn invisible, but only when nobody is looking.',
    'You can fly, but only two centimetres above the ground.',
    'You always know exactly how many pickles are in a jar.',
    'You can walk through walls, but only cardboard ones.',
    'You can see the future, but only three seconds ahead.',
    'You can read minds, but only those of cats.',
    'You can stop time, but only for yourself — the world doesn\'t notice.',
    'You can pick any lock except your own bike lock.',
    'You can breathe fire, but only lukewarm air comes out.',
    'You can teleport, but you always land in the room next door.',
    'You have super strength, but only for opening jam jars.',
    'You can talk to animals, but they ignore you on principle.',
    'You can see the past, but only what you had for lunch last week.',
    'You can turn water into wine, but only the cheapest one in the store.',
    'You can control the weather, but only inside your fridge.',
    'You can run at the speed of light, but only on treadmills.',
    'You can summon any item, but it always arrives one day late by mail.',
    'You can become any animal, as long as it\'s a pigeon.',
    'You never lose a sock again — you just gain other people\'s.',
    'You can shoot lasers from your eyes, but only while sneezing.',
    'You can make anyone laugh, but only at you.',
    'You can find anything you lose, right after you buy a replacement.',
    'You can speak every language, but only with a terrible accent.',
    'You can heal others, but only paper cuts.',
    'You can freeze anything you touch, starting with your phone screen.',
    'You can shrink to the size of an ant, but you can\'t grow back on your own.',
    'You can predict the lottery numbers of yesterday.',
    'You can stretch your arms ten metres, but only to reach the remote.',
    'You can see through walls, and you always regret it.',
    'You can make plants grow instantly — weeds only.',
    'You always win at rock paper scissors, but only against yourself.',
    'You can glow in the dark, but only when you\'re trying to sleep.',
    'You can control electricity, which mostly means your phone is always at 4 %.',
    'You can duplicate yourself, but the copy only wants to nap.',
    'You can breathe underwater, but only in puddles.',
    'You can hear every conversation in a ten-metre radius, mostly about the weather.',
    'You can make it rain anywhere, but only on yourself.',
    'You can talk to ghosts, and they only want to complain about the Wi-Fi.',
    'You can change your hair colour at will, but it always ends up beige.',
    'You can fall asleep instantly, but only during important meetings.',
    'You can lift a car, but only a toy car.',
    'You can see in the dark, and the first thing you see is a spider.',
    'You can make every traffic light turn green — for everyone else.',
    'You can understand babies, and they only talk about snacks.',
    'You are bulletproof, but only against foam darts.',
];

const ACTUALLY_GOOD = [
    'You can fly — really fly, as fast as a jet.',
    'You are completely invulnerable to every weapon.',
    'You can stop time for everyone but you, whenever you want.',
    'You can heal any wound instantly — your own and others\'.',
    'You can teleport anywhere in the world you have seen before.',
    'You never need sleep and never feel tired.',
    'You can learn any skill perfectly in a single day.',
    'You can read minds and turn it off whenever you like.',
    'You are lucky in everything you do, always.',
    'You can talk to every animal, and they all like you.',
];

module.exports = { safe: [...USELESS, ...ACTUALLY_GOOD], nsfw: [] };
